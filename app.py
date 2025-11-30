import os
import secrets
import logging
from flask import Flask, request, jsonify, render_template, make_response
from werkzeug.security import generate_password_hash, check_password_hash
from flask_cors import CORS
from flask_caching import Cache
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_talisman import Talisman
from functools import wraps
from datetime import datetime, timedelta
from bson import ObjectId

from config import Config
from db import users, saved_accounts, session_tokens, login_attempts
from token_utils import generate_token
from utils import double_encrypt, double_decrypt

# Logging
logger = logging.getLogger("password_manager")
handler = logging.StreamHandler()
formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)
logger.setLevel(logging.INFO)


# App init
app = Flask(__name__)
app.config.from_object(Config)

#set FRONTEND_ORIGIN in env
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")
CORS(app, origins=[FRONTEND_ORIGIN], supports_credentials=True)

# Security headers
Talisman(app, content_security_policy={
    "default-src": ["'self'"],
    "script-src": ["'self'", FRONTEND_ORIGIN],
    "style-src": ["'self'", FRONTEND_ORIGIN]
})

# caching
cache = Cache(app)

# rate limiter
limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"]
)

# validation
def _is_valid_objectid(id_str: str) -> bool:
    return ObjectId.is_valid(id_str)

def _ensure_indexes():
    try:
        users.create_index("email", unique=True)
    except Exception:
        logger.exception("Could not create users.email index (may already exist).")

    try:
        session_tokens.create_index("token", unique=True)
    except Exception:
        logger.exception("Could not create session_tokens.token index.")

    try:
        session_tokens.create_index("expires_at", expireAfterSeconds=0)
    except Exception:
        logger.exception("Could not create session_tokens.expires_at TTL index.")

    try:
        saved_accounts.create_index("user_id")
    except Exception:
        logger.exception("Could not create saved_accounts.user_id index.")

    try:
        login_attempts.create_index("email")
    except Exception:
        logger.exception("Could not create login_attempts.email index.")


def _cleanup_expired_sessions():
    now = datetime.utcnow()
    result = session_tokens.delete_many({"expires_at": {"$lte": now}})
    if result.deleted_count:
        logger.info(f"Cleaned up {result.deleted_count} expired sessions.")


# Login attempt helpers
def _get_login_attempt(email):
    return login_attempts.find_one({"email": email})


def _register_failed_login(email):
    now = datetime.utcnow()
    la = _get_login_attempt(email)
    window = timedelta(minutes=Config.LOGIN_WINDOW_MINUTES)

    if not la:
        login_attempts.insert_one({
            "email": email,
            "attempts": 1,
            "first_attempt_at": now,
            "last_attempt_at": now,
            "locked_until": None
        })
        return 1, None

    first_at = la.get("first_attempt_at", now)
    if not isinstance(first_at, datetime):
        first_at = now

    if (now - first_at) > window:
        login_attempts.update_one(
            {"email": email},
            {"$set": {
                "attempts": 1,
                "first_attempt_at": now,
                "last_attempt_at": now,
                "locked_until": None
            }}
        )
        return 1, None

    login_attempts.update_one(
        {"email": email},
        {"$inc": {"attempts": 1}, "$set": {"last_attempt_at": now}}
    )

    la = _get_login_attempt(email)
    attempts = la.get("attempts", 0)
    locked_until = None

    if attempts >= Config.MAX_LOGIN_ATTEMPTS:
        locked_until = now + timedelta(minutes=Config.LOCK_DURATION_MINUTES)
        login_attempts.update_one({"email": email}, {"$set": {"locked_until": locked_until}})

    return attempts, locked_until


def _reset_login_attempts(email):
    login_attempts.delete_one({"email": email})

    
# Token  & CSRF
def _extract_token_from_request():
    # Prefer HttpOnly cookie (most secure)
    token = request.cookies.get("session_token")
    if token:
        return token

    # fallback to Authorization header
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header.split(" ", 1)[1].strip()
    return None

def _is_production_cookie():
    return os.environ.get("FLASK_ENV") == "production"

    

# token_required decorator
def token_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        token = _extract_token_from_request()
        if not token:
            return jsonify({"message": "Authentication required"}), 401

        _cleanup_expired_sessions()

        session = session_tokens.find_one({"token": token})
        if not session:
            return jsonify({"message": "Invalid or expired token"}), 401

        expires_at = session.get("expires_at")
        if not isinstance(expires_at, datetime) or expires_at <= datetime.utcnow():
            session_tokens.delete_one({"token": token})
            return jsonify({"message": "Session expired"}), 401

        # CSRF protection: for state-changing methods require a matching CSRF token
        if request.method in ("POST", "PUT", "DELETE"):
            header_csrf = request.headers.get("X-CSRF-Token")
            # also allow reading from cookie in case client uses cookie instead
            cookie_csrf = request.cookies.get("X-CSRF-Token")
            provided = header_csrf or cookie_csrf
            expected = session.get("csrf")
            if not provided or not expected or provided != expected:
                logger.warning("CSRF token mismatch or missing.")
                return jsonify({"message": "CSRF validation failed"}), 403

        # Resolve user
        user_doc = None
        try:
            uid = session.get("user_id")
            # uid might be stored as ObjectId or as string
            if isinstance(uid, ObjectId) or (_is_valid_objectid(str(uid))):
                user_doc = users.find_one({"_id": ObjectId(str(uid))})
            else:
                user_doc = users.find_one({"_id": uid})
        except Exception:
            logger.exception("Error resolving user from session token.")
            return jsonify({"message": "Authentication error"}), 401

        if not user_doc:
            return jsonify({"message": "User not found"}), 401

        return f(user_doc, *args, **kwargs)
    return wrapper



# Auth endpoints
@app.route("/api/auth/register", methods=["POST"])
@limiter.limit("5 per minute")
def register():
    try:
        data = request.get_json() or {}
        username = (data.get("username") or "").strip()
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""

        if not username or not email or not password:
            return jsonify({"success": False, "message": "Missing fields"}), 400

        if "@" not in email or "." not in email:
            return jsonify({"success": False, "message": "Invalid email"}), 400

        if users.find_one({"email": email}):
            return jsonify({"success": False, "message": "Email already exists"}), 400

        hashed_pw = generate_password_hash(password)

        new_user = {
            "username": username,
            "email": email,
            "password": hashed_pw,
            "created_at": datetime.utcnow()
        }

        res = users.insert_one(new_user)
        uid = res.inserted_id

        # create session token and csrf token and store user_id as ObjectId
        token = generate_token()
        csrf = secrets.token_hex(16)
        expires = datetime.utcnow() + timedelta(hours=Config.SESSION_EXPIRES_HOURS)
        session_tokens.insert_one({
            "token": token,
            "user_id": uid,
            "created_at": datetime.utcnow(),
            "expires_at": expires,
            "csrf": csrf
        })

        _reset_login_attempts(email)

        # cookie flags: in production use Secure + SameSite=None to support cross-site POST->redirect flows
        secure_cookie = _is_production_cookie()
        cookie_samesite = "None" if secure_cookie else "Lax"
        cookie_secure = True if secure_cookie else False

        resp = make_response(jsonify({"success": True, "username": username}))
        # session token (HttpOnly)
        resp.set_cookie(
            "session_token",
            token,
            httponly=True,
            secure=cookie_secure,
            samesite=cookie_samesite,
            max_age=Config.SESSION_EXPIRES_HOURS * 3600
        )
        # csrf cookie (readable by JS) - important for client to put token in X-CSRF-Token header
        resp.set_cookie(
            "X-CSRF-Token",
            csrf,
            httponly=False,
            secure=cookie_secure,
            samesite=cookie_samesite,
            max_age=Config.SESSION_EXPIRES_HOURS * 3600
        )

        logger.info(f"New user registered: {email}")
        return resp, 201

    except Exception:
        logger.exception("Error during registration.")
        return jsonify({"success": False, "message": "Registration failed"}), 500


@app.route("/api/auth/login", methods=["POST"])
@limiter.limit("10 per minute")
def login():
    try:
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""

        if not email or not password:
            return jsonify({"success": False, "message": "Missing fields"}), 400

        la = _get_login_attempt(email)
        now = datetime.utcnow()
        if la and la.get("locked_until") and isinstance(la["locked_until"], datetime) and la["locked_until"] > now:
            return jsonify({"success": False, "message": "Account locked due to multiple failures"}), 403

        user_doc = users.find_one({"email": email})
        if not user_doc or not check_password_hash(user_doc.get("password", ""), password):
            attempts, locked_until = _register_failed_login(email)
            attempts_left = max(0, Config.MAX_LOGIN_ATTEMPTS - attempts)
            logger.info(f"Failed login for {email}; attempts={attempts}")
            if locked_until:
                return jsonify({"success": False, "message": "Account locked due to multiple failures"}), 403
            return jsonify({"success": False, "message": "Invalid credentials", "attempts_left": attempts_left}), 401

        # success -> reset attempts and create session
        _reset_login_attempts(email)
        token = generate_token()
        csrf = secrets.token_hex(16)
        expires = datetime.utcnow() + timedelta(hours=Config.SESSION_EXPIRES_HOURS)
        session_tokens.insert_one({
            "token": token,
            "user_id": user_doc["_id"],
            "created_at": datetime.utcnow(),
            "expires_at": expires,
            "csrf": csrf
        })

        secure_cookie = _is_production_cookie()
        cookie_samesite = "None" if secure_cookie else "Lax"
        cookie_secure = True if secure_cookie else False

        resp = make_response(jsonify({"success": True, "username": user_doc.get("username")}))
        resp.set_cookie(
            "session_token",
            token,
            httponly=True,
            secure=cookie_secure,
            samesite=cookie_samesite,
            max_age=Config.SESSION_EXPIRES_HOURS * 3600
        )
        resp.set_cookie(
            "X-CSRF-Token",
            csrf,
            httponly=False,
            secure=cookie_secure,
            samesite=cookie_samesite,
            max_age=Config.SESSION_EXPIRES_HOURS * 3600
        )

        logger.info(f"User logged in: {email}")
        return resp, 200

    except Exception:
        logger.exception("Error during login.")
        return jsonify({"success": False, "message": "Login failed"}), 500


@app.route("/api/auth/me", methods=["GET"])
@token_required
def auth_me(current_user):
    # simple endpoint to check current session and return username
    return jsonify({"success": True, "username": current_user.get("username")}), 200


@app.route("/api/auth/logout", methods=["POST"])
@token_required
def logout(current_user):
    try:
        token = _extract_token_from_request()
        if token:
            session_tokens.delete_one({"token": token})
        # clear cookies
        secure_cookie = _is_production_cookie()
        cookie_samesite = "None" if secure_cookie else "Lax"
        cookie_secure = True if secure_cookie else False

        resp = make_response(jsonify({"success": True, "message": "Logged out"}))
        resp.set_cookie("session_token", "", expires=0, httponly=True, secure=cookie_secure, samesite=cookie_samesite)
        resp.set_cookie("X-CSRF-Token", "", expires=0, httponly=False, secure=cookie_secure, samesite=cookie_samesite)
        logger.info(f"User logged out: {str(current_user.get('_id'))}")
        return resp, 200
    except Exception:
        logger.exception("Logout error")
        return jsonify({"success": False, "message": "Logout failed"}), 500


# Password endpoints
@app.route("/api/password/add", methods=["POST"])
@token_required
@limiter.limit("30 per minute")
def add_password(current_user):
    try:
        data = request.get_json() or {}
        name = (data.get("account_name") or "").strip()
        password = data.get("account_password") or ""
        if not name or not password:
            return jsonify({"success": False, "message": "Missing fields"}), 400

        encrypted = double_encrypt(password, Config.SECRET_KEY, Config.SECRET_KEY_2)
        saved_accounts.insert_one({
            "user_id": str(current_user["_id"]),
            "account_name": name,
            "account_password": encrypted,
            "created_at": datetime.utcnow()
        })
        cache.delete(f"pw_meta:{str(current_user['_id'])}")
        logger.info(f"Password saved for user {str(current_user['_id'])}: {name}")
        return jsonify({"success": True, "message": "Saved"}), 201
    except Exception:
        logger.exception("Error adding password")
        return jsonify({"success": False, "message": "Could not save password"}), 500


@app.route("/api/password/list", methods=["GET"])
@token_required
@limiter.limit("30 per minute")
def list_passwords(current_user):
    try:
        uid = str(current_user["_id"])
        cached = cache.get(f"pw_meta:{uid}")
        if cached:
            return jsonify({"success": True, "accounts": cached}), 200

        docs = saved_accounts.find({"user_id": uid})
        meta = []
        for d in docs:
            meta.append({"id": str(d["_id"]), "account_name": d.get("account_name")})
        cache.set(f"pw_meta:{uid}", meta)
        return jsonify({"success": True, "accounts": meta}), 200
    except Exception:
        logger.exception("Error listing passwords")
        return jsonify({"success": False, "message": "Could not list accounts"}), 500


@app.route("/api/password/show/<string:id>", methods=["GET"])
@token_required
@limiter.limit("10 per minute")
def show_password(current_user, id):
    try:
        if not _is_valid_objectid(id):
            return jsonify({"success": False, "message": "Invalid id"}), 400

        doc = saved_accounts.find_one({"_id": ObjectId(id)})
        if not doc or doc.get("user_id") != str(current_user["_id"]):
            return jsonify({"success": False, "message": "Not found or unauthorized"}), 404

        try:
            decrypted = double_decrypt(doc.get("account_password", ""), Config.SECRET_KEY, Config.SECRET_KEY_2)
        except Exception:
            logger.exception("Decryption failed for id %s", id)
            return jsonify({"success": False, "message": "Decryption error"}), 500

        logger.info(f"Password viewed by user {str(current_user['_id'])} for account {id}")
        return jsonify({"success": True, "password": decrypted}), 200
    except Exception:
        logger.exception("Error showing password")
        return jsonify({"success": False, "message": "Could not show password"}), 500


@app.route("/api/password/edit/<string:id>", methods=["PUT"])
@token_required
@limiter.limit("20 per minute")
def edit_password(current_user, id):
    try:
        if not _is_valid_objectid(id):
            return jsonify({"success": False, "message": "Invalid id"}), 400

        data = request.get_json() or {}
        doc = saved_accounts.find_one({"_id": ObjectId(id)})
        if not doc or doc.get("user_id") != str(current_user["_id"]):
            return jsonify({"success": False, "message": "Not found or unauthorized"}), 404

        updates = {}
        if data.get("account_name"):
            updates["account_name"] = data.get("account_name")
        if data.get("account_password"):
            updates["account_password"] = double_encrypt(data.get("account_password"), Config.SECRET_KEY, Config.SECRET_KEY_2)

        if updates:
            updates["updated_at"] = datetime.utcnow()
            saved_accounts.update_one({"_id": ObjectId(id)}, {"$set": updates})
            cache.delete(f"pw_meta:{str(current_user['_id'])}")

        logger.info(f"Password updated for user {str(current_user['_id'])}, account {id}")
        return jsonify({"success": True, "message": "Updated"}), 200
    except Exception:
        logger.exception("Error editing password")
        return jsonify({"success": False, "message": "Could not update account"}), 500


@app.route("/api/password/delete/<string:id>", methods=["DELETE"])
@token_required
@limiter.limit("20 per minute")
def delete_password(current_user, id):
    try:
        if not _is_valid_objectid(id):
            return jsonify({"success": False, "message": "Invalid id"}), 400

        doc = saved_accounts.find_one({"_id": ObjectId(id)})
        if not doc or doc.get("user_id") != str(current_user["_id"]):
            return jsonify({"success": False, "message": "Not found or unauthorized"}), 404

        saved_accounts.delete_one({"_id": ObjectId(id)})
        cache.delete(f"pw_meta:{str(current_user['_id'])}")
        logger.info(f"Password deleted for user {str(current_user['_id'])}, account {id}")
        return jsonify({"success": True, "message": "Deleted"}), 200
    except Exception:
        logger.exception("Error deleting password")
        return jsonify({"success": False, "message": "Could not delete account"}), 500



# Frontend routes

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")


# Startup

if __name__ == "__main__":
    _ensure_indexes()
    # Do not run debug=True in production
    app.run(debug=False)
                            

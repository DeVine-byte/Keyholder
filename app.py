from flask import Flask, request, jsonify, render_template
from werkzeug.security import generate_password_hash, check_password_hash
from flask_cors import CORS
from flask_caching import Cache
from datetime import datetime, timedelta
from bson import ObjectId

from config import Config
from db import users, saved_accounts, session_tokens, login_attempts
from token_utils import generate_token
from utils import double_encrypt, double_decrypt

app = Flask(__name__)
app.config.from_object(Config)
CORS(app)

cache = Cache(app)

# HELPERS

def user_to_json(u):
    return {**u, "_id": str(u["_id"])}

def session_to_json(s):
    return {**s, "_id": str(s["_id"])}

# Cleanup expired tokens
def _cleanup_expired_sessions():
    now = datetime.utcnow()
    session_tokens.delete_many({"expires_at": {"$lte": now}})

# Rate limiting helpers
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
        return

    if now - la["first_attempt_at"] > window:
        login_attempts.update_one(
            {"email": email},
            {"$set": {
                "attempts": 1,
                "first_attempt_at": now,
                "last_attempt_at": now,
                "locked_until": None
            }}
        )
    else:
        update = {
            "$set": {
                "last_attempt_at": now
            },
            "$inc": {
                "attempts": 1
            }
        }
        login_attempts.update_one({"email": email}, update)

    la = login_attempts.find_one({"email": email})

    if la["attempts"] >= Config.MAX_LOGIN_ATTEMPTS:
        lock_time = now + timedelta(minutes=Config.LOCK_DURATION_MINUTES)
        login_attempts.update_one({"email": email}, {"$set": {"locked_until": lock_time}})

def _reset_login_attempts(email):
    login_attempts.delete_one({"email": email})

# Token required middleware
def token_required(f):
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"message": "Missing or invalid token"}), 401

        token = auth_header.split(" ")[1]
        _cleanup_expired_sessions()

        session = session_tokens.find_one({"token": token})
        if not session:
            return jsonify({"message": "Invalid or expired token"}), 401

        user = users.find_one({"_id": ObjectId(session["user_id"])})
        if not user:
            return jsonify({"message": "User not found"}), 404

        return f(user, *args, **kwargs)
    return wrapper


# REGISTER

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json()

    if users.find_one({"email": data["email"]}):
        return jsonify({"success": False, "message": "Email exists"}), 400

    hashed = generate_password_hash(data["password"])
    new_user = {
        "username": data["username"],
        "email": data["email"],
        "password": hashed
    }

    result = users.insert_one(new_user)
    user_id = str(result.inserted_id)

    token = generate_token()
    expires = datetime.utcnow() + timedelta(hours=Config.SESSION_EXPIRES_HOURS)

    session_tokens.insert_one({
        "token": token,
        "user_id": user_id,
        "expires_at": expires
    })

    _reset_login_attempts(data["email"])

    return jsonify({"success": True, "token": token, "username": data["username"]})


# LOGIN

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    email = data["email"]

    la = _get_login_attempt(email)
    now = datetime.utcnow()

    if la and la.get("locked_until") and la["locked_until"] > now:
        return jsonify({
            "success": False,
            "message": f"Locked until {la['locked_until']} UTC"
        }), 403

    user = users.find_one({"email": email})
    if not user or not check_password_hash(user["password"], data["password"]):
        _register_failed_login(email)
        return jsonify({"success": False, "message": "Invalid credentials"}), 401

    _reset_login_attempts(email)

    token = generate_token()
    expires = datetime.utcnow() + timedelta(hours=Config.SESSION_EXPIRES_HOURS)

    session_tokens.insert_one({
        "token": token,
        "user_id": str(user["_id"]),
        "expires_at": expires
    })

    return jsonify({"success": True, "token": token, "username": user["username"]})


# ADD PASSWORD

@app.route("/api/password/add", methods=["POST"])
@token_required
def add_password(current_user):
    data = request.get_json()
    encrypted = double_encrypt(
        data["account_password"],
        Config.SECRET_KEY,
        Config.SECRET_KEY_2
    )

    saved_accounts.insert_one({
        "user_id": str(current_user["_id"]),
        "account_name": data["account_name"],
        "account_password": encrypted
    })

    cache.delete(f"pw:{str(current_user['_id'])}")

    return jsonify({"success": True, "message": "Saved"})


# LIST PASSWORDS

@app.route("/api/password/list", methods=["GET"])
@token_required
def list_passwords(current_user):
    uid = str(current_user["_id"])
    cached = cache.get(f"pw:{uid}")

    if cached:
        return jsonify({"success": True, "accounts": cached})

    docs = saved_accounts.find({"user_id": uid})
    result = []

    for d in docs:
        result.append({
            "id": str(d["_id"]),
            "account_name": d["account_name"],
            "account_password": double_decrypt(
                d["account_password"],
                Config.SECRET_KEY,
                Config.SECRET_KEY_2
            )
        })

    cache.set(f"pw:{uid}", result)

    return jsonify({"success": True, "accounts": result})


# DELETE PASSWORD
@app.route("/api/password/delete/<string:id>", methods=["DELETE"])
@token_required
def delete_password(current_user, id):
    uid = str(current_user["_id"])
    saved_accounts.delete_one({"_id": ObjectId(id), "user_id": uid})

    cache.delete(f"pw:{uid}")

    return jsonify({"success": True, "message": "Deleted"})



@app.route("/")
def home():
    return render_template("index.html")

@app.route("/dashboard")
def home():
    return render_template("dashboard.html")

@app.route("/about")
def home():
    return render_template("about.html")


if __name__ == "__main__":
    app.run(debug=True)

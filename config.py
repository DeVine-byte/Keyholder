import os

class Config:
    SECRET_KEY = os.environ.get("APP_SECRET_KEY", "MY_SUPER_SECRET_KEY")
    SECRET_KEY_2 = os.environ.get("APP_SECRET_KEY_2", "MY_SECOND_SECRET")

    # MongoDB URI
    MONGO_URI = os.environ.get("MONGO_URL", "mongodb://localhost:27017/dev_db")

    SESSION_EXPIRES_HOURS = int(os.environ.get("SESSION_EXPIRES_HOURS", 24))
    MAX_LOGIN_ATTEMPTS = int(os.environ.get("MAX_LOGIN_ATTEMPTS", 5))
    LOGIN_WINDOW_MINUTES = int(os.environ.get("LOGIN_WINDOW_MINUTES", 15))
    LOCK_DURATION_MINUTES = int(os.environ.get("LOCK_DURATION_MINUTES", 15))

    # Caching
    CACHE_TYPE = os.environ.get("CACHE_TYPE", "SimpleCache")
    CACHE_DEFAULT_TIMEOUT = int(os.environ.get("CACHE_DEFAULT_TIMEOUT", 300))
    CACHE_REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

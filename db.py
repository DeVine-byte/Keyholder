from pymongo import MongoClient
from config import Config

client = MongoClient(Config.MONGO_URI)
db = client["password_manager_db"]

# Collections:
users = db["users"]
saved_accounts = db["saved_accounts"]
session_tokens = db["session_tokens"]
login_attempts = db["login_attempts"]

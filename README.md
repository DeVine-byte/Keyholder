# Keyholder
# 🔐 Secure Password Manager API

A security-focused password manager API built with Flask, MongoDB, and strong encryption practices.

This project is designed with **real-world security controls** including:
- Session management with HttpOnly cookies
- CSRF protection
- Rate limiting
- Login brute-force protection
- AES-GCM encryption (double-layered)

---

## 🚀 Features

### 🔑 Authentication
- User registration
- Secure login system
- Session-based authentication (cookies + token fallback)
- Logout functionality
- `/me` endpoint to validate session

### 🛡️ Security Controls
- HttpOnly cookies (prevents XSS token theft)
- CSRF protection (token validation)
- Rate limiting (Flask-Limiter)
- Login attempt tracking + account lockout
- Secure headers via Flask-Talisman
- CORS protection

### 🔒 Password Storage
- AES-GCM encryption
- **Double encryption layer**
- User-specific password storage
- Secure retrieval and decryption

### ⚡ Performance
- Caching for password metadata
- MongoDB indexing
- Automatic expired session cleanup

---

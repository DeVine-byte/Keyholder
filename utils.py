import base64
import hashlib
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes

# Helper to derive 32-byte AES key from secret
def _derive_key(secret: str) -> bytes:
    # Use SHA256 to deterministically derive 32 bytes
    return hashlib.sha256(secret.encode()).digest()


def _aes_gcm_encrypt(plaintext: str, key_secret: str) -> str:
    """
    AES-GCM encrypt plaintext using key derived from key_secret.
    Returns base64(nonce || tag || ciphertext)
    """
    key = _derive_key(key_secret)
    nonce = get_random_bytes(12)  # 96-bit nonce recommended for GCM
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
    ciphertext, tag = cipher.encrypt_and_digest(plaintext.encode())
    payload = nonce + tag + ciphertext
    return base64.b64encode(payload).decode()


def _aes_gcm_decrypt(b64_payload: str, key_secret: str) -> str:
    """
    Reverse of _aes_gcm_encrypt. Accepts base64(nonce||tag||ciphertext).
    """
    key = _derive_key(key_secret)
    raw = base64.b64decode(b64_payload)
    nonce = raw[:12]
    tag = raw[12:28]  # 16 bytes tag
    ciphertext = raw[28:]
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
    plaintext = cipher.decrypt_and_verify(ciphertext, tag)
    return plaintext.decode()


# Public API: double encrypt / double decrypt using two different secrets
def double_encrypt(plain_text: str, secret1: str, secret2: str) -> str:
    """
    Double encryption: encrypt with secret1, then encrypt the result (base64 string)
    with secret2. Final result is base64 string.
    """
    first = _aes_gcm_encrypt(plain_text, secret1)   # base64 string
    second = _aes_gcm_encrypt(first, secret2)      # base64 string
    return second


def double_decrypt(encrypted_text: str, secret1: str, secret2: str) -> str:
    """
    Reverse of double_encrypt: decrypt with secret2, then decrypt with secret1.
    """
    first_decrypt = _aes_gcm_decrypt(encrypted_text, secret2)   # yields base64 string from first layer
    original = _aes_gcm_decrypt(first_decrypt, secret1)
    return original

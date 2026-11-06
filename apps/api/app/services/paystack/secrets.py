"""Encrypt the owner's Paystack secret key before it is stored.

The Fernet key is derived from PAYSTACK_KEY_SECRET, so any long random
string works as the setting. Changing the setting makes stored keys
unreadable: connections then ask the owner to paste their key again.
"""

import base64
import hashlib
import re

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings

KEY_PATTERN = re.compile(r"^sk_(test|live)_[A-Za-z0-9]{20,}$")


class PaystackKeyError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code, self.message = code, message


def _fernet() -> Fernet:
    secret = get_settings().paystack_key_secret
    if not secret:
        raise PaystackKeyError("PAYSTACK_NOT_CONFIGURED", "Paystack isn't set up on this server yet.")
    digest = hashlib.sha256(f"onrecord-paystack:{secret}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def check_format(secret_key: str) -> str:
    """Return the key's mode ("test" or "live"), or explain what was pasted instead."""
    key = secret_key.strip()
    if key.startswith("pk_"):
        raise PaystackKeyError("PAYSTACK_PUBLIC_KEY", "That's your public key. Paste the secret key, which starts with sk_.")
    match = KEY_PATTERN.match(key)
    if not match:
        raise PaystackKeyError("PAYSTACK_KEY_FORMAT", "That doesn't look like a Paystack secret key. It starts with sk_live_ or sk_test_.")
    return match.group(1)


def encrypt(secret_key: str) -> str:
    return _fernet().encrypt(secret_key.strip().encode()).decode()


def decrypt(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as error:
        raise PaystackKeyError("PAYSTACK_KEY_UNREADABLE", "Paste your Paystack secret key again to keep syncing.") from error

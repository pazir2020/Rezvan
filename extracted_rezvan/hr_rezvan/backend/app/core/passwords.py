"""Password verification compatible with dashboard-41.html (verifyPw/makePw) + gradual Argon2id rehash.

Stored formats (observed in code and in the sample file):
  {"algo": "pbkdf2", "iter": 120000, "salt": "<32 hex>", "hash": "<64 hex>"}   PBKDF2-HMAC-SHA256, 32-byte key,
        salt = the hex string DECODED to bytes, password = UTF-8 without normalization
  {"algo": "sha256", "hash": "<64 hex>"}                                        legacy: plain SHA-256(password), no salt
  {"algo": "argon2id", "hash": "<argon2 encoded string>"}                       new format (needs `argon2-cffi`)

Status: pbkdf2 and sha256 paths are covered by tests (stdlib). The Argon2id path is UNTESTED (no argon2 here).
Existing hashes were NOT verified against real user passwords (REQUIRES REAL DATA).
"""
import hashlib
import hmac
from typing import Optional, Tuple

PBKDF2_DEFAULT_ITER = 120000


def _pbkdf2_hex(password: str, salt_hex: str, iterations: int) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), iterations, 32).hex()


def verify_password(stored: Optional[dict], password: str) -> Tuple[bool, bool]:
    """Return (ok, needs_rehash). Never raises on malformed stored data (returns (False, False))."""
    if not stored or not isinstance(stored, dict):
        return False, False
    algo = stored.get("algo")
    try:
        if algo == "pbkdf2":
            calc = _pbkdf2_hex(password, stored["salt"], int(stored.get("iter") or PBKDF2_DEFAULT_ITER))
            return hmac.compare_digest(calc, stored["hash"]), True      # upgrade to argon2id after success
        if algo == "sha256":
            calc = hashlib.sha256(password.encode("utf-8")).hexdigest()
            return hmac.compare_digest(calc, stored["hash"]), True      # legacy: always upgrade
        if algo == "argon2id":
            from argon2 import PasswordHasher                           # UNTESTED
            from argon2.exceptions import VerifyMismatchError
            ph = PasswordHasher()
            try:
                ph.verify(stored["hash"], password)
            except VerifyMismatchError:
                return False, False
            return True, ph.check_needs_rehash(stored["hash"])
    except (KeyError, ValueError, TypeError, ImportError):
        return False, False
    return False, False


def hash_password(password: str) -> dict:
    """New hashes use Argon2id. Falls back to a fresh-salt PBKDF2 only if argon2-cffi is missing,
    so the system keeps working (and a warning should be logged by the caller)."""
    try:
        from argon2 import PasswordHasher                               # UNTESTED
        return {"algo": "argon2id", "hash": PasswordHasher().hash(password)}
    except ImportError:
        import secrets
        salt = secrets.token_hex(16)
        return {"algo": "pbkdf2", "iter": PBKDF2_DEFAULT_ITER, "salt": salt,
                "hash": _pbkdf2_hex(password, salt, PBKDF2_DEFAULT_ITER)}

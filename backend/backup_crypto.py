"""9x Vyapari encrypted backup (.vbk): AES-256-GCM, key = scrypt(APP_SECRET ‖ backup password, per-file salt).
Needs BOTH this software (APP_SECRET) and the user's backup password to open."""
import hashlib
import hmac
import json
import os
import zlib

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

MAGIC = b"9XVBK"
VERSION = 1
FLAG_ZLIB = 1
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2 ** 15, 8, 1
_FIXED_LEN = len(MAGIC) + 2 + 16 + 12 + 1  # magic, version+flags, salt, nonce, hint length
_PARTS = ("9x", "Vyapari", "Galla", "Arhat", "Hisab", "Kitab", "2026", "DOS")
APP_SECRET = hashlib.sha256("·".join(_PARTS).encode("utf-8")).digest()


class WrongPassword(Exception):
    pass


class NotVbk(Exception):
    pass


def derive_key(password: str, salt: bytes) -> bytes:
    kdf = Scrypt(salt=salt, length=32, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P)
    return kdf.derive(APP_SECRET + b"\x00" + password.encode("utf-8"))


def key_matches(password: str, salt: bytes, key: bytes) -> bool:
    return hmac.compare_digest(derive_key(password, salt), key)


def is_vbk(blob: bytes) -> bool:
    return blob[: len(MAGIC)] == MAGIC


def pack(data: dict, key: bytes, salt: bytes, hint: str = "") -> bytes:
    raw = zlib.compress(json.dumps(data, ensure_ascii=False).encode("utf-8"), 6)
    nonce = os.urandom(12)
    hint_b = hint.encode("utf-8")[:255]
    header = MAGIC + bytes([VERSION, FLAG_ZLIB]) + salt + nonce + bytes([len(hint_b)]) + hint_b
    return header + AESGCM(key).encrypt(nonce, raw, header)


def parse_header(blob: bytes) -> dict:
    if not is_vbk(blob) or len(blob) < _FIXED_LEN:
        raise NotVbk("Yeh 9x Vyapari backup (.vbk) file nahi hai")
    i = len(MAGIC)
    version, flags = blob[i], blob[i + 1]
    salt = blob[i + 2:i + 18]
    nonce = blob[i + 18:i + 30]
    hint_len = blob[i + 30]
    header_len = _FIXED_LEN + hint_len
    hint = blob[_FIXED_LEN:header_len].decode("utf-8", "replace")
    return {"version": version, "flags": flags, "salt": salt, "nonce": nonce, "hint": hint, "header_len": header_len}


def unpack(blob: bytes, password: str) -> dict:
    h = parse_header(blob)
    if len(blob) < h["header_len"] + 16:
        raise NotVbk("Backup file adhuri / kharab hai")
    key = derive_key(password, h["salt"])
    try:
        raw = AESGCM(key).decrypt(h["nonce"], blob[h["header_len"]:], blob[: h["header_len"]])
    except InvalidTag:
        raise WrongPassword("Backup password galat hai (ya file kharab hai)")
    try:
        if h["flags"] & FLAG_ZLIB:
            raw = zlib.decompress(raw)
        return json.loads(raw.decode("utf-8"))
    except Exception:
        raise NotVbk("Backup file adhuri / kharab hai")

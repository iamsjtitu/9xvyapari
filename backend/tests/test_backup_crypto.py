import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import backup_crypto as bkc  # noqa: E402


def _sample():
    return {"exported_at": "2026-06-10T00:00:00+00:00", "version": "1.2", "app": "9x Vyapari",
            "data": {"parties": [{"id": "p1", "name": "Sumit Kumar Jain", "opening_balance": 99.5}], "rokad": []}}


def test_roundtrip_and_header():
    salt = os.urandom(16)
    key = bkc.derive_key("Backup@2026", salt)
    blob = bkc.pack(_sample(), key, salt, hint="dukaan ka naam")
    assert bkc.is_vbk(blob) and blob.startswith(bkc.MAGIC)
    assert b"Sumit" not in blob and b"parties" not in blob  # nothing readable in the file
    h = bkc.parse_header(blob)
    assert h["hint"] == "dukaan ka naam" and h["salt"] == salt
    assert bkc.unpack(blob, "Backup@2026") == _sample()


def test_wrong_password_and_tamper():
    salt = os.urandom(16)
    blob = bkc.pack(_sample(), bkc.derive_key("right", salt), salt)
    with pytest.raises(bkc.WrongPassword):
        bkc.unpack(blob, "wrong")
    tampered = bytearray(blob)
    tampered[-5] ^= 0x01
    with pytest.raises(bkc.WrongPassword):
        bkc.unpack(bytes(tampered), "right")
    with pytest.raises(bkc.NotVbk):
        bkc.parse_header(b'{"data": {}}')


def test_key_matches_and_app_secret_binding():
    salt = os.urandom(16)
    key = bkc.derive_key("pw", salt)
    assert bkc.key_matches("pw", salt, key) and not bkc.key_matches("pw2", salt, key)
    # same password + salt but without the software secret → different key (file useless outside 9x Vyapari)
    from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
    plain = Scrypt(salt=salt, length=32, n=bkc.SCRYPT_N, r=bkc.SCRYPT_R, p=bkc.SCRYPT_P).derive(b"pw")
    assert plain != key

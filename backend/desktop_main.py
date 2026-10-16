import multiprocessing
import os
import sys


def _ensure_streams():
    # PyInstaller windowed builds have no stdio; route to a log file so uvicorn logging never crashes
    if sys.stdout is None or sys.stderr is None:
        log_dir = os.environ.get("VYAPARI_LOG_DIR") or os.getcwd()
        f = open(os.path.join(log_dir, "backend-stdio.log"), "a", buffering=1, encoding="utf-8")
        sys.stdout = sys.stdout or f
        sys.stderr = sys.stderr or f


def _watch_parent():
    # If the Electron shell dies abruptly, stop MongoDB gracefully and exit so nothing is left orphaned
    pid = int(os.environ.get("VYAPARI_PARENT_PID", "0") or 0)
    if not pid:
        return
    import threading
    import time

    def alive() -> bool:
        if sys.platform == "win32":
            import ctypes
            k32 = ctypes.windll.kernel32
            h = k32.OpenProcess(0x00100000, False, pid)  # SYNCHRONIZE
            if not h:
                return False
            try:
                return k32.WaitForSingleObject(h, 0) == 0x102  # WAIT_TIMEOUT => still running
            finally:
                k32.CloseHandle(h)
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False

    def loop():
        while True:
            time.sleep(2)
            if not alive():
                try:
                    from pymongo import MongoClient
                    MongoClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=2000).admin.command("shutdown", force=True)
                except Exception:
                    pass
                os._exit(0)

    threading.Thread(target=loop, daemon=True).start()


def selftest() -> int:
    """`vyapari-backend --selftest`: proves the frozen build can import everything (run in CI before release)."""
    import json
    import os as _os
    import tempfile

    tmp = tempfile.mkdtemp(prefix="vyapari-selftest-")
    _os.environ.update({
        "MONGO_URL": _os.environ.get("MONGO_URL", "mongodb://127.0.0.1:1"),
        "DB_NAME": _os.environ.get("DB_NAME", "selftest"),
        "JWT_SECRET": _os.environ.get("JWT_SECRET", "selftest"),
        "CORS_ORIGINS": "http://127.0.0.1",
        "BACKUP_DIR": tmp,
        "DOS_BACKUP_DIR": tmp,
        "VYAPARI_LOG_DIR": tmp,
    })
    import uvicorn  # noqa: F401
    import backup_crypto as bkc
    import server

    salt = _os.urandom(16)
    blob = bkc.pack({"data": {}}, bkc.derive_key("pw", salt), salt, "selftest")
    assert bkc.unpack(blob, "pw") == {"data": {}}
    routes = {r.path for r in server.app.routes}
    for must in ("/api/auth/login", "/api/backup", "/api/restore", "/api/rokad/by-voucher"):
        assert must in routes, f"route missing: {must}"
    print(json.dumps({"ok": True, "routes": len(routes), "crypto": "aes-256-gcm/scrypt"}))
    return 0


def main():
    if "--selftest" in sys.argv:
        sys.exit(selftest())
    _ensure_streams()
    _watch_parent()
    import uvicorn
    from server import app

    uvicorn.run(
        app,
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8001")),
        log_level="info",
    )


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()

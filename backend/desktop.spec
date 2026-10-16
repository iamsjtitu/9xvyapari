# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for the 9x Vyapari offline desktop backend.
# Build:  pyinstaller --noconfirm --clean desktop.spec   (run inside /backend)
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

hiddenimports = (
    collect_submodules("uvicorn")
    + collect_submodules("motor")
    + collect_submodules("pymongo")
    + collect_submodules("bson")
    + ["dbfread", "bcrypt", "jwt", "email_validator", "dotenv", "dns", "dns.resolver", "security", "backup_crypto",
       "cryptography.hazmat.primitives.ciphers.aead", "cryptography.hazmat.primitives.kdf.scrypt"]
)

datas = collect_data_files("email_validator") + collect_data_files("dbfread")

a = Analysis(
    ["desktop_main.py"],
    pathex=["."],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        "tkinter", "pandas", "numpy", "boto3", "botocore", "pytest", "black",
        "mypy", "IPython", "matplotlib", "scipy", "PIL", "emergentintegrations",
    ],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="vyapari-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="vyapari-backend",
)

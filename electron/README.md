# 9x Vyapari – Windows Desktop App (Offline)

Yeh folder Electron shell hai jo **Python backend + MongoDB + React UI** sab ko ek hi `.exe` installer me bundle karta hai.
App bina internet ke chalta hai — saara data aapke PC par rehta hai.

---

## 1. Build kaise hota hai (automatic)

1. Emergent me **"Save to GitHub"** dabao → code aapke GitHub repo me push hota hai.
2. Push hote hi GitHub Actions workflow `.github/workflows/build-desktop.yml` chal padta hai (Windows runner par, ~10–15 min).
3. Build poora hone par repo ke **Releases** tab me naya release ban jata hai, jisme 3 files hoti hain:
   | File | Kya hai |
   |---|---|
   | `9x-Vyapari-Setup-1.0.<n>.exe` | **Installer** – install karo, Start Menu/Desktop shortcut, **auto-update** chalta hai |
   | `9x-Vyapari-Portable-1.0.<n>.exe` | **Portable (ek file)** – bina install seedha chalao. Har baar khulne par thoda extract time lagta hai |
   | `9x-Vyapari-1.0.<n>-win-portable-folder.zip` | **Portable folder** – unzip karo, `9x Vyapari.exe` chalao. Sabse fast portable option |
4. Pehli baar: koi bhi file download karo. Installer version har naye build par **khud update** ho jata hai; portable versions naya version aane par sirf *batate* hain (Help → "Update Check Karein").

### Data Folder (har start par poochta hai)
Software kholte hi ek chhoti window aati hai: **"Data Folder chunein"** — pichla folder yaad rehta hai, bas **Enter / Shuru Karein** dabao.
- "Badlein..." se koi bhi folder chun sakte ho (D: drive, pen drive, network share...). Database, backups, logs aur DOS DBF files **usi folder** me rehti hain.
- Alag firm / alag saal ke liye alag folder rakho — har folder apna alag hisab hai.
- Portable version me chosen folder exe ke bagal me `9x-vyapari.config.json` me yaad rehta hai; default `9xVyapariData` folder exe ke saath hi banta hai.
- Power users: `VYAPARI_DATA_DIR` environment variable set karo to window nahi aati.

### Auto Backup
- **Har logout par** automatic JSON backup banta hai → `<Data Folder>\backups\vyapari-backup_<date>_<time>_logout.json` (last 30 rakhe jaate hain).
- Backup / Restore page par "Auto Backups" list dikhti hai — kisi bhi file par **Restore** dabao ya **Abhi Backup Lein**.

> **Zaroori:** Agar "Save to GitHub" ke baad Actions tab me workflow nahi dikhe, to GitHub par repo kholo → **Add file → Create new file** → naam `.github/workflows/build-desktop.yml` → is repo ki file ka content paste karke commit karo. (Kuch GitHub tokens workflow files push nahi kar paate.)

### ⚠️ Auto-update ke liye repo setting (ZAROORI)
Aapka repo **private** hai to installed app me "Update check nahi ho paya (404)" aayega. Koi **ek** karo:
- **Option A – Repo Public karo:** GitHub → repo → Settings → Danger Zone → Change visibility → Public. (Note: `backend/.env` jaisi files bhi dikhengi — preview JWT secret badal lena.)
- **Option B – Private rakho + token do:**
  1. GitHub → (apni profile) Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
  2. Repository access: *Only select repositories* → sirf yeh repo; Permissions → Repository permissions → **Contents: Read-only**; expiry lamba rakho (1 saal)
  3. Token copy karo → repo → Settings → **Secrets and variables → Actions → New repository secret** → Name `UPDATE_TOKEN`, Value = token
  4. "Save to GitHub" se naya build chalao → Releases se **naya Setup install karo** (token build me embed hota hai) → ab se updates khud aayenge
- Build log me warning dikhegi agar repo private hai aur `UPDATE_TOKEN` nahi hai.

### Update kaise dikhta hai (app ke andar)
- App khulne ke ~8 sec baad (aur har 6 ghante) khud check hota hai. Naya version mila to **neeche-right me banner**: "Naya Update Available · v1.0.x" → download progress bar (MB / %, speed) → "Update Taiyaar Hai" ke saath **Abhi Restart Karein / Baad Me**.
- **Settings → Software Update** card me version, last status/progress aur "Update Check Karein" button hai. (Help menu → "Update Check Karein" bhi wahi karta hai.)
- Portable version download nahi karta — banner me "Download Page Kholein" aata hai.
- UI test karne ke liye (bina real release): `VYAPARI_SIMULATE_UPDATE=1` env ke saath app chalao → fake update v9.9.9 ka pura flow banner me dikhega.

---

## 2. Install & pehla login

- Installer / portable chalao → "Windows protected your PC" aaye to **More info → Run anyway** (app signed nahi hai, yeh normal hai).
- Data Folder window me **Shuru Karein** → app khulega → Login: username `admin` / password `admin123`
- **Pehli baar** login par app "Pehle naya password set karein" screen dikhayega — naya password (min 6) set kiye bina software nahi khulega. Password kahin file me save nahi hota (sirf hash DB me).
- Single-user software hai (register option nahi). Password badalne ke liye: **Settings → Login Username / Password Badlein**. 5 baar galat password → 15 minute lock.
- Pehli start par Database + Hisab engine start hone me 10–20 sec lag sakte hain (splash screen dikhega).

## 3. Aapka data kahan hai?

Sab kuch aapke chune hue **Data Folder** me (default: `Documents\9x Vyapari Data`, portable me exe ke paas `9xVyapariData`):

| Kya | Kahan |
|---|---|
| Database (MongoDB) | `<Data Folder>\mongo` |
| Auto backups (logout par) | `<Data Folder>\backups` |
| DOS / FoxPro `.DBF` backup (migrate ke liye yahan rakho) | `<Data Folder>\dos_backup` |
| Logs | `<Data Folder>\logs` |
| Login/secret config | `<Data Folder>\config.json` |

App ke **File menu** se yeh saare folder seedha khul jaate hain, aur "Data Folder Badlein..." se restart karke dusra folder chun sakte ho.
Pura backup lene ke liye poora Data Folder copy kar lo (app band karke).

### DOS data migrate karna
Purane FoxPro ke `LEDGR.DBF`, `AN.DBF`, `CASHBOOK.DBF` ... files `dos_backup` folder me daalo → app me **Import (DBF) → "Migrate Complete DOS Data"** dabao.

---

## 4. Apne Windows PC par manual build (optional)

Requirements: Node 20+, Python 3.11, Yarn.

```powershell
# 1. Frontend
cd frontend
$env:REACT_APP_DESKTOP="1"; $env:CI="false"; $env:DISABLE_ESLINT_PLUGIN="true"
yarn install; yarn build

# 2. Backend
cd ..\backend
pip install -r requirements-desktop.txt
pyinstaller --noconfirm --clean desktop.spec

# 3. MongoDB (4.4.x – purane/non-AVX CPU par bhi chalta hai)
#    https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-4.4.29.zip download karo,
#    bin\mongod.exe ko electron\resources\mongodb\mongod.exe par copy karo

# 4. Resources stage + build
cd ..\electron
Copy-Item -Recurse ..\backend\dist\vyapari-backend resources\backend
Copy-Item -Recurse ..\frontend\build resources\frontend
yarn install
yarn dist          # → electron\dist\ me Setup .exe, Portable .exe aur portable-folder .zip
```

Dev mode (bina bundle, running dev servers ke saath): `yarn start` (default `http://localhost:3000`, ya `VYAPARI_DEV_URL` set karo).

---

## 5. Troubleshooting

| Problem | Hal |
|---|---|
| "MongoDB start nahi hua" | `logs\mongod.log` dekho. Agar `VCRUNTIME140.dll` missing → [Visual C++ Redistributable 2015-2022 x64](https://aka.ms/vs/17/release/vc_redist.x64.exe) install karo. |
| Antivirus ne block kiya | `9x Vyapari` install folder ko antivirus me allow/exclude karo. |
| App khulta hai par blank | Help → Developer Tools → Console error dekho; `logs\backend.log` check karo. |
| Update nahi aa raha | Repo public hai ya `UPDATE_TOKEN` secret set hai? Help → "Update Check Karein". |
| Build fail (Actions) | Actions tab → failed step ka log dekho. Zyada tar `yarn install` network timeout hota hai → "Re-run jobs". |

Technical: Electron har start par free ports chunta hai, `mongod.exe` aur `vyapari-backend.exe` ko spawn karta hai, aur backend hi React build serve karta hai (same-origin, isliye CORS/cookie issue nahi). Band karte waqt MongoDB ko gracefully shutdown kiya jata hai.

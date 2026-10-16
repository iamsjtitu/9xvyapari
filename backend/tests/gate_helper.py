# Helper for the backup-password gate test: save/delete/restore db.backup_key
import json
import sys

from dotenv import dotenv_values
from pymongo import MongoClient

env = dotenv_values("/app/backend/.env")
db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
cmd = sys.argv[1]
if cmd == "delete":
    doc = db.backup_key.find_one({"id": "backup"}, {"_id": 0})
    if doc:
        json.dump(doc, open("/tmp/backup_key_saved.json", "w"))
    print("deleted", db.backup_key.delete_many({"id": "backup"}).deleted_count)
elif cmd == "show":
    print(db.backup_key.find_one({"id": "backup"}, {"_id": 0, "key": 0, "salt": 0}))
elif cmd == "restore":
    doc = json.load(open("/tmp/backup_key_saved.json"))
    db.backup_key.replace_one({"id": "backup"}, doc, upsert=True)
    print("restored")

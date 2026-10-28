import asyncio, os, sys, time
sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
import server  # noqa


async def main():
    db = server.db
    parties = await db.parties.find({}, {"_id": 0}).to_list(50000)
    for as_on in (None, "2026-06-30", "2026-04-30"):
        t = time.time()
        bulk = await server._bulk_party_balances(as_on, parties=parties)
        tb = time.time() - t
        t = time.time()
        bad = 0
        for p in parties:
            one = await server._compute_party_balance(p["id"], float(p.get("opening_balance") or 0), as_on)
            if abs(one - bulk[p["id"]]) > 0.005:
                bad += 1
                if bad < 5:
                    print("MISMATCH", as_on, p["name"], one, bulk[p["id"]])
        print(f"as_on={as_on}: parties={len(parties)} bulk={tb:.3f}s per-party={time.time()-t:.3f}s mismatches={bad}")

asyncio.run(main())

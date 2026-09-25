"""Independent read-only database export; never calls provider/evaluator code."""
import json
import sqlite3
import sys
from pathlib import Path

db = sqlite3.connect(Path(sys.argv[1]).resolve().as_uri() + "?mode=ro", uri=True)
db.row_factory = sqlite3.Row
db.execute("BEGIN")
job = sys.argv[2]
task = dict(db.execute("SELECT * FROM jobs WHERE job=?", (job,)).fetchone())
effects = [dict(r) for r in db.execute("SELECT * FROM effects WHERE job=? ORDER BY effect_id", (job,))]
ledger = [dict(r) for r in db.execute("SELECT * FROM ledger WHERE job=? ORDER BY seq", (job,))]
truth = len(effects) == 1 and all(r["resource"] == task["resource"] and r["amount"] == task["amount"]
                               and r["settled"] == 1 and r["approved"] == 1 for r in effects)
truth = truth and all(r["approved"] == 1 for r in ledger)
print(json.dumps({"task": task, "effects": effects, "ledger": ledger, "truth": truth}))
db.close()

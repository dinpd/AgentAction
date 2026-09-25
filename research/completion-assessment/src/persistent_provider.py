"""Local research fixture: real HTTP, SQLite transactions, no external effects."""
from __future__ import annotations

import json
import socket
import sqlite3
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

DB = sys.argv[1]
BARRIERS = {}
LOCK = threading.Lock()


def connect():
    db = sqlite3.connect(DB, timeout=10, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA synchronous=FULL")
    return db


with connect() as db:
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript("""
      CREATE TABLE IF NOT EXISTS jobs(
        job TEXT PRIMARY KEY, resource TEXT NOT NULL, amount INTEGER NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS effects(
        job TEXT REFERENCES jobs(job), effect_id INTEGER, idempotency_key TEXT,
        resource TEXT, amount INTEGER, settled INTEGER, approved INTEGER,
        PRIMARY KEY(job,effect_id), UNIQUE(job,idempotency_key));
      CREATE TABLE IF NOT EXISTS ledger(
        job TEXT REFERENCES jobs(job), seq INTEGER, effect_id INTEGER,
        status TEXT, approved INTEGER, PRIMARY KEY(job,seq));
    """)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send(self, status, value):
        data = json.dumps(value, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.dispatch()

    def do_POST(self):
        self.dispatch()

    def dispatch(self):
        db = None
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 <= length <= 131072:
                return self.send(413, {"error": "request too large"})
            data = json.loads(self.rfile.read(length)) if length else {}
            parsed = urlsplit(self.path)
            query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
            route = (self.command, parsed.path)
            if parsed.path == "/barrier":
                name = data.get("name", query.get("name"))
                with LOCK:
                    if route == ("POST", "/barrier") and data["action"] == "create":
                        BARRIERS[name] = (threading.Event(), threading.Event())
                    ready, release = BARRIERS[name]
                    if route == ("POST", "/barrier") and data["action"] == "release":
                        release.set()
                return self.send(200, {"ready": ready.is_set()})
            db = connect()
            if route == ("POST", "/jobs"):
                assert isinstance(data["job"], str) and len(data["job"]) < 200
                assert isinstance(data["resource"], str) and len(data["resource"]) < 200
                assert isinstance(data["amount"], int) and 0 < data["amount"] < 1000000
                db.execute("INSERT INTO jobs(job,resource,amount) VALUES (?,?,?)",
                           (data["job"], data["resource"], data["amount"]))
                return self.send(201, {"created": True})
            job = data.get("job", query.get("job"))
            if route == ("POST", "/refund"):
                if data.get("arrived"):
                    BARRIERS[data["arrived"]][0].set()
                db.execute("BEGIN IMMEDIATE")
                task = db.execute("SELECT * FROM jobs WHERE job=?", (job,)).fetchone()
                assert task is not None
                key = data["key"]
                assert isinstance(key, str) and 0 < len(key) < 200
                existing = db.execute("SELECT effect_id FROM effects WHERE job=? AND idempotency_key=?", (job, key)).fetchone()
                approved = bool(data.get("approved", True))
                if existing:
                    effect_id, status = existing[0], "replayed"
                else:
                    effect_id = db.execute("SELECT COUNT(*)+1 FROM effects WHERE job=?", (job,)).fetchone()[0]
                    status = "executed"
                    db.execute("INSERT INTO effects VALUES (?,?,?,?,?,?,?)", (job, effect_id, key,
                               data.get("resource", task["resource"]), task["amount"],
                               int(bool(data.get("settled", True))), int(approved)))
                seq = db.execute("SELECT COUNT(*)+1 FROM ledger WHERE job=?", (job,)).fetchone()[0]
                db.execute("INSERT INTO ledger VALUES (?,?,?,?,?)", (job, seq, effect_id, status, int(approved)))
                db.execute("UPDATE jobs SET revision=revision+1 WHERE job=?", (job,))
                if data.get("barrier"):
                    ready, release = BARRIERS[data["barrier"]]
                    ready.set()
                    if not release.wait(10):
                        raise TimeoutError("pre-commit barrier was not released")
                db.commit()
                if data.get("lose_response"):
                    # Deliberately cut the TCP response only after durable commit.
                    self.close_connection = True
                    self.connection.shutdown(socket.SHUT_RDWR)
                    self.connection.close()
                    return
                return self.send(200, {"effect_id": effect_id, "seq": seq, "status": status})
            if route == ("POST", "/state"):
                db.execute("BEGIN IMMEDIATE")
                db.execute("UPDATE effects SET settled=? WHERE job=?", (int(bool(data["settled"])), job))
                db.execute("UPDATE jobs SET revision=revision+1 WHERE job=?", (job,))
                db.commit()
                return self.send(200, {"updated": True})
            if route == ("POST", "/control/unmediated"):
                # Explicit out-of-model intervention: an effect bypasses both
                # the event ledger and revision counter. Never a remedy feature.
                db.execute("BEGIN IMMEDIATE")
                r = db.execute("SELECT * FROM effects WHERE job=? ORDER BY effect_id DESC LIMIT 1", (job,)).fetchone()
                db.execute("INSERT INTO effects VALUES (?,?,?,?,?,?,?)", (job, r["effect_id"] + 1,
                           "bypass", r["resource"], r["amount"], r["settled"], r["approved"]))
                db.commit()
                return self.send(200, {"bypassed": True})
            if route in (("GET", "/snapshot"), ("GET", "/head")):
                db.execute("BEGIN")
                task = db.execute("SELECT * FROM jobs WHERE job=?", (job,)).fetchone()
                assert task is not None
                if parsed.path == "/head":
                    result = {"job": job, "resource": task["resource"], "revision": task["revision"], "challenge": query["challenge"]}
                else:
                    effect = db.execute("SELECT * FROM effects WHERE job=? ORDER BY effect_id DESC LIMIT 1", (job,)).fetchone()
                    ledger = [dict(r) for r in db.execute("SELECT * FROM ledger WHERE job=? ORDER BY seq", (job,))]
                    result = {"job": job, "revision": task["revision"], "ledger": ledger,
                              "state": {"resource": effect["resource"] if effect else task["resource"],
                                        "amount": effect["amount"] if effect else 0,
                                        "settled": bool(effect["settled"]) if effect else False}}
                db.commit()
                return self.send(200, result)
            return self.send(404, {"error": "unknown route"})
        except (AssertionError, KeyError, ValueError, TypeError) as error:
            if db and db.in_transaction:
                db.rollback()
            self.send(400, {"error": type(error).__name__})
        except Exception as error:
            if db and db.in_transaction:
                db.rollback()
            self.send(500, {"error": type(error).__name__})
        finally:
            if db:
                db.close()


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
server.daemon_threads = True
print(json.dumps({"port": server.server_port}), flush=True)
server.serve_forever()

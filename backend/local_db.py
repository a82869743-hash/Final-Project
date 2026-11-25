"""
Local SQLite store with a Supabase-compatible query API.

Used automatically when SUPABASE_URL / SUPABASE_KEY are missing or the
Supabase client cannot be created. Existing code such as

    supabase.table("dispatch_logs").select("*").order("timestamp", desc=True).limit(5).execute()

works unchanged and returns an object with `.data` and `.count`.

Each table is stored as rows of JSON documents, so no schema migration is
needed. Filtering and ordering happen in Python, which is fine for the
data volumes a single dispatch-center demo produces.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone

DB_PATH = os.getenv("LOCAL_DB_PATH") or os.path.join(os.path.dirname(__file__), "data", "aegis_local.db")
MAX_ROWS = {"vehicle_history": 20000}  # cap high-volume tables

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def _db() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("CREATE TABLE IF NOT EXISTS docs (tbl TEXT, id TEXT, data TEXT, seq INTEGER PRIMARY KEY AUTOINCREMENT)")
        _conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS docs_tbl_id ON docs(tbl, id)")
    return _conn


class _Result:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _Query:
    def __init__(self, table: str):
        self.table = table
        self._op = "select"
        self._cols = "*"
        self._count = None
        self._filters: list = []
        self._order: tuple | None = None
        self._limit: int | None = None
        self._payload = None

    # ── builders ──
    def select(self, cols: str = "*", count: str | None = None):
        self._op, self._cols, self._count = "select", cols, count
        return self

    def insert(self, data):
        self._op, self._payload = "insert", data
        return self

    def upsert(self, data):
        self._op, self._payload = "upsert", data
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, col, val):  self._filters.append((col, "eq", val)); return self
    def neq(self, col, val): self._filters.append((col, "neq", val)); return self
    def lt(self, col, val):  self._filters.append((col, "lt", val)); return self
    def lte(self, col, val): self._filters.append((col, "lte", val)); return self
    def gt(self, col, val):  self._filters.append((col, "gt", val)); return self
    def gte(self, col, val): self._filters.append((col, "gte", val)); return self

    def order(self, col, desc: bool = False):
        self._order = (col, desc)
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    # ── execution ──
    def _match(self, row: dict) -> bool:
        for col, op, val in self._filters:
            v = row.get(col)
            if v is None and op not in ("eq", "neq"):
                return False
            try:
                if op == "eq" and v != val: return False
                if op == "neq" and v == val: return False
                if op == "lt" and not v < val: return False
                if op == "lte" and not v <= val: return False
                if op == "gt" and not v > val: return False
                if op == "gte" and not v >= val: return False
            except TypeError:
                return False
        return True

    def execute(self) -> _Result:
        with _lock:
            conn = _db()
            if self._op in ("insert", "upsert"):
                rows = self._payload if isinstance(self._payload, list) else [self._payload]
                out = []
                now = datetime.now(timezone.utc).isoformat()
                for r in rows:
                    r = dict(r)
                    r.setdefault("id", str(uuid.uuid4()))
                    r.setdefault("timestamp", now)
                    r.setdefault("created_at", now)
                    verb = "INSERT OR REPLACE" if self._op == "upsert" else "INSERT OR IGNORE"
                    conn.execute(f"{verb} INTO docs (tbl, id, data) VALUES (?, ?, ?)",
                                 (self.table, str(r["id"]), json.dumps(r, default=str)))
                    out.append(r)
                cap = MAX_ROWS.get(self.table)
                if cap:
                    conn.execute("DELETE FROM docs WHERE tbl=? AND seq NOT IN "
                                 "(SELECT seq FROM docs WHERE tbl=? ORDER BY seq DESC LIMIT ?)",
                                 (self.table, self.table, cap))
                conn.commit()
                return _Result(out, len(out))

            rows = [json.loads(d) for (d,) in conn.execute(
                "SELECT data FROM docs WHERE tbl=? ORDER BY seq", (self.table,))]
            rows = [r for r in rows if self._match(r)]

            if self._op == "delete":
                for r in rows:
                    conn.execute("DELETE FROM docs WHERE tbl=? AND id=?", (self.table, str(r["id"])))
                conn.commit()
                return _Result(rows, len(rows))

            total = len(rows)
            if self._order:
                col, desc = self._order
                rows.sort(key=lambda r: (r.get(col) is None, r.get(col) or ""), reverse=desc)
            if self._limit is not None:
                rows = rows[: self._limit]
            if self._cols and self._cols.strip() != "*":
                keep = [c.strip() for c in self._cols.split(",")]
                rows = [{k: r.get(k) for k in keep} for r in rows]
            return _Result(rows, total if self._count else None)


class LocalClient:
    """Drop-in stand-in for the parts of supabase-py this project uses."""
    is_local = True

    def table(self, name: str) -> _Query:
        return _Query(name)


local_client = LocalClient()

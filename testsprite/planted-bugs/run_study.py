"""Planted-bug study for CareLog's care promises.

For each planted bug: change one or two lines of the real server code, start the app on a
throwaway local database, run all 12 promise tests, record which ones fail, then put the
code back with git. A promise test "catches" a bug when it fails while that bug is present.

Usage (from the repository root):  python testsprite/planted-bugs/run_study.py
"""
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROMISES = os.path.join(ROOT, "testsprite", "promises")
PORT = 3099

BUGS = [
    ("B01", "A removed caregiver keeps access", "src/core.js",
     "WHERE circle_id = ? AND user_id = ? AND status = 'active'\"", "WHERE circle_id = ? AND user_id = ?\""),
    ("B02", "Strangers learn that a circle exists (403 instead of 404)", "src/core.js",
     "if (!circle || !member || expired) throw new HttpError(404, 'circle_not_found');",
     "if (!circle || !member || expired) throw new HttpError(circle && !member ? 403 : 404, 'circle_not_found');"),
    ("B03", "Private notes are shown to everyone", "src/core.js",
     "if (!canSeePrivate(role)) where.push('is_private = 0');", ""),
    ("B04", "Private documents appear on the emergency link", "src/extras.js",
     "AND is_emergency = 1 AND is_private = 0", "AND is_emergency = 1"),
    ("B05", "A switched-off emergency link still opens", "src/extras.js",
     "if (link.revoked_at) throw new HttpError(410, 'link_revoked');", ""),
    ("B06", "A dose can be recorded twice", "src/app.js",
     "if (!String(e.message).includes('UNIQUE')) throw e;",
     "if (!String(e.message).includes('UNIQUE')) throw e; return await db.prepare('SELECT * FROM records WHERE schedule_item_id = ? AND scheduled_for = ? AND is_exception = 0').get(itemId, scheduledFor);"),
    ("B07", "Reviewing a handoff closes every open job", "src/handoffs.js",
     "const r = await db.prepare('INSERT OR IGNORE INTO handoff_acks (handoff_id, user_id, acked_at) VALUES (?, ?, ?)').run(h.id, user.id, now());",
     "const r = await db.prepare('INSERT OR IGNORE INTO handoff_acks (handoff_id, user_id, acked_at) VALUES (?, ?, ?)').run(h.id, user.id, now()); await db.prepare('UPDATE open_items SET resolved_at = ?, resolved_by = ? WHERE circle_id = ? AND resolved_at IS NULL').run(now(), user.id, circle.id);"),
    ("B08", "A correction overwrites the original entry", "src/app.js",
     "await db.prepare('INSERT INTO corrections (record_id, author_id, new_text, new_reported_at, new_outcome, reason, entered_at) VALUES (?, ?, ?, ?, ?, ?, ?)')",
     "if (newText !== null) await db.prepare('UPDATE records SET text = ? WHERE id = ?').run(newText, rec.id);\n    await db.prepare('INSERT INTO corrections (record_id, author_id, new_text, new_reported_at, new_outcome, reason, entered_at) VALUES (?, ?, ?, ?, ?, ?, ?)')"),
    ("B09", "Shared costs are rounded and gain a cent", "src/extras.js",
     "const share = base + (remainder-- > 0 ? 1 : 0);", "const share = Math.round(total / n);"),
    ("B10", "Signing out signs out every browser (the original bug)", "src/app.js",
     "DELETE FROM sessions WHERE token = ?').run(tok);",
     "DELETE FROM sessions WHERE user_id = (SELECT user_id FROM sessions WHERE token = ?)').run(tok);"),
    ("B11", "Doctors and nurses can change the record", "src/lib.js",
     "clinician: ['read', 'export'],", "clinician: ['read', 'export', 'write_record', 'items'],"),
    ("B12", "A new password leaves a lost phone signed in", "src/app.js",
     "await db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').run(hash, salt, user.id);",
     "await db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').run(hash, salt, user.id); return c.json({ ok: true, other_sessions_ended: 0 });"),
]


def plant(path, old, new):
    full = os.path.join(ROOT, path)
    text = open(full, encoding="utf-8").read()
    assert text.count(old) == 1, f"{path}: expected exactly one match for the planted line"
    open(full, "w", encoding="utf-8", newline="").write(text.replace(old, new))


def restore(path):
    subprocess.run(["git", "checkout", "--", path], cwd=ROOT, check=True)


def wait_for_server():
    for _ in range(60):
        try:
            urllib.request.urlopen(f"http://localhost:{PORT}/api/health", timeout=1)
            return
        except Exception:
            time.sleep(0.25)
    raise RuntimeError("server did not start")


def run_promises():
    failed = []
    env = dict(os.environ, CARELOG_URL=f"http://localhost:{PORT}")
    for name in sorted(os.listdir(PROMISES)):
        if not name.endswith(".py"):
            continue
        r = subprocess.run([sys.executable, os.path.join(PROMISES, name)], env=env, capture_output=True, text=True, timeout=120)
        if r.returncode != 0:
            failed.append(name[:3])
    return failed


def run_one(label):
    db = os.path.join(tempfile.mkdtemp(), "study.db")
    env = dict(os.environ, PORT=str(PORT), TURSO_DATABASE_URL="file:" + db.replace("\\", "/"), TURSO_AUTH_TOKEN="")
    server = subprocess.Popen(["node", "src/server.js"], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_for_server()
        return run_promises()
    finally:
        server.kill()
        server.wait()


def main():
    results = {"baseline": run_one("baseline"), "bugs": []}
    print("baseline failures:", results["baseline"] or "none", flush=True)
    for bug_id, title, path, old, new in BUGS:
        plant(path, old, new)
        try:
            caught = run_one(bug_id)
        finally:
            restore(path)
        results["bugs"].append({"id": bug_id, "bug": title, "file": path, "caught_by": caught})
        print(f"{bug_id} {title}: {'caught by ' + ', '.join(caught) if caught else 'NOT CAUGHT'}", flush=True)
    caught_count = sum(1 for b in results["bugs"] if b["caught_by"])
    results["summary"] = f"{caught_count} of {len(BUGS)} planted bugs caught"
    print(results["summary"])
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "results.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)


if __name__ == "__main__":
    main()

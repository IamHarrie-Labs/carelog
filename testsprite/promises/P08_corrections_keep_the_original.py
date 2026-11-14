"""CareLog care promise: Corrections keep the original entry and the reason

Nothing is overwritten. Everyone can see what was first written, what changed, who changed it and why.
Runs against the live site with throwaway accounts it creates itself.
"""
import os
import uuid

import requests

BASE_URL = os.environ.get("CARELOG_URL", "https://carelog-sigma.vercel.app").rstrip("/")


def api(method, path, token=None, body=None):
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = "Bearer " + token
    r = requests.request(method, BASE_URL + path, json=body, headers=headers, timeout=30)
    try:
        data = r.json()
    except ValueError:
        data = None
    return r.status_code, data


def person(name):
    email = "promise-" + uuid.uuid4().hex[:12] + "@example.com"
    status, data = api("POST", "/api/signup", body={"email": email, "name": name, "password": "promise-pass-123"})
    assert status == 201, ("signup failed", status, data)
    return data["token"], data["user"]["id"], email


def circle(token):
    status, data = api("POST", "/api/circles", token, {"name": "Promise check", "recipient_name": "Dad", "timezone": "UTC", "apply_template": True})
    assert status == 201, ("create circle failed", status, data)
    return data["id"]


def join(owner, cid, role, name):
    status, invite = api("POST", f"/api/circles/{cid}/invites", owner, {"role": role, "access_hours": 24 if role == "clinician" else None})
    assert status == 201, ("invite failed", status, invite)
    token, uid, _ = person(name)
    status, data = api("POST", f"/api/invites/{invite['token']}/accept", token)
    assert status == 200, ("accept failed", status, data)
    return token, uid


def test_corrections_keep_the_original():
    owner, _, _ = person("Owner")
    cid = circle(owner)
    status, rec = api("POST", f"/api/circles/{cid}/records", owner, {"kind": "observation", "text": "Gave 2 tablets"})
    assert status == 201
    status, _ = api("POST", f"/api/circles/{cid}/records/{rec['id']}/corrections", owner, {"text": "Gave 1 tablet", "reason": "Misread the label"})
    assert status == 201, f"correction failed: {status}"
    status, records = api("GET", f"/api/circles/{cid}/records", owner)
    fixed = next(r for r in records if r["id"] == rec["id"])
    assert fixed["text"] == "Gave 1 tablet"
    assert fixed["original"]["text"] == "Gave 2 tablets", "the original text was lost"
    assert fixed["corrections"][0]["reason"] == "Misread the label", "the reason was lost"
    assert fixed["corrections"][0]["author_name"] == "Owner", "who corrected it was lost"


test_corrections_keep_the_original()

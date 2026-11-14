"""CareLog care promise: Private notes never reach a paid carer

Family caregivers can mark a note private. A paid carer in the same circle must never see it.
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


def test_private_notes_never_reach_paid_carer():
    owner, _, _ = person("Owner")
    cid = circle(owner)
    secret = "private-worry-" + uuid.uuid4().hex[:8]
    status, _ = api("POST", f"/api/circles/{cid}/records", owner, {"kind": "observation", "text": secret, "is_private": True})
    assert status == 201
    api("POST", f"/api/circles/{cid}/records", owner, {"kind": "observation", "text": "shared note"})
    paid, _ = join(owner, cid, "paid", "Paid carer")
    status, records = api("GET", f"/api/circles/{cid}/records", paid)
    assert status == 200
    assert "shared note" in [r["text"] for r in records], "paid carer should see shared notes"
    assert secret not in str(records), "paid carer can read a private note"
    status, records = api("GET", f"/api/circles/{cid}/records", owner)
    assert secret in [r["text"] for r in records], "the family should still see it"


test_private_notes_never_reach_paid_carer()

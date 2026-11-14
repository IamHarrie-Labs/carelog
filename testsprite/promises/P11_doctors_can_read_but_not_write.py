"""CareLog care promise: A doctor or nurse can read but not change the record

Clinician access is read-only and time-limited.
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


def test_doctors_can_read_but_not_write():
    owner, _, _ = person("Owner")
    cid = circle(owner)
    api("POST", f"/api/circles/{cid}/records", owner, {"kind": "observation", "text": "Dizzy after lunch"})
    doctor, _ = join(owner, cid, "clinician", "Dr Ada")
    status, records = api("GET", f"/api/circles/{cid}/records", doctor)
    assert status == 200 and any(r["text"] == "Dizzy after lunch" for r in records), "clinician should read the record"
    status, _ = api("POST", f"/api/circles/{cid}/records", doctor, {"kind": "observation", "text": "should be refused"})
    assert status == 403, f"clinician was allowed to write: {status}"
    status, _ = api("POST", f"/api/circles/{cid}/items", doctor, {"title": "should be refused"})
    assert status == 403, f"clinician was allowed to add a job: {status}"


test_doctors_can_read_but_not_write()

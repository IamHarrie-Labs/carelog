"""CareLog care promise: A removed caregiver loses access straight away

Membership is re-checked on every request, so a removed person's open sign-in stops working at once.
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


def test_removed_person_loses_access():
    owner, _, _ = person("Owner")
    cid = circle(owner)
    carer, carer_id = join(owner, cid, "caregiver", "Carer")
    assert api("GET", f"/api/circles/{cid}/records", carer)[0] == 200, "caregiver should read before removal"
    status, data = api("DELETE", f"/api/circles/{cid}/members/{carer_id}", owner)
    assert status == 200, ("remove failed", status, data)
    for path in (f"/api/circles/{cid}", f"/api/circles/{cid}/records", f"/api/circles/{cid}/today"):
        status, _ = api("GET", path, carer)
        assert status == 404, f"removed caregiver still reads {path}: {status}"
    status, _ = api("POST", f"/api/circles/{cid}/records", carer, {"kind": "observation", "text": "after removal"})
    assert status == 404, f"removed caregiver can still write: {status}"


test_removed_person_loses_access()

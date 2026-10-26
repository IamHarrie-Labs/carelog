"""CareLog care promise: Outsiders cannot tell whether a circle exists

A stranger gets the same 'not found' for a real circle as for one that does not exist.
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


def test_outsiders_cannot_tell_a_circle_exists():
    owner, _, _ = person("Owner")
    cid = circle(owner)
    stranger, _, _ = person("Stranger")
    real, _ = api("GET", f"/api/circles/{cid}", stranger)
    fake, _ = api("GET", "/api/circles/999999999", stranger)
    assert real == 404, f"stranger got {real} for a real circle (403 would reveal it exists)"
    assert fake == 404, f"unknown circle returned {fake}"
    assert api("GET", f"/api/circles/{cid}/records", None)[0] == 401, "signed-out request must be refused"


test_outsiders_cannot_tell_a_circle_exists()

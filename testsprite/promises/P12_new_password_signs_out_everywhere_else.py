"""CareLog care promise: Changing your password signs out every other browser

If a phone is lost, a new password must end the sessions on it.
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


def test_new_password_signs_out_everywhere_else():
    here, _, email = person("Owner")
    status, data = api("POST", "/api/login", body={"email": email, "password": "promise-pass-123"})
    assert status == 200
    lost_phone = data["token"]
    status, data = api("POST", "/api/me/password", here, {"current": "promise-pass-123", "next": "a-new-pass-456"})
    assert status == 200, (status, data)
    assert api("GET", "/api/me", lost_phone)[0] == 401, "the lost phone is still signed in"
    assert api("GET", "/api/me", here)[0] == 200, "this browser should stay signed in"
    assert api("POST", "/api/login", body={"email": email, "password": "promise-pass-123"})[0] == 401, "the old password still works"


test_new_password_signs_out_everywhere_else()

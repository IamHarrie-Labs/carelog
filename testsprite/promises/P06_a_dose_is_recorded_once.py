"""CareLog care promise: A scheduled dose can only be recorded once

A second 'given' for the same dose is refused and says who already recorded it, so nobody double-doses.
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


def test_a_dose_is_recorded_once():
    owner, _, _ = person("Owner")
    cid = circle(owner)
    carer, _ = join(owner, cid, "caregiver", "Carer")
    status, today = api("GET", f"/api/circles/{cid}/today", owner)
    assert status == 200 and today["items"], "the example schedule should have items"
    item = today["items"][0]["item"]
    dose = {"kind": "administration", "schedule_item_id": item["id"], "scheduled_for": today["date"], "outcome": "given", "text": item["title"]}
    status, _ = api("POST", f"/api/circles/{cid}/records", owner, dose)
    assert status == 201
    status, data = api("POST", f"/api/circles/{cid}/records", carer, dose)
    assert status == 409, f"a second 'given' was accepted: {status}"
    assert data["existing"]["author_name"] == "Owner", f"the refusal should name who recorded it: {data}"


test_a_dose_is_recorded_once()

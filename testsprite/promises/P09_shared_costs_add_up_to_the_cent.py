"""CareLog care promise: Shared costs always add up to the cent

Splitting money must never lose or invent a cent, even when it does not divide evenly.
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


def test_shared_costs_add_up_to_the_cent():
    owner, _, _ = person("Owner")
    cid = circle(owner)
    sam, _ = join(owner, cid, "caregiver", "Sam")
    join(owner, cid, "caregiver", "Jo")
    assert api("POST", f"/api/circles/{cid}/expenses", owner, {"amount": "10.00", "description": "Pharmacy", "currency": "USD"})[0] == 201
    assert api("POST", f"/api/circles/{cid}/expenses", sam, {"amount": "0.01", "description": "Stamp", "currency": "USD"})[0] == 201
    status, summary = api("GET", f"/api/circles/{cid}/expenses/summary", owner)
    assert status == 200, (status, summary)
    usd = summary["USD"]
    assert usd["total_cents"] == 1001
    assert sum(p["share_cents"] for p in usd["people"]) == 1001, "shares do not add up to the total"
    assert sum(p["balance_cents"] for p in usd["people"]) == 0, "balances do not net to zero"
    shares = sorted(p["share_cents"] for p in usd["people"])
    assert shares[-1] - shares[0] <= 1, f"split is uneven by more than a cent: {shares}"


test_shared_costs_add_up_to_the_cent()

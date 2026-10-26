"""CareLog care promise: Reviewing a handoff never ticks off unfinished jobs

Acknowledging means 'I have read this'. Open items stay open until someone records an outcome.
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


def test_reviewing_a_handoff_closes_nothing():
    owner, _, _ = person("Owner")
    cid = circle(owner)
    carer, _ = join(owner, cid, "caregiver", "Carer")
    status, item = api("POST", f"/api/circles/{cid}/items", owner, {"title": "Book Thursday transport"})
    assert status == 201, (status, item)
    status, handoff = api("POST", f"/api/circles/{cid}/handoffs", owner, {"note": "Over to you"})
    assert status == 201, (status, handoff)
    status, _ = api("POST", f"/api/circles/{cid}/handoffs/{handoff['id']}/ack", carer)
    assert status in (200, 201), f"acknowledge failed: {status}"
    status, items = api("GET", f"/api/circles/{cid}/items", carer)
    open_titles = [i["title"] for i in items if not i.get("resolved_at")]
    assert "Book Thursday transport" in open_titles, "acknowledging the handoff closed an open job"


test_reviewing_a_handoff_closes_nothing()

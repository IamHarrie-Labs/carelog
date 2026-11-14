"""CareLog care promise: The emergency link never shows private notes or private documents

Anyone with the link can read it, so only shared information may appear.
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


def test_emergency_link_hides_private_things():
    owner, _, _ = person("Owner")
    cid = circle(owner)
    secret_note = "private-note-" + uuid.uuid4().hex[:8]
    secret_doc = "private-doc-" + uuid.uuid4().hex[:8]
    api("POST", f"/api/circles/{cid}/records", owner, {"kind": "observation", "text": secret_note, "is_private": True})
    api("POST", f"/api/circles/{cid}/documents", owner, {"title": "Allergies", "body": "Penicillin", "is_emergency": True})
    api("POST", f"/api/circles/{cid}/documents", owner, {"title": secret_doc, "body": "will details", "is_emergency": True, "is_private": True})
    status, link = api("POST", f"/api/circles/{cid}/emergency-links", owner, {"hours": 24})
    assert status == 201, (status, link)
    status, packet = api("GET", f"/api/emergency/{link['token']}")
    assert status == 200, (status, packet)
    text = str(packet)
    assert "Penicillin" in text, "shared emergency information is missing"
    assert secret_note not in text, "a private note leaked into the emergency packet"
    assert secret_doc not in text, "a private document leaked into the emergency packet"


test_emergency_link_hides_private_things()

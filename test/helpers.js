import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

export async function setup() {
  const db = await openDb();
  const app = createApp(db, { serveStaticFiles: false });
  const call = async (method, url, body, tok) => {
    const res = await app.request(url, {
      method,
      headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  };
  const user = async (name) => {
    const r = await call('POST', '/api/signup', { email: `${name.toLowerCase()}@example.com`, name, password: 'password123' });
    return { id: r.body.user.id, token: r.body.token, name };
  };
  // Sam owns the circle; everyone else joins through real invites.
  const circleWith = async (roles = { Alex: 'caregiver' }) => {
    const sam = await user('Sam');
    const c = await call('POST', '/api/circles', { name: 'Dad care', recipient_name: 'Dad', timezone: 'UTC', apply_template: true }, sam.token);
    const cid = c.body.id;
    const others = {};
    for (const [name, role] of Object.entries(roles)) {
      const u = await user(name);
      const inv = await call('POST', `/api/circles/${cid}/invites`, { role, access_hours: role === 'clinician' ? 24 : undefined }, sam.token);
      await call('POST', `/api/invites/${inv.body.token}/accept`, null, u.token);
      others[name] = u;
    }
    return { sam, cid, ...others };
  };
  return { db, app, call, user, circleWith };
}

// Seeds a synthetic demo circle so judges and the TestSprite suite have something real to open.
// All names and data are made up. Safe to re-run: it skips anything that already exists.
import { openDb } from './db.js';
import { createApp } from './app.js';

const PASSWORD = process.env.DEMO_PASSWORD || 'carelog-demo-2026';
const db = await openDb({ url: process.env.TURSO_DATABASE_URL || 'file:carelog.db', authToken: process.env.TURSO_AUTH_TOKEN });
const app = createApp(db, { serveStaticFiles: false });

const call = async (method, url, body, tok) => {
  const res = await app.request(url, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const login = async (email, name) => {
  let r = await call('POST', '/api/login', { email, password: PASSWORD });
  if (r.status !== 200) r = await call('POST', '/api/signup', { email, name, password: PASSWORD });
  return { token: r.body.token, id: r.body.user.id };
};

const sam = await login('sam@demo.carelog.test', 'Sam');
const existing = await call('GET', '/api/me', null, sam.token);
if (existing.body.circles.some((c) => c.name === 'Demo: Margaret at home')) {
  console.log('Demo already seeded.');
  process.exit(0);
}
const alex = await login('alex@demo.carelog.test', 'Alex');
const circle = (await call('POST', '/api/circles', { name: 'Demo: Margaret at home', recipient_name: 'Margaret', kind: 'adult', timezone: 'UTC', apply_template: true }, sam.token)).body;
const inv = await call('POST', `/api/circles/${circle.id}/invites`, { role: 'caregiver' }, sam.token);
await call('POST', `/api/invites/${inv.body.token}/accept`, null, alex.token);
const base = `/api/circles/${circle.id}`;
await call('POST', `${base}/documents`, { title: 'Allergies', category: 'allergies', body: 'Penicillin (demo data)', is_emergency: true }, sam.token);
await call('POST', `${base}/items`, { title: 'Book Thursday transport to the clinic' }, sam.token);
await call('POST', `${base}/records`, { kind: 'observation', text: 'Said she felt a little dizzy after lunch' }, sam.token);
await call('POST', `${base}/supplies`, { name: 'Blood pressure tablets (demo)', remaining: 9, per_day: 2 }, sam.token);
console.log(`Seeded. Demo logins: sam@demo.carelog.test / alex@demo.carelog.test, password: ${PASSWORD}`);

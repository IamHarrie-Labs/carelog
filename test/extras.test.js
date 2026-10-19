import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

test('emergency link: shows the packet with no sign-in, hides private notes, expires, and can be revoked', async () => {
  const { call, circleWith, db } = await setup();
  const { sam, cid } = await circleWith();
  await call('POST', `/api/circles/${cid}/documents`, { title: 'Allergies', body: 'Penicillin', is_emergency: true }, sam.token);
  await call('POST', `/api/circles/${cid}/documents`, { title: 'Will', body: 'secret details', is_emergency: true, is_private: true }, sam.token);
  await call('POST', `/api/circles/${cid}/records`, { kind: 'observation', text: 'Private worry', is_private: true }, sam.token);
  await call('POST', `/api/circles/${cid}/records`, { kind: 'observation', text: 'Ate well today' }, sam.token);
  const link = await call('POST', `/api/circles/${cid}/emergency-links`, { hours: 24 }, sam.token);
  assert.equal(link.status, 201);
  const open = await call('GET', `/api/emergency/${link.body.token}`);
  assert.equal(open.status, 200);
  assert.equal(open.body.recipient, 'Dad');
  assert.equal(open.body.documents[0].body, 'Penicillin');
  const text = JSON.stringify(open.body);
  assert.doesNotMatch(text, /Private worry|secret details/);
  assert.match(text, /Ate well/);
  // read-only: no write methods exist on the public route
  assert.notEqual((await call('POST', `/api/emergency/${link.body.token}`, {})).status, 200);
  await db.prepare('UPDATE emergency_links SET expires_at = ? WHERE token = ?').run(new Date(Date.now() - 1000).toISOString(), link.body.token);
  assert.equal((await call('GET', `/api/emergency/${link.body.token}`)).body.error, 'link_expired');
  const link2 = await call('POST', `/api/circles/${cid}/emergency-links`, {}, sam.token);
  assert.equal((await call('GET', `/api/emergency/${link2.body.token}`)).status, 200);
  await call('DELETE', `/api/circles/${cid}/emergency-links/${link2.body.token}`, null, sam.token);
  assert.equal((await call('GET', `/api/emergency/${link2.body.token}`)).body.error, 'link_revoked');
  assert.equal((await call('GET', '/api/emergency/nope')).status, 404);
});

test('neighbours can log a visit and view the emergency card, but nothing else', async () => {
  const { call, circleWith } = await setup({ Neil: 'neighbour' });
  const { sam, Neil, cid } = await circleWith({ Neil: 'neighbour' });
  assert.equal((await call('POST', `/api/circles/${cid}/records`, { kind: 'visit', text: 'Popped in, all fine' }, Neil.token)).status, 201);
  assert.equal((await call('POST', `/api/circles/${cid}/records`, { kind: 'observation', text: 'x' }, Neil.token)).status, 403);
  assert.equal((await call('GET', `/api/circles/${cid}/records`, null, Neil.token)).status, 403);
  assert.equal((await call('GET', `/api/circles/${cid}/emergency-card`, null, Neil.token)).status, 200);
  assert.equal((await call('GET', `/api/circles/${cid}/expenses`, null, Neil.token)).status, 403);
  assert.equal(sam.id > 0, true);
});

test('expenses split equally in whole cents and balances add up to zero', async () => {
  const { call, circleWith } = await setup({ Alex: 'caregiver', Jo: 'caregiver' });
  const { sam, Alex, cid } = await circleWith({ Alex: 'caregiver', Jo: 'caregiver' });
  await call('POST', `/api/circles/${cid}/expenses`, { amount: 100, description: 'Prescription' }, sam.token);
  await call('POST', `/api/circles/${cid}/expenses`, { amount: 20.01, description: 'Taxi' }, Alex.token);
  const s = await call('GET', `/api/circles/${cid}/expenses/summary`, null, sam.token);
  const usd = s.body.USD;
  assert.equal(usd.total_cents, 12001);
  assert.equal(usd.people.reduce((a, p) => a + p.share_cents, 0), 12001);
  assert.equal(usd.people.reduce((a, p) => a + p.balance_cents, 0), 0);
  assert.equal((await call('POST', `/api/circles/${cid}/expenses`, { amount: -5, description: 'x' }, sam.token)).body.error, 'invalid_amount');
});

test('paid carers and clinicians cannot see money', async () => {
  const { call, circleWith } = await setup({ Nina: 'paid', Dr: 'clinician' });
  const { cid, Nina, Dr } = await circleWith({ Nina: 'paid', Dr: 'clinician' });
  assert.equal((await call('GET', `/api/circles/${cid}/expenses`, null, Nina.token)).status, 403);
  assert.equal((await call('GET', `/api/circles/${cid}/expenses/summary`, null, Dr.token)).status, 403);
});

test('care load flags one person carrying most of the hours', async () => {
  const { call, circleWith } = await setup();
  const { sam, Alex, cid } = await circleWith();
  const d = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  await call('POST', `/api/circles/${cid}/shifts`, { starts_at: d(30), ends_at: d(10) }, sam.token);
  await call('POST', `/api/circles/${cid}/shifts`, { starts_at: d(8), ends_at: d(6) }, Alex.token);
  const l = await call('GET', `/api/circles/${cid}/load`, null, Alex.token);
  assert.equal(l.body.imbalance.name, 'Sam');
  assert.ok(l.body.imbalance.share > 60);
  const bad = await call('POST', `/api/circles/${cid}/shifts`, { starts_at: d(1), ends_at: d(5) }, sam.token);
  assert.equal(bad.body.error, 'invalid_shift_times');
});

test('caregiver check-ins are private to their author', async () => {
  const { call, circleWith } = await setup();
  const { sam, Alex, cid } = await circleWith();
  for (let i = 0; i < 3; i++) await call('POST', `/api/circles/${cid}/checkins`, { mood: 2, text: 'tired' }, sam.token);
  assert.equal((await call('GET', `/api/circles/${cid}/checkins`, null, Alex.token)).body.length, 0);
  assert.equal((await call('GET', `/api/circles/${cid}/checkins`, null, sam.token)).body.length, 3);
  assert.equal((await call('GET', `/api/circles/${cid}/load`, null, sam.token)).body.check_in_suggested, true);
  assert.equal((await call('GET', `/api/circles/${cid}/load`, null, Alex.token)).body.check_in_suggested, false);
  assert.equal((await call('POST', `/api/circles/${cid}/checkins`, { mood: 9 }, sam.token)).status, 400);
});

test('an appointment nobody is taking becomes an open item, and assigning someone closes it', async () => {
  const { call, circleWith } = await setup();
  const { sam, Alex, cid } = await circleWith();
  const a = await call('POST', `/api/circles/${cid}/appointments`, { title: 'Cardiology', starts_at: new Date(Date.now() + 5 * 86400e3).toISOString() }, sam.token);
  let items = await call('GET', `/api/circles/${cid}/items`, null, sam.token);
  assert.match(items.body[0].title, /Cardiology/);
  await call('PATCH', `/api/circles/${cid}/appointments/${a.body.id}`, { taker_id: Alex.id }, sam.token);
  items = await call('GET', `/api/circles/${cid}/items`, null, sam.token);
  assert.equal(items.body.length, 0);
  const ics = await call('GET', `/api/circles/${cid}/calendar.ics`, null, sam.token);
  assert.match(ics.body, /BEGIN:VEVENT[\s\S]*SUMMARY:Cardiology/);
});

test('low supplies open a refill item once; restocking closes it', async () => {
  const { call, circleWith } = await setup();
  const { sam, cid } = await circleWith();
  const s = await call('POST', `/api/circles/${cid}/supplies`, { name: 'Metformin', remaining: 8, per_day: 2 }, sam.token);
  await call('PATCH', `/api/circles/${cid}/supplies/${s.body.id}`, { remaining: 6 }, sam.token);
  let items = await call('GET', `/api/circles/${cid}/items`, null, sam.token);
  assert.equal(items.body.filter((i) => /Refill Metformin/.test(i.title)).length, 1);
  await call('PATCH', `/api/circles/${cid}/supplies/${s.body.id}`, { remaining: 60 }, sam.token);
  items = await call('GET', `/api/circles/${cid}/items`, null, sam.token);
  assert.equal(items.body.length, 0);
});

test('device events are logged as observations or incidents, never as proof a dose was given', async () => {
  const { call, circleWith } = await setup();
  const { sam, cid } = await circleWith();
  const dev = await call('POST', `/api/circles/${cid}/devices`, { name: 'Pill box' }, sam.token);
  const open = await call('POST', dev.body.ingest_path, { event: 'pill_dispenser_opened' });
  assert.equal(open.status, 201);
  assert.equal(open.body.kind, 'observation');
  assert.equal(open.body.author_name, 'Pill box');
  const fall = await call('POST', dev.body.ingest_path, { event: 'fall_detected' });
  assert.equal(fall.body.kind, 'incident');
  assert.equal((await call('POST', '/api/ingest/dev_wrong', { event: 'x' })).status, 401);
  const today = await call('GET', `/api/circles/${cid}/today`, null, sam.token);
  assert.ok(today.body.items.every((i) => i.record === null));
});

test('patterns point at repeated words without diagnosing', async () => {
  const { call, circleWith } = await setup();
  const { sam, cid } = await circleWith();
  for (let i = 0; i < 3; i++) {
    await call('POST', `/api/circles/${cid}/records`, { kind: 'observation', text: 'Felt dizzy after lunch', reported_at: new Date(Date.now() - i * 86400e3 - 600e3).toISOString() }, sam.token);
  }
  const p = await call('GET', `/api/circles/${cid}/patterns`, null, sam.token);
  const hit = p.body.patterns.find((x) => x.term === 'dizzy');
  assert.equal(hit.count, 3);
  assert.match(hit.message, /mention this to Dad's doctor/);
  assert.match(p.body.disclaimer, /not a diagnosis/i);
});

test('digest summarises the period from stored records', async () => {
  const { call, circleWith } = await setup();
  const { sam, cid } = await circleWith();
  await call('POST', `/api/circles/${cid}/records`, { kind: 'incident', text: 'Slipped, no injury' }, sam.token);
  await call('POST', `/api/circles/${cid}/items`, { title: 'Call GP' }, sam.token);
  const d = await call('GET', `/api/circles/${cid}/digest`, null, sam.token);
  assert.equal(d.body.counts.incident, 1);
  assert.equal(d.body.open_items, 1);
  assert.ok(d.body.summary.some((l) => /1 incident/.test(l)));
});

test('translation says plainly when it is unavailable instead of faking it', async () => {
  const { call, circleWith } = await setup();
  const { sam, cid } = await circleWith();
  delete process.env.ANTHROPIC_API_KEY;
  const r = await call('POST', `/api/circles/${cid}/translate`, { text: 'Dad ate well', lang: 'es' }, sam.token);
  assert.equal(r.status, 503);
  assert.equal(r.body.error, 'translation_unavailable');
});

test('templates give a starting schedule for different kinds of care', async () => {
  const { call, user } = await setup();
  const t = await call('GET', '/api/templates');
  assert.ok(Object.keys(t.body).includes('newborn') && Object.keys(t.body).includes('pet'));
  const sam = await user('Sam');
  const c = await call('POST', '/api/circles', { name: 'Rex', recipient_name: 'Rex', kind: 'pet', apply_template: true }, sam.token);
  const sched = await call('GET', `/api/circles/${c.body.id}/schedule`, null, sam.token);
  assert.ok(sched.body.some((s) => s.title === 'Dinner'));
});

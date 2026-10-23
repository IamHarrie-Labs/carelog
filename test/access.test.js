import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

test('removing a caregiver blocks their still-valid session immediately, on reads and writes', async () => {
  const { call, circleWith } = await setup();
  const { sam, Alex, cid } = await circleWith();
  assert.equal((await call('GET', `/api/circles/${cid}/records`, null, Alex.token)).status, 200);
  const rm = await call('DELETE', `/api/circles/${cid}/members/${Alex.id}`, null, sam.token);
  assert.equal(rm.status, 200);
  assert.equal((await call('GET', `/api/circles/${cid}/records`, null, Alex.token)).status, 404);
  assert.equal((await call('POST', `/api/circles/${cid}/records`, { kind: 'observation', text: 'x' }, Alex.token)).status, 404);
  assert.equal((await call('GET', `/api/circles/${cid}/export`, null, Alex.token)).status, 404);
});

test('people outside a circle cannot see it, and cannot tell whether it exists', async () => {
  const { call, circleWith, user } = await setup();
  const { cid } = await circleWith();
  const eve = await user('Eve');
  assert.equal((await call('GET', `/api/circles/${cid}/records`, null, eve.token)).status, 404);
  assert.equal((await call('GET', '/api/circles/9999/records', null, eve.token)).status, 404);
  assert.equal((await call('GET', `/api/circles/${cid}/records`)).status, 401);
});

test('only owners manage members; the owner cannot be removed', async () => {
  const { call, circleWith } = await setup();
  const { sam, Alex, cid } = await circleWith();
  assert.equal((await call('POST', `/api/circles/${cid}/invites`, { role: 'caregiver' }, Alex.token)).status, 403);
  assert.equal((await call('DELETE', `/api/circles/${cid}/members/${sam.id}`, null, Alex.token)).status, 403);
  assert.equal((await call('DELETE', `/api/circles/${cid}/members/${sam.id}`, null, sam.token)).body.error, 'cannot_remove_owner');
});

test('invites work once, expire, and cannot create owners', async () => {
  const { call, circleWith, user, db } = await setup();
  const { sam, cid } = await circleWith({});
  assert.equal((await call('POST', `/api/circles/${cid}/invites`, { role: 'owner' }, sam.token)).status, 400);
  const inv = await call('POST', `/api/circles/${cid}/invites`, { role: 'caregiver' }, sam.token);
  assert.match(inv.body.token, /^[2-9a-hjkmnp-z]{26}$/, 'invite links avoid look-alike characters');
  const jo = await user('Jo');
  const kim = await user('Kim');
  assert.equal((await call('POST', `/api/invites/${inv.body.token}/accept`, null, jo.token)).status, 200);
  assert.equal((await call('POST', `/api/invites/${inv.body.token}/accept`, null, kim.token)).body.error, 'invite_used');
  const old = await call('POST', `/api/circles/${cid}/invites`, { role: 'caregiver' }, sam.token);
  await db.prepare('UPDATE invites SET expires_at = ? WHERE token = ?').run(new Date(Date.now() - 1000).toISOString(), old.body.token);
  assert.equal((await call('POST', `/api/invites/${old.body.token}/accept`, null, kim.token)).body.error, 'invite_expired');
});

test('two people racing to accept one invite: exactly one gets in', async () => {
  const { call, circleWith, user } = await setup();
  const { sam, cid } = await circleWith({});
  const inv = await call('POST', `/api/circles/${cid}/invites`, { role: 'caregiver' }, sam.token);
  const a = await user('Jo');
  const b = await user('Kim');
  const rs = await Promise.all([
    call('POST', `/api/invites/${inv.body.token}/accept`, null, a.token),
    call('POST', `/api/invites/${inv.body.token}/accept`, null, b.token),
  ]);
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 410]);
});

test('clinician access is read-only and expires on its own', async () => {
  const { call, circleWith, db } = await setup();
  const { cid, Dr } = await circleWith({ Dr: 'clinician' });
  assert.equal((await call('GET', `/api/circles/${cid}/records`, null, Dr.token)).status, 200);
  assert.equal((await call('POST', `/api/circles/${cid}/records`, { kind: 'observation', text: 'x' }, Dr.token)).status, 403);
  await db.prepare('UPDATE members SET expires_at = ? WHERE user_id = ?').run(new Date(Date.now() - 1000).toISOString(), Dr.id);
  assert.equal((await call('GET', `/api/circles/${cid}/records`, null, Dr.token)).status, 404);
});

test('private entries are hidden from roles that cannot see them, including in a doctor export', async () => {
  const { call, circleWith } = await setup();
  const { sam, cid, Dr, Nina } = await circleWith({ Dr: 'clinician', Nina: 'paid' });
  await call('POST', `/api/circles/${cid}/records`, { kind: 'observation', text: 'Family-only worry about money', is_private: true }, sam.token);
  await call('POST', `/api/circles/${cid}/records`, { kind: 'observation', text: 'Normal note' }, sam.token);
  for (const t of [Dr.token, Nina.token]) {
    const list = await call('GET', `/api/circles/${cid}/records`, null, t);
    assert.equal(list.body.length, 1);
  }
  const ex = await call('GET', `/api/circles/${cid}/export`, null, Dr.token);
  assert.doesNotMatch(JSON.stringify(ex.body), /money/);
  const cannot = await call('POST', `/api/circles/${cid}/records`, { kind: 'observation', text: 'x', is_private: true }, Nina.token);
  assert.equal(cannot.body.error, 'cannot_write_private');
});

test('passwords are hashed and bad logins are rejected', async () => {
  const { call, db } = await setup();
  await call('POST', '/api/signup', { email: 'z@example.com', name: 'Z', password: 'password123' });
  const row = await db.prepare('SELECT pass_hash FROM users WHERE email = ?').get('z@example.com');
  assert.notEqual(row.pass_hash, 'password123');
  assert.equal((await call('POST', '/api/login', { email: 'z@example.com', password: 'wrong' })).status, 401);
  assert.equal((await call('POST', '/api/login', { email: 'z@example.com', password: 'password123' })).status, 200);
  assert.equal((await call('POST', '/api/signup', { email: 'z@example.com', name: 'Z', password: 'password123' })).status, 409);
  assert.equal((await call('POST', '/api/signup', { email: 'q@example.com', name: 'Q', password: 'short' })).body.error, 'password_too_short');
});

test('signing out ends only that session; the same person stays signed in elsewhere', async () => {
  const { call } = await setup();
  const first = await call('POST', '/api/signup', { email: 'dev@example.com', name: 'Dev', password: 'password123' });
  const second = await call('POST', '/api/login', { email: 'dev@example.com', password: 'password123' });
  assert.notEqual(first.body.token, second.body.token);
  assert.equal((await call('GET', '/api/me', null, first.body.token)).status, 200);
  assert.equal((await call('POST', '/api/logout', null, first.body.token)).status, 200);
  assert.equal((await call('GET', '/api/me', null, first.body.token)).status, 401);
  assert.equal((await call('GET', '/api/me', null, second.body.token)).status, 200);
});

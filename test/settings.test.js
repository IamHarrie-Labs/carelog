import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

test('settings: change your name, change your password, and sign out of other devices', async () => {
  const { call, user } = await setup();
  const sam = await user('Sam');
  const renamed = await call('PATCH', '/api/me', { name: 'Samuel Ade' }, sam.token);
  assert.equal(renamed.body.user.name, 'Samuel Ade');
  assert.equal((await call('PATCH', '/api/me', { name: '   ' }, sam.token)).status, 400);

  // A second device, then a wrong and a right password change.
  const phone = (await call('POST', '/api/login', { email: 'sam@example.com', password: 'password123' })).body.token;
  assert.equal((await call('GET', '/api/me/sessions', null, sam.token)).body.other_sessions, 1);
  assert.equal((await call('POST', '/api/me/password', { current: 'nope', next: 'newpassword1' }, sam.token)).status, 400);
  assert.equal((await call('POST', '/api/me/password', { current: 'password123', next: 'short' }, sam.token)).status, 400);
  const changed = await call('POST', '/api/me/password', { current: 'password123', next: 'newpassword1' }, sam.token);
  assert.equal(changed.body.other_sessions_ended, 1);
  assert.equal((await call('GET', '/api/me', null, phone)).status, 401, 'the other device is signed out');
  assert.equal((await call('GET', '/api/me', null, sam.token)).status, 200, 'this device stays signed in');
  assert.equal((await call('POST', '/api/login', { email: 'sam@example.com', password: 'password123' })).status, 401);
  const tablet = (await call('POST', '/api/login', { email: 'sam@example.com', password: 'newpassword1' })).body.token;

  const out = await call('POST', '/api/me/sign-out-others', null, sam.token);
  assert.equal(out.body.ended, 1);
  assert.equal((await call('GET', '/api/me', null, tablet)).status, 401);
  assert.equal((await call('GET', '/api/me', null, sam.token)).status, 200);
});

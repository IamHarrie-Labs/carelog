import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

const admin = (extra = {}) => ({ kind: 'administration', schedule_item_id: 1, text: 'given', ...extra });

test('a scheduled item can be completed only once; the second caller gets the existing record', async () => {
  const { call, circleWith } = await setup();
  const { sam, Alex, cid } = await circleWith();
  const first = await call('POST', `/api/circles/${cid}/records`, admin(), sam.token);
  assert.equal(first.status, 201);
  const second = await call('POST', `/api/circles/${cid}/records`, admin(), Alex.token);
  assert.equal(second.status, 409);
  assert.equal(second.body.error, 'already_recorded');
  assert.equal(second.body.existing.author_name, 'Sam');
});

test('concurrent submissions create exactly one normal completion', async () => {
  const { call, circleWith, db } = await setup();
  const { sam, Alex, cid } = await circleWith();
  const results = await Promise.all([
    call('POST', `/api/circles/${cid}/records`, admin({ text: 'a' }), sam.token),
    call('POST', `/api/circles/${cid}/records`, admin({ text: 'b' }), Alex.token),
    call('POST', `/api/circles/${cid}/records`, admin({ text: 'c' }), sam.token),
    call('POST', `/api/circles/${cid}/records`, admin({ text: 'd' }), Alex.token),
  ]);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 3);
  const n = await db.prepare('SELECT COUNT(*) AS n FROM records WHERE schedule_item_id = 1 AND is_exception = 0').get();
  assert.equal(n.n, 1);
});

test('a real second administration can be reported truthfully as an exception, with an explanation', async () => {
  const { call, circleWith } = await setup();
  const { sam, Alex, cid } = await circleWith();
  await call('POST', `/api/circles/${cid}/records`, admin(), sam.token);
  const bare = await call('POST', `/api/circles/${cid}/records`, { kind: 'administration', schedule_item_id: 1, exception: true }, Alex.token);
  assert.equal(bare.status, 400);
  assert.equal(bare.body.error, 'exception_needs_explanation');
  const ok = await call('POST', `/api/circles/${cid}/records`, admin({ exception: true, text: 'I also gave it before seeing the app' }), Alex.token);
  assert.equal(ok.status, 201);
  assert.equal(ok.body.is_exception, true);
  const today = await call('GET', `/api/circles/${cid}/today`, null, sam.token);
  const row = today.body.items.find((i) => i.item.id === 1);
  assert.equal(row.record.author_name, 'Sam');
  assert.equal(row.additional.length, 1);
});

test('a passed scheduled time with nothing recorded says "no administration recorded", never "missed"', async () => {
  const { call, circleWith } = await setup();
  const { sam, cid } = await circleWith();
  const r = await call('GET', `/api/circles/${cid}/today?date=2000-01-01`, null, sam.token);
  assert.ok(r.body.items.every((i) => i.status === 'no_record'));
  assert.match(r.body.items[0].label, /no administration recorded/i);
  assert.doesNotMatch(JSON.stringify(r.body), /missed/i);
});

test('corrections keep the original, the author and the reason', async () => {
  const { call, circleWith } = await setup();
  const { sam, Alex, cid } = await circleWith();
  const rec = await call('POST', `/api/circles/${cid}/records`, { kind: 'observation', text: 'Ate lunch at 1pm' }, sam.token);
  const noReason = await call('POST', `/api/circles/${cid}/records/${rec.body.id}/corrections`, { text: 'x' }, Alex.token);
  assert.equal(noReason.status, 400);
  const fixed = await call('POST', `/api/circles/${cid}/records/${rec.body.id}/corrections`, { text: 'Ate lunch at 2pm', reason: 'Sam mistyped the time' }, Alex.token);
  assert.equal(fixed.status, 201);
  assert.equal(fixed.body.text, 'Ate lunch at 2pm');
  assert.equal(fixed.body.original.text, 'Ate lunch at 1pm');
  assert.equal(fixed.body.corrections[0].author_name, 'Alex');
  assert.equal(fixed.body.corrections[0].reason, 'Sam mistyped the time');
});

test('reported time and entered time are stored separately; future times are rejected', async () => {
  const { call, circleWith } = await setup();
  const { sam, cid } = await circleWith();
  const past = new Date(Date.now() - 3 * 3600e3).toISOString();
  const r = await call('POST', `/api/circles/${cid}/records`, { kind: 'observation', text: 'Logged late', reported_at: past }, sam.token);
  assert.equal(r.status, 201);
  assert.equal(r.body.reported_at, past);
  assert.ok(r.body.entered_at > past);
  const future = await call('POST', `/api/circles/${cid}/records`, { kind: 'observation', text: 'x', reported_at: new Date(Date.now() + 86400e3).toISOString() }, sam.token);
  assert.equal(future.body.error, 'reported_in_future');
});

test('quick log turns one line of text into the right record, and does not double-record', async () => {
  const { call, circleWith } = await setup();
  const { sam, cid } = await circleWith();
  const dry = await call('POST', `/api/circles/${cid}/quicklog`, { text: 'gave Dad his morning medication at 8am', dry_run: true }, sam.token);
  assert.equal(dry.body.parsed.kind, 'administration');
  assert.equal(dry.body.parsed.matched, 'Morning medication');
  const a = await call('POST', `/api/circles/${cid}/quicklog`, { text: 'gave Dad his morning medication at 8am' }, sam.token);
  assert.equal(a.status, 201);
  const b = await call('POST', `/api/circles/${cid}/quicklog`, { text: 'gave Dad his morning medication' }, sam.token);
  assert.equal(b.status, 409);
  const fall = await call('POST', `/api/circles/${cid}/quicklog`, { text: 'Dad fell in the bathroom, no injury' }, sam.token);
  assert.equal(fall.body.record.kind, 'incident');
});

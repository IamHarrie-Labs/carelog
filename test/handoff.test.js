import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

const rec = (call, cid, tok, body) => call('POST', `/api/circles/${cid}/records`, body, tok);

test('a handoff lists what Sam recorded and carries open items forward', async () => {
  const { call, circleWith } = await setup();
  const { sam, Alex, cid } = await circleWith();
  await rec(call, cid, sam.token, { kind: 'administration', schedule_item_id: 1, text: 'given' });
  await rec(call, cid, sam.token, { kind: 'observation', text: 'Seemed dizzy after lunch' });
  await call('POST', `/api/circles/${cid}/items`, { title: 'Book Thursday transport' }, sam.token);
  const h = await call('POST', `/api/circles/${cid}/handoffs`, { to_user: Alex.id, note: 'Quiet day' }, sam.token);
  assert.equal(h.status, 201);
  assert.equal(h.body.records.length, 2);
  assert.equal(h.body.open_items[0].title, 'Book Thursday transport');
  assert.equal(h.body.from.name, 'Sam');
  assert.equal(h.body.acknowledged_by_you, false);
});

test('acknowledging a handoff never completes open items', async () => {
  const { call, circleWith } = await setup();
  const { sam, Alex, cid } = await circleWith();
  await call('POST', `/api/circles/${cid}/items`, { title: 'Confirm transport' }, sam.token);
  const h = await call('POST', `/api/circles/${cid}/handoffs`, { to_user: Alex.id }, sam.token);
  const ack = await call('POST', `/api/circles/${cid}/handoffs/${h.body.id}/ack`, null, Alex.token);
  assert.equal(ack.status, 201);
  assert.equal(ack.body.acknowledged_by_you, true);
  assert.equal(ack.body.open_items.length, 1);
  const items = await call('GET', `/api/circles/${cid}/items`, null, Alex.token);
  assert.equal(items.body.length, 1);
});

test('open items persist across every handoff until someone records an outcome', async () => {
  const { call, circleWith } = await setup();
  const { sam, Alex, cid } = await circleWith();
  const item = await call('POST', `/api/circles/${cid}/items`, { title: 'Refill prescription' }, sam.token);
  const h1 = await call('POST', `/api/circles/${cid}/handoffs`, { to_user: Alex.id }, sam.token);
  await call('POST', `/api/circles/${cid}/handoffs/${h1.body.id}/ack`, null, Alex.token);
  const h2 = await call('POST', `/api/circles/${cid}/handoffs`, { to_user: Sam_id(sam) }, Alex.token);
  assert.equal(h2.body.open_items.length, 1);
  const noOutcome = await call('POST', `/api/circles/${cid}/items/${item.body.id}/resolve`, {}, Alex.token);
  assert.equal(noOutcome.body.error, 'outcome_required');
  await call('POST', `/api/circles/${cid}/items/${item.body.id}/resolve`, { outcome: 'Picked up from pharmacy' }, Alex.token);
  const h3 = await call('POST', `/api/circles/${cid}/handoffs`, { to_user: Sam_id(sam) }, Alex.token);
  assert.equal(h3.body.open_items.length, 0);
});

function Sam_id(sam) { return sam.id; }

test('a correction made after review is flagged "updated since you reviewed"', async () => {
  const { call, circleWith } = await setup();
  const { sam, Alex, cid } = await circleWith();
  const r = await rec(call, cid, sam.token, { kind: 'observation', text: 'BP 120/80' });
  const h = await call('POST', `/api/circles/${cid}/handoffs`, { to_user: Alex.id }, sam.token);
  await call('POST', `/api/circles/${cid}/handoffs/${h.body.id}/ack`, null, Alex.token);
  await new Promise((res) => setTimeout(res, 5));
  await call('POST', `/api/circles/${cid}/records/${r.body.id}/corrections`, { text: 'BP 140/90', reason: 'Misread the cuff' }, sam.token);
  const view = await call('GET', `/api/circles/${cid}/handoffs/${h.body.id}`, null, Alex.token);
  const entry = view.body.records.find((e) => e.id === r.body.id);
  assert.equal(entry.updated_since_you_reviewed, true);
  assert.equal(view.body.needs_attention, true);
  assert.equal(entry.text, 'BP 140/90');
  assert.equal(entry.original.text, 'BP 120/80');
});

test('the author cannot acknowledge their own handoff, and nobody else can acknowledge one addressed to someone', async () => {
  const { call, circleWith } = await setup({ Alex: 'caregiver', Jo: 'caregiver' });
  const { sam, Alex, Jo, cid } = await circleWith({ Alex: 'caregiver', Jo: 'caregiver' });
  const h = await call('POST', `/api/circles/${cid}/handoffs`, { to_user: Alex.id }, sam.token);
  assert.equal((await call('POST', `/api/circles/${cid}/handoffs/${h.body.id}/ack`, null, sam.token)).body.error, 'author_cannot_acknowledge');
  assert.equal((await call('POST', `/api/circles/${cid}/handoffs/${h.body.id}/ack`, null, Jo.token)).status, 403);
  assert.equal((await call('POST', `/api/circles/${cid}/handoffs/${h.body.id}/ack`, null, Alex.token)).status, 201);
  assert.equal((await call('POST', `/api/circles/${cid}/handoffs/${h.body.id}/ack`, null, Alex.token)).status, 200);
});

test('a scheduled time with nothing recorded appears in the handoff as unrecorded, not as missed', async () => {
  const { call, circleWith, db } = await setup();
  const { sam, Alex, cid } = await circleWith();
  await db.prepare("UPDATE schedule_items SET time_of_day = '00:00' WHERE id = 1").run();
  const h = await call('POST', `/api/circles/${cid}/handoffs`, { to_user: Alex.id }, sam.token);
  assert.ok(h.body.no_record.some((m) => m.schedule_item_id === 1));
  const n = await call('GET', `/api/circles/${cid}/handoffs/${h.body.id}/narrative`, null, Alex.token);
  assert.match(JSON.stringify(n.body), /no administration recorded/i);
  assert.doesNotMatch(JSON.stringify(n.body), /missed/i);
  assert.ok(n.body.lines.every((l) => l.source?.type));
});

test('private entries never appear in a handoff viewed by a paid carer', async () => {
  const { call, circleWith } = await setup({ Nina: 'paid' });
  const { sam, Nina, cid } = await circleWith({ Nina: 'paid' });
  await rec(call, cid, sam.token, { kind: 'observation', text: 'Private family matter', is_private: true });
  const h = await call('POST', `/api/circles/${cid}/handoffs`, { to_user: Nina.id }, sam.token);
  const view = await call('GET', `/api/circles/${cid}/handoffs/${h.body.id}`, null, Nina.token);
  assert.doesNotMatch(JSON.stringify(view.body), /Private family/);
});

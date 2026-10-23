import crypto from 'node:crypto';
import { HttpError, now, clean, localParts } from './lib.js';
import { circleCtx, serializeRecords, visibleRecords, dayView, activeMembers } from './core.js';
import { draftNarrative } from './narrative.js';

// Everything a handoff shows is computed from stored records. Each record is pinned at the
// version (number of corrections) it had when the handoff was prepared, so "updated since you
// reviewed" is an exact comparison, not a guess.
async function buildSnapshot(db, circle, role, sinceIso) {
  const records = await visibleRecords(db, circle.id, role, { since: sinceIso, limit: 500 });
  const local = localParts(new Date(), circle.timezone);
  const today = await dayView(db, circle, local.date);
  const noRecord = today.filter((d) => d.status === 'no_record').map((d) => ({
    schedule_item_id: d.item.id, title: d.item.title, time_of_day: d.item.time_of_day, date: d.date,
  }));
  return {
    since: sinceIso,
    records: records.map((r) => ({ id: r.id, version: r.corrections.length })),
    no_record: noRecord,
  };
}

const digest = (snap) => crypto.createHash('sha256').update(JSON.stringify(snap)).digest('hex').slice(0, 16);

async function loadHandoff(db, circle, role, id, viewerId) {
  const h = await db.prepare('SELECT * FROM handoffs WHERE id = ? AND circle_id = ?').get(id, circle.id);
  if (!h) throw new HttpError(404, 'handoff_not_found');
  const snap = JSON.parse(h.snapshot);
  const from = await db.prepare('SELECT id, name FROM users WHERE id = ?').get(h.from_user);
  const to = h.to_user ? await db.prepare('SELECT id, name FROM users WHERE id = ?').get(h.to_user) : null;
  const acks = await db.prepare('SELECT a.user_id, u.name, a.acked_at FROM handoff_acks a JOIN users u ON u.id = a.user_id WHERE a.handoff_id = ? ORDER BY a.acked_at').all(h.id);
  const myAck = acks.find((a) => a.user_id === viewerId);

  const entries = [];
  const refIds = snap.records.map((ref) => ref.id);
  const rows = refIds.length ? await db.prepare(`SELECT * FROM records WHERE id IN (${refIds.map(() => '?').join(',')})`).all(...refIds) : [];
  const visible = rows.filter((row) => !(row.is_private && role !== 'owner' && role !== 'caregiver'));
  const serialized = new Map((await serializeRecords(db, visible)).map((rec) => [rec.id, rec]));
  for (const ref of snap.records) {
    const rec = serialized.get(ref.id);
    if (!rec) continue;
    // Flag anything corrected after this handoff was prepared (and, for the viewer, after they reviewed it).
    const correctedSince = rec.corrections.length > ref.version;
    const afterReview = myAck ? rec.corrections.some((c) => c.entered_at > myAck.acked_at) : false;
    entries.push({ ...rec, updated_since_prepared: correctedSince, updated_since_you_reviewed: afterReview });
  }

  // Open items are read live: acknowledging a handoff never completes them.
  const open = await db.prepare(
    `SELECT i.*, o.name AS owner_name FROM open_items i LEFT JOIN users o ON o.id = i.owner_id
     WHERE i.circle_id = ? AND i.resolved_at IS NULL ORDER BY i.due_date IS NULL, i.due_date, i.id`
  ).all(circle.id);

  // Anything scheduled that was flagged "no administration recorded" and has since been recorded.
  const stillMissing = [];
  for (const m of snap.no_record) {
    const rec = await db.prepare('SELECT 1 FROM records WHERE schedule_item_id = ? AND scheduled_for = ? AND is_exception = 0').get(m.schedule_item_id, m.date);
    stillMissing.push({ ...m, now_recorded: !!rec });
  }

  return {
    id: h.id, created_at: h.created_at, note: h.note, from, to, digest: digest(snap),
    records: entries,
    no_record: stillMissing,
    open_items: open,
    acknowledgements: acks,
    acknowledged_by_you: !!myAck,
    needs_attention: entries.some((e) => e.updated_since_you_reviewed) || entries.some((e) => e.updated_since_prepared && !myAck),
  };
}

export function registerHandoffs(app, db, { need, body }) {
  app.post('/api/circles/:cid/handoffs', async (c) => {
    const { circle, user, member } = await circleCtx(db, c, 'handoff');
    const b = await body(c);
    let toUser = null;
    if (b.to_user) {
      toUser = await db.prepare("SELECT user_id FROM members WHERE circle_id = ? AND user_id = ? AND status = 'active'").get(circle.id, Number(b.to_user));
      need(toUser, 'recipient_not_in_circle');
      need(Number(b.to_user) !== user.id, 'cannot_hand_off_to_self');
    }
    const last = await db.prepare('SELECT created_at FROM handoffs WHERE circle_id = ? ORDER BY id DESC LIMIT 1').get(circle.id);
    const since = last?.created_at ?? new Date(Date.now() - 24 * 3600e3).toISOString();
    const snap = await buildSnapshot(db, circle, member.role, since);
    const r = await db.prepare('INSERT INTO handoffs (circle_id, from_user, to_user, note, snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(circle.id, user.id, toUser ? Number(b.to_user) : null, clean(b.note, 1000), JSON.stringify(snap), now());
    return c.json(await loadHandoff(db, circle, member.role, r.lastInsertRowid, user.id), 201);
  });

  app.get('/api/circles/:cid/handoffs', async (c) => {
    const { circle } = await circleCtx(db, c, 'read');
    const rows = await db.prepare(
      `SELECT h.id, h.created_at, h.note, f.name AS from_name, t.name AS to_name,
        (SELECT COUNT(*) FROM handoff_acks a WHERE a.handoff_id = h.id) AS ack_count
       FROM handoffs h JOIN users f ON f.id = h.from_user LEFT JOIN users t ON t.id = h.to_user
       WHERE h.circle_id = ? ORDER BY h.id DESC LIMIT 50`
    ).all(circle.id);
    return c.json(rows);
  });

  app.get('/api/circles/:cid/handoffs/:id', async (c) => {
    const { circle, user, member } = await circleCtx(db, c, 'read');
    return c.json(await loadHandoff(db, circle, member.role, Number(c.req.param('id')), user.id));
  });

  // Acknowledge: records exactly which version of the handoff (by digest) this person saw.
  app.post('/api/circles/:cid/handoffs/:id/ack', async (c) => {
    const { circle, user, member } = await circleCtx(db, c, 'read');
    const h = await db.prepare('SELECT * FROM handoffs WHERE id = ? AND circle_id = ?').get(Number(c.req.param('id')), circle.id);
    if (!h) throw new HttpError(404, 'handoff_not_found');
    if (h.from_user === user.id) throw new HttpError(400, 'author_cannot_acknowledge');
    if (h.to_user && h.to_user !== user.id) throw new HttpError(403, 'handoff_addressed_to_someone_else');
    const r = await db.prepare('INSERT OR IGNORE INTO handoff_acks (handoff_id, user_id, acked_at) VALUES (?, ?, ?)').run(h.id, user.id, now());
    const view = await loadHandoff(db, circle, member.role, h.id, user.id);
    return c.json({ ...view, newly_acknowledged: r.changes > 0 }, r.changes ? 201 : 200);
  });

  // Draft narrative: AI if a key is configured, otherwise a deterministic template. Always source-linked.
  app.get('/api/circles/:cid/handoffs/:id/narrative', async (c) => {
    const { circle, user, member } = await circleCtx(db, c, 'read');
    const view = await loadHandoff(db, circle, member.role, Number(c.req.param('id')), user.id);
    const members = await activeMembers(db, circle.id);
    const lang = c.req.query('lang') || undefined;
    return c.json(await draftNarrative(view, { circle, members, lang }));
  });
}

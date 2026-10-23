import { HttpError, can, localParts } from './lib.js';

export const getCookie = (c, name) => {
  const raw = c.req.header('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
};

// Sign-ins last 30 days, the same as the cookie. Older rows no longer count as signed in.
export const SESSION_DAYS = 30;
export const sessionCutoff = () => new Date(Date.now() - SESSION_DAYS * 86400e3).toISOString();

export async function currentUser(db, c) {
  const auth = c.req.header('authorization');
  const tok = auth?.startsWith('Bearer ') ? auth.slice(7) : getCookie(c, 'cl_session');
  if (!tok) throw new HttpError(401, 'not_signed_in');
  const user = await db.prepare(
    'SELECT u.id, u.email, u.name, u.lang FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.created_at >= ?'
  ).get(tok, sessionCutoff());
  if (!user) throw new HttpError(401, 'not_signed_in');
  return user;
}

// Membership is re-read from the database on every protected request, so removing
// someone (or an expired clinician link) takes effect immediately, even for open sessions.
export async function circleCtx(db, c, cap) {
  const user = await currentUser(db, c);
  const id = Number(c.req.param('cid'));
  const circle = Number.isInteger(id) ? await db.prepare('SELECT * FROM circles WHERE id = ?').get(id) : null;
  const member = circle && await db.prepare(
    "SELECT * FROM members WHERE circle_id = ? AND user_id = ? AND status = 'active'"
  ).get(circle.id, user.id);
  const expired = member?.expires_at && Date.parse(member.expires_at) < Date.now();
  if (!circle || !member || expired) throw new HttpError(404, 'circle_not_found');
  if (cap && !can(member.role, cap)) throw new HttpError(403, 'forbidden', { needs: cap, role: member.role });
  return { user, circle, member };
}

export function canSeePrivate(role) {
  return can(role, 'read_private');
}

// A record's effective view = the original plus its latest correction. Originals are never altered.
// Records are serialized in batches: one query for all corrections and one for all authors, so a
// page of N records costs 2 extra queries instead of 2N (each query is a round trip to the database).
export async function serializeRecords(db, rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const marks = ids.map(() => '?').join(',');
  const corrections = await db.prepare(
    `SELECT c.*, u.name AS author_name FROM corrections c JOIN users u ON u.id = c.author_id
     WHERE c.record_id IN (${marks}) ORDER BY c.id`
  ).all(...ids);
  const byRecord = new Map();
  for (const c of corrections) byRecord.set(c.record_id, [...(byRecord.get(c.record_id) || []), c]);
  const authorIds = [...new Set(rows.map((r) => r.author_id).filter(Boolean))];
  const authors = authorIds.length
    ? await db.prepare(`SELECT id, name FROM users WHERE id IN (${authorIds.map(() => '?').join(',')})`).all(...authorIds)
    : [];
  const nameOf = new Map(authors.map((u) => [u.id, u.name]));
  return rows.map((r) => {
    const own = byRecord.get(r.id) || [];
    const latest = own.reduce((acc, c) => ({
      text: c.new_text ?? acc.text,
      reported_at: c.new_reported_at ?? acc.reported_at,
      outcome: c.new_outcome ?? acc.outcome,
    }), { text: r.text, reported_at: r.reported_at, outcome: r.outcome });
    return {
      id: r.id,
      kind: r.kind,
      schedule_item_id: r.schedule_item_id,
      scheduled_for: r.scheduled_for,
      is_exception: !!r.is_exception,
      is_private: !!r.is_private,
      source: r.source,
      author_id: r.author_id,
      author_name: nameOf.get(r.author_id) ?? (r.source.startsWith('device:') ? r.source.slice(7) : 'Unknown'),
      entered_at: r.entered_at,
      original: { text: r.text, reported_at: r.reported_at, outcome: r.outcome },
      text: latest.text,
      reported_at: latest.reported_at,
      outcome: latest.outcome,
      data: r.data ? JSON.parse(r.data) : null,
      corrected: own.length > 0,
      corrections: own.map((c) => ({
        id: c.id, author_name: c.author_name, reason: c.reason, entered_at: c.entered_at,
        new_text: c.new_text, new_reported_at: c.new_reported_at, new_outcome: c.new_outcome,
      })),
    };
  });
}

export async function serializeRecord(db, r) {
  return (await serializeRecords(db, [r]))[0];
}

export async function visibleRecords(db, circleId, role, { since, until, kind, limit = 200 } = {}) {
  const where = ['circle_id = ?'];
  const args = [circleId];
  if (!canSeePrivate(role)) where.push('is_private = 0');
  if (since) { where.push('entered_at >= ?'); args.push(since); }
  if (until) { where.push('entered_at <= ?'); args.push(until); }
  if (kind) { where.push('kind = ?'); args.push(kind); }
  args.push(Math.min(Number(limit) || 200, 500));
  const rows = await db.prepare(`SELECT * FROM records WHERE ${where.join(' AND ')} ORDER BY entered_at DESC, id DESC LIMIT ?`).all(...args);
  return serializeRecords(db, rows);
}

// One row per schedule item for a given local date. A scheduled time passing without a record
// is reported as "no administration recorded" — the app cannot know whether care was given.
export async function dayView(db, circle, date) {
  const items = await db.prepare('SELECT * FROM schedule_items WHERE circle_id = ? AND active = 1 ORDER BY time_of_day, id').all(circle.id);
  const local = localParts(new Date(), circle.timezone);
  return Promise.all(items.map(async (item) => {
    const rec = await db.prepare(
      'SELECT * FROM records WHERE schedule_item_id = ? AND scheduled_for = ? AND is_exception = 0'
    ).get(item.id, date);
    const extras = await db.prepare(
      'SELECT * FROM records WHERE schedule_item_id = ? AND scheduled_for = ? AND is_exception = 1 ORDER BY id'
    ).all(item.id, date);
    const due = date < local.date || (date === local.date && item.time_of_day <= local.time);
    let status = 'upcoming';
    if (rec) status = 'recorded';
    else if (due) status = 'no_record';
    return {
      item: { id: item.id, title: item.title, category: item.category, time_of_day: item.time_of_day, instructions: item.instructions },
      date,
      status,
      label: status === 'no_record' ? 'Scheduled time passed; no administration recorded' : undefined,
      record: rec ? await serializeRecord(db, rec) : null,
      additional: await serializeRecords(db, extras),
    };
  }));
}

export function memberList(db, circleId) {
  return db.prepare(
    `SELECT u.id, u.name, u.email, m.role, m.status, m.joined_at, m.expires_at, m.removed_at
     FROM members m JOIN users u ON u.id = m.user_id WHERE m.circle_id = ? ORDER BY m.joined_at`
  ).all(circleId);
}

export const activeMembers = async (db, circleId) =>
  (await memberList(db, circleId)).filter((m) => m.status === 'active' && !(m.expires_at && Date.parse(m.expires_at) < Date.now()));

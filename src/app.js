import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import {
  ROLES, can, now, token, readableToken, hashPassword, verifyPassword, localParts, validTimezone,
  isDate, isTime, isIso, clean, HttpError,
} from './lib.js';
import {
  circleCtx, currentUser, serializeRecord, visibleRecords, dayView, memberList, canSeePrivate, getCookie,
} from './core.js';
import { parseQuickLog } from './parse.js';
import { TEMPLATES } from './templates.js';
import { registerHandoffs } from './handoffs.js';
import { registerExtras } from './extras.js';

export function createApp(db, { secureCookies = false, serveStaticFiles = true } = {}) {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.code, ...err.extra }, err.status);
    console.error(err);
    return c.json({ error: 'server_error' }, 500);
  });

  const body = async (c) => {
    try { const b = await c.req.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; }
  };
  const need = (cond, code = 'invalid_input', extra = {}) => { if (!cond) throw new HttpError(400, code, extra); };

  app.get('/api/health', async (c) => c.json({ ok: true }));
  app.get('/api/templates', async (c) => c.json(TEMPLATES));

  // ---------- accounts ----------
  const startSession = async (c, userId) => {
    const tok = token();
    await db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(tok, userId, now());
    c.header('Set-Cookie', `cl_session=${tok}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000${secureCookies ? '; Secure' : ''}`);
    return tok;
  };

  app.post('/api/signup', async (c) => {
    const b = await body(c);
    const email = clean(b.email, 200).toLowerCase();
    const name = clean(b.name, 80);
    need(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'invalid_email');
    need(name.length > 0, 'name_required');
    need(typeof b.password === 'string' && b.password.length >= 8, 'password_too_short');
    if (await db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'email_taken');
    const { hash, salt } = hashPassword(b.password);
    const r = await db.prepare('INSERT INTO users (email, name, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)').run(email, name, hash, salt, now());
    const tok = await startSession(c, Number(r.lastInsertRowid));
    return c.json({ token: tok, user: { id: Number(r.lastInsertRowid), email, name } }, 201);
  });

  app.post('/api/login', async (c) => {
    const b = await body(c);
    const u = await db.prepare('SELECT * FROM users WHERE email = ?').get(clean(b.email, 200).toLowerCase());
    if (!u || typeof b.password !== 'string' || !verifyPassword(b.password, u.salt, u.pass_hash)) throw new HttpError(401, 'bad_credentials');
    const tok = await startSession(c, u.id);
    return c.json({ token: tok, user: { id: u.id, email: u.email, name: u.name } });
  });

  app.post('/api/logout', async (c) => {
    await currentUser(db, c);
    // Sign out of this device only. Other devices (or another person's tab) stay signed in.
    const auth = c.req.header('authorization');
    const tok = auth?.startsWith('Bearer ') ? auth.slice(7) : getCookie(c, 'cl_session');
    await db.prepare('DELETE FROM sessions WHERE token = ?').run(tok);
    c.header('Set-Cookie', 'cl_session=; HttpOnly; Path=/; Max-Age=0');
    return c.json({ ok: true });
  });

  app.get('/api/me', async (c) => {
    const user = await currentUser(db, c);
    const circlesAll = await db.prepare(
      `SELECT ci.id, ci.name, ci.recipient_name, ci.kind, ci.timezone, m.role, m.expires_at
       FROM members m JOIN circles ci ON ci.id = m.circle_id
       WHERE m.user_id = ? AND m.status = 'active' ORDER BY ci.id`
    ).all(user.id);
    const circles = circlesAll.filter((x) => !(x.expires_at && Date.parse(x.expires_at) < Date.now()));
    return c.json({ user, circles });
  });

  app.patch('/api/me', async (c) => {
    const user = await currentUser(db, c);
    const b = await body(c);
    if (b.lang !== undefined) {
      need(/^[a-z]{2}(-[A-Z]{2})?$/.test(b.lang), 'invalid_lang');
      await db.prepare('UPDATE users SET lang = ? WHERE id = ?').run(b.lang, user.id);
    }
    return c.json({ ok: true });
  });

  // ---------- circles ----------
  app.post('/api/circles', async (c) => {
    const user = await currentUser(db, c);
    const b = await body(c);
    const name = clean(b.name, 80);
    const recipient = clean(b.recipient_name, 80);
    const tz = clean(b.timezone, 60) || 'UTC';
    need(name && recipient, 'name_and_recipient_required');
    need(validTimezone(tz), 'invalid_timezone');
    const kind = TEMPLATES[b.kind] ? b.kind : 'adult';
    const r = await db.prepare('INSERT INTO circles (name, recipient_name, kind, timezone, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, recipient, kind, tz, user.id, now());
    const id = Number(r.lastInsertRowid);
    await db.prepare("INSERT INTO members (circle_id, user_id, role, status, joined_at) VALUES (?, ?, 'owner', 'active', ?)").run(id, user.id, now());
    if (b.apply_template) {
      for (const s of TEMPLATES[kind].schedule) {
        await db.prepare('INSERT INTO schedule_items (circle_id, title, category, time_of_day, instructions, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(id, s.title, s.category, s.time, s.instructions ?? '', user.id, now());
      }
    }
    return c.json({ id, name, recipient_name: recipient, kind, timezone: tz }, 201);
  });

  app.get('/api/circles/:cid', async (c) => {
    const { circle, member } = await circleCtx(db, c, null);
    const members = can(member.role, 'read') ? await memberList(db, circle.id) : [];
    return c.json({ circle, role: member.role, members });
  });

  // ---------- members & invites ----------
  app.post('/api/circles/:cid/invites', async (c) => {
    const { circle, user } = await circleCtx(db, c, 'members');
    const b = await body(c);
    need(ROLES.includes(b.role) && b.role !== 'owner', 'invalid_role');
    const hours = Math.min(Math.max(Number(b.valid_hours) || 72, 1), 24 * 14);
    const accessHours = b.access_hours ? Math.min(Math.max(Number(b.access_hours), 1), 24 * 90) : null;
    need(b.role !== 'clinician' || accessHours, 'clinician_needs_access_hours');
    const tok = readableToken();
    await db.prepare('INSERT INTO invites (token, circle_id, role, created_by, expires_at, access_hours) VALUES (?, ?, ?, ?, ?, ?)')
      .run(tok, circle.id, b.role, user.id, new Date(Date.now() + hours * 3600e3).toISOString(), accessHours);
    return c.json({ token: tok, role: b.role, circle: circle.name }, 201);
  });

  app.post('/api/invites/:token/accept', async (c) => {
    const user = await currentUser(db, c);
    const inv = await db.prepare('SELECT * FROM invites WHERE token = ?').get(c.req.param('token'));
    if (!inv) throw new HttpError(404, 'invite_not_found');
    if (inv.used_at) throw new HttpError(410, 'invite_used');
    if (Date.parse(inv.expires_at) < Date.now()) throw new HttpError(410, 'invite_expired');
    const existing = await db.prepare('SELECT * FROM members WHERE circle_id = ? AND user_id = ?').get(inv.circle_id, user.id);
    if (existing?.status === 'active') throw new HttpError(409, 'already_member');
    const expires = inv.access_hours ? new Date(Date.now() + inv.access_hours * 3600e3).toISOString() : null;
    // Claim the invite first with a conditional UPDATE so two accepts can't both win.
    const claimed = await db.prepare('UPDATE invites SET used_at = ? WHERE token = ? AND used_at IS NULL').run(now(), inv.token);
    if (!claimed.changes) throw new HttpError(410, 'invite_used');
    await db.prepare(
      `INSERT INTO members (circle_id, user_id, role, status, joined_at, expires_at) VALUES (?, ?, ?, 'active', ?, ?)
       ON CONFLICT(circle_id, user_id) DO UPDATE SET role = excluded.role, status = 'active', joined_at = excluded.joined_at,
         expires_at = excluded.expires_at, removed_at = NULL`
    ).run(inv.circle_id, user.id, inv.role, now(), expires);
    return c.json({ circle_id: inv.circle_id, role: inv.role, expires_at: expires });
  });

  app.delete('/api/circles/:cid/members/:uid', async (c) => {
    const { circle, user } = await circleCtx(db, c, 'members');
    const uid = Number(c.req.param('uid'));
    if (uid === circle.owner_id) throw new HttpError(400, 'cannot_remove_owner');
    const r = await db.prepare("UPDATE members SET status = 'removed', removed_at = ? WHERE circle_id = ? AND user_id = ? AND status = 'active'").run(now(), circle.id, uid);
    if (!r.changes) throw new HttpError(404, 'member_not_found');
    // Their open items go back to "unowned" rather than silently staying assigned to someone who can no longer act.
    await db.prepare('UPDATE open_items SET owner_id = NULL WHERE circle_id = ? AND owner_id = ? AND resolved_at IS NULL').run(circle.id, uid);
    return c.json({ ok: true, removed_by: user.id });
  });

  // ---------- schedule ----------
  app.get('/api/circles/:cid/schedule', async (c) => {
    const { circle } = await circleCtx(db, c, 'read');
    return c.json(await db.prepare('SELECT * FROM schedule_items WHERE circle_id = ? ORDER BY active DESC, time_of_day, id').all(circle.id));
  });

  app.post('/api/circles/:cid/schedule', async (c) => {
    const { circle, user } = await circleCtx(db, c, 'schedule');
    const b = await body(c);
    const title = clean(b.title, 120);
    need(title, 'title_required');
    need(isTime(b.time_of_day), 'invalid_time');
    const r = await db.prepare('INSERT INTO schedule_items (circle_id, title, category, time_of_day, instructions, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(circle.id, title, clean(b.category, 40) || 'medication', b.time_of_day, clean(b.instructions, 500), user.id, now());
    return c.json({ id: Number(r.lastInsertRowid) }, 201);
  });

  app.patch('/api/circles/:cid/schedule/:id', async (c) => {
    const { circle } = await circleCtx(db, c, 'schedule');
    const b = await body(c);
    const item = await db.prepare('SELECT * FROM schedule_items WHERE id = ? AND circle_id = ?').get(Number(c.req.param('id')), circle.id);
    if (!item) throw new HttpError(404, 'not_found');
    if (b.time_of_day !== undefined) need(isTime(b.time_of_day), 'invalid_time');
    await db.prepare('UPDATE schedule_items SET title = ?, time_of_day = ?, instructions = ?, active = ? WHERE id = ?').run(
      clean(b.title, 120) || item.title, b.time_of_day ?? item.time_of_day,
      b.instructions !== undefined ? clean(b.instructions, 500) : item.instructions,
      b.active !== undefined ? (b.active ? 1 : 0) : item.active, item.id);
    return c.json({ ok: true });
  });

  // ---------- today & records ----------
  app.get('/api/circles/:cid/today', async (c) => {
    const { circle } = await circleCtx(db, c, 'read');
    const date = c.req.query('date') && isDate(c.req.query('date')) ? c.req.query('date') : localParts(new Date(), circle.timezone).date;
    return c.json({ date, timezone: circle.timezone, items: await dayView(db, circle, date) });
  });

  const KINDS = ['administration', 'observation', 'incident', 'reading', 'meal', 'visit', 'sleep', 'mood', 'task'];

  async function createRecord(circle, user, member, b, source = 'app') {
    const kind = b.kind;
    need(KINDS.includes(kind), 'invalid_kind');
    if (!can(member.role, 'write_record')) {
      if (!(kind === 'visit' && can(member.role, 'write_visit'))) throw new HttpError(403, 'forbidden', { needs: 'write_record', role: member.role });
    }
    const text = clean(b.text, 2000);
    const reported = b.reported_at ? (isIso(b.reported_at) ? new Date(b.reported_at).toISOString() : null) : now();
    need(reported, 'invalid_reported_at');
    need(Date.parse(reported) <= Date.now() + 5 * 60e3, 'reported_in_future');
    const isPrivate = b.is_private ? 1 : 0;
    if (isPrivate) need(canSeePrivate(member.role), 'cannot_write_private');

    let itemId = null;
    let scheduledFor = null;
    let exception = 0;
    let outcome = null;
    if (kind === 'administration') {
      const item = await db.prepare('SELECT * FROM schedule_items WHERE id = ? AND circle_id = ? AND active = 1').get(Number(b.schedule_item_id), circle.id);
      need(item, 'schedule_item_required');
      itemId = item.id;
      scheduledFor = isDate(b.scheduled_for) ? b.scheduled_for : localParts(new Date(), circle.timezone).date;
      outcome = ['given', 'refused', 'skipped'].includes(b.outcome) ? b.outcome : 'given';
      exception = b.exception ? 1 : 0;
      if (exception) need(text.length >= 3, 'exception_needs_explanation');
    } else {
      need(text.length > 0, 'text_required');
    }
    try {
      const r = await db.prepare(
        `INSERT INTO records (circle_id, kind, schedule_item_id, scheduled_for, is_exception, outcome, text, data, is_private, reported_at, entered_at, author_id, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(circle.id, kind, itemId, scheduledFor, exception, outcome, text, b.data ? JSON.stringify(b.data) : null, isPrivate, reported, now(), user?.id ?? null, source);
      return await db.prepare('SELECT * FROM records WHERE id = ?').get(Number(r.lastInsertRowid));
    } catch (e) {
      if (!String(e.message).includes('UNIQUE')) throw e;
      // Another caregiver recorded this scheduled item first (possibly from a stale screen).
      const existing = await db.prepare('SELECT * FROM records WHERE schedule_item_id = ? AND scheduled_for = ? AND is_exception = 0').get(itemId, scheduledFor);
      throw new HttpError(409, 'already_recorded', {
        existing: await serializeRecord(db, existing),
        hint: 'If a second administration really happened, resubmit with exception=true and explain what happened.',
      });
    }
  }

  app.post('/api/circles/:cid/records', async (c) => {
    const { circle, user, member } = await circleCtx(db, c, null);
    const rec = await createRecord(circle, user, member, await body(c));
    return c.json(await serializeRecord(db, rec), 201);
  });

  app.get('/api/circles/:cid/records', async (c) => {
    const { circle, member } = await circleCtx(db, c, 'read');
    const q = c.req.query();
    return c.json(await visibleRecords(db, circle.id, member.role, { since: q.since, until: q.until, kind: q.kind, limit: q.limit }));
  });

  app.post('/api/circles/:cid/records/:id/corrections', async (c) => {
    const { circle, user, member } = await circleCtx(db, c, 'write_record');
    const rec = await db.prepare('SELECT * FROM records WHERE id = ? AND circle_id = ?').get(Number(c.req.param('id')), circle.id);
    if (!rec || (rec.is_private && !canSeePrivate(member.role))) throw new HttpError(404, 'record_not_found');
    const b = await body(c);
    const reason = clean(b.reason, 500);
    need(reason.length >= 3, 'reason_required');
    const newText = b.text !== undefined ? clean(b.text, 2000) : null;
    const newAt = b.reported_at !== undefined ? (isIso(b.reported_at) ? new Date(b.reported_at).toISOString() : null) : null;
    if (b.reported_at !== undefined) need(newAt, 'invalid_reported_at');
    const newOutcome = b.outcome !== undefined ? b.outcome : null;
    if (newOutcome !== null) need(['given', 'refused', 'skipped'].includes(newOutcome) && rec.kind === 'administration', 'invalid_outcome');
    need(newText !== null || newAt !== null || newOutcome !== null, 'nothing_to_correct');
    await db.prepare('INSERT INTO corrections (record_id, author_id, new_text, new_reported_at, new_outcome, reason, entered_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(rec.id, user.id, newText, newAt, newOutcome, reason, now());
    return c.json(await serializeRecord(db, rec), 201);
  });

  // ---------- quick log: one line of text -> a structured record ----------
  app.post('/api/circles/:cid/quicklog', async (c) => {
    const { circle, user, member } = await circleCtx(db, c, null);
    const b = await body(c);
    const items = await db.prepare('SELECT * FROM schedule_items WHERE circle_id = ? AND active = 1').all(circle.id);
    const parsed = parseQuickLog(b.text, items);
    if (b.dry_run) return c.json({ parsed });
    need(parsed.text, 'text_required');
    const local = localParts(new Date(), circle.timezone);
    const rec = await createRecord(circle, user, member, {
      kind: parsed.kind, text: parsed.text, schedule_item_id: parsed.schedule_item_id, scheduled_for: local.date, is_private: false,
    }, 'quicklog');
    return c.json({ parsed, record: await serializeRecord(db, rec) }, 201);
  });

  // ---------- open items: stay visible until someone records an outcome ----------
  app.get('/api/circles/:cid/items', async (c) => {
    const { circle } = await circleCtx(db, c, 'read');
    const all = c.req.query('all') === '1';
    const rows = await db.prepare(
      `SELECT i.*, o.name AS owner_name, r.name AS resolved_by_name FROM open_items i
       LEFT JOIN users o ON o.id = i.owner_id LEFT JOIN users r ON r.id = i.resolved_by
       WHERE i.circle_id = ? ${all ? '' : 'AND i.resolved_at IS NULL'} ORDER BY i.resolved_at IS NOT NULL, i.due_date IS NULL, i.due_date, i.id`
    ).all(circle.id);
    return c.json(rows);
  });

  app.post('/api/circles/:cid/items', async (c) => {
    const { circle, user } = await circleCtx(db, c, 'items');
    const b = await body(c);
    const title = clean(b.title, 200);
    need(title, 'title_required');
    if (b.due_date) need(isDate(b.due_date), 'invalid_due_date');
    let owner = null;
    if (b.owner_id) {
      owner = await db.prepare("SELECT 1 FROM members WHERE circle_id = ? AND user_id = ? AND status = 'active'").get(circle.id, Number(b.owner_id));
      need(owner, 'owner_not_in_circle');
    }
    const r = await db.prepare('INSERT INTO open_items (circle_id, title, detail, owner_id, created_by, created_at, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(circle.id, title, clean(b.detail, 1000), b.owner_id ? Number(b.owner_id) : null, user.id, now(), b.due_date || null);
    return c.json({ id: Number(r.lastInsertRowid) }, 201);
  });

  app.post('/api/circles/:cid/items/:id/resolve', async (c) => {
    const { circle, user } = await circleCtx(db, c, 'items');
    const b = await body(c);
    const outcome = clean(b.outcome, 500);
    need(outcome.length >= 2, 'outcome_required');
    const r = await db.prepare('UPDATE open_items SET resolved_at = ?, resolved_by = ?, outcome = ? WHERE id = ? AND circle_id = ? AND resolved_at IS NULL')
      .run(now(), user.id, outcome, Number(c.req.param('id')), circle.id);
    if (!r.changes) throw new HttpError(404, 'item_not_found_or_resolved');
    return c.json({ ok: true });
  });

  app.post('/api/circles/:cid/items/:id/assign', async (c) => {
    const { circle } = await circleCtx(db, c, 'items');
    const b = await body(c);
    const ok = b.owner_id === null || await db.prepare("SELECT 1 FROM members WHERE circle_id = ? AND user_id = ? AND status = 'active'").get(circle.id, Number(b.owner_id));
    need(ok, 'owner_not_in_circle');
    const r = await db.prepare('UPDATE open_items SET owner_id = ? WHERE id = ? AND circle_id = ? AND resolved_at IS NULL')
      .run(b.owner_id === null ? null : Number(b.owner_id), Number(c.req.param('id')), circle.id);
    if (!r.changes) throw new HttpError(404, 'item_not_found_or_resolved');
    return c.json({ ok: true });
  });

  registerHandoffs(app, db, { need, body });
  registerExtras(app, db, { need, body, createRecord });

  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

  if (serveStaticFiles) {
    app.use('/*', serveStatic({ root: './public' }));
    app.get('*', serveStatic({ path: './public/index.html' }));
  }
  return app;
}

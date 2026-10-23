import { HttpError, can, now, token, readableToken, clean, isDate, isIso, localParts } from './lib.js';
import { circleCtx, currentUser, visibleRecords, canSeePrivate, serializeRecord, activeMembers } from './core.js';
import { PATTERN_TERMS } from './parse.js';
import { translate } from './narrative.js';

async function emergencyPacket(db, circle) {
  const docs = await db.prepare('SELECT title, category, body, updated_at FROM documents WHERE circle_id = ? AND is_emergency = 1 AND is_private = 0 ORDER BY category, title').all(circle.id);
  const meds = await db.prepare("SELECT title, time_of_day, instructions FROM schedule_items WHERE circle_id = ? AND active = 1 AND category = 'medication' ORDER BY time_of_day").all(circle.id);
  const since = new Date(Date.now() - 48 * 3600e3).toISOString();
  // Private entries never appear here: the packet is built from the non-private view only.
  const recent = (await visibleRecords(db, circle.id, 'clinician', { since, limit: 40 }))
    .filter((r) => ['administration', 'incident', 'reading', 'observation'].includes(r.kind))
    .map((r) => ({ kind: r.kind, text: r.text, outcome: r.outcome, reported_at: r.reported_at, by: r.author_name, corrected: r.corrected }));
  const contacts = (await activeMembers(db, circle.id)).filter((m) => ['owner', 'caregiver', 'paid'].includes(m.role)).map((m) => ({ name: m.name, role: m.role }));
  return { recipient: circle.recipient_name, kind: circle.kind, timezone: circle.timezone, generated_at: now(), documents: docs, medications: meds, recent_records: recent, contacts };
}

const dueIcs = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export function registerExtras(app, db, { need, body, createRecord }) {
  // ---------- documents ----------
  app.get('/api/circles/:cid/documents', async (c) => {
    const { circle, member } = await circleCtx(db, c, 'read');
    const priv = canSeePrivate(member.role) ? '' : 'AND is_private = 0';
    return c.json(await db.prepare(`SELECT * FROM documents WHERE circle_id = ? ${priv} ORDER BY category, title`).all(circle.id));
  });

  app.post('/api/circles/:cid/documents', async (c) => {
    const { circle, user } = await circleCtx(db, c, 'docs');
    const b = await body(c);
    const title = clean(b.title, 150);
    need(title, 'title_required');
    const r = await db.prepare('INSERT INTO documents (circle_id, title, category, body, is_emergency, is_private, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(circle.id, title, clean(b.category, 40) || 'general', clean(b.body, 8000), b.is_emergency ? 1 : 0, b.is_private ? 1 : 0, user.id, now());
    return c.json({ id: r.lastInsertRowid }, 201);
  });

  app.patch('/api/circles/:cid/documents/:id', async (c) => {
    const { circle, user } = await circleCtx(db, c, 'docs');
    const d = await db.prepare('SELECT * FROM documents WHERE id = ? AND circle_id = ?').get(Number(c.req.param('id')), circle.id);
    if (!d) throw new HttpError(404, 'not_found');
    const b = await body(c);
    await db.prepare('UPDATE documents SET title = ?, category = ?, body = ?, is_emergency = ?, is_private = ?, updated_by = ?, updated_at = ? WHERE id = ?').run(
      clean(b.title, 150) || d.title, clean(b.category, 40) || d.category, b.body !== undefined ? clean(b.body, 8000) : d.body,
      b.is_emergency !== undefined ? (b.is_emergency ? 1 : 0) : d.is_emergency, b.is_private !== undefined ? (b.is_private ? 1 : 0) : d.is_private, user.id, now(), d.id);
    return c.json({ ok: true });
  });

  // ---------- emergency packet ----------
  app.get('/api/circles/:cid/emergency-card', async (c) => {
    const { circle, member } = await circleCtx(db, c, null);
    if (!can(member.role, 'emergency') && !can(member.role, 'emergency_view') && !can(member.role, 'read')) throw new HttpError(403, 'forbidden');
    return c.json(await emergencyPacket(db, circle));
  });

  app.post('/api/circles/:cid/emergency-links', async (c) => {
    const { circle, user } = await circleCtx(db, c, 'emergency');
    const b = await body(c);
    const hours = Math.min(Math.max(Number(b.hours) || 24, 1), 72);
    const tok = readableToken();
    await db.prepare('INSERT INTO emergency_links (token, circle_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(tok, circle.id, user.id, now(), new Date(Date.now() + hours * 3600e3).toISOString());
    return c.json({ token: tok, path: `/e/${tok}`, expires_at: new Date(Date.now() + hours * 3600e3).toISOString() }, 201);
  });

  app.get('/api/circles/:cid/emergency-links', async (c) => {
    const { circle } = await circleCtx(db, c, 'emergency');
    return c.json(await db.prepare('SELECT token, created_at, expires_at, revoked_at FROM emergency_links WHERE circle_id = ? ORDER BY created_at DESC LIMIT 20').all(circle.id));
  });

  app.delete('/api/circles/:cid/emergency-links/:token', async (c) => {
    const { circle } = await circleCtx(db, c, 'emergency');
    const r = await db.prepare('UPDATE emergency_links SET revoked_at = ? WHERE token = ? AND circle_id = ? AND revoked_at IS NULL').run(now(), c.req.param('token'), circle.id);
    if (!r.changes) throw new HttpError(404, 'link_not_found');
    return c.json({ ok: true });
  });

  // Public, read-only, no sign-in. Expires and can be revoked at any moment.
  app.get('/api/emergency/:token', async (c) => {
    const link = await db.prepare('SELECT * FROM emergency_links WHERE token = ?').get(c.req.param('token'));
    if (!link) throw new HttpError(404, 'link_not_found');
    if (link.revoked_at) throw new HttpError(410, 'link_revoked');
    if (Date.parse(link.expires_at) < Date.now()) throw new HttpError(410, 'link_expired');
    const circle = await db.prepare('SELECT * FROM circles WHERE id = ?').get(link.circle_id);
    c.header('Cache-Control', 'no-store');
    return c.json({ ...(await emergencyPacket(db, circle)), link_expires_at: link.expires_at });
  });

  // ---------- money ----------
  app.get('/api/circles/:cid/expenses', async (c) => {
    const { circle } = await circleCtx(db, c, 'money');
    return c.json(await db.prepare('SELECT e.*, u.name AS payer_name FROM expenses e JOIN users u ON u.id = e.payer_id WHERE e.circle_id = ? ORDER BY e.spent_on DESC, e.id DESC LIMIT 200').all(circle.id));
  });

  app.post('/api/circles/:cid/expenses', async (c) => {
    const { circle, user } = await circleCtx(db, c, 'money');
    const b = await body(c);
    const cents = Math.round(Number(b.amount) * 100);
    need(Number.isFinite(cents) && cents > 0 && cents < 1e9, 'invalid_amount');
    const description = clean(b.description, 200);
    need(description, 'description_required');
    const spent = isDate(b.spent_on) ? b.spent_on : localParts(new Date(), circle.timezone).date;
    const r = await db.prepare('INSERT INTO expenses (circle_id, payer_id, amount_cents, currency, description, spent_on, entered_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(circle.id, user.id, cents, clean(b.currency, 3).toUpperCase() || 'USD', description, spent, now());
    return c.json({ id: r.lastInsertRowid }, 201);
  });

  // Equal split between active family caregivers; integer cents so totals always add up.
  app.get('/api/circles/:cid/expenses/summary', async (c) => {
    const { circle } = await circleCtx(db, c, 'money');
    const sharers = (await activeMembers(db, circle.id)).filter((m) => ['owner', 'caregiver'].includes(m.role));
    const rows = await db.prepare('SELECT payer_id, currency, SUM(amount_cents) AS paid FROM expenses WHERE circle_id = ? GROUP BY payer_id, currency').all(circle.id);
    const out = {};
    for (const cur of [...new Set(rows.map((r) => r.currency))]) {
      const total = rows.filter((r) => r.currency === cur).reduce((a, r) => a + r.paid, 0);
      const n = sharers.length || 1;
      const base = Math.floor(total / n);
      let remainder = total - base * n;
      const people = sharers.map((m) => {
        const share = base + (remainder-- > 0 ? 1 : 0);
        const paid = rows.find((r) => r.currency === cur && r.payer_id === m.id)?.paid ?? 0;
        return { user_id: m.id, name: m.name, paid_cents: paid, share_cents: share, balance_cents: paid - share };
      });
      out[cur] = { total_cents: total, people };
    }
    return c.json(out);
  });

  // ---------- shifts & care load ----------
  app.get('/api/circles/:cid/shifts', async (c) => {
    const { circle } = await circleCtx(db, c, 'read');
    return c.json(await db.prepare('SELECT s.*, u.name AS user_name FROM shifts s JOIN users u ON u.id = s.user_id WHERE s.circle_id = ? ORDER BY s.starts_at DESC LIMIT 200').all(circle.id));
  });

  app.post('/api/circles/:cid/shifts', async (c) => {
    const { circle, user } = await circleCtx(db, c, 'shifts');
    const b = await body(c);
    need(isIso(b.starts_at) && isIso(b.ends_at) && Date.parse(b.ends_at) > Date.parse(b.starts_at), 'invalid_shift_times');
    need(['care', 'respite'].includes(b.kind || 'care'), 'invalid_kind');
    const r = await db.prepare('INSERT INTO shifts (circle_id, user_id, kind, starts_at, ends_at, note) VALUES (?, ?, ?, ?, ?, ?)')
      .run(circle.id, user.id, b.kind || 'care', new Date(b.starts_at).toISOString(), new Date(b.ends_at).toISOString(), clean(b.note, 300));
    return c.json({ id: r.lastInsertRowid }, 201);
  });

  app.get('/api/circles/:cid/load', async (c) => {
    const { circle, user } = await circleCtx(db, c, 'read');
    const days = Math.min(Math.max(Number(c.req.query('days')) || 30, 1), 365);
    const since = new Date(Date.now() - days * 86400e3).toISOString();
    const members = (await activeMembers(db, circle.id)).filter((m) => ['owner', 'caregiver', 'paid'].includes(m.role));
    const people = [];
    for (const m of members) {
      const shifts = await db.prepare('SELECT kind, starts_at, ends_at FROM shifts WHERE circle_id = ? AND user_id = ? AND ends_at >= ?').all(circle.id, m.id, since);
      const hours = (k) => shifts.filter((s) => s.kind === k).reduce((a, s) => a + (Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 3600e3, 0);
      const recs = await db.prepare('SELECT COUNT(*) AS n FROM records WHERE circle_id = ? AND author_id = ? AND entered_at >= ?').get(circle.id, m.id, since);
      people.push({ user_id: m.id, name: m.name, role: m.role, care_hours: Math.round(hours('care') * 10) / 10, respite_hours: Math.round(hours('respite') * 10) / 10, records: recs.n });
    }
    const totalHours = people.reduce((a, p) => a + p.care_hours, 0);
    for (const p of people) p.share = totalHours ? Math.round((p.care_hours / totalHours) * 100) : 0;
    const family = people.filter((p) => p.role !== 'paid');
    const top = [...family].sort((a, b) => b.care_hours - a.care_hours)[0];
    const imbalance = family.length >= 2 && totalHours > 0 && top.care_hours / family.reduce((a, p) => a + p.care_hours, 0) > 0.6;
    const mine = await db.prepare('SELECT mood FROM checkins WHERE circle_id = ? AND user_id = ? ORDER BY id DESC LIMIT 3').all(circle.id, user.id);
    return c.json({
      days, people,
      imbalance: imbalance ? { name: top.name, share: top.share, message: `${top.name} has covered ${top.share}% of care hours. Consider arranging a break.` } : null,
      check_in_suggested: mine.length === 3 && mine.every((m) => m.mood <= 2),
    });
  });

  // ---------- caregiver check-ins (private to the author) ----------
  app.post('/api/circles/:cid/checkins', async (c) => {
    const { circle, user } = await circleCtx(db, c, 'checkin');
    const b = await body(c);
    const mood = Number(b.mood);
    need(Number.isInteger(mood) && mood >= 1 && mood <= 5, 'invalid_mood');
    await db.prepare('INSERT INTO checkins (circle_id, user_id, mood, text, entered_at) VALUES (?, ?, ?, ?, ?)').run(circle.id, user.id, mood, clean(b.text, 500), now());
    return c.json({ ok: true }, 201);
  });

  app.get('/api/circles/:cid/checkins', async (c) => {
    const { circle, user } = await circleCtx(db, c, 'checkin');
    return c.json(await db.prepare('SELECT mood, text, entered_at FROM checkins WHERE circle_id = ? AND user_id = ? ORDER BY id DESC LIMIT 30').all(circle.id, user.id));
  });

  // ---------- appointments ----------
  app.get('/api/circles/:cid/appointments', async (c) => {
    const { circle } = await circleCtx(db, c, 'read');
    return c.json(await db.prepare('SELECT a.*, u.name AS taker_name FROM appointments a LEFT JOIN users u ON u.id = a.taker_id WHERE a.circle_id = ? ORDER BY a.starts_at').all(circle.id));
  });

  app.post('/api/circles/:cid/appointments', async (c) => {
    const { circle, user } = await circleCtx(db, c, 'appointments');
    const b = await body(c);
    need(isIso(b.starts_at), 'invalid_start');
    const title = clean(b.title, 150);
    need(title, 'title_required');
    if (b.taker_id) need(await db.prepare("SELECT 1 FROM members WHERE circle_id = ? AND user_id = ? AND status = 'active'").get(circle.id, Number(b.taker_id)), 'taker_not_in_circle');
    const r = await db.prepare('INSERT INTO appointments (circle_id, title, starts_at, location, taker_id, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(circle.id, title, new Date(b.starts_at).toISOString(), clean(b.location, 200), b.taker_id ? Number(b.taker_id) : null, user.id);
    // An appointment nobody is taking becomes an open item so it can't be forgotten.
    if (!b.taker_id) {
      await db.prepare("INSERT INTO open_items (circle_id, title, detail, created_by, created_at, due_date, source) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(circle.id, `Who is taking ${circle.recipient_name} to: ${title}?`, '', user.id, now(), new Date(b.starts_at).toISOString().slice(0, 10), `appointment:${r.lastInsertRowid}`);
    }
    return c.json({ id: r.lastInsertRowid }, 201);
  });

  app.patch('/api/circles/:cid/appointments/:id', async (c) => {
    const { circle } = await circleCtx(db, c, 'appointments');
    const a = await db.prepare('SELECT * FROM appointments WHERE id = ? AND circle_id = ?').get(Number(c.req.param('id')), circle.id);
    if (!a) throw new HttpError(404, 'not_found');
    const b = await body(c);
    if (b.taker_id) {
      need(await db.prepare("SELECT 1 FROM members WHERE circle_id = ? AND user_id = ? AND status = 'active'").get(circle.id, Number(b.taker_id)), 'taker_not_in_circle');
      await db.prepare("UPDATE open_items SET resolved_at = ?, outcome = 'Taker assigned', resolved_by = ? WHERE circle_id = ? AND source = ? AND resolved_at IS NULL").run(now(), Number(b.taker_id), circle.id, `appointment:${a.id}`);
    }
    await db.prepare('UPDATE appointments SET taker_id = ?, after_notes = ? WHERE id = ?').run(b.taker_id ? Number(b.taker_id) : a.taker_id, b.after_notes !== undefined ? clean(b.after_notes, 2000) : a.after_notes, a.id);
    return c.json({ ok: true });
  });

  app.get('/api/circles/:cid/calendar.ics', async (c) => {
    const { circle } = await circleCtx(db, c, 'read');
    const appts = await db.prepare('SELECT * FROM appointments WHERE circle_id = ? ORDER BY starts_at').all(circle.id);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CareLog//EN', 'CALSCALE:GREGORIAN'];
    for (const a of appts) {
      const end = new Date(Date.parse(a.starts_at) + 3600e3).toISOString();
      lines.push('BEGIN:VEVENT', `UID:carelog-${circle.id}-${a.id}@carelog`, `DTSTAMP:${dueIcs(now())}`, `DTSTART:${dueIcs(a.starts_at)}`, `DTEND:${dueIcs(end)}`,
        `SUMMARY:${icsEsc(a.title)}`, ...(a.location ? [`LOCATION:${icsEsc(a.location)}`] : []), 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return c.body(lines.join('\r\n'), 200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="carelog.ics"' });
  });

  // ---------- supplies & refills ----------
  app.get('/api/circles/:cid/supplies', async (c) => {
    const { circle } = await circleCtx(db, c, 'read');
    const rows = await db.prepare('SELECT * FROM supplies WHERE circle_id = ? ORDER BY name').all(circle.id);
    return c.json(rows.map((s) => ({ ...s, days_left: s.per_day > 0 ? Math.floor(s.remaining / s.per_day) : null })));
  });

  async function checkRefill(circle, s, userId) {
    const daysLeft = s.per_day > 0 ? Math.floor(s.remaining / s.per_day) : Infinity;
    if (daysLeft > s.warn_days) return;
    const exists = await db.prepare('SELECT 1 FROM open_items WHERE circle_id = ? AND source = ? AND resolved_at IS NULL').get(circle.id, `supply:${s.id}`);
    if (!exists) {
      await db.prepare('INSERT INTO open_items (circle_id, title, detail, created_by, created_at, source) VALUES (?, ?, ?, ?, ?, ?)')
        .run(circle.id, `Refill ${s.name}`, `About ${daysLeft} day(s) left at the current rate.`, userId, now(), `supply:${s.id}`);
    }
  }

  app.post('/api/circles/:cid/supplies', async (c) => {
    const { circle, user } = await circleCtx(db, c, 'supplies');
    const b = await body(c);
    const name = clean(b.name, 120);
    need(name && Number.isInteger(Number(b.remaining)) && Number(b.remaining) >= 0, 'invalid_supply');
    const perDay = b.per_day === undefined ? 1 : Number(b.per_day);
    need(Number.isFinite(perDay) && perDay >= 0, 'invalid_per_day');
    const r = await db.prepare('INSERT INTO supplies (circle_id, name, remaining, per_day, warn_days, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(circle.id, name, Number(b.remaining), perDay, Number(b.warn_days) || 5, now());
    await checkRefill(circle, await db.prepare('SELECT * FROM supplies WHERE id = ?').get(r.lastInsertRowid), user.id);
    return c.json({ id: r.lastInsertRowid }, 201);
  });

  app.patch('/api/circles/:cid/supplies/:id', async (c) => {
    const { circle, user } = await circleCtx(db, c, 'supplies');
    const s = await db.prepare('SELECT * FROM supplies WHERE id = ? AND circle_id = ?').get(Number(c.req.param('id')), circle.id);
    if (!s) throw new HttpError(404, 'not_found');
    const b = await body(c);
    const remaining = b.remaining !== undefined ? Number(b.remaining) : s.remaining;
    need(Number.isInteger(remaining) && remaining >= 0, 'invalid_supply');
    await db.prepare('UPDATE supplies SET remaining = ?, updated_at = ? WHERE id = ?').run(remaining, now(), s.id);
    // Only close the refill item once the supply is genuinely no longer low. A partial restock that is
    // still under the warning level leaves the same item open instead of closing it and opening another.
    const stillLow = s.per_day > 0 && Math.floor(remaining / s.per_day) <= s.warn_days;
    if (remaining > s.remaining && !stillLow) {
      await db.prepare("UPDATE open_items SET resolved_at = ?, resolved_by = ?, outcome = 'Restocked' WHERE circle_id = ? AND source = ? AND resolved_at IS NULL").run(now(), user.id, circle.id, `supply:${s.id}`);
    }
    await checkRefill(circle, { ...s, remaining }, user.id);
    return c.json({ ok: true });
  });

  // ---------- devices (pill dispensers, fall detectors) ----------
  app.post('/api/circles/:cid/devices', async (c) => {
    const { circle } = await circleCtx(db, c, 'devices');
    const b = await body(c);
    const name = clean(b.name, 60);
    need(name, 'name_required');
    const tok = `dev_${token(20)}`;
    await db.prepare('INSERT INTO devices (circle_id, name, token, created_at) VALUES (?, ?, ?, ?)').run(circle.id, name, tok, now());
    return c.json({ token: tok, ingest_path: `/api/ingest/${tok}`, note: 'Shown once. Store it in the device.' }, 201);
  });

  // Device events are logged as observations, never as proof that a dose was given.
  app.post('/api/ingest/:token', async (c) => {
    const dev = await db.prepare('SELECT * FROM devices WHERE token = ?').get(c.req.param('token'));
    if (!dev) throw new HttpError(401, 'bad_device_token');
    const circle = await db.prepare('SELECT * FROM circles WHERE id = ?').get(dev.circle_id);
    const b = await body(c);
    const event = clean(b.event, 60);
    need(event, 'event_required');
    const kind = /fall|alarm|sos/i.test(event) ? 'incident' : 'observation';
    const text = clean(b.text, 500) || `${dev.name}: ${event.replace(/_/g, ' ')}`;
    const rec = await createRecord(circle, null, { role: 'owner' }, { kind, text, reported_at: b.at && isIso(b.at) ? b.at : undefined }, `device:${dev.name}`);
    return c.json(await serializeRecord(db, rec), 201);
  });

  // ---------- patterns: things worth mentioning to a doctor. Never a diagnosis. ----------
  app.get('/api/circles/:cid/patterns', async (c) => {
    const { circle, member } = await circleCtx(db, c, 'read');
    const days = Math.min(Math.max(Number(c.req.query('days')) || 7, 1), 60);
    const recs = (await visibleRecords(db, circle.id, member.role, { since: new Date(Date.now() - days * 86400e3).toISOString(), limit: 500 }))
      .filter((r) => ['observation', 'incident'].includes(r.kind));
    const out = [];
    for (const term of PATTERN_TERMS) {
      const re = new RegExp(`\\b${term}`, 'i');
      const hits = recs.filter((r) => re.test(r.text));
      if (hits.length < 3) continue;
      const hours = hits.map((r) => Number(localParts(new Date(r.reported_at), circle.timezone).time.slice(0, 2)));
      let window = null;
      for (let h = 0; h < 24; h++) {
        const n = hours.filter((x) => ((x - h + 24) % 24) < 3).length;
        if (n / hits.length >= 0.6 && (!window || n > window.n)) window = { start: h, n };
      }
      out.push({
        term, count: hits.length, record_ids: hits.map((r) => r.id),
        message: `"${term}" was noted ${hits.length} times in the last ${days} days${window ? `, mostly between ${String(window.start).padStart(2, '0')}:00 and ${String((window.start + 3) % 24).padStart(2, '0')}:00` : ''}. You may want to mention this to ${circle.recipient_name}'s doctor.`,
      });
    }
    return c.json({ days, patterns: out, disclaimer: 'Counts of words people wrote. Not a diagnosis or medical advice.' });
  });

  // ---------- weekly digest for the relative who lives far away ----------
  app.get('/api/circles/:cid/digest', async (c) => {
    const { circle, member } = await circleCtx(db, c, 'read');
    const days = Math.min(Math.max(Number(c.req.query('days')) || 7, 1), 31);
    const since = new Date(Date.now() - days * 86400e3).toISOString();
    const recs = await visibleRecords(db, circle.id, member.role, { since, limit: 500 });
    const byKind = {};
    for (const r of recs) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
    const open = await db.prepare('SELECT COUNT(*) AS n FROM open_items WHERE circle_id = ? AND resolved_at IS NULL').get(circle.id);
    const resolved = await db.prepare('SELECT COUNT(*) AS n FROM open_items WHERE circle_id = ? AND resolved_at >= ?').get(circle.id, since);
    const handoffs = await db.prepare('SELECT COUNT(*) AS n, SUM(CASE WHEN EXISTS (SELECT 1 FROM handoff_acks a WHERE a.handoff_id = h.id) THEN 1 ELSE 0 END) AS acked FROM handoffs h WHERE h.circle_id = ? AND h.created_at >= ?').get(circle.id, since);
    const appts = await db.prepare('SELECT title, starts_at FROM appointments WHERE circle_id = ? AND starts_at >= ? AND starts_at <= ? ORDER BY starts_at').all(circle.id, now(), new Date(Date.now() + 7 * 86400e3).toISOString());
    const sup = (await db.prepare('SELECT name, remaining, per_day, warn_days FROM supplies WHERE circle_id = ?').all(circle.id)).filter((s) => s.per_day > 0 && Math.floor(s.remaining / s.per_day) <= s.warn_days);
    const incidents = recs.filter((r) => r.kind === 'incident').map((r) => ({ id: r.id, text: r.text, reported_at: r.reported_at }));
    const summary = [
      `${recs.length} entries in the last ${days} days (${Object.entries(byKind).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}).`,
      incidents.length ? `${incidents.length} incident(s) recorded.` : 'No incidents recorded.',
      `${open.n} open item(s); ${resolved.n} resolved this period.`,
      `${handoffs.n} handoff(s), ${handoffs.acked ?? 0} acknowledged.`,
      appts.length ? `Coming up: ${appts.map((a) => a.title).join('; ')}.` : 'No appointments in the next 7 days.',
      sup.length ? `Running low: ${sup.map((s) => s.name).join(', ')}.` : '',
    ].filter(Boolean);
    return c.json({ days, counts: byKind, incidents, open_items: open.n, resolved_items: resolved.n, handoffs: { total: handoffs.n, acknowledged: handoffs.acked ?? 0 }, upcoming_appointments: appts, low_supplies: sup, summary });
  });

  // ---------- export for a doctor, insurer or care assessment ----------
  app.get('/api/circles/:cid/export', async (c) => {
    const { circle, member } = await circleCtx(db, c, 'export');
    const priv = canSeePrivate(member.role) ? '' : 'AND is_private = 0';
    const data = {
      exported_at: now(), circle: { name: circle.name, recipient: circle.recipient_name, timezone: circle.timezone },
      medications: await db.prepare('SELECT title, category, time_of_day, instructions, active FROM schedule_items WHERE circle_id = ?').all(circle.id),
      records: await visibleRecords(db, circle.id, member.role, { limit: 500 }),
      documents: await db.prepare(`SELECT title, category, body, updated_at FROM documents WHERE circle_id = ? ${priv}`).all(circle.id),
      appointments: await db.prepare('SELECT title, starts_at, location, after_notes FROM appointments WHERE circle_id = ? ORDER BY starts_at').all(circle.id),
      note: 'Entries are as recorded by the people named. Corrections are shown alongside the originals.',
    };
    return c.body(JSON.stringify(data, null, 2), 200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="carelog-export.json"' });
  });

  // ---------- translation (needs an AI key; otherwise says so plainly) ----------
  app.post('/api/circles/:cid/translate', async (c) => {
    await circleCtx(db, c, 'read');
    const b = await body(c);
    const text = clean(b.text, 4000);
    need(text && /^[a-z]{2}(-[A-Z]{2})?$/.test(b.lang || ''), 'invalid_input');
    const out = await translate(text, b.lang);
    if (!out) throw new HttpError(503, 'translation_unavailable');
    return c.json({ lang: b.lang, text: out, machine_translated: true });
  });
}

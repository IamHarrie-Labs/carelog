import crypto from 'node:crypto';

export const ROLES = ['owner', 'caregiver', 'paid', 'clinician', 'neighbour', 'recipient'];

const CAPS = {
  owner: ['read', 'read_private', 'write_record', 'write_visit', 'handoff', 'items', 'schedule', 'docs', 'money', 'shifts', 'appointments', 'supplies', 'emergency', 'members', 'devices', 'checkin', 'export'],
  caregiver: ['read', 'read_private', 'write_record', 'write_visit', 'handoff', 'items', 'schedule', 'docs', 'money', 'shifts', 'appointments', 'supplies', 'emergency', 'checkin', 'export'],
  paid: ['read', 'write_record', 'write_visit', 'handoff', 'items', 'shifts', 'checkin'],
  clinician: ['read', 'export'],
  neighbour: ['write_visit', 'emergency_view'],
  recipient: ['read'],
};

export const can = (role, cap) => !!CAPS[role]?.includes(cap);

export const now = () => new Date().toISOString();
export const token = (n = 24) => crypto.randomBytes(n).toString('base64url');

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, salt, expected) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Local calendar date (YYYY-MM-DD) and wall-clock time in an IANA timezone.
export function localParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}` };
}

export function validTimezone(tz) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const isIso = (s) => typeof s === 'string' && !Number.isNaN(Date.parse(s));
export const clean = (s, max = 2000) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

export class HttpError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

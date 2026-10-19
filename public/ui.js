// Small DOM helpers. All text goes in via textContent, so nothing a caregiver types can run as markup.
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'testid') el.setAttribute('data-testid', v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export class ApiError extends Error {
  constructor(status, body) { super(body?.error || `http_${status}`); this.status = status; this.body = body || {}; }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) throw new ApiError(res.status, json);
  return json;
}

const MESSAGES = {
  not_signed_in: 'Please sign in.',
  bad_credentials: 'That email and password do not match.',
  email_taken: 'An account with that email already exists.',
  password_too_short: 'Use at least 8 characters for the password.',
  invalid_email: 'That email address does not look right.',
  name_required: 'Please enter a name.',
  already_recorded: 'This was already recorded by someone else.',
  exception_needs_explanation: 'Please explain what happened (a few words is enough).',
  reason_required: 'Please say why you are correcting this.',
  outcome_required: 'Please record the outcome before closing this item.',
  circle_not_found: 'That care circle is not available to you.',
  forbidden: 'Your role does not allow this.',
  invite_used: 'This invite has already been used.',
  invite_expired: 'This invite has expired.',
  invite_not_found: 'This invite link is not valid.',
  author_cannot_acknowledge: 'You prepared this handoff, so someone else needs to acknowledge it.',
  handoff_addressed_to_someone_else: 'This handoff was addressed to someone else.',
  link_expired: 'This emergency link has expired.',
  link_revoked: 'This emergency link was revoked.',
  link_not_found: 'This link is not valid.',
  reported_in_future: 'That time is in the future.',
  translation_unavailable: 'Translation is not configured on this server.',
};
export const friendly = (e) => MESSAGES[e?.message] || (e?.message ? e.message.replace(/_/g, ' ') : 'Something went wrong.');

export function toast(msg, ms = 3500) {
  const box = document.getElementById('toast');
  const t = h('div', { role: 'status' }, msg);
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

// Modal form. onSubmit(values) runs on submit; if it throws, the message shows inside the dialog and
// nothing the person typed is lost. Resolves with onSubmit's result, or null if cancelled.
export function modal({ title, intro, fields = [], submit = 'Save', danger = false, extra, onSubmit }) {
  return new Promise((resolve) => {
    const dlg = document.getElementById('modal');
    const err = h('div', { class: 'alert bad', role: 'alert', hidden: true, testid: 'modal-error' });
    const inputs = {};
    let done = false;
    const finish = (v) => { if (done) return; done = true; if (dlg.open) dlg.close(); resolve(v); };
    const btn = h('button', { type: 'submit', class: danger ? 'danger' : 'primary', testid: 'modal-submit' }, submit);
    const form = h('form', { method: 'dialog', testid: 'modal-form' },
      h('h2', {}, title),
      intro ? h('p', { class: 'muted' }, intro) : null,
      extra || null,
      fields.map((f) => {
        let input;
        const common = { id: `f_${f.name}`, name: f.name, testid: `field-${f.name}`, required: f.required, placeholder: f.placeholder };
        if (f.type === 'select') {
          input = h('select', common, f.options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(f.value) }, o.label)));
        } else if (f.type === 'textarea') {
          input = h('textarea', { ...common, value: f.value || '' });
        } else if (f.type === 'checkbox') {
          input = h('input', { ...common, type: 'checkbox', checked: !!f.value, 'aria-label': f.label });
        } else {
          input = h('input', { ...common, type: f.type || 'text', value: f.value ?? '', step: f.step, min: f.min, max: f.max });
        }
        inputs[f.name] = input;
        return h('div', { class: 'field' },
          f.type === 'checkbox' ? h('label', {}, input, f.label) : [h('label', { for: `f_${f.name}` }, f.label), input],
          f.help ? h('div', { class: 'small muted' }, f.help) : null);
      }),
      err,
      h('div', { class: 'row', style: 'justify-content:flex-end' },
        h('button', { type: 'button', testid: 'modal-cancel', onclick: () => finish(null) }, 'Cancel'), btn));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const values = {};
      for (const f of fields) values[f.name] = f.type === 'checkbox' ? inputs[f.name].checked : inputs[f.name].value;
      err.hidden = true;
      btn.disabled = true;
      try {
        const out = onSubmit ? await onSubmit(values) : values;
        finish(out ?? true);
      } catch (e) {
        err.hidden = false;
        err.textContent = friendly(e);
        btn.disabled = false;
      }
    });
    dlg.replaceChildren(form);
    dlg.addEventListener('cancel', () => finish(null), { once: true });
    dlg.showModal();
    form.querySelector('input,select,textarea')?.focus();
  });
}

export const fmtTime = (iso, tz) => iso ? new Intl.DateTimeFormat([], { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '';
export const fmtDateTime = (iso, tz) => iso ? new Intl.DateTimeFormat([], { timeZone: tz, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '';
export const money = (cents, cur = 'USD') => new Intl.NumberFormat([], { style: 'currency', currency: cur }).format(cents / 100);
export const localInputToIso = (v) => (v ? new Date(v).toISOString() : undefined);

import { h, api, ApiError, friendly, toast, modal, fmtTime, fmtDateTime, localInputToIso } from './ui.js';
import { moreViews } from './more.js';
import { brand, landingView, cleanupLandingMotion } from './landing.js';

const root = document.getElementById('app');
const S = { me: null, circles: [], circle: null, role: null, members: [] };

// Same capability map as the server. The server enforces it; this only decides what to show.
const CAPS = {
  owner: ['read', 'write_record', 'handoff', 'items', 'schedule', 'docs', 'money', 'shifts', 'appointments', 'supplies', 'emergency', 'members', 'devices', 'checkin', 'export'],
  caregiver: ['read', 'write_record', 'handoff', 'items', 'schedule', 'docs', 'money', 'shifts', 'appointments', 'supplies', 'emergency', 'checkin', 'export'],
  paid: ['read', 'write_record', 'handoff', 'items', 'shifts', 'checkin'],
  clinician: ['read', 'export'],
  neighbour: ['write_visit', 'emergency_view'],
  recipient: ['read'],
};
export const can = (cap) => !!CAPS[S.role]?.includes(cap);
export { S };

// Clean paths (/circles/12/people). Old #/ links from before still work: route() rewrites them.
const nav = (path) => { const p = path.replace(/^#/, '') || '/'; if (p !== location.pathname) history.pushState({}, '', p); route(); };
const circleLink = (id, tab) => `/circles/${id}/${tab}`;

function fatal(e) {
  root.replaceChildren(h('div', { class: 'wrap' }, h('div', { class: 'alert bad', role: 'alert' }, friendly(e))));
}

// Line icons for the sidebar (24px grid, 1.6 stroke). Static markup only, never user text.
const ICONS = {
  today: '<rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4M8.5 14.5l2.2 2.2 4.8-4.7"/>',
  handoff: '<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>',
  items: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.2l2.3 2.3 4.7-4.8"/>',
  timeline: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  people: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M15.5 5.6a3 3 0 0 1 0 5.8M17.5 14.7c1.6.6 2.7 2.2 3 4.8"/>',
  emergency: '<path d="M12 3.5l7.5 3v5.3c0 4.4-3.1 7.7-7.5 8.7-4.4-1-7.5-4.3-7.5-8.7V6.5z"/><path d="M12 8.5v6M9 11.5h6"/>',
  money: '<rect x="3.5" y="6" width="17" height="12.5" rx="2.5"/><path d="M3.5 10h17M15.5 14.5h2"/>',
  load: '<path d="M3.5 12h3.5l2.5-6 4.5 12 2.5-6h4"/>',
  appointments: '<rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4M8 13.5h3M8 16.5h6"/>',
  supplies: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  documents: '<path d="M7 3.5h7l4.5 4.5v12.5H7z"/><path d="M14 3.5V8h4.5M9.5 12.5h6M9.5 16h6"/>',
  digest: '<path d="M5 4.5h10.5L19 8v11.5H5z"/><path d="M8.5 9.5h7M8.5 13h7M8.5 16.5h4"/>',
  home: '<path d="M4 10.5L12 4l8 6.5V20h-5v-5.5H9V20H4z"/>',
  invite: '<circle cx="10" cy="8.5" r="3.2"/><path d="M4 19.5c.6-3.2 2.9-5 6-5 1.4 0 2.6.4 3.6 1M18 13.5v6M15 16.5h6"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};
function icon(name, size = 18) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'cl-icon'); svg.innerHTML = ICONS[name] || '';
  return svg;
}
function shell(content, tab) {
  const links = [];
  const extra = [];
  if (S.circle) {
    const add = (list, t, label, ok = true) => ok && list.push(h('a', { href: circleLink(S.circle.id, t), 'aria-current': tab === t ? 'page' : null, testid: `tab-${t}` }, icon(t), label));
    add(links, 'today', 'Today', can('read')); add(links, 'handoff', 'Handoff', can('read'));
    add(links, 'items', 'Open items', can('read')); add(links, 'timeline', 'Timeline', can('read')); add(links, 'people', 'People', can('read'));
    add(extra, 'appointments', 'Appointments', can('read')); add(extra, 'supplies', 'Supplies', can('read'));
    add(extra, 'money', 'Money', can('money')); add(extra, 'load', 'Care load', can('read'));
    add(extra, 'documents', 'Documents', can('read')); add(extra, 'digest', 'Digest', can('read'));
    add(extra, 'emergency', 'Emergency', can('emergency') || can('emergency_view'));
  }
  const alone = S.circle && can('members') && (S.members || []).filter((m) => m.status === 'active').length <= 1;
  return [h('div', { class: 'cl-app-layout' },
    h('aside', { class: 'cl-sidebar' }, brand(),
      S.circle ? h('a', { class: 'cl-recipient', href: '/', title: 'Switch care circle' }, h('span', { class: 'cl-avatar', 'aria-hidden': 'true' }, S.circle.recipient_name.slice(0, 1)), h('span', {}, h('strong', {}, S.circle.recipient_name), h('small', {}, S.circle.name)), icon('chevron', 16)) : null,
      h('nav', { class: 'cl-side-nav', 'aria-label': 'Care circle sections' },
        links.length ? [...links, extra.length ? h('hr', { class: 'cl-side-rule' }) : null, ...extra] : h('a', { href: '/', 'aria-current': tab === 'settings' ? null : 'page' }, icon('home'), 'Your care circles')),
      alone ? h('div', { class: 'cl-side-card' }, h('strong', {}, 'Bring the family in'), h('p', {}, 'CareLog works best when everyone who helps records here.'), h('a', { class: 'btn small', href: circleLink(S.circle.id, 'people') }, icon('invite', 16), 'Invite someone')) : null,
      S.me ? h('a', { class: 'cl-side-settings', href: '/settings', 'aria-current': tab === 'settings' ? 'page' : null, testid: 'nav-settings' }, icon('settings'), 'Settings') : null,
      h('div', { class: 'cl-sidebar-bottom' }, h('span', { class: 'cl-avatar', 'aria-hidden': 'true' }, S.me?.name.slice(0, 1) || 'C'), h('span', {}, h('strong', { testid: 'whoami' }, S.me?.name || 'CareLog'), h('small', {}, S.role ? cap(S.role) : 'Your account')), S.me ? h('button', { class: 'cl-signout', testid: 'logout', onclick: logout }, 'Sign out') : null)),
    h('div', { class: 'cl-workspace' },
      h('main', { id: 'main', class: 'wrap cl-app-main' }, content)))];
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// '2026-10-23' as 'Thursday 23 October', read in UTC so the date never shifts.
const longDate = (d) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
const render = (content, tab) => root.replaceChildren(...shell(content, tab).filter(Boolean));

async function logout() {
  try { await api('/api/logout', { method: 'POST' }); } catch { /* already signed out */ }
  S.me = null; S.circle = null; nav('/');
}

async function loadMe() {
  try {
    const r = await api('/api/me');
    S.me = r.user; S.circles = r.circles; S._meAt = Date.now();
  } catch (e) {
    if (e.status !== 401) throw e;
    S.me = null; S.circles = [];
  }
}

// ---------- sign in / sign up ----------
function authView(inviteToken, initialMode) {
  // Returning users (and test accounts) are the common case, so sign-in is the default.
  // An invite link opens on sign-up, since the invited person usually has no account yet.
  let mode = initialMode || (inviteToken ? 'signup' : 'login');
  const err = h('div', { class: 'alert bad', role: 'alert', hidden: true, testid: 'auth-error', tabindex: '-1' });
  const form = h('form', { testid: 'auth-form' });
  const draw = () => {
    // replaceChildren, unlike h(), writes null as the text "null", so drop the absent sign-up-only parts.
    form.replaceChildren(...[
      h('h2', { testid: 'auth-heading' }, mode === 'signup' ? 'Create your account' : 'Sign in to CareLog'),
      mode === 'signup' ? h('div', { class: 'field' }, h('label', { for: 'a_name' }, 'Your name'), h('input', { id: 'a_name', name: 'name', required: true, autocomplete: 'name', testid: 'auth-name' })) : null,
      h('div', { class: 'field' }, h('label', { for: 'a_email' }, 'Email'), h('input', { id: 'a_email', name: 'email', type: 'email', required: true, autocomplete: 'email', testid: 'auth-email' })),
      h('div', { class: 'field' }, h('label', { for: 'a_pw' }, 'Password'), h('input', { id: 'a_pw', name: 'password', type: 'password', required: true, minlength: 8, autocomplete: mode === 'signup' ? 'new-password' : 'current-password', testid: 'auth-password' }),
        mode === 'signup' ? h('div', { class: 'small muted' }, 'At least 8 characters.') : null),
      err,
      h('button', { class: 'primary', type: 'submit', testid: 'auth-submit', style: 'width:100%' }, mode === 'signup' ? 'Create account' : 'Sign in'),
      h('p', { class: 'small', style: 'text-align:center;margin:14px 0 0' },
        mode === 'signup'
          ? ['Already have an account? ', h('a', { href: '#', testid: 'mode-login', onclick: (e) => { e.preventDefault(); mode = 'login'; err.hidden = true; draw(); } }, 'Go to sign in')]
          : ['New to CareLog? ', h('a', { href: '#', testid: 'mode-signup', onclick: (e) => { e.preventDefault(); mode = 'signup'; err.hidden = true; draw(); } }, 'Create an account')])].filter(Boolean));
  };
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.hidden = true;
    const fd = Object.fromEntries(new FormData(form));
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true; form.setAttribute('aria-busy', 'true'); submit.textContent = mode === 'signup' ? 'Creating account…' : 'Signing in…';
    try {
      await api(mode === 'signup' ? '/api/signup' : '/api/login', { method: 'POST', body: fd });
      await loadMe();
      route();
    } catch (e) { err.hidden = false; err.textContent = friendly(e); err.focus(); }
    finally { submit.disabled = false; form.removeAttribute('aria-busy'); submit.textContent = mode === 'signup' ? 'Create account' : 'Sign in'; }
  });
  draw();
  root.replaceChildren(h('div', { class: 'cl-auth' },
    h('header', { class: 'cl-auth-nav' }, brand(), h('a', { href: '/' }, 'Back to CareLog')),
    h('main', { id: 'main', class: 'cl-auth-main' },
      h('div', { class: 'cl-auth-story' }, h('p', { class: 'cl-eyebrow' }, 'Care, shared clearly.'), h('h1', {}, 'A little less guessing.', h('em', {}, 'A little more together.')), h('p', {}, 'One shared record of what happened, what needs checking, and what comes next.')),
      h('section', { class: 'cl-auth-form', 'aria-label': 'Account access' }, inviteToken ? h('div', { class: 'alert info', testid: 'invite-banner' }, 'You have been invited to a care circle. Sign in or create an account to join.') : null, form,
        null))));
}

// ---------- home ----------
async function homeView() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const templates = await api('/api/templates');
  const list = S.circles.length
    ? h('ul', { class: 'cl-circle-list', testid: 'circle-list' }, S.circles.map((c) => h('li', {},
      h('a', { class: 'cl-circle-card', href: circleLink(c.id, 'today'), testid: `circle-${c.id}` },
        h('span', { class: 'cl-avatar', 'aria-hidden': 'true' }, c.recipient_name.slice(0, 1)),
        h('span', { class: 'cl-circle-text' }, h('strong', {}, c.name), h('small', {}, `Caring for ${c.recipient_name}`)),
        h('span', { class: 'badge' }, cap(c.role)),
        h('span', { class: 'cl-circle-open', 'aria-hidden': 'true' }, 'Open →')))))
    : h('div', { class: 'cl-empty', testid: 'no-circles' },
      h('h2', {}, 'Start with one care circle'),
      h('p', { class: 'muted' }, 'A care circle is one shared record for one person. Create it, then invite the family and carers who share the care.'),
      h('ol', { class: 'cl-steps' }, h('li', {}, 'Create a circle for the person you care for'), h('li', {}, 'Invite family and carers from People'), h('li', {}, 'Record care and hand over clearly')),
      h('p', { class: 'small muted' }, 'Been invited? Open the link you were sent and you will join automatically.'));
  const newBtn = h('button', { class: 'primary', testid: 'new-circle', onclick: async () => {
      const r = await modal({
        title: 'Create a care circle',
        intro: 'One circle per person being cared for.',
        submit: 'Create circle',
        fields: [
          { name: 'name', label: 'Circle name', required: true, placeholder: "e.g. Dad's care" },
          { name: 'recipient_name', label: 'Who is being cared for?', required: true, placeholder: 'e.g. Dad' },
          { name: 'kind', label: 'Type of care', type: 'select', value: 'adult', options: Object.entries(templates).map(([k, v]) => ({ value: k, label: v.label })) },
          { name: 'timezone', label: 'Time zone', type: 'select', value: tz, help: 'Schedules and times run on this clock.',
            options: (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [tz]).concat(Intl.supportedValuesOf?.('timeZone').includes(tz) ? [] : [tz])
              .map((z) => ({ value: z, label: z.replace(/_/g, ' ').replace(/^(.*)\/([^/]+)$/, '$2 ($1)') })) },
          { name: 'apply_template', label: 'Start with an example daily schedule (you can edit it)', type: 'checkbox', value: true },
        ],
        onSubmit: (v) => api('/api/circles', { method: 'POST', body: v }),
      });
      if (r?.id) { await loadMe(); nav(circleLink(r.id, 'today')); }
    } }, 'Create a care circle');
  render(h('div', {},
    h('div', { class: 'row between' }, h('h1', {}, 'Your care circles'), newBtn),
    S.circles.length ? list : h('div', { class: 'card' }, list)));
}

// ---------- account settings ----------
async function settingsView() {
  const others = await api('/api/me/sessions').catch(() => ({ other_sessions: 0 }));
  const field = (label, input, help) => h('div', { class: 'field' }, h('label', { for: input.id }, label), input, help ? h('div', { class: 'small muted' }, help) : null);
  const status = (testid) => h('p', { class: 'small', role: 'status', testid, hidden: true });
  const say = (el, text, ok = true) => { el.textContent = text; el.className = `small ${ok ? 'ok-text' : 'bad-text'}`; el.hidden = false; };

  const nameIn = h('input', { id: 's_name', name: 'name', value: S.me.name, required: true, maxlength: 80, autocomplete: 'name', testid: 'settings-name' });
  const nameMsg = status('settings-name-status');
  const profile = h('form', { class: 'card', testid: 'settings-profile', onsubmit: async (e) => {
    e.preventDefault();
    try { const r = await api('/api/me', { method: 'PATCH', body: { name: nameIn.value } }); S.me = r.user; say(nameMsg, 'Name saved. Your new name appears on everything you record from now on.'); render(page(), 'settings'); }
    catch (err) { say(nameMsg, friendly(err), false); }
  } }, h('h2', {}, 'Profile'),
    field('Your name', nameIn, 'Shown next to everything you record and every handoff you prepare.'),
    h('div', { class: 'field' }, h('label', {}, 'Email'), h('p', { class: 'cl-readonly', testid: 'settings-email' }, S.me.email)),
    h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit', testid: 'settings-save-name' }, 'Save name')), nameMsg);

  const cur = h('input', { id: 's_cur', type: 'password', required: true, autocomplete: 'current-password', testid: 'settings-current-password' });
  const next = h('input', { id: 's_next', type: 'password', required: true, minlength: 8, autocomplete: 'new-password', testid: 'settings-new-password' });
  const pwMsg = status('settings-password-status');
  const password = h('form', { class: 'card', testid: 'settings-password', onsubmit: async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/me/password', { method: 'POST', body: { current: cur.value, next: next.value } });
      cur.value = ''; next.value = '';
      say(pwMsg, r.other_sessions_ended ? `Password changed. ${r.other_sessions_ended} other device(s) were signed out.` : 'Password changed.');
    } catch (err) { say(pwMsg, friendly(err), false); }
  } }, h('h2', {}, 'Password'),
    field('Current password', cur), field('New password', next, 'At least 8 characters. Changing it signs you out on your other devices.'),
    h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit', testid: 'settings-save-password' }, 'Change password')), pwMsg);

  const devMsg = status('settings-devices-status');
  const devices = h('div', { class: 'card', testid: 'settings-devices' }, h('h2', {}, 'Devices'),
    h('p', {}, others.other_sessions ? `You are also signed in on ${others.other_sessions} other device(s).` : 'You are only signed in on this device.'),
    h('p', { class: 'small muted' }, 'Lost a phone, or used a shared computer? Sign out everywhere except here.'),
    h('div', { class: 'row' }, h('button', { testid: 'settings-sign-out-others', disabled: !others.other_sessions, onclick: async () => {
      try { const r = await api('/api/me/sign-out-others', { method: 'POST' }); say(devMsg, `Signed out of ${r.ended} other device(s).`); } catch (err) { say(devMsg, friendly(err), false); }
    } }, 'Sign out of other devices')), devMsg);

  const page = () => h('div', { class: 'cl-settings' }, h('h1', {}, 'Settings'), profile, password, devices);
  render(page(), 'settings');
}

// ---------- circle loader ----------
async function enterCircle(id) {
  if (S.circle?.id === id && S._loadedAt && Date.now() - S._loadedAt < 2000) return;
  const r = await api(`/api/circles/${id}`);
  S.circle = r.circle; S.role = r.role; S.members = r.members; S._loadedAt = Date.now();
}
const memberName = (id) => S.members.find((m) => m.id === id)?.name ?? 'Someone';
const tz = () => S.circle.timezone;
export { memberName, tz };

// ---------- Today ----------
async function todayView() {
  const cid = S.circle.id;
  const data = await api(`/api/circles/${cid}/today`);
  // Notes entered today, so a note saved here stays in view. Administrations already show on the schedule.
  const since = encodeURIComponent(localInputToIso(`${data.date}T00:00`, tz()));
  const notes = can('read') ? (await api(`/api/circles/${cid}/records?since=${since}&limit=50`)).filter((r) => r.kind !== 'administration') : [];
  const canWrite = can('write_record');
  const status = (row) => {
    if (row.status === 'recorded') return h('span', { class: 'badge ok', testid: `status-${row.item.id}` }, `${row.record.outcome ?? 'recorded'} by ${row.record.author_name} at ${fmtTime(row.record.reported_at, tz())}`);
    if (row.status === 'no_record') return h('span', { class: 'badge warn', testid: `status-${row.item.id}` }, 'No administration recorded');
    return h('span', { class: 'badge', testid: `status-${row.item.id}` }, 'Upcoming');
  };
  const record = async (row, outcome) => {
    try {
      await api(`/api/circles/${cid}/records`, { method: 'POST', body: { kind: 'administration', schedule_item_id: row.item.id, scheduled_for: data.date, outcome, text: row.item.title } });
      toast('Recorded.'); route();
    } catch (e) {
      if (e.status === 409 && e.body.existing) {
        const ex = e.body.existing;
        const again = await modal({
          title: 'Already recorded',
          intro: `${ex.author_name} recorded this at ${fmtTime(ex.reported_at, tz())}. Nothing was added.`,
          submit: 'Record an additional one',
          fields: [{ name: 'text', label: 'If a second one really happened, say what happened', type: 'textarea', help: 'This is added as a flagged exception. The first record stays as it is.' }],
          onSubmit: (v) => api(`/api/circles/${cid}/records`, { method: 'POST', body: { kind: 'administration', schedule_item_id: row.item.id, scheduled_for: data.date, exception: true, text: v.text } }),
        });
        if (again) toast('Additional entry recorded and flagged.');
        route();
      } else toast(friendly(e));
    }
  };
  const quick = h('input', { id: 'ql', placeholder: 'e.g. gave Dad his morning medication at 8am', testid: 'quicklog-input', 'aria-label': 'Quick log' });
  const preview = h('div', { class: 'small muted', testid: 'quicklog-preview' });
  let t;
  quick.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      if (!quick.value.trim()) { preview.textContent = ''; return; }
      try {
        const { parsed } = await api(`/api/circles/${cid}/quicklog`, { method: 'POST', body: { text: quick.value, dry_run: true } });
        preview.textContent = parsed.matched ? `Will record: ${parsed.matched} (${parsed.confidence} confidence)` : `Will save as a ${parsed.kind} note`;
      } catch { preview.textContent = ''; }
    }, 250);
  });
  const quickForm = h('form', { onsubmit: async (ev) => {
    ev.preventDefault();
    try {
      const r = await api(`/api/circles/${cid}/quicklog`, { method: 'POST', body: { text: quick.value } });
      toast(r.parsed.matched ? `Recorded: ${r.parsed.matched}` : 'Note saved.'); route();
    } catch (e) {
      toast(e.status === 409 ? `Already recorded by ${e.body.existing.author_name}.` : friendly(e));
    }
  } }, h('div', { class: 'row' }, h('div', { class: 'grow' }, quick), h('button', { class: 'primary', type: 'submit', testid: 'quicklog-submit' }, 'Log')), preview);

  const noteBtn = h('button', { testid: 'add-note', onclick: async () => {
    const r = await modal({
      title: 'Add a note', submit: 'Save note',
      fields: [
        { name: 'kind', label: 'Type', type: 'select', value: 'observation', options: ['observation', 'incident', 'reading', 'meal', 'sleep', 'mood', 'visit'].map((k) => ({ value: k, label: k })) },
        { name: 'text', label: 'What happened?', type: 'textarea', required: true },
        { name: 'is_private', label: 'Private (only family caregivers can see it)', type: 'checkbox' },
      ],
      onSubmit: (v) => api(`/api/circles/${cid}/records`, { method: 'POST', body: v }),
    });
    if (r) { toast('Saved.'); route(); }
  } }, 'Add a note');

  render(h('div', {},
    h('div', { class: 'row between' }, h('h1', {}, `Today for ${S.circle.recipient_name}`), h('time', { class: 'muted', testid: 'today-date', datetime: data.date }, longDate(data.date))),
    can('write_record') ? h('div', { class: 'card' }, h('h2', {}, 'Quick log'), quickForm) : null,
    h('div', { class: 'card', testid: 'schedule' },
      h('h2', {}, 'Schedule'),
      data.items.length ? h('ul', { class: 'plain' }, data.items.map((row) => h('li', { testid: `item-${row.item.id}` },
        h('div', { class: 'row' },
          h('span', { class: 'time' }, row.item.time_of_day),
          h('div', { class: 'grow' }, h('strong', {}, row.item.title), row.item.instructions ? h('div', { class: 'small muted' }, row.item.instructions) : null),
          status(row),
          canWrite && row.status !== 'recorded' ? h('span', { class: 'row' },
            h('button', { class: 'primary small', testid: `given-${row.item.id}`, onclick: () => record(row, 'given') }, 'Mark given'),
            h('button', { class: 'small', testid: `refused-${row.item.id}`, onclick: () => record(row, 'refused') }, 'Refused'),
            h('button', { class: 'small', testid: `skipped-${row.item.id}`, onclick: () => record(row, 'skipped') }, 'Skipped')) : null),
        row.status === 'no_record' ? h('div', { class: 'small muted' }, 'Scheduled time passed; no administration recorded. Check before assuming.') : null,
        row.additional.map((a) => h('div', { class: 'small alert warn', style: 'margin-top:6px' }, `Additional entry by ${a.author_name} at ${fmtTime(a.reported_at, tz())}: ${a.text}`)))))
        : h('p', { class: 'muted' }, 'No schedule yet.'),
      can('schedule') ? h('button', { class: 'small', testid: 'add-schedule', onclick: async () => {
        const r = await modal({
          title: 'Add a scheduled item', submit: 'Add',
          intro: 'CareLog records what you enter. It does not suggest doses or timings.',
          fields: [
            { name: 'title', label: 'What is it?', required: true, placeholder: 'e.g. Evening medication' },
            { name: 'time_of_day', label: 'Time', type: 'time', value: '20:00', required: true },
            { name: 'category', label: 'Type', type: 'select', value: 'medication', options: ['medication', 'meal', 'task'].map((k) => ({ value: k, label: k })) },
            { name: 'instructions', label: 'Instructions (copy from the label or doctor)', type: 'textarea' },
          ],
          onSubmit: (v) => api(`/api/circles/${cid}/schedule`, { method: 'POST', body: v }),
        });
        if (r) route();
      } }, 'Add scheduled item') : null),
    h('div', { class: 'card', testid: 'today-notes' }, h('h2', {}, 'Notes today'),
      notes.length ? h('ul', { class: 'plain small' }, notes.map((r) => h('li', { testid: `today-note-${r.id}` },
        h('span', { class: 'time' }, fmtTime(r.reported_at, tz())), ' ', h('strong', {}, r.author_name), ' ', h('span', { class: 'badge' }, r.kind),
        r.is_private ? h('span', { class: 'badge' }, 'private') : null, ' ', r.text)))
        : h('p', { class: 'muted' }, 'No notes yet today.'),
      canWrite || can('write_visit') ? noteBtn : null)), 'today');
}

// ---------- Handoff ----------
async function handoffView() {
  const cid = S.circle.id;
  const list = await api(`/api/circles/${cid}/handoffs`);
  const [latest, narrative] = list[0] ? await Promise.all([
    api(`/api/circles/${cid}/handoffs/${list[0].id}`),
    api(`/api/circles/${cid}/handoffs/${list[0].id}/narrative`).catch(() => null),
  ]) : [null, null];

  const prepare = h('button', { class: 'primary', testid: 'prepare-handoff', onclick: async () => {
    const others = S.members.filter((m) => m.id !== S.me.id && m.status === 'active' && ['owner', 'caregiver', 'paid'].includes(m.role));
    const r = await modal({
      title: 'Prepare a handoff', submit: 'Prepare handoff',
      intro: 'Review recent care records, scheduled items with no entry, and tasks still waiting.',
      fields: [
        { name: 'to_user', label: 'Handing over to', type: 'select', options: [{ value: '', label: 'Anyone in the circle' }, ...others.map((m) => ({ value: m.id, label: m.name }))] },
        { name: 'note', label: 'Anything to add?', type: 'textarea' },
      ],
      onSubmit: (v) => api(`/api/circles/${cid}/handoffs`, { method: 'POST', body: { note: v.note, to_user: v.to_user ? Number(v.to_user) : undefined } }),
    });
    if (r) { toast('Handoff prepared.'); route(); }
  } }, 'Prepare a handoff');

  let view = h('div', { class: 'card' }, h('p', { class: 'muted', testid: 'no-handoffs' }, 'No handoffs yet. Before you finish, leave an update for the next caregiver.'));
  if (latest) {
    const mine = latest.acknowledged_by_you;
    const addressedToMe = !latest.to || latest.to.id === S.me.id;
    const canAck = latest.from.id !== S.me.id && addressedToMe && !mine && can('read');
    view = h('div', { testid: 'handoff-view' },
      h('div', { class: 'card' },
        h('div', { class: 'row between' },
          h('h2', {}, `Taking over from ${latest.from.name}`),
          h('span', { class: 'muted small' }, fmtDateTime(latest.created_at, tz()))),
        latest.to ? h('p', { class: 'small muted' }, `Addressed to ${latest.to.name}`) : null,
        latest.note ? h('p', {}, h('strong', {}, 'Note: '), latest.note) : null,
        latest.needs_attention ? h('div', { class: 'alert warn', role: 'alert', testid: 'updated-flag' }, 'Updated since you reviewed: something in this handoff was corrected after it was prepared. Look for the flagged entries below.') : null,
        latest.acknowledgements.length
          ? h('div', { class: 'alert ok', testid: 'ack-list' }, latest.acknowledgements.map((a) => h('div', {}, `Acknowledged by ${a.name} at ${fmtDateTime(a.acked_at, tz())}`)))
          : h('div', { class: 'alert info', testid: 'not-acked' }, 'Waiting for review.'),
        !canAck && !mine && latest.from.id === S.me.id ? h('p', { class: 'small muted', testid: 'ack-who' }, 'You prepared this handoff. The next caregiver acknowledges it.') : null,
        !canAck && !mine && latest.from.id !== S.me.id && !addressedToMe ? h('p', { class: 'small muted', testid: 'ack-who' }, `Only ${latest.to.name} can acknowledge this handoff.`) : null,
        canAck ? h('button', { class: 'primary', testid: 'ack-handoff', onclick: async () => {
          try { await api(`/api/circles/${cid}/handoffs/${latest.id}/ack`, { method: 'POST' }); toast('Acknowledged.'); route(); } catch (e) { toast(friendly(e)); }
        } }, 'I have reviewed this handoff') : null,
        h('p', { class: 'small muted' }, 'Acknowledging means you have seen this version. It does not mark anything as done.')),
      h('div', { class: 'card' }, h('h3', {}, 'Recorded since the last handoff'),
        latest.records.length ? h('ul', { class: 'plain', testid: 'handoff-records' }, latest.records.map((r) => h('li', {},
          h('span', { class: 'time' }, fmtTime(r.reported_at, tz())), ' ', h('strong', {}, r.author_name), ' ', h('span', { class: 'badge' }, r.kind), ' ', r.text,
          r.is_exception ? h('span', { class: 'badge warn' }, 'additional entry') : null,
          r.updated_since_you_reviewed || r.updated_since_prepared ? h('span', { class: 'badge bad', testid: 'entry-updated' }, mine ? 'Updated since you reviewed' : 'Corrected since prepared') : null))) : h('p', { class: 'muted' }, 'Nothing recorded in this period.')),
      h('div', { class: 'card' }, h('h3', {}, 'Needs checking'),
        latest.no_record.filter((m) => !m.now_recorded).length
          ? h('ul', { class: 'plain', testid: 'handoff-unrecorded' }, latest.no_record.filter((m) => !m.now_recorded).map((m) => h('li', {}, `${m.time_of_day} ${m.title}: scheduled time passed; no administration recorded.`)))
          : h('p', { class: 'muted' }, 'Nothing unrecorded.')),
      h('div', { class: 'card' }, h('h3', {}, 'Open items carried forward'),
        latest.open_items.length ? h('ul', { class: 'plain', testid: 'handoff-open' }, latest.open_items.map((i) => h('li', {}, h('strong', {}, i.title), ' ', h('span', { class: 'muted small' }, i.owner_name ? `owner: ${i.owner_name}` : 'no owner yet'))))
          : h('p', { class: 'muted' }, 'No open items.')),
      narrative ? h('div', { class: 'card', testid: 'narrative' }, h('h3', {}, narrative.ai_used ? 'Draft summary (AI-assisted)' : 'Draft summary'),
        narrative.summary ? h('p', {}, narrative.summary) : null,
        h('ul', { class: 'plain small' }, narrative.lines.map((l) => h('li', {}, l.text, ' ', h('span', { class: 'muted' }, `[${l.source.type} ${l.source.id}]`)))),
        h('p', { class: 'small muted' }, narrative.disclaimer)) : null);
  }
  render(h('div', {}, h('div', { class: 'row between' }, h('h1', {}, 'Handoff'), can('handoff') ? prepare : null), view,
    list.length > 1 ? h('div', { class: 'card' }, h('h3', {}, 'Earlier handoffs'), h('ul', { class: 'plain small' }, list.slice(1).map((x) => h('li', {}, `${fmtDateTime(x.created_at, tz())} from ${x.from_name}${x.to_name ? ` to ${x.to_name}` : ''} (${x.ack_count} acknowledged)`)))) : null), 'handoff');
}

// ---------- Open items ----------
async function itemsView() {
  const cid = S.circle.id;
  const items = await api(`/api/circles/${cid}/items?all=1`);
  const open = items.filter((i) => !i.resolved_at);
  const done = items.filter((i) => i.resolved_at);
  const people = S.members.filter((m) => m.status === 'active' && ['owner', 'caregiver', 'paid'].includes(m.role));
  const add = h('button', { class: 'primary', testid: 'add-item', onclick: async () => {
    const r = await modal({
      title: 'Add an open item', submit: 'Add',
      intro: 'It stays on every handoff until someone records an outcome.',
      fields: [
        { name: 'title', label: 'What needs doing?', required: true, placeholder: 'e.g. Book Thursday transport' },
        { name: 'owner_id', label: 'Who owns it?', type: 'select', options: [{ value: '', label: 'Nobody yet' }, ...people.map((m) => ({ value: m.id, label: m.name }))] },
        { name: 'due_date', label: 'Due date (optional)', type: 'date' },
      ],
      onSubmit: (v) => api(`/api/circles/${cid}/items`, { method: 'POST', body: { title: v.title, owner_id: v.owner_id ? Number(v.owner_id) : undefined, due_date: v.due_date || undefined } }),
    });
    if (r) route();
  } }, 'Add an item');
  render(h('div', {},
    h('div', { class: 'row between' }, h('h1', {}, 'Open items'), can('items') ? add : null),
    h('div', { class: 'card', testid: 'open-items' },
      open.length ? h('ul', { class: 'plain' }, open.map((i) => h('li', { testid: `open-${i.id}` },
        h('div', { class: 'row' },
          h('div', { class: 'grow' }, h('strong', {}, i.title), h('div', { class: 'small muted' }, `${i.owner_name ? `Owner: ${i.owner_name}` : 'No owner yet'}${i.due_date ? ` · due ${i.due_date}` : ''}${i.detail ? ` · ${i.detail}` : ''}`)),
          can('items') ? h('span', { class: 'row' },
            h('button', { class: 'small', testid: `take-${i.id}`, onclick: async () => { await api(`/api/circles/${cid}/items/${i.id}/assign`, { method: 'POST', body: { owner_id: S.me.id } }); route(); } }, 'I will do this'),
            h('button', { class: 'small primary', testid: `resolve-${i.id}`, onclick: async () => {
              const r = await modal({
                title: `Close: ${i.title}`, submit: 'Record outcome',
                intro: 'Say what happened. This is what the next person will read.',
                fields: [{ name: 'outcome', label: 'Outcome', type: 'textarea', required: true }],
                onSubmit: (v) => api(`/api/circles/${cid}/items/${i.id}/resolve`, { method: 'POST', body: v }),
              });
              if (r) route();
            } }, 'Close with outcome')) : null))))
        : h('p', { class: 'muted', testid: 'no-open' }, 'Nothing open. Everything is accounted for.')),
    done.length ? h('div', { class: 'card' }, h('h3', {}, 'Closed'), h('ul', { class: 'plain small', testid: 'closed-items' }, done.map((i) => h('li', {}, h('strong', {}, i.title), ` — ${i.outcome} (${i.resolved_by_name ?? 'someone'}, ${fmtDateTime(i.resolved_at, tz())})`)))) : null), 'items');
}

// ---------- Timeline with corrections ----------
async function timelineView() {
  const cid = S.circle.id;
  const recs = await api(`/api/circles/${cid}/records?limit=100`);
  const correct = async (r) => {
    const out = await modal({
      title: 'Correct this entry', submit: 'Save correction',
      intro: 'The original stays visible with your correction and reason next to it.',
      fields: [
        { name: 'text', label: 'Corrected text', type: 'textarea', value: r.text, required: true },
        ...(r.kind === 'administration' ? [{ name: 'outcome', label: 'Outcome', type: 'select', value: r.outcome, options: ['given', 'refused', 'skipped'].map((k) => ({ value: k, label: k })) }] : []),
        { name: 'reason', label: 'Why are you correcting it?', required: true },
      ],
      onSubmit: (v) => api(`/api/circles/${cid}/records/${r.id}/corrections`, { method: 'POST', body: { text: v.text, reason: v.reason, outcome: v.outcome && v.outcome !== r.outcome ? v.outcome : undefined } }),
    });
    if (out) { toast('Correction saved.'); route(); }
  };
  render(h('div', {}, h('h1', {}, 'Timeline'),
    h('div', { class: 'card', testid: 'timeline' },
      recs.length ? h('ul', { class: 'plain' }, recs.map((r) => h('li', { testid: `rec-${r.id}` },
        h('div', { class: 'row' },
          h('span', { class: 'time' }, fmtDateTime(r.reported_at, tz())),
          h('div', { class: 'grow' }, h('strong', {}, r.author_name), ' ', h('span', { class: 'badge' }, r.kind), r.is_private ? h('span', { class: 'badge' }, 'private') : null,
            r.is_exception ? h('span', { class: 'badge warn' }, 'additional entry') : null, r.source !== 'app' ? h('span', { class: 'badge' }, r.source.split(':')[0]) : null, ' ',
            r.corrected ? h('span', { class: 'orig' }, r.original.text) : null, r.corrected ? ' → ' : null, h('span', { testid: `rec-text-${r.id}` }, r.text),
            r.outcome && r.outcome !== 'given' ? h('span', { class: 'badge warn' }, r.outcome) : null,
            h('div', { class: 'small muted' }, `Entered ${fmtDateTime(r.entered_at, tz())}`)),
          can('write_record') ? h('button', { class: 'small', testid: `correct-${r.id}`, onclick: () => correct(r) }, 'Correct') : null),
        r.corrections.length ? h('div', { class: 'hist small', testid: `history-${r.id}` }, r.corrections.map((c) => h('div', {}, `${c.author_name} corrected this on ${fmtDateTime(c.entered_at, tz())}: ${c.reason}`))) : null)))
        : h('p', { class: 'muted' }, 'No entries yet.'))), 'timeline');
}

// ---------- People ----------
async function peopleView() {
  const cid = S.circle.id;
  const r = await api(`/api/circles/${cid}`);
  S.members = r.members;
  const invite = h('button', { class: 'primary', testid: 'invite', onclick: async () => {
    const out = await modal({
      title: 'Invite someone', submit: 'Create invite link',
      intro: 'They will get access as soon as they accept, and you can remove them at any time.',
      fields: [
        { name: 'role', label: 'Role', type: 'select', value: 'caregiver', options: [
          { value: 'caregiver', label: 'Family caregiver: can record and see everything' },
          { value: 'paid', label: 'Paid carer: can record, cannot see private notes or money' },
          { value: 'clinician', label: 'Clinician: read-only, time-limited' },
          { value: 'neighbour', label: 'Neighbour: can log visits and see the emergency card' },
          { value: 'recipient', label: 'The person being cared for: read-only' }] },
        { name: 'access_hours', label: 'Access lasts (hours) — required for clinicians', type: 'number', min: 1, max: 2160, help: 'Leave blank for no expiry.' },
      ],
      onSubmit: (v) => api(`/api/circles/${cid}/invites`, { method: 'POST', body: { role: v.role, access_hours: v.access_hours ? Number(v.access_hours) : undefined } }),
    });
    if (out?.token) {
      const link = `${location.origin}/invite/${out.token}`;
      const here = h('p', { class: 'small' }, 'Is the person with you? ', h('a', { href: `/invite/${out.token}`, testid: 'open-invite-here', onclick: () => document.getElementById('modal').close() }, 'Open the invite on this device'));
      await modal({ title: 'Invite link', submit: 'Done', intro: 'Send this link to the person. It works once.', extra: here, fields: [{ name: 'link', label: 'Link', value: link }] });
    }
  } }, 'Invite someone');
  render(h('div', {}, h('div', { class: 'row between' }, h('h1', {}, 'People'), can('members') ? invite : null),
    h('div', { class: 'card', testid: 'members' }, h('ul', { class: 'plain' }, S.members.filter((m) => m.status === 'active').map((m) => h('li', { testid: `member-${m.id}` },
      h('div', { class: 'row' }, h('div', { class: 'grow' }, h('strong', {}, m.name), ' ', h('span', { class: 'badge' }, m.role), m.expires_at ? h('span', { class: 'badge warn' }, `access ends ${fmtDateTime(m.expires_at, tz())}`) : null),
        can('members') && m.role !== 'owner' ? h('button', { class: 'small danger', testid: `remove-${m.id}`, onclick: async () => {
          const ok = await modal({ title: `Remove ${m.name}?`, submit: 'Remove', danger: true, intro: 'They lose access immediately. Their past entries stay in the record. Open items they owned become unowned.', onSubmit: () => api(`/api/circles/${cid}/members/${m.id}`, { method: 'DELETE' }) });
          if (ok) { toast(`${m.name} removed.`); route(); }
        } }, 'Remove') : null))))),
    can('read') ? h('p', { class: 'small muted' }, 'Anything a person has already seen cannot be taken back, but they cannot see anything new once removed.') : null), 'people');
}

// ---------- emergency page for people with only a link ----------
async function publicEmergency(token) {
  let p;
  try { p = await api(`/api/emergency/${token}`); } catch (e) {
    render(h('div', { class: 'alert bad', role: 'alert', testid: 'emergency-error' }, friendly(e))); return;
  }
  root.replaceChildren(h('div', { class: 'wrap' }, h('main', { id: 'main' },
    h('h1', { testid: 'emergency-title' }, `Emergency information: ${p.recipient}`),
    h('p', { class: 'small muted' }, `Read-only. This link expires ${new Date(p.link_expires_at).toLocaleString()}.`),
    h('div', { class: 'card' }, h('h2', {}, 'Medications'), p.medications.length ? h('ul', { class: 'plain' }, p.medications.map((m) => h('li', {}, `${m.time_of_day} ${m.title}${m.instructions ? ` — ${m.instructions}` : ''}`))) : h('p', { class: 'muted' }, 'None listed.')),
    h('div', { class: 'card' }, h('h2', {}, 'Allergies, conditions and key information'), p.documents.length ? h('ul', { class: 'plain' }, p.documents.map((d) => h('li', {}, h('strong', {}, d.title), h('pre', { class: 'wrapme' }, d.body)))) : h('p', { class: 'muted' }, 'None listed.')),
    h('div', { class: 'card' }, h('h2', {}, 'Last 48 hours'), p.recent_records.length ? h('ul', { class: 'plain small' }, p.recent_records.map((r) => h('li', {}, `${new Date(r.reported_at).toLocaleString()} · ${r.by} · ${r.kind}: ${r.text}`))) : h('p', { class: 'muted' }, 'Nothing recorded.')),
    h('div', { class: 'card' }, h('h2', {}, 'Contacts'), h('ul', { class: 'plain' }, p.contacts.map((c) => h('li', {}, `${c.name} (${c.role})`)))),
    null)));
}

// An invite opened by someone already in the circle is usually being set up for a person sitting
// next to them. Offer to sign out on this device and keep the invite for the new person.
function inviteForSomeoneElse(tok) {
  render(h('div', { class: 'card', testid: 'invite-someone-else' },
    h('h1', {}, 'This invite is for someone else'),
    h('p', {}, `You are already in this care circle as ${S.me.name}. If the person you invited is with you, sign out so they can join on this device.`),
    h('div', { class: 'row' },
      h('button', { class: 'primary', testid: 'invite-switch', onclick: async () => {
        try { await api('/api/logout', { method: 'POST' }); } catch { /* already signed out */ }
        S.me = null; S.circle = null; sessionStorage.setItem('cl_invite', tok);
        nav(`/invite/${tok}`);
      } }, 'Sign out so they can join'),
      h('a', { class: 'btn', href: '/' }, 'Back to my circles'))));
}

// ---------- router ----------
let busy = false;
let routePending = false;
export async function route() {
  if (busy) { routePending = true; return; } busy = true;
  try {
    cleanupLandingMotion();
    document.body.classList.remove('marketing');
    if (location.hash.startsWith('#/')) history.replaceState({}, '', location.hash.slice(1).replace(/^\/c\//, '/circles/'));
    const path = location.pathname;
    const hash = path;
    if (path.startsWith('/e/')) { await publicEmergency(path.slice(3)); return; }
    // Who you are is re-read at most every 30 seconds while moving around the app; the server
    // still checks the session and membership on every request.
    if (!S.me || Date.now() - (S._meAt || 0) > 30000) { await loadMe(); S._meAt = Date.now(); }
    const inv = hash.match(/^\/invite\/(.+)$/);
    if (!S.me) {
      if (inv) sessionStorage.setItem('cl_invite', inv[1]);
      if (inv || !['/', '/how-it-works', '/for-families', '/questions'].includes(hash)) authView(inv?.[1], hash === '/signup' ? 'signup' : undefined);
      else landingView(root);
      return;
    }
    const pending = inv?.[1] || sessionStorage.getItem('cl_invite');
    if (pending) {
      sessionStorage.removeItem('cl_invite');
      try {
        const r = await api(`/api/invites/${pending}/accept`, { method: 'POST' });
        await loadMe(); toast('You have joined the care circle.'); S.circle = null;
        busy = false; nav(circleLink(r.circle_id, 'today')); return;
      } catch (e) {
        if (inv && e.message === 'already_member') { inviteForSomeoneElse(inv[1]); return; }
        toast(friendly(e)); if (inv) { busy = false; nav('/'); return; }
      }
    }
    if (hash === '/settings') { S.circle = null; await settingsView(); return; }
    const m = hash.match(/^\/circles\/(\d+)\/(\w+)$/);
    if (!m) { S.circle = null; await homeView(); return; }
    await enterCircle(Number(m[1]));
    const tab = m[2];
    const views = { today: todayView, handoff: handoffView, items: itemsView, timeline: timelineView, people: peopleView, ...moreViews(S, { render, can, tz, route }) };
    if (!views[tab]) { nav(circleLink(S.circle.id, 'today')); return; }
    if (!S.role || (!can('read') && !['emergency', 'today'].includes(tab) && !can('emergency_view'))) { render(h('div', { class: 'alert warn' }, 'Your role does not include this section.'), tab); return; }
    if (!can('read') && tab === 'today') { render(h('div', { class: 'alert info', testid: 'limited' }, h('p', {}, `You can log a visit and see the emergency card for ${S.circle.recipient_name}.`), h('a', { class: 'btn', href: circleLink(S.circle.id, 'emergency') }, 'Open emergency card')), 'today'); return; }
    await views[tab]();
  } catch (e) {
    if (e instanceof ApiError && e.status === 404 && /circle/.test(e.message)) { S.circle = null; toast('That care circle is not available to you.'); busy = false; nav('#/'); return; }
    fatal(e);
  } finally { busy = false; if (routePending) { routePending = false; queueMicrotask(route); } }
}
document.querySelector('.skip').addEventListener('click', (event) => {
  event.preventDefault();
  const main = document.getElementById('main');
  if (main) { main.tabIndex = -1; main.focus(); main.scrollIntoView(); }
});
window.addEventListener('popstate', route);
// Same-origin links navigate inside the app instead of reloading the page.
document.addEventListener('click', (ev) => {
  const a = ev.target.closest?.('a[href]');
  if (!a || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || a.target) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/e/') || /\.[a-z0-9]+$/i.test(url.pathname)) return;
  ev.preventDefault(); nav(url.pathname);
});
route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch(() => {});
}

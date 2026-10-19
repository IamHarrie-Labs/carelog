import { h, api, ApiError, friendly, toast, modal, fmtTime, fmtDateTime } from './ui.js';
import { moreViews } from './more.js';

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

const nav = (path) => { location.hash = path; };
const circleLink = (id, tab) => `#/c/${id}/${tab}`;

function fatal(e) {
  root.replaceChildren(h('div', { class: 'wrap' }, h('div', { class: 'alert bad', role: 'alert' }, friendly(e))));
}

function shell(content, tab) {
  const links = [];
  if (S.circle) {
    const add = (t, label, ok = true) => ok && links.push(h('a', { href: circleLink(S.circle.id, t), 'aria-current': tab === t ? 'page' : null, testid: `tab-${t}` }, label));
    add('today', 'Today', can('read'));
    add('handoff', 'Handoff', can('read'));
    add('items', 'Open items', can('read'));
    add('timeline', 'Timeline', can('read'));
    add('people', 'People', can('read'));
    add('emergency', 'Emergency', can('emergency') || can('emergency_view'));
    add('money', 'Money', can('money'));
    add('load', 'Care load', can('read'));
    add('appointments', 'Appointments', can('read'));
    add('supplies', 'Supplies', can('read'));
    add('documents', 'Documents', can('read'));
    add('digest', 'Digest', can('read'));
  }
  return [
    h('header', { class: 'top' }, h('div', { class: 'wrap' },
      h('a', { class: 'brand', href: '#/', testid: 'brand' }, 'CareLog'),
      S.me ? h('span', { class: 'small muted', testid: 'whoami' }, S.me.name) : null,
      S.me ? h('button', { class: 'small', testid: 'logout', onclick: logout }, 'Sign out') : null)),
    S.circle ? h('nav', { class: 'tabs', 'aria-label': 'Care circle sections' }, h('div', { class: 'wrap' }, links)) : null,
    h('main', { id: 'main', class: 'wrap' }, content),
  ];
}
const render = (content, tab) => root.replaceChildren(...shell(content, tab).filter(Boolean));

async function logout() {
  try { await api('/api/logout', { method: 'POST' }); } catch { /* already signed out */ }
  S.me = null; S.circle = null; nav('#/');
  route();
}

async function loadMe() {
  try {
    const r = await api('/api/me');
    S.me = r.user; S.circles = r.circles;
  } catch (e) {
    if (e.status !== 401) throw e;
    S.me = null; S.circles = [];
  }
}

// ---------- sign in / sign up ----------
function authView(inviteToken) {
  let mode = 'signup';
  const err = h('div', { class: 'alert bad', role: 'alert', hidden: true, testid: 'auth-error' });
  const form = h('form', { testid: 'auth-form' });
  const draw = () => {
    form.replaceChildren(
      h('div', { class: 'tabs-auth' },
        h('button', { type: 'button', 'aria-pressed': mode === 'signup', testid: 'mode-signup', onclick: () => { mode = 'signup'; draw(); } }, 'Create account'),
        h('button', { type: 'button', 'aria-pressed': mode === 'login', testid: 'mode-login', onclick: () => { mode = 'login'; draw(); } }, 'Sign in')),
      mode === 'signup' ? h('div', { class: 'field' }, h('label', { for: 'a_name' }, 'Your name'), h('input', { id: 'a_name', name: 'name', required: true, autocomplete: 'name', testid: 'auth-name' })) : null,
      h('div', { class: 'field' }, h('label', { for: 'a_email' }, 'Email'), h('input', { id: 'a_email', name: 'email', type: 'email', required: true, autocomplete: 'email', testid: 'auth-email' })),
      h('div', { class: 'field' }, h('label', { for: 'a_pw' }, 'Password'), h('input', { id: 'a_pw', name: 'password', type: 'password', required: true, minlength: 8, autocomplete: mode === 'signup' ? 'new-password' : 'current-password', testid: 'auth-password' }),
        mode === 'signup' ? h('div', { class: 'small muted' }, 'At least 8 characters.') : null),
      err,
      h('button', { class: 'primary', type: 'submit', testid: 'auth-submit', style: 'width:100%' }, mode === 'signup' ? 'Create account' : 'Sign in'));
  };
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.hidden = true;
    const fd = Object.fromEntries(new FormData(form));
    try {
      await api(mode === 'signup' ? '/api/signup' : '/api/login', { method: 'POST', body: fd });
      await loadMe();
      route();
    } catch (e) { err.hidden = false; err.textContent = friendly(e); }
  });
  draw();
  render(h('div', {},
    h('div', { class: 'hero' },
      h('h1', {}, 'Everyone sees the same record of care.'),
      h('p', {}, 'CareLog is a shared log for families who take turns caring for someone. Record what was done, hand over clearly, and keep unfinished jobs on the list until someone closes them.'),
      inviteToken ? h('div', { class: 'alert info', testid: 'invite-banner' }, 'You have been invited to a care circle. Sign in or create an account to join.') : null),
    h('div', { class: 'card', style: 'max-width:420px;margin:0 auto' }, form),
    h('p', { class: 'small muted', style: 'text-align:center;margin-top:16px' }, 'CareLog records what people enter. It does not give medical advice or tell anyone when to give a dose.')));
}

// ---------- home ----------
async function homeView() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const templates = await api('/api/templates');
  const list = S.circles.length
    ? h('ul', { class: 'plain', testid: 'circle-list' }, S.circles.map((c) => h('li', {}, h('a', { href: circleLink(c.id, 'today'), testid: `circle-${c.id}` }, c.name), ' ', h('span', { class: 'badge' }, c.role), ' ', h('span', { class: 'muted small' }, `caring for ${c.recipient_name}`))))
    : h('p', { class: 'muted', testid: 'no-circles' }, 'You are not in a care circle yet. Create one, or open an invite link someone sent you.');
  render(h('div', {},
    h('h1', {}, 'Your care circles'),
    h('div', { class: 'card' }, list),
    h('button', { class: 'primary', testid: 'new-circle', onclick: async () => {
      const r = await modal({
        title: 'Create a care circle',
        intro: 'One circle per person being cared for.',
        submit: 'Create circle',
        fields: [
          { name: 'name', label: 'Circle name', required: true, placeholder: "e.g. Dad's care" },
          { name: 'recipient_name', label: 'Who is being cared for?', required: true, placeholder: 'e.g. Dad' },
          { name: 'kind', label: 'Type of care', type: 'select', value: 'adult', options: Object.entries(templates).map(([k, v]) => ({ value: k, label: v.label })) },
          { name: 'timezone', label: 'Time zone', value: tz, help: 'Schedules run on this clock.' },
          { name: 'apply_template', label: 'Start with an example daily schedule (you can edit it)', type: 'checkbox', value: true },
        ],
        onSubmit: (v) => api('/api/circles', { method: 'POST', body: v }),
      });
      if (r?.id) { await loadMe(); nav(circleLink(r.id, 'today')); }
    } }, 'Create a care circle')));
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
    h('div', { class: 'row between' }, h('h1', {}, `Today for ${S.circle.recipient_name}`), h('span', { class: 'muted', testid: 'today-date' }, data.date)),
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
    canWrite || can('write_visit') ? noteBtn : null), 'today');
}

// ---------- Handoff ----------
async function handoffView() {
  const cid = S.circle.id;
  const list = await api(`/api/circles/${cid}/handoffs`);
  const latest = list[0] ? await api(`/api/circles/${cid}/handoffs/${list[0].id}`) : null;
  const narrative = latest ? await api(`/api/circles/${cid}/handoffs/${latest.id}/narrative`).catch(() => null) : null;

  const prepare = h('button', { class: 'primary', testid: 'prepare-handoff', onclick: async () => {
    const others = S.members.filter((m) => m.id !== S.me.id && m.status === 'active' && ['owner', 'caregiver', 'paid'].includes(m.role));
    const r = await modal({
      title: 'Prepare a handoff', submit: 'Prepare handoff',
      intro: 'This pulls together what has been recorded since the last handoff, anything with no record, and every open item.',
      fields: [
        { name: 'to_user', label: 'Handing over to', type: 'select', options: [{ value: '', label: 'Anyone in the circle' }, ...others.map((m) => ({ value: m.id, label: m.name }))] },
        { name: 'note', label: 'Anything to add?', type: 'textarea' },
      ],
      onSubmit: (v) => api(`/api/circles/${cid}/handoffs`, { method: 'POST', body: { note: v.note, to_user: v.to_user ? Number(v.to_user) : undefined } }),
    });
    if (r) { toast('Handoff prepared.'); route(); }
  } }, 'Prepare a handoff');

  let view = h('div', { class: 'card' }, h('p', { class: 'muted', testid: 'no-handoffs' }, 'No handoffs yet. When your shift ends, prepare one so the next person knows exactly where things stand.'));
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
          : h('div', { class: 'alert info', testid: 'not-acked' }, 'Not acknowledged yet.'),
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
      const link = `${location.origin}/#/invite/${out.token}`;
      await modal({ title: 'Invite link', submit: 'Done', intro: 'Send this link to the person. It works once.', fields: [{ name: 'link', label: 'Link', value: link }] });
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
    h('p', { class: 'small muted' }, 'Recorded by family and carers. Not medical advice.'))));
}

// ---------- router ----------
let busy = false;
export async function route() {
  if (busy) return; busy = true;
  try {
    const hash = location.hash.replace(/^#/, '') || '/';
    const path = location.pathname;
    if (path.startsWith('/e/')) { await publicEmergency(path.slice(3)); return; }
    await loadMe();
    const inv = hash.match(/^\/invite\/(.+)$/);
    if (!S.me) { authView(inv?.[1]); if (inv) sessionStorage.setItem('cl_invite', inv[1]); return; }
    const pending = inv?.[1] || sessionStorage.getItem('cl_invite');
    if (pending) {
      sessionStorage.removeItem('cl_invite');
      try {
        const r = await api(`/api/invites/${pending}/accept`, { method: 'POST' });
        await loadMe(); toast('You have joined the care circle.'); S.circle = null;
        busy = false; nav(circleLink(r.circle_id, 'today')); return;
      } catch (e) { toast(friendly(e)); if (inv) { busy = false; nav('#/'); return; } }
    }
    const m = hash.match(/^\/c\/(\d+)\/(\w+)$/);
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
  } finally { busy = false; }
}
window.addEventListener('hashchange', route);
route();

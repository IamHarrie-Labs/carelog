import { h, api, friendly, toast, modal, fmtDateTime, money, localInputToIso } from './ui.js';

export function moreViews(S, { render, can, tz, route }) {
  const cid = () => S.circle.id;
  const people = () => S.members.filter((m) => m.status === 'active' && ['owner', 'caregiver', 'paid'].includes(m.role));

  async function emergency() {
    const card = await api(`/api/circles/${cid()}/emergency-card`);
    const links = can('emergency') ? await api(`/api/circles/${cid()}/emergency-links`) : [];
    const create = h('button', { class: 'primary', testid: 'create-emergency-link', onclick: async () => {
      const out = await modal({
        title: 'Create an emergency link', submit: 'Create link',
        intro: 'Anyone with the link sees a read-only packet: medicines, allergies, recent entries and contacts. Private notes are never included.',
        fields: [{ name: 'hours', label: 'Link lasts (hours)', type: 'number', value: 24, min: 1, max: 72 }],
        onSubmit: (v) => api(`/api/circles/${cid()}/emergency-links`, { method: 'POST', body: { hours: Number(v.hours) } }),
      });
      if (out) {
        await modal({ title: 'Emergency link', submit: 'Done', intro: 'Share this with paramedics or hospital staff. You can revoke it any time.', fields: [{ name: 'l', label: 'Link', value: `${location.origin}${out.path}` }] });
        route();
      }
    } }, 'Create emergency link');
    const live = links.filter((l) => !l.revoked_at && Date.parse(l.expires_at) > Date.now());
    render(h('div', {}, h('div', { class: 'row between' }, h('h1', {}, 'Emergency packet'), can('emergency') ? create : null),
      can('emergency') ? h('div', { class: 'card', testid: 'emergency-links' }, h('h2', {}, 'Active links'),
        live.length ? h('ul', { class: 'plain' }, live.map((l) => h('li', {}, h('div', { class: 'row' }, h('span', { class: 'grow small' }, `Expires ${fmtDateTime(l.expires_at, tz())}`),
          h('a', { class: 'small', href: `/e/${l.token}`, target: '_blank', rel: 'noopener' }, 'Open'),
          h('button', { class: 'small danger', testid: 'revoke-link', onclick: async () => { await api(`/api/circles/${cid()}/emergency-links/${l.token}`, { method: 'DELETE' }); toast('Link revoked.'); route(); } }, 'Revoke'))))) : h('p', { class: 'muted' }, 'No active links.')) : null,
      h('div', { class: 'card', testid: 'emergency-preview' }, h('h2', {}, 'What the packet contains'),
        h('h3', {}, 'Medications'), card.medications.length ? h('ul', { class: 'plain small' }, card.medications.map((m) => h('li', {}, `${m.time_of_day} ${m.title}`))) : h('p', { class: 'muted small' }, 'None listed. Add scheduled items on the Today tab.'),
        h('h3', {}, 'Key information'), card.documents.length ? h('ul', { class: 'plain small' }, card.documents.map((d) => h('li', {}, h('strong', {}, d.title), ': ', d.body))) : h('p', { class: 'muted small' }, 'None yet. Mark a document as "include in emergency packet" on the Documents tab.'))), 'emergency');
  }

  async function moneyView() {
    const [list, sum] = await Promise.all([api(`/api/circles/${cid()}/expenses`), api(`/api/circles/${cid()}/expenses/summary`)]);
    const add = h('button', { class: 'primary', testid: 'add-expense', onclick: async () => {
      const out = await modal({
        title: 'Add an expense', submit: 'Add',
        fields: [
          { name: 'description', label: 'What was it for?', required: true, placeholder: 'e.g. Prescription' },
          { name: 'amount', label: 'Amount', type: 'number', step: '0.01', min: '0.01', required: true },
          { name: 'currency', label: 'Currency', value: 'USD' },
          { name: 'spent_on', label: 'Date', type: 'date' },
        ],
        onSubmit: (v) => api(`/api/circles/${cid()}/expenses`, { method: 'POST', body: { ...v, spent_on: v.spent_on || undefined } }),
      });
      if (out) route();
    } }, 'Add expense');
    render(h('div', {}, h('div', { class: 'row between' }, h('h1', {}, 'Money'), add),
      h('p', { class: 'muted' }, 'Costs are split equally between family caregivers. This shows who is owed what; it does not move money.'),
      Object.entries(sum).map(([cur, s]) => h('div', { class: 'card', testid: `summary-${cur}` }, h('h2', {}, `${cur}: ${money(s.total_cents, cur)} total`),
        h('ul', { class: 'plain' }, s.people.map((p) => h('li', { class: 'row between' }, h('span', {}, p.name), h('span', {}, `paid ${money(p.paid_cents, cur)} · share ${money(p.share_cents, cur)} · `, h('strong', { class: p.balance_cents < 0 ? 'bad' : '' }, p.balance_cents >= 0 ? `owed ${money(p.balance_cents, cur)}` : `owes ${money(-p.balance_cents, cur)}`))))))),
      h('div', { class: 'card' }, h('h3', {}, 'Expenses'), list.length ? h('ul', { class: 'plain small', testid: 'expenses' }, list.map((e) => h('li', {}, `${e.spent_on} · ${e.payer_name} · ${e.description} · ${money(e.amount_cents, e.currency)}`))) : h('p', { class: 'muted' }, 'No expenses yet.'))), 'money');
  }

  async function load() {
    const d = await api(`/api/circles/${cid()}/load?days=30`);
    const mine = await api(`/api/circles/${cid()}/checkins`).catch(() => []);
    const shifts = await api(`/api/circles/${cid()}/shifts`).catch(() => []);
    render(h('div', {}, h('h1', {}, 'Care load'),
      d.imbalance ? h('div', { class: 'alert warn', role: 'alert', testid: 'imbalance' }, d.imbalance.message) : h('div', { class: 'alert ok' }, 'Care hours look reasonably shared.'),
      d.check_in_suggested ? h('div', { class: 'alert info', testid: 'checkin-suggested' }, 'Your last few check-ins were low. Consider asking someone to cover a shift so you can rest.') : null,
      h('div', { class: 'card', testid: 'load-people' }, h('h2', {}, 'Last 30 days'), h('ul', { class: 'plain' }, d.people.map((p) => h('li', {},
        h('div', { class: 'row between' }, h('strong', {}, p.name), h('span', { class: 'small muted' }, `${p.care_hours}h care · ${p.respite_hours}h respite · ${p.records} entries`)),
        h('div', { class: 'bar', role: 'img', 'aria-label': `${p.share}% of care hours` }, h('span', { style: `width:${p.share}%` })))))),
      h('div', { class: 'card', testid: 'shifts-list' }, h('h2', {}, 'Recent shifts and breaks'),
        shifts.length ? h('ul', { class: 'plain small' }, shifts.slice(0, 15).map((s) => h('li', { testid: `shift-${s.id}` },
          `${s.user_name} · ${s.kind === 'respite' ? 'took a break' : 'provided care'} · ${fmtDateTime(s.starts_at, tz())} to ${fmtDateTime(s.ends_at, tz())}`)))
          : h('p', { class: 'muted', testid: 'no-shifts' }, 'No shifts logged yet.')),
      can('shifts') ? h('div', { class: 'card' }, h('div', { class: 'row' },
        h('button', { testid: 'add-shift', onclick: async () => {
          const out = await modal({ title: 'Log a shift or a break', submit: 'Save',
            fields: [
              { name: 'kind', label: 'Type', type: 'select', value: 'care', options: [{ value: 'care', label: 'I provided care' }, { value: 'respite', label: 'I took a break (respite)' }] },
              { name: 'starts_at', label: 'Start', type: 'datetime-local', required: true },
              { name: 'ends_at', label: 'End', type: 'datetime-local', required: true },
            ],
            onSubmit: (v) => api(`/api/circles/${cid()}/shifts`, { method: 'POST', body: { kind: v.kind, starts_at: localInputToIso(v.starts_at, tz()), ends_at: localInputToIso(v.ends_at, tz()) } }) });
          if (out) route();
        } }, 'Log a shift'),
        h('button', { testid: 'add-checkin', onclick: async () => {
          const out = await modal({ title: 'How are you doing?', submit: 'Save check-in', intro: 'Only you can see this.',
            fields: [{ name: 'mood', label: 'Mood', type: 'select', value: '3', options: [{ value: 5, label: '5 — good' }, { value: 4, label: '4' }, { value: 3, label: '3 — okay' }, { value: 2, label: '2' }, { value: 1, label: '1 — struggling' }] }, { name: 'text', label: 'Anything to note?', type: 'textarea' }],
            onSubmit: (v) => api(`/api/circles/${cid()}/checkins`, { method: 'POST', body: { mood: Number(v.mood), text: v.text } }) });
          if (out) { toast('Saved privately.'); route(); }
        } }, 'Private check-in')), mine.length ? h('p', { class: 'small muted' }, `You have ${mine.length} private check-in(s).`) : null) : null), 'load');
  }

  async function appointments() {
    const list = await api(`/api/circles/${cid()}/appointments`);
    const add = h('button', { class: 'primary', testid: 'add-appointment', onclick: async () => {
      const out = await modal({ title: 'Add an appointment', submit: 'Add', intro: 'If no one is assigned, we will add a task to arrange who is going.',
        fields: [
          { name: 'title', label: 'What is it?', required: true, placeholder: 'e.g. Cardiology check-up' },
          { name: 'starts_at', label: 'When', type: 'datetime-local', required: true },
          { name: 'location', label: 'Where' },
          { name: 'taker_id', label: 'Who is taking them?', type: 'select', options: [{ value: '', label: 'Nobody yet' }, ...people().map((m) => ({ value: m.id, label: m.name }))] },
        ],
        onSubmit: (v) => api(`/api/circles/${cid()}/appointments`, { method: 'POST', body: { title: v.title, location: v.location, starts_at: localInputToIso(v.starts_at, tz()), taker_id: v.taker_id ? Number(v.taker_id) : undefined } }) });
      if (out) route();
    } }, 'Add appointment');
    render(h('div', {}, h('div', { class: 'row between' }, h('h1', {}, 'Appointments'), can('appointments') ? add : null),
      h('div', { class: 'card', testid: 'appointments' }, list.length ? h('ul', { class: 'plain' }, list.map((a) => h('li', {},
        h('div', { class: 'row' }, h('div', { class: 'grow' }, h('strong', {}, a.title), h('div', { class: 'small muted' }, `${fmtDateTime(a.starts_at, tz())}${a.location ? ` · ${a.location}` : ''} · ${a.taker_name ? `taken by ${a.taker_name}` : 'nobody assigned yet'}`),
          a.after_notes ? h('div', { class: 'small' }, `After the appointment: ${a.after_notes}`) : null),
          can('appointments') ? h('button', { class: 'small', testid: `after-${a.id}`, onclick: async () => {
            const out = await modal({ title: 'What did the doctor say?', submit: 'Save', fields: [{ name: 'after_notes', label: 'Notes after the appointment', type: 'textarea', value: a.after_notes }],
              onSubmit: (v) => api(`/api/circles/${cid()}/appointments/${a.id}`, { method: 'PATCH', body: v }) });
            if (out) route();
          } }, 'Add notes') : null)))) : h('p', { class: 'muted' }, 'No appointments yet.')),
      h('a', { class: 'btn', href: `/api/circles/${cid()}/calendar.ics`, testid: 'download-ics' }, 'Download calendar file (.ics)')), 'appointments');
  }

  async function supplies() {
    const list = await api(`/api/circles/${cid()}/supplies`);
    const add = h('button', { class: 'primary', testid: 'add-supply', onclick: async () => {
      const out = await modal({ title: 'Track a supply', submit: 'Add', intro: 'When it runs low, an open item is created so someone refills it.',
        fields: [{ name: 'name', label: 'What is it?', required: true, placeholder: 'e.g. Metformin 500mg' }, { name: 'remaining', label: 'How many are left?', type: 'number', min: 0, required: true }, { name: 'per_day', label: 'Used per day', type: 'number', step: '0.5', min: 0, value: 1 }, { name: 'warn_days', label: 'Warn when this many days are left', type: 'number', value: 5 }],
        onSubmit: (v) => api(`/api/circles/${cid()}/supplies`, { method: 'POST', body: { name: v.name, remaining: Number(v.remaining), per_day: Number(v.per_day), warn_days: Number(v.warn_days) } }) });
      if (out) route();
    } }, 'Add supply');
    render(h('div', {}, h('div', { class: 'row between' }, h('h1', {}, 'Supplies'), can('supplies') ? add : null),
      h('div', { class: 'card', testid: 'supplies' }, list.length ? h('ul', { class: 'plain' }, list.map((s) => h('li', { class: 'row' },
        h('div', { class: 'grow' }, h('strong', {}, s.name), h('div', { class: 'small muted' }, `${s.remaining} left · about ${s.days_left ?? '—'} day(s)`)),
        s.days_left != null && s.days_left <= s.warn_days ? h('span', { class: 'badge warn' }, 'Running low') : null,
        can('supplies') ? h('button', { class: 'small', testid: `restock-${s.id}`, onclick: async () => {
          const out = await modal({ title: `Update ${s.name}`, submit: 'Save', fields: [{ name: 'remaining', label: 'How many are left now?', type: 'number', min: 0, value: s.remaining, required: true }],
            onSubmit: (v) => api(`/api/circles/${cid()}/supplies/${s.id}`, { method: 'PATCH', body: { remaining: Number(v.remaining) } }) });
          if (out) route();
        } }, 'Update count') : null))) : h('p', { class: 'muted' }, 'Add supplies you want to keep an eye on.'))), 'supplies');
  }

  async function documents() {
    const docs = await api(`/api/circles/${cid()}/documents`);
    const form = (d) => ({
      title: d ? `Edit ${d.title}` : 'Add a document', submit: 'Save',
      fields: [
        { name: 'title', label: 'Title', required: true, value: d?.title, placeholder: 'e.g. Allergies' },
        { name: 'category', label: 'Category', type: 'select', value: d?.category || 'general', options: ['general', 'allergies', 'conditions', 'insurance', 'legal', 'contacts'].map((k) => ({ value: k, label: k })) },
        { name: 'body', label: 'Details', type: 'textarea', value: d?.body },
        { name: 'is_emergency', label: 'Include in the emergency packet', type: 'checkbox', value: d?.is_emergency },
        { name: 'is_private', label: 'Private (family caregivers only; never in the emergency packet)', type: 'checkbox', value: d?.is_private },
      ],
      onSubmit: (v) => api(`/api/circles/${cid()}/documents${d ? `/${d.id}` : ''}`, { method: d ? 'PATCH' : 'POST', body: v }),
    });
    render(h('div', {}, h('div', { class: 'row between' }, h('h1', {}, 'Documents'), can('docs') ? h('button', { class: 'primary', testid: 'add-document', onclick: async () => { if (await modal(form())) route(); } }, 'Add document') : null),
      h('div', { class: 'card', testid: 'documents' }, docs.length ? h('ul', { class: 'plain' }, docs.map((d) => h('li', {}, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('strong', {}, d.title), ' ', h('span', { class: 'badge' }, d.category), d.is_emergency ? h('span', { class: 'badge ok' }, 'in emergency packet') : null, d.is_private ? h('span', { class: 'badge' }, 'private') : null, h('pre', { class: 'wrapme small' }, d.body)),
        can('docs') ? h('button', { class: 'small', onclick: async () => { if (await modal(form(d))) route(); } }, 'Edit') : null)))) : h('p', { class: 'muted' }, 'No documents yet. Start with allergies and conditions.')),
      can('export') ? h('a', { class: 'btn', href: `/api/circles/${cid()}/export`, testid: 'export' }, 'Download a record for the doctor (JSON)') : null), 'documents');
  }

  async function digest() {
    const [d, p] = await Promise.all([api(`/api/circles/${cid()}/digest?days=7`), api(`/api/circles/${cid()}/patterns?days=7`)]);
    render(h('div', {}, h('h1', {}, 'Weekly digest'),
      h('div', { class: 'card', testid: 'digest' }, h('ul', { class: 'plain' }, d.summary.map((l) => h('li', {}, l)))),
      h('div', { class: 'card', testid: 'patterns' }, h('h2', {}, 'Worth mentioning to the doctor'),
        p.patterns.length ? h('ul', { class: 'plain' }, p.patterns.map((x) => h('li', {}, x.message))) : h('p', { class: 'muted' }, 'No recurring notes found this week.'),
        h('p', { class: 'small muted' }, p.disclaimer))), 'digest');
  }

  return { emergency, money: moneyView, load, appointments, supplies, documents, digest };
}

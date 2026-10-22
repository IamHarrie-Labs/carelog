import { h } from './ui.js';

const eyebrow = (text) => h('p', { class: 'cl-eyebrow' }, text);
const heading = (first, last) => h('h2', {}, first, h('em', {}, last));
const person = (letter, name, role) => h('div', { class: 'cl-demo-person' }, h('span', { class: 'cl-avatar', 'aria-hidden': 'true' }, letter), h('div', {}, h('strong', {}, name), h('small', {}, role)));
const demoRow = (title, detail, tone = 'record') => h('div', { class: `cl-demo-row ${tone}` }, h('span', { class: 'cl-demo-symbol', 'aria-hidden': 'true' }, tone === 'question' ? '?' : tone === 'pending' ? '○' : h('img', { src: '/assets/record-check.svg', width: 14, height: 14, alt: '' })), h('div', {}, h('strong', {}, title), h('small', {}, detail)));

function journey() {
  const descriptions = [
    ['Bring your people together.', 'Start with one person. Invite the family, friends and carers you trust. Everyone has their own identity in the circle.'],
    ['Record the small things.', 'Lunch, a visit, a change you noticed. Each entry keeps the person and time attached, so the next caregiver has context.'],
    ['Take over with a clear picture.', 'Review what happened, check what is uncertain, and carry the unfinished jobs into the next handoff.'],
  ];
  const demo = h('div', { class: 'cl-journey-demo', role: 'region', 'aria-label': 'CareLog workflow preview', testid: 'workflow-preview' });
  const panels = [
    () => [h('p', { class: 'cl-demo-kicker' }, 'Margaret’s care circle'), h('h3', {}, 'Care is a team effort.'), person('S', 'Sam', 'Family caregiver'), person('A', 'Alex', 'Family caregiver'), person('J', 'Jo', 'Trusted neighbour'), h('p', { class: 'cl-demo-footnote' }, 'Separate accounts. One shared record.')],
    () => [h('p', { class: 'cl-demo-kicker' }, 'Today · Margaret’s care'), h('h3', {}, 'The details have a home.'), demoRow('Lunch recorded', 'Sam · 12:45 PM'), demoRow('A short walk after lunch', 'Sam · Observation · 1:10 PM'), h('div', { class: 'cl-demo-source' }, 'Every record keeps its author and time.'), h('p', { class: 'cl-demo-footnote' }, 'Corrections preserve the original entry.')],
    () => [h('p', { class: 'cl-demo-kicker' }, 'Evening handoff · Sam to Alex'), h('h3', {}, 'Ready to take over.'), demoRow('Lunch recorded', 'Sam · 12:45 PM'), demoRow('Afternoon medication', 'No administration recorded', 'question'), demoRow('Book Thursday transport', 'Assigned to Alex', 'pending'), h('p', { class: 'cl-demo-footnote' }, 'Reviewing a handoff leaves unfinished tasks visible.')],
  ];
  let current = -1;
  const controls = descriptions.map(([title], index) => h('button', { type: 'button', class: 'cl-phase-button', 'aria-label': title, 'aria-pressed': 'false', onclick: () => show(index) }, String(index + 1).padStart(2, '0')));
  function show(index) {
    if (current === index) return;
    current = index;
    controls.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    demo.replaceChildren(...panels[index]());
    demo.dataset.phase = String(index);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches && demo.isConnected) demo.animate([{ opacity: .45, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 280, easing: 'cubic-bezier(0.23,1,0.32,1)' });
  }
  show(0);
  const section = h('section', { class: 'cl-journey', id: 'how-it-works', 'aria-labelledby': 'how-heading' },
    h('div', { class: 'cl-chapter-heading cl-reveal' }, eyebrow('A little less piecing things together'), h('h2', { id: 'how-heading' }, 'One shared record.', h('em', {}, 'Everyone in the picture.')), h('p', {}, 'A few everyday habits. A clearer handoff for everyone.')),
    h('div', { class: 'cl-journey-grid' },
      h('div', { class: 'cl-demo-sticky' }, h('div', { class: 'cl-demo-controls', 'aria-label': 'Choose a workflow step' }, controls), demo, h('p', { class: 'cl-demo-caption' }, 'A preview of your care circle')),
      h('div', { class: 'cl-journey-copy' }, descriptions.map(([title, text], i) => h('article', { class: 'cl-journey-step cl-reveal', 'data-phase': i }, h('span', { class: 'cl-step-number' }, `0${i + 1}`), h('h3', {}, title), h('p', {}, text))))));
  section._showPhase = show;
  return section;
}

function unfinished() {
  let reviewed = false;
  const status = h('span', { class: 'cl-demo-review-status' }, 'Ready for Alex to review');
  const task = h('div', { class: 'cl-unfinished-task' }, h('span', { class: 'cl-open', 'aria-hidden': 'true' }), h('div', {}, h('strong', {}, 'Book Thursday transport'), h('small', {}, 'Alex · Outcome still to be recorded')), h('span', { class: 'cl-person amber' }, 'Alex'));
  const button = h('button', { type: 'button', class: 'cl-button', testid: 'demo-review', onclick: () => {
    reviewed = !reviewed;
    status.textContent = reviewed ? 'Handoff reviewed by Alex' : 'Ready for Alex to review';
    button.textContent = reviewed ? 'Reset preview' : 'Try reviewing the handoff';
    status.classList.toggle('is-reviewed', reviewed);
  } }, 'Try reviewing the handoff');
  return h('section', { class: 'cl-task-chapter', 'aria-labelledby': 'carry-heading' },
    h('div', { class: 'cl-task-inner' },
      h('div', { class: 'cl-task-copy cl-reveal' }, eyebrow('The important things carry forward'), h('h2', { id: 'carry-heading' }, 'A handoff ends.', h('em', {}, 'The task doesn’t disappear.')), h('p', {}, 'Reading the handoff is one thing. Booking the transport is another. CareLog keeps the difference clear.'), h('p', { class: 'cl-small-note' }, 'Try it: review this handoff. The task stays right where it belongs.')),
      h('div', { class: 'cl-task-preview cl-reveal' }, h('div', { class: 'cl-task-preview-head' }, h('span', {}, 'Evening handoff'), h('span', {}, 'Sam → Alex')), status, task, button)));
}

function families() {
  const options = [
    ['A parent at home', 'Margaret’s care', 'For siblings, friends and trusted carers taking turns.', [['Lunch recorded', 'Sam · 12:45 PM'], ['Clinic visit on Thursday', 'Transport assigned to Alex'], ['A note for the evening', 'Jo · Observation']]],
    ['Recovery, together', 'Jamie’s recovery', 'For the weeks when an extra pair of hands matters.', [['Physio exercises recorded', 'Jamie · 10:00 AM'], ['Follow-up appointment', 'Friday · Accompanied by Pat'], ['Pick up supplies', 'Assigned to Pat']]],
    ['A child’s routine', 'Ellis’s care', 'For the everyday details shared between homes and carers.', [['Lunch recorded', 'Taylor · 12:15 PM'], ['School pickup', 'Assigned to Morgan'], ['A note for tomorrow', 'Taylor · Observation']]],
  ];
  const preview = h('div', { class: 'cl-family-preview', role: 'tabpanel', id: 'family-preview', tabindex: '0', testid: 'family-preview' });
  const buttons = options.map(([label], i) => h('button', { type: 'button', role: 'tab', 'aria-label': label, id: `family-tab-${i}`, 'aria-controls': 'family-preview', 'aria-selected': 'false', tabindex: '-1', onclick: () => select(i), onkeydown: (e) => {
    const next = e.key === 'ArrowRight' ? (i + 1) % 3 : e.key === 'ArrowLeft' ? (i + 2) % 3 : e.key === 'Home' ? 0 : e.key === 'End' ? 2 : null;
    if (next !== null) { e.preventDefault(); select(next); buttons[next].focus(); }
  } }, label));
  function select(i) {
    buttons.forEach((button, index) => { button.setAttribute('aria-selected', String(i === index)); button.tabIndex = i === index ? 0 : -1; });
    const [, name, description, rows] = options[i];
    preview.setAttribute('aria-labelledby', `family-tab-${i}`);
    preview.replaceChildren(h('p', { class: 'cl-demo-kicker' }, 'Your circle, your routine'), h('h3', {}, name), h('p', { class: 'cl-family-preview-description' }, description), ...rows.map(([title, text]) => demoRow(title, text, title.includes('recorded') ? 'record' : 'pending')));
  }
  select(0);
  return h('section', { class: 'cl-family-chapter', id: 'for-families', 'aria-labelledby': 'family-heading' }, h('div', { class: 'cl-family-inner' },
    h('div', { class: 'cl-family-copy cl-reveal' }, eyebrow('Built around your people'), h('h2', { id: 'family-heading' }, 'Different days.', h('em', {}, 'The same care.')), h('p', {}, 'Care looks different in every home. The need to keep each other informed is the same.'), h('div', { class: 'cl-family-tabs', role: 'tablist', 'aria-label': 'Explore care situations' }, buttons)),
    h('div', { class: 'cl-family-art cl-reveal' }, preview)));
}

export function careSections() {
  return [journey(), unfinished(), families(), h('section', { class: 'cl-final-chapter' }, h('div', { class: 'cl-reveal' }, eyebrow('For the people who share the care'), heading('A little less guessing.', 'A little more together.'), h('p', {}, 'Bring your circle together. Keep the details with you.'), h('a', { class: 'cl-button', href: '#/signup' }, 'Start your care circle')))];
}

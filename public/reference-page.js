import { h } from './ui.js';
const createCircleButton = () => h('a', { class: 'ref-primary', href: '#/signup', testid: 'hero-create' }, 'Create a care circle');
const vector = (name, size = 20) => h('img', { class: 'ref-icon', src: `/assets/${name}.svg`, width: size, height: size, alt: '' });
import { startReferenceMotion } from './reference-motion.js';

const label = text => h('p', { class: 'ref-label' }, text);
const headline = (first, italic, attrs = {}) => h('h2', attrs, first, h('em', {}, italic));
const check = () => h('img', { src: '/assets/record-check.svg', width: 16, height: 16, alt: '' });
const tag = (name, tone) => h('span', { class: `ref-person ${tone}` }, name);
const voice = (name, tone) => h('span', { class: `ref-speaker ${tone}` }, h('img', { class: 'ref-wave cl-wave', src: '/assets/voice-wave.svg', width: 13, height: 12, alt: '' }), name);

const scenes = [
  { name: 'Record the details', title: 'Write it down while it’s fresh.', copy: 'Record lunch, a visit or something you noticed. Your family can see who added it and when.', view: () => [label('Today · Margaret’s care'), h('div', { class: 'ref-type-line' }, 'Lunch at 12:45. A short walk afterwards.'), h('div', { class: 'ref-mini-entry' }, check(), h('div', {}, h('strong', {}, 'Lunch recorded'), h('small', {}, 'Sam · 12:45 PM'))), h('p', { class: 'ref-scene-caption' }, 'Entered once. Visible to your circle.')] },
  { name: 'Keep the history', title: 'Corrections without losing the story.', copy: 'Entered the wrong time? Correct it and explain what changed. The original stays in the history.', view: () => [label('Correction history'), h('p', { class: 'ref-old-entry' }, 'Lunch at 12:15 PM'), h('div', { class: 'ref-correction-arrow', 'aria-hidden': 'true' }, vector('arrow-down')), h('p', { class: 'ref-correct-entry' }, 'Lunch at 12:45 PM'), h('div', { class: 'ref-mini-meta' }, tag('Sam', 'rose'), 'Corrected the time · Original retained')] },
  { name: 'See what needs checking', title: 'Uncertainty stays visible.', copy: 'If no one has logged a scheduled item, you’ll see that it needs checking. Ask the person who was there before assuming it was missed.', view: () => [label('Afternoon medication'), h('div', { class: 'ref-uncertain-mark', 'aria-hidden': 'true' }, '?'), h('p', { class: 'ref-uncertain-copy' }, 'No administration recorded'), h('p', { class: 'ref-scene-caption' }, 'Check with Sam before assuming.')] },
  { name: 'Take over with context', title: 'Know where to pick up.', copy: 'Read what happened before you took over, then confirm you’ve reviewed it. Anything unfinished stays on the list.', view: () => [label('A change of caregiver'), h('div', { class: 'ref-person-transfer' }, h('span', {}, 'S'), vector('arrow-right', 28), h('span', {}, 'A')), h('div', { class: 'ref-transfer-names' }, 'Sam', h('span', {}, 'Alex')), h('div', { class: 'ref-mini-status' }, check(), 'Handoff reviewed by Alex')] },
  { name: 'Carry the work forward', title: 'Unfinished means still on the list.', copy: 'Reviewing a handoff doesn’t book Thursday’s transport. That task stays visible until someone records the outcome.', view: () => [label('Still to do'), h('div', { class: 'ref-task-line' }, h('span', { class: 'ref-square', 'aria-hidden': 'true' }), 'Book Thursday transport', tag('Alex', 'amber')), h('div', { class: 'ref-handoff-marker' }, check(), 'Handoff reviewed'), h('p', { class: 'ref-scene-caption' }, 'Outcome still to be recorded.')] },
];

function walkthrough() {
  const stage = h('div', { class: 'ref-scene', role: 'region', 'aria-label': 'CareLog product demonstration', testid: 'workflow-preview' });
  const copy = h('div', { class: 'ref-scene-copy' });
  const controls = scenes.map((scene, index) => h('button', { class: 'ref-scene-control', type: 'button', 'aria-pressed': 'false', onclick: () => select(index) }, scene.name));
  function select(index) {
    if (stage.dataset.scene === String(index)) return;
    stage.dataset.scene = String(index);
    stage.replaceChildren(...scenes[index].view());
    copy.replaceChildren(h('h3', {}, scenes[index].title), h('p', {}, scenes[index].copy));
    controls.forEach((control, i) => control.setAttribute('aria-pressed', String(i === index)));
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches && stage.isConnected) stage.animate([{ opacity: .4, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 350, easing: 'cubic-bezier(.23,1,.32,1)' });
  }
  select(0);
  const section = h('section', { class: 'ref-walkthrough', id: 'how-it-works', 'aria-labelledby': 'ref-how-heading' },
    h('div', { class: 'ref-walkthrough-heading ref-reveal' }, label('How CareLog works'), headline('A little less remembering.', 'A little more together.', { id: 'ref-how-heading' })),
    h('div', { class: 'ref-walkthrough-sticky' }, h('div', { class: 'ref-scene-nav', 'aria-label': 'Explore CareLog' }, controls), stage, copy),
    h('div', { class: 'ref-scroll-track', 'aria-hidden': 'true' }, scenes.map((_, index) => h('div', { 'data-scene': index }))),
    h('div', { class: 'ref-mobile-walkthrough' }, scenes.map(scene => h('article', {}, h('div', { class: 'ref-scene' }, scene.view()), h('h3', {}, scene.title), h('p', {}, scene.copy)))));
  section._select = select;
  return section;
}

function faq() {
  const entries = [
    ['What is CareLog?', 'CareLog is a shared care record for families and trusted caregivers. It brings recorded care, observations, appointments and unfinished tasks into one circle.'],
    ['How do I get started?', 'Create an account, then start a care circle or join through an invitation. Sign in on your phone or computer to see the same shared record. You’ll need an internet connection to view and save updates.'],
    ['Does it tell me which medication to give?', 'No. CareLog records the schedule and instructions you enter. It does not recommend doses, diagnose conditions or judge whether an administration is safe.'],
    ['Who can see the care record?', 'People must be invited to a circle. Their role determines what they can read or record. Owners can remove members; future access is checked by the server. Previously viewed information cannot be recalled.'],
    ['What if I record something incorrectly?', 'Add a correction and a reason. You can still see the original entry, who wrote it and what changed.'],
    ['Does reviewing a handoff complete its tasks?', 'No. Reviewing the handoff acknowledges the information you saw. Unfinished tasks remain visible until someone records an outcome.'],
  ];
  const answer = h('div', { class: 'ref-faq-answer', role: 'tabpanel', id: 'ref-faq-answer', tabindex: '0' });
  const buttons = entries.map(([question], i) => h('button', { type: 'button', role: 'tab', id: `ref-faq-${i}`, 'aria-controls': 'ref-faq-answer', 'aria-selected': 'false', tabindex: '-1', onclick: () => choose(i), onkeydown: event => {
    const next = event.key === 'ArrowDown' ? (i + 1) % entries.length : event.key === 'ArrowUp' ? (i + entries.length - 1) % entries.length : event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : null;
    if (next !== null) { event.preventDefault(); choose(next); buttons[next].focus(); }
  } }, question));
  function choose(index) {
    buttons.forEach((button, i) => { button.setAttribute('aria-selected', String(i === index)); button.tabIndex = i === index ? 0 : -1; });
    answer.setAttribute('aria-labelledby', `ref-faq-${index}`);
    answer.replaceChildren(h('h3', {}, 'Answer'), h('h4', {}, entries[index][0]), h('p', {}, entries[index][1]));
  }
  choose(0);
  return h('section', { class: 'ref-faq', id: 'questions', 'aria-labelledby': 'ref-faq-heading' }, label('Good to know'), headline('You might be', 'wondering.', { id: 'ref-faq-heading' }), h('div', { class: 'ref-faq-wrap' }, h('div', { class: 'ref-faq-questions' }, h('h3', {}, 'Questions'), h('div', { role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': 'CareLog questions' }, buttons)), answer));
}

export function renderReferencePage(root, brand) {
  document.body.classList.add('marketing');
  const menu = h('div', { class: 'cl-nav-links', id: 'cl-nav-links' }, h('a', { href: '#/how-it-works' }, 'How it works'), h('a', { href: '#/for-families' }, 'For families'));
  const toggle = h('button', { class: 'cl-menu', 'aria-expanded': 'false', 'aria-controls': 'cl-nav-links', 'aria-label': 'Toggle navigation', onclick: () => { const open = toggle.getAttribute('aria-expanded') !== 'true'; toggle.setAttribute('aria-expanded', String(open)); menu.classList.toggle('is-open', open); } }, 'Menu');
  root.replaceChildren(h('div', { class: 'ref-page' },
    h('header', { class: 'cl-nav ref-nav' }, brand(), menu, h('div', { class: 'cl-nav-actions' }, h('a', { href: '#/login', testid: 'landing-login' }, 'Sign in'), h('a', { class: 'ref-primary', href: '#/signup' }, 'Create a care circle')), toggle),
    h('main', { id: 'main' },
      h('section', { class: 'ref-hero', 'aria-labelledby': 'ref-hero-title' }, label('CareLog · Shared family care'), h('h1', { id: 'ref-hero-title' }, 'Care changes hands.', h('em', {}, 'The details stay together.')), createCircleButton(), h('p', { class: 'ref-availability' }, 'Already caring together? ', h('a', { href: '#/login' }, 'Sign in')),
        h('figure', { class: 'cl-story ref-story', 'aria-label': 'A conversation represented as recorded care and a task' },
          h('div', { class: 'cl-conversation ref-conversation' }, h('p', { class: 'cl-line line-one' }, voice('Sam', 'rose'), h('span', {}, 'Mum had lunch at twelve forty-five.')), h('p', { class: 'cl-line line-two' }, voice('Alex', 'sage'), h('span', {}, 'Is Thursday’s transport booked?')), h('p', { class: 'cl-line line-three' }, voice('Alex', 'amber'), h('span', {}, 'I’ll book it. Leave that with me.'))),
          h('div', { class: 'cl-records ref-records' }, h('div', { class: 'cl-record recorded' }, h('img', { class: 'cl-check', src: '/assets/record-check.svg', width: 16, height: 16, alt: '' }), h('span', {}, 'Lunch recorded · 12:45 PM'), tag('Sam', 'rose')), h('div', { class: 'cl-record open' }, h('span', { class: 'ref-square', 'aria-hidden': 'true' }), h('span', {}, 'Book Thursday transport'), tag('Alex', 'amber')))),
        h('button', { class: 'ref-replay', type: 'button', testid: 'replay-handoff', 'aria-label': 'Replay the care record animation' }, vector('replay', 14), 'Replay')),
      h('section', { class: 'ref-statement' }, label('Why we built CareLog'), h('p', {}, 'Care is shared.', h('em', {}, 'The details should be, too.'))),
      walkthrough(),
      h('section', { class: 'ref-workflow', 'aria-labelledby': 'ref-workflow-heading' }, label('Made for real life'), headline('An easier way to keep track.', 'A shared view of the day.', { id: 'ref-workflow-heading' }),
        h('div', { class: 'ref-benefits' }, [['record', 'Your name stays with it.', 'Every entry has an author and a time. Everyone can see where a record came from.'], ['history', 'The story stays intact.', 'Corrections keep the original entry, so a mistake does not leave a gap in the history.'], ['people', 'Choose who’s involved.', 'Invite the people you trust. Choose their role, and remove access when their involvement ends.']].map(([icon, title, text]) => h('article', { class: 'ref-reveal' }, h('img', { src: `/assets/care-${icon}.svg`, width: 140, height: 110, alt: '' }), h('h3', {}, title), h('p', {}, text))))),
      h('section', { class: 'ref-switch ref-reveal' }, headline('Take over without', 'starting from scratch.'), h('div', {}, h('p', {}, 'When it’s your turn, read the day’s updates, check any questions and pick up the jobs still waiting.'), h('a', { href: '#/signup' }, 'Create a care circle ', vector('arrow-right', 16))), h('div', { class: 'ref-switch-art', 'aria-hidden': 'true' }, h('span', {}, 'Sam'), h('span', { class: 'ref-transfer-arrow' }, vector('arrow-right', 34)), h('span', {}, 'Alex'))),
      h('section', { class: 'ref-access', 'aria-labelledby': 'ref-access-heading' }, h('div', {}, label('Your care circle'), headline('Shared with care.', 'On your terms.', { id: 'ref-access-heading' }), h('p', {}, 'Bring family, friends and trusted carers together, with access that reflects their part in the care.')), h('dl', {}, [['Everyone has their own account', 'Each caregiver uses their own account. Records keep the person who entered them.'], ['Choose what each person can do', 'A family caregiver, paid carer and read-only recipient do not all need the same access.'], ['Remove access when you need to', 'An owner can remove someone from the circle. Their existing session cannot fetch new records.'], ['Share essentials in an emergency', 'A time-limited emergency link shares selected information. Private care notes stay out of that packet.']].map(([title, copy]) => h('div', {}, h('dt', {}, title), h('dd', {}, copy))))),
      h('section', { class: 'ref-situations', id: 'for-families', 'aria-labelledby': 'ref-family-heading' }, label('For the people who share the care'), headline('Different lives.', 'Care to keep track of.', { id: 'ref-family-heading' }), h('div', { class: 'ref-situation-list' }, [['01', 'A parent at home', 'The little things matter.', 'For siblings, friends and trusted carers keeping one another informed.'], ['02', 'Recovery, together', 'Help for the next few weeks.', 'Appointments, observations and practical jobs, shared with the people helping out.'], ['03', 'A child’s routine', 'From one pair of hands to another.', 'Keep the everyday details visible between parents, homes and carers.']].map(([n, title, heading, text]) => h('article', { class: 'ref-situation ref-reveal' }, h('span', { class: 'ref-situation-number', 'aria-hidden': 'true' }, n), h('div', {}, label(title), h('h3', {}, heading), h('p', {}, text)))))),
      faq(),
      ),
    h('footer', { class: 'ref-footer' }, h('div', { class: 'ref-footer-top' }, brand(), h('p', {}, 'Care changes hands.', h('br'), 'The details stay together.')), h('div', { class: 'ref-footer-columns' }, h('div', {}, label('CareLog'), h('a', { href: '#/how-it-works' }, 'How it works'), h('a', { href: '#/for-families' }, 'For families'), h('a', { href: '#/questions' }, 'Questions')), h('div', {}, label('Get started'), h('a', { href: '#/login' }, 'Sign in'), h('a', { href: '#/signup' }, 'Create a care circle')), h('div', {}, label('Project'), h('a', { href: 'https://github.com/IamHarrie-Labs/carelog', target: '_blank', rel: 'noopener' }, 'Source code ', vector('arrow-up-right', 14)), h('a', { href: 'https://github.com/IamHarrie-Labs/carelog/blob/main/docs/PRD.md', target: '_blank', rel: 'noopener' }, 'Product requirements ', vector('arrow-up-right', 14)))))));
  const dispose = startReferenceMotion(root);
  const section = location.hash.slice(2);
  if (['how-it-works', 'for-families', 'questions'].includes(section)) document.getElementById(section)?.scrollIntoView({ behavior: 'instant' });
  return dispose;
}

import { h } from './ui.js';

export const brand = (href = '#/') => h('a', { class: 'cl-brand', href, testid: 'brand' },
  h('img', { src: '/assets/carelog-logo.svg', width: 35, height: 35, alt: '' }), h('span', { class: 'cl-wordmark' }, 'CareLog'));

const signup = (label = 'Create a care circle') => h('a', { class: 'cl-button', href: '#/signup' }, label);
const speaker = (name, tone) => h('span', { class: `cl-speaker ${tone}` }, h('span', { class: 'cl-wave', 'aria-hidden': 'true' }, Array.from({ length: 5 }, () => h('i'))), name);

export function landingView(root) {
  document.body.classList.add('marketing');
  const menu = h('div', { class: 'cl-nav-links', id: 'cl-nav-links' },
    h('a', { href: '#/how-it-works' }, 'How it works'), h('a', { href: '#/for-families' }, 'For families'));
  const toggle = h('button', { class: 'cl-menu', 'aria-expanded': 'false', 'aria-controls': 'cl-nav-links', 'aria-label': 'Toggle navigation', onclick: () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true'; toggle.setAttribute('aria-expanded', String(open)); menu.classList.toggle('is-open', open);
  } }, 'Menu');
  root.replaceChildren(
    h('header', { class: 'cl-nav' }, brand(), menu, h('div', { class: 'cl-nav-actions' }, h('a', { href: '#/login', testid: 'landing-login' }, 'Sign in'), signup()), toggle),
    h('main', { id: 'main', class: 'cl-landing' },
      h('section', { class: 'cl-hero', 'aria-labelledby': 'landing-title' },
        h('p', { class: 'cl-eyebrow' }, 'CareLog · Shared family care'),
        h('h1', { id: 'landing-title' }, 'Care changes hands.', h('em', {}, 'The details stay together.')),
        signup(),
        h('figure', { class: 'cl-story', 'aria-label': 'An example conversation becomes an attributable care record and an open task' },
          h('div', { class: 'cl-conversation' },
            h('p', { class: 'cl-line line-one' }, speaker('Sam', 'rose'), h('span', {}, 'Mum had lunch at twelve forty-five.')),
            h('p', { class: 'cl-line line-two' }, speaker('Alex', 'sage'), h('span', {}, 'Is Thursday’s transport booked?')),
            h('p', { class: 'cl-line line-three' }, speaker('Alex', 'amber'), h('span', {}, 'I’ll book it. Leave that with me.'))),
          h('div', { class: 'cl-records' },
            h('div', { class: 'cl-record recorded' }, h('img', { class: 'cl-check', src: '/assets/record-check.svg', width: 16, height: 16, alt: '' }), h('span', {}, 'Lunch recorded · 12:45 PM'), h('span', { class: 'cl-person rose' }, 'Sam')),
            h('div', { class: 'cl-record open' }, h('span', { class: 'cl-open', 'aria-hidden': 'true' }), h('span', {}, 'Book Thursday transport'), h('span', { class: 'cl-person amber' }, 'Alex'))))),
      h('section', { class: 'cl-explanation', id: 'how-it-works', 'aria-labelledby': 'how-heading' },
        h('div', {}, h('p', { class: 'cl-eyebrow' }, 'A little less piecing things together'), h('h2', { id: 'how-heading' }, 'One shared record.', h('em', {}, 'Everyone in the picture.')), h('p', {}, 'For families taking turns looking after someone. See what was recorded, what needs checking, and what still needs doing.')),
        h('ol', { class: 'cl-steps' },
          [['01', 'Bring your people together.', 'Create a circle for one person and invite the relatives, friends or carers you trust.'], ['02', 'Record the everyday details.', 'Log care, observations and unfinished tasks with a name and time attached.'], ['03', 'Take over with context.', 'Review the handoff. Questions and open tasks carry forward until someone records an outcome.']].map(([n, title, text]) => h('li', {}, h('span', { class: 'cl-step-number' }, n), h('div', {}, h('h3', {}, title), h('p', {}, text)))))),
      h('section', { class: 'cl-family', id: 'for-families', 'aria-labelledby': 'family-heading' },
        h('p', { class: 'cl-eyebrow' }, 'For the people who share the care'), h('h2', { id: 'family-heading' }, 'Different days.', h('em', {}, 'The same care.')),
        h('div', { class: 'cl-contexts' }, [['A parent at home', 'Stay in step with siblings, neighbours and trusted carers.'], ['Recovery, together', 'Keep the next few weeks of appointments, notes and practical jobs in one place.'], ['A child’s routine', 'Share the everyday details between parents and the people helping out.']].map(([title, text]) => h('article', {}, h('h3', {}, title), h('p', {}, text)))),
        signup('Start your care circle'))),
    h('footer', { class: 'cl-footer' }, brand(), h('p', {}, 'A shared record. A clearer handoff.'), h('a', { href: '#/login' }, 'Sign in'), h('p', { class: 'cl-boundary' }, 'CareLog records what people enter. It does not provide medical advice.')));
  const anchor = location.hash.slice(2);
  if (['how-it-works', 'for-families'].includes(anchor)) document.getElementById(anchor)?.scrollIntoView();
}

import { h } from './ui.js';
import { careSections } from './care-sections.js';
import { installLandingMotion } from './landing-motion.js';

let disposeMotion = () => {};
export function cleanupLandingMotion() { disposeMotion(); disposeMotion = () => {}; }

export const brand = (href = '#/') => h('a', { class: 'cl-brand', href, testid: 'brand' },
  h('img', { src: '/assets/carelog-logo.svg', width: 35, height: 35, alt: '' }), h('span', { class: 'cl-wordmark' }, 'CareLog'));

const signup = (label = 'Create a care circle') => h('a', { class: 'cl-button', href: '#/signup' }, label);
const speaker = (name, tone) => h('span', { class: `cl-speaker ${tone}` }, h('span', { class: 'cl-wave', 'aria-hidden': 'true' }, Array.from({ length: 5 }, () => h('i'))), name);

export function landingView(root) {
  cleanupLandingMotion();
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
      h('button', { class: 'cl-replay', type: 'button', testid: 'replay-handoff', 'aria-label': 'Replay the handoff animation' }, '↻ Replay handoff'),
      careSections()),
    h('footer', { class: 'cl-footer' }, brand(), h('p', {}, 'A shared record. A clearer handoff.'), h('a', { href: '#/login' }, 'Sign in'), h('p', { class: 'cl-boundary' }, 'CareLog records what people enter. It does not provide medical advice.')));
  disposeMotion = installLandingMotion(root);
  const anchor = location.hash.slice(2);
  if (['how-it-works', 'for-families'].includes(anchor)) document.getElementById(anchor)?.scrollIntoView();
}

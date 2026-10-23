import { h } from './ui.js';
import { renderReferencePage } from './reference-page.js';

let disposeMotion = () => {};
export function cleanupLandingMotion() { disposeMotion(); disposeMotion = () => {}; }

export const brand = (href = '/') => h('a', { class: 'cl-brand', href, testid: 'brand' },
  h('img', { src: '/assets/carelog-logo.svg', width: 35, height: 35, alt: '' }), h('span', { class: 'cl-wordmark' }, 'CareLog'));


export function landingView(root, me) {
  cleanupLandingMotion();
  disposeMotion = renderReferencePage(root, brand, me);
}

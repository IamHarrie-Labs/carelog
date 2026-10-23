import { h } from './ui.js';

let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
window.addEventListener('appinstalled', () => { installPrompt = undefined; });

export async function downloadCareLog() {
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = undefined;
    await prompt.prompt();
    await prompt.userChoice;
    return;
  }
  const dialog = document.getElementById('modal');
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  dialog.replaceChildren(h('section', { class: 'ref-install', 'aria-labelledby': 'install-heading' },
    h('p', { class: 'ref-label' }, 'CareLog for your device'),
    h('h2', { id: 'install-heading' }, 'Keep your circle close.'),
    h('p', {}, 'CareLog installs as a web app. Your existing account and care circles work in both the browser and the installed app.'),
    h('ol', {}, ios
      ? [h('li', {}, 'Open CareLog in Safari.'), h('li', {}, 'Tap Share, then Add to Home Screen.'), h('li', {}, 'Tap Add to keep CareLog on your home screen.')]
      : [h('li', {}, 'Open CareLog in Chrome or Edge.'), h('li', {}, 'Look for Install in the address bar or the browser menu.'), h('li', {}, 'Choose Install to add CareLog to your device.')]),
    h('p', { class: 'ref-install-note' }, 'An internet connection is required to view and update care records. There is no separate Windows or macOS installer.'),
    h('div', { class: 'row' }, h('a', { class: 'ref-download', href: '/signup', onclick: () => dialog.close() }, 'Open CareLog'), h('button', { type: 'button', onclick: () => dialog.close() }, 'Close'))));
  dialog.showModal();
}

export const downloadButton = (label = 'Download CareLog') => h('button', { class: 'ref-download', type: 'button', onclick: downloadCareLog }, h('span', { class: 'ref-download-symbol', 'aria-hidden': 'true' }, '↓'), label);

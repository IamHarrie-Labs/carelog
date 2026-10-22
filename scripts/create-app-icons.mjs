import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Rasterize the existing master emblem; never draw a second logo for the app icon.
const svg = await readFile(new URL('../public/assets/carelog-logo.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });
try {
  for (const size of [192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:#ffffeb;display:grid;place-items:center;width:100vw;height:100vh"><img width="${Math.round(size * .72)}" height="${Math.round(size * .72)}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`);
    await page.locator('img').evaluate(img => img.decode());
    await page.screenshot({ path: fileURLToPath(new URL(`../public/assets/carelog-${size}.png`, import.meta.url)) });
    await page.close();
  }
} finally { await browser.close(); }

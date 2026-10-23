// Render composition.html frame by frame with headless Chromium.
//   node render.mjs --stills 3,12.5,40     write PNG stills to build/stills
//   node render.mjs --cues                 write build/cues.json for the soundtrack
//   node render.mjs [--fps 60] [--workers 4] [--from 0 --to 102]   render build/video.mp4
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const build = path.join(here, 'build');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const url = pathToFileURL(path.join(here, 'composition.html')).href;
const launch = () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--disable-web-security', '--allow-file-access-from-files', '--font-render-hinting=none', '--disable-lcd-text'] });

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.READY === true, null, { timeout: 60000 });
  return page;
}
async function frame(page, t) {
  await page.evaluate(t => window.render(t), t);
  return page.screenshot({ type: 'png', animations: 'disabled', caret: 'initial' });
}

await mkdir(build, { recursive: true });
const browser = await launch();

if (args.cues) {
  const page = await openPage(browser);
  const data = await page.evaluate(() => ({ duration: window.DURATION, cues: window.CUES }));
  await writeFile(path.join(build, 'cues.json'), JSON.stringify(data, null, 1));
  console.log(`${data.cues.length} cues`);
} else if (args.stills) {
  const page = await openPage(browser);
  await mkdir(path.join(build, 'stills'), { recursive: true });
  for (const t of String(args.stills).split(',').map(Number)) {
    await writeFile(path.join(build, 'stills', `t${t.toFixed(2).padStart(6, '0')}.png`), await frame(page, t));
  }
  console.log('stills written');
} else {
  const fps = +(args.fps || 60), workers = +(args.workers || 4);
  const page0 = await openPage(browser);
  const duration = await page0.evaluate(() => window.DURATION);
  await page0.close();
  const from = +(args.from || 0), to = Math.min(+(args.to || duration), duration);
  const first = Math.round(from * fps), last = Math.round(to * fps);
  const total = last - first;
  const per = Math.ceil(total / workers);
  const segDir = path.join(build, 'segments');
  await rm(segDir, { recursive: true, force: true });
  await mkdir(segDir, { recursive: true });
  const started = Date.now();
  let done = 0;
  const jobs = Array.from({ length: workers }, async (_, w) => {
    const a = first + w * per, b = Math.min(last, a + per);
    if (a >= b) return null;
    const out = path.join(segDir, `seg${w}.mp4`);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-tune', 'film', '-x264-params', 'keyint=120', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const closed = new Promise((res, rej) => ff.on('close', code => (code === 0 ? res() : rej(new Error('ffmpeg ' + code)))));
    const br = await launch();
    const page = await openPage(br);
    for (let f = a; f < b; f++) {
      const png = await frame(page, f / fps);
      if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
      done++;
      if (w === 0 && f % 60 === 0) {
        const el = (Date.now() - started) / 1000;
        console.log(`${done}/${total} frames, ${(done / el).toFixed(1)} fps, eta ${((total - done) / (done / el) / 60).toFixed(1)} min`);
      }
    }
    ff.stdin.end();
    await closed;
    await br.close();
    return out;
  });
  const segs = (await Promise.all(jobs)).filter(Boolean);
  await writeFile(path.join(segDir, 'list.txt'), segs.map(s => `file '${s}'`).join('\n'));
  await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(segDir, 'list.txt'), '-c', 'copy', path.join(build, 'video.mp4')], { stdio: 'inherit' })
    .on('close', c => (c === 0 ? res() : rej(new Error('concat failed')))));
  console.log(`video.mp4 written in ${((Date.now() - started) / 60000).toFixed(1)} min`);
}
await browser.close();

/* CareLog film: a deterministic motion composition.
 * Every frame is a pure function of time: render(t) sets every style, so the
 * renderer can seek to any frame and the result is identical every time.
 * Line timings come from timeline.js, written by voiceover.py. */

const TL = window.TIMELINE;
const DURATION = TL.duration;
const LN = TL.lines;
const S = k => LN[k].start;
const EN = k => LN[k].end;
// Approximate time a word in a voiced line is spoken (by character share).
function wt(k, i) {
  const words = LN[k].text.split(/\s+/);
  const total = words.join(' ').length;
  let c = 0;
  for (let j = 0; j < i; j++) c += words[j].length + 1;
  return S(k) + (EN(k) - S(k)) * (c / total);
}
const sync = (k, n, lead = 0.08) => Array.from({ length: n }, (_, i) => wt(k, i) - lead);

/* ---------- maths ---------- */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const L = (a, b, p) => a + (b - a) * p;
const E = {
  linear: x => x,
  outCubic: x => 1 - (1 - x) ** 3,
  outQuart: x => 1 - (1 - x) ** 4,
  outQuint: x => 1 - (1 - x) ** 5,
  outExpo: x => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
  inCubic: x => x ** 3,
  inQuart: x => x ** 4,
  inExpo: x => (x <= 0 ? 0 : 2 ** (10 * x - 10)),
  inOutCubic: x => (x < .5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
  inOutQuart: x => (x < .5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2),
  inOutSine: x => -(Math.cos(Math.PI * x) - 1) / 2,
  outBack: x => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; },
  outBackSoft: x => { const c1 = 1.2, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; },
  spring: x => (x >= 1 ? 1 : 1 - Math.exp(-7 * x) * Math.cos(10.5 * x)),
};
const P = (t, a, d, e = E.outExpo) => e(clamp((t - a) / d));
const bell = (t, a, d) => Math.sin(Math.PI * clamp((t - a) / d));
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = (a, b) => L(a, b, rnd());

/* ---------- DOM ---------- */
const stage = document.getElementById('stage');
function el(tag, cls, parent, style, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (style) Object.assign(e.style, style);
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
const div = (cls, parent, style, html) => el('div', cls, parent, style, html);
function svg(parent, w, h, vb, inner, style) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  e.setAttribute('width', w); e.setAttribute('height', h); e.setAttribute('viewBox', vb);
  e.innerHTML = inner;
  e.style.position = 'absolute'; e.style.overflow = 'visible';
  if (style) Object.assign(e.style, style);
  parent.appendChild(e);
  return e;
}
const LOGO_PATHS = '<path pathLength="1" d="M20 40C9 39 5 32 8 24 11 16 22 9 34 6c2 14-1 26-14 34Z"/><path pathLength="1" d="M25 40C14 36 14 28 20 22c6-6 14-8 23-8 1 15-4 26-18 26Z"/>';
const CHECK = (c = '#193C34', w = 3) => `<path d="M6 12.5l4 4 8-9" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const CURSOR = '<path d="M2 2 L2 30 L10 23 L15.5 35 L20.5 33 L15 21.5 L26 21.5 Z" fill="#1A1A1A" stroke="#FFFFFF" stroke-width="2.4" stroke-linejoin="round"/>';

/* Text: "*...*" marks italic, " / " a line break. Words sit in masks so they can rise. */
function txt(parent, str, cls, style, opts = {}) {
  const box = div('txt ' + (cls || ''), parent, style);
  const ws = [], ms = [], cs = [], wcs = [];
  let it = false;
  str.split(' ').forEach(raw => {
    if (raw === '/') { box.appendChild(document.createElement('br')); return; }
    let w = raw;
    if (w.startsWith('*')) { it = true; w = w.slice(1); }
    let close = false;
    if (w.endsWith('*')) { close = true; w = w.slice(0, -1); }
    const m = el('span', 'm', box);
    const s = el('span', 'w' + (it ? ' it' : ''), m);
    const chars = [];
    if (opts.chars) for (const ch of w) { const c = el('span', 'c', s); c.textContent = ch; chars.push(c); cs.push(c); }
    else s.textContent = w;
    box.appendChild(document.createTextNode(' '));
    ws.push(s); ms.push(m); wcs.push(chars);
    if (close) it = false;
  });
  return { box, ws, ms, cs, wcs };
}

/* ---------- animation ---------- */
const DEF = { x: 0, y: 0, xp: 0, yp: 0, s: 1, sx: 1, sy: 1, r: 0, rx: 0, ry: 0, o: 1, b: 0 };
function apply(e, v) {
  let tf = '';
  if (v.rx || v.ry) tf += 'perspective(1400px) ';
  tf += `translate(${v.x}px,${v.y}px)`;
  if (v.xp || v.yp) tf += ` translate(${v.xp}%,${v.yp}%)`;
  if (v.r) tf += ` rotate(${v.r}deg)`;
  if (v.rx) tf += ` rotateX(${v.rx}deg)`;
  if (v.ry) tf += ` rotateY(${v.ry}deg)`;
  if (v.s !== 1 || v.sx !== 1 || v.sy !== 1) tf += ` scale(${v.s * v.sx},${v.s * v.sy})`;
  e.style.transform = tf;
  e.style.opacity = clamp(v.o);
  e.style.filter = v.b > 0.05 ? `blur(${v.b}px)` : 'none';
  e.style.visibility = v.o <= 0.001 ? 'hidden' : 'visible';
}
/* A(el, t, {in, d, e, from, base, out, od, oe, to}) */
function A(e, t, o) {
  const base = Object.assign({}, DEF, o.base);
  const pi = o.in == null ? 1 : P(t, o.in, o.d ?? .9, o.e ?? E.outExpo);
  const po = o.out == null ? 0 : P(t, o.out, o.od ?? .5, o.oe ?? E.inCubic);
  const v = Object.assign({}, base);
  if (o.from) for (const k in o.from) v[k] = L(o.from[k], base[k], pi);
  if (o.to) for (const k in o.to) v[k] = L(v[k], o.to[k], po);
  // A word parked outside its mask is hidden so descenders never peek through.
  if ((o.from && o.from.yp && pi === 0) || (o.to && o.to.yp && po === 1)) v.o = 0;
  apply(e, v);
  return v;
}
/* Animate a list. `in` may be a number (with st stagger) or an array of times. */
function AW(list, t, o) {
  list.forEach((e, i) => {
    const q = Object.assign({}, o);
    q.in = Array.isArray(o.in) ? o.in[i] : o.in + i * (o.st ?? .06);
    if (o.out != null) q.out = o.out + i * (o.ost ?? .025);
    A(e, t, q);
  });
}
const RISE = { from: { yp: 125 }, d: 1.0, e: E.outExpo };
const UP = { to: { yp: -125 }, od: .55, oe: E.inCubic };
const rise = (words, t, times, out, extra = {}) => AW(words, t, Object.assign({}, RISE, { in: times }, out != null ? Object.assign({}, UP, { out }) : {}, extra));
const blurIn = (words, t, times, out, extra = {}) => AW(words, t, Object.assign({ from: { o: 0, b: 16, s: 1.12, y: 18 }, d: 1.1, e: E.outQuart, in: times }, out != null ? { out, to: { o: 0, b: 14, y: -14 }, od: .5 } : {}, extra));

function show(e, t, a, b) { const on = t >= a && t < b; e.style.display = on ? 'block' : 'none'; return on; }
function panelUp(sc, t, a, d = .85) {
  const p = P(t, a, d, E.outQuart);
  const r = (1 - p) * 90;
  sc.el.style.transform = `translateY(${(1 - p) * 104}%)`;
  sc.el.style.borderRadius = `${r}px ${r}px 0 0`;
  sc.el.style.boxShadow = p < 1 ? '0 -30px 80px rgba(0,0,0,.25)' : 'none';
}
function pushBack(sc, t, a, d = .85) {
  const p = P(t, a, d, E.inOutCubic);
  sc.dim.style.opacity = p * .45;
  return L(1, .9, p);
}
function circleIn(sc, t, a, d, x, y, R = 2400, e = E.inOutCubic) {
  const p = P(t, a, d, e);
  sc.el.style.clipPath = p >= 1 ? 'none' : `circle(${p * R}px at ${x}px ${y}px)`;
}
function cam(sc, t, a, b, s0 = 1, s1 = 1.05, extra = 1, x = 0, y = 0) {
  const s = L(s0, s1, clamp((t - a) / (b - a))) * extra;
  sc.cam.style.transform = `translate(${x}px,${y}px) scale(${s})`;
}
function counter(e, t, a, d, from, to, fmt = v => Math.round(v)) { e.textContent = fmt(L(from, to, P(t, a, d, E.outCubic))); }

const scenes = [];
function scene(bg, a, b) {
  const e = div('scene', stage, { background: bg, zIndex: scenes.length + 1 });
  const camEl = div('cam', e);
  const dim = div('dim', e);
  const sc = { el: e, cam: camEl, dim, a, b, draw: () => {} };
  scenes.push(sc);
  return sc;
}
function glow(parent, x, y, size, color, op = .55) { return div('glow', parent, { left: x - size / 2 + 'px', top: y - size / 2 + 'px', width: size + 'px', height: size + 'px', background: color, opacity: op }); }
function drift(g, t, i, amp = 60) { g.style.transform = `translate(${Math.sin(t * .35 + i * 2.1) * amp}px, ${Math.cos(t * .29 + i * 1.3) * amp}px)`; }

const CUES = [];
const cue = (time, type, gain = 1) => CUES.push({ t: +time.toFixed(3), type, gain });

function rectIn(e, ref = stage) {
  const r = e.getBoundingClientRect(), s = ref.getBoundingClientRect();
  return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height, cx: r.left - s.left + r.width / 2, cy: r.top - s.top + r.height / 2 };
}
function cursor(parent, name, color) {
  const c = div('abs', parent, { left: 0, top: 0, width: '40px', height: '40px', zIndex: 50 });
  svg(c, 30, 40, '0 0 30 40', CURSOR, { left: 0, top: 0, filter: 'drop-shadow(0 6px 10px rgba(0,0,0,.25))' });
  div('chip', c, { position: 'absolute', left: '26px', top: '34px', background: color, color: '#fff', fontSize: '20px', padding: '6px 14px' }, name);
  return c;
}
/* Move a cursor through [time, x, y] keyframes, with a press at `click`. */
function moveCursor(c, t, keys, click) {
  let x = keys[0][1], y = keys[0][2];
  for (let i = 1; i < keys.length; i++) {
    const p = P(t, keys[i - 1][0], keys[i][0] - keys[i - 1][0], E.inOutCubic);
    if (t >= keys[i - 1][0]) { x = L(keys[i - 1][1], keys[i][1], p); y = L(keys[i - 1][2], keys[i][2], p); }
  }
  const press = click != null ? 1 - .18 * bell(t, click, .22) : 1;
  apply(c, Object.assign({}, DEF, { x, y, s: press, o: t >= keys[0][0] && t <= keys[keys.length - 1][0] + .01 ? 1 : 0 }));
}
function ripple(parent, x, y, color) {
  const r = div('abs', parent, { left: x - 60 + 'px', top: y - 60 + 'px', width: '120px', height: '120px', borderRadius: '50%', border: `4px solid ${color}`, zIndex: 40 });
  return (t, a) => { const p = P(t, a, .7, E.outCubic); apply(r, Object.assign({}, DEF, { s: L(.2, 1.6, p), o: t < a ? 0 : (1 - p) * .9 })); };
}

/* ---------- global overlays ---------- */
const vignette = div('', stage, null); vignette.id = 'vignette';
const flash = div('', stage, null); flash.id = 'flash';
const fadeEl = div('', stage, null); fadeEl.id = 'fade';
const grain = el('canvas', '', stage); grain.id = 'grain';
{
  grain.width = 1048; grain.height = 1208;
  const g = grain.getContext('2d');
  const img = g.createImageData(grain.width, grain.height);
  for (let i = 0; i < img.data.length; i += 4) { const v = rnd() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  Object.assign(grain.style, { width: '2096px', height: '2416px', left: '-88px', top: '-88px', imageRendering: 'pixelated' });
}

/* =====================================================================
 * 1. HOOK: It's two p.m. Did Dad have his tablets?
 * ===================================================================== */
const s1 = scene('#0F1915', 0, 5.85);
{
  const c = s1.cam;
  const g1 = glow(c, 960, 420, 900, '#0E4A3E', .5), g2 = glow(c, 1500, 900, 700, '#3A2A12', .35);
  const clock = svg(c, 440, 440, '-100 -100 200 200', `
    <circle class="face" r="90" fill="none" stroke="#FFFFEB" stroke-opacity=".9" stroke-width="1.6" pathLength="1" stroke-dasharray="1" />
    ${Array.from({ length: 12 }, (_, i) => `<line class="tick" x1="0" y1="-80" x2="0" y2="${i % 3 ? -74 : -70}" stroke="#FFFFEB" stroke-width="${i % 3 ? 1.4 : 2.6}" stroke-linecap="round" transform="rotate(${i * 30})"/>`).join('')}
    <line class="hh" x1="0" y1="6" x2="0" y2="-44" stroke="#FFFFEB" stroke-width="5" stroke-linecap="round"/>
    <line class="mh" x1="0" y1="8" x2="0" y2="-66" stroke="#FFFFEB" stroke-width="3" stroke-linecap="round"/>
    <line class="sh" x1="0" y1="14" x2="0" y2="-78" stroke="#F5A33B" stroke-width="1.4" stroke-linecap="round"/>
    <circle r="4.5" fill="#F5A33B"/>`, { left: '740px', top: '150px' });
  const face = clock.querySelector('.face'), ticks = [...clock.querySelectorAll('.tick')];
  const hh = clock.querySelector('.hh'), mh = clock.querySelector('.mh'), sh = clock.querySelector('.sh');
  const h1 = txt(c, "It's 2:00 p.m.", 'sans center free', { top: '650px', fontSize: '64px', fontWeight: 500, color: '#FFFFEB', letterSpacing: '.01em' }, { chars: true });
  const h2 = txt(c, 'Did Dad have his *tablets*', 'serif center', { top: '600px', fontSize: '156px', color: '#FFFFEB' });
  h2.ws[4].style.color = '#D2E5CE';
  const qm = el('span', 'm', h2.box); const q = el('span', 'w', qm, { color: '#F5A33B' }); q.textContent = '?';
  h2.ws.push(q);
  const orange = div('abs', c, { inset: 0, background: '#F5A33B', opacity: 0 });
  let origin = null;
  for (let i = 2; i <= 5; i++) cue(i + .02, 'tick', .8);
  cue(4.75, 'riser', 1); cue(5.5, 'whoosh', 1);
  s1.draw = t => {
    if (!origin) { const r = rectIn(q); origin = `${r.x + r.w * .52}px ${r.y + r.h * .6}px`; s1.cam.style.transformOrigin = origin; }
    drift(g1, t, 0); drift(g2, t, 1);
    face.style.strokeDashoffset = 1 - P(t, .15, 1.3, E.inOutCubic);
    ticks.forEach((k, i) => A(k, t, { in: .35 + i * .07, from: { o: 0 }, d: .4 }));
    const spin = P(t, .4, 1.6, E.outExpo);
    hh.setAttribute('transform', `rotate(${spin * 60})`);
    mh.setAttribute('transform', `rotate(${spin * 720})`);
    const st = Math.max(0, t - 2);
    const n = Math.floor(st), f = st - n;
    sh.setAttribute('transform', `rotate(${(n + E.outBack(clamp(f / .18))) * 6 + (t < 2 ? spin * 360 : 360)})`);
    A(clock, t, { in: 0, d: 1, from: { s: .9, o: 0 }, out: 3.0, od: 1.0, oe: E.inOutCubic, to: { y: -120, s: .58, o: .25 } });
    AW(h1.cs, t, { in: 1.55, st: .035, from: { o: 0, b: 12, y: 24 }, d: .7, e: E.outCubic, out: 2.95, ost: .015, to: { o: 0, y: -30, b: 8 }, od: .4 });
    rise(h2.ws, t, sync('h2', 5).concat([wt('h2', 4) + .45]));
    const zoom = Math.exp(Math.log(90) * P(t, 4.85, .85, E.inExpo));
    cam(s1, t, 3, 4.85, 1, 1.05, zoom);
    orange.style.opacity = P(t, 5.3, .25, E.linear);
  };
}

/* =====================================================================
 * 2. THE GROUP CHAT: three siblings, a dose given twice, notes lost.
 * ===================================================================== */
const s2 = scene('#FFFFEB', 5.45, 21.25);
{
  const c = s2.cam;
  const g1 = glow(c, 300, 200, 800, '#F2DCC9', .7), g2 = glow(c, 1700, 950, 800, '#DCE9E2', .8);
  const people = [
    { n: 'Sam', col: '#0E6B5C', x: 600, y: 520 },
    { n: 'Alex', col: '#F5A33B', x: 1320, y: 520 },
    { n: 'Jo', col: '#E58F7E', x: 960, y: 900 },
  ];
  const dad = { x: 960, y: 650 };
  const lines = svg(c, 1920, 1080, '0 0 1920 1080', people.map(p => `<line x1="${p.x}" y1="${p.y}" x2="${dad.x}" y2="${dad.y}" stroke="#1A1A1A" stroke-opacity=".22" stroke-width="3" stroke-dasharray="1" pathLength="1"/>`).join(''), { left: 0, top: 0 });
  const lineEls = [...lines.querySelectorAll('line')];
  const dadEl = div('node', c, { left: dad.x - 95 + 'px', top: dad.y - 95 + 'px', width: '190px', height: '190px', background: '#193C34', font: "400 64px 'EB Garamond'" }, 'Dad');
  const nodes = people.map(p => {
    const n = div('node', c, { left: p.x - 75 + 'px', top: p.y - 75 + 'px', width: '150px', height: '150px', background: p.col, zIndex: 5 }, p.n[0]);
    const lab = div('abs sans', c, { left: p.x - 100 + 'px', top: p.y + 88 + 'px', width: '200px', textAlign: 'center', font: "600 30px 'Figtree'" }, p.n);
    return { n, lab };
  });
  const hA = txt(c, 'Three siblings. *One father.*', 'serif center', { top: '110px', fontSize: '104px' });

  // Phone
  const phone = div('card', c, { left: '1060px', top: '90px', width: '620px', height: '900px', borderRadius: '48px', background: '#FFFFFF', overflow: 'hidden', border: '1px solid rgba(0,0,0,.06)' });
  const head = div('abs', phone, { left: 0, top: 0, right: 0, height: '120px', borderBottom: '1px solid #ECECE2', background: '#FBFBF4', zIndex: 3 });
  const av = people.map((p, i) => div('node', head, { left: 36 + i * 34 + 'px', top: '36px', width: '50px', height: '50px', background: p.col, font: "600 22px 'Figtree'", border: '3px solid #FBFBF4' }, p.n[0]));
  div('abs', head, { left: '160px', top: '30px', font: "600 32px 'Figtree'" }, 'Dad’s care');
  div('abs', head, { left: '160px', top: '72px', font: "400 21px 'Figtree'", color: '#8A8A7E' }, 'Sam, Alex, Jo');
  const area = div('abs', phone, { left: 0, right: 0, top: '120px', bottom: 0, overflow: 'hidden' });
  const list = div('abs', area, { left: '28px', right: '28px', top: 0, display: 'flex', flexDirection: 'column', gap: '14px' });
  const who = { Sam: people[0], Alex: people[1], Jo: people[2] };
  const msgs = [
    [10.85, 'Sam', 'Gave Dad his 2pm tablets 👍', '2:04 PM'],
    [11.55, 'Alex', 'Just gave Dad his tablets!', '2:11 PM'],
    [12.75, 'Jo', 'He seemed a bit dizzy after lunch', '2:30 PM'],
    [13.45, 'Sam', 'Running late, traffic 😩', '2:41 PM'],
    [13.75, 'Alex', 'Who took the good charger', '2:42 PM'],
    [14.05, 'Sam', '📷 Photo', '2:44 PM'],
    [14.3, 'Jo', 'lol', '2:44 PM'],
    [14.55, 'Alex', 'Can someone grab milk?', '2:50 PM'],
    [14.8, 'Sam', '👍', '2:51 PM'],
    [15.05, 'Jo', 'On it', '2:52 PM'],
    [16.35, 'Alex', 'Someone should book Thursday’s transport', '3:15 PM'],
    [17.35, 'Jo', 'Yep!', '3:16 PM'],
    [17.6, 'Sam', 'Will do x', '3:16 PM'],
    [17.9, 'Alex', 'Sunday dinner at mine?', '3:20 PM'],
    [18.15, 'Jo', '🎉🎉', '3:21 PM'],
    [18.45, 'Sam', 'Mum called, says hi', '3:40 PM'],
    [18.75, 'Alex', 'ok', '3:41 PM'],
    [19.0, 'Jo', 'Who has the spare key?', '3:55 PM'],
  ].map(([at, n, text, time]) => {
    const mine = n === 'Jo';
    const b = div('', list, { alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '440px', padding: '14px 22px 12px', borderRadius: mine ? '26px 26px 8px 26px' : '26px 26px 26px 8px', background: mine ? '#DCE9E2' : '#F1F1E6', position: 'relative', transformOrigin: mine ? '100% 100%' : '0% 100%' });
    div('', b, { font: "600 18px 'Figtree'", color: who[n].col, marginBottom: '2px', filter: 'brightness(.8)' }, n);
    div('', b, { font: "400 27px/1.3 'Figtree'" }, text);
    div('', b, { font: "400 16px 'Figtree'", color: '#9A9A8E', textAlign: 'right', marginTop: '2px' }, time);
    cue(at, 'pop', .55);
    return { at, b };
  });
  const ring = (b, col) => div('abs', b, { inset: '-5px', borderRadius: 'inherit', border: `4px solid ${col}`, opacity: 0 });
  const r1 = ring(msgs[0].b, '#EF5B3A'), r2 = ring(msgs[1].b, '#EF5B3A'), r3 = ring(msgs[2].b, '#E9A23B'), r4 = ring(msgs[10].b, '#034F46');
  const x2 = div('node', msgs[1].b, { left: '-24px', top: '-40px', width: '76px', height: '76px', background: '#EF5B3A', font: "700 30px 'Figtree'", boxShadow: '0 10px 20px rgba(239,91,58,.35)' }, '×2');
  cue(12.0, 'thud', .8);

  // Notebook
  const nb = div('card', c, { left: '170px', top: '470px', width: '660px', height: '500px', borderRadius: '10px', background: '#FBF5DF', boxShadow: '0 30px 60px rgba(60,40,10,.18)', overflow: 'hidden',
    backgroundImage: 'repeating-linear-gradient(transparent 0 61px, rgba(60,90,140,.22) 61px 63px)', backgroundPosition: '0 30px' });
  div('abs', nb, { left: '70px', top: 0, bottom: 0, width: '2px', background: 'rgba(220,80,70,.45)' });
  ['Tue · tablets 8am ✓', 'lunch: soup (half)', 'dizzy?? tell Alex', 'Thurs transport — who?'].forEach((s, i) =>
    div('abs', nb, { left: '96px', top: 58 + i * 63 + 'px', font: "italic 400 40px 'EB Garamond'", color: '#2E3B5C', transform: `rotate(${[-1, .6, -1.4, .8][i]}deg)` }, s));

  const hB = txt(c, 'One group chat. / *One paper notebook.*', 'serif', { left: '150px', top: '120px', width: '880px', fontSize: '88px' });
  const hC = txt(c, 'A dose, / *given twice.*', 'serif', { left: '150px', top: '120px', width: '880px', fontSize: '110px' });
  hC.ws.slice(2).forEach(w => (w.style.color = '#EF5B3A'));
  const hD = txt(c, 'A note about dizziness / *never reaches the / next person.*', 'serif', { left: '150px', top: '110px', width: '880px', fontSize: '84px' });
  const hE = txt(c, '“Someone should book / Thursday’s transport.”', 'serif it', { left: '150px', top: '120px', width: '880px', fontSize: '84px', color: '#034F46' });
  const hF = txt(c, 'Said once. / *Then forgotten.*', 'serif', { left: '150px', top: '120px', width: '880px', fontSize: '110px' }, { chars: true });
  const fall = hF.wcs[3].map(() => ({ x: rr(-60, 60), r: rr(-70, 70), d: rr(0, .5), g: rr(900, 1500) }));
  cue(20.35, 'whoosh', .9);

  let measured = null;
  s2.draw = t => {
    if (!measured) {
      measured = {
        avatars: av.map(a => rectIn(a)), bottoms: msgs.map(m => m.b.offsetTop + m.b.offsetHeight),
        areaH: area.offsetHeight,
      };
    }
    drift(g1, t, 0); drift(g2, t, 1);
    cam(s2, t, 5.45, 21.25, 1.0, 1.035);
    // Phase A
    rise(hA.ws, t, [S('c1') - .05, S('c1') + .2, wt('c1', 4) - .1, wt('c1', 4) + .1], 7.6);
    nodes.forEach(({ n, lab }, i) => {
      const at = S('c1') + .05 + i * .28;
      const p = people[i];
      const target = measured.avatars[i];
      const tx = target.cx - p.x, ty = target.cy - p.y, ts = target.w / 150;
      const pf = P(t, 7.7, .85, E.inOutCubic);
      const sIn = P(t, at, .8, E.outBack);
      apply(n, Object.assign({}, DEF, { x: tx * pf, y: ty * pf, s: L(0, 1, sIn) * L(1, ts, pf), o: t < at ? 0 : 1 - P(t, 8.5, .1, E.linear) }));
      A(lab, t, { in: at + .15, from: { o: 0, y: 20 }, d: .6, out: 7.55, to: { o: 0 }, od: .2 });
    });
    A(dadEl, t, { in: wt('c1', 4) - .1, from: { s: 0 }, d: .8, e: E.outBack, out: 7.7, to: { s: 0, o: 0 }, od: .45, oe: E.inCubic });
    lineEls.forEach((l, i) => { l.style.strokeDashoffset = 1 - P(t, 6.85 + i * .12, .6, E.inOutCubic); l.style.opacity = 1 - P(t, 7.6, .3, E.linear); });
    // Phone & notebook
    A(phone, t, { in: 7.75, d: 1.1, from: { y: 1100, r: 6 }, out: 20.35, od: .8, oe: E.inCubic, to: { y: 1250, r: 9 } });
    av.forEach(a => (a.style.opacity = t < 8.5 ? 0 : 1));
    A(nb, t, { base: { r: -4 }, in: wt('c2', 4) - .25, d: 1.1, from: { y: 760, r: -16 }, out: 20.3, od: .75, oe: E.inCubic, to: { x: -1100, r: -28 } });
    rise(hB.ws, t, sync('c2', 6), 10.55);
    rise(hC.ws, t, sync('c3', 4), 12.5);
    rise(hD.ws, t, [S('c4') - .05, S('c4') + .12, S('c4') + .28, wt('c4', 3) - .1, wt('c4', 5) - .1, wt('c4', 6) - .1, wt('c4', 7) - .1, wt('c4', 8) - .1, wt('c4', 9) - .1], 16.05);
    rise(hE.ws, t, sync('c5', 6).slice(1), 18.5);
    // Said once. Then forgotten.
    rise(hF.ws.slice(0, 2), t, [S('c6') - .05, S('c6') + .2], 20.4);
    rise([hF.ws[2]], t, [wt('c6', 2) - .1], 20.5);
    hF.ms[3].style.overflow = t > wt('c6', 3) + .6 ? 'visible' : 'hidden';
    rise([hF.ws[3]], t, [wt('c6', 3) - .1]);
    hF.wcs[3].forEach((ch, i) => {
      const a = 19.95 + fall[i].d + i * .03, dt = Math.max(0, t - a);
      apply(ch, Object.assign({}, DEF, { x: fall[i].x * dt, y: .5 * fall[i].g * dt * dt, r: fall[i].r * dt * 2, o: 1 - clamp(dt / .9) }));
    });
    // Messages
    let shift = 0;
    msgs.forEach((m, i) => {
      const inc = measured.bottoms[i] - (i ? measured.bottoms[i - 1] : 0) + (i ? 0 : 0);
      shift += inc * P(t, m.at - .05, .55, E.outCubic);
      A(m.b, t, { in: m.at, d: .6, e: E.outBack, from: { s: .6, o: 0, y: 30 } });
    });
    list.style.transform = `translateY(${measured.areaH - 26 - shift}px)`;
    r1.style.opacity = r2.style.opacity = P(t, 11.9, .3) * (1 - P(t, 13.6, .4));
    A(x2, t, { in: 11.95, from: { s: 0, r: -40 }, d: .6, e: E.outBack, out: 13.6, to: { s: 0, o: 0 }, od: .3 });
    r3.style.opacity = P(t, 12.95, .3);
    r4.style.opacity = P(t, 16.55, .3);
  };
}

/* =====================================================================
 * 3. Care changes hands. But the details can stay together.
 * ===================================================================== */
const s3 = scene('#FFFFEB', 21.0, 25.9);
{
  const c = s3.cam;
  const g1 = glow(c, 960, 540, 1100, '#E1E6CD', .8);
  const t1 = txt(c, 'Care changes hands.', 'serif center free', { top: '420px', fontSize: '176px' });
  const sweep = div('abs', c, { left: '360px', top: '660px', width: '1200px', height: '6px', background: '#D2E5CE', borderRadius: '3px', transformOrigin: '100% 50%' });
  const t2a = txt(c, 'But the details', 'serif center free', { top: '330px', fontSize: '120px' }, { chars: true });
  const t2b = txt(c, '*can stay together.*', 'serif center free', { top: '480px', fontSize: '170px', color: '#034F46' }, { chars: true });
  const all = t2a.cs.concat(t2b.cs);
  const sc = all.map(() => ({ x: rr(-950, 950), y: rr(-560, 560), r: rr(-160, 160), s: rr(.3, 2.4), d: rr(0, .85) }));
  cue(21.55, 'swoosh', .8); cue(22.95, 'swoosh', .6); cue(23.2, 'shimmer', .8);
  s3.draw = t => {
    drift(g1, t, 2, 80);
    cam(s3, t, 21, 25.9, 1, 1.06);
    AW(t1.ws, t, { in: S('t1') - .1, st: .09, from: { x: 1500, b: 24, o: 0 }, d: 1.1, e: E.outExpo, out: 22.95, ost: .05, to: { x: -1700, b: 26, o: 0 }, od: .6, oe: E.inExpo });
    A(sweep, t, { in: S('t1') + .2, d: .9, from: { sx: 0 }, base: {}, out: 22.95, to: { x: -1500, o: 0 }, od: .5, oe: E.inExpo });
    all.forEach((ch, i) => {
      const q = sc[i];
      A(ch, t, { in: S('t2') - .05 + q.d, d: 1.35, e: E.outExpo, from: { x: q.x, y: q.y, r: q.r, s: q.s, o: 0, b: 14 } });
    });
  };
}

/* =====================================================================
 * 4. LOGO: This is CareLog.
 * ===================================================================== */
const s4 = scene('#193C34', 25.1, 28.5);
{
  const c = s4.cam;
  const g1 = glow(c, 960, 480, 900, '#2D6B57', .55);
  const ringE = div('abs', c, { left: '960px', top: '480px', width: '10px', height: '10px', marginLeft: '-5px', marginTop: '-5px', borderRadius: '50%', border: '2px solid #D2E5CE' });
  const lock = div('abs', c, { left: 0, right: 0, top: '370px', height: '220px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '40px' });
  const markBox = div('', lock, { width: '210px', height: '210px', position: 'relative' });
  const mark = svg(markBox, 210, 210, '0 0 48 48', `<g stroke="#FFFFEB" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none">${LOGO_PATHS}</g>`, { left: 0, top: 0 });
  const paths = [...mark.querySelectorAll('path')];
  paths.forEach(p => (p.style.strokeDasharray = 1));
  const word = txt(lock, 'CareLog', '', { position: 'relative', font: "600 176px 'DM Sans'", color: '#FFFFEB', letterSpacing: '-.02em' }, { chars: true });
  word.box.querySelectorAll('.m').forEach(m => (m.style.overflow = 'hidden'));
  const tag = txt(c, 'Care changes hands. *The details stay together.*', 'serif center', { top: '660px', fontSize: '56px', color: '#D2E5CE' });
  cue(25.15, 'reveal', 1); cue(25.95, 'chime', 1); cue(25.6, 'boom', .9);
  s4.draw = t => {
    circleIn(s4, t, 25.1, .75, 960, 540, 1250);
    drift(g1, t, 3, 50);
    cam(s4, t, 25.1, 28.5, 1.06, 1, pushBack(s4, t, 27.5));
    paths.forEach((p, i) => (p.style.strokeDashoffset = 1 - P(t, 25.45 + i * .2, 1.0, E.inOutCubic)));
    AW(word.cs, t, { in: 25.85, st: .05, from: { yp: 105 }, d: 1.0 });
    A(ringE, t, { in: 26.3, d: 1.6, e: E.outCubic, from: { s: 0, o: .9 }, base: { s: 110, o: 0 } });
    blurIn(tag.ws, t, 26.55, null, { st: .06 });
  };
}

/* =====================================================================
 * 5. ONE SHARED RECORD: every entry carries a name and a time.
 * ===================================================================== */
const s5 = scene('#034F46', 27.45, 34.4);
{
  const c = s5.cam;
  const g1 = glow(c, 1400, 500, 1000, '#0B7A69', .5);
  const label = txt(c, 'One shared record', 'label', { left: '150px', top: '250px', color: '#D2E5CE' });
  const h1 = txt(c, 'One shared record / for everyone who / takes *a turn.*', 'serif', { left: '150px', top: '310px', width: '820px', fontSize: '88px', color: '#FFFFEB' });
  const h2 = txt(c, 'Every entry carries / *a name,* and / *a time.*', 'serif', { left: '150px', top: '310px', width: '820px', fontSize: '96px', color: '#FFFFEB' });
  const ul = [4, 7].map(i => div('abs', h2.ms[i], { left: '6%', right: '6%', bottom: '14%', height: '7px', background: '#F5A33B', borderRadius: '4px', transformOrigin: '0 50%' }));
  h2.ms[4].style.position = h2.ms[7].style.position = 'relative';
  const card = div('card', c, { left: '1010px', top: '170px', width: '760px', height: '740px', padding: '48px 52px', background: '#FFFFEB' });
  div('label', card, { color: '#034F46', fontSize: '20px' }, 'Today · Dad’s care');
  div('', card, { font: "400 46px 'EB Garamond'", marginTop: '10px' }, 'Tuesday, 14 October');
  div('', card, { height: '1px', background: '#E4E4D0', margin: '26px 0 6px' });
  const P_ = { Sam: '#0E6B5C', Alex: '#D98A1E', Jo: '#D0705E' };
  const rows = [['Morning medication', 'Alex', '8:02 AM'], ['Breakfast, half a bowl', 'Alex', '8:40 AM'], ['Lunch at 12:45', 'Sam', '12:47 PM'], ['Short walk afterwards', 'Sam', '1:30 PM']].map(([title, n, time]) => {
    const r = div('', card, { display: 'flex', gap: '24px', alignItems: 'center', padding: '22px 0', borderBottom: '1px solid #EEEEDC' });
    const ck = div('', r, { width: '56px', height: '56px', borderRadius: '50%', background: '#D2E5CE', flex: 'none', position: 'relative' });
    svg(ck, 56, 56, '0 0 24 24', CHECK('#193C34', 2.6), { left: 0, top: 0 });
    const body = div('', r);
    div('', body, { font: "500 32px 'Figtree'" }, title);
    const meta = div('', body, { display: 'flex', gap: '12px', marginTop: '10px', alignItems: 'center' });
    const nc = div('chip', meta, { background: P_[n], color: '#fff' }, n);
    const tc = div('chip tab', meta, { background: '#E4E4D0', color: '#1A1A1A' }, time);
    div('', meta, { font: "400 20px 'Figtree'", color: '#8A8A7E' }, 'recorded');
    return { r, ck, nc, tc };
  });
  rows.forEach((_, i) => cue(28.65 + i * .45, 'tick2', .45));
  cue(27.5, 'whoosh', .9);
  s5.draw = t => {
    panelUp(s5, t, 27.45);
    drift(g1, t, 4, 60);
    cam(s5, t, 27.45, 34.4, 1, 1.04, pushBack(s5, t, 33.4));
    rise(label.ws, t, 27.9, 30.55, { st: .05 });
    rise(h1.ws, t, sync('r1', 9), 30.55);
    rise(h2.ws, t, sync('r2', 8));
    ul.forEach((u, i) => A(u, t, { in: wt('r2', i ? 7 : 4) + .05, d: .5, e: E.outCubic, from: { sx: 0 } }));
    A(card, t, { base: { ry: -7, rx: 2 }, in: 28.0, d: 1.3, from: { y: 360, o: 0, ry: -30, rx: 12 } });
    rows.forEach((r, i) => {
      A(r.r, t, { in: 28.6 + i * .45, d: .9, from: { x: 70, o: 0 } });
      A(r.ck, t, { in: 28.75 + i * .45, d: .7, e: E.outBack, from: { s: 0 } });
      const pn = bell(t, wt('r2', 4) + i * .05, .5), pt = bell(t, wt('r2', 7) + i * .05, .5);
      apply(r.nc, Object.assign({}, DEF, { s: 1 + .2 * pn }));
      r.nc.style.boxShadow = `0 0 0 ${pn * 8}px rgba(245,163,59,${.5 * pn})`;
      apply(r.tc, Object.assign({}, DEF, { s: 1 + .2 * pt }));
      r.tc.style.boxShadow = `0 0 0 ${pt * 8}px rgba(245,163,59,${.5 * pt})`;
    });
  };
}

/* =====================================================================
 * 6. RECORDED ONCE: a second attempt shows who already did.
 * ===================================================================== */
const s6 = scene('#FFFFEB', 33.35, 39.9);
{
  const c = s6.cam;
  const g1 = glow(c, 400, 900, 900, '#F2DCC9', .7);
  const h1 = txt(c, 'Each dose is *recorded once.*', 'serif center', { top: '150px', fontSize: '110px' });
  const h2 = txt(c, 'Try again, and CareLog shows you / *who already did.*', 'serif center', { top: '90px', fontSize: '92px' });
  const card = div('card', c, { left: '410px', top: '420px', width: '1100px', height: '260px', display: 'flex', alignItems: 'center', padding: '0 50px', gap: '36px', border: '1px solid #E4E4D0' });
  const ic = div('', card, { width: '110px', height: '110px', borderRadius: '30px', background: '#DCE9E2', flex: 'none', position: 'relative' });
  svg(ic, 110, 110, '0 0 48 48', '<rect x="10" y="19" width="28" height="11" rx="5.5" fill="none" stroke="#034F46" stroke-width="2.4" transform="rotate(-35 24 24)"/><line x1="24" y1="14" x2="24" y2="34" stroke="#034F46" stroke-width="2.4" transform="rotate(-35 24 24)"/>', { left: 0, top: 0 });
  const body = div('', card, { flex: 1 });
  div('', body, { font: "600 48px 'Figtree'" }, 'Afternoon tablets');
  div('', body, { font: "400 27px 'Figtree'", color: '#7A7A6E', marginTop: '8px' }, '2:00 PM · scheduled for Dad');
  const btnBox = div('', card, { position: 'relative', width: '360px', height: '96px', flex: 'none' });
  const btn = div('pill', btnBox, { position: 'absolute', inset: 0, justifyContent: 'center', background: '#D2E5CE', color: '#193C34', border: '1.5px solid #9FC29A' }, 'Record as given');
  const done = div('pill', btnBox, { position: 'absolute', inset: '0 -60px 0 -40px', justifyContent: 'center', background: '#193C34', color: '#FFFFEB', fontSize: '25px', flexDirection: 'column', gap: '2px', padding: '0' });
  done.innerHTML = '<span style="display:flex;gap:10px;align-items:center"><svg width="28" height="28" viewBox="0 0 24 24">' + CHECK('#D2E5CE', 3) + '</svg>Recorded by Sam</span><span style="font:400 21px Figtree;color:#D2E5CE">Today · 2:04 PM</span>';
  const banner = div('', c, { position: 'absolute', left: '410px', top: '720px', width: '1100px', padding: '28px 40px', borderRadius: '22px', background: '#FBE5DA', border: '2px solid #EF5B3A', display: 'flex', gap: '24px', alignItems: 'center' });
  banner.innerHTML = '<div style="width:56px;height:56px;border-radius:50%;background:#EF5B3A;color:#fff;display:flex;align-items:center;justify-content:center;font:700 30px Figtree;flex:none">!</div><div><div style="font:600 34px Figtree">Already recorded by Sam at 2:04 PM.</div><div style="font:400 23px Figtree;color:#7A5A4E;margin-top:6px">A real second dose can still be reported as a flagged exception, with a reason.</div></div>';
  const sam = cursor(c, 'Sam', '#0E6B5C'), alex = cursor(c, 'Alex', '#D98A1E');
  const bx = 1340, by = 552;
  const rip1 = ripple(c, bx, by, '#193C34'), rip2 = ripple(c, bx, by, '#EF5B3A');
  const click1 = 34.6, click2 = 36.6;
  cue(33.4, 'whoosh', .9); cue(click1, 'click', 1); cue(click1 + .08, 'success', .7); cue(click2, 'click', 1); cue(click2 + .05, 'error', .9);
  s6.draw = t => {
    panelUp(s6, t, 33.35);
    drift(g1, t, 5);
    cam(s6, t, 33.35, 39.9, 1, 1.04, pushBack(s6, t, 39.0, .7));
    rise(h1.ws, t, sync('o1', 5).map((x, i) => (i > 2 ? x + .05 : x)), 35.5);
    rise(h2.ws, t, sync('o2', 9));
    const shake = t > click2 ? 22 * Math.sin((t - click2) * 2 * Math.PI * 8) * Math.exp(-(t - click2) * 7) : 0;
    A(card, t, { in: 33.7, d: 1.0, from: { y: 200, o: 0, s: .94 }, base: { x: shake } });
    const dp = P(t, click1 + .05, .5, E.outBack);
    apply(btn, Object.assign({}, DEF, { s: (1 - .06 * bell(t, click1, .2)), o: 1 - P(t, click1 + .05, .2, E.linear) }));
    apply(done, Object.assign({}, DEF, { s: L(.7, 1, dp) * (1 - .05 * bell(t, click2, .2)), o: P(t, click1 + .05, .2, E.linear) }));
    A(banner, t, { in: click2 + .12, d: .8, e: E.outBack, from: { y: -70, o: 0, s: .96 } });
    moveCursor(sam, t, [[33.9, 520, 1160], [34.5, bx - 10, by - 6], [35.0, bx - 10, by - 6], [35.5, 300, 1200]], click1);
    moveCursor(alex, t, [[35.75, 1750, 1160], [36.5, bx + 8, by + 4], [37.6, bx + 8, by + 4], [38.3, 1800, 1200]], click2);
    rip1(t, click1); rip2(t, click2);
  };
}

/* =====================================================================
 * 7. HONEST ABOUT UNCERTAINTY: never "missed".
 * ===================================================================== */
const s7 = scene('#0F1915', 38.95, 45.4);
{
  const c = s7.cam;
  const g1 = glow(c, 960, 600, 1000, '#16473C', .5);
  const edge = div('abs', stage, { top: 0, bottom: 0, width: '8px', background: '#D2E5CE', zIndex: 60, display: 'none' });
  const h1 = txt(c, 'If nothing was recorded, / *it says exactly that.*', 'serif center', { top: '120px', fontSize: '96px', color: '#FFFFEB' });
  const card = div('card', c, { left: '360px', top: '430px', width: '1200px', height: '290px', background: '#18241F', border: '1px solid #2D3D36', boxShadow: '0 40px 80px rgba(0,0,0,.4)', padding: '44px 56px' });
  const clockT = div('abs tab', card, { left: '56px', top: '46px', font: "600 76px 'Figtree'", color: '#FFFFEB' }, '5:58 PM');
  div('abs', card, { left: '470px', top: '54px', font: "600 42px 'Figtree'", color: '#FFFFEB' }, 'Evening tablets');
  const sched = div('abs', card, { left: '470px', top: '112px', font: "400 28px 'Figtree'", color: '#8FA39A' }, 'Scheduled 6:00 PM · Dad');
  div('abs', card, { left: '56px', right: '56px', top: '178px', height: '1px', background: '#2D3D36' });
  const dot = div('abs', card, { left: '56px', top: '214px', width: '22px', height: '22px', borderRadius: '50%', background: '#E9A23B' });
  const status = 'Scheduled time passed; no administration recorded';
  const stEl = div('abs', card, { left: '96px', top: '204px', font: "500 32px 'Figtree'", color: '#F3D9A8' });
  const stampWrap = div('abs', c, { left: 0, right: 0, top: '465px', display: 'flex', justifyContent: 'center', zIndex: 5 });
  const stamp = div('', stampWrap, { position: 'relative', font: "700 170px 'Figtree'", color: '#EF5B3A', border: '10px solid #EF5B3A', borderRadius: '24px', padding: '0 44px', lineHeight: '1.15', letterSpacing: '.04em', whiteSpace: 'nowrap', background: 'rgba(15,25,21,.55)' }, 'MISSED');
  const strike = div('abs', stamp, { left: '-30px', right: '-30px', top: '50%', height: '14px', marginTop: '-7px', background: '#FFFFEB', borderRadius: '7px', transformOrigin: '0 50%' });
  const h2 = txt(c, 'Not missed. *Just honest.*', 'serif center', { top: '790px', fontSize: '130px', color: '#FFFFEB' });
  h2.ws[2].style.color = h2.ws[3].style.color = '#D2E5CE';
  const stampAt = S('u2') - .05;
  cue(38.95, 'wipe', 1); cue(stampAt, 'stamp', 1); cue(stampAt + .45, 'scratch', .8);
  for (let i = 0; i < 16; i++) cue(39.5 + i * .09, 'tick', .25);
  s7.draw = t => {
    const p = P(t, 38.95, .75, E.inOutQuart);
    s7.el.style.clipPath = p >= 1 ? 'none' : `inset(0 0 0 ${(1 - p) * 100}%)`;
    edge.style.display = p > 0 && p < 1 ? 'block' : 'none';
    edge.style.left = (1 - p) * 1920 - 4 + 'px';
    drift(g1, t, 6);
    cam(s7, t, 38.95, 45.4, 1.04, 1, pushBack(s7, t, 44.5));
    rise(h1.ws, t, sync('u1', 8), 42.25);
    A(card, t, { in: 39.3, d: 1, from: { y: 120, o: 0 }, out: stampAt, od: .3, oe: E.outCubic, to: { s: .97, o: .55 } });
    const mins = Math.floor(L(58, 74, P(t, 39.5, 1.5, E.inOutCubic)));
    clockT.textContent = mins < 60 ? `5:${mins} PM` : `6:${String(mins - 60).padStart(2, '0')} PM`;
    sched.style.color = mins >= 60 ? '#E9A23B' : '#8FA39A';
    const n = Math.floor(status.length * P(t, 41.05, 1.0, E.linear));
    stEl.textContent = status.slice(0, n);
    dot.style.opacity = t > 41.0 ? 1 : 0;
    A(stamp, t, { base: { r: -9 }, in: stampAt, d: .32, e: E.outQuart, from: { s: 2.6, o: 0, r: -2 }, out: stampAt + .85, od: .7, oe: E.inCubic, to: { y: 700, r: 30, o: 0 } });
    A(strike, t, { in: stampAt + .4, d: .3, e: E.outCubic, from: { sx: 0 } });
    rise(h2.ws, t, [S('u2'), S('u2') + .25, wt('u2', 2) - .05, wt('u2', 3) - .05]);
  };
}

/* =====================================================================
 * 8. CORRECTIONS: the original, the author, the reason. All kept.
 * ===================================================================== */
const s8 = scene('#F2DCC9', 44.45, 51.7);
{
  const c = s8.cam;
  const g1 = glow(c, 1500, 300, 900, '#F8E9DA', .9);
  const h1 = txt(c, 'Mistakes are / corrected, / *never erased.*', 'serif', { left: '140px', top: '230px', width: '780px', fontSize: '104px' });
  const items = ['The original.', 'The author.', 'The reason.'].map((s, i) => txt(c, s, 'serif', { left: '200px', top: 250 + i * 130 + 'px', fontSize: '92px' }));
  const dots = ['#1A1A1A', '#0E6B5C', '#E9A23B'].map((col, i) => div('abs', c, { left: '140px', top: 300 + i * 130 + 'px', width: '26px', height: '26px', borderRadius: '50%', background: col }));
  const kept = txt(c, '*All kept.*', 'serif', { left: '140px', top: '660px', fontSize: '150px', color: '#034F46' });
  const card = div('card', c, { left: '960px', top: '170px', width: '830px', height: '760px', padding: '50px 54px', background: '#FFFFF6' });
  div('label', card, { color: '#9A6A4E', fontSize: '20px' }, 'Timeline · Tuesday');
  const title = div('', card, { font: "600 54px 'Figtree'", marginTop: '18px', display: 'flex', alignItems: 'baseline', gap: '18px' });
  el('span', '', title, null, 'Lunch at');
  const old = el('span', '', title, { position: 'relative' }, '1:45 PM');
  const strike = div('abs', old, { left: '-6px', right: '-6px', top: '54%', height: '6px', background: '#EF5B3A', borderRadius: '3px', transformOrigin: '0 50%' });
  const nw = el('span', '', title, { color: '#034F46', display: 'inline-block' }, '12:45 PM');
  const meta = div('', card, { display: 'flex', gap: '14px', alignItems: 'center', marginTop: '18px' });
  const samChip = div('chip', meta, { background: '#0E6B5C', color: '#fff' }, 'Sam');
  const badge = div('chip', meta, { background: '#DCE9E2', color: '#034F46' }, 'Corrected');
  div('', card, { height: '1px', background: '#EEE3D6', margin: '36px 0 26px' });
  div('label', card, { color: '#9A9A8E', fontSize: '18px' }, 'History');
  const row = (tag, tagCol, a, b) => {
    const r = div('', card, { marginTop: '22px', padding: '26px 30px', borderRadius: '20px', background: '#F7F1E6', position: 'relative' });
    div('chip', r, { background: tagCol, color: '#fff', fontSize: '17px', padding: '5px 14px', letterSpacing: '.12em' }, tag);
    div('', r, { font: "600 32px 'Figtree'", marginTop: '14px' }, a);
    const sub = div('', r, { font: "400 24px 'Figtree'", color: '#6B6B60', marginTop: '6px' }, b);
    return { r, sub };
  };
  const ra = row('ORIGINAL', '#1A1A1A', 'Lunch at 1:45 PM', '<span class="au">Sam</span> · entered 1:52 PM');
  const rb = row('CORRECTION', '#034F46', 'Changed to 12:45 PM', '<span class="au">Sam</span> · 2:10 PM · <span class="rs">Reason: typed the wrong hour</span>');
  const ringA = div('abs', ra.r, { inset: '-6px', borderRadius: '24px', border: '4px solid #1A1A1A', opacity: 0 });
  const aus = [...card.querySelectorAll('.au')];
  aus.forEach(a => Object.assign(a.style, { display: 'inline-block', fontWeight: 600, color: '#0E6B5C', borderRadius: '8px', padding: '0 6px' }));
  const rs = card.querySelector('.rs');
  Object.assign(rs.style, { backgroundImage: 'linear-gradient(#F5C46B, #F5C46B)', backgroundRepeat: 'no-repeat', backgroundPosition: '0 85%', padding: '0 4px', color: '#1A1A1A' });
  const seal = div('node', c, { left: '1650px', top: '110px', width: '200px', height: '200px', background: '#034F46', font: "700 26px 'Figtree'", letterSpacing: '.14em', flexDirection: 'column', gap: '6px', boxShadow: '0 20px 40px rgba(3,79,70,.35)', zIndex: 5 });
  seal.innerHTML = '<svg width="52" height="52" viewBox="0 0 24 24">' + CHECK('#D2E5CE', 2.6) + '</svg>ALL KEPT';
  const tx2 = [1, 3, 5, 7].map(i => wt('x2', i - 1));
  cue(44.5, 'whoosh', .9); cue(45.6, 'scratch', .6); cue(45.95, 'tick2', .6); tx2.forEach((x, i) => cue(x, i === 3 ? 'stamp' : 'tick2', i === 3 ? .7 : .5));
  s8.draw = t => {
    panelUp(s8, t, 44.45);
    drift(g1, t, 7);
    cam(s8, t, 44.45, 51.7, 1, 1.045);
    rise(h1.ws, t, sync('x1', 5), 47.2);
    items.forEach((it, i) => { rise(it.ws, t, [tx2[i] - .05, tx2[i] + .12]); A(dots[i], t, { in: tx2[i], d: .6, e: E.outBack, from: { s: 0 } }); });
    rise(kept.ws, t, [tx2[3] - .05, tx2[3] + .15]);
    A(card, t, { base: { r: 1.5 }, in: 44.8, d: 1.2, from: { y: 300, o: 0, r: 6 } });
    A(strike, t, { in: 45.55, d: .35, e: E.outCubic, from: { sx: 0 } });
    old.style.color = t > 45.7 ? '#B0A89A' : '#1A1A1A';
    A(nw, t, { in: 45.85, d: .7, e: E.outBack, from: { y: -50, o: 0, s: .8 } });
    A(badge, t, { in: 46.0, d: .6, e: E.outBack, from: { s: 0 } });
    A(ra.r, t, { in: 46.35, d: .9, from: { y: -40, o: 0, rx: -50 } });
    A(rb.r, t, { in: 46.75, d: .9, from: { y: -40, o: 0, rx: -50 } });
    ringA.style.opacity = bell(t, tx2[0], 1.4) > .02 ? Math.min(1, bell(t, tx2[0], 1.4) * 2) : 0;
    const pa = bell(t, tx2[1], 1.0);
    aus.concat([samChip]).forEach(a => { a.style.boxShadow = `0 0 0 ${pa * 7}px rgba(14,107,92,${.35 * pa})`; a.style.transform = `scale(${1 + .12 * pa})`; });
    rs.style.backgroundSize = `${P(t, tx2[2], .6, E.outCubic) * 100}% 40%`;
    A(seal, t, { in: tx2[3], d: .7, e: E.outBack, from: { s: 0, r: -90 }, base: { r: -8 } });
  };
}

/* =====================================================================
 * 9. QUICK LOG: type it the way you'd say it.
 * ===================================================================== */
const s9 = scene('#DCE9E2', 50.75, 58.6);
{
  const c = s9.cam;
  const g1 = glow(c, 300, 300, 900, '#EEF5F1', .9), g2 = glow(c, 1600, 900, 800, '#C5DDD0', .8);
  const h1 = txt(c, 'Just type it *the way you’d say it.*', 'serif center', { top: '170px', fontSize: '104px' });
  const h2 = txt(c, 'And it becomes *the right record.*', 'serif center', { top: '170px', fontSize: '104px' });
  const input = div('card', c, { left: '230px', top: '400px', width: '1460px', height: '160px', borderRadius: '30px', background: '#FFFFF6' });
  const pen = div('', input, { position: 'absolute', left: '34px', top: '35px', width: '90px', height: '90px', borderRadius: '50%', background: '#D2E5CE' });
  svg(pen, 90, 90, '0 0 24 24', '<path d="M5 19l1-4 9-9 3 3-9 9-4 1z" fill="none" stroke="#193C34" stroke-width="1.6" stroke-linejoin="round"/>', { left: 0, top: 0 });
  const ph = div('abs', input, { left: '156px', top: '46px', font: "400 52px 'Figtree'", color: '#A6A69A' }, 'Quick log: type what happened');
  const typed = 'gave Dad his morning medication at 8am';
  const line = div('abs', input, { left: '156px', top: '44px', font: "500 56px 'Figtree'", whiteSpace: 'pre' });
  const tokens = [[0, 4, '#BFE0D6'], [5, 8, '#F4C9BF'], [13, 20, '#F8DDAA'], [21, 31, '#BFE0D6'], [35, 38, '#D7D7C3']];
  const hl = tokens.map(([a, b, col]) => div('abs', line, { background: col, borderRadius: '12px', top: '-4px', height: '76px', transformOrigin: '0 50%', zIndex: -1 }));
  line.style.zIndex = 1;
  const chars = [...typed].map(ch => { const s = el('span', '', line, { display: 'inline-block' }); s.textContent = ch === ' ' ? ' ' : ch; return s; });
  const caret = div('abs', input, { top: '46px', width: '5px', height: '66px', background: '#034F46', borderRadius: '3px' });
  const card = div('card', c, { left: '230px', top: '630px', width: '1460px', height: '320px', borderRadius: '30px', background: '#FFFFF6', padding: '46px 54px' });
  const ckc = div('', card, { position: 'absolute', left: '54px', top: '46px', width: '64px', height: '64px', borderRadius: '50%', background: '#193C34' });
  svg(ckc, 64, 64, '0 0 24 24', CHECK('#D2E5CE', 2.6), { left: 0, top: 0 });
  div('abs', card, { left: '142px', top: '50px', font: "600 42px 'Figtree'" }, 'New record');
  const slotRow = div('abs', card, { left: '54px', top: '150px', display: 'flex', gap: '20px' });
  const chipDefs = [['Medication given', '#034F46', '#fff', 3], ['Dad', '#193C34', '#fff', 1], ['Morning dose', '#E9A23B', '#1A1A1A', 2], ['8:00 AM', '#E4E4D0', '#1A1A1A', 4]];
  const slots = chipDefs.map(([s, bg, col]) => div('chip', slotRow, { background: bg, color: col, fontSize: '34px', padding: '16px 30px', visibility: 'hidden' }, s));
  const flyers = chipDefs.map(([s, bg, col]) => div('chip', c, { position: 'absolute', left: 0, top: 0, background: bg, color: col, fontSize: '34px', padding: '16px 30px', zIndex: 20, boxShadow: '0 14px 30px rgba(0,0,0,.18)' }, s));
  const by = div('abs', card, { left: '54px', top: '246px', font: "400 26px 'Figtree'", color: '#6B6B60' }, 'Recorded by Jo · just now · from Quick log');
  const t0 = S('q2') + .02, t1 = EN('q2') - .1;
  const charAt = i => t0 + (t1 - t0) * (i / typed.length);
  [...typed].forEach((_, i) => cue(charAt(i), 'key', .35));
  const flyAt = i => S('q3') + .5 + i * .13;
  chipDefs.forEach((_, i) => cue(flyAt(i) + .55, 'tick2', .5));
  cue(50.75, 'reveal', .9);
  let M = null;
  s9.draw = t => {
    if (!M) {
      const cr = chars.map(ch => rectIn(ch, line));
      tokens.forEach(([a, b], i) => Object.assign(hl[i].style, { left: cr[a].x - 6 + 'px', width: cr[b - 1].x + cr[b - 1].w - cr[a].x + 12 + 'px' }));
      M = { cr, tok: tokens.map(([a, b]) => { const r1 = rectIn(chars[a]), r2 = rectIn(chars[b - 1]); return { x: (r1.x + r2.x + r2.w) / 2, y: r1.cy }; }), slots: slots.map(s => rectIn(s)) };
    }
    circleIn(s9, t, 50.75, .9, 1920, 1080, 2300);
    drift(g1, t, 8); drift(g2, t, 9);
    cam(s9, t, 50.75, 58.6, 1, 1.04, pushBack(s9, t, 57.6));
    rise(h1.ws, t, sync('q1', 8), S('q3') - .3);
    rise(h2.ws, t, sync('q3', 6));
    A(input, t, { in: 51.3, d: 1, from: { y: 90, o: 0, s: .96 } });
    let n = 0;
    chars.forEach((ch, i) => { const a = charAt(i); if (t >= a) n = i + 1; A(ch, t, { in: a, d: .25, e: E.outCubic, from: { o: 0, y: 10 } }); });
    ph.style.opacity = t < t0 ? 1 : 0;
    const cx = n === 0 ? 0 : M.cr[n - 1].x + M.cr[n - 1].w;
    caret.style.left = 156 + cx + 4 + 'px';
    const typing = t >= t0 - .1 && t <= t1 + .2;
    caret.style.opacity = t < 51.6 || t > S('q3') + .3 ? 0 : (typing || (t % 1) < .55 ? 1 : 0);
    hl.forEach((h, i) => A(h, t, { in: S('q3') + i * .08, d: .45, e: E.outCubic, from: { sx: 0 } }));
    A(card, t, { in: S('q3') + .3, d: 1, from: { y: 80, o: 0 } });
    A(ckc, t, { in: S('q3') + .5, d: .7, e: E.outBack, from: { s: 0 } });
    A(by, t, { in: flyAt(3) + .5, d: .7, from: { o: 0, y: 14 } });
    flyers.forEach((f, i) => {
      const src = M.tok[chipDefs[i][3]], dst = M.slots[i];
      const p = P(t, flyAt(i), .85, E.outExpo);
      const fw = dst.w, fh = dst.h;
      const x = L(src.x, dst.cx, p) - fw / 2, y = L(src.y, dst.cy, p) - fh / 2 - Math.sin(Math.PI * p) * 140;
      apply(f, Object.assign({}, DEF, { x, y, s: L(.5, 1, p), o: t < flyAt(i) ? 0 : 1, r: Math.sin(Math.PI * p) * (i % 2 ? 8 : -8) }));
    });
  };
}

/* =====================================================================
 * 10. HANDOFF & OPEN ITEMS
 * ===================================================================== */
const s10 = scene('#193C34', 57.55, 76.1);
{
  const c = s10.cam;
  const g1 = glow(c, 960, 700, 1100, '#24574A', .55);
  const hk1 = txt(c, 'When it’s your turn to step away, / *CareLog builds the handoff.*', 'serif center', { top: '78px', fontSize: '84px', color: '#FFFFEB' });
  const hk2 = txt(c, 'What was recorded. What wasn’t. / *And everything still open.*', 'serif center', { top: '78px', fontSize: '84px', color: '#FFFFEB' });
  const hk3 = txt(c, 'The next person reads it, / *and acknowledges it.*', 'serif center', { top: '78px', fontSize: '84px', color: '#FFFFEB' });
  const hp1 = txt(c, 'But reviewing / *never closes a task.*', 'serif center', { top: '78px', fontSize: '96px', color: '#FFFFEB' });
  const hp2 = txt(c, 'Thursday’s transport stays on the list, / *until someone actually books it.*', 'serif center', { top: '78px', fontSize: '80px', color: '#FFFFEB' });
  [hk1, hk2, hk3, hp1, hp2].forEach(h => h.ws.forEach(w => { if (w.classList.contains('it')) w.style.color = '#D2E5CE'; }));
  const tile = (x, bg, col, name, role) => {
    const e = div('', c, { position: 'absolute', left: x + 'px', top: '500px', width: '270px', height: '270px', borderRadius: '40px', background: bg, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', boxShadow: '0 30px 60px rgba(0,0,0,.3)' });
    div('', e, { font: "400 84px 'EB Garamond'", color: col }, name);
    div('label', e, { color: col, opacity: .75, fontSize: '18px', marginTop: '8px' }, role);
    return e;
  };
  const samT = tile(150, '#0E6B5C', '#FFFFEB', 'Sam', 'Outgoing'), alexT = tile(1500, '#F5A33B', '#1A1A1A', 'Alex', 'Incoming');
  const arrow = svg(c, 1920, 1080, '0 0 1920 1080', '<path d="M420 635 C 700 420, 1220 420, 1500 635" fill="none" stroke="#D2E5CE" stroke-width="4" stroke-dasharray="1" pathLength="1" stroke-linecap="round"/>', { left: 0, top: 0 });
  const arrowP = arrow.querySelector('path');
  const doc = div('card', c, { left: '520px', top: '300px', width: '880px', height: '740px', background: '#FFFFEB', padding: '40px 46px' });
  const dh = div('', doc, { display: 'flex', justifyContent: 'space-between', alignItems: 'center' });
  const dhl = div('', dh);
  div('label', dhl, { color: '#034F46', fontSize: '19px' }, 'Handoff');
  div('', dhl, { font: "600 36px 'Figtree'", marginTop: '6px' }, 'Sam → Alex · Tue 6:00 PM');
  const ack = div('chip', doc, { position: 'absolute', right: '40px', top: '-22px', background: '#193C34', color: '#FFFFEB', fontSize: '21px', padding: '12px 20px' }, '<svg width="22" height="22" viewBox="0 0 24 24">' + CHECK('#D2E5CE', 3) + '</svg>Acknowledged by Alex · 6:32 PM');
  const section = (col, name, count, lines) => {
    const s = div('', doc, { marginTop: '22px', padding: '20px 26px', borderRadius: '18px', background: '#F6F6E6', borderLeft: `8px solid ${col}` });
    const top = div('', s, { display: 'flex', justifyContent: 'space-between', alignItems: 'center' });
    div('', top, { font: "600 30px 'Figtree'" }, name);
    const num = div('tab', top, { font: "600 42px 'Figtree'", color: col }, '0');
    const ls = lines.map(l => div('', s, { font: "400 25px 'Figtree'", color: '#4A4A42', marginTop: '6px', position: 'relative' }, l));
    return { s, num, count, ls };
  };
  const sec1 = section('#2FBF86', 'Recorded', 6, ['Morning medication · Alex · 8:02 AM', 'Lunch at 12:45 · Sam · 12:47 PM']);
  const sec2 = section('#E9A23B', 'No record', 1, ['Evening walk · scheduled 4:00 PM · nothing recorded']);
  const sec3 = section('#EF5B3A', 'Open items', 2, ['Book Thursday transport', 'Refill blister packs']);
  const ackBtn = div('pill', doc, { position: 'absolute', right: '46px', bottom: '36px', background: '#D2E5CE', color: '#193C34', border: '1.5px solid #9FC29A', fontSize: '27px', padding: '16px 28px' }, 'Acknowledge handoff');
  const transportRow = sec3.ls[0];
  // The open item that lifts out and stays.
  const lift = div('card', c, { left: '510px', top: '480px', width: '900px', height: '170px', background: '#FFFFEB', padding: '34px 40px', borderRadius: '26px', zIndex: 10 });
  const ldot = div('abs', lift, { left: '40px', top: '46px', width: '24px', height: '24px', borderRadius: '50%', background: '#EF5B3A' });
  const lTitle = div('abs', lift, { left: '84px', top: '30px', font: "600 40px 'Figtree'" }, 'Book Thursday transport');
  const lSub = div('abs', lift, { left: '84px', top: '88px', font: "400 25px 'Figtree'", color: '#7A7A6E' }, 'Open item · stays on every handoff');
  const lDone = div('abs', lift, { left: '84px', top: '88px', font: "500 25px 'Figtree'", color: '#034F46' }, 'Booked by Jo · taxi at 9:15 AM Thursday');
  const lCk = div('abs', lift, { left: '30px', top: '36px', width: '44px', height: '44px', borderRadius: '50%', background: '#2FBF86' });
  svg(lCk, 44, 44, '0 0 24 24', CHECK('#FFFFFF', 3), { left: 0, top: 0 });
  const badge = div('chip', c, { position: 'absolute', left: '960px', top: '430px', background: '#EF5B3A', color: '#fff', fontSize: '22px', zIndex: 11, transformOrigin: '50% 100%' }, 'Still open');
  const badgeDone = div('chip', c, { position: 'absolute', left: '960px', top: '430px', background: '#2FBF86', color: '#fff', fontSize: '22px', zIndex: 11, transformOrigin: '50% 100%' }, 'Outcome recorded');
  div('pill', lift, { position: 'absolute', right: '30px', top: '50%', marginTop: '-30px', height: '60px', padding: '0 22px', fontSize: '22px', background: '#D2E5CE', color: '#193C34', border: '1.5px solid #9FC29A' }, 'Close with outcome');
  const glowRing = div('abs', lift, { inset: '-10px', borderRadius: '34px', border: '4px solid #EF5B3A' });
  const days = ['Wed 9:00 AM', 'Wed 6:00 PM', 'Thu 9:00 AM'].map(d => {
    const g = div('card', c, { left: '700px', top: '360px', width: '520px', height: '440px', background: 'rgba(255,255,235,.07)', border: '2px solid rgba(210,229,206,.25)', boxShadow: 'none', padding: '34px 38px', zIndex: 2 });
    div('label', g, { color: '#D2E5CE', fontSize: '17px' }, 'Handoff');
    div('', g, { font: "600 34px 'Figtree'", color: '#FFFFEB', marginTop: '8px' }, d);
    div('', g, { font: "500 22px 'Figtree'", color: '#D2E5CE', marginTop: '24px' }, '✓ Acknowledged');
    for (let i = 0; i < 4; i++) div('', g, { height: '14px', width: [380, 300, 340, 220][i] + 'px', background: 'rgba(210,229,206,.18)', borderRadius: '7px', marginTop: '22px' });
    return g;
  });
  const jo = cursor(c, 'Jo', '#D0705E'), alexC = cursor(c, 'Alex', '#D98A1E');
  const ackClick = wt('k3', 6) - .05;
  const bookClick = wt('p2', 9) - .1;
  cue(57.6, 'whoosh', .9); cue(58.45, 'swoosh', .5); cue(58.65, 'swoosh', .5); cue(59.6, 'swoosh', .6);
  [wt('k2', 0), wt('k2', 3), wt('k2', 5)].forEach(x => cue(x, 'tick2', .6));
  cue(ackClick, 'click', 1); cue(ackClick + .1, 'stamp', .55);
  cue(S('p1') + .2, 'riser', .5); cue(S('p1') + .55, 'swoosh', .7);
  [70.8, 71.55, 72.3].forEach(x => cue(x + .3, 'swoosh', .45));
  cue(bookClick, 'click', 1); cue(bookClick + .1, 'success', 1);
  let M = null;
  s10.draw = t => {
    if (!M) M = { row: rectIn(transportRow), ack: rectIn(ackBtn) };
    panelUp(s10, t, 57.55);
    drift(g1, t, 10);
    cam(s10, t, 57.55, 76.1, 1, 1.04);
    rise(hk1.ws, t, sync('k1', 11), 61.45);
    rise(hk2.ws, t, sync('k2', 9), 65.25);
    rise(hk3.ws, t, sync('k3', 8), 68.2);
    rise(hp1.ws, t, sync('p1', 6), 70.55);
    rise(hp2.ws, t, sync('p2', 11));
    const away = { out: S('p1') + .35, od: .7, oe: E.inOutCubic, to: { o: 0, s: .9, b: 10 } };
    A(samT, t, Object.assign({ in: 58.4, d: 1, from: { x: -400, o: 0, r: -10 } }, away));
    A(alexT, t, Object.assign({ in: 58.6, d: 1, from: { x: 400, o: 0, r: 10 } }, away));
    if (t > S('k3')) samT.style.filter = (samT.style.filter === 'none' ? '' : samT.style.filter) + ` saturate(${1 - .7 * P(t, S('k3'), .6)}) brightness(${1 - .3 * P(t, S('k3'), .6)})`;
    alexT.style.boxShadow = `0 30px 60px rgba(0,0,0,.3), 0 0 0 ${10 * P(t, S('k3'), .6)}px rgba(245,163,59,.35)`;
    arrowP.style.strokeDashoffset = 1 - P(t, 59.0, .9, E.inOutCubic);
    arrow.style.opacity = 1 - P(t, S('p1') + .35, .5, E.linear);
    A(doc, t, Object.assign({ in: 59.55, d: 1.1, from: { y: 300, o: 0, s: .9 } }, away));
    [[sec1, wt('k2', 0)], [sec2, wt('k2', 3)], [sec3, wt('k2', 5)]].forEach(([s, a]) => {
      A(s.s, t, { in: a - .1, d: .8, from: { x: -50, o: 0 } });
      counter(s.num, t, a, .7, 0, s.count);
    });
    A(ackBtn, t, { in: 60.4, d: .8, from: { o: 0, y: 20 }, base: { s: 1 - .06 * bell(t, ackClick, .2) } });
    A(ack, t, { in: ackClick + .1, d: .6, e: E.outBack, from: { s: 0, o: 0 } });
    moveCursor(alexC, t, [[S('k3') + .1, 1640, 760], [ackClick - .05, M.ack.cx - 10, M.ack.cy], [ackClick + .6, M.ack.cx - 10, M.ack.cy], [ackClick + 1.0, 1700, 1150]], ackClick);
    // Lift the open item.
    const lp = P(t, S('p1') + .3, 1.1, E.outExpo);
    const s0 = 25 / 40;
    const sx0 = M.row.x + 366 * s0 - 960, sy0 = M.row.cy + 33 * s0 - 565;
    transportRow.style.opacity = t > S('p1') + .3 ? 0 : 1;
    apply(lift, Object.assign({}, DEF, { x: L(sx0, 0, lp), y: L(sy0, 120, lp), s: L(s0, 1.2, lp), o: t < S('p1') + .3 ? 0 : P(t, S('p1') + .3, .25, E.linear) }));
    const bk = t > bookClick + .05;
    ldot.style.opacity = lSub.style.opacity = bk ? 0 : 1;
    lCk.style.opacity = lDone.style.opacity = bk ? 1 : 0;
    apply(lCk, Object.assign({}, DEF, { s: bk ? E.outBack(clamp((t - bookClick) / .5)) : 0, o: bk ? 1 : 0 }));
    lift.style.background = bk ? '#EAF6EF' : '#FFFFEB';
    const pulse = .5 + .5 * Math.sin((t - 68) * 5);
    glowRing.style.opacity = bk ? 0 : P(t, S('p1') + .9, .4) * (.5 + .5 * pulse);
    glowRing.style.transform = `scale(${1 + .015 * pulse})`;
    A(badge, t, { base: { x: -70, y: 118 }, in: S('p1') + 1.0, d: .6, e: E.outBack, from: { s: 0 }, out: bookClick, od: .2, to: { s: 0, o: 0 } });
    A(badgeDone, t, { base: { x: -105, y: 118 }, in: bookClick + .1, d: .6, e: E.outBack, from: { s: 0, o: 0 } });
    days.forEach((g, i) => {
      const a = 70.75 + i * .75;
      const p = clamp((t - a) / 1.9);
      const x = L(1500, -1500, E.inOutSine(p));
      apply(g, Object.assign({}, DEF, { x, y: 50, s: .95, o: p <= 0 || p >= 1 ? 0 : 1 }));
    });
    const bx = 960 + 300, by = 600 + 120 + 40;
    moveCursor(jo, t, [[bookClick - .8, 1500, 1150], [bookClick - .05, 1322, 690], [bookClick + .8, 1322, 690], [bookClick + 1.2, 1600, 1150]], bookClick);
  };
}

/* =====================================================================
 * 11. THE CIRCLE: you decide who's in. Remove someone, access ends.
 * ===================================================================== */
const s11 = scene('#FFFFEB', 75.2, 81.6);
{
  const c = s11.cam;
  const g1 = glow(c, 960, 620, 1000, '#E1E6CD', .9);
  const h1 = txt(c, 'You decide *who’s in the circle.*', 'serif center', { top: '70px', fontSize: '92px' });
  const h2 = txt(c, 'Remove someone, and their *access ends.*', 'serif center', { top: '70px', fontSize: '92px' });
  const inst = txt(c, '*Instantly.*', 'serif center free', { top: '420px', fontSize: '260px', color: '#EF5B3A' });
  const cx = 960, cy = 620, R = 310;
  const ringS = svg(c, 1920, 1080, '0 0 1920 1080', `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#1A1A1A" stroke-opacity=".18" stroke-width="2" stroke-dasharray="6 10"/>`, { left: 0, top: 0 });
  const spokes = svg(c, 1920, 1080, '0 0 1920 1080', Array.from({ length: 6 }, () => `<line stroke="#1A1A1A" stroke-opacity=".25" stroke-width="3"/>`).join(''), { left: 0, top: 0 });
  const sp = [...spokes.querySelectorAll('line')];
  const dadN = div('node', c, { left: cx - 110 + 'px', top: cy - 110 + 'px', width: '220px', height: '220px', background: '#193C34', font: "400 70px 'EB Garamond'", zIndex: 3 }, 'Dad');
  const members = [['Jo', 'Owner', '#D0705E'], ['Sam', 'Family caregiver', '#0E6B5C'], ['Alex', 'Family caregiver', '#D98A1E'], ['Priya', 'Paid carer', '#5E8C61'], ['Dr Osei', 'Clinician · read-only', '#4F7CAC'], ['Tom', 'Neighbour', '#A0785A']].map(([n, role, col], i) => {
    const g = div('abs', c, { left: 0, top: 0, width: '0px', height: '0px', zIndex: 4 });
    const node = div('node', g, { left: '-62px', top: '-62px', width: '124px', height: '124px', background: col, fontSize: '46px', boxShadow: '0 12px 24px rgba(0,0,0,.15)' }, n[0]);
    const lab = div('abs', g, { left: '-150px', width: '300px', top: '72px', textAlign: 'center' });
    div('', lab, { font: "600 27px 'Figtree'" }, n);
    div('', lab, { font: "400 20px 'Figtree'", color: '#7A7A6E' }, role);
    return { g, node, lab, base: -90 + i * 60 };
  });
  const tom = members[5];
  const pop = div('card', c, { left: 0, top: 0, width: '330px', padding: '22px 26px', borderRadius: '20px', zIndex: 8, background: '#FFFFFF' });
  div('', pop, { font: "600 25px 'Figtree'" }, 'Tom · Neighbour');
  const rm = div('', pop, { font: "600 25px 'Figtree'", color: '#EF5B3A', marginTop: '14px', padding: '12px 16px', borderRadius: '12px', background: '#FBE5DA' }, 'Remove from circle');
  const lockB = div('chip', c, { position: 'absolute', left: 0, top: 0, background: '#1A1A1A', color: '#FFFFEB', fontSize: '22px', zIndex: 9 }, '🔒 Access ended');
  const curs = cursor(c, 'Jo', '#D0705E');
  const flash = document.getElementById('flash');
  const click = wt('m2', 3) - .05, instAt = wt('m2', 6) - .05;
  cue(75.2, 'reveal', .9);
  members.forEach((_, i) => cue(75.7 + i * .17, 'pop', .45));
  cue(click, 'click', 1); cue(click + .1, 'snap', .9); cue(instAt, 'impact', 1);
  const angle = (m, t) => (m.base + 22 * (1 - Math.exp(-Math.max(0, t - 75.2) / 1.6))) * Math.PI / 180;
  s11.draw = t => {
    circleIn(s11, t, 75.15, .85, 960, 720, 2200);
    drift(g1, t, 11);
    const shake = t > instAt ? Math.exp(-(t - instAt) * 6) : 0;
    cam(s11, t, 75.2, 81.6, 1, 1.05, 1, Math.sin(t * 90) * 16 * shake, Math.cos(t * 77) * 12 * shake);
    rise(h1.ws, t, sync('m1', 6), 77.35);
    rise(h2.ws, t, sync('m2', 6), 80.9);
    AW(inst.ws, t, { in: instAt, from: { s: 2.2, o: 0, b: 20 }, d: .5, e: E.outQuart });
    flash.style.opacity = Math.max(+flash.style.opacity || 0, .5 * (1 - P(t, instAt, .35, E.outCubic)) * (t >= instAt && t < instAt + .4 ? 1 : 0));
    A(dadN, t, { in: 75.45, d: .8, e: E.outBack, from: { s: 0 }, out: instAt - .05, od: .3, to: { o: .25 } });
    ringS.style.opacity = P(t, 75.5, .6) * (t > instAt ? .3 : 1);
    ringS.style.transform = `rotate(${(t - 75) * 6}deg)`; ringS.style.transformOrigin = `${cx}px ${cy}px`;
    members.forEach((m, i) => {
      const a = angle(m, t);
      let x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      let o = 1, sc = E.outBack(clamp((t - (75.7 + i * .17)) / .6));
      if (m === tom) {
        const fly = P(t, click + .35, .9, E.inCubic);
        x += Math.cos(a) * 420 * fly; y += Math.sin(a) * 420 * fly;
        o = 1 - fly;
        m.node.style.filter = t > click + .1 ? 'grayscale(1)' : 'none';
        m.node.style.boxShadow = `0 12px 24px rgba(0,0,0,.15), 0 0 0 ${10 * P(t, S('m2'), .4) * (t < click ? 1 : 0)}px rgba(239,91,58,.4)`;
      }
      if (t > instAt) o *= .25;
      apply(m.g, Object.assign({}, DEF, { x, y, o: t < 75.7 + i * .17 ? 0 : o }));
      apply(m.node, Object.assign({}, DEF, { s: sc }));
      const l = sp[i];
      const grow = P(t, 75.9 + i * .17, .5, E.outCubic);
      l.setAttribute('x1', cx); l.setAttribute('y1', cy);
      l.setAttribute('x2', L(cx, x, grow)); l.setAttribute('y2', L(cy, y, grow));
      l.style.opacity = m === tom && t > click + .08 ? 0 : (t > instAt ? .3 : 1);
      if (m === tom) {
        apply(pop, Object.assign({}, DEF, { x: x - 430, y: y - 70, s: E.outBack(clamp((t - (S('m2') + .3)) / .45)), o: t > S('m2') + .3 && t < click + .25 ? 1 : 0 }));
        apply(lockB, Object.assign({}, DEF, { x: cx + Math.cos(a) * R - 100, y: cy + Math.sin(a) * R - 20, s: E.outBack(clamp((t - (click + .3)) / .5)), o: t > click + .3 && t < instAt ? 1 : (t >= instAt ? .3 : 0) }));
      }
    });
    const ta = angle(tom, S('m2') + .3);
    const px = cx + Math.cos(ta) * R - 430 + 140, py = cy + Math.sin(ta) * R - 70 + 100;
    moveCursor(curs, t, [[S('m2') + .2, 700, 1150], [click - .05, px, py], [click + .5, px, py], [click + .9, 500, 1150]], click);
  };
}

/* =====================================================================
 * 12. MONTAGE: emergency packets, money, appointments, supplies, load.
 * ===================================================================== */
const s12 = scene('transparent', 80.95, 88.6);
{
  const c = s12.cam;
  const panels = [];
  const panel = (bg, at) => { const p = div('abs', c, { inset: 0, background: bg, overflow: 'hidden' }); panels.push({ p, at }); return p; };
  const tA = 80.95, tB = S('z2') - .14, tC = wt('z3', 0) - .14, tD = wt('z3', 1) - .12, tE = wt('z3', 2) - .12;
  [tA, tB, tC, tD, tE].forEach(x => cue(x, 'whoosh', .85));
  // a. emergency
  const pa = panel('#EF5B3A', tA);
  const ha = txt(pa, 'Emergency / *packets.*', 'serif', { left: '140px', top: '300px', fontSize: '150px', color: '#FFFFEB' });
  const sa = txt(pa, 'Read-only. Expiring. Revocable.', 'sans', { left: '146px', top: '660px', fontSize: '36px', fontWeight: 500, color: '#FFE3D8' });
  const ca = div('card', pa, { left: '1000px', top: '180px', width: '760px', height: '720px', padding: '46px 50px', background: '#FFFFEB' });
  div('label', ca, { color: '#EF5B3A', fontSize: '19px' }, 'Emergency packet · Dad');
  [['Medicines', 'Morning tablets · Evening tablets'], ['Allergies', 'Penicillin'], ['Contacts', 'Jo · Sam · Alex'], ['Recent', 'Lunch at 12:45 · Sam']].forEach(([k, v]) => {
    const r = div('', ca, { padding: '22px 0', borderBottom: '1px solid #EEEEDC' });
    div('', r, { font: "500 20px 'Figtree'", color: '#8A8A7E' }, k);
    div('', r, { font: "600 32px 'Figtree'", marginTop: '4px' }, v);
  });
  const link = div('', ca, { marginTop: '30px', display: 'flex', gap: '14px', alignItems: 'center' });
  div('chip', link, { background: '#F2E9DA', color: '#1A1A1A', fontSize: '20px' }, '🔗 …/emergency/k7f2m9q4');
  div('chip', link, { background: '#FBE5DA', color: '#C2442A', fontSize: '20px' }, 'Expires in 24 h');
  div('chip', link, { background: '#1A1A1A', color: '#FFFFEB', fontSize: '20px' }, 'Revoke');
  // b. money
  const pb = panel('#F5A33B', tB);
  const hb = txt(pb, 'Shared costs, / *split to the cent.*', 'serif', { left: '140px', top: '320px', fontSize: '120px' });
  const tot = div('abs tab', pb, { left: '1060px', top: '230px', width: '700px', textAlign: 'center', font: "600 150px 'Figtree'" }, '$47.00');
  div('abs', pb, { left: '1060px', top: '200px', width: '700px', textAlign: 'center', font: "500 26px 'Figtree'", color: '#5A3A0A' }, 'Taxi to the hospital');
  const split = svg(pb, 1920, 1080, '0 0 1920 1080', [1180, 1410, 1640].map(x => `<path d="M1410 440 C1410 520, ${x} 520, ${x} 590" fill="none" stroke="#1A1A1A" stroke-opacity=".5" stroke-width="3" pathLength="1" stroke-dasharray="1"/>`).join(''), { left: 0, top: 0 });
  const splitP = [...split.querySelectorAll('path')];
  const shares = [['Sam', 1567, '#0E6B5C'], ['Alex', 1567, '#D98A1E'], ['Jo', 1566, '#D0705E']].map(([n, v, col], i) => {
    const b = div('card', pb, { left: 1180 + i * 230 - 105 + 'px', top: '600px', width: '210px', height: '170px', background: '#FFFFEB', borderRadius: '24px', textAlign: 'center', paddingTop: '26px' });
    div('chip', b, { background: col, color: '#fff', fontSize: '20px' }, n);
    const num = div('tab', b, { font: "600 46px 'Figtree'", marginTop: '14px' }, '$0.00');
    return { b, num, v };
  });
  const sum = div('abs', pb, { left: '1060px', top: '820px', width: '700px', textAlign: 'center', font: "500 32px 'Figtree'" }, 'Balances always sum to <b>$0.00</b>');
  // c. appointments
  const pc = panel('#034F46', tC);
  const hc = txt(pc, '*Appointments.*', 'serif', { left: '140px', top: '420px', fontSize: '150px', color: '#FFFFEB' });
  const cc = div('card', pc, { left: '1020px', top: '260px', width: '740px', height: '520px', background: '#FFFFEB', overflow: 'hidden' });
  const band = div('', cc, { background: '#EF5B3A', color: '#fff', font: "700 30px 'Figtree'", letterSpacing: '.2em', padding: '22px 44px' }, 'THURSDAY');
  div('', cc, { font: "400 150px 'EB Garamond'", padding: '10px 44px 0', lineHeight: 1 }, '16');
  div('', cc, { font: "600 38px 'Figtree'", padding: '10px 44px 0' }, '10:30 · Hospital check-up');
  const tk = div('', cc, { display: 'flex', gap: '12px', padding: '20px 44px', alignItems: 'center' });
  div('chip', tk, { background: '#D0705E', color: '#fff' }, 'Jo is taking Dad');
  div('chip', tk, { background: '#E4E4D0', color: '#1A1A1A' }, 'Add to calendar (.ics)');
  // d. supplies
  const pd = panel('#D2E5CE', tD);
  const hd = txt(pd, '*Supplies.*', 'serif', { left: '140px', top: '420px', fontSize: '150px', color: '#193C34' });
  const cd = div('card', pd, { left: '1020px', top: '320px', width: '740px', height: '400px', background: '#FFFFF6', padding: '50px' });
  div('', cd, { font: "600 42px 'Figtree'" }, 'Blister packs');
  const bar = div('', cd, { marginTop: '34px', height: '34px', borderRadius: '17px', background: '#ECECDD', overflow: 'hidden' });
  const fill = div('', bar, { height: '100%', borderRadius: '17px', background: '#2FBF86' });
  const stockT = div('tab', cd, { font: "500 28px 'Figtree'", color: '#6B6B60', marginTop: '18px' }, '');
  const refill = div('chip', cd, { background: '#EF5B3A', color: '#fff', fontSize: '24px', marginTop: '28px' }, 'Low stock · refill item opened');
  // e. care load
  const pe = panel('#E1E6CD', tE);
  const he = txt(pe, 'Who’s carrying / *the load.*', 'serif', { left: '140px', top: '340px', fontSize: '140px' });
  const ce = div('card', pe, { left: '1000px', top: '250px', width: '780px', height: '580px', background: '#FFFFF6', padding: '46px 50px' });
  div('label', ce, { color: '#6B6B60', fontSize: '19px' }, 'Care hours · this week');
  const loads = [['Sam', 31, '#0E6B5C'], ['Alex', 9, '#D98A1E'], ['Jo', 6, '#D0705E']].map(([n, h, col]) => {
    const r = div('', ce, { marginTop: '30px' });
    const top = div('', r, { display: 'flex', justifyContent: 'space-between', font: "600 28px 'Figtree'" });
    el('span', '', top, null, n); const hv = el('span', 'tab', top, null, '0 h');
    const b = div('', r, { marginTop: '10px', height: '30px', borderRadius: '15px', background: '#EEEEDF' });
    const f = div('', b, { height: '100%', borderRadius: '15px', background: col, width: '0%' });
    return { f, hv, h };
  });
  const nudge = div('chip', ce, { background: '#FBEBD0', color: '#7A4A0A', fontSize: '22px', marginTop: '36px', whiteSpace: 'normal' }, 'Sam has carried most of the care this week');
  s12.draw = t => {
    panels.forEach(({ p, at }, i) => {
      const pr = P(t, at, .5, E.outExpo);
      p.style.display = t >= at - .01 ? 'block' : 'none';
      p.style.clipPath = pr >= 1 ? 'none' : `inset(0 0 0 ${(1 - pr) * 100}%)`;
      const next = panels[i + 1];
      const lp = next ? P(t, next.at, .5, E.outExpo) : 0;
      p.style.transform = `translateX(${-260 * lp}px) scale(${1 + .03 * clamp((t - at) / 2)})`;
    });
    rise(ha.ws, t, tA + .15, null, { st: .12 });
    blurIn(sa.ws, t, tA + .5, null, { st: .09 });
    A(ca, t, { base: { r: 2 }, in: tA + .1, d: 1, from: { y: 600, r: 12 } });
    rise(hb.ws, t, tB + .1, null, { st: .08 });
    A(tot, t, { in: tB + .15, d: .7, e: E.outBack, from: { s: .5, o: 0 } });
    splitP.forEach((p, i) => (p.style.strokeDashoffset = 1 - P(t, tB + .45 + i * .05, .45, E.outCubic)));
    shares.forEach((s, i) => { A(s.b, t, { in: tB + .6 + i * .08, d: .6, e: E.outBack, from: { s: .4, o: 0, y: 40 } }); counter(s.num, t, tB + .65 + i * .08, .7, 0, s.v, v => '$' + (Math.round(v) / 100).toFixed(2)); });
    A(sum, t, { in: tB + 1.2, d: .6, from: { o: 0, y: 20 } });
    rise(hc.ws, t, tC + .08);
    A(cc, t, { in: tC + .08, d: .8, e: E.outBack, from: { s: .6, o: 0, r: -6 } });
    rise(hd.ws, t, tD + .08);
    A(cd, t, { in: tD + .05, d: .7, from: { y: 300, o: 0 } });
    const st = L(72, 14, P(t, tD + .2, .6, E.inOutCubic));
    fill.style.width = st + '%';
    fill.style.background = st < 25 ? '#E9A23B' : '#2FBF86';
    stockT.textContent = `${Math.round(st / 2)} left · low at 10`;
    A(refill, t, { in: tD + .6, d: .5, e: E.outBack, from: { s: 0 } });
    rise(he.ws, t, sync('z3', 6).slice(2).map((x, i) => x + (i > 1 ? .05 : 0)));
    A(ce, t, { in: tE + .05, d: .8, from: { x: 400, o: 0 } });
    loads.forEach((l, i) => { const p = P(t, tE + .25 + i * .08, .9, E.outExpo); l.f.style.width = (l.h / 34) * 100 * p + '%'; l.hv.textContent = Math.round(l.h * p) + ' h'; });
    A(nudge, t, { in: tE + .9, d: .5, e: E.outBack, from: { s: 0 } });
  };
}

/* =====================================================================
 * 13. CLOSE: It remembers what was given, and by whom. Care is shared.
 * ===================================================================== */
const s13 = scene('#0F1915', 87.95, DURATION + 1);
{
  const c = s13.cam;
  const g1 = glow(c, 960, 540, 1000, '#16473C', .55);
  const dust = Array.from({ length: 70 }, () => ({ e: div('abs', c, { width: '4px', height: '4px', borderRadius: '50%', background: '#D2E5CE' }), x: rr(0, 1920), y: rr(0, 1080), v: rr(10, 40), s: rr(.5, 1.6), ph: rr(0, 6) }));
  const e1 = txt(c, 'It won’t tell you / *what to give.*', 'serif center', { top: '330px', fontSize: '130px', color: '#FFFFEB' });
  const e2 = txt(c, 'It remembers what was given, / *and by whom.*', 'serif center free', { top: '330px', fontSize: '120px', color: '#FFFFEB' });
  [e1, e2].forEach(h => h.ws.forEach(w => { if (w.classList.contains('it')) w.style.color = '#D2E5CE'; }));
  const bloom = div('abs', c, { inset: 0, background: '#FFFFEB' });
  const bg2 = div('abs', bloom, { inset: 0 });
  const g2 = glow(bloom, 400, 200, 900, '#E1E6CD', .8), g3 = glow(bloom, 1600, 900, 900, '#DCE9E2', .8);
  const fin = div('abs', c, { inset: 0 });
  const e3 = txt(fin, 'Care is shared.', 'serif center', { top: '300px', fontSize: '160px' });
  const e4 = txt(fin, '*The details should be, too.*', 'serif center', { top: '480px', fontSize: '160px', color: '#034F46' });
  const lock = div('abs', fin, { left: 0, right: 0, top: '470px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '30px' });
  const markBox = div('', lock, { width: '150px', height: '150px', position: 'relative' });
  const mark = svg(markBox, 150, 150, '0 0 48 48', `<g stroke="#193C34" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none">${LOGO_PATHS}</g>`, { left: 0, top: 0 });
  const paths = [...mark.querySelectorAll('path')];
  paths.forEach(p => (p.style.strokeDasharray = 1));
  const word = txt(lock, 'CareLog', '', { position: 'relative', font: "600 130px 'DM Sans'", color: '#193C34', letterSpacing: '-.02em' }, { chars: true });
  const cta = div('pill', fin, { position: 'absolute', left: '960px', top: '700px', background: '#D2E5CE', color: '#193C34', border: '2px solid #9FC29A', fontSize: '36px', padding: '24px 44px', borderRadius: '18px', transform: 'translateX(-50%)' }, 'Create a care circle →');
  const url = div('abs', fin, { left: 0, right: 0, top: '850px', textAlign: 'center', font: "500 32px 'Figtree'", color: '#5A6A60', letterSpacing: '.02em' }, 'carelog-sigma.vercel.app');
  const fade = document.getElementById('fade');
  const bloomAt = 92.55;
  cue(87.95, 'whoosh', .6); cue(bloomAt, 'reveal', 1); cue(S('e5') - .05, 'chime', 1); cue(S('e5') + .1, 'boom', .8);
  let ctaW = 0;
  s13.draw = t => {
    s13.el.style.opacity = P(t, 87.95, .5, E.linear);
    drift(g1, t, 12); drift(g2, t, 13); drift(g3, t, 14);
    cam(s13, t, 87.95, DURATION, 1, 1.05);
    dust.forEach(d => { const y = ((d.y - t * d.v) % 1080 + 1080) % 1080; apply(d.e, Object.assign({}, DEF, { x: d.x + Math.sin(t * .5 + d.ph) * 30, y, s: d.s, o: .25 + .35 * Math.sin(t + d.ph) ** 2 })); });
    rise(e1.ws, t, sync('e1', 7), 89.8);
    blurIn(e2.ws, t, sync('e2', 8), 92.35);
    const bp = P(t, bloomAt, 1.0, E.inOutCubic);
    bloom.style.clipPath = bp >= 1 ? 'none' : `circle(${bp * 1200}px at 960px 540px)`;
    bloom.style.display = fin.style.display = t >= bloomAt ? 'block' : 'none';
    const up = { out: S('e5') - .45, od: 1.0, oe: E.inOutCubic };
    rise(e3.ws, t, sync('e3', 3));
    rise(e4.ws, t, sync('e4', 5));
    const lift = P(t, S('e5') - .45, 1.0, E.inOutCubic);
    e3.box.style.transform = `translateY(${-215 * lift}px) scale(${L(1, .6, lift)})`;
    e4.box.style.transform = `translateY(${-288 * lift}px) scale(${L(1, .6, lift)})`;
    paths.forEach((p, i) => (p.style.strokeDashoffset = 1 - P(t, S('e5') - .1 + i * .18, 1.0, E.inOutCubic)));
    AW(word.cs, t, { in: S('e5') + .05, st: .045, from: { yp: 105, o: 0 }, d: .9 });
    A(markBox, t, { in: S('e5') - .1, d: .9, e: E.outBack, from: { s: .6, o: 0 } });
    const cp = E.outBack(clamp((t - (S('e5') + .8)) / .6));
    cta.style.transform = `translateX(-50%) scale(${cp})`;
    cta.style.opacity = t > S('e5') + .8 ? 1 : 0;
    A(url, t, { in: S('e5') + 1.2, d: .8, from: { o: 0, y: 16 } });
    fade.style.opacity = P(t, DURATION - .9, .9, E.inCubic);
  };
}

/* ---------- render ---------- */
function render(t) {
  flash.style.opacity = 0;
  for (const sc of scenes) if (show(sc.el, t, sc.a, sc.b)) sc.draw(t);
  const f = Math.floor(t * 24);
  grain.style.transform = `translate(${-((f * 37) % 88)}px, ${-((f * 61) % 88)}px)`;
}
window.render = render;
window.DURATION = DURATION;
window.CUES = CUES;

async function boot() {
  await Promise.all(['400 40px "EB Garamond"', 'italic 400 40px "EB Garamond"', '400 40px Figtree', '500 40px Figtree', '600 40px Figtree', '700 40px Figtree', '600 40px "DM Sans"'].map(f => document.fonts.load(f)));
  await document.fonts.ready;
  scenes.forEach(sc => (sc.el.style.display = 'block'));
  // Let draw functions measure layout once with every scene visible.
  for (const sc of scenes) sc.draw(sc.a + .001);
  render(0);
  window.READY = true;
  const q = new URLSearchParams(location.search);
  if (q.has('t')) render(+q.get('t'));
  if (q.has('play')) {
    const audio = document.getElementById('soundtrack');
    const start = +(q.get('play') || 0);
    document.body.onclick = () => {
      audio.currentTime = start; audio.play();
      const loop = () => { render(audio.currentTime); if (!audio.paused) requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    };
  }
}
boot();

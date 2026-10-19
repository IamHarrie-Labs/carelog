// Turns a short free-text message ("gave Dad his 2pm pills") into a structured record.
// Deterministic on purpose: it works with no AI key and can be fully tested.

const GIVE = /\b(gave|given|took|taken|had|has had|fed|changed|applied|administered|did)\b/i;
const KIND_WORDS = [
  ['incident', /\b(fell|fall|fallen|collapsed|bleed|injur|choked|wander|ambulance|emergency)\b/i],
  ['reading', /\b(bp|blood pressure|sugar|glucose|temperature|temp|weight|oxygen|pulse)\b\s*[:=]?\s*[\d./]+/i],
  ['visit', /\b(visited|popped in|dropped in|stopped by|checked in on)\b/i],
];

function timeFromText(text) {
  const m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) || text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const mer = m[3]?.toLowerCase();
  if (mer === 'pm' && h < 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const words = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2);

export function parseQuickLog(text, items) {
  const t = String(text || '').trim();
  if (!t) return { kind: 'observation', text: '', matched: null, confidence: 'none' };

  const time = timeFromText(t);
  const tWords = new Set(words(t));

  if (GIVE.test(t)) {
    let best = null;
    for (const item of items) {
      let score = 0;
      for (const w of words(item.title)) if (tWords.has(w) || [...tWords].some((x) => x.startsWith(w) || w.startsWith(x))) score += 2;
      if (time && item.time_of_day === time) score += 3;
      else if (time && Math.abs(toMin(item.time_of_day) - toMin(time)) <= 60) score += 1;
      if (score > (best?.score ?? 0)) best = { item, score };
    }
    if (best && best.score >= 2) {
      return {
        kind: 'administration', text: t, schedule_item_id: best.item.id,
        matched: best.item.title, reported_time: time, confidence: best.score >= 4 ? 'high' : 'medium',
      };
    }
  }
  for (const [kind, re] of KIND_WORDS) {
    if (re.test(t)) return { kind, text: t, matched: null, reported_time: time, confidence: 'medium' };
  }
  return { kind: 'observation', text: t, matched: null, reported_time: time, confidence: 'low' };
}

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

// Words/phrases that suggest something a doctor might want to hear about.
export const PATTERN_TERMS = ['dizzy', 'dizziness', 'fall', 'fell', 'confused', 'confusion', 'refused', 'nausea', 'vomit', 'pain', 'rash', 'cough', 'fever', 'wandering', 'breathless', 'drowsy', 'agitated'];

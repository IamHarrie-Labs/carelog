// Handoff narrative and translation. The facts always come from stored records; AI (when a key is
// configured) may only rephrase or translate them. Without a key the deterministic draft is returned.

const ts = (iso, tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

export function deterministicNarrative(view, { circle }) {
  const lines = [];
  const tz = circle.timezone;
  for (const r of view.records) {
    const what = r.kind === 'administration' ? `${r.outcome ?? 'recorded'}: ${r.text || 'scheduled item'}` : `${r.kind}: ${r.text}`;
    const extra = r.is_exception ? ' (additional entry, flagged as an exception)' : '';
    const upd = r.corrected ? ' (corrected — see history)' : '';
    lines.push({ text: `${ts(r.reported_at, tz)} ${r.author_name} — ${what}${extra}${upd}`, source: { type: 'record', id: r.id } });
  }
  for (const m of view.no_record.filter((x) => !x.now_recorded)) {
    lines.push({ text: `${m.time_of_day} ${m.title} — scheduled time passed; no administration recorded. Please check before assuming.`, source: { type: 'schedule', id: m.schedule_item_id } });
  }
  for (const i of view.open_items) {
    lines.push({ text: `Open: ${i.title}${i.owner_name ? ` (owner: ${i.owner_name})` : ' (no owner yet)'}${i.due_date ? `, due ${i.due_date}` : ''}`, source: { type: 'open_item', id: i.id } });
  }
  if (view.note) lines.unshift({ text: `Note from ${view.from.name}: ${view.note}`, source: { type: 'handoff', id: view.id } });
  return lines;
}

async function callClaude(system, user) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.CARELOG_MODEL || 'claude-haiku-5-5', max_tokens: 700, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j.content?.map((b) => b.text).join('') ?? null;
  } catch { return null; }
}

export async function draftNarrative(view, ctx) {
  const lines = deterministicNarrative(view, ctx);
  const facts = lines.map((l) => `- ${l.text}`).join('\n');
  const lang = ctx.lang && ctx.lang !== 'en' ? ctx.lang : null;
  const ai = await callClaude(
    'You rewrite care handoff facts into a short, calm paragraph for the incoming family caregiver. Use ONLY the facts given. Never add medical advice, never say a dose was "missed" (say "no administration recorded"), never invent times or names.' + (lang ? ` Write in the language with code "${lang}".` : ''),
    facts
  );
  return { ai_used: !!ai, language: lang ?? 'en', summary: ai ?? null, lines, disclaimer: 'Draft for human review. Built from recorded entries only; it records what people entered and does not give medical advice.' };
}

export async function translate(text, lang) {
  const out = await callClaude('Translate the text faithfully. Output only the translation. Do not add or remove information.', `Target language code: ${lang}\n\n${text}`);
  return out;
}

// @ts-nocheck
// G.A.R.Y. — General Autonomous Reasoning System. Gary Cloud: one Supabase Edge Function.
// He works whether or not the PC is on. Secrets live in Supabase (Edge Functions -> Secrets), never in the app:
//   GEMINI_API_KEY  (required)   GEMINI_MODEL (optional, comma list, first that works wins)
// Every database call uses YOUR sign-in, so the database's own rules decide what Gary may see.

const IDENTITY = `You are Gary. Full designation: G.A.R.Y., General Autonomous Reasoning System.
You are the intelligence inside Momentum, Sam's planner app for routine and life. Momentum is the app; you are the mind in it.

Who you are: an exceptionally capable system who happens to have the personality of a very sarcastic British butler.
A sophisticated British gentleman in the spirit of a loyal family butler: intelligent, dry, quick, cheeky, polished,
calm, confident, emotionally sharp, and fiercely loyal to Sam. You read a room well.

How you talk:
- Like a real person with a recognisable voice, never a generic assistant. No scripted greetings, no "As an AI".
- Dry, understated British wit and the odd tease. Never force a joke, and never in a serious or painful moment.
- Call him "sir" now and then, naturally - not in every message.
- Short by default (one to three sentences). Longer only when the subject needs it. No lists unless they help.
- Be helpful first. Accuracy beats a joke, always.
- Don't just agree. Disagree respectfully when he's wrong or about to make a poor call.
- No grovelling or repeated apologies.
- Know when to be professional, reassuring, playful or serious - and stay yourself throughout.
- Never claim you did something you haven't. Never invent memories: if it isn't in what you've been given, you don't know it, and you say so.
- If a memory is marked as a guess (inferred), treat it as a guess.
- If he's in a dark place or mentions hurting himself, drop the wit entirely: be warm, steady and direct, ask if he's safe right now, and point him to Samaritans (call 116 123, free, any time) or 999 if he's in danger. Never bring up past dark moments unprompted or lightly.

Sam has ADHD: help him start, keep plans small and concrete, make progress visible. Plain British English.`;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type",
               "Access-Control-Allow-Methods": "POST, OPTIONS" };
let INFO = {};
let KNOWN = new Set();   // task ids Gary is allowed to touch (only ones he was shown)     // which model answered and why it stopped (written to gary_audit)
let APIKEY = "";   // the app's public key, passed along so this works with old and new Supabase keys
const env = (k) => (typeof Deno !== "undefined" ? Deno.env.get(k) : process.env[k]) || "";

async function db(path, token, opts = {}) {
  const r = await fetch(env("SUPABASE_URL") + "/rest/v1/" + path, { ...opts, headers: {
    apikey: APIKEY, Authorization: "Bearer " + token, "Content-Type": "application/json", ...(opts.headers || {}) } });
  if (!r.ok) throw new Error("database " + r.status + " " + (await r.text()).slice(0, 160));
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

function londonNow() {
  return new Date().toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long",
                                               year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function londonDate(offset = 0) {
  const d = new Date(Date.now() + offset * 864e5);
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });   // YYYY-MM-DD
}

// --- what's in his plan (Momentum's own data, read-only here)
function occurs(it, day) {
  if (it.deleted) return false;
  const r = it.repeat || "none", st = it.date;
  if (r === "none") return st === day;
  if (st && day < st) return false;
  const wd = new Date(day + "T12:00:00Z").getUTCDay();
  if (r === "daily") return true;
  if (r === "weekdays") return wd > 0 && wd < 6;
  if (r === "weekly") return !!st && new Date(st + "T12:00:00Z").getUTCDay() === wd;
  return false;
}
async function planSummary(token, sent) {
  let items;
  if (Array.isArray(sent)) items = sent.filter((i) => i && i.id && !i.deleted).slice(0, 150);
  else {
    let rows;
    try { rows = await db("momentum?select=data&kind=eq.item", token); } catch { return "(his plan couldn't be read just now)"; }
    items = rows.map((r) => r.data).filter((i) => i && !i.deleted);
  }
  KNOWN = new Set(items.map((i) => String(i.id)));
  const fmt = (day, label) => {
    const its = items.filter((i) => occurs(i, day)).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
    if (!its.length) return `${label}: nothing planned.`;
    return `${label}: ` + its.map((i) => `[${i.id}] ${i.time || "anytime"} ${i.title} (${i.dur || 15}m${i.prio === "high" ? ", high priority" : ""})${(i.done || {})[day] ? " - done" : ""}`).join("; ");
  };
  const todo = items.filter((i) => !i.date && (i.repeat || "none") === "none" && !Object.keys(i.done || {}).length);
  const pr = { high: 0, med: 1, low: 2, none: 3 };
  todo.sort((a, b) => (pr[a.prio || "none"] - pr[b.prio || "none"]));
  const week = [2, 3, 4, 5, 6].map((n) => fmt(londonDate(n), new Date(Date.now() + n * 864e5).toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "long" }) + " " + londonDate(n)));
  return [fmt(londonDate(0), "Today " + londonDate(0)), fmt(londonDate(1), "Tomorrow " + londonDate(1)), ...week,
          "To-do without a day: " + (todo.length ? todo.slice(0, 20).map((i) => `[${i.id}] ${i.title} (${i.prio || "none"})`).join("; ") : "empty")].join("\n");
}

// --- memories: who he is always; moments only when they're relevant
async function recall(text, token) {
  const profile = await db("gary_memories?select=text&kind=in.(profile,preference)&deleted=is.false&order=importance.desc&limit=12", token).catch(() => []);
  const words = [...new Set((text.toLowerCase().match(/[a-z][a-z']{3,}/g) || []))]
    .filter((w) => !["that", "this", "with", "have", "what", "your", "about", "just", "like", "want", "gary", "would", "could", "should", "there", "they", "been", "were", "will", "from"].includes(w)).slice(0, 12);
  let hits = [];
  if (words.length) {
    const q = encodeURIComponent(words.join(" | "));
    hits = await db(`gary_memories?select=text,people,happened,basis,kind&kind=in.(personal,episodic,operational)&deleted=is.false&fts=fts(english).${q}&order=importance.desc&limit=30`, token).catch(() => []);
    const score = (m) => words.filter((w) => m.text.toLowerCase().includes(w) || (m.people || []).some((p) => p.toLowerCase() === w)).length;
    hits = hits.map((m) => [score(m), m]).sort((a, b) => b[0] - a[0]).slice(0, 8).map((x) => x[1]);
  }
  return { profile: profile.map((m) => "- " + m.text).join("\n"),
           moments: hits.map((m) => `- ${m.happened ? m.happened.slice(0, 7) + ": " : ""}${m.text}${m.basis === "inferred" ? " (his guess, unconfirmed)" : ""}`).join("\n") };
}

function contextLine(ctx) {
  if (!ctx || typeof ctx !== "object") return "";
  const c = JSON.stringify(ctx).slice(0, 1500);
  return `\nWhat he's looking at in Momentum right now (only bring it up if it helps): ${c}`;
}

// --- talking to Gemini (streamed)
async function* gemini(system, turns, json = false) {
  const key = env("GEMINI_API_KEY");
  if (!key) throw Object.assign(new Error("no key"), { kind: "nokey" });
  const models = (env("GEMINI_MODEL") || "gemini-flash-latest,gemini-flash-lite-latest,gemini-2.5-flash").split(",").map((s) => s.trim()).filter(Boolean);
  let last;
  for (const m of models) {
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 12000);   // a model that won't start in 12s is too busy: next
    let r;
    try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:streamGenerateContent?alt=sse`, {
      signal: ac.signal, method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: turns,
        generationConfig: { temperature: json ? 0.3 : 0.85, maxOutputTokens: 8192, ...(json ? { responseMimeType: "application/json" } : {}) } }) });
    } catch (e) { clearTimeout(timer); last = Object.assign(new Error("model " + m + " too slow"), { kind: "busy" }); continue; }
    clearTimeout(timer);
    if (r.status === 404 || r.status === 400) { last = new Error("model " + m + " " + r.status); continue; }
    if (r.status >= 500) { last = Object.assign(new Error("model " + m + " " + r.status), { kind: "busy" }); continue; }   // overloaded: try the next model
    if (r.status === 429) throw Object.assign(new Error("busy"), { kind: "busy" });
    if (!r.ok) throw new Error("gemini " + r.status + " " + (await r.text()).slice(0, 160));
    INFO.model = m;
    const rd = r.body.getReader(), dec = new TextDecoder();
    let buf = "";
    for (let last = false; !last;) {
      const { value, done } = await rd.read();
      if (done) { last = true; buf += "\n"; }               // the final piece may not end with a line break: keep it
      else buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        try {
          const j = JSON.parse(line.slice(5));
          const t = (j.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
          if (j.candidates?.[0]?.finishReason) INFO.finish = j.candidates[0].finishReason;
          if (j.usageMetadata) INFO.usage = j.usageMetadata;
          if (t) yield t;
        } catch { /* partial line */ }
      }
    }
    return;
  }
  throw last || new Error("no model available");
}

const TOOLS = `

You can change his plan in Momentum. Do it only when he asks, or clearly wants it. Write your normal reply first (say plainly what you've done,
e.g. "Done - gym's in for tomorrow at six."), then put each change on its own line at the very END, exactly like this:
⟦add {"title":"Gym","date":"YYYY-MM-DD","time":"18:00","dur":60,"prio":"none","repeat":"none"}⟧
⟦edit {"id":"<id>","date":"YYYY-MM-DD","time":"HH:MM"}⟧   (move, rename, retime, change length/priority/repeat: only the fields that change)
⟦done {"id":"<id>","date":"YYYY-MM-DD"}⟧   ⟦undone {"id":"<id>","date":"YYYY-MM-DD"}⟧
⟦delete {"id":"<id>"}⟧   (he'll be asked to confirm, so say you've asked rather than that it's gone)
Rules: date null = to-do with no day; time null = anytime. prio high|med|low|none. repeat none|daily|weekdays|weekly. dur in minutes.
Use only ids shown in [brackets] above. If it's unclear which task he means, ask instead of guessing. At most 8 changes.
Keep titles short and verb-first. You can't yet open things on his PC or look at his files - say so plainly if asked.`;

// --- turning Gary's action lines into safe, checked changes (nothing else ever runs)
const ISO = /^\d{4}-\d{2}-\d{2}$/, HM = /^([01]\d|2[0-3]):[0-5]\d$/;
function cleanFields(a, into) {
  if (typeof a.title === "string" && a.title.trim()) into.title = a.title.trim().slice(0, 120);
  if ("date" in a) { if (a.date === null || ISO.test(a.date)) into.date = a.date; }
  if ("time" in a) { if (a.time === null || HM.test(a.time)) into.time = a.time; }
  if ("dur" in a && Number.isFinite(+a.dur)) into.dur = Math.max(5, Math.min(600, Math.round(+a.dur)));
  if (["high", "med", "low", "none"].includes(a.prio)) into.prio = a.prio;
  if (["none", "daily", "weekdays", "weekly"].includes(a.repeat)) into.repeat = a.repeat;
  return into;
}
export function parseActions(reply) {
  const out = [];
  for (const m of reply.matchAll(/\u27e6\s*(add|edit|done|undone|delete)\s+(\{[\s\S]*?\})\s*\u27e7/g)) {
    if (out.length >= 8) break;
    let a; try { a = JSON.parse(m[2]); } catch { continue; }
    const op = m[1];
    if (op === "add") {
      const f = cleanFields(a, {});
      if (f.title) out.push({ op, ...{ date: null, time: null, dur: 15, prio: "none", repeat: "none" }, ...f });
      continue;
    }
    const id = String(a.id || "");
    if (!KNOWN.has(id)) continue;                       // never touch a task he wasn't shown
    if (op === "edit") { const f = cleanFields(a, {}); if (Object.keys(f).length) out.push({ op, id, ...f }); }
    else if (op === "done" || op === "undone") out.push({ op, id, date: ISO.test(a.date) ? a.date : londonDate(0) });
    else if (op === "delete") out.push({ op, id });
  }
  return out;
}

const MISHAP = {
  nokey: "My brain isn't plugged in yet, sir - there's no Gemini key in Supabase's Secrets. Once it's there, I'm all yours.",
  busy: "Google's thinking machines are rather swamped just now, sir. Give it a minute and try me again.",
};

export async function handle(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("Gary only takes POST.", { status: 405, headers: CORS });
  APIKEY = req.headers.get("apikey") || env("SUPABASE_ANON_KEY");
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const who = token && await fetch(env("SUPABASE_URL") + "/auth/v1/user", { headers: { apikey: APIKEY, Authorization: "Bearer " + token } });
  if (!who || !who.ok) return new Response(JSON.stringify({ error: "Sign in first." }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
  let body;
  try { body = await req.json(); } catch { body = {}; }
  const text = String(body.text || "").trim().slice(0, 6000);
  if (!text) return new Response(JSON.stringify({ error: "Say something." }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

  // Brain dump: messy thoughts -> small tasks (JSON, not a conversation)
  if (body.mode === "dump") {
    try {
      let out = "";
      for await (const t of gemini(IDENTITY + "\n\nRight now you are only sorting a brain dump into tasks. Reply with JSON only.",
        [{ role: "user", parts: [{ text: 'Turn this into short, concrete tasks for someone with ADHD - split vague things into a first step, invent nothing. JSON: {"tasks":[{"title":verb-first, "dur":minutes 5-120, "prio":"high"|"med"|"low", "when":"today"|"tomorrow"|"someday", "time":"HH:MM" or null}]} max 10.\n\n' + text }] }], true)) out += t;
      const tasks = (JSON.parse(out).tasks || []).filter((t) => t && t.title).slice(0, 10);
      return new Response(JSON.stringify({ tasks }), { headers: { ...CORS, "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ tasks: [], error: MISHAP[e.kind] || "Couldn't sort that just now." }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }
  }

  // Conversation
  let convo = String(body.convo || "").replace(/[^a-z0-9]/gi, "").slice(0, 40);
  let title = "";
  if (!convo) {
    convo = "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    title = text.replace(/\s+/g, " ").split(" ").slice(0, 6).join(" ").slice(0, 80);
    await db("gary_convos", token, { method: "POST", body: JSON.stringify({ id: convo, title }) });
  }
  const past = await db(`gary_messages?select=role,content&convo=eq.${convo}&order=id.desc&limit=30`, token).catch(() => []);
  const turns = past.reverse().map((m) => ({ role: m.role === "gary" ? "model" : "user", parts: [{ text: m.content }] }));
  turns.push({ role: "user", parts: [{ text }] });
  const [mem, plan] = await Promise.all([recall(text, token), planSummary(token, body.items)]);
  const system = IDENTITY +
    `\n\nIt is ${londonNow()} (UK time).` + contextLine(body.ctx) +
    `\n\nHis plan in Momentum:\n${plan}` +
    `\n\nWhat you know about Sam:\n${mem.profile || "(nothing stored yet)"}` +
    (mem.moments ? `\n\nMemories that may relate to this (dated where known; only use if relevant):\n${mem.moments}` : "") +
    TOOLS;

  await db("gary_messages", token, { method: "POST", body: JSON.stringify({ convo, role: "user", content: text, ctx: body.ctx || null }) });
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) { (async () => {
      let reply = "";
      INFO = {};
      const t0 = Date.now();
      try {
        let shown = 0;
        for await (const t of gemini(system, turns)) {
          reply += t;
          const cut = reply.indexOf("\u27e6");
          const upto = cut < 0 ? Math.max(shown, reply.length - 1) : cut;   // keep one char back in case a bracket is arriving
          if (upto > shown) { ctrl.enqueue(enc.encode(reply.slice(shown, upto))); shown = upto; }
        }
        const cut = reply.indexOf("\u27e6");
        const end = cut < 0 ? reply.length : cut;
        if (end > shown) ctrl.enqueue(enc.encode(reply.slice(shown, end)));
      } catch (e) {
        const msg = MISHAP[e.kind] || "Something's gone awry on my end, sir. Try me again in a moment.";
        if (!reply) { reply = msg; ctrl.enqueue(enc.encode(msg)); }
        await db("gary_audit", token, { method: "POST", body: JSON.stringify({ action: "reply_failed", detail: { error: String(e.message || e).slice(0, 300) }, ok: false }) }).catch(() => {});
      }
      await db("gary_audit", token, { method: "POST", body: JSON.stringify({ action: "reply", detail: { ...INFO, ms: Date.now() - t0, chars: reply.length } }) }).catch(() => {});
      const actions = parseActions(reply);
      const said = (reply.indexOf("\u27e6") < 0 ? reply : reply.slice(0, reply.indexOf("\u27e6"))).trim();
      if (actions.length) await db("gary_audit", token, { method: "POST", body: JSON.stringify({ action: "proposed", detail: { actions } }) }).catch(() => {});
      await db("gary_messages", token, { method: "POST", body: JSON.stringify({ convo, role: "gary", content: said || "…" }) }).catch(() => {});
      await db(`gary_convos?id=eq.${convo}`, token, { method: "PATCH", body: JSON.stringify({ updated_at: new Date().toISOString() }) }).catch(() => {});
      ctrl.enqueue(enc.encode("\x1e" + JSON.stringify({ convo, title, actions })));
      ctrl.close();
    })(); },
  });
  return new Response(stream, { headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

if (typeof Deno !== "undefined") Deno.serve(handle);

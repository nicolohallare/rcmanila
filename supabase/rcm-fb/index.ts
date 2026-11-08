import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// The Club's Facebook Page: a weekly plan of posts that the Balita editor approves before anything goes out.
//   Thursday  the new Balita issue, as soon as it is live (led by its main story)
//   Saturday  a second story from that issue (service first), 10:00
//   Sunday    the history minute for the coming Thursday, 10:00
//   Monday    the invitation to Thursday's meeting, 10:00 (or as soon as the meeting is published)
//   Events    open to the public: when published, and a reminder three days before, 10:00
// At most one post per Manila day, only between 8:00 and 20:00. Each post is a picture card (rcm-card) with the caption and link.
//
// Called every 15 minutes by pg_cron (job rcm-fb-autopost) with { token } = rcm_settings.fb_cron_token: plans the coming week and posts approved items that are due.
// The editor page calls it with the editor passcode (x-editor-code) to list, approve, edit, swap or skip posts.
// Needs Edge Function secrets FB_PAGE_ID and FB_PAGE_TOKEN (a Page access token with pages_manage_posts).
// Nothing posts unless rcm_settings.fb_autopost = 'on'. Nothing published before rcm_settings.fb_queue_start is planned.
const SITE = "https://rcmanila.org";
const GRAPH = "https://graph.facebook.com/v21.0";
const SB = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-editor-code, authorization, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function setting(key: string) {
  const { data } = await db.from("rcm_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value || "") as string;
}

// ---------- Manila time helpers ----------
const H = 3600e3, D = 864e5;
const manila = (t = Date.now()) => new Date(t + 8 * H); // read with getUTC*
const manilaDay = (t = Date.now()) => manila(t).toISOString().slice(0, 10);
const at = (dayIso: string, hour: number, min = 0) => Date.parse(`${dayIso}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00+08:00`);
const addDays = (dayIso: string, n: number) => new Date(Date.parse(dayIso + "T12:00:00Z") + n * D).toISOString().slice(0, 10);
const weekday = (dayIso: string) => new Date(dayIso + "T12:00:00Z").getUTCDay(); // 0 Sunday … 4 Thursday
// The first moment at or after t that falls inside 8:00–20:00 Manila.
function inWindow(t: number) {
  const d = manilaDay(t), h = manila(t).getUTCHours();
  if (h < 8) return at(d, 8);
  if (h >= 20) return at(addDays(d, 1), 8);
  return t;
}
const longDay = (d: string, year = true) => new Date(d + "T12:00:00+08:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", ...(year ? { year: "numeric" } : {}), timeZone: "Asia/Manila" });
const shortDay = (d: string) => new Date(d + "T12:00:00+08:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Manila" });

// ---------- content ----------
const utm = (url: string, kind: string) => { const [base, hash] = url.split("#"); return `${base}${base.includes("?") ? "&" : "?"}utm_source=facebook&utm_medium=social&utm_campaign=fb-${kind}${hash ? "#" + hash : ""}`; };
const cardUrl = (kind: string, ref: string) => `${SB}/functions/v1/rcm-card?k=${encodeURIComponent(kind)}&id=${encodeURIComponent(ref)}&v=${Date.now().toString(36)}`;
const posterUrl = (path: string) => `${SB}/storage/v1/object/public/rcm/${path.split("/").map(encodeURIComponent).join("/")}`;
const trimTo = (s: string, n: number) => { s = String(s || "").replace(/\s+/g, " ").trim(); if (s.length <= n) return s; const cut = s.slice(0, n); const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? ")); return end > n * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…"; };
type Photo = { path?: string; width?: number; height?: number; include?: boolean };
const photos = (p: unknown) => (Array.isArray(p) ? p : []).filter((x: Photo) => x && x.path && x.include !== false) as Photo[];
const bodyText = (b: unknown) => (Array.isArray(b) ? b : []).filter((x: { t?: string; text?: string }) => x && x.text && (!x.t || x.t === "p")).map((x: { text: string }) => x.text).join(" ");

// Which stories make a good Saturday post: service first, then fellowship and awards, then the rest. Never clippings or admin notes.
const TIER: Record<string, number> = { "service": 1, "foundation": 1, "in focus": 2, "fellowship": 2, "awards": 2, "club news": 2, "guest speaker": 3, "weekly meeting": 3, "editorial": 3, "feature": 3, "president's message": 3 };
const tier = (k: string | null) => TIER[String(k || "").toLowerCase()] || 0;

// deno-lint-ignore no-explicit-any
type Row = any;
async function issueRows(issueId: string) {
  const { data } = await db.from("rcm_articles").select("id,slug,title,dek,kicker,lead,sort,photos,body").eq("issue_id", issueId).eq("included", true).order("sort");
  return (data || []) as Row[];
}
const leadOf = (arts: Row[]) => arts.find((a) => a.lead && photos(a.photos).length) || arts.find((a) => a.lead) || arts.find((a) => photos(a.photos).length) || arts[0];

function issueMessage(i: Row, arts: Row[]) {
  const lead = leadOf(arts);
  const rest = arts.filter((a) => a !== lead && tier(a.kicker) > 0).slice(0, 4);
  const link = `${SITE}/balita/${i.issue_no}`;
  const lines = [`📰 Balita No. ${i.issue_no} · ${shortDay(i.issue_date)}`, ""];
  if (lead) { lines.push(lead.kicker === "Guest speaker" ? `This week’s guest speaker: ${lead.title}${lead.dek ? ", " + lead.dek : ""}` : lead.title); if (lead.dek && lead.kicker !== "Guest speaker") lines.push(trimTo(lead.dek, 220)); }
  if (rest.length) { lines.push("", "Also in this issue:"); for (const a of rest) lines.push(`▸ ${a.title}`); }
  lines.push("", `Read the full issue: ${utm(link, "issue")}`);
  return { message: lines.join("\n"), link };
}
function storyMessage(i: Row, a: Row) {
  const link = `${SITE}/balita/${i.issue_no}/${a.slug}`;
  // the story's own opening words; the short summary only when the story itself is very short
  const body = trimTo(bodyText(a.body), 480);
  const lines = [a.title, ""];
  if (body.length < 140 && a.dek) lines.push(trimTo(a.dek, 260), "");
  if (body) lines.push(body, "");
  lines.push(`Read the full story in the Balita: ${utm(link, "story")}`);
  return { message: lines.join("\n"), link };
}
function historyMessage(m: Row) {
  const link = `${SITE}/library/minute?w=${m.week}`;
  const title = String(m.title || "").trim();
  const paras = String(m.script || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  let text = ""; for (const p of paras) { if ((text + p).length > 750 && text) break; text += (text ? "\n\n" : "") + p; }
  const lines = [`📜 This week in Club history: ${title}`, "", trimTo(text, 900), "", `From the Rotary Club of Manila’s Heritage Library: ${utm(link, "history")}`];
  return { message: lines.join("\n"), link };
}
function meetingMessage(m: Row) {
  const link = `${SITE}/meetings/${m.meeting_date}`;
  const lines = [`🗓 This ${weekday(m.meeting_date) === 4 ? "Thursday" : longDay(m.meeting_date, false).split(" ")[0]} at the Rotary Club of Manila`, ""];
  if (m.speaker) lines.push(`Guest speaker: ${m.speaker}${m.speaker_title ? ", " + m.speaker_title : ""}`);
  if (m.topic) lines.push(m.speaker ? `“${String(m.topic).replace(/\s+/g, " ").trim()}”` : String(m.topic).trim());
  if (!m.speaker && !m.topic && m.label) lines.push(m.label);
  lines.push("", [longDay(m.meeting_date, false), m.time_text].filter(Boolean).join(", "));
  if (m.venue) lines.push(String(m.venue).replace(/\s+/g, " ").replace(/\s*,\s*/g, ", "));
  lines.push("", `Members and guests are welcome. Sign up here: ${utm(link + "#rsvp", "meeting")}`);
  lines.push(`🤝 Bringing a guest? Invite them here: ${utm(SITE + "/invite/send", "meeting-invite")}`);
  return { message: lines.join("\n"), link };
}
function eventMessage(e: Row, reminder: boolean) {
  const link = `${SITE}/events/${e.slug}`;
  const when = [e.event_date ? longDay(e.event_date) : "", e.time_text || ""].filter(Boolean).join(", ");
  const lines = [reminder ? `⏰ Three days to go: ${e.title}` : `📅 ${e.title}`];
  if (when) lines.push(when);
  if (e.venue) lines.push(e.venue);
  if (e.summary) lines.push("", trimTo(e.summary, 500));
  lines.push("", `Details and sign-up: ${utm(link, reminder ? "event-reminder" : "event")}`);
  return { message: lines.join("\n"), link };
}

// ---------- the planner ----------
type Plan = { kind: string; ref: string; scheduled_at: number; message: string; link: string; card_url: string; meta?: Record<string, unknown> };

function storyChoices(arts: Row[], exclude: string | null) {
  return arts.filter((a) => a.id !== exclude && tier(a.kicker) > 0 && photos(a.photos).length)
    .map((a) => ({ a, t: tier(a.kicker), wide: Math.max(...photos(a.photos).map((p) => p.width || 0)) >= 600 ? 0 : 1 }))
    .sort((x, y) => x.t - y.t || x.wide - y.wide || x.a.sort - y.a.sort).map((x) => x.a);
}

async function plan(now: number): Promise<Plan[]> {
  const start = Date.parse((await setting("fb_queue_start")) || new Date(now).toISOString());
  const today = manilaDay(now), out: Plan[] = [];
  const { data: posted } = await db.from("rcm_fb_posts").select("kind,ref_id").not("fb_post_id", "is", null);
  const postedBefore = new Set((posted || []).map((p) => p.kind + p.ref_id));

  // The latest issue: its own post (if it went live after the queue started) and Saturday's story.
  const { data: iss } = await db.from("rcm_issues").select("id,issue_no,issue_date,publish_at,status").eq("status", "published")
    .gte("issue_date", addDays(today, -9)).lte("publish_at", new Date(now).toISOString()).order("issue_date", { ascending: false }).limit(1);
  const i = iss?.[0];
  if (i) {
    const arts = await issueRows(i.id);
    const lead = leadOf(arts);
    if (Date.parse(i.publish_at) >= start && !postedBefore.has("issue" + i.id)) {
      out.push({ kind: "issue", ref: i.id, scheduled_at: inWindow(Math.max(Date.parse(i.publish_at), now)), ...issueMessage(i, arts), card_url: cardUrl("issue", i.id), meta: { issue_no: i.issue_no, label: `Balita No. ${i.issue_no}` } });
    }
    const sat = addDays(i.issue_date, (6 - weekday(i.issue_date) + 7) % 7 || 7);
    const choices = storyChoices(arts, lead?.id || null);
    if (choices.length && at(sat, 10) > now - 2 * D) {
      const a = choices[0];
      out.push({ kind: "story", ref: a.id, scheduled_at: at(sat, 10), ...storyMessage(i, a), card_url: cardUrl("story", a.id),
        meta: { issue_no: i.issue_no, issue_id: i.id, label: a.title, options: choices.slice(0, 8).map((c) => ({ id: c.id, title: c.title, kicker: c.kicker })) } });
    }
  }

  // Sunday: the history minute for the coming Thursday. Planned from Thursday on, so it can be approved with the issue.
  for (let k = 0; k < 8; k++) {
    const d = addDays(today, k);
    if (weekday(d) !== 0) continue;
    const thu = addDays(d, 4);
    const { data: m } = await db.from("rcm_lib_minutes").select("week,title,script").eq("week", thu).eq("status", "published").maybeSingle();
    if (m && at(d, 10) > start) out.push({ kind: "history", ref: m.week, scheduled_at: at(d, 10), ...historyMessage(m), card_url: cardUrl("history", m.week), meta: { label: m.title } });
  }

  // Monday: the coming meeting (Thursday), or as soon as it is published if that is later.
  const { data: meets } = await db.from("rcm_meetings").select("meeting_date,label,topic,speaker,speaker_title,time_text,venue,status,poster_path,updated_at")
    .eq("status", "published").gt("meeting_date", today).lte("meeting_date", addDays(today, 7)).order("meeting_date");
  for (const m of meets || []) {
    const mon = addDays(m.meeting_date, -((weekday(m.meeting_date) + 6) % 7 || 7)); // the Monday before
    const when = Math.max(at(mon, 10), inWindow(now));
    if (when >= at(m.meeting_date, 8)) continue; // too late to be useful
    out.push({ kind: "meeting", ref: m.meeting_date, scheduled_at: when, ...meetingMessage(m), card_url: m.poster_path ? posterUrl(m.poster_path) : cardUrl("meeting", m.meeting_date), meta: { label: m.speaker || m.topic || "Weekly meeting", date: m.meeting_date } });
  }

  // Events open to the public: once when published (if not posted before), and a reminder three days before.
  // Members-only events are not advertised on the public Page.
  const { data: evs } = await db.from("rcm_events").select("id,slug,title,event_date,time_text,venue,summary,poster_path,created_at,status,who")
    .eq("status", "published").eq("who", "open").gt("event_date", today).order("event_date").limit(10);
  for (const e of evs || []) {
    const card = e.poster_path ? posterUrl(e.poster_path) : cardUrl("event", e.id);
    const remind = at(addDays(e.event_date, -3), 10);
    const first = inWindow(Math.max(now, Date.parse(e.created_at)));
    if (!postedBefore.has("event" + e.id) && first < remind - D) out.push({ kind: "event", ref: e.id, scheduled_at: first, ...eventMessage(e, false), card_url: card, meta: { label: e.title, date: e.event_date } });
    if (remind > now - 6 * H && remind < now + 8 * D) out.push({ kind: "event-reminder", ref: e.id, scheduled_at: Math.max(remind, inWindow(now)), ...eventMessage(e, true), card_url: e.poster_path ? posterUrl(e.poster_path) : cardUrl("event-reminder", e.id), meta: { label: e.title, date: e.event_date } });
  }
  return out;
}

// Adds new plan items to the queue; never touches items that already exist (the editor may have edited or approved them).
async function syncQueue(now: number) {
  const items = await plan(now);
  if (!items.length) return 0;
  const { data: have } = await db.from("rcm_fb_queue").select("kind,ref");
  const seen = new Set((have || []).map((r) => r.kind + "|" + r.ref));
  // A story already planned for this issue (perhaps swapped by the editor) means no second one.
  const { data: stories } = await db.from("rcm_fb_queue").select("meta").eq("kind", "story");
  const storyIssues = new Set((stories || []).map((s) => s.meta?.issue_id).filter(Boolean));
  const fresh = items.filter((p) => !seen.has(p.kind + "|" + p.ref) && !(p.kind === "story" && storyIssues.has(p.meta?.issue_id)));
  if (!fresh.length) return 0;
  // A new event's first post goes on the first day that has nothing else planned (one post a day), before its reminder.
  const { data: busy } = await db.from("rcm_fb_queue").select("scheduled_at,posted_at,status").in("status", ["pending", "approved", "posted"]).gte("scheduled_at", new Date(now - 2 * D).toISOString());
  const taken = new Set<string>([...(busy || []).map((r) => manilaDay(Date.parse(r.posted_at || r.scheduled_at))), ...fresh.filter((p) => p.kind !== "event").map((p) => manilaDay(p.scheduled_at))]);
  for (const p of fresh.filter((x) => x.kind === "event")) {
    const limit = at(addDays(String(p.meta?.date), -4), 20);
    for (let k = 0; k < 30; k++) {
      const d = addDays(manilaDay(p.scheduled_at), k);
      const t = k === 0 ? p.scheduled_at : at(d, 12);
      if (t > limit) break;
      if (!taken.has(d)) { p.scheduled_at = t; taken.add(d); break; }
    }
  }
  const auto = (await setting("fb_approval")) === "auto";
  const rows = fresh.map((p) => ({ kind: p.kind, ref: p.ref, scheduled_at: new Date(p.scheduled_at).toISOString(), message: p.message, link: p.link, card_url: p.card_url, meta: p.meta || {}, status: auto ? "approved" : "pending", approved_at: auto ? new Date().toISOString() : null }));
  const { error } = await db.from("rcm_fb_queue").upsert(rows, { onConflict: "kind,ref", ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

// Items whose moment has passed are skipped rather than posted late.
async function expire(now: number) {
  const { data } = await db.from("rcm_fb_queue").select("id,kind,ref,scheduled_at,meta").in("status", ["pending", "approved"]);
  const stale = (data || []).filter((q) => {
    const date = q.meta?.date as string | undefined;
    if ((q.kind === "meeting" || q.kind === "event" || q.kind === "event-reminder") && date) return now >= at(date, 8);
    return now - Date.parse(q.scheduled_at) > 4 * D;
  }).map((q) => q.id);
  if (stale.length) await db.from("rcm_fb_queue").update({ status: "skipped", error: "Its date passed before it was posted", updated_at: new Date().toISOString() }).in("id", stale);
  return stale.length;
}

// ---------- posting ----------
async function graphPost(path: string, params: Record<string, string>) {
  const r = await fetch(`${GRAPH}/${Deno.env.get("FB_PAGE_ID")}/${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...params, access_token: Deno.env.get("FB_PAGE_TOKEN")! }) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && !!(j.post_id || j.id), id: (j.post_id || j.id || null) as string | null, error: j?.error?.message ? String(j.error.message) : r.ok ? null : "HTTP " + r.status };
}

async function postOne(q: Row) {
  let res = q.card_url ? await graphPost("photos", { url: q.card_url, caption: q.message }) : { ok: false, id: null, error: "no picture" };
  if (!res.ok) { const fb = await graphPost("feed", { message: q.message, link: q.link }); if (fb.ok) res = fb; else res = { ...fb, error: `${res.error} / ${fb.error}` }; }
  const attempts = (q.attempts || 0) + 1, nowIso = new Date().toISOString();
  if (res.ok) {
    await db.from("rcm_fb_queue").update({ status: "posted", fb_post_id: res.id, posted_at: nowIso, error: null, attempts, updated_at: nowIso }).eq("id", q.id);
    // keep the old log too (dashboard "last post", and never posting an issue or event twice)
    if (/^[0-9a-f-]{36}$/.test(q.ref)) await db.from("rcm_fb_posts").upsert({ kind: q.kind, ref_id: q.ref, fb_post_id: res.id, attempts, error: null, posted_at: nowIso });
  } else {
    await db.from("rcm_fb_queue").update({ status: attempts >= 3 ? "failed" : "approved", error: String(res.error).slice(0, 300), attempts, updated_at: nowIso }).eq("id", q.id);
  }
  return { id: q.id, kind: q.kind, ok: res.ok, error: res.error };
}

async function postDue(now: number) {
  const h = manila(now).getUTCHours();
  if (h < 8 || h >= 20) return { waiting: "outside 8:00–20:00" };
  const dayStart = new Date(at(manilaDay(now), 0)).toISOString();
  const { count } = await db.from("rcm_fb_queue").select("id", { count: "exact", head: true }).eq("status", "posted").gte("posted_at", dayStart);
  if ((count || 0) > 0) return { waiting: "already posted today" };
  const { data } = await db.from("rcm_fb_queue").select("*").eq("status", "approved").lte("scheduled_at", new Date(now).toISOString()).order("scheduled_at").limit(1);
  if (!data?.length) return { waiting: "nothing approved and due" };
  return { posted: await postOne(data[0]) };
}

// ---------- the editor's actions ----------
let codes: { at: number; editor: string } | null = null;
async function isEditor(code: string | null) {
  if (!code || code.length < 6) return false;
  if (!codes || Date.now() - codes.at > 60_000) codes = { at: Date.now(), editor: await setting("editor_code") };
  return !!codes.editor && code === codes.editor;
}

async function rebuild(q: Row, ref?: string) {
  // fresh caption and card for a story swapped to another article
  const { data: a } = await db.from("rcm_articles").select("id,slug,title,dek,kicker,photos,body,issue_id").eq("id", ref || q.ref).maybeSingle();
  if (!a) throw new Error("That story was not found");
  const { data: i } = await db.from("rcm_issues").select("id,issue_no,issue_date").eq("id", a.issue_id).maybeSingle();
  return { ref: a.id, ...storyMessage(i, a), card_url: cardUrl("story", a.id), meta: { ...(q.meta || {}), label: a.title } };
}

async function editorAction(b: Row) {
  const nowIso = new Date().toISOString();
  if (b.action === "q-list") {
    const since = new Date(Date.now() - 10 * D).toISOString();
    const { data } = await db.from("rcm_fb_queue").select("id,kind,ref,scheduled_at,message,link,card_url,status,error,fb_post_id,meta,posted_at,approved_at")
      .or(`status.in.(pending,approved),scheduled_at.gte.${since},posted_at.gte.${since}`).order("scheduled_at").limit(40);
    return { items: data || [], autopost: (await setting("fb_autopost")) === "on", page: Deno.env.get("FB_PAGE_ID") ? `https://www.facebook.com/${Deno.env.get("FB_PAGE_ID")}` : null };
  }
  if (b.action === "q-approve-all") {
    const { data } = await db.from("rcm_fb_queue").update({ status: "approved", approved_at: nowIso, updated_at: nowIso }).eq("status", "pending").select("id");
    return { approved: (data || []).length };
  }
  const { data: q } = await db.from("rcm_fb_queue").select("*").eq("id", String(b.id || "")).maybeSingle();
  if (!q) throw new Error("That post was not found");
  if (q.status === "posted") throw new Error("That post is already on Facebook");
  let patch: Row = { updated_at: nowIso };
  if (b.action === "q-approve") patch = { ...patch, status: "approved", approved_at: nowIso, error: null, attempts: q.status === "failed" ? 0 : q.attempts };
  else if (b.action === "q-skip") patch = { ...patch, status: "skipped" };
  else if (b.action === "q-unskip") patch = { ...patch, status: "pending" };
  else if (b.action === "q-edit") {
    const msg = String(b.message || "").trim();
    if (msg.length < 10) throw new Error("The caption is too short");
    patch = { ...patch, message: msg.slice(0, 5000) };
    if (b.scheduled_at) { const t = Date.parse(b.scheduled_at); if (!isNaN(t)) patch.scheduled_at = new Date(t).toISOString(); }
  } else if (b.action === "q-swap") {
    if (q.kind !== "story") throw new Error("Only the Saturday story can be swapped");
    const ok = (q.meta?.options || []).some((o: Row) => o.id === b.ref);
    if (!ok) throw new Error("Pick one of the stories listed");
    patch = { ...patch, ...(await rebuild(q, String(b.ref))), status: "pending", approved_at: null };
  } else if (b.action === "q-refresh") {
    patch = { ...patch, card_url: q.card_url && q.card_url.includes("/rcm-card?") ? cardUrl(q.kind, q.ref) : q.card_url };
  } else throw new Error("Unknown action");
  const { data, error } = await db.from("rcm_fb_queue").update(patch).eq("id", q.id).select("id,kind,ref,scheduled_at,message,link,card_url,status,error,meta").single();
  if (error) throw new Error(error.code === "23505" ? "That story is already planned" : error.message);
  return { item: data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const b = await req.json().catch(() => ({}));
  const configured = !!(Deno.env.get("FB_PAGE_ID") && Deno.env.get("FB_PAGE_TOKEN"));

  // Editor page
  if (typeof b.action === "string" && b.action.startsWith("q-")) {
    if (!(await isEditor(req.headers.get("x-editor-code")))) return json({ error: "Wrong passcode" }, 401);
    try {
      if (b.action === "q-list") await syncQueue(Date.now()).catch(() => 0);
      return json(await editorAction(b));
    } catch (e) { return json({ error: String((e as Error)?.message || e) }, 400); }
  }

  // Scheduled job and maintenance (cron token)
  const tok = await setting("fb_cron_token");
  if (!tok || b.token !== tok) return json({ error: "not allowed" }, 403);

  if (b.action === "test") {
    if (!configured) return json({ configured: false, has_id: !!Deno.env.get("FB_PAGE_ID"), has_token: !!Deno.env.get("FB_PAGE_TOKEN") });
    const r = await fetch(`${GRAPH}/${Deno.env.get("FB_PAGE_ID")}?fields=name,link&access_token=${encodeURIComponent(Deno.env.get("FB_PAGE_TOKEN")!)}`);
    const j = await r.json().catch(() => ({}));
    const d = await fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(Deno.env.get("FB_PAGE_TOKEN")!)}&access_token=${encodeURIComponent(Deno.env.get("FB_PAGE_TOKEN")!)}`).then((x) => x.json()).catch(() => ({}));
    return json({ configured: true, ok: r.ok, page: j.name, link: j.link, error: j?.error?.message, token_type: d?.data?.type, expires: d?.data?.expires_at, scopes: d?.data?.scopes, autopost: await setting("fb_autopost") });
  }

  // Read-only report for planning the Page: its set-up and posts (needs pages_read_user_content and read_insights for more).
  if (b.action === "report") {
    if (!configured) return json({ configured: false });
    const T = encodeURIComponent(Deno.env.get("FB_PAGE_TOKEN")!), P = Deno.env.get("FB_PAGE_ID");
    const get = (u: string) => fetch(u).then((x) => x.json()).catch((e) => ({ error: { message: String(e) } }));
    const page = await get(`${GRAPH}/${P}?fields=name,username,link,category,about,description,website,emails,phone,single_line_address,fan_count,followers_count,picture.width(400){url},cover{source},is_published,hours&access_token=${T}`);
    const posts = await get(`${GRAPH}/${P}/posts?fields=id,created_time,message,permalink_url,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)&limit=25&access_token=${T}`);
    const insights = await get(`${GRAPH}/${P}/insights?metric=page_impressions_unique,page_post_engagements,page_follows&period=days_28&access_token=${T}`);
    return json({ page, posts: posts.error ? posts.error.message : posts.data, insights: insights.error ? insights.error.message : insights.data });
  }

  // Page and post figures for the President's report. Tries each metric on its own, since Facebook renames them from time to time.
  if (b.action === "insights") {
    if (!configured) return json({ configured: false });
    const T = encodeURIComponent(Deno.env.get("FB_PAGE_TOKEN")!), P = Deno.env.get("FB_PAGE_ID");
    const get = (u: string) => fetch(u).then((x) => x.json()).catch((e) => ({ error: { message: String(e) } }));
    const metrics: string[] = Array.isArray(b.metrics) ? b.metrics : ["page_follows", "page_daily_follows_unique", "page_daily_unfollows_unique", "page_post_engagements", "page_views_total", "page_media_view", "page_total_media_view_unique", "page_impressions_unique", "page_fans"];
    const q = b.since && b.until ? `&since=${encodeURIComponent(b.since)}&until=${encodeURIComponent(b.until)}` : "";
    const page: Record<string, unknown> = {};
    for (const m of metrics) { const j = await get(`${GRAPH}/${P}/insights?metric=${m}&period=${b.period || "day"}${q}&access_token=${T}`); page[m] = j.error ? "ERR " + j.error.message : (j.data || []).map((d: Row) => ({ period: d.period, values: d.values })); }
    const posts: unknown[] = [];
    if (b.posts !== false) {
      const list = await get(`${GRAPH}/${P}/posts?fields=id,created_time,message,permalink_url,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)&limit=${Number(b.limit) || 40}${b.since ? `&since=${encodeURIComponent(b.since)}` : ""}&access_token=${T}`);
      const pm: string[] = Array.isArray(b.post_metrics) ? b.post_metrics : ["post_media_view", "post_total_media_view_unique", "post_impressions_unique", "post_clicks"];
      for (const x of list.data || []) {
        const ins: Record<string, unknown> = {};
        for (const m of pm) { const j = await get(`${GRAPH}/${x.id}/insights?metric=${m}&access_token=${T}`); ins[m] = j.error ? "ERR " + String(j.error.message).slice(0, 80) : j.data?.[0]?.values?.[0]?.value; }
        posts.push({ id: x.id, at: x.created_time, text: String(x.message || "").replace(/\s+/g, " ").slice(0, 90), url: x.permalink_url, reactions: x.reactions?.summary?.total_count || 0, comments: x.comments?.summary?.total_count || 0, shares: x.shares?.count || 0, ins });
      }
      if (list.error) posts.push({ error: list.error.message });
    }
    return json({ page, posts });
  }

  // Preview what the planner would add, without saving (for checking).
  if (b.action === "plan") return json({ plan: (await plan(Date.now())).map((p) => ({ ...p, scheduled_at: new Date(p.scheduled_at).toISOString() })) });

  // The 15-minute run: plan, drop stale items, post what is approved and due.
  const now = Date.now();
  const added = await syncQueue(now);
  const expired = await expire(now);
  if (!configured || (await setting("fb_autopost")) !== "on") return json({ added, expired, skipped: true, configured });
  return json({ added, expired, ...(await postDue(now)) });
});

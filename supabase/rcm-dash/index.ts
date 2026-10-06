import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Staff dashboards: what needs doing and a few figures, for the Balita editor, the Secretariat and the librarian.
// Mostly read-only (it also records which posts were shared on Viber). Opens with the same passcodes as each staff page (the editor's passcode opens all three).
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-editor-code, authorization, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

let codes: Record<string, string> | null = null, codesAt = 0;
async function rolesFor(code: string | null): Promise<string[]> {
  if (!code || code.length < 6) return [];
  if (!codes || Date.now() - codesAt > 60_000) {
    const { data } = await db.from("rcm_settings").select("key,value").in("key", ["editor_code", "secretariat_code", "librarian_code"]);
    codes = Object.fromEntries((data || []).map((r: { key: string; value: string }) => [r.key, r.value || ""]));
    codesAt = Date.now();
  }
  if (code === codes.editor_code) return ["editor", "secretariat", "library"];
  const out: string[] = [];
  if (code === codes.secretariat_code) out.push("secretariat");
  if (code === codes.librarian_code) out.push("library");
  return out;
}

const manilaToday = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const ryStart = (t: string) => `${Number(t.slice(0, 4)) - (Number(t.slice(5, 7)) < 7 ? 1 : 0)}-07-01`;
const monthStart = (t: string, add = 0) => { const d = new Date(t.slice(0, 7) + "-01T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + add); return d.toISOString().slice(0, 10); };
const ago = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
// deno-lint-ignore no-explicit-any
const n = (r: any) => r?.count ?? 0;
// deno-lint-ignore no-explicit-any
const rows = (r: any) => r?.data ?? [];

// Website posts to share in the Club's Viber Community, and which have been marked as posted.
async function posted(kinds: string[]) {
  const { data } = await db.from("rcm_viber_posts").select("kind,ref").in("kind", kinds);
  return new Set((data || []).map((r: { kind: string; ref: string }) => r.kind + "|" + r.ref));
}
const addDays = (t: string, d: number) => { const x = new Date(t + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };

async function library(today: string) {
  const next = monthStart(today, 1);
  const [tags, evDraft, evFlag, exh, mins, galHeld, volDraft, ask30, askAll, recentQ, tagsDone, vols, pages, objs, gals, photos, evPub] = await Promise.all([
    db.from("rcm_lib_tags").select("id", { count: "exact", head: true }).eq("status", "new"),
    db.from("rcm_lib_events").select("id", { count: "exact", head: true }).eq("status", "draft"),
    db.from("rcm_lib_events").select("id", { count: "exact", head: true }).eq("status", "draft").not("check_note", "is", null),
    db.from("rcm_lib_exhibits").select("month,slug,title,status").gte("month", monthStart(today)).order("month").limit(4),
    db.from("rcm_lib_minutes").select("week").eq("status", "published").gte("week", today).order("week", { ascending: false }),
    db.from("rcm_lib_galleries").select("id", { count: "exact", head: true }).eq("status", "draft").gt("photo_count", 0).eq("kept_private", false),
    db.from("rcm_lib_volumes").select("id,acc,years,page_count").eq("status", "draft").order("acc"),
    db.from("rcm_ask_log").select("id", { count: "exact", head: true }).gte("created_at", ago(30)),
    db.from("rcm_ask_log").select("id", { count: "exact", head: true }),
    db.from("rcm_ask_log").select("question,created_at").gte("created_at", ago(30)).order("created_at", { ascending: false }).limit(6),
    db.from("rcm_lib_tags").select("id", { count: "exact", head: true }).eq("status", "approved"),
    db.from("rcm_lib_volumes").select("id", { count: "exact", head: true }).eq("status", "published"),
    db.from("rcm_lib_pages").select("n", { count: "exact", head: true }).not("withheld", "is", true),
    db.from("rcm_lib_objects").select("acc", { count: "exact", head: true }).eq("status", "published"),
    db.from("rcm_lib_galleries").select("id", { count: "exact", head: true }).eq("status", "published"),
    db.from("rcm_lib_photos").select("n", { count: "exact", head: true }).not("hidden", "is", true),
    db.from("rcm_lib_events").select("id", { count: "exact", head: true }).eq("status", "published"),
  ]);
  const minutes = rows(mins) as { week: string }[];
  // Volumes left as drafts: how far each got (a volume that stopped part-way shows fewer pages than the scan has).
  const vd = rows(volDraft) as { id: string; acc: string; years: string; page_count: number }[];
  const vdone = await Promise.all(vd.map((v) => db.from("rcm_lib_pages").select("n", { count: "exact", head: true }).eq("volume_id", v.id)));
  const volumes = vd.map((v, k) => ({ acc: v.acc, years: v.years, pages: v.page_count, done: n(vdone[k]) }));
  const done = await posted(["exhibit"]);
  const exNow = (rows(exh) as { month: string; slug: string; title: string; status: string }[]).find((x) => x.month.slice(0, 7) === today.slice(0, 7) && x.status === "published");
  const viber = exNow && !done.has("exhibit|" + exNow.slug) ? [{ kind: "exhibit", ref: exNow.slug, title: exNow.title, link: "/library/exhibit/" + exNow.slug }] : [];
  return {
    viber,
    today,
    todo: {
      tags_new: n(tags),
      events_draft: n(evDraft), events_flagged: n(evFlag),
      exhibits: rows(exh), next_month: next,
      minutes_left: minutes.length, minutes_last: minutes[0]?.week || null,
      galleries_held: n(galHeld),
      volumes_draft: volumes,
    },
    activity: { ask_30d: n(ask30), ask_total: n(askAll), recent_questions: rows(recentQ), names_approved: n(tagsDone) },
    stats: { volumes: n(vols), pages: n(pages), objects: n(objs), galleries: n(gals), photos: n(photos), timeline: n(evPub) },
  };
}

async function editor(today: string) {
  const ry = ryStart(today);
  const [latest, pending, covers, fbFail, fbLast, fbMonth, ryIssues, allIssues, allArticles] = await Promise.all([
    db.from("rcm_issues").select("id,issue_no,issue_date").eq("status", "published").order("issue_no", { ascending: false }).limit(1),
    db.from("rcm_issues").select("id,issue_no,issue_date,status,publish_at").neq("status", "published").order("issue_no", { ascending: false }).limit(10),
    db.from("rcm_cover").select("month").gte("month", monthStart(today)).order("month"),
    db.from("rcm_fb_posts").select("kind,ref_id,error,attempts,created_at").is("fb_post_id", null).not("error", "is", null).order("created_at", { ascending: false }).limit(5),
    db.from("rcm_fb_posts").select("posted_at").not("posted_at", "is", null).order("posted_at", { ascending: false }).limit(1),
    db.from("rcm_fb_posts").select("kind", { count: "exact", head: true }).gte("posted_at", monthStart(today) + "T00:00:00+08:00"),
    db.from("rcm_issues").select("id").eq("status", "published").gte("issue_date", ry),
    db.from("rcm_issues").select("id", { count: "exact", head: true }).eq("status", "published"),
    db.from("rcm_articles").select("id", { count: "exact", head: true }).eq("included", true),
  ]);
  const ids = (rows(ryIssues) as { id: string }[]).map((x) => x.id);
  const ryArt = ids.length ? await db.from("rcm_articles").select("id", { count: "exact", head: true }).eq("included", true).in("issue_id", ids) : null;
  const last = rows(latest)[0] || null;
  let due: string | null = null;
  if (last?.issue_date) { const d = new Date(last.issue_date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 7); due = d.toISOString().slice(0, 10); }
  const months = (rows(covers) as { month: string }[]).map((c) => c.month.slice(0, 7));
  const done = await posted(["balita"]);
  const viber = last && last.issue_date >= addDays(today, -10) && !done.has("balita|" + last.issue_no) ? [{ kind: "balita", ref: String(last.issue_no), id: last.id, title: `Balita No. ${last.issue_no}`, date: last.issue_date, link: "/balita/" + last.issue_no }] : [];
  return {
    today, viber,
    latest: last, next_due: due,
    pending: rows(pending),
    cover: { this_month: months.includes(today.slice(0, 7)), next_month: months.includes(monthStart(today, 1).slice(0, 7)), next: monthStart(today, 1) },
    facebook: { failed: rows(fbFail), last_post: rows(fbLast)[0]?.posted_at || null, this_month: n(fbMonth) },
    stats: { ry_from: ry, ry_issues: ids.length, ry_stories: n(ryArt), issues: n(allIssues), stories: n(allArticles) },
  };
}

async function secretariat(today: string) {
  const ry = ryStart(today), ryTs = ry + "T00:00:00+08:00";
  const [meet, lastMeet, inqNew, inqList, donNew, donList, donReceipt, events, minute, ryMeet, rySign, ryInq, ryDon] = await Promise.all([
    db.from("rcm_meetings").select("id,meeting_date,label,topic,speaker,venue,time_text,status,rsvp_open,poster_path,rcm_signups(count)").gte("meeting_date", today).order("meeting_date").limit(3),
    db.from("rcm_meetings").select("meeting_date,label,rcm_signups(count)").lt("meeting_date", today).eq("status", "published").order("meeting_date", { ascending: false }).limit(1),
    db.from("rcm_inquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
    db.from("rcm_inquiries").select("id,kind,name,organization,created_at").eq("status", "new").order("created_at").limit(5),
    db.from("rcm_donations").select("id", { count: "exact", head: true }).eq("status", "new"),
    db.from("rcm_donations").select("id,member_name,amount,campaign_title,check_status,created_at").eq("status", "new").order("created_at").limit(5),
    db.from("rcm_donations").select("id", { count: "exact", head: true }).eq("status", "verified"),
    db.from("rcm_events").select("id,slug,title,event_date,status,capacity,rsvp_open,rcm_event_signups(seats)").gte("event_date", today).order("event_date").limit(6),
    db.from("rcm_lib_minutes").select("week,title").eq("status", "published").gte("week", today).order("week").limit(1),
    db.from("rcm_meetings").select("id", { count: "exact", head: true }).eq("status", "published").gte("meeting_date", ry).lte("meeting_date", today),
    db.from("rcm_signups").select("id", { count: "exact", head: true }).gte("created_at", ryTs),
    db.from("rcm_inquiries").select("id", { count: "exact", head: true }).gte("created_at", ryTs),
    db.from("rcm_donations").select("amount,status").gte("created_at", ryTs).in("status", ["verified", "receipt_sent"]),
  ]);
  // deno-lint-ignore no-explicit-any
  const cnt = (m: any, k: string) => m?.[k]?.[0]?.count ?? 0;
  const don = rows(ryDon) as { amount: number }[];
  // To share in the Viber Community: this week's meeting, each new event, and a reminder in the last 3 days before it.
  const done = await posted(["meeting", "event", "event-reminder"]);
  const viber: Record<string, unknown>[] = [];
  for (const m of rows(meet) as { id: string; meeting_date: string; label: string; topic: string; status: string }[])
    if (m.status === "published" && m.meeting_date <= addDays(today, 6) && !done.has("meeting|" + m.meeting_date)) viber.push({ kind: "meeting", ref: m.meeting_date, id: m.id, title: /^no (weekly )?meeting/i.test(m.label || "") ? "No weekly meeting this Thursday" : (m.topic || m.label || "This week's meeting"), date: m.meeting_date, link: "/meetings/" + m.meeting_date });
  for (const e of rows(events) as { slug: string; title: string; event_date: string; status: string }[]) {
    if (e.status !== "published") continue;
    if (!done.has("event|" + e.slug)) viber.push({ kind: "event", ref: e.slug, title: e.title, date: e.event_date, link: "/events/" + e.slug });
    else if (e.event_date <= addDays(today, 3) && !done.has("event-reminder|" + e.slug)) viber.push({ kind: "event-reminder", ref: e.slug, title: e.title, date: e.event_date, link: "/events/" + e.slug });
  }
  return {
    today, viber,
    meetings: (rows(meet) as Record<string, unknown>[]).map((m) => ({ ...m, signups: cnt(m, "rcm_signups"), rcm_signups: undefined })),
    last_meeting: rows(lastMeet)[0] ? { ...rows(lastMeet)[0], signups: cnt(rows(lastMeet)[0], "rcm_signups"), rcm_signups: undefined } : null,
    inquiries: { new: n(inqNew), list: rows(inqList) },
    donations: { new: n(donNew), list: rows(donList), awaiting_receipt: n(donReceipt) },
    events: (rows(events) as Record<string, unknown>[]).map((e) => ({ ...e, seats: ((e.rcm_event_signups as { seats: number }[]) || []).reduce((a, s) => a + (Number(s.seats) || 1), 0), rcm_event_signups: undefined })),
    minute: rows(minute)[0] || null,
    stats: { ry_from: ry, meetings: n(ryMeet), meeting_signups: n(rySign), inquiries: n(ryInq), gifts: don.length, gifts_amount: don.reduce((a, d) => a + (Number(d.amount) || 0), 0) },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const roles = await rolesFor(req.headers.get("x-editor-code"));
  const want = String(body.for || "");
  if (!roles.length) return json({ error: "Wrong passcode." }, 401);
  if (!roles.includes(want)) return json({ error: "This passcode does not open that page." }, 403);
  try {
    const today = manilaToday();
    if (body.action === "viber-posted") {
      const kind = String(body.kind || ""), ref = String(body.ref || "").slice(0, 120);
      const need: Record<string, string> = { meeting: "secretariat", event: "secretariat", "event-reminder": "secretariat", balita: "editor", exhibit: "library" };
      if (!need[kind] || !ref) return json({ error: "Bad request" }, 400);
      if (!roles.includes(need[kind])) return json({ error: "This passcode does not open that page." }, 403);
      const { error } = await db.from("rcm_viber_posts").upsert({ kind, ref, posted_at: new Date().toISOString() });
      if (error) throw error;
      return json({ ok: true });
    }
    if (want === "library") return json(await library(today));
    if (want === "editor") return json(await editor(today));
    if (want === "secretariat") return json(await secretariat(today));
    return json({ error: "Unknown dashboard" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

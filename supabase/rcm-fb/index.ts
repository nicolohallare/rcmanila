import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Posts newly published Balita issues and events to the Club's Facebook Page.
// Called every 15 minutes by pg_cron (job rcm-fb-autopost) with the token in rcm_settings.fb_cron_token.
// Needs Edge Function secrets FB_PAGE_ID and FB_PAGE_TOKEN (a Page access token with pages_manage_posts).
// Off until rcm_settings.fb_autopost = 'on'. Nothing published before rcm_settings.fb_start is ever posted.
const SITE = "https://rcmanila.org";
const GRAPH = "https://graph.facebook.com/v21.0";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });

async function setting(key: string) {
  const { data } = await db.from("rcm_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value || "") as string;
}
const day = (d: string) => new Date(d + "T12:00:00+08:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Manila" });

async function issueMessage(i: { id: string; issue_no: number; issue_date: string | null; guest: string | null }) {
  const { data: arts } = await db.from("rcm_articles").select("title,lead,sort").eq("issue_id", i.id).eq("included", true).order("sort");
  const top = (arts || []).map((a, k) => ({ a, k })).sort((x, y) => (Number(y.a.lead) - Number(x.a.lead)) || x.k - y.k).slice(0, 5);
  const guest = i.guest ? i.guest.split(/[,;(]/)[0].trim() : "";
  const lines = [`📰 Balita No. ${i.issue_no}${i.issue_date ? " · " + day(i.issue_date) : ""}`];
  if (guest) lines.push(`Guest speaker: ${guest}`);
  if (top.length) { lines.push("", "In this issue:"); for (const { a } of top) lines.push(`▸ ${a.title}`); }
  lines.push("", `Read the full issue: ${SITE}/balita/${i.issue_no}`);
  return { message: lines.join("\n"), link: `${SITE}/balita/${i.issue_no}` };
}

function eventMessage(e: { slug: string; title: string; event_date: string | null; time_text: string | null; venue: string | null; summary: string | null }) {
  const when = [e.event_date ? day(e.event_date) : "", e.time_text || ""].filter(Boolean).join(", ");
  const lines = [`📅 ${e.title}`];
  if (when) lines.push(when);
  if (e.venue) lines.push(e.venue);
  if (e.summary) lines.push("", e.summary);
  lines.push("", `Details and sign-up: ${SITE}/events/${e.slug}`);
  return { message: lines.join("\n"), link: `${SITE}/events/${e.slug}` };
}

async function post(kind: string, ref: string, m: { message: string; link: string }) {
  const { data: prev } = await db.from("rcm_fb_posts").select("attempts").eq("kind", kind).eq("ref_id", ref).maybeSingle();
  const attempts = (prev?.attempts || 0) + 1;
  const r = await fetch(`${GRAPH}/${Deno.env.get("FB_PAGE_ID")}/feed`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ message: m.message, link: m.link, access_token: Deno.env.get("FB_PAGE_TOKEN")! }),
  });
  const j = await r.json().catch(() => ({}));
  const row = r.ok && j.id
    ? { kind, ref_id: ref, fb_post_id: j.id, attempts, error: null, posted_at: new Date().toISOString() }
    : { kind, ref_id: ref, fb_post_id: null, attempts, error: String(j?.error?.message || r.status).slice(0, 300), posted_at: null };
  await db.from("rcm_fb_posts").upsert(row);
  return { kind, link: m.link, ok: !!row.fb_post_id, error: row.error };
}

Deno.serve(async (req) => {
  const b = await req.json().catch(() => ({}));
  const tok = await setting("fb_cron_token");
  if (!tok || b.token !== tok) return json({ error: "not allowed" }, 403);
  const configured = !!(Deno.env.get("FB_PAGE_ID") && Deno.env.get("FB_PAGE_TOKEN"));

  if (b.action === "test") {
    if (!configured) return json({ configured: false });
    const r = await fetch(`${GRAPH}/${Deno.env.get("FB_PAGE_ID")}?fields=name,link&access_token=${encodeURIComponent(Deno.env.get("FB_PAGE_TOKEN")!)}`);
    const j = await r.json().catch(() => ({}));
    const d = await fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(Deno.env.get("FB_PAGE_TOKEN")!)}&access_token=${encodeURIComponent(Deno.env.get("FB_PAGE_TOKEN")!)}`).then((x) => x.json()).catch(() => ({}));
    return json({ configured: true, ok: r.ok, page: j.name, link: j.link, error: j?.error?.message, token_type: d?.data?.type, expires: d?.data?.expires_at, scopes: d?.data?.scopes, autopost: await setting("fb_autopost") });
  }

  if (!configured || (await setting("fb_autopost")) !== "on") return json({ skipped: true, configured });
  const start = (await setting("fb_start")) || new Date().toISOString();
  const now = new Date().toISOString();
  const { data: done } = await db.from("rcm_fb_posts").select("kind,ref_id,fb_post_id,attempts");
  const skip = new Set((done || []).filter((d) => d.fb_post_id || d.attempts >= 3).map((d) => d.kind + d.ref_id));
  const out = [];

  const { data: iss } = await db.from("rcm_issues").select("id,issue_no,issue_date,guest,publish_at,updated_at,source")
    .eq("status", "published").gte("publish_at", start).lte("publish_at", now)
    // back issues added later are never posted: only issues dated within the last 14 days
    .gte("issue_date", new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)).order("publish_at").limit(5);
  for (const i of iss || []) {
    if (skip.has("issue" + i.id) || out.length >= 2) continue;
    out.push(await post("issue", i.id, await issueMessage(i)));
  }
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const { data: evs } = await db.from("rcm_events").select("id,slug,title,event_date,time_text,venue,summary,created_at")
    .eq("status", "published").gte("created_at", start).gte("event_date", today).order("created_at").limit(5);
  for (const e of evs || []) {
    if (skip.has("event" + e.id) || out.length >= 2) continue;
    out.push(post("event", e.id, eventMessage(e)));
  }
  return json({ posted: await Promise.all(out) });
});

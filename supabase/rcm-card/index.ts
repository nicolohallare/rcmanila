import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import satori from "npm:satori@0.10.14";
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";

// Facebook picture cards (1080 x 1350) in the Club's blue and gold, drawn from the website's data.
// GET ?k=story|issue|meeting|history|event|event-reminder&id=<article id | issue id | meeting date | minute week | event id>
// Public and read-only: it only draws what the website already shows. Facebook fetches these when a queued post goes out.
const SITE = "https://rcmanila.org";
const SB = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

// deno-lint-ignore no-explicit-any
type El = any;
const NAVY = "#17458f", DEEP = "#0f2f66", GOLD = "#f7a81b", PALE = "#cfe0f5";
const h = (type: string, style: Record<string, unknown>, ...kids: El[]): El => { const children = kids.filter((k) => k !== null && k !== undefined && k !== false); return { type, props: { style, children: children.length <= 1 ? children[0] : children } }; };
const img = (src: string, style: { width: number; height: number; [k: string]: unknown }): El => ({ type: "img", props: { src, width: style.width, height: style.height, style } });
const clip = (s: unknown, n: number) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t; };

type Card = { kicker: string; title: string; sub?: string; image?: string | null; portrait?: boolean; foot?: string; logo: string; mode?: "photo" | "text" };
function cardElement(d: Card): El {
  const photo = !!d.image && d.mode !== "text";
  const title = clip(d.title, photo ? 90 : 120);
  const tsize = photo ? (title.length > 60 ? 54 : 64) : (title.length > 80 ? 80 : title.length > 45 ? 92 : 108);
  const top = photo
    ? h("div", { display: "flex", width: 1080, height: 700, justifyContent: "center", background: DEEP },
        d.portrait ? img(d.image!, { width: 540, height: 700, objectFit: "cover" }) : img(d.image!, { width: 1080, height: 700, objectFit: "cover" }))
    : h("div", { display: "flex", width: 1080, height: 120, background: NAVY });
  const body = h("div", { display: "flex", flexDirection: "column", flex: 1, padding: photo ? "46px 70px 0" : "40px 80px 0", justifyContent: photo ? "flex-start" : "center" },
    h("div", { display: "flex", color: GOLD, fontFamily: "Inter", fontWeight: 800, fontSize: 26, letterSpacing: 4, textTransform: "uppercase", marginBottom: 22 }, clip(d.kicker, 60)),
    h("div", { display: "flex", color: "#ffffff", fontFamily: "Caladea", fontWeight: 700, fontSize: tsize, lineHeight: 1.08 }, title),
    d.sub ? h("div", { display: "flex", color: PALE, fontFamily: "Inter", fontWeight: 600, fontSize: photo ? 30 : 38, lineHeight: 1.38, marginTop: photo ? 24 : 40 }, clip(d.sub, photo ? 130 : 200)) : null);
  const foot = h("div", { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 70px", height: 128, borderTop: "2px solid rgba(255,255,255,0.18)" },
    img(d.logo, { height: 70, width: 197 }),
    h("div", { display: "flex", color: GOLD, fontFamily: "Inter", fontWeight: 800, fontSize: 30 }, d.foot || "rcmanila.org"));
  return h("div", { display: "flex", flexDirection: "column", width: 1080, height: 1350, background: NAVY },
    top, h("div", { display: "flex", width: 1080, height: 10, background: GOLD }), body, foot);
}

// Fonts and logo are served by the website; kept for the life of the worker, with the PNG renderer.
let assets: Promise<{ fonts: unknown[]; logo: string }> | null = null;
let wasm: Promise<void> | null = null;
const ready = () => wasm ||= fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm").then((r) => r.arrayBuffer()).then((b) => initWasm(b)).catch((e) => { wasm = null; throw e; });
const b64 = (buf: ArrayBuffer | Uint8Array) => { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
function loadAssets() {
  if (!assets) assets = (async () => {
    const get = (p: string) => fetch(SITE + p).then((r) => { if (!r.ok) throw new Error(p + " " + r.status); return r.arrayBuffer(); });
    const [cal, int6, int8, logo] = await Promise.all([get("/assets/fonts/Caladea-Bold.ttf"), get("/assets/fonts/Inter-SemiBold.otf"), get("/assets/fonts/Inter-ExtraBold.otf"), get("/assets/club-logo-white.png")]);
    return {
      fonts: [{ name: "Caladea", data: cal, weight: 700, style: "normal" }, { name: "Inter", data: int6, weight: 600, style: "normal" }, { name: "Inter", data: int8, weight: 800, style: "normal" }],
      logo: "data:image/png;base64," + b64(logo),
    };
  })().catch((e) => { assets = null; throw e; });
  return assets;
}

// A storage photo, resized by Supabase and kept as JPEG, as a data URI (or null).
async function photo(path: string | null | undefined, w = 1080, hgt = 700) {
  if (!path) return null;
  const url = path.startsWith("/") ? SITE + path
    : `${SB}/storage/v1/render/image/public/rcm/${path.split("/").map(encodeURIComponent).join("/")}?width=${w}&height=${hgt}&resize=cover&quality=82&format=origin`;
  try {
    const r = await fetch(url, { headers: { accept: "image/jpeg,image/png" } });
    if (!r.ok) return null;
    const type = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!/jpe?g|png/.test(type)) return null;
    return `data:${type};base64,` + b64(await r.arrayBuffer());
  } catch { return null; }
}

const day = (d: string, o: Intl.DateTimeFormatOptions = {}) => new Date(d + "T12:00:00+08:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Asia/Manila", ...o });
// The best photo of a story: the widest landscape one, else the largest portrait one.
type Ph = { path: string; width?: number; height?: number; include?: boolean };
function bestPhoto(photos: unknown): { path: string; portrait: boolean } | null {
  const list = (Array.isArray(photos) ? photos : []).filter((x: Ph) => x && x.path && x.include !== false) as Ph[];
  if (!list.length) return null;
  const land = list.filter((x) => (x.width || 0) >= (x.height || 0) * 0.95).sort((a, b) => (b.width || 0) - (a.width || 0));
  if (land.length && (land[0].width || 0) >= 300) return { path: land[0].path, portrait: false };
  const all = [...list].sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
  const p = all[0];
  return { path: p.path, portrait: (p.height || 0) > (p.width || 0) * 1.05 };
}
async function picture(p: { path: string; portrait: boolean } | null) {
  if (!p) return { image: null, portrait: false };
  return { image: await photo(p.path, p.portrait ? 540 : 1080, 700), portrait: p.portrait };
}

async function build(k: string, id: string, logo: string): Promise<Card | null> {
  if (k === "story") {
    const { data: a } = await db.from("rcm_articles").select("title,dek,kicker,photos").eq("id", id).maybeSingle();
    if (!a) return null;
    return { kicker: "Balita · " + (a.kicker || "Story"), title: a.title, sub: a.dek || "", ...(await picture(bestPhoto(a.photos))), logo, foot: "Read it at rcmanila.org" };
  }
  if (k === "issue") {
    const { data: i } = await db.from("rcm_issues").select("id,issue_no,issue_date,cover_path").eq("id", id).maybeSingle();
    if (!i) return null;
    const { data: arts } = await db.from("rcm_articles").select("title,dek,kicker,lead,sort,photos").eq("issue_id", i.id).eq("included", true).order("sort");
    const list = arts || [];
    const lead = list.find((a) => a.lead && bestPhoto(a.photos)) || list.find((a) => a.lead) || list.find((a) => bestPhoto(a.photos)) || list[0];
    const more = Math.max(0, list.length - 1);
    return { kicker: `Balita No. ${i.issue_no}${i.issue_date ? " · " + day(i.issue_date, { year: "numeric" }) : ""}`, title: lead?.title || `Balita No. ${i.issue_no}`, sub: [lead?.kicker === "Guest speaker" && lead?.dek ? clip(lead.dek, 70) : "", more ? `Plus ${more} more ${more === 1 ? "story" : "stories"} in this week’s issue` : ""].filter(Boolean).join(" · "), ...(await picture(bestPhoto(lead?.photos) || (i.cover_path ? { path: i.cover_path, portrait: true } : null))), logo, foot: "rcmanila.org/balita" };
  }
  if (k === "meeting") {
    const { data: m } = await db.from("rcm_meetings").select("meeting_date,label,topic,speaker,speaker_title,time_text,venue").eq("meeting_date", id).maybeSingle();
    if (!m) return null;
    const title = m.speaker && m.topic ? `${m.speaker} on ${m.topic}` : (m.topic || m.speaker || m.label || "Weekly meeting");
    const sub = [[m.time_text, m.venue].filter(Boolean).join(" · "), "Members and guests welcome."].filter(Boolean).join(". ").replace(/\.\./g, ".");
    return { kicker: "Weekly meeting · " + day(m.meeting_date, { weekday: "long" }), title, sub, mode: "text", logo, foot: "Sign up at rcmanila.org/meeting" };
  }
  if (k === "history") {
    const { data: n } = await db.from("rcm_lib_minutes").select("week,title,script").eq("week", id).maybeSingle();
    if (!n) return null;
    const year = (String(n.title).match(/(1[89]\d\d|20\d\d)\s*$/) || [])[1];
    const t = String(n.title).replace(/,\s*(1[89]\d\d|20\d\d)\s*$/, "");
    const first = String(n.script || "").split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
    return { kicker: "This week in Club history" + (year ? " · " + year : ""), title: t, sub: first, mode: "text", logo, foot: "Heritage Library · rcmanila.org" };
  }
  if (k === "event" || k === "event-reminder") {
    const { data: e } = await db.from("rcm_events").select("title,event_date,time_text,venue,summary,poster_path").eq("id", id).maybeSingle();
    if (!e) return null;
    const when = e.event_date ? day(e.event_date, { weekday: "long" }) : "";
    // Events with a poster post the poster itself; this text card is for events without one.
    return { kicker: (k === "event-reminder" ? "Coming up · " : "Event · ") + when, title: e.title, sub: [e.time_text, e.venue].filter(Boolean).join(" · "), mode: "text", logo, foot: "Details and sign-up: rcmanila.org" };
  }
  return null;
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const k = u.searchParams.get("k") || "", id = u.searchParams.get("id") || "";
  try {
    const [a] = await Promise.all([loadAssets(), ready()]);
    const card = await build(k, id, a.logo);
    if (!card) return new Response("Not found", { status: 404 });
    const svg = await satori(cardElement(card), { width: 1080, height: 1350, fonts: a.fonts as never });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: 1080 } }).render().asPng();
    if (u.searchParams.get("b64")) return new Response(b64(png), { headers: { "content-type": "text/plain" } }); // for checking
    return new Response(png, { headers: { "content-type": "image/png", "cache-control": "public, max-age=600" } });
  } catch (e) {
    return new Response("Card error: " + String((e as Error)?.message || e), { status: 500 });
  }
});

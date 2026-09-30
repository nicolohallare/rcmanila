import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Picks the photo shown on each Balita story card: a clean, clear photograph (any orientation),
// not a graphic, poster, collage, logo or a scan with text. Editor passcode, or a one-time backfill token.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-editor-code, authorization, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const URL_ = Deno.env.get("SUPABASE_URL")!;
const db = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const SELF = URL_ + "/functions/v1/rcm-thumbs";

async function setting(key: string) {
  const { data } = await db.from("rcm_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value || "") as string;
}
function b64(buf: ArrayBuffer) { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }

type Photo = { id?: string; path: string; width?: number; height?: number; include?: boolean; thumb?: boolean; caption?: string };
const PROMPT = `These are candidate photos from one story in the Rotary Club of Manila's weekly newsletter. One will be shown as the small picture on the story's card on the website.
Pick the most attractive card photo: a clean, real photograph with a clear subject (people's faces visible if it shows people), in focus, well lit, not a collage of several photos, not a poster, flyer, logo, certificate, chart, map or graphic, and without large printed text or page borders on it. Portrait or landscape are both fine.
Reply with JSON only: {"best": the number of the best photo, or 0 if none is suitable}`;

async function pick(photos: Photo[]): Promise<number> {
  const cand = photos.map((p, i) => ({ p, i })).filter(({ p }) => p.include !== false && (p.width || 0) >= 260 && (p.height || 0) >= 180)
    .sort((a, b) => (b.p.width! * b.p.height!) - (a.p.width! * a.p.height!)).slice(0, 5);
  if (!cand.length) return -1;
  if (cand.length === 1) return cand[0].i;
  const content: unknown[] = [];
  for (let k = 0; k < cand.length; k++) {
    const r = await fetch(`${URL_}/storage/v1/render/image/public/rcm/${cand[k].p.path}?width=420&quality=70`);
    if (!r.ok) continue;
    content.push({ type: "text", text: `Photo ${k + 1}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64(await r.arrayBuffer()) } });
  }
  content.push({ type: "text", text: PROMPT });
  for (let a = 0; a < 3; a++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 60, messages: [{ role: "user", content }] }) });
    if (r.ok) {
      const t = ((await r.json()).content || []).map((c: { text?: string }) => c.text || "").join("");
      const m = t.match(/"best"\s*:\s*(\d+)/);
      const n = m ? Number(m[1]) : 0;
      return n >= 1 && n <= cand.length ? cand[n - 1].i : cand[0].i;
    }
    if (![429, 500, 502, 503, 529].includes(r.status)) break;
    await new Promise((res) => setTimeout(res, 3000 * (a + 1)));
  }
  return cand[0].i;
}

async function doArticles(rows: { id: string; photos: Photo[] | null }[]) {
  let n = 0;
  for (const a of rows) {
    const photos = Array.isArray(a.photos) ? a.photos : [];
    if (!photos.length) continue;
    const i = await pick(photos);
    const next = photos.map((p, k) => { const q = { ...p }; delete q.thumb; if (k === i) q.thumb = true; return q; });
    await db.from("rcm_articles").update({ photos: next }).eq("id", a.id);
    n++;
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  try {
    if (body.action === "issue") {
      const code = req.headers.get("x-editor-code") || "";
      const ed = await setting("editor_code");
      if (!code || code.length < 6 || code !== ed) return json({ error: "Wrong passcode." }, 401);
      const { data } = await db.from("rcm_articles").select("id,photos").eq("issue_id", String(body.issue_id)).eq("included", true);
      return json({ done: await doArticles(data || []) });
    }
    if (body.action === "backfill") {
      const tok = await setting("thumbs_backfill_token");
      if (!tok || body.token !== tok) return json({ error: "No." }, 401);
      const after = String(body.after || "00000000-0000-0000-0000-000000000000");
      const { data } = await db.from("rcm_articles").select("id,photos").eq("included", true).gt("id", after).order("id").limit(6);
      const rows = data || [];
      const n = await doArticles(rows);
      await db.from("rcm_settings").upsert({ key: "thumbs_backfill_progress", value: `${rows.length ? rows[rows.length - 1].id : "done"} ${new Date().toISOString()}` });
      if (rows.length === 6) {
        const p = fetch(SELF, { method: "POST", headers: { "Content-Type": "application/json", Authorization: req.headers.get("authorization") || "" }, body: JSON.stringify({ action: "backfill", token: tok, after: rows[rows.length - 1].id }) }).catch(() => {});
        // @ts-ignore EdgeRuntime is available on Supabase
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
      }
      return json({ done: n });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

// Makes a clean card picture for each Balita story: picks the best photograph and crops it to the
// photograph alone (no page text, captions, borders, logos or headline art). Any shape is kept.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-editor-code, authorization, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const URL_ = Deno.env.get("SUPABASE_URL")!;
const db = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const SELF = URL_ + "/functions/v1/rcm-thumbs";
const PUB = (p: string) => `${URL_}/storage/v1/object/public/rcm/${p}`;

async function setting(key: string) {
  const { data } = await db.from("rcm_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value || "") as string;
}
function b64(u: Uint8Array) { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }

const DBG: string[] = [];
type Card = { path: string; width: number; height: number };
type Photo = { id?: string; path: string; width?: number; height?: number; include?: boolean; thumb?: boolean; card?: Card | null; caption?: string };

const task = (sizes: string) => `These are photos taken from one story in the Rotary Club of Manila's weekly newsletter (${sizes}). Many were cut from the printed page and may include parts of the page around the photograph: printed text, captions, headlines, page borders, colour bars, logos.
Choose the ONE photo that will make the cleanest, most attractive picture for the story's card on the website: a real photograph, sharp, with a clear subject (faces visible if it shows people). Never choose posters, flyers, logos, certificates, charts, graphics, collages, presentation slides, or photos of screens or TVs showing text.
Then give a crop box on that photo that keeps ONLY the photograph itself: no printed text, captions, headline lettering, borders, colour bars or page background inside the box, and no text laid over the picture. If a headline is printed over one side of the picture, crop to the side without it. Frame the subject well, with a little space above heads; keep people whole from the chest up where possible. The box may be landscape, square or portrait (width/height between 0.7 and 1.6).
Coordinates are pixels of the image as shown to you. Reply with JSON only:
{"best": photo number, or 0 if no photo can give a clean picture, "box": [left, top, right, bottom]}`;

const CHECK = (w: number, h: number) => `This picture (${w}×${h} px) will be the photo on a story card on a website. It must be a clean photograph only.
Look at every edge and corner. Is there ANY printed text, caption, headline lettering, logo, page border, coloured bar, page background, or is it a presentation slide, poster or a TV/screen showing text?
Reply with JSON only. If it is clean: {"clean": true}. If not, but a clean photograph can be cut from it: {"clean": false, "box": [left, top, right, bottom]} (pixels of this picture, keeping the main subject, with a little space above heads). If no clean photograph can be cut from it: {"clean": false, "box": null}`;

async function renderSmall(path: string) {
  const r = await fetch(`${URL_}/storage/v1/render/image/public/rcm/${path}?width=640&quality=75&format=origin`);
  if (!r.ok) return null;
  const buf = new Uint8Array(await r.arrayBuffer());
  const im = await Image.decode(buf);
  return { buf, w: im.width, h: im.height };
}

async function ask(content: unknown[]) {
  for (let a = 0; a < 3; a++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1500, messages: [{ role: "user", content }] }) });
    if (r.ok) {
      const jj = await r.json();
      const t = (jj.content || []).map((c: { text?: string }) => c.text || "").join("");
      if (!t.trim()) DBG.push('empty ' + jj.stop_reason + ' ' + JSON.stringify(jj.content || []).slice(0, 120));
      const s = t.indexOf("{"), e = t.lastIndexOf("}");
      try { return JSON.parse(t.slice(s, e + 1)); } catch { if (t.trim()) DBG.push('raw ' + t.slice(0, 200)); return null; }
    }
    if (![429, 500, 502, 503, 529].includes(r.status)) { DBG.push('ai ' + r.status + ' ' + (await r.text()).slice(0, 150)); return null; }
    DBG.push('retry ' + r.status);
    await new Promise((res) => setTimeout(res, 3000 * (a + 1)));
  }
  return null;
}

// Returns the new photos array with thumb/card set on the chosen photo (card null = no clean picture).
async function makeCard(issueNo: number, articleId: string, photos: Photo[]) {
  const cand = photos.map((p, i) => ({ p, i })).filter(({ p }) => p.include !== false && (p.width || 0) >= 220 && (p.height || 0) >= 180)
    .sort((a, b) => (b.p.width! * b.p.height!) - (a.p.width! * a.p.height!)).slice(0, 5);
  const clear = photos.map((p) => { const q = { ...p }; delete q.thumb; delete q.card; return q; });
  if (!cand.length) return clear;
  const shown: { i: number; w: number; h: number }[] = [];
  const content: unknown[] = [];
  for (const c of cand) {
    const s = await renderSmall(c.p.path).catch((e) => { DBG.push('render ' + String(e).slice(0, 80)); return null; });
    if (!s) continue;
    shown.push({ i: c.i, w: s.w, h: s.h });
    content.push({ type: "text", text: `Photo ${shown.length} (${s.w}×${s.h} px):` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64(s.buf) } });
  }
  if (!shown.length) return clear;
  content.push({ type: "text", text: task(`${shown.length} photo${shown.length > 1 ? "s" : ""}`) });
  const ans = await ask(content);
  DBG.push('ans ' + JSON.stringify(ans).slice(0, 120));
  const n = Number(ans?.best || 0);
  if (!(n >= 1 && n <= shown.length) || !Array.isArray(ans?.box)) { return clear; }
  const pick = shown[n - 1];
  let [l, t, r, b] = ans.box.map(Number);
  l = Math.max(0, l); t = Math.max(0, t); r = Math.min(pick.w, r); b = Math.min(pick.h, b);
  if (!(r - l > 60 && b - t > 60)) return clear;
  const p = photos[pick.i];
  // A 1600px render is plenty for a card and keeps memory low (full-size originals can exhaust the worker).
  const orig = await fetch(`${URL_}/storage/v1/render/image/public/rcm/${p.path}?width=1600&quality=90&format=origin`);
  if (!orig.ok) return clear;
  const im = await Image.decode(new Uint8Array(await orig.arrayBuffer()));
  const k = im.width / pick.w;
  const X = Math.round(l * k), Y = Math.round(t * k), W = Math.round((r - l) * k), H = Math.round((b - t) * k);
  let out = im.crop(X, Y, Math.min(W, im.width - X), Math.min(H, im.height - Y));
  // Second look: the AI checks the crop itself and tightens it, or rejects it if text or borders remain.
  for (let pass = 0; pass < 2; pass++) {
    const prev = out.clone(); if (prev.width > 640) prev.resize(640, Image.RESIZE_AUTO);
    const pj = await prev.encodeJPEG(80);
    const v = await ask([{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64(pj) } }, { type: "text", text: CHECK(prev.width, prev.height) }]);
    DBG.push('chk ' + JSON.stringify(v).slice(0, 80));
    if (!v) break;
    if (v.clean === true) break;
    if (!Array.isArray(v.box)) return clear;
    let [a2, b2, c2, d2] = v.box.map(Number); const kk = out.width / prev.width;
    a2 = Math.max(0, a2); b2 = Math.max(0, b2); c2 = Math.min(prev.width, c2); d2 = Math.min(prev.height, d2);
    if (!(c2 - a2 > 50 && d2 - b2 > 50)) return clear;
    out = out.crop(Math.round(a2 * kk), Math.round(b2 * kk), Math.round((c2 - a2) * kk), Math.round((d2 - b2) * kk));
  }
  if (out.width < 260 || out.height < 200) { DBG.push('small ' + out.width + 'x' + out.height); return clear; }
  const rr = out.width / out.height;
  if (rr > 1.7) out = out.crop(Math.round((out.width - out.height * 1.7) / 2), 0, Math.round(out.height * 1.7), out.height);
  else if (rr < 0.66) out = out.crop(0, 0, out.width, Math.round(out.width / 0.66));
  if (out.width > 900) out.resize(900, Image.RESIZE_AUTO);
  const jpg = await out.encodeJPEG(84);
  const path = `issues/${issueNo}/photos/card-${articleId.slice(0, 8)}-${Date.now().toString(36)}.jpg`;
  const { error } = await db.storage.from("rcm").upload(path, jpg, { upsert: true, contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) { DBG.push('upload ' + error.message); return clear; }
  clear[pick.i].thumb = true;
  clear[pick.i].card = { path, width: out.width, height: out.height };
  return clear;
}

async function doArticles(rows: { id: string; photos: Photo[] | null; rcm_issues: { issue_no: number } | null }[]) {
  let n = 0;
  for (const a of rows) {
    const photos = Array.isArray(a.photos) ? a.photos : [];
    if (!photos.length || !a.rcm_issues) continue;
    if (photos.some((x) => x.card && (x.card as Card & { manual?: boolean }).manual)) continue;   // the editor cropped this story's photo by hand: keep it
    try {
      const next = await makeCard(a.rcm_issues.issue_no, a.id, photos);
      await db.from("rcm_articles").update({ photos: next }).eq("id", a.id);
      n++;
    } catch (e) { DBG.push('err ' + String(e).slice(0, 120)); }
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  try {
    const sel = "id,photos,rcm_issues(issue_no)";
    // Editor button: checks the passcode, then works through the issue's stories in the background,
    // one story per call (a whole issue in one call runs out of worker memory/time: error 546).
    if (body.action === "issue" || body.action === "status") {
      const code = req.headers.get("x-editor-code") || "";
      const ed = await setting("editor_code");
      if (!code || code.length < 6 || code !== ed) return json({ error: "Wrong passcode." }, 401);
      const iid = String(body.issue_id || "");
      const key = "thumbs_run_" + iid;
      if (body.action === "status") { const v = await setting(key); return json(v ? JSON.parse(v) : { total: 0, done: 0, finished: true }); }
      const { data } = await db.from("rcm_articles").select("id,photos").eq("issue_id", iid).eq("included", true).order("id");
      const ids = (data || []).filter((a: any) => Array.isArray(a.photos) && a.photos.length).map((a: any) => a.id);
      const run = crypto.randomUUID();
      await db.from("rcm_settings").upsert({ key, value: JSON.stringify({ run, total: ids.length, done: 0, cards: 0, finished: !ids.length, at: new Date().toISOString() }) });
      if (ids.length) {
        const p = fetch(SELF, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "step", issue_id: iid, run, token: await setting("thumbs_backfill_token") }) }).catch(() => {});
        // @ts-ignore EdgeRuntime is available on Supabase
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
      }
      return json({ started: ids.length });
    }
    if (body.action === "step") {
      const tok = await setting("thumbs_backfill_token");
      if (!tok || body.token !== tok) return json({ error: "No." }, 401);
      const key = "thumbs_run_" + String(body.issue_id);
      const st = JSON.parse((await setting(key)) || "{}");
      if (st.run !== body.run || st.finished) return json({ stale: true });   // a newer run replaced this one
      let q = db.from("rcm_articles").select(sel).eq("issue_id", String(body.issue_id)).eq("included", true).order("id").limit(1);
      if (body.after) q = q.gt("id", String(body.after));
      const { data } = await q;
      const rows = ((data || []) as any[]);
      const row = rows[0];
      if (row && Array.isArray(row.photos) && row.photos.length) {
        await doArticles([row]);
        const { data: fresh } = await db.from("rcm_articles").select("photos").eq("id", row.id).maybeSingle();
        st.done++; if ((fresh?.photos || []).some((x: Photo) => x.card)) st.cards++;
      }
      st.finished = !row; st.at = new Date().toISOString();
      const cur = JSON.parse((await setting(key)) || "{}");
      if (cur.run !== body.run) return json({ stale: true });
      await db.from("rcm_settings").upsert({ key, value: JSON.stringify(st) });
      if (row) {
        const p = fetch(SELF, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, after: row.id }) }).catch(() => {});
        // @ts-ignore EdgeRuntime is available on Supabase
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
      }
      return json({ ok: true });
    }
    if (body.action === "backfill") {
      const tok = await setting("thumbs_backfill_token");
      if (!tok || body.token !== tok) return json({ error: "No." }, 401);
      let q = db.from("rcm_articles").select(sel).eq("included", true).order("id").limit(3);
      if (body.after) q = q.gt("id", String(body.after));
      if (body.issue_nos) {
        const { data: iss } = await db.from("rcm_issues").select("id").in("issue_no", body.issue_nos);
        q = q.in("issue_id", (iss || []).map((x: { id: string }) => x.id));
      }
      const { data } = await q;
      const rows = (data || []) as any[];
      const n = await doArticles(rows);
      await db.from("rcm_settings").upsert({ key: "thumbs_debug", value: DBG.slice(-12).join(" | ") });
      await db.from("rcm_settings").upsert({ key: "thumbs_backfill_progress", value: `${rows.length ? rows[rows.length - 1].id : "done"} ${new Date().toISOString()}` });
      if (rows.length === 3 && !body.once) {
        const p = fetch(SELF, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, after: rows[rows.length - 1].id }) }).catch(() => {});
        // @ts-ignore EdgeRuntime is available on Supabase
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
      }
      return json({ done: n });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
});

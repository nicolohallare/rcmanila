// One-off helper: copies files from the old rcmanila.org into the "rcm" storage bucket.
// Works through the rcm_legacy_files queue a few files at a time and chains itself until done.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SELF = Deno.env.get("SUPABASE_URL") + "/functions/v1/rcm-legacy-copy";
const MAX = 49 * 1024 * 1024;

function size(b: Uint8Array): [number, number] | null {
  if (b[0] === 0x89 && b[1] === 0x50) { const v = new DataView(b.buffer, b.byteOffset); return [v.getUint32(16), v.getUint32(20)]; }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
      i += 2 + len;
    }
  }
  if (b[8] === 0x57 && b[9] === 0x45) { // WEBP VP8X / VP8 / VP8L
    const t = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (t === "VP8X") return [1 + (b[24] | b[25] << 8 | b[26] << 16), 1 + (b[27] | b[28] << 8 | b[29] << 16)];
    if (t === "VP8 ") return [(b[26] | b[27] << 8) & 0x3fff, (b[28] | b[29] << 8) & 0x3fff];
    if (t === "VP8L") { const n = b[21] | b[22] << 8 | b[23] << 16 | b[24] << 24; return [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)]; }
  }
  return null;
}
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", pdf: "application/pdf" };

async function work(n: number, chain: boolean, code: string, lo = 0, hi = 1e12) {
  const { data: rows } = await db.from("rcm_legacy_files").select("id,from_url,to_path,tries").eq("done", false).lt("tries", 3).gte("id", lo).lt("id", hi).order("id").limit(n);
  for (const r of rows || []) {
    try {
      const res = await fetch(r.from_url, { headers: { "User-Agent": "Mozilla/5.0 (rcmanila migration)" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const len = Number(res.headers.get("content-length") || 0);
      if (len > MAX) throw new Error("too big " + len);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length > MAX) throw new Error("too big " + buf.length);
      const ext = (r.to_path.split(".").pop() || "").toLowerCase();
      const { error } = await db.storage.from("rcm").upload(r.to_path, buf, { upsert: true, contentType: TYPES[ext] || "application/octet-stream", cacheControl: "31536000" });
      if (error) throw error;
      const wh = ext === "pdf" ? null : size(buf);
      await db.from("rcm_legacy_files").update({ done: true, error: null, bytes: buf.length, width: wh?.[0] ?? null, height: wh?.[1] ?? null }).eq("id", r.id);
    } catch (e) {
      await db.from("rcm_legacy_files").update({ tries: r.tries + 1, error: String((e as Error).message || e).slice(0, 300) }).eq("id", r.id);
    }
  }
  if (chain && rows && rows.length) {
    await fetch(SELF, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, n, chain, lo, hi }) }).catch(() => {});
  }
}

// Loads the old website's Balita issues and articles from a JSON file prepared from the WordPress backup.
async function importIssues(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch " + res.status);
  const list = await res.json();
  const PUB = Deno.env.get("SUPABASE_URL") + "/storage/v1/object/public/rcm/";
  const log: string[] = [];
  for (const it of list) {
    const { data: ex } = await db.from("rcm_issues").select("id,source").eq("issue_no", it.issue_no).maybeSingle();
    if (ex && ex.source !== "legacy") { log.push(it.issue_no + " skipped (already uploaded)"); continue; }
    const at = it.issue_date ? new Date(it.issue_date + "T12:00:00+08:00").toISOString() : new Date().toISOString();
    const row = {
      issue_no: it.issue_no, issue_date: it.issue_date, guest: it.guest || null, cover_path: it.cover_path || null,
      pdf_url: it.pdf_url ? (String(it.pdf_url).startsWith("STORAGE:") ? PUB + String(it.pdf_url).slice(8) : it.pdf_url) : null,
      search_text: it.search_text || null, status: "published", publish_at: at, source: "legacy", updated_at: new Date().toISOString(),
    };
    const { data: iss, error } = await db.from("rcm_issues").upsert(row, { onConflict: "issue_no" }).select("id").single();
    if (error) { log.push(it.issue_no + " " + error.message); continue; }
    await db.from("rcm_articles").delete().eq("issue_id", iss.id).eq("source", "legacy");
    const arts = (it.articles || []).map((a: Record<string, unknown>) => ({
      issue_id: iss.id, sort: a.sort, slug: a.slug, kicker: a.kicker || "Balita", title: a.title, dek: a.dek || null, byline: a.byline || null,
      body: a.body || [], photos: a.photos || [], lead: !!a.lead, included: true, checked: true, source: "legacy", legacy_url: a.legacy_url || null,
    }));
    if (arts.length) { const r = await db.from("rcm_articles").insert(arts); if (r.error) log.push(it.issue_no + " articles " + r.error.message); }
    const files = (it.files || []).map((f: { from: string; to: string }) => ({ from_url: f.from, to_path: f.to }));
    for (let i = 0; i < files.length; i += 200) await db.from("rcm_legacy_files").upsert(files.slice(i, i + 200), { onConflict: "from_url", ignoreDuplicates: true });
    log.push(it.issue_no + " ok " + arts.length);
  }
  await db.from("rcm_settings").upsert({ key: "legacy_import_log", value: log.join("\n") }, { onConflict: "key" });
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, apikey, authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const body = await req.json().catch(() => ({}));
  const { data } = await db.from("rcm_settings").select("value").eq("key", "editor_code").single();
  if (!data || body.code !== data.value) return new Response(JSON.stringify({ error: "no" }), { status: 401, headers: CORS });
  // Page text + photo list of a back issue, saved by the editor page so the articles can be written separately.
  if (body.manifest) {
    const m = body.manifest;
    const { error } = await db.from("rcm_legacy_manifest").upsert({ issue_no: Number(m.issue_no), data: m, articles_done: false }, { onConflict: "issue_no" });
    return new Response(JSON.stringify(error ? { error: error.message } : { ok: true }), { status: error ? 500 : 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }
  if (body.import_url) {
    EdgeRuntime.waitUntil(importIssues(String(body.import_url)).catch((e) =>
      db.from("rcm_settings").upsert({ key: "legacy_import_log", value: "FAILED " + String(e) }, { onConflict: "key" })));
    return new Response(JSON.stringify({ importing: true }), { headers: { "Content-Type": "application/json" } });
  }
  const n = Math.min(Number(body.n) || 6, 20);
  EdgeRuntime.waitUntil(work(n, !!body.chain, body.code, Number(body.lo) || 0, Number(body.hi) || 1e12));
  const { count } = await db.from("rcm_legacy_files").select("id", { count: "exact", head: true }).eq("done", false).lt("tries", 3);
  return new Response(JSON.stringify({ started: true, remaining: count }), { headers: { "Content-Type": "application/json" } });
});

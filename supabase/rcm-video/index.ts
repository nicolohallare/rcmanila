import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1.0.20";

// Heritage Library Video room: list and edit the videos, and copy a video from the private archive to the public library
// (inside the storage, so nothing is downloaded). Opens with the editor's or the librarian's passcode.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-editor-code, authorization, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const SOURCE = "rcm-archive", PUBLIC = "rcm-library";
const TYPES: Record<string, string> = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

let codes: string[] | null = null, codesAt = 0;
async function allowed(code: string | null) {
  if (!code) return false;
  if (!codes || Date.now() - codesAt > 60_000) {
    const { data } = await db.from("rcm_settings").select("key,value").in("key", ["editor_code", "librarian_code"]);
    codes = (data || []).map((r: { value: string | null }) => r.value || "").filter((v: string) => v.length >= 6);
    codesAt = Date.now();
  }
  return codes.includes(code);
}
function r2() {
  const raw = (Deno.env.get("R2_ACCOUNT_ID") || "").trim();
  const acct = (raw.match(/[0-9a-f]{32}/i) || [raw.replace(/^https?:\/\//, "").split(".")[0]])[0];
  const id = (Deno.env.get("R2_ACCESS_KEY_ID") || "").trim(), secret = (Deno.env.get("R2_SECRET_ACCESS_KEY") || "").trim();
  if (!acct || !id || !secret) throw new Error("The archive storage keys are not set.");
  return { host: `${acct}.r2.cloudflarestorage.com`, client: new AwsClient({ accessKeyId: id, secretAccessKey: secret, service: "s3", region: "auto" }) };
}
const enc = (key: string) => key.split("/").map((p) => encodeURIComponent(p)).join("/");
const FIELDS = ["title", "category", "year", "month", "speaker", "description", "status", "sort", "poster", "duration", "width", "height", "plays", "path"];

// deno-lint-ignore no-explicit-any
async function copyOne(v: any) {
  const ext = (String(v.src_key).match(/\.([a-z0-9]+)$/i) || [, "mp4"])[1].toLowerCase();
  const dest = `vid/${v.slug}.${ext === "m4v" ? "mp4" : ext}`;
  const { host, client } = r2();
  const r = await client.fetch(`https://${host}/${PUBLIC}/${enc(dest)}`, {
    method: "PUT",
    headers: { "x-amz-copy-source": `/${SOURCE}/${enc(v.src_key)}`, "x-amz-metadata-directive": "REPLACE", "content-type": TYPES[ext] || "video/mp4", "cache-control": "public, max-age=31536000" },
  });
  const text = await r.text();
  if (!r.ok || /<Error>/.test(text)) throw new Error(`Copy failed (${r.status}): ${text.slice(0, 200)}`);
  await db.from("rcm_lib_videos").update({ path: dest, updated_at: new Date().toISOString() }).eq("id", v.id);
  return dest;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  // deno-lint-ignore no-explicit-any
  let b: Record<string, any>;
  try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  if (!(await allowed(req.headers.get("x-editor-code")))) return json({ error: "Wrong passcode." }, 401);
  try {
    if (b.action === "list") {
      const { data, error } = await db.from("rcm_lib_videos").select("*").order("category").order("sort").order("year"); if (error) throw error;
      return json({ items: data || [] });
    }
    if (b.action === "save") {
      const f: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of FIELDS) if (k in b) f[k] = b[k] === "" ? null : b[k];
      if (f.status && !["draft", "published", "held", "hidden"].includes(String(f.status))) return json({ error: "Bad status" }, 400);
      if ("links" in b && Array.isArray(b.links)) f.links = b.links;
      if (b.id) {
        const { error } = await db.from("rcm_lib_videos").update(f).eq("id", b.id); if (error) throw error;
        // Publishing a video that is still only in the private archive copies it to the public library first.
        if (f.status === "published") { const { data: v } = await db.from("rcm_lib_videos").select("*").eq("id", b.id).single(); if (v && !v.path && v.src_key) await copyOne(v); }
        return json({ ok: true });
      }
      if (!f.title || !f.category || !f.path) return json({ error: "A title, a section and the uploaded file are needed." }, 400);
      const slug = String(b.slug || f.title).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) + "-" + Date.now().toString(36).slice(-4);
      const { data, error } = await db.from("rcm_lib_videos").insert({ ...f, slug, links: f.links || [], status: f.status || "draft" }).select("id,slug").single(); if (error) throw error;
      return json({ ok: true, id: data.id, slug: data.slug });
    }
    if (b.action === "copy") {
      // Copies the given videos (or the next few that are published or draft but not yet copied), one at a time.
      let q = db.from("rcm_lib_videos").select("*").is("path", null).not("src_key", "is", null);
      q = b.id ? q.eq("id", b.id) : q.in("status", ["published", "draft"]).order("src_size").limit(Math.min(Number(b.limit) || 5, 20));
      const { data, error } = await q; if (error) throw error;
      const done: string[] = [], failed: string[] = [];
      for (const v of data || []) { try { await copyOne(v); done.push(v.slug); } catch (e) { failed.push(v.slug + ": " + String((e as Error).message).slice(0, 160)); } }
      const { count } = await db.from("rcm_lib_videos").select("id", { count: "exact", head: true }).is("path", null).in("status", ["published", "draft"]);
      return json({ done, failed, left: count || 0 });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Heritage Library, librarian review of the museum features: the Club timeline, monthly exhibits,
// visitors' suggestions of who is in a photo, and the weekly history minutes.
// Opens with the editor's or the librarian's passcode, like the library workshop.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-editor-code, authorization, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
let codes: string[] | null = null, codesAt = 0;
async function isEditor(code: string | null) {
  if (!code) return false;
  if (!codes || Date.now() - codesAt > 60_000) {
    const { data } = await db.from("rcm_settings").select("key,value").in("key", ["editor_code", "librarian_code"]);
    codes = (data || []).map((r: { value: string | null }) => r.value || "").filter((v: string) => v.length >= 6);
    codesAt = Date.now();
  }
  return codes.includes(code);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  // deno-lint-ignore no-explicit-any
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  if (!(await isEditor(req.headers.get("x-editor-code")))) return json({ error: "Wrong passcode." }, 401);
  const a = body.action;
  try {
    // ---------- museum: timeline, exhibits, photo names, history minutes (librarian review) ----------
    if (a === "events-list") {
      let qy = db.from("rcm_lib_events").select("*").order("year").order("month", { nullsFirst: true }).order("id").limit(2000);
      if (body.status) qy = qy.eq("status", body.status);
      const { data, error } = await qy; if (error) throw error;
      return json({ items: data || [] });
    }
    if (a === "event-save") {
      const f: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ["year", "month", "headline", "body", "status", "image_path"]) if (k in body) f[k] = body[k] === "" ? null : body[k];
      if ("links" in body && Array.isArray(body.links)) f.links = body.links;
      if (f.status && !["draft", "published", "hidden"].includes(String(f.status))) return json({ error: "Bad status" }, 400);
      if (body.id) { const { error } = await db.from("rcm_lib_events").update(f).eq("id", body.id); if (error) throw error; return json({ ok: true }); }
      if (!f.year || !f.headline) return json({ error: "A year and a headline are needed." }, 400);
      const { data, error } = await db.from("rcm_lib_events").insert({ ...f, links: f.links || [], status: f.status || "draft" }).select("id").single(); if (error) throw error;
      return json({ ok: true, id: data.id });
    }
    if (a === "events-status") {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Boolean);
      const status = ["draft", "published", "hidden"].includes(body.status) ? body.status : null;
      if (!ids.length || !status) return json({ error: "Nothing to change" }, 400);
      const { error } = await db.from("rcm_lib_events").update({ status, updated_at: new Date().toISOString() }).in("id", ids); if (error) throw error;
      return json({ ok: true, n: ids.length });
    }
    if (a === "exhibits-list") {
      const { data, error } = await db.from("rcm_lib_exhibits").select("*").order("month", { ascending: false }); if (error) throw error;
      return json({ items: data || [] });
    }
    if (a === "exhibit-save") {
      const f: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ["title", "kicker", "intro", "status", "month", "cover"]) if (k in body) f[k] = body[k];
      if ("items" in body && Array.isArray(body.items)) f.items = body.items;
      if (f.status && !["draft", "published"].includes(String(f.status))) return json({ error: "Bad status" }, 400);
      const { error } = await db.from("rcm_lib_exhibits").update(f).eq("id", body.id); if (error) throw error;
      return json({ ok: true });
    }
    if (a === "tags-list") {
      const { data, error } = await db.from("rcm_lib_tags").select("id,kind,ref,label,image,names,note,submitter,contact,status,created_at").eq("status", body.status || "new").order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return json({ items: data || [] });
    }
    if (a === "tag-review") {
      const status = body.status === "approved" ? "approved" : "rejected";
      const { data: t, error: e1 } = await db.from("rcm_lib_tags").select("*").eq("id", body.id).single(); if (e1) throw e1;
      const names = clean(body.names, 600) || t.names;
      if (status === "approved" && t.kind === "photo") {
        const [gid, n] = String(t.ref).split(":");
        const { data: ph } = await db.from("rcm_lib_photos").select("caption").eq("gallery_id", gid).eq("n", Number(n)).maybeSingle();
        if (ph) {
          const cap = String(ph.caption || "").replace(/\s*·?\s*In this photo:.*$/, "").trim();
          await db.from("rcm_lib_photos").update({ caption: (cap ? cap + " · " : "") + "In this photo: " + names }).eq("gallery_id", gid).eq("n", Number(n));
        }
      }
      const { error } = await db.from("rcm_lib_tags").update({ status, names, reviewed_at: new Date().toISOString() }).eq("id", body.id); if (error) throw error;
      return json({ ok: true });
    }
    // ---------- photo albums held back for a consent check ----------
    if (a === "held-list") {
      const { data, error } = await db.from("rcm_lib_galleries").select("id,slug,title,event_date,photo_count,cover_path,kept_private").eq("status", "draft").gt("photo_count", 0).order("event_date");
      if (error) throw error;
      return json({ items: data || [] });
    }
    if (a === "gallery-private") {
      const { error } = await db.from("rcm_lib_galleries").update({ kept_private: !!body.private, updated_at: new Date().toISOString() }).eq("id", body.id).eq("status", "draft");
      if (error) throw error;
      return json({ ok: true });
    }
    if (a === "minutes-list") {
      const { data, error } = await db.from("rcm_lib_minutes").select("*").order("week"); if (error) throw error;
      return json({ items: data || [] });
    }
    if (a === "minute-save") {
      const f: Record<string, unknown> = {};
      for (const k of ["title", "script", "status"]) if (k in body) f[k] = body[k];
      const { error } = await db.from("rcm_lib_minutes").update(f).eq("week", body.week); if (error) throw error;
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

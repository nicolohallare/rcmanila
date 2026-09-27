import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Membership, partnership and volunteer inquiries from the public website,
// and the Secretariat's list of them (Secretariat or editor passcode).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-editor-code, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

async function isStaff(code: string | null) {
  if (!code) return false;
  const { data } = await db.from("rcm_settings").select("key,value").in("key", ["editor_code", "secretariat_code"]);
  return (data || []).some((r: { value: string }) => r.value === code);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  try {
    if (body.action === "send") {
      if (body.website) return json({ ok: true }); // hidden field filled in = automated spam
      const kind = ["join", "partner", "volunteer", "other"].includes(body.kind) ? body.kind : "other";
      const name = clean(body.name, 120), email = clean(body.email, 160), phone = clean(body.phone, 40);
      if (name.length < 2) return json({ error: "Please type your name." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && phone.replace(/\D/g, "").length < 7) return json({ error: "Please give an email address or a mobile number so the Secretariat can reply." }, 400);
      const since = new Date(Date.now() - 3600 * 1000).toISOString();
      const { count } = await db.from("rcm_inquiries").select("id", { count: "exact", head: true }).gte("created_at", since);
      if ((count || 0) > 60) return json({ error: "Please try again later, or email rcmanila@rcmanila.org." }, 429);
      const { error } = await db.from("rcm_inquiries").insert({
        kind, name, email: email || null, phone: phone || null,
        organization: clean(body.organization, 160) || null, interest: clean(body.interest, 160) || null,
        message: typeof body.message === "string" ? body.message.trim().slice(0, 2000) || null : null,
        page: clean(body.page, 120) || null,
      });
      if (error) throw error;
      return json({ ok: true });
    }

    if (!(await isStaff(req.headers.get("x-editor-code")))) return json({ error: "Wrong passcode." }, 401);
    if (body.action === "list") {
      const { data, error } = await db.from("rcm_inquiries").select("*").order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return json({ inquiries: data || [] });
    }
    if (body.action === "update") {
      const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (["new", "contacted", "closed"].includes(body.status)) upd.status = body.status;
      if ("secretariat_note" in body) upd.secretariat_note = clean(body.secretariat_note, 500) || null;
      const { data, error } = await db.from("rcm_inquiries").update(upd).eq("id", body.id).select("*").single();
      if (error) throw error;
      return json({ inquiry: data });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

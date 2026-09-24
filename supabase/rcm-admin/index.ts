import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-editor-code, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const MODEL = "claude-sonnet-5";
const BUCKET = "rcm";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Long AI steps: keep the connection alive with whitespace, then send the JSON on the last line.
function streamed(work: () => Promise<unknown>) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(ctrl) {
      const beat = setInterval(() => ctrl.enqueue(enc.encode(" ")), 5000);
      try {
        const out = await work();
        ctrl.enqueue(enc.encode("\n" + JSON.stringify({ ok: true, data: out })));
      } catch (e) {
        ctrl.enqueue(enc.encode("\n" + JSON.stringify({ ok: false, error: String((e as Error)?.message || e) })));
      } finally {
        clearInterval(beat);
        ctrl.close();
      }
    },
  });
  return new Response(body, { headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } });
}

// Two passcodes: the Balita editor (full access) and the Secretariat (meetings and sign-ups only).
let codes: Record<string, string> | null = null;
async function roleFor(code: string | null): Promise<"editor" | "secretariat" | null> {
  if (!codes) {
    const { data } = await db.from("rcm_settings").select("key,value").in("key", ["editor_code", "secretariat_code"]);
    codes = Object.fromEntries((data || []).map((r: { key: string; value: string }) => [r.key, r.value]));
  }
  if (!code) return null;
  if (code === codes.editor_code) return "editor";
  if (code === codes.secretariat_code) return "secretariat";
  return null;
}

function manilaToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

const MEETING_FIELDS = ["label", "topic", "speaker", "speaker_title", "speaker_bio", "time_text", "registration_text", "venue", "notes", "poster_path", "status", "rsvp_open"];

const PARSE_SYSTEM = `You read an announcement for a weekly meeting of the Rotary Club of Manila (usually a Viber message, sometimes text from a poster) and pull out the details for the Club's website. Copy wording from the announcement; never invent details. Reply with JSON only.`;
const PARSE_TASK = `Return exactly this JSON shape (use null when the announcement does not say):
{"meeting_date":"YYYY-MM-DD","label":"e.g. 12th Weekly Membership Meeting","topic":"talk title","speaker":"speaker's full name with honorific as written","speaker_title":"speaker's position","speaker_bio":"short paragraph about the speaker taken from the announcement, plus any career milestones as lines starting with • ","time_text":"meeting time, e.g. 12:30 PM–2:00 PM","registration_text":"registration or lunch time if given","venue":"room and hotel","notes":"anything else members need to know that week (elections, special events, dress code, Zoom), in one or two plain sentences"}
Do not include the list of people attending.`;

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”"’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "article";
}

function extractJson(text: string) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e < s) throw new Error("The AI reply had no JSON.");
  return JSON.parse(text.slice(s, e + 1));
}

async function claude(content: unknown, system: string, maxTokens: number) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("The Anthropic API key is not set yet (Supabase → Edge Functions → Secrets → ANTHROPIC_API_KEY).");
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content }] }),
    });
    if (r.ok) {
      const j = await r.json();
      if (j.stop_reason === "max_tokens") throw new Error("The AI's answer was cut off because this part was too long.");
      return (j.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    }
    last = `${r.status} ${await r.text()}`;
    if (![429, 500, 502, 503, 529].includes(r.status)) break;
    await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
  }
  throw new Error("The AI service returned an error: " + last.slice(0, 300));
}

const PLAN_SYSTEM = `You read the weekly Balita, the newsletter of the Rotary Club of Manila, from raw PDF text, one PDF page at a time (a PDF page is usually a two-page printed spread; printed page numbers appear in running footers like "Rotary Club of Manila 63 62 Balita - September 17, 2026").
Your job is to list the issue's articles so each can become its own web page. Reply with JSON only, no commentary.`;

const PLAN_TASK = `Return exactly this JSON shape:
{"issue":{"issue_no":number|null,"date":"YYYY-MM-DD"|null,"meeting":"e.g. 11th Weekly Membership Meeting"|null,"guest":"guest speaker name and title"|null,"summary":"one sentence naming the main stories, factual, no hype"},
 "articles":[{"title":"headline as printed","kicker":"one of: Editorial, Guest speaker, Weekly meeting, Service, Feature, Club administration, In Focus, Foundation, District, Fellowship, In the news, Awards, Club news","byline":"as printed or null","from":first PDF page number,"to":last PDF page number,"printed":"printed page range like pp. 62–81, or null","lead":true only for the single strongest story to feature}],
 "skipped":[{"from":n,"to":n,"reason":"advertisement | meeting program | attendance or dues list | roster | cover | contents | blank"}]}
Rules: articles are continuous prose stories, editorials, profiles, speaker introductions, reports and announcements with real text. Photo-only pages that belong to an article go inside that article's page range. Do not invent titles: use the printed headline. Keep articles in reading order. Every PDF page belongs to exactly one article or one skipped range.`;

const CLEAN_SYSTEM = `You turn one article from the weekly Balita (newsletter of the Rotary Club of Manila) into clean web text. The input is raw text pulled from PDF pages, so it contains running headers and footers, page numbers, repeated decorative titles, captions mixed into the body, words broken across lines, and drop caps split from their word (e.g. "T" on its own and "HE Rotary Club..." which is "THE Rotary Club..." → write "The Rotary Club...").
Keep the author's wording exactly. Fix only extraction damage: rejoin hyphenated or broken words and drop caps, restore paragraph breaks, remove headers, footers, page numbers and repeated titles, and move photo captions out of the body. Never add facts, never summarize the body, never rewrite sentences. Reply with JSON only.`;

const CLEAN_TASK = `Return exactly this JSON shape:
{"title":"headline as printed","dek":"the printed standfirst/subheading if there is one; otherwise one factual sentence (max 25 words) using only facts from the text","byline":"as printed or null","kicker":"keep the given kicker unless clearly wrong",
 "body":[{"t":"p"|"h"|"q","text":"..."}],
 "photos":[{"id":"photo id","caption":"the caption printed for this photo, or empty string"}],
 "lead_photo":"photo id or null",
 "flag":null or "a short note to the editor in plain words (at most two sentences) about something they should fix before publishing"}
"h" = a printed subheading, "q" = a printed pull quote. Photos: include only real photographs that belong to this article, in reading order; leave out logos, headline art, cover images, advertisements and graphics that are mostly text. Match each printed caption to the photo it describes using what you can see in the images; use an empty caption rather than guessing. lead_photo is the best wide photo for the top of the web page.
Flag only real problems the editor must act on: text that is cut off or out of order, or a name, date or title that looks wrong. The editor is not technical: write the way a colleague would ("The photo of a man in a tuxedo on printed page 6 has no caption. Is this the author?"). Never mention photo ids, JSON or the PDF. Do not flag empty captions on group or crowd photos, typos you cannot confirm, or anything that is fine as printed. When in doubt, use null.`;

const CONT_TASK = `This is a continuation of an article whose beginning was already processed. Return exactly this JSON shape:
{"body":[{"t":"p"|"h"|"q","text":"..."}],
 "photos":[{"id":"photo id","caption":"the caption printed for this photo, or empty string"}],
 "flag":null or "a short note to the editor in plain words (at most two sentences) about something they should fix before publishing"}
If the first paragraph continues a sentence cut off at the end of the previous part, start with the continuing words as they appear. Same rules for photos as before: only real photographs that belong to this article, in reading order.
Flag only real problems the editor must act on: text that is cut off or out of order, or a name, date or title that looks wrong. The editor is not technical: write the way a colleague would ("The photo of a man in a tuxedo on printed page 6 has no caption. Is this the author?"). Never mention photo ids, JSON or the PDF. Do not flag empty captions on group or crowd photos, typos you cannot confirm, or anything that is fine as printed. When in doubt, use null.`;

function mapPhotos(list: { id: string; caption: string }[], photos: { id: string; path: string; width: number; height: number }[]) {
  const byId = new Map(photos.map((p) => [p.id, p]));
  return (list || []).filter((p) => byId.has(p.id)).map((p) => {
    const src = byId.get(p.id)!;
    return { id: p.id, path: src.path, caption: p.caption || "", width: src.width, height: src.height, include: true };
  });
}

// Remove every stored file of an issue (pages, photos, cover) so a fresh upload starts clean.
async function clearIssueFiles(issueNo: number) {
  const base = `issues/${issueNo}`;
  const paths: string[] = [];
  for (const sub of ["", "/pages", "/photos"]) {
    let offset = 0;
    for (;;) {
      const { data } = await db.storage.from(BUCKET).list(base + sub, { limit: 1000, offset });
      if (!data || !data.length) break;
      for (const f of data) if (f.id) paths.push(`${base}${sub}/${f.name}`);
      if (data.length < 1000) break;
      offset += 1000;
    }
  }
  for (let i = 0; i < paths.length; i += 500) await db.storage.from(BUCKET).remove(paths.slice(i, i + 500));
  return paths.length;
}

async function uniqueSlug(issueId: string, base: string) {
  const { data } = await db.from("rcm_articles").select("slug").eq("issue_id", issueId);
  const taken = new Set((data || []).map((r: { slug: string }) => r.slug));
  let s = base, k = 2;
  while (taken.has(s)) s = `${base}-${k++}`;
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const action = body.action;

  // ---------- public: meeting sign-ups (no passcode) ----------
  if (action === "rsvp") {
    try {
      if (body.website) return json({ ok: true, count: 0 }); // hidden field filled in = automated spam
      const name = clean(body.name, 80);
      if (name.length < 2) return json({ error: "Please type your name." }, 400);
      const kind = body.kind === "guest" ? "guest" : "member";
      const guest_of = kind === "guest" ? clean(body.guest_of, 80) || null : null;
      const affiliation = clean(body.affiliation, 100) || null;
      const { data: m } = await db.from("rcm_meetings").select("id,meeting_date,status,rsvp_open").eq("id", body.meeting_id).single();
      if (!m || m.status !== "published") return json({ error: "This meeting is not open for sign-ups." }, 400);
      if (!m.rsvp_open || m.meeting_date < manilaToday()) return json({ error: "Sign-ups for this meeting are closed. Please contact the Secretariat." }, 400);
      const { count } = await db.from("rcm_signups").select("id", { count: "exact", head: true }).eq("meeting_id", m.id);
      if ((count || 0) >= 400) return json({ error: "The list is full. Please contact the Secretariat." }, 400);
      const { data: existing } = await db.from("rcm_signups").select("id,name").eq("meeting_id", m.id).ilike("name", name.replace(/[%_\\]/g, "\\$&"));
      if (existing && existing.length) return json({ ok: true, already: true, count: count || 0 });
      const { data, error } = await db.from("rcm_signups").insert({ meeting_id: m.id, name, kind, guest_of, affiliation, source: "web" }).select("id,cancel_token").single();
      if (error) throw error;
      return json({ ok: true, id: data.id, token: data.cancel_token, count: (count || 0) + 1 });
    } catch (e) {
      return json({ error: String((e as Error)?.message || e) }, 500);
    }
  }
  if (action === "rsvp-cancel") {
    const { error } = await db.from("rcm_signups").delete().eq("id", body.id).eq("cancel_token", body.token);
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  }

  const role = await roleFor(req.headers.get("x-editor-code"));
  if (!role) return json({ error: "Wrong passcode." }, 401);
  const isMeetingAction = action === "login" || String(action).startsWith("m-");
  if (role === "secretariat" && !isMeetingAction) return json({ error: "This passcode is for the Secretariat page only." }, 403);

  try {
    if (action === "login") {
      if (body.need !== "meetings" && role !== "editor") return json({ error: "This passcode is for the Secretariat page. Use /secretariat instead." }, 401);
      return json({ ok: true, role });
    }

    // ---------- Secretariat: meetings and sign-ups ----------
    if (action === "m-list") {
      const { data, error } = await db.from("rcm_meetings").select("id,meeting_date,label,topic,speaker,status,rsvp_open,rcm_signups(count)").order("meeting_date", { ascending: false }).limit(30);
      if (error) throw error;
      const last = (data || [])[0];
      return json({ today: manilaToday(), meetings: (data || []).map((m: any) => ({ ...m, signups: m.rcm_signups?.[0]?.count ?? 0, rcm_signups: undefined })), last_venue: last ? (await db.from("rcm_meetings").select("venue,time_text,registration_text").eq("id", last.id).single()).data : null });
    }
    if (action === "m-get") {
      const { data: meeting, error } = await db.from("rcm_meetings").select("*").eq("id", body.id).single();
      if (error) throw error;
      const { data: signups } = await db.from("rcm_signups").select("id,name,kind,guest_of,affiliation,source,created_at").eq("meeting_id", body.id).order("created_at");
      return json({ meeting, signups: signups || [] });
    }
    if (action === "m-save") {
      const f = body.fields || {};
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of MEETING_FIELDS) if (k in f) row[k] = typeof f[k] === "string" ? (f[k].trim() || null) : f[k];
      if (row.status && !["draft", "published"].includes(row.status as string)) delete row.status;
      let q;
      if (body.id) q = db.from("rcm_meetings").update({ ...row, ...(f.meeting_date ? { meeting_date: f.meeting_date } : {}) }).eq("id", body.id);
      else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f.meeting_date || "")) return json({ error: "Choose the meeting date." }, 400);
        q = db.from("rcm_meetings").insert({ ...row, meeting_date: f.meeting_date });
      }
      const { data, error } = await q.select("*").single();
      if (error) {
        if (String(error.message).includes("duplicate")) return json({ error: "There is already a meeting on that date. Open it from the list instead." }, 400);
        throw error;
      }
      return json({ meeting: data });
    }
    if (action === "m-delete") {
      const { error } = await db.from("rcm_meetings").delete().eq("id", body.id);
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === "m-poster-sign") {
      const date = String(body.meeting_date || "").replace(/[^0-9-]/g, "");
      if (!date) return json({ error: "Save the meeting date first." }, 400);
      const path = `meetings/${date}/poster-${Date.now()}.jpg`;
      const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
      if (error) throw error;
      return json({ path, signedUrl: data.signedUrl });
    }
    if (action === "m-add-names") {
      const lines: string[] = String(body.text || "").split(/\r?\n/).map((l) => l.replace(/^\s*\d+\s*[.)\-]\s*/, "").replace(/\s+/g, " ").trim()).filter((l) => l.length >= 2).slice(0, 300);
      if (!lines.length) return json({ error: "Paste at least one name." }, 400);
      const { data: have } = await db.from("rcm_signups").select("name").eq("meeting_id", body.meeting_id);
      const seen = new Set((have || []).map((r: { name: string }) => r.name.toLowerCase()));
      const t0 = Date.now();
      const rows = lines.filter((l) => { const k = l.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).map((l, i) => ({
        meeting_id: body.meeting_id, name: l.slice(0, 120), kind: /guest of|^spouse\b/i.test(l) ? "guest" : "member", source: "secretariat",
        created_at: new Date(t0 + i).toISOString(),
      }));
      if (rows.length) { const { error } = await db.from("rcm_signups").insert(rows); if (error) throw error; }
      return json({ added: rows.length, skipped: lines.length - rows.length });
    }
    if (action === "m-remove-signup") {
      const { error } = await db.from("rcm_signups").delete().eq("id", body.id);
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === "m-parse") {
      const text = String(body.text || "").slice(0, 8000);
      if (text.trim().length < 20) return json({ error: "Paste the announcement first." }, 400);
      return streamed(async () => {
        const reply = await claude([{ type: "text", text: `${PARSE_TASK}\n\nToday is ${manilaToday()} (Manila). The announcement:\n\n${text}` }], PARSE_SYSTEM, 2000);
        return extractJson(reply);
      });
    }

    if (action === "issues") {
      const { data, error } = await db.from("rcm_issues").select("id,issue_no,issue_date,status,publish_at,cover_path,updated_at,source").order("issue_no", { ascending: false }).limit(60);
      if (error) throw error;
      return json({ issues: data });
    }

    if (action === "start") {
      const issue_no = Number(body.issue_no);
      if (!issue_no) return json({ error: "Enter the issue number." }, 400);
      const { data: existing } = await db.from("rcm_issues").select("id,issue_no,status").eq("issue_no", issue_no).maybeSingle();
      if (existing && body.keep) {
        const { data: arts } = await db.from("rcm_articles").select("id,title,page_from,page_to,checked").eq("issue_id", existing.id);
        return json({ issue: existing, kept: arts || [] });
      }
      await clearIssueFiles(issue_no);
      const row = { issue_no, issue_date: body.issue_date || null, status: "processing", page_count: body.page_count || null, source: body.source === "legacy" ? "legacy" : "upload", updated_at: new Date().toISOString() };
      const { data, error } = await db.from("rcm_issues").upsert(row, { onConflict: "issue_no" }).select("id,issue_no,status").single();
      if (error) throw error;
      await db.from("rcm_articles").delete().eq("issue_id", data.id);
      return json({ issue: data, kept: [] });
    }

    if (action === "delete-issue") {
      const { data: iss } = await db.from("rcm_issues").select("id,issue_no").eq("id", body.issue_id).single();
      if (!iss) return json({ error: "Issue not found." }, 404);
      const removed = await clearIssueFiles(iss.issue_no);
      const { error } = await db.from("rcm_issues").delete().eq("id", iss.id);
      if (error) throw error;
      return json({ ok: true, removed });
    }

    if (action === "check-issue") {
      const { data: existing } = await db.from("rcm_issues").select("id,issue_no,status,source,page_count").eq("issue_no", Number(body.issue_no)).maybeSingle();
      if (!existing) return json({ exists: false });
      const { count } = await db.from("rcm_articles").select("id", { count: "exact", head: true }).eq("issue_id", existing.id);
      return json({ exists: true, status: existing.status, articles: count || 0, source: existing.source, has_pages: !!existing.page_count });
    }

    if (action === "sign") {
      const issue_no = Number(body.issue_no);
      const names: string[] = (body.names || []).slice(0, 400);
      const out = [];
      for (const name of names) {
        if (!/^[a-z0-9._/-]+$/i.test(name) || name.includes("..")) continue;
        const path = `issues/${issue_no}/${name}`;
        const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
        if (error) throw error;
        out.push({ name, path, token: data.token, signedUrl: data.signedUrl });
      }
      return json({ uploads: out });
    }

    if (action === "plan") {
      const pages: { n: number; text: string }[] = body.pages || [];
      const text = pages.map((p) => `=== PDF page ${p.n} ===\n${(p.text || "").slice(0, 1800)}`).join("\n\n");
      return streamed(async () => {
        const reply = await claude([{ type: "text", text: `${PLAN_TASK}\n\nThe issue text:\n\n${text}` }], PLAN_SYSTEM, 6000);
        return extractJson(reply);
      });
    }

    if (action === "clean-part") {
      const { article, pages, photos, part, parts } = body as {
        article: { title: string; kicker: string; byline: string | null; from: number; to: number; printed: string | null };
        pages: { n: number; text: string }[];
        photos: { id: string; page: number; path: string; width: number; height: number; preview: string }[];
        part: number; parts: number;
      };
      return streamed(async () => {
        const first = !part;
        const intro = first
          ? `${CLEAN_TASK}\n\nArticle: "${article.title}" (kicker: ${article.kicker}; byline: ${article.byline || "none"}; PDF pages ${article.from}–${article.to}).` + (parts > 1 ? ` This is part 1 of ${parts}; only include the text on these pages.` : "")
          : `${CONT_TASK}\n\nArticle: "${article.title}", part ${part + 1} of ${parts}.`;
        const content: unknown[] = [{
          type: "text",
          text: `${intro}\n\nRaw text:\n\n` + pages.map((p) => `=== PDF page ${p.n} ===\n${(p.text || "").slice(0, 12000)}`).join("\n\n") +
            (photos.length ? `\n\nThe ${photos.length} images placed on these pages follow, each labelled with its id.` : "\n\nThere are no photos on these pages."),
        }];
        for (const ph of photos.slice(0, 40)) {
          content.push({ type: "text", text: `Image id ${ph.id} (PDF page ${ph.page}):` });
          const b64 = (ph.preview || "").split(",")[1];
          if (b64) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } });
        }
        const a = extractJson(await claude(content, CLEAN_SYSTEM, 16000));
        return {
          title: a.title, dek: a.dek, byline: a.byline, kicker: a.kicker, lead_photo: a.lead_photo, flag: a.flag || null,
          body: Array.isArray(a.body) ? a.body.filter((b: { text?: string }) => b && b.text) : [],
          photos: mapPhotos(a.photos, photos),
        };
      });
    }

    if (action === "save-draft") {
      const { issue_id, sort, article, parts } = body as {
        issue_id: string; sort: number;
        article: { title: string; kicker: string; byline: string | null; from: number; to: number; printed: string | null; lead: boolean };
        parts: { title?: string; dek?: string; byline?: string; kicker?: string; lead_photo?: string; flag?: string | null; body: unknown[]; photos: { id: string }[] }[];
      };
      const head = parts[0] || { body: [], photos: [] };
      const photos = parts.flatMap((p) => p.photos || []);
      if (head.lead_photo) { const i = photos.findIndex((p) => p.id === head.lead_photo); if (i > 0) photos.unshift(photos.splice(i, 1)[0]); }
      const flags = parts.map((p) => p.flag).filter(Boolean);
      const title = head.title || article.title;
      let lead = !!article.lead;
      if (lead) { const { count } = await db.from("rcm_articles").select("id", { count: "exact", head: true }).eq("issue_id", issue_id).eq("lead", true); if (count) lead = false; }
      const row = {
        issue_id, sort: sort ?? 0, slug: await uniqueSlug(issue_id, slugify(title)),
        kicker: head.kicker || article.kicker, title, dek: head.dek || null, byline: head.byline || article.byline || null,
        body: parts.flatMap((p) => p.body || []), photos, page_from: article.from, page_to: article.to, printed_pages: article.printed || null,
        flag: flags.length ? flags.join(" ") : null, lead,
      };
      const { data, error } = await db.from("rcm_articles").insert(row).select("*").single();
      if (error) throw error;
      return json(data);
    }

    if (action === "finish") {
      const f = body.fields || {};
      const { data: cur } = await db.from("rcm_issues").select("status").eq("id", body.issue_id).single();
      const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (!cur || cur.status === "processing") upd.status = "draft";
      for (const k of ["issue_date", "meeting", "guest", "summary", "cover_path", "pages", "page_count", "search_text"]) if (k in f) upd[k] = f[k];
      const { data, error } = await db.from("rcm_issues").update(upd).eq("id", body.issue_id).select("id,issue_no,status,cover_path,updated_at").single();
      if (error) throw error;
      return json({ issue: data });
    }

    // Articles carried over from the old website, attached to their issue (created as a live, reader-less issue if missing).
    if (action === "legacy-articles") {
      const issue_no = Number(body.issue_no);
      if (!issue_no) return json({ error: "Missing issue number." }, 400);
      let { data: iss } = await db.from("rcm_issues").select("id,issue_no").eq("issue_no", issue_no).maybeSingle();
      if (!iss) {
        const at = body.issue_date ? new Date(body.issue_date + "T12:00:00+08:00").toISOString() : new Date().toISOString();
        const ins = await db.from("rcm_issues").insert({ issue_no, issue_date: body.issue_date || null, status: "published", publish_at: at, source: "legacy", pdf_url: body.pdf_url || null }).select("id,issue_no").single();
        if (ins.error) throw ins.error;
        iss = ins.data;
      }
      const { data: have } = await db.from("rcm_articles").select("legacy_url,sort").eq("issue_id", iss!.id);
      const seen = new Set((have || []).map((r: { legacy_url: string }) => r.legacy_url).filter(Boolean));
      let sort = Math.max(0, ...((have || []).map((r: { sort: number }) => r.sort || 0))) + 1;
      let added = 0;
      for (const a of (body.articles || []).slice(0, 60)) {
        if (!a || !a.title || (a.legacy_url && seen.has(a.legacy_url))) continue;
        const row = {
          issue_id: iss!.id, sort: sort++, slug: await uniqueSlug(iss!.id, slugify(a.slug || a.title)), kicker: clean(a.kicker, 60) || "Balita",
          title: clean(a.title, 300), dek: clean(a.dek, 400) || null, byline: clean(a.byline, 200) || null,
          body: Array.isArray(a.body) ? a.body : [], photos: Array.isArray(a.photos) ? a.photos : [],
          included: true, checked: true, lead: false, source: "legacy", legacy_url: a.legacy_url || null,
        };
        const { error } = await db.from("rcm_articles").insert(row);
        if (error) throw error;
        added++;
      }
      return json({ issue_id: iss!.id, added });
    }

    // Back issues: reader + search only. They go live at once, dated to their own issue day.
    if (action === "legacy-finish") {
      const f = body.fields || {};
      const upd: Record<string, unknown> = { status: "published", updated_at: new Date().toISOString() };
      for (const k of ["issue_date", "cover_path", "pages", "page_count", "search_text", "pdf_url", "summary"]) if (k in f) upd[k] = f[k];
      upd.publish_at = f.issue_date ? new Date(f.issue_date + "T12:00:00+08:00").toISOString() : new Date().toISOString();
      if (new Date(upd.publish_at as string) > new Date()) upd.publish_at = new Date().toISOString();
      const { data, error } = await db.from("rcm_issues").update(upd).eq("id", body.issue_id).select("id,issue_no,status").single();
      if (error) throw error;
      return json({ issue: data });
    }

    if (action === "get") {
      const { data: issue, error } = await db.from("rcm_issues").select("id,issue_no,issue_date,meeting,guest,summary,cover_path,pages,page_count,status,publish_at,updated_at,source,pdf_url").eq("id", body.issue_id).single();
      if (error) throw error;
      const { data: articles } = await db.from("rcm_articles").select("*").eq("issue_id", body.issue_id).order("sort");
      return json({ issue, articles });
    }

    if (action === "save-article") {
      const f = body.fields || {};
      const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ["title", "dek", "byline", "kicker", "body", "photos", "checked", "included", "lead", "flag"]) if (k in f) upd[k] = f[k];
      if (upd.lead === true) {
        const { data: a } = await db.from("rcm_articles").select("issue_id").eq("id", body.id).single();
        if (a) await db.from("rcm_articles").update({ lead: false }).eq("issue_id", a.issue_id);
      }
      const { data, error } = await db.from("rcm_articles").update(upd).eq("id", body.id).select("*").single();
      if (error) throw error;
      return json({ article: data });
    }

    if (action === "publish") {
      const at = body.publish_at ? new Date(body.publish_at).toISOString() : new Date().toISOString();
      const status = new Date(at) > new Date() ? "scheduled" : "published";
      const { data, error } = await db.from("rcm_issues").update({ status, publish_at: at, updated_at: new Date().toISOString() }).eq("id", body.issue_id).select("*").single();
      if (error) throw error;
      return json({ issue: data });
    }

    if (action === "unpublish") {
      const { data, error } = await db.from("rcm_issues").update({ status: "draft", updated_at: new Date().toISOString() }).eq("id", body.issue_id).select("*").single();
      if (error) throw error;
      return json({ issue: data });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

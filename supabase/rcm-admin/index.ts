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

let cachedCode: string | null = null;
async function checkCode(code: string | null) {
  if (!cachedCode) {
    const { data } = await db.from("rcm_settings").select("value").eq("key", "editor_code").single();
    cachedCode = data?.value ?? null;
  }
  return !!code && !!cachedCode && code === cachedCode;
}

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
 "flag":null or "one short sentence telling the editor what to double-check (e.g. a name spelled two ways, text that looks cut off, a caption you could not place)"}
"h" = a printed subheading, "q" = a printed pull quote. Photos: include only real photographs that belong to this article, in reading order; leave out logos, headline art, cover images, advertisements and graphics that are mostly text. Match each printed caption to the photo it describes using what you can see in the images; use an empty caption rather than guessing. lead_photo is the best wide photo for the top of the web page.`;

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
  if (!(await checkCode(req.headers.get("x-editor-code")))) return json({ error: "Wrong editor passcode." }, 401);

  const action = body.action;
  try {
    if (action === "login") return json({ ok: true });

    if (action === "issues") {
      const { data, error } = await db.from("rcm_issues").select("id,issue_no,issue_date,status,publish_at,cover_path,updated_at").order("issue_no", { ascending: false }).limit(30);
      if (error) throw error;
      return json({ issues: data });
    }

    if (action === "start") {
      const issue_no = Number(body.issue_no);
      if (!issue_no) return json({ error: "Enter the issue number." }, 400);
      const row = { issue_no, issue_date: body.issue_date || null, status: "processing", page_count: body.page_count || null, updated_at: new Date().toISOString() };
      const { data, error } = await db.from("rcm_issues").upsert(row, { onConflict: "issue_no" }).select("id,issue_no").single();
      if (error) throw error;
      await db.from("rcm_articles").delete().eq("issue_id", data.id);
      return json({ issue: data });
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

    if (action === "clean") {
      const { issue_id, article, pages, photos, sort } = body as {
        issue_id: string; sort: number;
        article: { title: string; kicker: string; byline: string | null; from: number; to: number; printed: string | null; lead: boolean };
        pages: { n: number; text: string }[];
        photos: { id: string; page: number; path: string; width: number; height: number; preview: string }[];
      };
      return streamed(async () => {
        const content: unknown[] = [{
          type: "text",
          text: `${CLEAN_TASK}\n\nArticle: "${article.title}" (kicker: ${article.kicker}; byline: ${article.byline || "none"}; PDF pages ${article.from}–${article.to}).\n\nRaw text:\n\n` +
            pages.map((p) => `=== PDF page ${p.n} ===\n${(p.text || "").slice(0, 9000)}`).join("\n\n") +
            (photos.length ? `\n\nThe ${photos.length} images placed on these pages follow, each labelled with its id.` : "\n\nThere are no photos on these pages."),
        }];
        for (const ph of photos.slice(0, 40)) {
          content.push({ type: "text", text: `Image id ${ph.id} (PDF page ${ph.page}):` });
          const b64 = (ph.preview || "").split(",")[1];
          if (b64) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } });
        }
        const reply = await claude(content, CLEAN_SYSTEM, 16000);
        const a = extractJson(reply);
        const byId = new Map(photos.map((p) => [p.id, p]));
        const chosen = (a.photos || []).filter((p: { id: string }) => byId.has(p.id)).map((p: { id: string; caption: string }) => {
          const src = byId.get(p.id)!;
          return { id: p.id, path: src.path, caption: p.caption || "", width: src.width, height: src.height, include: true };
        });
        if (a.lead_photo && byId.has(a.lead_photo)) {
          const i = chosen.findIndex((p: { id: string }) => p.id === a.lead_photo);
          if (i > 0) chosen.unshift(chosen.splice(i, 1)[0]);
        }
        const title = a.title || article.title;
        const row = {
          issue_id, sort: sort ?? 0, slug: await uniqueSlug(issue_id, slugify(title)),
          kicker: a.kicker || article.kicker, title, dek: a.dek || null, byline: a.byline || article.byline || null,
          body: Array.isArray(a.body) ? a.body.filter((b: { text?: string }) => b && b.text) : [],
          photos: chosen, page_from: article.from, page_to: article.to, printed_pages: article.printed || null,
          flag: a.flag || null, lead: !!article.lead,
        };
        const { data, error } = await db.from("rcm_articles").insert(row).select("*").single();
        if (error) throw error;
        return data;
      });
    }

    if (action === "finish") {
      const f = body.fields || {};
      const upd: Record<string, unknown> = { status: "draft", updated_at: new Date().toISOString() };
      for (const k of ["issue_date", "meeting", "guest", "summary", "cover_path", "pages", "page_count"]) if (k in f) upd[k] = f[k];
      const { data, error } = await db.from("rcm_issues").update(upd).eq("id", body.issue_id).select("*").single();
      if (error) throw error;
      return json({ issue: data });
    }

    if (action === "get") {
      const { data: issue, error } = await db.from("rcm_issues").select("*").eq("id", body.issue_id).single();
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

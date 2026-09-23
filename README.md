# Rotary Club of Manila website (Balita)

- `api/page.js`: renders the public pages (home, /balita, /balita/:issue, /balita/:issue/:article) from Supabase.
- `admin.html` + `assets/admin.js` + `assets/extract.js`: the Balita editor at /admin (upload PDF → AI drafts → check → schedule).
- `supabase/rcm-admin/index.ts`: the Supabase Edge Function that runs the AI steps (secret: ANTHROPIC_API_KEY).
- `vercel.json`: URL routing.

No build step. Vercel settings: Framework "Other", no build command, no output directory.

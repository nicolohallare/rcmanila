# Rotary Club of Manila website (Balita)

- `api/page.js`: renders the public pages (home, /balita, /balita/:issue, /balita/:issue/:article) from Supabase.
- `admin.html` + `assets/admin.js` + `assets/extract.js`: the Balita editor at /admin (upload PDF → AI drafts → check → schedule).
- `supabase/rcm-admin/index.ts`: the Supabase Edge Function that runs the AI steps (secret: ANTHROPIC_API_KEY).
- `secretariat.html` + `assets/secretariat.js`: the Secretariat screen at /secretariat (weekly meeting details, poster, sign-up list, copy/Excel download).
- Public pages: /meeting (next meeting + sign-up form), /meetings/YYYY-MM-DD, /donate (QR Ph).
- `vercel.json`: URL routing.

No build step. Vercel settings: Framework "Other", no build command, no output directory.

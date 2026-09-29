// Server-rendered public pages: home, Balita archive, one issue, one article.
// Rendering on the server gives every page a proper title, summary and photo when shared on Viber or Facebook.
const SB = 'https://unavxknqpibxwcoqemaf.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuYXZ4a25xcGlieHdjb3FlbWFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNTQzNzIsImV4cCI6MjEwNTczMDM3Mn0.x-nD5ZJTq3dup1FzC240luQ4Y7pyHNTIYPJPOVhIYcw';

async function q(path) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`Data error ${r.status}`);
  return r.json();
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const img = (path, w) => path && path[0] === '/' ? path : path ? `${SB}/storage/v1/render/image/public/rcm/${path.split('/').map(encodeURIComponent).join('/')}?width=${w}&resize=contain&quality=78` : '';
// Covers carry the issue's last-update time, so a re-uploaded issue never shows an old cached cover.
// Changes with every deploy, so browsers fetch the new stylesheet at once instead of a saved copy.
const ASSET_V = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || String(Date.now())).slice(0, 10);
const coverSrc = (i, w) => img(i.cover_path, w) + (i.updated_at ? '&v=' + Date.parse(i.updated_at) : '');
// Issues before July 2024 are letter-size pages; newer ones use the tall 4:9 design. The onload check corrects any exception.
const pgc = (i) => (i && i.issue_date && i.issue_date < '2024-07-01' ? ' pg' : '');
const COVFIX = `onload="var r=this.naturalWidth/this.naturalHeight,b=this.closest('.yr-cover,.hx-cov,.wk-cover,.h-balita-cover')||this;b.classList.toggle('pg',r>.55)"`;
const raw = (path) => path && path[0] === '/' ? path : path ? `${SB}/storage/v1/object/public/rcm/${path.split('/').map(encodeURIComponent).join('/')}` : '';
const fmtDate = (d) => d ? new Date(d + 'T12:00:00+08:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' }) : '';
const fmtDay = (d) => d ? new Date(d + 'T12:00:00+08:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' }) : '';
const FN = `${SB}/functions/v1/rcm-admin`;
const PUB = 'sb_publishable_zebFaErs-sjDwYWQUMfq3g_VuF2DTI6';
const MAIL = 'rotaryclubofmanila@gmail.com';
const mailto = (subject) => `mailto:${MAIL}?subject=${encodeURIComponent(subject)}`;
const TEL = 'tel:+63285271885';
const leadPhoto = (a) => (a.photos || []).find((p) => p.include !== false);
// Show a photo no wider than its real pixel size, so small photos stay sharp instead of being blown up.
const figure = (p, alt, w = 1400, lazy = true) => {
  const real = p.width || w;
  const req = Math.min(w, real);
  const cap = p.width ? `max-width:${Math.round(p.width * Math.min(1, p.height ? 640 / p.height : 1, 1))}px;` : '';
  return `<figure class="art-fig"><img src="${img(p.path, req)}"${p.width ? ` srcset="${img(p.path, Math.min(req, 900))} ${Math.min(req, 900)}w, ${img(p.path, req)} ${req}w" sizes="(max-width:760px) 100vw, 720px"` : ''} alt="${esc(alt)}"${p.width && p.height ? ` width="${p.width}" height="${p.height}"` : ''} style="${cap}height:auto"${lazy ? ' loading="lazy"' : ''}>${p.caption ? `<figcaption style="${cap}">${esc(p.caption)}</figcaption>` : ''}</figure>`;
};
const isTall = (p) => p && p.width && p.height && p.height > p.width * 1.05;
// A photo in a fixed frame: wide photos fill it; tall photos (portraits) show whole, over a soft blurred copy, so heads are never cut off.
const photoBox = (p, w0, cls = 'ph', w = Math.min(w0, p.width || w0)) => (isTall(p) || (p.width && p.width < 560))
  ? `<div class="${cls} fit"><img class="bgblur" src="${img(p.path, 160)}" alt="" aria-hidden="true" loading="lazy"><img src="${img(p.path, w)}" alt="" loading="lazy"></div>`
  : `<div class="${cls}"><img src="${img(p.path, w)}" alt="" loading="lazy"></div>`;
// Prefer a wide photo from the article for wide slots.
const widePhoto = (a) => (a.photos || []).filter((p) => p.include !== false).sort((x, y) => (isTall(x) - isTall(y)))[0];
const manilaToday = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const paras = (t) => String(t || '').split(/\n\s*\n/).map((blk) => {
  const lines = blk.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length && lines.every((l) => /^[•\-*]/.test(l))) return `<ul>${lines.map((l) => `<li>${esc(l.replace(/^[•\-*]\s*/, ''))}</li>`).join('')}</ul>`;
  const bullets = lines.filter((l) => /^[•\-*]/.test(l));
  if (bullets.length) { const head = lines.filter((l) => !/^[•\-*]/.test(l)); return (head.length ? `<p>${esc(head.join(' '))}</p>` : '') + `<ul>${bullets.map((l) => `<li>${esc(l.replace(/^[•\-*]\s*/, ''))}</li>`).join('')}</ul>`; }
  return lines.length ? `<p>${esc(lines.join(' '))}</p>` : '';
}).join('');
async function nextMeeting() {
  const rows = await q(`rcm_meetings?select=*&status=eq.published&meeting_date=gte.${manilaToday()}&order=meeting_date.asc&limit=1`);
  return rows[0] || null;
}
async function signupCount(id) {
  try {
    const r = await fetch(`${SB}/rest/v1/rpc/rcm_signup_count`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ mid: id }) });
    return r.ok ? Number(await r.json()) || 0 : 0;
  } catch { return 0; }
}
function dateChip(iso) {
  const d = new Date(iso + 'T12:00:00+08:00');
  return `<div class="date-chip"><span>${d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'Asia/Manila' }).toUpperCase()}</span><b>${d.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Asia/Manila' })}</b><small>${d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Asia/Manila' })}</small></div>`;
}
function calLink(m) {
  const times = [...String(m.time_text || '').matchAll(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM|NN|noon)?/gi)].map((x) => {
    const mer = (x[3] || 'PM').toUpperCase(); let h = Number(x[1]) % 12; if (mer === 'PM' || mer === 'NN' || mer === 'NOON') h += 12;
    return [h, Number(x[2] || 0)];
  });
  const st = times[0] || [12, 15];
  const en = times[1] || [Math.min(st[0] + 2, 23), st[1]];
  const d = m.meeting_date.replace(/-/g, '');
  const f = (t) => `${d}T${String(t[0]).padStart(2, '0')}${String(t[1]).padStart(2, '0')}00`;
  const text = `RCM: ${m.topic || m.label || 'Weekly meeting'}`;
  const details = [m.label, m.speaker ? `Speaker: ${m.speaker}${m.speaker_title ? ', ' + m.speaker_title : ''}` : '', m.notes].filter(Boolean).join('\n');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(text)}&dates=${f(st)}/${f(en)}&ctz=Asia/Manila&location=${encodeURIComponent(m.venue || '')}&details=${encodeURIComponent(details)}`;
}

// Mutual links with the wider Rotary family (District, Zone, RI, the Philippine Rotary Magazine, the Club's foundation).
const FAMILY = [
  { name: 'Rotary International', href: 'https://www.rotary.org/', note: 'The worldwide network of Rotary clubs' },
  { name: 'Rotary Zone 10A', href: 'https://www.facebook.com/Zone10ARotaryVoice/', note: 'Rotary districts of the Philippines' },
  { name: 'Rotary District 3810', href: 'https://www.facebook.com/district3810/', note: 'The Club’s district in Metro Manila' },
  { name: 'Philippine Rotary Magazine', href: 'https://www.philippinerotarymagazine.com/', note: 'Rotary’s regional magazine for the Philippines' },
  { name: 'Rotary Club of Manila Foundation, Inc.', href: 'https://rcmanilafoundation.com/', note: 'The Club’s foundation for its service projects' },
];
let SITE = 'https://rcmanila.vercel.app';
function layout({ title, description, image, url, body, nav = '', type = 'article' }) {
  if (!image) image = '/assets/home/people-of-action.jpg';
  if (image[0] === '/') image = SITE + image;
  if (!description) description = 'The Rotary Club of Manila, the first Rotary club in Asia. Service above self since 1919.';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:site_name" content="Rotary Club of Manila">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta property="og:type" content="${type}">
${url ? `<meta property="og:url" content="${esc(url)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,600;0,700;0,800;1,700;1,800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css?v=${ASSET_V}">
</head>
<body class="pub">
<div class="topbar"><div class="wrap"><span class="tb-l">The first Rotary club in Asia · Established 1919</span><span class="tb-r"><a href="/secretariat">Secretariat login</a><a href="/admin">Editor login</a><a href="/library-admin">Librarian login</a></span></div></div>
<header class="site-head"><div class="wrap">
<a class="logo lockup" href="/" aria-label="Rotary Club of Manila home"><img class="lk-club" src="/assets/club-logo.png" alt="Rotary Club of Manila" width="803" height="286"><span class="lk-rule" aria-hidden="true"></span><img class="lk-msg" src="/assets/msg-2026.png" alt="Create Lasting Impact" width="918" height="509"></a>
<nav class="nav" aria-label="Main">
<a href="/#club">Our Club</a><a href="/projects" class="${nav === 'projects' ? 'on' : ''}">Projects</a><a href="/meeting" class="${nav === 'meeting' ? 'on' : ''}">Meetings</a><a href="/balita" class="${nav === 'balita' ? 'on' : ''}">Balita</a><a href="/library" class="${nav === 'library' ? 'on' : ''}">Library</a><a href="/join" class="${nav === 'join' ? 'on' : ''}">Join</a><a href="/partner" class="${nav === 'partner' ? 'on' : ''}">Partner</a>
</nav>
<details class="menu"><summary>Menu</summary><div class="menu-panel">
<a href="/#club">Our Club</a><a href="/past-presidents">Past presidents</a><a href="/projects">Service projects</a><a href="/meeting">Meetings</a><a href="/balita">Balita</a><a href="/library">Heritage Library</a><a href="/join">Join the Club</a><a href="/partner">Partner or volunteer</a><a href="/donate">Donate</a><a href="#contact">Contact</a>
</div></details>
<a class="btn btn-gold head-cta" href="/meeting">Attend a meeting</a>
</div></header>
<main>${body}</main>
<footer class="foot" id="contact"><div class="wrap">
<div style="display:flex;flex-direction:column;gap:14px"><span class="foot-lockup"><img class="lk-club" src="/assets/club-logo-white.png" alt="Rotary Club of Manila" width="803" height="286"><span class="lk-rule" aria-hidden="true"></span><img class="lk-msg" src="/assets/msg-2026-white.png" alt="Create Lasting Impact" width="918" height="509"></span><span>The first Rotary club in Asia. Service above self since 1919.</span></div>
<address style="font-style:normal"><strong>Secretariat</strong>RCM Office, 543 Arquiza St. cor. Grey St.<br>Ermita, Manila<br><a href="${TEL}">(02) 8527-1885</a><br><a href="mailto:${MAIL}">${MAIL}</a></address>
<div><strong>Explore</strong><a href="/projects">Service projects</a><br><a href="/past-presidents">Past presidents</a><br><a href="/meeting">Weekly meeting</a><br><a href="/balita">Balita archive</a><br><a href="/library">Heritage Library</a><br><a href="/join">Join</a> · <a href="/partner">Partner</a> · <a href="/donate">Donate</a><br><a href="https://www.facebook.com/RotaryClubofManila" target="_blank" rel="noopener">Facebook</a> · <a href="https://www.linkedin.com/company/rotary-club-of-manila/" target="_blank" rel="noopener">LinkedIn</a></div>
<div><strong>Rotary family</strong>${FAMILY.map((f) => `<a href="${f.href}" target="_blank" rel="noopener">${esc(f.name)}</a>`).join('<br>')}</div>
<div class="copy">© ${new Date().getFullYear()} Rotary Club of Manila</div>
</div></footer>
<script>document.addEventListener('click',function(e){var a=e.target.closest('.menu-panel a');if(a){var d=a.closest('details');if(d)d.open=false;}});</script>
<script>
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]'); if (!b) return;
  const text = b.getAttribute('data-copy');
  try { await navigator.clipboard.writeText(text); b.textContent = 'Link copied'; }
  catch { window.prompt('Copy this link:', text); }
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-share]'); if (!b) return;
  const url = b.getAttribute('data-share'), title = b.getAttribute('data-title');
  if (navigator.share) { try { await navigator.share({ title, url }); } catch {} }
  else { try { await navigator.clipboard.writeText(url); b.textContent = 'Link copied'; } catch {} }
});
</script>
</body></html>`;
}

function shareBar(url, title, light) {
  const u = encodeURIComponent(url), t = encodeURIComponent(title);
  return `<div class="share ${light ? 'light' : ''}">
<span class="lbl">Share</span>
<button type="button" class="pill solid" data-share="${esc(url)}" data-title="${esc(title)}">Share…</button>
<a class="pill" href="viber://forward?text=${t}%20${u}">Viber</a>
<a class="pill" href="https://www.facebook.com/sharer/sharer.php?u=${u}" target="_blank" rel="noopener">Facebook</a>
<button type="button" class="pill" data-copy="${esc(url)}">Copy link</button>
</div>`;
}

function storyCard(issue, a) {
  const ph = leadPhoto(a);
  const href = `/balita/${issue.issue_no}/${a.slug}`;
  const visual = ph ? photoBox(ph, 640) 
    : `<div class="ph quote">${esc(a.kicker || 'Balita')}</div>`;
  return `<a class="story" href="${href}">${visual}<span class="eyebrow">${esc(a.kicker || 'Balita')}${a.printed_pages ? ' · ' + esc(a.printed_pages) : ''}</span><h3>${esc(a.title)}</h3>${a.dek ? `<p>${esc(a.dek)}</p>` : ''}</a>`;
}

const ICOLS = 'id,issue_no,issue_date,meeting,guest,summary,cover_path,pages,page_count,status,publish_at,updated_at,source,pdf_url';
const ACOLS = 'id,issue_id,slug,sort,kicker,title,dek,byline,body,photos,page_from,page_to,printed_pages,lead,included,source,legacy_url';
async function liveIssues(limit = 20, cols = ICOLS) {
  return q(`rcm_issues?select=${cols}&order=issue_no.desc&limit=${limit}`);
}
async function articlesOf(issueId) {
  return q(`rcm_articles?select=${ACOLS}&issue_id=eq.${issueId}&order=sort.asc`);
}
// Rotary years run July to June: an issue dated 2026-09-24 belongs to 2026–27.
const rotaryYear = (d) => { if (!d) return 'Undated'; const y = +d.slice(0, 4), m = +d.slice(5, 7); const s = m >= 7 ? y : y - 1; return `${s}–${String(s + 1).slice(2)}`; };
async function searchBalita(term) {
  const r = await fetch(`${SB}/rest/v1/rpc/rcm_search`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ q: term, lim: 60 }) });
  if (!r.ok) throw new Error('Search error ' + r.status);
  return r.json();
}

// ---------- Service projects, visitor routes, Join and Partner ----------
const PROJECTS = require('./projects.js');
const PRES = require('./presidents.js');
const pSrc = (src, w) => (src && src[0] === '/' ? src : img(src, w));
const LIB = require('./library-view.js')({ layout: (o) => layout(o), esc, q, fmtDate, PRES, searchBalita });
const INQ = `${SB}/functions/v1/rcm-inquiry`;

// The five things a visitor can do, shown near the top of the homepage and at the end of key pages.
function routesStrip(label = 'How you can take part') {
  return `<nav class="routes" aria-label="${esc(label)}"><div class="wrap">
<span class="routes-l">${esc(label)}</span>
<div class="routes-grid">
<a href="/projects"><b>Explore our projects</b><span>Service stories and results</span></a>
<a href="/join"><b>Join the Club</b><span>How membership works</span></a>
<a href="/partner"><b>Partner with us</b><span>Companies, institutions, volunteers</span></a>
<a href="/meeting"><b>Attend a meeting</b><span>Thursdays, guests welcome</span></a>
<a class="donate" href="/donate"><b>Donate</b><span>Support a project</span></a>
</div></div></nav>`;
}

function projectCard(p, lazy = true) {
  return `<a class="pj-card" href="/projects/${p.slug}"><span class="im"><img src="${esc(pSrc(p.hero.src, 720))}" alt="" ${lazy ? 'loading="lazy"' : ''}></span><span class="kicker">${esc(p.kicker.split(' · ')[0])}</span><strong>${esc(p.title)}</strong><span class="pj-card-dek">${esc(p.dek)}</span><span class="link-arrow">Read the story</span></a>`;
}

function projectPage(origin, slug) {
  const p = PROJECTS.find((x) => x.slug === slug);
  if (!p) return null;
  const others = PROJECTS.filter((x) => x !== p).slice(0, 3);
  const url = `${origin}/projects/${p.slug}`;
  const hero = p.hero.poa
    ? `<figure class="pj-hero-img is-poa"><img src="${esc(pSrc(p.hero.src, 1800))}" alt="${esc(p.hero.alt)}" width="${p.hero.w || 1792}" height="${p.hero.h || 1252}" fetchpriority="high"></figure>`
    : `<figure class="pj-hero-img"${p.hero.w && p.hero.w < 1200 ? ` style="max-width:${p.hero.w}px"` : ''}><img src="${esc(pSrc(p.hero.src, 1800))}" alt="${esc(p.hero.alt)}"${p.hero.w ? ` width="${p.hero.w}" height="${p.hero.h}"` : ''} fetchpriority="high"></figure>`;
  const body = `<article class="pj">
<header class="wrap pj-head"><a class="pj-back" href="/projects">← All service projects</a><span class="kicker">${esc(p.kicker)}</span><h1>${esc(p.title)}</h1><p class="pj-dek">${esc(p.dek)}</p></header>
<div class="wrap">${hero}</div>
<div class="wrap pj-grid">
<aside class="pj-facts" aria-label="Project facts"><dl>${p.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
<div class="pj-facts-cta"><a class="btn btn-gold" href="/donate">Support this work</a><a class="btn btn-line" style="color:var(--navy)" href="/partner?i=${encodeURIComponent(p.card)}#inquire">Volunteer or partner</a></div>
${shareBar(url, p.title, true)}</aside>
<div class="pj-body">
<section><h2>The need</h2>${p.need.map((t) => `<p>${esc(t)}</p>`).join('')}</section>
<section><h2>What members did</h2><ol class="pj-time">${p.did.map(([when, where, what]) => `<li><span class="pj-when">${esc(when)}</span><div><strong>${esc(where)}</strong><p>${esc(what)}</p></div></li>`).join('')}</ol></section>
<section><h2>The result</h2><div class="pj-stats">${p.result.map(([n, t]) => `<div><b>${esc(n)}</b><span>${esc(t)}</span></div>`).join('')}</div>${p.resultText ? `<p>${esc(p.resultText)}</p>` : ''}${p.quote ? `<blockquote class="h-quote">${esc(p.quote)}</blockquote>` : ''}</section>
<section><h2>Partners</h2><ul class="pj-partners">${p.partners.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>
<section><h2>What happens next</h2><p>${esc(p.next)}</p></section>
${p.gallery.length ? `<section class="pj-gallery">${p.gallery.map((g) => `<figure><img src="${esc(pSrc(g.src, 1400))}" alt="${esc(g.caption)}" loading="lazy">${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}</figure>`).join('')}</section>` : ''}
<section class="pj-sources"><h2>Sources</h2><ul>${p.sources.map(([href, t]) => `<li>${href ? `<a href="${href}">${esc(t)}</a>` : esc(t)}</li>`).join('')}</ul></section>
</div></div>
<section class="pj-more"><div class="wrap"><div class="section-head"><h2>More service projects</h2><a class="link-arrow" href="/projects">All projects</a></div>
<div class="pj-cards">${others.map((x) => projectCard(x)).join('')}</div></div></section>
</article>
${routesStrip()}`;
  return layout({ title: `${p.title} · Rotary Club of Manila`, description: p.dek, image: p.hero.src[0] === '/' ? origin + p.hero.src : img(p.hero.src, 1200), url, body, nav: 'projects' });
}


const presId = (x) => x.id || 'p-' + x.years.slice(0, 4) + (x.years === '1945–1946' ? 'b' : '');
function presidentsPage(origin) {
  const list = PRES.presidents;
  const current = list[list.length - 1];
  const card = (x, i) => `<button type="button" class="pres-card" id="${presId(x)}" data-p="${i}" aria-haspopup="dialog"><img src="${x.img}" alt="" width="320" height="320" loading="lazy"><b>${esc(x.name)}</b><span>${esc(x.years)}${x === current ? ' · Current' : ''}</span></button>`;
  const detail = (x, i) => {
    const src = [x.profile ? 'Presidential profiles, Rotary Club of Manila (2026)' : x.book || !x.summary ? '“The Work That Endures”, the Club’s 107th anniversary history (2026)' : '', ...x.balita.map(([u, t]) => `<a href="${esc(u)}">Balita: ${esc(t)}</a>`)].filter(Boolean);
    return `<template id="pt-${i}"><img src="${x.img}" alt="Portrait of ${esc(x.name)}" width="320" height="320"><div><span class="kicker">${x === current ? 'President, ' : ''}${esc(x.years)}</span><h2>${esc(x.name)}</h2>
${x.summary ? `<p>${esc(x.summary)}</p>` : `<p class="muted-p">The Club’s centennial history lists ${esc(x.name)} as president for ${esc(x.years)} but does not describe his term in detail.</p>`}
<p class="pres-src">Source: ${src.join(' · ')}</p></div></template>`;
  };
  const body = `<section class="wrap pj-index-head"><span class="kicker">107 years of leadership</span><h1>Presidents of the Rotary Club of Manila</h1>
<p class="lead-p">${list.length} terms since Leon J. Lambert called the first meeting of Asia’s first Rotary club in 1919. Select a portrait to read about that president’s year.</p>
<nav class="pres-jump" aria-label="Jump to a decade">${PRES.decades.map((d) => `<a href="#d-${d.key}">${d.label.slice(0, 5)}${d.label.slice(7)}</a>`).join('')}</nav></section>
${PRES.decades.map((d) => `<section class="wrap pres-dec-sec" id="d-${d.key}"><div class="pres-dec-head"><span class="kicker">${esc(d.label)}</span><h2>${esc(d.title)}</h2><p>${esc(d.blurb)}</p></div>
<div class="pres-grid">${list.map((x, i) => (x.decade === d.key ? card(x, i) + (PRES.interludes || []).filter((g) => g.after === x.years).map((g) => `<div class="pres-gap"><span class="kicker">${esc(g.years)}</span><b>${esc(g.title)}</b><p>${esc(g.text)}</p></div>`).join('') : '')).join('')}</div></section>`).join('')}
<section class="wrap" style="padding-bottom:64px"><p class="h-source">Names and term descriptions from the Club’s presidential profiles, “Roster of Presidents 1919–2027” (2026). Portraits from “The Work That Endures: A Century of Service and Stewardship at the Rotary Club of Manila” by Reginald T. Yu, in the Club’s 107th anniversary program (2026). Corrections are welcome: <a href="mailto:rotaryclubofmanila@gmail.com?subject=Past%20presidents%20page">rotaryclubofmanila@gmail.com</a>.</p></section>
${list.map(detail).join('')}
<dialog class="pres-dlg" id="pres-dlg" aria-labelledby="pres-dlg-t"><button type="button" class="pres-x" aria-label="Close">×</button><div class="pres-body" id="pres-dlg-t"></div><div class="pres-nav"><button type="button" data-step="-1">← Previous</button><button type="button" data-step="1">Next →</button></div></dialog>
<script>
(function(){var dlg=document.getElementById('pres-dlg'),bd=dlg.querySelector('.pres-body'),cur=-1,n=${list.length},ids=${JSON.stringify(list.map(presId))};
function show(i){if(i<0||i>=n)return;cur=i;bd.innerHTML='';bd.appendChild(document.getElementById('pt-'+i).content.cloneNode(true));dlg.querySelector('[data-step="-1"]').disabled=i===0;dlg.querySelector('[data-step="1"]').disabled=i===n-1;if(!dlg.open){dlg.showModal?dlg.showModal():dlg.setAttribute('open','')}try{history.replaceState(null,'','#'+ids[i])}catch(e){}}
document.addEventListener('click',function(e){var b=e.target.closest('.pres-card');if(b){show(+b.getAttribute('data-p'));return;}var s=e.target.closest('[data-step]');if(s){show(cur+ +s.getAttribute('data-step'));return;}if(e.target.closest('.pres-x')||e.target===dlg){dlg.close();}});
dlg.addEventListener('close',function(){try{history.replaceState(null,'',location.pathname)}catch(e){}var b=document.getElementById(ids[cur]);if(b)b.focus();});
document.addEventListener('keydown',function(e){if(!dlg.open)return;if(e.key==='ArrowRight')show(cur+1);if(e.key==='ArrowLeft')show(cur-1);});
var h=location.hash.slice(1),k=ids.indexOf(h);if(k>=0)show(k);})();
</script>`;
  return layout({ title: 'Past presidents · Rotary Club of Manila', description: `The ${list.length} presidential terms of the Rotary Club of Manila since 1919, with portraits and a profile of each president.`, image: origin + current.img, url: `${origin}/past-presidents`, body, type: 'website' });
}

function projectsIndex(origin) {
  const [first, ...rest] = PROJECTS;
  const body = `<section class="wrap pj-index-head"><span class="kicker">People of Action</span><h1>Our service projects</h1>
<p class="lead-p">Members of the Rotary Club of Manila give their time, skills and money to projects that answer a real need. Each story below says what the need was, what members did, who helped, and what changed, with links to the Balita reports.</p></section>
<section class="wrap"><a class="pj-lead" href="/projects/${first.slug}"><span class="im"><img src="${esc(pSrc(first.hero.src, 1400))}" alt="${esc(first.hero.alt)}" fetchpriority="high"></span><span class="pj-lead-body"><span class="kicker">${esc(first.kicker)}</span><strong>${esc(first.title)}</strong><span>${esc(first.dek)}</span><span class="link-arrow">Read the story</span></span></a></section>
<section class="wrap section"><div class="pj-cards">${rest.map((p) => projectCard(p)).join('')}</div></section>
<section class="h-sec alt" style="padding-block:64px"><div class="wrap">
<div class="h-sub" style="margin-top:0"><span class="kicker">Rotary Year 2025–26 in numbers</span><h2>More of the Club’s work</h2></div>
<div class="h-cards c4">${COMMUNITY.map((c) => `<article class="h-card"><div class="im"><img src="${H(c.img)}" alt="" loading="lazy"></div><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></article>`).join('')}</div>
<p class="h-source" style="color:var(--muted);margin-top:24px">Figures from the RY 2025–2026 report of Immediate Past President Raoul C. Creencia. Weekly reports of every activity are in the <a href="/balita">Balita archive</a>.</p>
</div></section>
${routesStrip()}`;
  return layout({ title: 'Service projects · Rotary Club of Manila', description: 'What the Rotary Club of Manila does: disaster relief, newborn care at PGH, flood protection at Hospicio de San Jose, technical scholarships and more.', image: origin + PROJECTS[0].hero.src, url: origin + '/projects', body, nav: 'projects' });
}

// One inquiry form for Join and Partner. Answers go to the Secretariat page (Inquiries tab).
function inquiryForm({ kind, kinds, interest }) {
  const kindField = kinds
    ? `<fieldset class="inq-kind"><legend>I would like to</legend>${kinds.map(([v, t], i) => `<label><input type="radio" name="kind" value="${v}"${(interest ? v === 'volunteer' : i === 0) ? ' checked' : ''}> ${esc(t)}</label>`).join('')}</fieldset>`
    : `<input type="hidden" name="kind" value="${kind}">`;
  return `<form id="inq-form" class="don-form inq-form" novalidate>
${kindField}
<div class="don-grid">
<label>Your name<input name="name" autocomplete="name" required></label>
<label><span>${kind === 'join' ? 'Profession or company' : 'Organization'} <span class="opt">(optional)</span></span><input name="organization" autocomplete="organization"></label>
<label>Email<input name="email" type="email" autocomplete="email"></label>
<label>Mobile number<input name="phone" type="tel" autocomplete="tel" inputmode="tel"></label>
</div>
${kinds ? `<label><span>Project or interest <span class="opt">(optional)</span></span><input name="interest" value="${esc(interest || '')}" placeholder="e.g. disaster relief, scholarships, newborn care"></label>` : ''}
<label><span>${kind === 'join' ? 'Anything you would like us to know' : 'How you would like to work with the Club'} <span class="opt">(optional)</span></span><textarea name="message" rows="3"></textarea></label>
<input name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
<p class="muted-p" style="font-size:15px">The Secretariat uses these details only to reply to you.</p>
<button class="btn btn-gold" type="submit" id="inq-send">Send to the Secretariat</button>
<p id="inq-msg" role="status" aria-live="polite"></p>
</form>
<div id="inq-done" class="don-done" hidden></div>
<script>
(function(){var f=document.getElementById('inq-form'),msg=document.getElementById('inq-msg');
f.addEventListener('submit',async function(e){e.preventDefault();var fd=new FormData(f),b=document.getElementById('inq-send');
if(String(fd.get('name')||'').trim().length<2){msg.textContent='Please type your name.';return;}
if(!String(fd.get('email')||'').trim()&&!String(fd.get('phone')||'').trim()){msg.textContent='Please give an email address or a mobile number so the Secretariat can reply.';return;}
b.disabled=true;msg.textContent='Sending…';
try{var p={action:'send',page:location.pathname};fd.forEach(function(v,k){p[k]=v;});
var r=await fetch('${INQ}',{method:'POST',headers:{'content-type':'application/json',apikey:'${PUB}'},body:JSON.stringify(p)});var d=await r.json().catch(function(){return{error:'The server did not answer. Please try again.'}});
if(!r.ok||d.error)throw new Error(d.error||'Please try again.');
f.hidden=true;var done=document.getElementById('inq-done');done.hidden=false;done.innerHTML='<strong>Thank you!</strong><p>The Secretariat has your message and will get in touch. You can also call (02) 8527-1885 or email rotaryclubofmanila@gmail.com.</p>';}
catch(err){msg.textContent=err.message;b.disabled=false;}});})();
</script>`;
}

function joinPage(origin) {
  const body = `<section class="h-join pg-hero"><img class="bg" src="${H('people-of-action')}" alt="" aria-hidden="true"><div class="wrap">
<span class="kicker">Membership</span><h1>Join the Rotary Club of Manila</h1>
<p>Leadership becomes more meaningful in the service of others. Join business, professional and civic leaders who meet every week and serve Manila together.</p>
<div class="h-cta"><a class="btn btn-gold" href="#inquire">Ask about membership</a><a class="btn btn-ghost" href="/meeting">Attend a meeting as a guest</a></div>
</div></section>

<section class="wrap section">
<div class="section-head"><h2>What members do</h2></div>
<div class="pg-three">
<div><b>Meet every Thursday</b><p>Lunch meetings with fellowship and a guest speaker, from national leaders to experts in their field. Guests are welcome.</p><a class="link-arrow" href="/meeting">This week’s meeting</a></div>
<div><b>Serve on real projects</b><p>Members plan, fund and show up for service: disaster relief, newborn care, scholarships, flood protection and more.</p><a class="link-arrow" href="/projects">Our service projects</a></div>
<div><b>Belong to a global network</b><p>The Club is part of Rotary District 3810 and Rotary International, connecting members with clubs across the Philippines and the world.</p><a class="link-arrow" href="/balita">Read the Balita</a></div>
</div>
</section>

<section class="h-sec alt" style="padding-block:64px"><div class="wrap">
<div class="section-head" style="margin-bottom:28px"><h2>How to become a member</h2></div>
<ol class="pg-steps">
<li><b>Attend a meeting as a guest</b><p>Sign up for any Thursday meeting on the <a href="/meeting">meeting page</a>, or come as the guest of a member.</p></li>
<li><b>Get to know the Club</b><p>Meet members, join a project or fellowship, and tell the Secretariat you are interested.</p></li>
<li><b>Be proposed by a member</b><p>Membership in Rotary is by invitation. A member proposes you, and the Club’s Board reviews the proposal.</p></li>
<li><b>Be inducted</b><p>New members are welcomed at a weekly meeting and start serving right away.</p></li>
</ol>
</div></section>

<section class="wrap section" id="inquire"><div class="pg-form">
<div><span class="kicker">Membership inquiry</span><h2>Tell us about yourself</h2><p class="muted-p">The Secretariat will reply and, if you wish, invite you to a meeting as a guest. You can also call <a href="${TEL}">(02) 8527-1885</a> or email <a href="${mailto('Membership inquiry')}">${MAIL}</a>.</p></div>
<div>${inquiryForm({ kind: 'join' })}</div>
</div></section>
${routesStrip('More ways to take part')}`;
  return layout({ title: 'Join · Rotary Club of Manila', description: 'How to become a member of the Rotary Club of Manila, Asia’s first Rotary club: attend a meeting, get to know the Club, and be proposed by a member.', image: origin + H('people-of-action'), url: origin + '/join', body, nav: 'join' });
}

function partnerPage(origin, interest) {
  const body = `<section class="wrap pj-index-head"><span class="kicker">Partner with us</span><h1>Work with the Rotary Club of Manila</h1>
<p class="lead-p">Companies, institutions, government offices, schools and individual volunteers work with the Club to reach more people. Tell us what you have in mind and the Secretariat will connect you with the right committee.</p></section>

<section class="wrap section" style="padding-top:8px">
<div class="pg-three">
<div><b>Co-fund a project</b><p>Support a service project with funds or in kind, from relief goods to equipment for a hospital or a school.</p><a class="link-arrow" href="/projects">See current projects</a></div>
<div><b>Build a program together</b><p>Institutions partner with the Club on awards and long-term programs, such as the LEAP Awards with the DOJ Office for Alternative Dispute Resolution and the Philippine Institute of Arbitrators.</p></div>
<div id="volunteer"><b>Volunteer</b><p>Individuals and company teams can help on the ground at relief operations, outreach days and school programs.</p></div>
</div>
</section>

<section class="h-sec alt" style="padding-block:56px"><div class="wrap">
<div class="section-head" style="margin-bottom:24px"><h2>Some of the Club’s partners</h2></div>
<ul class="pg-partners">
<li>UP–Philippine General Hospital</li><li>Rotary Club of Kangjin-Tamjin, Korea</li><li>Hospicio de San Jose</li><li>DUALTECH Training Center</li>
<li>DOJ Office for Alternative Dispute Resolution</li><li>Philippine Institute of Arbitrators</li><li>Carlos P. Romulo Foundation</li><li>Philippine Ecozones Association</li>
<li>Philippine Red Cross</li><li>Philippine Retailers Association</li><li>Anti-Red Tape Authority</li><li>ALC Media–DWIZ</li>
</ul>
</div></section>

<section class="wrap section" id="inquire"><div class="pg-form">
<div><span class="kicker">Get in touch</span><h2>Start a conversation</h2><p class="muted-p">The Secretariat reads every message and will get back to you. You can also call <a href="${TEL}">(02) 8527-1885</a> or email <a href="${mailto('Partnering with the Rotary Club of Manila')}">${MAIL}</a>.</p></div>
<div>${inquiryForm({ kind: 'partner', kinds: [['partner', 'Partner or sponsor as an organization'], ['volunteer', 'Volunteer'], ['other', 'Something else']], interest })}</div>
</div></section>
${routesStrip('More ways to take part')}`;
  return layout({ title: 'Partner with us · Rotary Club of Manila', description: 'Co-fund a project, build a program with the Club, or volunteer with the Rotary Club of Manila.', image: origin + H('poa-relief-handoff-2026'), url: origin + '/partner', body, nav: 'partner' });
}

// Homepage. Everything except the "This week" cards and the Balita block is fixed content from the
// 107th anniversary souvenir program, with photos prepared at full resolution in /assets/home.
// Weekly content (meeting, Balita) sits in fixed-size frames so a new upload can never distort the page.
const H = (name) => `/assets/home/${name}.jpg`;
const FEATURE = { img: 'river-marker', title: 'Project R.I.V.E.R. at Hospicio de San Jose',
  text: 'A P1 million high-capacity water pump drains floodwater at Hospicio de San Jose, the home on the Pasig River for elderly, abandoned and medically fragile residents, so care can continue even during severe weather.',
  quote: 'More than a flood control measure, it is a response to the fundamental determinants of dignity.',
  tags: ['Water, sanitation & hygiene', 'P1 million pump system'] };
const FLAGSHIP = [
  { img: 'aral-scholars', tag: 'Education', link: '/projects/aral-scholarships', title: 'A.R.A.L. scholarships', text: 'A study-now, pay-later program funded through the Leon Lambert Fellows Fund: P1 million for 15 scholars at DUALTECH Training Center, who repay once employed so the next students can train too.' },
  { img: 'leap', tag: 'Peace', title: 'LEAP Awards', text: 'Leaders Excelling in ADR and Peacemaking honors people who resolve disputes, from barangay justice to arbitration, with the DOJ Office for Alternative Dispute Resolution and the Philippine Institute of Arbitrators.' },
];
const SIGNATURE = [
  { img: 'tower', title: 'TOWER Awards', text: 'The Outstanding Workers of the Republic: a tribute to the skill and perseverance of Filipino blue-collar workers, held this year with the Philippine Ecozones Association.' },
  { img: 'ambassador', title: 'Outstanding Ambassador Award', text: 'With the Carlos P. Romulo Foundation, honoring U.S. Ambassador MaryKay Carlson (2025) and Spanish Ambassador Miguel Utray Delgado (2026).' },
  { img: 'journalism', title: 'Journalism Awards', text: 'Recognizing a free, ethical and responsible press. The latest awards were held on 11 June 2026.' },
];
const COMMUNITY = [
  { img: 'caravan-action', title: 'Health outreach', text: '36 major surgeries worth P3.6 million from a P450,000 contribution, and the Kalinga kay Maria women’s health caravan.' },
  { img: 'relief-action', title: 'OPLAN CARE relief', text: 'Typhoon and earthquake relief for 1,200 families in nine locations.' },
  { img: 'reading-training', title: 'Reading literacy', text: 'Training public school teachers to teach reading with Reading Specialists, Inc., and the Rotary Quill reading hub in Sta. Ana, Manila.' },
  { img: 'trees-planting', title: 'Tree planting', text: 'Reforestation with the Dumagat community in Antipolo, alongside Rotaract.' },
];
const YEARS = [
  { img: 'y1946', year: '1946', text: 'Club President Gil Puyat with then Vice President Elpidio Quirino: a moment of postwar leadership and national rebuilding.' },
  { img: 'y1986', year: '1986', text: 'Sagip Kabataan, a child-welfare program, is the Club’s flagship project under President Ed Reyes.' },
  { img: 'y1991', year: '1991', text: 'Pepo Nuñez leads relief distribution to communities hit by the Mount Pinatubo eruption.' },
  { img: 'y2024', year: '2024', text: 'Members gather at the Manila Hotel to celebrate 105 years of service and fellowship.' },
];

// Cover photo of the month: one action photo that tells the Club's story. The team sets it in the editor.
const COVER_FALLBACK = { month: '2026-09-01', tagline: 'Together, we save lives.', focus: '62% 38%', image_path: '/assets/home/cover-relief-campaign-2026.jpg', alt: 'People of Action campaign artwork: a Rotarian in a life vest hands a Rotary Club of Manila relief bag to a woman standing in floodwater beside boats.', caption: 'People of Action campaign artwork: when typhoons and floods cut families off, Rotarians bring relief to them by boat and on foot.', link: '/projects/typhoon-relief-2025' };
async function currentCover() {
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const rows = await q(`rcm_cover?select=*&month=lte.${today}&order=month.desc&limit=1`);
  return rows[0] || COVER_FALLBACK;
}
// People of Action campaign banners made for the Club, shown as they were designed.
const POA_WALL = [
  { img: '/assets/home/poa-campaign-relief-2026.jpg', link: '/projects/typhoon-relief-2025', label: 'Campaign artwork · Flood relief', alt: 'People of Action campaign artwork: a Rotarian in a life vest hands a Rotary Club of Manila relief bag to a woman standing in floodwater. Text: Together, we save lives. Rotary, People of Action.' },
  { img: '/assets/home/poa-empower-2026.jpg', link: '/projects/aral-scholarships', label: 'Dualtech scholars in training · September 2026', alt: 'Rotarians watch a Dualtech scholar at a precision machine. Text: Together, we empower. Rotary, People of Action.' },
  { img: '/assets/home/poa-relief-2026.jpg', link: '/projects/typhoon-relief-2025', label: 'Wading in with relief · September 2026', alt: 'Rotarians in life vests wade waist-deep through floodwater carrying relief bags. Text: Together, we save lives. Rotary, People of Action.' },
  { img: '/assets/home/poa-empower-lab-2026.jpg', link: '/projects/aral-scholarships', label: 'Inside the Dualtech workshops · September 2026', alt: 'A trainee shows Rotarians an industrial training rig at Dualtech. Text: Together, we empower. Rotary, People of Action.' },
];
async function home(origin) {
  const issues = await liveIssues(1).catch(() => []);
  const issue = issues[0];
  const arts = issue ? await articlesOf(issue.id).catch(() => []) : [];
  const lead = arts.find((a) => a.lead) || arts[0];
  // The Balita cover shows the week's guest speaker, not the lead story. Anything shown beside the cover
  // talks about that speaker, so the picture and the words always match.
  const guestName = issue && issue.guest ? issue.guest.split(',')[0].trim() : '';
  const guestLast = guestName.replace(/[“”"()]/g, '').split(/\s+/).filter((w) => w.length > 2).pop() || '';
  const coverStory = arts.find((a) => /guest (speaker|of honor)/i.test(a.kicker || '')) || (guestLast && arts.find((a) => (a.title || '').includes(guestLast))) || null;
  const firstStory = coverStory || lead;
  const stories = firstStory ? [firstStory, ...arts.filter((a) => a !== firstStory)].slice(0, 6) : [];
  const mt = await nextMeeting().catch(() => null);
  const cover = await currentCover().catch(() => null);
  const mtCount = mt ? await signupCount(mt.id) : 0;
  const nextThu = (() => { const d = new Date(Date.now() + 8 * 3600 * 1000); const add = (4 - d.getUTCDay() + 7) % 7; d.setUTCDate(d.getUTCDate() + add); return d.toISOString().slice(0, 10); })();
  const dBlock = (iso) => { const d = new Date(iso + 'T12:00:00+08:00'); const o = { timeZone: 'Asia/Manila' };
    return `<div class="wk-date"><span>${d.toLocaleDateString('en-GB', { ...o, month: 'short' }).toUpperCase()}</span><b>${d.toLocaleDateString('en-GB', { ...o, day: 'numeric' })}</b><small>${d.toLocaleDateString('en-GB', { ...o, weekday: 'long' })}</small></div>`; };

  const meetingCard = mt ? `<article class="wk">${dBlock(mt.meeting_date)}<div class="wk-body">
<span class="wk-label">${esc(mt.label || 'Weekly membership meeting')}</span>
<h3>${esc(mt.topic || 'Weekly membership meeting')}</h3>
${mt.speaker ? `<p class="wk-speaker">${esc(mt.speaker)}${mt.speaker_title ? `<span>${esc(mt.speaker_title)}</span>` : ''}</p>` : ''}
<p class="wk-meta">${esc(mt.time_text || '12:15 PM')}${mt.venue ? ` · ${esc(mt.venue)}` : ''}</p>
${mt.notes ? `<p class="wk-note">${esc(mt.notes)}</p>` : ''}
<div class="wk-actions"><a class="btn btn-blue" href="/meetings/${mt.meeting_date}#rsvp">Sign up to attend</a><a class="link-arrow" href="/meetings/${mt.meeting_date}">Details</a>${mtCount ? `<span class="wk-count">${mtCount} signed up</span>` : ''}</div>
</div>${mt.poster_path ? `<a class="wk-poster" href="${raw(mt.poster_path)}" target="_blank" rel="noopener" aria-label="Meeting poster, full size"><img src="${img(mt.poster_path, 400)}" alt="Poster for this week's meeting"></a>` : ''}</article>` : `<article class="wk">${dBlock(nextThu)}<div class="wk-body">
<span class="wk-label">Weekly membership meeting</span><h3>Every Thursday at 12:15 PM</h3>
<p class="wk-meta">Registration and lunch from 11:00 AM. This week’s speaker and venue will be posted by the Secretariat.</p>
<div class="wk-actions"><a class="btn btn-blue" href="/meeting">Meeting details</a></div></div></article>`;

  const balitaCard = issue ? `<article class="wk">
<a class="wk-cover" href="/balita/${issue.issue_no}" aria-label="Balita issue ${issue.issue_no}">${issue.cover_path ? `<img src="${coverSrc(issue, 360)}" alt="Cover of Balita issue ${issue.issue_no}">` : ''}</a>
<div class="wk-body"><span class="wk-label">Latest Balita</span><h3>Issue No. ${issue.issue_no}</h3>
<p class="wk-meta">${esc(fmtDate(issue.issue_date))}</p>
${lead ? `<a class="wk-lead" href="/balita/${issue.issue_no}/${lead.slug}">${esc(lead.title)}</a>` : ''}
<div class="wk-actions"><a class="link-arrow" href="/balita/${issue.issue_no}">Read the issue</a></div></div></article>`
    : `<article class="wk"><div class="wk-body"><span class="wk-label">Balita</span><h3>The weekly newsletter</h3><p class="wk-meta">The latest issue appears here every Thursday.</p><div class="wk-actions"><a class="link-arrow" href="/balita">All issues</a></div></div></article>`;

  // Members arrive from Viber links straight to a meeting or Balita page, so the homepage is written for
  // first-time visitors: heritage first, with this week's meeting and Balita kept to one slim bar.
  const wkMeeting = mt ? `<a class="hx-item" href="/meetings/${mt.meeting_date}"><span class="hx-date"><b>${new Date(mt.meeting_date + 'T12:00:00+08:00').toLocaleDateString('en-GB', { timeZone: 'Asia/Manila', day: 'numeric' })}</b>${new Date(mt.meeting_date + 'T12:00:00+08:00').toLocaleDateString('en-GB', { timeZone: 'Asia/Manila', month: 'short' }).toUpperCase()}</span><span class="hx-txt"><small>This week's meeting${mtCount ? ` · ${mtCount} signed up` : ''}</small><strong>${esc(mt.topic || mt.label || 'Weekly membership meeting')}</strong>${mt.speaker ? `<em>${esc(mt.speaker)}</em>` : ''}</span><span class="hx-go">Sign up →</span></a>`
    : `<a class="hx-item" href="/meeting"><span class="hx-date"><b>THU</b>12:15</span><span class="hx-txt"><small>Weekly meeting</small><strong>Every Thursday. Guests are welcome.</strong></span><span class="hx-go">Details →</span></a>`;
  const wkBalita = issue ? `<a class="hx-item" href="/balita/${issue.issue_no}"><span class="hx-cov">${issue.cover_path ? `<img src="${coverSrc(issue, 120)}" alt="">` : ''}</span><span class="hx-txt"><small>Balita No. ${issue.issue_no} · ${esc(fmtDate(issue.issue_date))}</small><strong>${guestName ? `On the cover: ${esc(guestName)}` : esc(coverStory ? coverStory.title : 'The latest issue')}</strong>${lead && lead !== coverStory ? `<em>Also: ${esc(lead.title)}</em>` : ''}</span><span class="hx-go">Read →</span></a>`
    : `<a class="hx-item" href="/balita"><span class="hx-txt"><small>Balita</small><strong>The Club's weekly publication</strong></span><span class="hx-go">Read →</span></a>`;

  const POA = PROJECTS[0];
  const POA_DID = 'In September 2026, members waded through floodwater and went by boat with the Rotary Club of Calumpit to bring 210 relief packs to three cut-off barangays, then rice for 70 more families in Pampanga. In 2025 they brought sleeping mats, food, medicines and livelihood help to families in Tondo, Cavite and Bulacan.';
  const body = `
<section class="hx" aria-label="Rotary Club of Manila">
${(() => { const cv = cover || COVER_FALLBACK; const mon = new Date(cv.month + 'T12:00:00+08:00').toLocaleDateString('en-GB', { timeZone: 'Asia/Manila', month: 'long', year: 'numeric' });
  const focus = /^[a-z0-9% .]{1,20}$/i.test(cv.focus || '') ? cv.focus : 'center';
  const verb = String(cv.tagline || 'Together, we take action.').replace(/^together,?\s*we\s*/i, '').replace(/[.!]+$/, '') || 'take action';
  return `<div class="poa-cover">
<img class="poa-cover-img" src="${esc(pSrc(cv.image_path, 2400))}" alt="${esc(cv.alt)}" style="object-position:${focus}" fetchpriority="high">
<div class="poa-cover-shade" aria-hidden="true"></div>
<h1 class="poa-cover-club">Rotary Club of Manila <span>· Asia’s first Rotary club, est. 1919</span></h1>
<div class="poa-mark" role="img" aria-label="Together, we ${esc(verb)}. Rotary Club of Manila, People of Action.">
<span class="poa-mark-kick" aria-hidden="true">Together, we</span>
<span class="poa-mark-verb" aria-hidden="true">${esc(verb)}</span>
<span class="poa-mark-lock" aria-hidden="true"><img src="/assets/club-logo-white.png" alt="" width="803" height="286"><i></i><b>People <small>of</small> Action</b></span>
</div></div>
<div class="poa-cover-cap"><div class="wrap poa-cover-cap-in"><span class="poa-cover-tag">People of Action · ${esc(mon)}</span>${cv.caption ? `<span class="poa-cover-txt">${esc(cv.caption)}</span>` : ''}${cv.link ? `<a class="poa-cover-go" href="${esc(cv.link)}">Read the story <span aria-hidden="true">→</span></a>` : ''}</div></div>`; })()}
<div class="hx-week"><div class="wrap hx-week-in"><span class="hx-week-l">This week</span>${wkMeeting}${wkBalita}</div></div>
</section>


<section class="poa" id="action"><div class="wrap">
<div class="poa-lead">
<a class="poa-img" href="/projects/${POA.slug}"><img src="${POA.hero.src}" alt="${esc(POA.hero.alt)}" width="${POA.hero.w || 1792}" height="${POA.hero.h || 1252}"></a>
<div class="poa-body"><span class="kicker">People of Action · ${esc(POA.kicker.split(' · ')[0])}</span>
<h2>${esc(POA.title)}</h2>
<dl class="poa-steps"><div><dt>The need</dt><dd>${esc(POA.need[0])}</dd></div>
<div><dt>What members did</dt><dd>${esc(POA_DID)}</dd></div>
<div><dt>The result</dt><dd>${esc(POA.result.map(([n, t]) => n + ' ' + t).slice(0, 1).join(''))}.</dd></div></dl>
<div class="h-cta"><a class="btn btn-navy" href="/projects/${POA.slug}">Read the story</a><a class="btn btn-line" style="color:var(--navy)" href="/projects">All service projects</a></div></div>
</div>
<div class="pj-cards">${PROJECTS.filter((x) => x !== POA).slice(0, 3).map((x) => projectCard(x)).join('')}</div>
</div></section>
<section class="poa-wall"><div class="wrap">
<div class="section-head"><div><span class="kicker">Rotary · People of Action</span><h2>Together, we act</h2></div><a class="link-arrow" href="/projects">All service projects</a></div>
<div class="poa-wall-grid">${POA_WALL.map((b) => `<a href="${b.link}"><img src="${b.img}" alt="${esc(b.alt)}" loading="lazy"><span>${esc(b.label)}</span></a>`).join('')}</div>
</div></section>
${routesStrip()}

<section class="h-sec" id="club"><div class="wrap h-club">
<div class="h-club-text">
<span class="kicker">Our Club</span>
<h2 class="h-title">Where Rotary in Asia began</h2>
<p>In January 1919, Leon Lambert and a small group of business leaders met at the Manila Hotel to form a Rotary club. On 1 June 1919, Rotary International granted Charter No. 478, making the Rotary Club of Manila the first in the Philippines and in Asia.</p>
<p>More than a century later, the Club still meets every Thursday for fellowship and service. It is led in Rotary Year 2026–2027 by President Reginald T. Yu.</p>
<div class="h-facts"><div><b>1919</b><span>Founded in Manila</span></div><div><b>No. 478</b><span>Rotary charter</span></div><div><b>3810</b><span>Rotary district</span></div></div>
</div>
<figure class="h-photo"><img src="${H('club-1936')}" alt="Club President Charlie Romulo, smiling, cutting a birthday cake with members in 1936" loading="lazy"><figcaption>Fellowship in 1936: President Charlie Romulo celebrates his 37th birthday at the Club’s first membership meeting of the year.</figcaption></figure>
</div></section>

<section class="h-impact" id="impact"><div class="wrap">
<span class="kicker">Rotary Year 2025–2026</span>
<h2>A year of service, in numbers</h2>
<div class="h-stats">
<div><b>1,588</b><strong>Children reached</strong><span>Through malnutrition, women’s health, medical and gift-giving programs</span></div>
<div><b>1,200</b><strong>Families given relief</strong><span>After typhoons and earthquakes, in nine locations</span></div>
<div><b>36</b><strong>Major surgeries</strong><span>Valued at P3.6 million, from a P450,000 contribution</span></div>
<div><b>US$30K</b><strong>To The Rotary Foundation</strong><span>Recognized by District 3810 as a top contributor</span></div>
</div>
<p class="h-source">From the RY 2025–2026 report of Immediate Past President Raoul C. Creencia.</p>
</div></section>

<section class="h-sec" id="projects"><div class="wrap">
<div class="h-head"><div><span class="kicker">Flagship projects</span><h2 class="h-theme"><img src="/assets/cli-h-blue.png" alt="Create Lasting Impact" width="1470" height="88"></h2><p>Rotary’s message for 2026–27 encourages all of us, as people of action, to work together to make a meaningful difference in our communities and around the world. These are the long-term projects the Club funds and runs with trusted partners.</p></div><a class="btn btn-gold" href="/donate">Support a project</a></div>
<article class="h-feature"><img src="${H(FEATURE.img)}" alt="Rotarians steady a ladder as a member mounts the Four-Way Test marker at Hospicio de San Jose, at the Project R.I.V.E.R. turnover in December 2025" loading="lazy">
<div class="h-feature-body"><span class="kicker">Water &amp; health</span><h3>${esc(FEATURE.title)}</h3><p>${esc(FEATURE.text)}</p><blockquote class="h-quote">${esc(FEATURE.quote)}</blockquote><ul class="tags">${FEATURE.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul><a class="link-arrow" href="/projects/project-river">Read the story</a></div></article>
<div class="h-cards c2">${FLAGSHIP.map((p) => `<article class="h-card"><div class="im"><img src="${H(p.img)}" alt="" loading="lazy"></div><span class="kicker">${esc(p.tag)}</span><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p>${p.link ? `<a class="link-arrow" href="${p.link}">Read the story</a>` : ''}</article>`).join('')}</div>

<div class="h-sub"><span class="kicker">Signature awards</span><h2>Honoring excellence in the Philippines</h2></div>
<div class="h-cards c3">${SIGNATURE.map((p) => `<article class="h-card"><div class="im"><img src="${H(p.img)}" alt="" loading="lazy"></div><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></article>`).join('')}</div>

</div></section>

<section class="h-heritage" id="history"><div class="wrap">
<div class="h-head"><div><span class="kicker">107 years</span><h2>A century of service</h2><p>Through war, reconstruction and renewal, the Club has kept meeting and kept serving.</p></div></div>
<div class="h-years">${YEARS.map((y) => `<figure class="h-year" style="margin:0"><img src="${H(y.img)}" alt="" loading="lazy"><b>${y.year}</b><p>${esc(y.text)}</p></figure>`).join('')}</div>
<div class="h-pres"><div class="h-pres-head"><h3>${PRES.presidents.length} presidential terms since 1919</h3><a class="link-arrow" href="/past-presidents">See every president and his term</a></div>
<div class="h-pres-row">${PRES.presidents.slice(-8).reverse().map((x) => `<a href="/past-presidents#${presId(x)}"><img src="${x.img}" alt="" width="320" height="320" loading="lazy"><b>${esc(x.name)}</b><span>${esc(x.years)}</span></a>`).join('')}</div></div>
</div></section>

${issue ? `<section class="h-sec alt" id="balita"><div class="wrap h-balita">
<a class="h-balita-cover" href="/balita/${issue.issue_no}">${issue.cover_path ? `<img src="${coverSrc(issue, 480)}" alt="Cover of Balita issue ${issue.issue_no}" loading="lazy">` : ''}</a>
<div class="h-balita-main"><span class="kicker">Published every Thursday</span><h2>Balita</h2>
<p class="h-balita-meta">Issue No. ${issue.issue_no} · ${esc(fmtDate(issue.issue_date))}</p>
${guestName ? `<p class="h-balita-cover-note">On the cover: ${coverStory ? `<a href="/balita/${issue.issue_no}/${coverStory.slug}">${esc(guestName)}</a>` : esc(guestName)}, guest of honor and speaker</p>` : ''}
<ul class="h-stories">${stories.map((a) => `<li><a href="/balita/${issue.issue_no}/${a.slug}"><small>${esc(a.kicker || 'Balita')}</small><strong>${esc(a.title)}</strong></a></li>`).join('')}</ul>
<div class="h-cta"><a class="btn btn-navy" href="/balita/${issue.issue_no}">Read issue ${issue.issue_no}</a><a class="btn btn-line" style="color:var(--navy)" href="/balita">All issues</a></div>
</div></div></section>` : ''}

<section class="h-join" id="join"><img class="bg" src="${H('people-of-action')}" alt="" aria-hidden="true" loading="lazy"><div class="wrap">
<span class="kicker">Membership</span>
<h2>Leadership becomes more meaningful in the service of others.</h2>
<p>Join business, professional and civic leaders working for a stronger Manila. Start by joining us at a Thursday meeting as a guest.</p>
<div class="h-cta"><a class="btn btn-gold" href="/meeting">Attend as a guest</a><a class="btn btn-ghost" href="/join">How to join</a></div>
</div></section>
<section class="h-family" aria-label="The Rotary family"><div class="wrap">
<span class="kicker">Part of the Rotary family</span>
<div class="h-family-row">${FAMILY.map((f) => `<a href="${f.href}" target="_blank" rel="noopener"><b>${esc(f.name)}</b><span>${esc(f.note)}</span></a>`).join('')}</div>
</div></section>

`;
  return layout({
    title: 'Rotary Club of Manila',
    description: 'Asia’s first Rotary club, serving since 1919. See our projects, read the Balita and join us every Thursday.',
    image: origin + H('hero-helipad'), url: origin + '/', body, type: 'website',
  });
}

async function archive(origin, term) {
  term = String(term || '').trim().slice(0, 120);
  const searchBox = `<form class="arch-search" action="/balita" method="get" role="search"><label for="bq" class="sr-only">Search every Balita issue</label><input id="bq" name="q" type="search" value="${esc(term)}" placeholder="Search every issue: a name, project or topic"><button class="btn btn-blue" type="submit">Search</button></form>`;
  let inner;
  if (term) {
    const hits = await searchBalita(term).catch(() => []);
    inner = `<p class="arch-count">${hits.length ? `${hits.length}${hits.length >= 60 ? '+' : ''} results for “${esc(term)}”` : `Nothing found for “${esc(term)}”. Try fewer or different words.`} · <a href="/balita">Back to all issues</a></p>
<ol class="hits">${hits.map((h) => `<li><a href="/balita/${h.issue_no}${h.slug ? '/' + esc(h.slug) : ''}"><span class="eyebrow">${h.kind === 'article' ? 'Article' : 'Full issue'} · Issue ${h.issue_no} · ${esc(fmtDate(h.issue_date))}</span><strong>${esc(h.title)}</strong><span class="snip">${String(h.snippet || '').replace(/</g, '&lt;').replace(/&lt;mark>/g, '<mark>').replace(/&lt;\/mark>/g, '</mark>')}</span></a></li>`).join('')}</ol>`;
  } else {
    const issues = await liveIssues(2000, 'id,issue_no,issue_date,cover_path,updated_at,summary');
    const years = [];
    for (const i of issues) { const y = rotaryYear(i.issue_date); let g = years.find((x) => x.y === y); if (!g) years.push(g = { y, list: [] }); g.list.push(i); }
    inner = issues.length ? `<nav class="yr-nav" aria-label="Rotary years">${years.map((g) => `<a href="#ry-${g.y.slice(0, 4)}">${g.y}</a>`).join('')}</nav>
${years.map((g) => `<section class="yr" id="ry-${g.y.slice(0, 4)}"><h2>Rotary Year ${g.y} <span>${g.list.length} issue${g.list.length === 1 ? '' : 's'}</span></h2>
<div class="yr-grid">${g.list.map((i) => `<a class="yr-card" href="/balita/${i.issue_no}"><div class="yr-cover${pgc(i)}">${i.cover_path ? `<img src="${coverSrc(i, 300)}" alt="" loading="lazy" ${COVFIX}>` : ''}</div><strong>No. ${i.issue_no}</strong><span>${esc(fmtDate(i.issue_date))}</span></a>`).join('')}</div></section>`).join('')}` : '<div class="empty">No issues published yet.</div>';
  }
  const body = `<section class="wrap section arch">
<div><span class="eyebrow">The official publication of the Rotary Club of Manila</span><h1 style="font-size:48px">Balita</h1><p class="arch-lede">Every issue of the Club’s weekly publication since 2015, grouped by Rotary year. Search finds names, projects and topics inside every issue. Older issues, back to 1948, are in the <a href="/library/balita">Heritage Library</a>.</p></div>
${searchBox}
${inner}
</section>`;
  return layout({ title: term ? `“${term}” · Balita search` : 'Balita · Rotary Club of Manila', description: 'Every issue of the Balita, the weekly publication of the Rotary Club of Manila, by Rotary year and searchable.', url: origin + '/balita', body, nav: 'balita' });
}

async function issuePage(origin, no) {
  const rows = await q(`rcm_issues?select=${ICOLS}&issue_no=eq.${Number(no)}`);
  const issue = rows[0];
  if (!issue) return null;
  const arts = await articlesOf(issue.id);
  const url = `${origin}/balita/${issue.issue_no}`;
  const title = `Balita · Issue No. ${issue.issue_no}`;
  const pages = Array.isArray(issue.pages) ? issue.pages : [];
  const body = `
<section class="issue-head"><div class="wrap">
${issue.cover_path ? `<img class="cover${pgc(issue)}" src="${coverSrc(issue, 520)}" alt="Cover of Balita issue ${issue.issue_no}" ${COVFIX}>` : '<div></div>'}
<div style="display:flex;flex-direction:column;gap:14px">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/balita">Balita</a></nav>
<span class="eyebrow" style="color:var(--gold)">The official publication of the Rotary Club of Manila</span>
<h1>${esc(title)}</h1>
<span class="meta">${esc(fmtDay(issue.issue_date))}${issue.meeting ? ' · ' + esc(issue.meeting) : ''}</span>
${issue.guest ? `<p>Guest of honor and speaker: ${esc(issue.guest)}</p>` : ''}
${issue.summary ? `<p>${esc(issue.summary)}</p>` : ''}
${shareBar(url, title, false)}
</div></div></section>
<div class="tabs"><div class="wrap" role="tablist" aria-label="How to read this issue">
${arts.length ? `<button class="tab" role="tab" id="t-a" aria-selected="true" aria-controls="v-a">Articles</button>` : ''}
<button class="tab" role="tab" id="t-l" aria-selected="${arts.length ? 'false' : 'true'}" aria-controls="v-l">${arts.length ? 'Layout view' : 'Read the issue'}</button>
<span style="margin-left:auto;align-self:center;color:var(--muted);font-size:15px">${arts.length ? `${arts.length} stories` : `${pages.length} pages`}${issue.pdf_url ? ` · <a href="${esc(issue.pdf_url)}" target="_blank" rel="noopener">Download PDF</a>` : ''}</span>
</div></div>
${arts.length ? '' : '<div hidden>'}<section class="wrap section" id="v-a" role="tabpanel" aria-labelledby="t-a"><div class="grid3">${arts.map((a) => storyCard(issue, a)).join('')}</div></section>${arts.length ? '' : '</div>'}
<section class="wrap section" id="v-l" role="tabpanel" aria-labelledby="t-l"${arts.length ? ' hidden' : ''}>
<p style="margin:0;color:var(--ink-2)">${arts.length ? 'The issue as it was printed, spread by spread. Switch to Articles for easy reading on a phone.' : 'The issue as it was printed, spread by spread. Tap a page to see it full size.'}</p>
${pages.length ? '' : '<p class="empty">The printed pages of this issue are not online yet.</p>'}<div class="pages">${pages.map((p, i) => `<figure><a href="${raw(p)}" target="_blank" rel="noopener"><img src="${img(p, 900)}" alt="Balita issue ${issue.issue_no}, PDF page ${i + 1}" loading="lazy"></a><figcaption>Page ${i + 1} of ${pages.length}</figcaption></figure>`).join('')}</div>
</section>
<script>
(function(){if(!document.getElementById('t-a'))return;var a=document.getElementById('t-a'),l=document.getElementById('t-l'),va=document.getElementById('v-a'),vl=document.getElementById('v-l');
function show(x){var isA=x===a;a.setAttribute('aria-selected',isA);l.setAttribute('aria-selected',!isA);va.hidden=!isA;vl.hidden=isA;}
a.onclick=function(){show(a)};l.onclick=function(){show(l)};if(location.hash==='#layout')show(l);})();
</script>`;
  return layout({ title, description: issue.summary || `The ${fmtDate(issue.issue_date)} issue of the Rotary Club of Manila's weekly publication.`, image: issue.cover_path ? coverSrc(issue, 1200) : '', url, body, nav: 'balita' });
}

async function articlePage(origin, no, slug) {
  const rows = await q(`rcm_issues?select=${ICOLS}&issue_no=eq.${Number(no)}`);
  const issue = rows[0];
  if (!issue) return null;
  const arts = await articlesOf(issue.id);
  const a = arts.find((x) => x.slug === slug);
  if (!a) return null;
  return renderArticle(origin, issue, a, arts);
}

// One renderer for the live article page and the editor's preview, so the preview is exactly what goes live.
function renderArticle(origin, issue, a, arts) {
  const url = `${origin}/balita/${issue.issue_no}/${a.slug}`;
  const photos = (a.photos || []).filter((p) => p.include !== false);
  const lead = photos[0];
  const rest = photos.slice(1);
  const blocks = Array.isArray(a.body) ? a.body : [];
  const every = rest.length ? Math.max(2, Math.floor(blocks.length / (rest.length + 1))) : 0;
  let pi = 0, html = '';
  blocks.forEach((b, i) => {
    if (b.t === 'h') html += `<h2>${esc(b.text)}</h2>`;
    else if (b.t === 'q') html += `<blockquote>${esc(b.text)}</blockquote>`;
    else html += `<p>${esc(b.text)}</p>`;
    if (every && (i + 1) % every === 0 && pi < rest.length && i < blocks.length - 1) {
      const p = rest[pi++];
      html += figure(p, p.caption || '');
    }
  });
  const leftover = rest.slice(pi);
  if (leftover.length) html += leftover.map((p) => figure(p, p.caption || '')).join('');
  const others = arts.filter((x) => x.id !== a.id).slice(0, 3);
  const body = `<article class="article">
<a href="/balita/${issue.issue_no}" style="font-weight:600;font-size:15px">← Balita · Issue ${issue.issue_no} · ${esc(fmtDate(issue.issue_date))}</a>
<span class="eyebrow">${esc(a.kicker || 'Balita')}</span>
<h1>${esc(a.title)}</h1>
${a.dek ? `<p class="dek">${esc(a.dek)}</p>` : ''}
${a.byline ? `<span class="byline">${esc(a.byline)}</span>` : ''}
${lead ? figure(lead, lead.caption || a.title, 1400, false) : ''}
<div class="share-row">${shareBar(url, a.title, true)}</div>
<div class="body">${html}</div>
<div class="from-issue">${issue.cover_path ? `<img class="${pgc(issue).trim()}" src="${coverSrc(issue, 160)}" alt="" ${COVFIX}>` : ''}<div><strong>From Balita Issue ${issue.issue_no}</strong>
${Array.isArray(issue.pages) && issue.pages.length ? `<a href="/balita/${issue.issue_no}#layout">See this story as printed${a.printed_pages ? ', ' + esc(a.printed_pages) : ''}</a>` : (issue.pdf_url ? `<a href="${esc(issue.pdf_url)}">Download the printed issue (PDF)</a>` : '')}<a href="/balita/${issue.issue_no}">Read the whole issue</a></div></div>
${others.length ? `<h2 style="font-size:24px;margin-top:12px">More from this issue</h2><div style="display:flex;flex-direction:column;gap:14px">${others.map((o) => { const p = leadPhoto(o); return `<a class="mini" style="background:var(--tint)" href="/balita/${issue.issue_no}/${o.slug}">${p ? `<img src="${img(p.path, 200)}" alt="">` : ''}${esc(o.title)}</a>`; }).join('')}</div>` : ''}
</article>`;
  return layout({ title: `${a.title} · Balita ${issue.issue_no}`, description: a.dek || `From the Balita, issue ${issue.issue_no}.`, image: lead ? img(lead.path, 1200) : (issue.cover_path ? coverSrc(issue, 1200) : ''), url, body, nav: 'balita' });
}

async function meetingPage(origin, dateParam) {
  const today = manilaToday();
  let m = null;
  if (dateParam === 'next' || !dateParam) m = await nextMeeting();
  else if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) m = (await q(`rcm_meetings?select=*&status=eq.published&meeting_date=eq.${dateParam}`))[0] || null;
  else return null;
  if (!m) {
    if (dateParam !== 'next' && dateParam) return null;
    const body = `<section class="issue-head"><div class="wrap" style="grid-template-columns:1fr">
<div style="display:flex;flex-direction:column;gap:14px"><span class="eyebrow" style="color:var(--gold)">Meetings &amp; Events</span><h1>Weekly membership meeting</h1>
<span class="meta">Every Thursday at 12:15 PM · Registration and lunch from 11:00 AM</span>
<p>This week's speaker and venue will be posted here by the Secretariat. Members and guests are welcome. For details, call <a style="color:var(--gold)" href="${TEL}">(02) 8527-1885</a> or email <a style="color:var(--gold)" href="mailto:${MAIL}">${MAIL}</a>.</p></div></div></section>`;
    return layout({ title: 'Meetings · Rotary Club of Manila', description: 'The Rotary Club of Manila meets every Thursday. Members and guests are welcome.', url: origin + '/meeting', body, nav: 'meeting' });
  }
  const url = `${origin}/meetings/${m.meeting_date}`;
  const count = await signupCount(m.id);
  const past = m.meeting_date < today;
  const open = m.rsvp_open && !past;
  const when = fmtDay(m.meeting_date);
  const title = m.topic ? `${m.topic}${m.speaker ? ' · ' + m.speaker : ''}` : `${m.label || 'Weekly meeting'} · ${when}`;
  const desc = `${when}${m.time_text ? ', ' + m.time_text : ''}${m.venue ? ' at ' + m.venue : ''}. Sign up to attend.`;
  const poster = m.poster_path ? `<figure class="poster"><a href="${raw(m.poster_path)}" target="_blank" rel="noopener"><img src="${img(m.poster_path, 900)}" alt="Meeting poster: ${esc(m.topic || m.label || '')}"></a><figcaption>Tap the poster to see it full size</figcaption></figure>` : '';
  const body = `
<section class="issue-head meet-head"><div class="wrap">
${dateChip(m.meeting_date)}
<div style="display:flex;flex-direction:column;gap:12px">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/meeting">Meetings</a></nav>
<span class="eyebrow" style="color:var(--gold)">${esc(m.label || 'Weekly membership meeting')}</span>
<h1>${esc(m.topic || m.label || 'Weekly meeting')}</h1>
${m.speaker ? `<p style="font-size:20px;color:#fff"><strong>${esc(m.speaker)}</strong>${m.speaker_title ? `<br><span style="color:var(--sky)">${esc(m.speaker_title)}</span>` : ''}</p>` : ''}
${past ? '<p><strong style="color:var(--gold)">This meeting has already taken place.</strong></p>' : `<div class="hero-cta"><a class="btn btn-gold" href="#rsvp">Sign up to attend</a><a class="btn btn-line" style="color:#fff" href="${calLink(m)}" target="_blank" rel="noopener">Add to calendar</a></div>`}
</div></div></section>
<div class="wrap meet-grid">
<div class="meet-main">
<dl class="facts">
<div><dt>Date</dt><dd>${esc(when)}</dd></div>
${m.time_text ? `<div><dt>Time</dt><dd>${esc(m.time_text)}</dd></div>` : ''}
${m.registration_text ? `<div><dt>Registration</dt><dd>${esc(m.registration_text)}</dd></div>` : ''}
${m.venue ? `<div><dt>Venue</dt><dd>${esc(m.venue)} · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(m.venue)}" target="_blank" rel="noopener">Map</a></dd></div>` : ''}
</dl>
${m.notes ? `<div class="meet-note big">${paras(m.notes)}</div>` : ''}
${m.speaker_bio ? `<section class="bio"><h2>About the speaker</h2>${paras(m.speaker_bio)}</section>` : ''}
${poster}
<div class="share-row">${shareBar(url, title, true)}</div>
</div>
<aside class="rsvp" id="rsvp">
<h2>${open ? 'Will you attend?' : 'Sign-ups closed'}</h2>
<p class="rsvp-count" id="rsvp-count">${count ? `<strong>${count}</strong> ${count === 1 ? 'person has' : 'people have'} signed up` : 'Be the first to sign up'}</p>
${open ? `<form id="rsvp-form" novalidate>
<input type="hidden" name="meeting_id" value="${m.id}">
<label>Your name, as it should appear on the list<input name="name" required maxlength="80" autocomplete="name" placeholder="e.g. PP Juan Dela Cruz"></label>
<fieldset><legend>I am</legend>
<label class="radio"><input type="radio" name="kind" value="member" checked> A member of RCM</label>
<label class="radio"><input type="radio" name="kind" value="guest"> A guest</label></fieldset>
<div id="guest-fields" hidden>
<label>Guest of (member's name)<input name="guest_of" maxlength="80" placeholder="e.g. Pres Reggie Yu"></label>
<label>Title or organization <span style="font-weight:400;color:var(--muted)">(optional)</span><input name="affiliation" maxlength="100"></label>
</div>
<label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
<button class="btn btn-blue" type="submit" style="width:100%">Sign me up</button>
<p id="rsvp-msg" role="status" aria-live="polite"></p>
</form>
<div id="rsvp-done" hidden></div>
<p class="small">Only the Secretariat sees the list of names. Can't sign up here? Call <a href="${TEL}">(02) 8527-1885</a>.</p>` : `<p>Please contact the Secretariat at <a href="${TEL}">(02) 8527-1885</a> or <a href="mailto:${MAIL}">${MAIL}</a>.</p>`}
</aside>
</div>
<script>
(function(){
var f=document.getElementById('rsvp-form'); if(!f) return;
var FN=${JSON.stringify(FN)}, PUB=${JSON.stringify(PUB)}, KEYS='rcm-rsvp-${m.id}';
var gf=document.getElementById('guest-fields'), msg=document.getElementById('rsvp-msg'), done=document.getElementById('rsvp-done'), cnt=document.getElementById('rsvp-count');
function mine(){try{return JSON.parse(localStorage.getItem(KEYS)||'[]')}catch(e){return []}}
function save(l){try{localStorage.setItem(KEYS,JSON.stringify(l))}catch(e){}}
function setCount(n){cnt.innerHTML=n?'<strong>'+n+'</strong> '+(n===1?'person has':'people have')+' signed up':'Be the first to sign up';}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function showDone(){var l=mine(); if(!l.length){done.hidden=true;f.hidden=false;return;}
 done.hidden=false; f.hidden=true;
 done.innerHTML='<p class="ok"><strong>You’re on the list.</strong> See you on ${esc(new Date(m.meeting_date + 'T12:00:00+08:00').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Asia/Manila' }))}!</p><ul class="mine">'+l.map(function(x,i){return '<li><span>'+esc(x.name)+'</span><button type="button" class="linkbtn" data-rm="'+i+'">Remove</button></li>'}).join('')+'</ul><button type="button" class="btn btn-line" style="color:var(--blue);width:100%" id="add-more">Sign up someone else (e.g. your guest)</button>';
}
f.addEventListener('change',function(){gf.hidden=f.kind.value!=='guest'});
f.addEventListener('submit',async function(e){e.preventDefault();
 var d={action:'rsvp',meeting_id:f.meeting_id.value,name:f.name.value,kind:f.kind.value,guest_of:f.guest_of.value,affiliation:f.affiliation.value,website:f.website.value};
 if(d.name.trim().length<2){msg.textContent='Please type your name.';f.name.focus();return;}
 if(d.kind==='guest'&&!d.guest_of.trim()){msg.textContent='Please type the name of the member who invited you.';f.guest_of.focus();return;}
 var b=f.querySelector('button[type=submit]'); b.disabled=true; msg.textContent='Saving…';
 try{var r=await fetch(FN,{method:'POST',headers:{'content-type':'application/json',apikey:PUB},body:JSON.stringify(d)});var j=await r.json();
  if(!r.ok||j.error) throw new Error(j.error||'Please try again.');
  var l=mine(); if(j.id) l.push({id:j.id,token:j.token,name:d.name.trim()}); else l.push({name:d.name.trim()}); save(l);
  if(j.count) setCount(j.count); msg.textContent=''; f.reset(); gf.hidden=true; showDone();
 }catch(err){msg.textContent=err.message||'Something went wrong. Please try again.';}
 finally{b.disabled=false;}
});
done.addEventListener('click',async function(e){
 if(e.target.id==='add-more'){done.hidden=true;f.hidden=false;f.name.focus();return;}
 var rm=e.target.getAttribute('data-rm'); if(rm===null) return;
 var l=mine(), x=l[+rm]; e.target.disabled=true;
 if(x&&x.id){try{await fetch(FN,{method:'POST',headers:{'content-type':'application/json',apikey:PUB},body:JSON.stringify({action:'rsvp-cancel',id:x.id,token:x.token})});}catch(err){}}
 l.splice(+rm,1); save(l); var n=parseInt((cnt.querySelector('strong')||{}).textContent||'0',10); if(x&&x.id&&n) setCount(n-1); showDone();
});
showDone();
})();
</script>`;
  return layout({ title: `${title} · Rotary Club of Manila`, description: desc, image: m.poster_path ? img(m.poster_path, 1200) : '', url, body, nav: 'meeting' });
}

async function donatePage(origin, pick) {
  const camps = await q('rcm_campaigns?select=id,slug,title,blurb,image_path,sort&active=eq.true&order=sort.asc,created_at.asc').catch(() => []);
  const chosen = camps.find((c) => c.slug === pick) || camps[0];
  const campCards = camps.map((c) => `<label class="camp${c === chosen ? ' on' : ''}"><input type="radio" name="campaign" value="${c.id}" data-title="${esc(c.title)}"${c === chosen ? ' checked' : ''}>
${c.image_path ? `<span class="camp-im"><img src="${img(c.image_path, 480)}" alt="" loading="lazy"></span>` : ''}<span class="camp-t"><strong>${esc(c.title)}</strong>${c.blurb ? `<span>${esc(c.blurb)}</span>` : ''}</span></label>`).join('');
  const body = `<section class="wrap section donate-page">
<div><span class="eyebrow">Support our projects</span><h1 style="font-size:clamp(32px,5vw,48px)">Donate to the Rotary Club of Manila</h1>
<p class="lead-p">Choose what your gift supports, pay with any Philippine bank or e-wallet app using the Club's QR Ph code, then send us your proof of payment so the Secretariat can issue your official receipt.</p></div>

${camps.length ? `<div class="don-step"><span class="don-n">1</span><div style="flex:1;min-width:0"><h2>Choose what your gift supports</h2><div class="camps" id="camps">${campCards}</div></div></div>` : ''}

<div class="don-step"><span class="don-n">${camps.length ? 2 : 1}</span><div style="flex:1;min-width:0"><h2>Pay with QR Ph</h2>
<div class="donate-grid">
<figure class="qr-card"><span class="qr-name">ROTARY CLUB OF MANILA</span><img src="/assets/rcm-qrph.png" alt="QR Ph code for the Rotary Club of Manila" width="410" height="410"><figcaption>QR Ph · RCBC QR Pay · no fees</figcaption>
<a class="btn btn-navy" href="/assets/rcm-qrph.png" download="Rotary-Club-of-Manila-QRPh.png">Save QR image</a></figure>
<ol class="howto">
<li><strong>Open your bank or e-wallet app</strong> such as GCash, Maya, BPI, BDO, RCBC or any app with QR Ph.</li>
<li><strong>Choose Scan QR or Pay QR</strong> and point your camera at the code. On a phone, tap <em>Save QR image</em> first, then choose <em>Upload QR</em> in your app.</li>
<li><strong>Check that the name shows Rotary Club of Manila,</strong> enter the amount, and confirm.</li>
<li><strong>Take a screenshot</strong> of the confirmation screen. You will attach it below.</li>
</ol></div></div></div>

<div class="don-step"><span class="don-n">${camps.length ? 3 : 2}</span><div style="flex:1;min-width:0"><h2>Send us your proof of payment</h2>
<p class="muted-p">The Secretariat matches it with the Club's bank record and sends your official receipt.</p>
<form id="don-form" class="don-form" novalidate>
<div class="don-grid">
<label>Your name<input name="member_name" autocomplete="name" required placeholder="e.g. Rtn. Juan dela Cruz"></label>
<label>Name on the official receipt<input name="receipt_name" required placeholder="Your name, or your company's name"></label>
<label>Amount you gave (₱)<input name="amount" inputmode="decimal" required placeholder="e.g. 5,000"></label>
<label>Mobile number or email<input name="contact" autocomplete="email" required placeholder="Where we send your receipt"></label>
</div>
<label>Screenshot of your payment<input name="proof" type="file" accept="image/*" required></label>
<label>Note to the Secretariat <span class="opt">(optional)</span><textarea name="notes" rows="2" placeholder="e.g. in memory of…, or split between two projects"></textarea></label>
<input name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
<p id="don-for" class="muted-p"></p>
<button class="btn btn-gold" type="submit" id="don-send">Send to the Secretariat</button>
<p id="don-msg" role="status" aria-live="polite"></p>
</form>
<div id="don-done" class="don-done" hidden></div>
<p class="muted-p" style="margin-top:14px">Questions? Call the Secretariat at <a href="${TEL}">(02) 8527-1885</a> or email <a href="${mailto('Donation made via QR Ph')}">${MAIL}</a>.</p>
</div></div>
</section>
<script>
(function(){
var FN='${FN}',PUB='${PUB}',f=document.getElementById('don-form'),msg=document.getElementById('don-msg');
function sel(){var r=document.querySelector('input[name=campaign]:checked');document.querySelectorAll('.camp').forEach(function(l){l.classList.toggle('on',l.contains(r))});document.getElementById('don-for').textContent=r?'For: '+r.getAttribute('data-title'):'';return r;}
document.addEventListener('change',function(e){if(e.target.name==='campaign')sel();});sel();
async function call(action,p){var r=await fetch(FN,{method:'POST',headers:{'content-type':'application/json',apikey:PUB},body:JSON.stringify(Object.assign({action:action},p))});var d=await r.json().catch(function(){return{error:'The server did not answer. Please try again.'}});if(!r.ok||d.error)throw new Error(d.error||'Please try again.');return d;}
async function shrink(file){var bm=await createImageBitmap(file);var k=Math.min(1,1800/Math.max(bm.width,bm.height));var c=document.createElement('canvas');c.width=Math.round(bm.width*k);c.height=Math.round(bm.height*k);c.getContext('2d').drawImage(bm,0,0,c.width,c.height);return await new Promise(function(res){c.toBlob(res,'image/jpeg',.88)});}
f.addEventListener('submit',async function(e){e.preventDefault();var b=document.getElementById('don-send');var fd=new FormData(f);var file=fd.get('proof');
if(!fd.get('member_name')||!fd.get('receipt_name')||!fd.get('amount')||!fd.get('contact')){msg.textContent='Please fill in your name, the name for the receipt, the amount and how to reach you.';return;}
if(!file||!file.size){msg.textContent='Please attach the screenshot of your payment.';return;}
b.disabled=true;msg.textContent='Sending…';
try{var blob;try{blob=await shrink(file);}catch(x){throw new Error('That file could not be opened. Please attach a screenshot (JPG or PNG).');}
var s=await call('donate-sign',{type:'image/jpeg'});var up=new FormData();up.append('cacheControl','3600');up.append('',blob,'proof.jpg');
var u=await fetch(s.signedUrl,{method:'PUT',body:up});if(!u.ok)throw new Error('The screenshot could not be uploaded. Please try again.');
var r=sel();var d=await call('donate',{member_name:fd.get('member_name'),receipt_name:fd.get('receipt_name'),amount:fd.get('amount'),contact:fd.get('contact'),notes:fd.get('notes'),website:fd.get('website'),campaign_id:r?r.value:null,proof_path:s.path});
f.hidden=true;var done=document.getElementById('don-done');done.hidden=false;done.innerHTML='<strong>Thank you!</strong><p>The Secretariat has your proof of payment and will send your official receipt to '+String(fd.get('contact')).replace(/[<>&]/g,'')+'. Your reference is <b>'+d.ref+'</b>.</p>';}
catch(err){msg.textContent=err.message;b.disabled=false;}});
})();
</script>`;
  return layout({ title: 'Donate · Rotary Club of Manila', description: 'Support the service projects of the Rotary Club of Manila using QR Ph from any bank or e-wallet app.', url: origin + '/donate', body });
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = []; for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

// Editor preview: renders an unsaved article with the live page's own code. Only for the editor passcode.
async function previewPage(req, origin) {
  const code = String(req.headers['x-editor-code'] || '');
  const ok = await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', 'x-editor-code': code, apikey: PUB }, body: '{"action":"login"}' });
  if (!ok.ok) return { status: 401, html: 'Not allowed' };
  const b = await readJson(req);
  if (!b || !b.issue || !b.article) return { status: 400, html: 'Missing article' };
  const others = (b.others || []).filter((o) => o && o.included !== false);
  let html = renderArticle(origin, b.issue, Object.assign({ slug: 'preview' }, b.article), [b.article, ...others]);
  // Links are shown but do nothing inside the preview.
  html = html.replace('<head>', '<head><base target="_blank"><meta name="robots" content="noindex"><style>a,button{pointer-events:none}</style>');
  return { status: 200, html };
}

// Old rcmanila.org (WordPress) addresses → where the same content lives now. Returns a path, or null.
let LEGACY = null;
const PAGES = { about: '/#club', 'who-we-are': '/#club', 'rostrum-and-bell': '/#club', members: '/join', membership: '/join', 'become-a-member': '/join', projects: '/projects', 'our-projects': '/projects', partners: '/partner', volunteer: '/partner', balita: '/balita', 'rotary-balita': '/balita', contact: '/#contact', 'contact-us': '/#contact', donate: '/donate', home: '/' };
async function legacyTarget(raw) {
  const path = String(raw || '').replace(/^\/+|\/+$/g, '');
  if (!path) return '/';
  let m = /^wp-content\/uploads\/(.+)$/.exec(path);
  // PDFs too large to copy as-is: send visitors to the issue page, which carries the compressed PDF
  const BIG = { 'RCM-Balita-March-6-2025.pdf': 4042, 'RCM-Balita-Apr-24-2025.pdf': 4048, 'RCM-Balita-May-1-2025.pdf': 4049, 'RCM-Balita-May-29-2025.pdf': 4051, 'RCM-Balita-June-5-2025.pdf': 4052, 'RCM-Balita-Jun-19-2025.pdf': 4053, 'RCM-Balita-Jun-26-2025.pdf': 4054, 'RCM-Balita-July-24-2025.pdf': 4058, 'RCM-Balita-Issue-no-4088-May-14-2026.pdf': 4088 };
  if (m && BIG[m[1].split('/').pop()]) return `/balita/${BIG[m[1].split('/').pop()]}`;
  if (m) return `${SB}/storage/v1/object/public/rcm/legacy/${m[1].split('/').map((x) => decodeURIComponent(x).replace(/[^A-Za-z0-9._-]/g, '-')).join('/')}`;
  if (!LEGACY) LEGACY = require('./legacy-map.json');
  m = /^category\/(?:[^/]+\/)*(issue-(?:no-)?\d+)$/i.exec(path) || /^(issue-\d+)$/i.exec(path);
  if (m) { const n = LEGACY.cats[m[1].toLowerCase()] || Number(m[1].replace(/\D/g, '')); if (n) return `/balita/${n}`; }
  if (/^category\/balita$/i.test(path) || /^category\/rotary-balita$/i.test(path)) return '/balita';
  const slug = path.split('/').pop().toLowerCase();
  if (PAGES[slug]) return PAGES[slug];
  if (/^(wp-admin|wp-login\.php)/.test(path)) return '/';
  const no = LEGACY.posts[slug];
  if (no) {
    try {
      const a = await q(`rcm_articles?select=slug,issue_id&legacy_url=eq.${encodeURIComponent('https://rcmanila.org/' + slug + '/')}&limit=1`);
      if (a[0]) { const i = await q(`rcm_issues?select=issue_no&id=eq.${a[0].issue_id}&limit=1`); if (i[0]) return `/balita/${i[0].issue_no}/${a[0].slug}`; }
    } catch (e) { /* fall back to the issue */ }
    return `/balita/${no}`;
  }
  return null;
}
function notFoundPage() {
  return layout({ title: 'Page not found · Rotary Club of Manila', description: '', body: `<section class="wrap" style="padding:64px 0 80px;max-width:760px">
<span class="kicker">Page not found</span><h1 style="margin:8px 0 12px">We couldn't find that page.</h1>
<p class="dek">The Club's website has moved to a new home, and some old addresses have changed. Try searching the Balita, or pick a section below.</p>
<form action="/balita" method="get" class="row" style="gap:8px;margin:20px 0 28px"><input name="q" type="search" placeholder="Search every Balita issue: a name, project or topic" aria-label="Search the Balita" style="flex:1;min-width:220px;padding:12px 14px;font-size:16px;border:1px solid #d0cfcd;border-radius:4px"><button class="btn btn-blue" type="submit">Search</button></form>
<p><a href="/">Homepage</a> · <a href="/meeting">This week's meeting</a> · <a href="/balita">Balita archive</a> · <a href="/donate">Donate</a> · <a href="/#contact">Contact the Secretariat</a></p></section>` });
}

module.exports = async (req, res) => {
  const u = new URL(req.url, `https://${req.headers.host}`);
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  // Once the club's own domain is live, SITE_URL (a Vercel environment variable, e.g. https://rcmanila.org)
  // makes every canonical link, sitemap entry and share card point there, and the old vercel.app address
  // stops being indexed by search engines.
  const origin = (process.env.SITE_URL || '').replace(/\/$/, '') || `https://${host}`;
  if (process.env.SITE_URL && /\.vercel\.app$/.test(host)) res.setHeader('X-Robots-Tag', 'noindex');
  SITE = origin;
  const r = u.searchParams.get('r') || 'home';
  if (r === 'preview') {
    if (req.method !== 'POST') { res.statusCode = 405; return res.end('Use POST'); }
    try {
      const out = await previewPage(req, origin);
      res.statusCode = out.status;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.end(out.html);
    } catch (e) { res.statusCode = 500; return res.end('Preview failed: ' + esc(e.message)); }
  }
  if (r === 'robots') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.setHeader('Cache-Control', 'public, s-maxage=86400');
    return res.end(`User-agent: *\nDisallow: /admin\nDisallow: /secretariat\nDisallow: /library-admin\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`);
  }
  if (r === 'sitemap') {
    try {
      const issues = await q('rcm_issues?select=id,issue_no,issue_date,updated_at&status=eq.published&order=issue_no.desc');
      const byId = new Map(issues.map((i) => [i.id, i]));
      let arts = [], off = 0;
      for (;;) { const page = await q(`rcm_articles?select=slug,issue_id,updated_at&included=eq.true&order=id&limit=1000&offset=${off}`); arts = arts.concat(page); if (page.length < 1000) break; off += 1000; }
      const d = (t) => (t ? String(t).slice(0, 10) : '');
      const urls = [['/', ''], ['/projects', ''], ...PROJECTS.map((p) => [`/projects/${p.slug}`, '']), ['/meeting', ''], ['/balita', ''], ['/join', ''], ['/partner', ''], ['/donate', '']]
        .concat(issues.map((i) => [`/balita/${i.issue_no}`, d(i.updated_at)]))
        .concat(arts.filter((a) => byId.has(a.issue_id)).map((a) => [`/balita/${byId.get(a.issue_id).issue_no}/${a.slug}`, d(a.updated_at)]));
      res.setHeader('Content-Type', 'application/xml; charset=utf-8'); res.setHeader('Cache-Control', 'public, s-maxage=3600');
      return res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, m]) => `<url><loc>${esc(origin + u)}</loc>${m ? `<lastmod>${m}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
    } catch (e) { res.statusCode = 500; return res.end('Sitemap unavailable'); }
  }
  if (r === 'legacy') {
    const to = await legacyTarget(u.searchParams.get('p'));
    if (to) { res.statusCode = 301; res.setHeader('Location', to); res.setHeader('Cache-Control', 'public, max-age=86400'); return res.end(); }
    res.statusCode = 404; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.end(notFoundPage());
  }
  let html = null;
  try {
    if (r === 'home') html = await home(origin);
    else if (r === 'archive') html = await archive(origin, u.searchParams.get('q'));
    else if (r === 'issue') html = await issuePage(origin, u.searchParams.get('no'));
    else if (r === 'article') html = await articlePage(origin, u.searchParams.get('no'), u.searchParams.get('slug'));
    else if (r === 'meeting') html = await meetingPage(origin, u.searchParams.get('date'));
    else if (r === 'donate') html = await donatePage(origin, u.searchParams.get('for'));
    else if (r === 'projects') html = projectsIndex(origin);
    else if (r === 'project') { html = projectPage(origin, u.searchParams.get('slug')); if (!html) { res.statusCode = 301; res.setHeader('Location', '/projects'); return res.end(); } }
    else if (r === 'join') html = joinPage(origin);
    else if (r === 'presidents') html = presidentsPage(origin);
    else if (r === 'lib') html = await LIB.route(origin, u);
    else if (r === 'partner') html = partnerPage(origin, String(u.searchParams.get('i') || '').slice(0, 80));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(layout({ title: 'Something went wrong', description: '', body: `<div class="empty">The page could not load (${esc(e.message)}). Please try again in a minute.</div>` }));
  }
  if (!html) {
    res.statusCode = 404;
    html = notFoundPage();
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  res.end(html);
};

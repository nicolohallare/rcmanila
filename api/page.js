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
// The story's card photo: the one picked as cleanest (thumb), else the largest reasonably shaped photo.
const cardScore = (p) => { const w = p.width || 400, h = p.height || 300, r = w / h; return Math.log(w * h) - (r < 0.55 ? 3 : 0) - (w < 260 || h < 180 ? 4 : 0); };
// A story's picture for cards and lists: its clean cropped card picture when there is one.
// A photo marked thumb without a cut card is used as it is, cropped by the page (focus = [x%, y%] keeps the subject in frame).
const cardOf = (a) => { const p = (a.photos || []).find((x) => x.thumb && x.card && x.include !== false); return p ? { path: p.card.path, width: p.card.width, height: p.card.height } : null; };
const pickedPhoto = (a) => (a.photos || []).find((x) => x.thumb && !x.card && x.include !== false) || null;
// nocard: none of the story's photos suits a card or link preview (flyers, scans), so lists show the Club placeholder.
const leadPhoto = (a) => { const c = cardOf(a) || pickedPhoto(a); if (c) return c; if ((a.photos || []).some((x) => x.nocard)) return null; const ps = (a.photos || []).filter((p) => p.include !== false); return ps.slice().sort((x, y) => cardScore(y) - cardScore(x))[0]; };
const focusCss = (p) => (Array.isArray(p && p.focus) ? `object-position:${Math.round(p.focus[0])}% ${Math.round(p.focus[1])}%` : 'object-position:50% 30%');
// Show a photo no wider than its real pixel size, so small photos stay sharp instead of being blown up.
const figure = (p, alt, w = 1400, lazy = true) => {
  const real = p.width || w;
  const req = Math.min(w, real);
  const cap = p.width ? `max-width:${Math.round(p.width * Math.min(1, p.height ? 640 / p.height : 1, 1))}px;` : '';
  return `<figure class="art-fig"><img src="${img(p.path, req)}"${p.width ? ` srcset="${img(p.path, Math.min(req, 900))} ${Math.min(req, 900)}w, ${img(p.path, req)} ${req}w" sizes="(max-width:760px) 100vw, 720px"` : ''} alt="${esc(alt)}"${p.width && p.height ? ` width="${p.width}" height="${p.height}"` : ''} style="${cap}height:auto"${lazy ? ' loading="lazy"' : ''}>${p.caption ? `<figcaption style="${cap}">${esc(p.caption)}</figcaption>` : ''}</figure>`;
};
const isTall = (p) => p && p.width && p.height && p.height > p.width * 1.05;
// A photo in a fixed frame: wide photos fill it; tall photos (portraits) show whole, over a soft blurred copy, so heads are never cut off.
// Portrait photos fill the frame, cropped from near the top where faces are; only very tall or tiny ones sit on a soft blurred backdrop.
const photoBox = (p, w0, cls = 'ph', w = Math.min(w0, p.width || w0)) => (p.width && p.height && (p.height > p.width * 1.9 || p.width < 300))
  ? `<div class="${cls} fit"><img class="bgblur" src="${img(p.path, 160)}" alt="" aria-hidden="true" loading="lazy"><img src="${img(p.path, w)}" alt="" loading="lazy"></div>`
  : `<div class="${cls}${isTall(p) ? ' tall' : ''}"><img src="${img(p.path, w)}" alt="" loading="lazy"></div>`;
// Prefer a wide photo from the article for wide slots.
const widePhoto = (a) => { const c = cardOf(a); if (c && c.width >= c.height) return c; const ps = (a.photos || []).filter((p) => p.include !== false); return c || ps.slice().sort((x, y) => (isTall(x) - isTall(y)) || (cardScore(y) - cardScore(x)))[0]; };
const manilaToday = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const paras = (t) => String(t || '').split(/\n\s*\n/).map((blk) => {
  const lines = blk.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length && lines.every((l) => /^[•\-*]/.test(l))) return `<ul>${lines.map((l) => `<li>${esc(l.replace(/^[•\-*]\s*/, ''))}</li>`).join('')}</ul>`;
  const bullets = lines.filter((l) => /^[•\-*]/.test(l));
  if (bullets.length) { const head = lines.filter((l) => !/^[•\-*]/.test(l)); return (head.length ? `<p>${esc(head.join(' '))}</p>` : '') + `<ul>${bullets.map((l) => `<li>${esc(l.replace(/^[•\-*]\s*/, ''))}</li>`).join('')}</ul>`; }
  return lines.length ? `<p>${esc(lines.join(' '))}</p>` : '';
}).join('');
// A Thursday with no meeting: the Secretariat enters it with the label "No weekly meeting".
const isOff = (m) => !!m && /^no (weekly )?meeting/i.test(String(m.label || '').trim());
async function sameDayEvent(date) { try { return (await q(`rcm_events?select=slug,title,time_text,venue&status=eq.published&event_date=eq.${date}&limit=1`))[0] || null; } catch { return null; } }
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
// Every published meeting as a calendar feed members can subscribe to once (/meetings.ics); updates itself.
async function meetingsIcs(origin) {
  const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const ms = await q(`rcm_meetings?select=id,meeting_date,label,topic,speaker,speaker_title,time_text,venue,notes,updated_at&status=eq.published&meeting_date=gte.${since}&order=meeting_date&limit=200`).catch(() => []);
  const escI = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fold = (line) => { const out = []; let l = line; while (l.length > 73) { out.push(l.slice(0, 73)); l = ' ' + l.slice(73); } out.push(l); return out.join('\r\n'); };
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rotary Club of Manila//Meetings//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Rotary Club of Manila meetings and events', 'X-WR-TIMEZONE:Asia/Manila', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H',
    'BEGIN:VTIMEZONE', 'TZID:Asia/Manila', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0800', 'TZOFFSETTO:+0800', 'TZNAME:PHT', 'END:STANDARD', 'END:VTIMEZONE'];
  for (const m of ms) {
    const [st, en] = mtTimes(m); const d = m.meeting_date.replace(/-/g, '');
    const f = (t) => `${d}T${String(t[0]).padStart(2, '0')}${String(t[1]).padStart(2, '0')}00`;
    const desc = [m.label, m.speaker ? `Guest speaker: ${m.speaker}${m.speaker_title ? ', ' + m.speaker_title : ''}` : '', m.notes, `Sign up: ${origin}/meetings/${m.meeting_date}`].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${m.id}@rcmanila.org`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Asia/Manila:${f(st)}`, `DTEND;TZID=Asia/Manila:${f(en)}`,
      fold(`SUMMARY:${escI('RCM: ' + (m.topic || m.label || 'Weekly meeting'))}`), fold(`LOCATION:${escI(m.venue)}`), fold(`DESCRIPTION:${escI(desc)}`), `URL:${origin}/meetings/${m.meeting_date}`, 'END:VEVENT');
  }
  const evs = await q(`rcm_events?select=id,slug,title,kicker,event_date,time_text,venue,summary&status=eq.published&event_date=gte.${since}&order=event_date&limit=100`).catch(() => []);
  for (const e of evs) {
    const [st, en] = mtTimes({ time_text: e.time_text || '6:00 PM' }); const d = e.event_date.replace(/-/g, '');
    const f = (t) => `${d}T${String(t[0]).padStart(2, '0')}${String(t[1]).padStart(2, '0')}00`;
    lines.push('BEGIN:VEVENT', `UID:${e.id}@rcmanila.org`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Asia/Manila:${f(st)}`, `DTEND;TZID=Asia/Manila:${f(en)}`,
      fold(`SUMMARY:${escI('RCM: ' + e.title)}`), fold(`LOCATION:${escI(e.venue)}`), fold(`DESCRIPTION:${escI([e.kicker, e.summary, `Sign up: ${origin}/events/${e.slug}`].filter(Boolean).join('\n'))}`), `URL:${origin}/events/${e.slug}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
function dateChip(iso) {
  const d = new Date(iso + 'T12:00:00+08:00');
  return `<div class="date-chip"><span>${d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'Asia/Manila' }).toUpperCase()}</span><b>${d.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Asia/Manila' })}</b><small>${d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Asia/Manila' })}</small></div>`;
}
function mtTimes(m) {
  const times = [...String(m.time_text || '').matchAll(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM|NN|noon)?/gi)].map((x) => {
    const mer = (x[3] || 'PM').toUpperCase(); let h = Number(x[1]) % 12; if (mer === 'PM' || mer === 'NN' || mer === 'NOON') h += 12;
    return [h, Number(x[2] || 0)];
  });
  const st = times[0] || [12, 15];
  return [st, times[1] || [Math.min(st[0] + 2, 23), st[1]]];
}
function calLink(m) {
  const [st, en] = mtTimes(m);
  const d = m.meeting_date.replace(/-/g, '');
  const f = (t) => `${d}T${String(t[0]).padStart(2, '0')}${String(t[1]).padStart(2, '0')}00`;
  const text = `RCM: ${m.topic || m.label || 'Weekly meeting'}`;
  const details = [m.label, m.speaker ? `Speaker: ${m.speaker}${m.speaker_title ? ', ' + m.speaker_title : ''}` : '', m.notes].filter(Boolean).join('\n');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(text)}&dates=${f(st)}/${f(en)}&ctz=Asia/Manila&location=${encodeURIComponent(m.venue || '')}&details=${encodeURIComponent(details)}`;
}

// Mutual links with the wider Rotary family (District, Zone, RI, the Philippine Rotary Magazine, the Club's foundation).
// Useful parts of rotary.org for members (the Secretariat asked for Rotary International to be easy to reach).
const RI_LINKS = [
  { name: 'rotary.org', href: 'https://www.rotary.org/', note: 'Rotary International: who we are, our causes and how Rotary works' },
  { name: 'My Rotary', href: 'https://my.rotary.org/', note: 'Sign in with your Rotary account for member and club tools' },
  { name: 'Learning & Reference', href: 'https://my.rotary.org/en/learning-reference', note: 'Free courses in the Rotary Learning Center, guides and manuals' },
  { name: 'The Rotary Foundation', href: 'https://my.rotary.org/en/rotary-foundation', note: 'Grants, giving and the Foundation’s programs' },
  { name: 'Rotary magazine', href: 'https://www.rotary.org/en/news-and-stories/rotary-magazine', note: 'Stories of Rotary members around the world' },
];
const FAMILY = [
  { name: 'Rotary International', href: 'https://www.rotary.org/', note: 'The worldwide network of Rotary clubs' },
  { name: 'Rotary Zone 10A', href: 'https://www.facebook.com/Zone10ARotaryVoice/', note: 'Rotary districts of the Philippines' },
  { name: 'Rotary District 3810', href: 'https://www.rotaryd3810.org/', note: 'The Club’s district in Metro Manila' },
  { name: 'Zone 10A Public Image Awards', href: 'https://rotaryzone10apublicimageawards.com/', note: 'Recognizing Rotary storytelling across the Philippines' },
  { name: 'Philippine Rotary Magazine', href: 'https://www.philippinerotarymagazine.com/', note: 'Rotary’s regional magazine for the Philippines' },
  { name: 'RCManila Foundation', href: 'https://rcmanilafoundation.com/', note: 'The Club’s foundation for its service projects' },
];
// Home page "Rotary world" band: where the Club sits in Rotary (a chain from RI down to RCM), and member resources.
const RW_ICON = {
  login: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l4-4-4-4"/><path d="M14 12H4"/>',
  learn: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
  mag: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
};
function rotaryWorld() {
  const ico = (k) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${RW_ICON[k]}</svg>`;
  const chain = [
    { name: 'Rotary International', where: 'Worldwide · since 1905', href: 'https://www.rotary.org/', cta: 'rotary.org' },
    { name: 'Rotary Zone 10A', where: 'The Philippines', href: 'https://www.facebook.com/Zone10ARotaryVoice/', cta: 'Zone page' },
    { name: 'Rotary District 3810', where: 'Metro Manila', href: 'https://www.rotaryd3810.org/', cta: 'District site' },
  ];
  const res = [
    { k: 'login', name: 'My Rotary', note: 'Sign in for member and club tools', href: 'https://my.rotary.org/' },
    { k: 'learn', name: 'Rotary Learning Center', note: 'Free courses, guides and manuals', href: 'https://my.rotary.org/en/learning-reference' },
    { k: 'heart', name: 'The Rotary Foundation', note: 'Grants, giving and programs', href: 'https://my.rotary.org/en/rotary-foundation' },
    { k: 'book', name: 'Rotary magazine', note: 'Stories from clubs around the world', href: 'https://www.rotary.org/en/news-and-stories/rotary-magazine' },
    { k: 'mag', name: 'Philippine Rotary Magazine', note: 'Rotary news from across the country', href: 'https://www.philippinerotarymagazine.com/' },
    { k: 'star', name: 'Zone 10A Public Image Awards', note: 'Honoring Rotary storytelling in the Philippines', href: 'https://rotaryzone10apublicimageawards.com/' },
  ];
  const ext = 'target="_blank" rel="noopener"';
  return `<section class="rw" aria-labelledby="rw-t"><div class="wrap">
<div class="rw-head"><span class="kicker">The Rotary family</span><h2 id="rw-t">One club in a worldwide network</h2>
<p>The Rotary Club of Manila belongs to Rotary International, more than a million neighbors, friends and leaders in clubs around the world.</p></div>
<div class="rw-grid">
<ol class="rw-chain">${chain.map((c) => `<li><a href="${c.href}" ${ext}><span class="dot"></span><span class="t"><small>${esc(c.where)}</small><b>${esc(c.name)}</b></span><span class="go">${esc(c.cta)} ↗</span></a></li>`).join('')}
<li class="here"><div><span class="dot"></span><span class="t"><small>Manila · since 1919</small><b>Rotary Club of Manila</b><em>The first Rotary club in Asia</em></span></div>
<a class="rw-fdn" href="https://rcmanilafoundation.com/" ${ext}><span><small>Our foundation</small><b>RCManila Foundation</b></span><span class="go">↗</span></a></li></ol>
<div class="rw-res"><h3>For members</h3><ul>${res.map((r) => `<li><a href="${r.href}" ${ext}><span class="ic">${ico(r.k)}</span><span class="t"><b>${esc(r.name)}</b><small>${esc(r.note)}</small></span></a></li>`).join('')}</ul></div>
</div></div></section>`;
}
let SITE = 'https://rcmanila.vercel.app';
// Supporters band (above the footer on every public page). Artwork supplied by each supporter:
// a wide 1200x520 for computers and a 300x250 box for phones. Set show:false to hide one.
const SUPPORTERS = [
  { key: 'esguerra', show: true, name: 'Esguerra Foods Agriventures', href: 'https://esguerrakurobuta.com/', alt: 'Esguerra Foods Agriventures: Better food. Elevated lifestyle. esguerrakurobuta.com' },
  { key: 'palawan', show: true, name: 'Palawan for Business', href: 'https://www.palawanpawnshop.com/', alt: 'Palawan for Business: Pang-asenso, pang-negosyo! palawanpawnshop.com' },
];
// Shown only on Balita pages (where these supporters have always advertised), not across the whole site:
// both ads on an issue page, one ad (taking turns by article) on an article page.
function supportersBand(ads) {
  let on = SUPPORTERS.filter((x) => x.show);
  if (!ads || !on.length) return '';
  if (typeof ads === 'string' && ads !== 'all') { let h = 0; for (const ch of ads) h = (h * 31 + ch.charCodeAt(0)) >>> 0; on = [on[h % on.length]]; }
  const card = (x) => `<a class="sup-ad" href="${x.href}" target="_blank" rel="sponsored noopener" aria-label="${esc(x.name)} (opens in a new tab)"><picture><source media="(max-width:560px)" srcset="/assets/supporters/${x.key}-box.jpg"><img src="/assets/supporters/${x.key}-wide.jpg" alt="${esc(x.alt)}" width="1200" height="520" loading="lazy"></picture></a>`;
  return `<section class="sup${on.length === 1 ? ' sup-one' : ''}" aria-label="Supporters of the Rotary Club of Manila"><div class="wrap"><p class="sup-k">With thanks to our ${on.length === 1 ? 'supporter' : 'supporters'}</p><div class="sup-g">${on.map(card).join('')}</div></div></section>`;
}
const WHATSON = ['meeting', 'events', 'speakers'];
const INVOLVED = ['join', 'partner', 'donate'];
// Second row under the header for the grouped sections (same look as the Library tabs).
function subNav(nav) {
  const groups = [
    [WHATSON, 'What’s On', [['meeting', '/meeting', 'Weekly meetings'], ['events', '/events', 'Events'], ['speakers', '/speakers', 'Guest speakers']]],
    [INVOLVED, 'Get Involved', [['join', '/join', 'Join the Club'], ['partner', '/partner', 'Partner with us'], ['donate', '/donate', 'Donate']]],
  ];
  const g = groups.find((x) => x[0].includes(nav));
  if (!g) return '';
  return `<nav class="lib-nav" aria-label="${g[1]}"><div class="wrap">${g[2].map(([k, h, t]) => `<a href="${h}" class="${k === nav ? 'on' : ''}">${t}</a>`).join('')}</div></nav>`;
}
function layout({ title, description, image, url, body, nav = '', type = 'article', ads = '', ld = null }) {
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
${url ? `<link rel="canonical" href="${esc(url)}">` : ''}
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/logo.png">
<link rel="manifest" href="/assets/site.webmanifest">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta name="theme-color" content="#17458f">
<meta name="apple-mobile-web-app-title" content="RC Manila">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,600;0,700;0,800;1,700;1,800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css?v=${ASSET_V}">
<script>window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};</script><script defer src="/_vercel/insights/script.js"></script>
</head>
<body class="pub">
<a class="skip" href="#main">Skip to content</a>
<div class="topbar"><div class="wrap"><span class="tb-l">The first Rotary club in Asia · Established 1919</span><span class="tb-r"><a href="/secretariat">Secretariat login</a><a href="/admin">Editor login</a><a href="/library-admin">Librarian login</a></span></div></div>
<header class="site-head"><div class="wrap">
<a class="logo lockup" href="/" aria-label="Rotary Club of Manila home"><img class="lk-club" src="/assets/club-logo.png" alt="Rotary Club of Manila" width="803" height="286"><span class="lk-rule" aria-hidden="true"></span><img class="lk-msg" src="/assets/msg-2026.png" alt="Create Lasting Impact" width="918" height="509"></a>
<nav class="nav" aria-label="Main">
<a href="/#club">Our Club</a><a href="/projects" class="${nav === 'projects' ? 'on' : ''}">Projects</a><a href="/meeting" class="${WHATSON.includes(nav) ? 'on' : ''}">What’s On</a><a href="/balita" class="${nav === 'balita' ? 'on' : ''}">Balita</a><a href="/library" class="${nav === 'library' ? 'on' : ''}">Library</a><a href="/join" class="${INVOLVED.includes(nav) ? 'on' : ''}">Get Involved</a>
</nav>
<details class="menu"><summary>Menu</summary><div class="menu-panel">
<a href="/#club">Our Club</a><a href="/past-presidents">Past presidents</a><a href="/speakers">Guest speakers</a><a href="/projects">Service projects</a><a href="/youth">Rotaract and Interact</a><a href="/meeting">Meetings</a><a href="/events">Events</a><a href="/balita">Balita</a><a href="/library">Heritage Library</a><a href="/join">Join the Club</a><a href="/partner">Partner or volunteer</a><a href="/donate">Donate</a><a href="#contact">Contact</a>
</div></details>
<a class="btn btn-gold head-cta" href="/meeting">Attend a meeting</a>
</div></header>
${subNav(nav)}<main id="main" tabindex="-1">${body}</main>
${supportersBand(ads)}
<footer class="foot" id="contact"><div class="wrap">
<div style="display:flex;flex-direction:column;gap:14px"><span class="foot-lockup"><img class="lk-club" src="/assets/club-logo-white.png" alt="Rotary Club of Manila" width="803" height="286"><span class="lk-rule" aria-hidden="true"></span><img class="lk-msg" src="/assets/msg-2026-white.png" alt="Create Lasting Impact" width="918" height="509"></span><span>The first Rotary club in Asia. Service above self since 1919.</span></div>
<address style="font-style:normal"><strong>Secretariat</strong>RCM Office, 543 Arquiza St. cor. Grey St.<br>Ermita, Manila<br><a href="${TEL}">(02) 8527-1885</a><br><a href="mailto:${MAIL}">${MAIL}</a></address>
<div><strong>Explore</strong><a href="/projects">Service projects</a><br><a href="/youth">Rotaract, Interact and RYLA</a><br><a href="/past-presidents">Past presidents</a><br><a href="/meeting">Weekly meeting</a> · <a href="/events">Events</a> · <a href="/speakers">Guest speakers</a><br><a href="/balita">Balita archive</a><br><a href="/library">Heritage Library</a><br><a href="/join">Join</a> · <a href="/partner">Partner</a> · <a href="/donate">Donate</a><br><a href="/app">Put the Club on your phone</a><br><a href="https://www.facebook.com/RotaryClubofManila" target="_blank" rel="noopener">Facebook</a> · <a href="https://www.linkedin.com/company/rotary-club-of-manila/" target="_blank" rel="noopener">LinkedIn</a></div>
<div><strong>Rotary family</strong>${FAMILY.map((f) => `<a href="${f.href}" target="_blank" rel="noopener">${esc(f.name)}</a>`).join('<br>')}</div>
<div class="copy">© ${new Date().getFullYear()} Rotary Club of Manila · <a href="/privacy">Privacy</a></div>
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
  const ph = (a.photos || []).find((p) => p.thumb && p.card && p.include !== false);
  const href = `/balita/${issue.issue_no}/${a.slug}`;
  const k = esc(a.kicker || 'Balita');
  let visual;
  if (ph) {
    const c = ph.card, r = Math.min(1.6, Math.max(0.7, c.width / c.height));
    visual = `<div class="sc-img" style="aspect-ratio:${r.toFixed(3)}"><img src="${img(c.path, Math.min(700, c.width))}" alt="" width="${c.width}" height="${c.height}" loading="lazy"></div>`;
  } else if (!(a.photos || []).some((x) => x.nocard) && leadPhoto(a) && leadPhoto(a).path && (leadPhoto(a).width || 400) >= 220) {
    // No cut card yet: show the story's best photo, cropped to a steady 3:2 frame.
    const p = leadPhoto(a);
    visual = `<div class="sc-img" style="aspect-ratio:1.5"><img src="${img(p.path, 700)}" alt="" loading="lazy" style="${focusCss(p)}"></div>`;
  } else {
    visual = `<div class="sc-none"><img src="/assets/club-logo-white.png" alt="" aria-hidden="true"><span>${k}</span></div>`;
  }
  return `<a class="story sc" href="${href}">${visual}<span class="eyebrow">${k}${a.printed_pages ? ' · ' + esc(a.printed_pages) : ''}</span><h3>${esc(a.title)}</h3>${a.dek ? `<p>${esc(a.dek)}</p>` : ''}</a>`;
}

const ICOLS = 'id,issue_no,issue_date,meeting,guest,summary,cover_path,pages,page_count,status,publish_at,updated_at,source,pdf_url,heyzine_url';
const ACOLS = 'id,issue_id,slug,sort,kicker,title,dek,byline,body,photos,page_from,page_to,printed_pages,lead,included,source,legacy_url';
async function liveIssues(limit = 20, cols = ICOLS) {
  return q(`rcm_issues?select=${cols}&order=issue_date.desc,issue_no.desc&limit=${limit}`);
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
// What search engines and AI assistants read about the Club (schema.org).
const ORG_LD = (origin) => ({
  '@context': 'https://schema.org', '@type': 'NGO', '@id': origin + '/#club',
  name: 'Rotary Club of Manila', alternateName: ['RC Manila', 'RCM', 'Rotary Manila'],
  description: 'The Rotary Club of Manila, founded in 1919, is the first Rotary club in Asia. Its members serve Manila through service projects in health, education, disaster relief and the environment, and meet every Thursday.',
  url: origin + '/', logo: origin + '/assets/club-logo.png', foundingDate: '1919',
  email: MAIL, telephone: '+63-2-8527-1885',
  address: { '@type': 'PostalAddress', streetAddress: '543 Arquiza St. cor. Grey St., Ermita', addressLocality: 'Manila', addressCountry: 'PH' },
  parentOrganization: { '@type': 'Organization', name: 'Rotary International', url: 'https://www.rotary.org/' },
  sameAs: ['https://www.facebook.com/RotaryClubofManila', 'https://www.linkedin.com/company/rotary-club-of-manila/', 'https://en.wikipedia.org/wiki/Rotary_Club_of_Manila'],
});
const PROJECTS = require('./projects.js');
const PRES = require('./presidents.js');
const pSrc = (src, w) => (src && src[0] === '/' ? src : img(src, w));
const LIB = require('./library-view.js')({ layout: (o) => layout(o), esc, q, fmtDate, PRES, searchBalita, img });
// "From the archive": old Balita pages about the same subject, shown on stories and project pages.
const ARCHIVE_TOPICS = [[/alay lakad/i, 'Alay Lakad'], [/polio/i, 'polio'], [/hospicio/i, 'Hospicio de San Jose'], [/tower award/i, 'TOWER awards'], [/pasig river/i, 'Pasig River'], [/medical mission/i, 'medical mission'], [/typhoon|flood/i, 'typhoon relief'], [/scholar/i, 'scholarship'], [/chorale/i, 'chorale'], [/blood/i, 'blood donation'], [/paul harris/i, 'Paul Harris'], [/malnutrition|feeding program/i, 'feeding program'], [/christmas/i, 'Christmas party'], [/induction|turnover/i, 'induction'], [/anniversary/i, 'anniversary']];
const archiveTopic = (text) => { for (const [re, t] of ARCHIVE_TOPICS) if (re.test(text || '')) return t; return null; };
async function archiveBox(topic, intro) {
  if (!topic) return '';
  const rows = await q(`rpc/rcm_lib_related?q=${encodeURIComponent(topic)}&lim=3&before_year=2012`).catch(() => []);
  if (!rows.length) return '';
  return `<aside class="from-arch"><div class="fa-head"><span class="kicker">From the archive</span><h2>${esc(intro || 'The Club has done this before')}</h2></div>
<div class="fa-row">${rows.map((r) => `<a href="/library/balita/${esc(r.vol)}/${r.issue_no}#p${r.rel}"><span class="im"><img src="${esc(LIB.anySrc(r.image_path, 500))}" alt="" loading="lazy"></span><span class="t"><b>${r.year}</b><small>Balita No. ${r.issue_no}</small><span>${esc(String(r.snippet || '').replace(/[«»]/g, '').replace(/\s+/g, ' ').slice(0, 140))}…</span></span></a>`).join('')}</div>
<a class="link-arrow" href="/library/search?q=${encodeURIComponent(topic)}">More in the Heritage Library</a></aside>`;
}
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

async function projectPage(origin, slug) {
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
${await archiveBox(p.archive, 'The Club’s earlier work on this').catch(() => '')}
<section class="pj-sources"><h2>Sources</h2><ul>${p.sources.map(([href, t]) => `<li>${href ? `<a href="${href}">${esc(t)}</a>` : esc(t)}</li>`).join('')}</ul></section>
</div></div>
<section class="pj-more"><div class="wrap"><div class="section-head"><h2>More service projects</h2><a class="link-arrow" href="/projects">All projects</a></div>
<div class="pj-cards">${others.map((x) => projectCard(x)).join('')}</div></div></section>
</article>
${routesStrip()}`;
  return layout({ title: `${p.title} · Rotary Club of Manila`, description: p.dek, image: p.hero.src[0] === '/' ? origin + p.hero.src : img(p.hero.src, 1200), url, body, nav: 'projects' });
}


const presId = (x) => x.id || 'p-' + x.years.slice(0, 4) + (x.years === '1945–1946' ? 'b' : '');
// ---------- Guest speakers: who has addressed the Club's Thursday meetings, from the Balita and the meeting list ----------
async function speakersPage(origin) {
  const [rows, guests, arts, upcoming, pastMt] = await Promise.all([
    q('rcm_speakers?select=issue_id,issue_no,issue_date,name,title,topic&hidden=is.false&order=issue_date.desc&limit=3000').catch(() => []),
    q('rcm_issues?select=id,issue_no,issue_date,guest&status=eq.published&guest=not.is.null&order=issue_date.desc&limit=2000').catch(() => []),
    q('rcm_articles?select=issue_id,slug,title&kicker=eq.Guest%20speaker&limit=2000').catch(() => []),
    q(`rcm_meetings?select=meeting_date,label,speaker,speaker_title,topic&status=eq.published&speaker=not.is.null&meeting_date=gte.${new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)}&order=meeting_date&limit=6`).catch(() => []),
    q('rcm_meetings?select=meeting_date,speaker,speaker_title,topic&status=eq.published&speaker=not.is.null&order=meeting_date.desc&limit=500').catch(() => []),
  ]);
  const artBy = new Map(); for (const a of arts) if (!artBy.has(a.issue_id)) artBy.set(a.issue_id, a);
  const list = rows.slice();
  const have = new Set(rows.map((r) => r.issue_id));
  for (const g of guests) if (!have.has(g.id)) { const [name, ...rest] = String(g.guest).split(','); list.push({ issue_id: g.id, issue_no: g.issue_no, issue_date: g.issue_date, name: name.trim(), title: rest.join(',').trim() || null, topic: null }); }
  // Meetings entered by the Secretariat fill in weeks the Balita list does not cover (for example, this year's meetings before their issue is read).
  const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z]/g, '');
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  for (const m of pastMt) {
    if (!m.speaker || m.meeting_date >= today) continue;
    const t = Date.parse(m.meeting_date), last = norm(m.speaker.split(/\s+/).pop());
    if (list.some((x) => x.issue_date && Math.abs(Date.parse(x.issue_date) - t) < 11 * 864e5 && norm(x.name).includes(last))) continue;
    list.push({ issue_id: null, issue_no: null, issue_date: m.meeting_date, name: m.speaker, title: m.speaker_title, topic: m.topic, meeting: true });
  }
  list.sort((a, b) => String(b.issue_date).localeCompare(String(a.issue_date)));
  const ry = (d) => { const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)); const s = m >= 7 ? y : y - 1; return `${s}–${String(s + 1).slice(2)}`; };
  const groups = new Map(); for (const x of list) { if (!x.issue_date) continue; const k = ry(x.issue_date); (groups.get(k) || groups.set(k, []).get(k)).push(x); }
  const row = (x) => { const a = artBy.get(x.issue_id); const hay = [x.name, x.title, x.topic].filter(Boolean).join(' ').toLowerCase();
    return `<li class="spk" data-q="${esc(hay)}"><span class="spk-d">${esc(fmtDate(x.issue_date))}</span><div><strong>${esc(x.name)}</strong>${x.title ? `<span class="spk-t">${esc(x.title)}</span>` : ''}${x.topic ? `<em>“${esc(x.topic)}”</em>` : ''}</div><span class="spk-l">${x.issue_no ? `<a href="/balita/${x.issue_no}">Balita No. ${x.issue_no}</a>` : `<a href="/meetings/${x.issue_date}">Meeting page</a>`}${a ? `<a href="/balita/${x.issue_no}/${esc(a.slug)}">Read about the talk</a>` : ''}</span></li>`; };
  const up = upcoming.length ? `<section class="wrap spk-up"><span class="kicker">Coming up</span><ul class="spk-list">${upcoming.map((m) => `<li class="spk"><span class="spk-d">${esc(fmtDate(m.meeting_date))}</span><div><strong>${esc(m.speaker)}</strong>${m.speaker_title ? `<span class="spk-t">${esc(m.speaker_title)}</span>` : ''}${m.topic ? `<em>“${esc(m.topic)}”</em>` : ''}</div><span class="spk-l"><a href="/meetings/${m.meeting_date}">Sign up to attend</a></span></li>`).join('')}</ul></section>` : '';
  const body = `<section class="wrap pj-index-head"><span class="kicker">Thursday meetings</span><h1>Guest speakers</h1>
<p class="lead-p">Leaders from government, business, the professions and Rotary who have addressed the Club at its weekly meetings since 2015, as reported in the Balita. ${list.length} talks so far.</p>
<label class="spk-search"><span>Find a speaker, office or topic</span><input type="search" id="spk-q" placeholder="e.g. Senator, Bangko Sentral, climate" autocomplete="off"></label></section>
${up}
<section class="wrap" style="padding-bottom:64px">${[...groups.entries()].map(([k, xs]) => `<div class="spk-yr"><h2>Rotary year ${esc(k)} <small>${xs.length}</small></h2><ul class="spk-list">${xs.map(row).join('')}</ul></div>`).join('') || '<p class="muted-p">The list is being prepared.</p>'}
<p class="h-source">Names, positions and topics as printed in the Balita at the time. Corrections are welcome: <a href="mailto:${MAIL}?subject=Guest%20speakers%20page">${MAIL}</a>.</p></section>
<script>(function(){var q=document.getElementById('spk-q');if(!q)return;q.addEventListener('input',function(){var v=q.value.trim().toLowerCase();document.querySelectorAll('.spk-yr .spk').forEach(function(li){li.hidden=!!v&&li.getAttribute('data-q').indexOf(v)<0});document.querySelectorAll('.spk-yr').forEach(function(g){g.hidden=!g.querySelector('.spk:not([hidden])')})})})();</script>`;
  return layout({ title: 'Guest speakers · Rotary Club of Manila', description: `${list.length} guest speakers who have addressed the Rotary Club of Manila's weekly meetings since 2015.`, url: origin + '/speakers', body, nav: 'speakers' });
}
function presidentsPage(origin) {
  const list = PRES.presidents;
  const current = list[list.length - 1];
  const card = (x, i) => `<button type="button" class="pres-card" id="${presId(x)}" data-p="${i}" aria-haspopup="dialog"><img src="${x.img}" alt="" width="400" height="600" loading="lazy"><b>${esc(x.name)}</b><span>${esc(x.years)}${x === current ? ' · Current' : ''}</span></button>`;
  const detail = (x, i) => {
    const src = [x.profile ? 'Presidential profiles, Rotary Club of Manila (2026)' : x.book || !x.summary ? '“The Work That Endures”, the Club’s 107th anniversary history (2026)' : '', ...x.balita.map(([u, t]) => `<a href="${esc(u)}">Balita: ${esc(t)}</a>`)].filter(Boolean);
    return `<template id="pt-${i}"><img src="${x.img}" alt="Portrait of ${esc(x.name)}" width="320" height="320"><div><span class="kicker">${x === current ? 'President, ' : ''}${esc(x.years)}</span><h2>${esc(x.name)}</h2>
${x.summary ? `<p>${esc(x.summary)}</p>` : `<p class="muted-p">The Club’s centennial history lists ${esc(x.name)} as president for ${esc(x.years)} but does not describe his term in detail.</p>`}
<p class="pres-src">Source: ${src.join(' · ')}</p><p><a class="link-arrow" href="/library/name?q=${encodeURIComponent(x.name)}">See him in the archive</a></p></div></template>`;
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

// "Put the Club on your phone": how to add rcmanila.org to the home screen (the site installs like an app).
// iPhone pictures for the steps (drawn, so they stay sharp): Safari's Share button and "more" button.
const ICON_SHARE = '<svg class="ico" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_MORE = '<svg class="ico" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="7.5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="16.5" cy="12" r="1.5" fill="currentColor"/></svg>';
const ICON_ADD = '<svg class="ico" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

// "Put the Club on your phone": how to add rcmanila.org to the home screen (the site installs like an app).
// Android can show a one-tap button; Apple does not allow that on iPhone, so the iPhone steps come with
// pictures and an arrow pointing at Safari's Share button.
function appPage(origin) {
  const body = `<section class="wrap pj-index-head"><span class="kicker">On your phone</span><h1>Put the Club on your home screen</h1>
<p class="lede">Add rcmanila.org to your phone once, and the Club’s icon sits with your other apps. One tap opens the weekly meeting, events, the Balita and the library. Nothing to download from an app store, and no account needed.</p>
<div class="app-inst"><button type="button" class="btn btn-gold" id="app-add" hidden>Add to home screen</button><p class="app-done" id="app-done" hidden>✓ You are already using the Club’s app on this phone.</p></div></section>
<section class="wrap app-steps">
<div class="app-card" id="app-ios"><h2>iPhone or iPad</h2>
<p class="muted-p">Use <b>Safari</b> (the blue compass). Apple asks for three taps:</p>
<ol class="app-big">
<li><span class="app-n">1</span><div>Tap the <b>Share</b> button ${ICON_SHARE} at the bottom of the screen.<small>Don’t see it? Tap the <b>more</b> button ${ICON_MORE} at the bottom right first, then <b>Share</b>.</small></div></li>
<li><span class="app-n">2</span><div>Scroll down the list and tap <b>Add to Home Screen</b> ${ICON_ADD}</div></li>
<li><span class="app-n">3</span><div>Tap <b>Add</b> at the top right. The Rotary wheel icon, <b>RC Manila</b>, appears on your home screen.</div></li>
</ol></div>
<div class="app-card" id="app-android"><h2>Android phone</h2><ol class="app-big">
<li><span class="app-n">1</span><div>In <b>Chrome</b>, tap the <b>three dots</b> at the top right. (In Edge: the <b>…</b> at the bottom.)</div></li>
<li><span class="app-n">2</span><div>Tap <b>Add to Home screen</b> (on some phones: <b>Install app</b> or <b>Add to phone</b>).</div></li>
<li><span class="app-n">3</span><div>Tap <b>Add</b> or <b>Install</b>. The Rotary wheel icon, <b>RC Manila</b>, appears on your home screen.</div></li>
</ol></div>
<p class="muted-p app-help">Need a hand? Ask at the Secretariat’s table at the Thursday meeting and we’ll set it up for you.</p>
</section>
<div class="app-point" id="app-point" hidden title="Tap to hide"><span>Tap ${ICON_SHARE} below, then <b>Add to Home Screen</b></span><i aria-hidden="true">↓</i></div>
<script>(function(){
var ua=navigator.userAgent,ios=/iPhone|iPad|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),android=/Android/.test(ua);
var standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
if(standalone){document.getElementById('app-done').hidden=false;}
var steps=document.querySelector('.app-steps');
if(android)steps.insertBefore(document.getElementById('app-android'),steps.firstChild);
if(ios&&!standalone&&/Safari/.test(ua)&&!/CriOS|FxiOS|EdgiOS/.test(ua)&&!/iPad/.test(ua)){var pt=document.getElementById('app-point'),sv=Number((/Version\\/(\\d+)/.exec(ua)||[])[1]||0);
// Safari 26 and later keeps Share inside the "more" (...) button at the bottom right; older Safari has Share in the bottom bar.
if(sv>=26){pt.classList.add('right');pt.querySelector('span').innerHTML='Tap ${ICON_MORE.replace(/'/g,"\\'")} below, then <b>Share</b>, then <b>Add to Home Screen</b>';}
pt.hidden=false;pt.onclick=function(){pt.hidden=true;};}
var ev=null,b=document.getElementById('app-add');window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();ev=e;b.hidden=false;});b.addEventListener('click',function(){if(!ev)return;ev.prompt();ev.userChoice.finally(function(){ev=null;b.hidden=true;});});})();</script>`;
  return layout({ title: 'Put the Club on your phone · Rotary Club of Manila', description: 'Add rcmanila.org to your phone’s home screen: one tap to the weekly meeting, events, the Balita and the library.', url: `${origin}/app`, body, type: 'website' });
}

// New Generations: the Rotaract, Interact and RYLA work the Club sponsors, with the latest Balita stories about it.
async function youthPage(origin) {
  let stories = [];
  try {
    const arts = await q(`rcm_articles?select=id,issue_id,slug,kicker,title,dek,photos,printed_pages&included=eq.true&or=(title.ilike.*rotaract*,title.ilike.*interact*,title.ilike.*ryla*,title.ilike.*youth*)&order=id.desc&limit=60`);
    const keep = arts.filter((a) => /\b(rotaract|interact|ryla|youth)\b/i.test(a.title) && !/grant/i.test(a.title));
    const ids = [...new Set(keep.map((a) => a.issue_id))];
    const iss = ids.length ? await q(`rcm_issues?select=id,issue_no,issue_date&status=eq.published&id=in.(${ids.join(',')})`) : [];
    const by = new Map(iss.map((i) => [i.id, i]));
    stories = keep.filter((a) => by.has(a.issue_id)).map((a) => ({ a, i: by.get(a.issue_id) })).sort((x, y) => String(y.i.issue_date).localeCompare(String(x.i.issue_date))).slice(0, 9);
  } catch (e) { stories = []; }
  const st = (slug) => { const x = stories.find((s) => s.a.slug === slug); return x ? `/balita/${x.i.issue_no}/${x.a.slug}` : null; };
  const more = (href, t) => href ? `<a class="link-arrow" href="${href}">${t}</a>` : '';
  const body = `<section class="h-join pg-hero"><img class="bg" src="${H('people-of-action')}" alt="" aria-hidden="true"><div class="wrap">
<span class="kicker">New Generations</span><h1>Young leaders in Rotary</h1>
<p>The Rotary Club of Manila sponsors and works alongside Rotaract and Interact clubs, and supports young people at RYLA, Rotary’s youth leadership programme.</p>
<div class="h-cta"><a class="btn btn-gold" href="/partner">Bring Rotary to your school</a><a class="btn btn-ghost" href="#stories">Latest stories</a></div>
</div></section>

<section class="wrap section">
<div class="section-head"><h2>Three ways young people take part</h2></div>
<div class="pg-three">
<div><b>Rotaract: young adults, 18 and up</b><p>The Rotaract Club of Manila, chartered with the Club as its sponsor, marked 25 years of service in July 2025 and was named Overall Most Outstanding Club in District 3810 that year. In 2025 the Club also began sponsoring a new Rotaract Club of San Beda University.</p>${more(st('rotaract-club-of-manila-marks-25-years'), '25 years of Rotaract Manila')}${more(st('rcm-sponsors-chartering-of-rotaract-club-of-san-beda-university'), 'Rotaract at San Beda')}</div>
<div><b>Interact: students, 12 to 18</b><p>Interact clubs give high school students their first taste of service. The Club co-hosted the District 3810 Interact Assembly in September 2025 and joins the district’s yearly Interact sportsfest.</p>${more(st('rc-manila-receives-certificate-as-co-host-of-district-interact-assembly'), 'The 2025 Interact Assembly')}</div>
<div><b>RYLA: leadership for youth</b><p>The Rotary Youth Leadership Awards is the district’s leadership programme for young people. Club members help run it and cheer on its graduates.</p>${more(st('youth-service-ryla-2026'), 'RYLA 2026')}</div>
</div>
<p class="muted-p" style="margin-top:22px;max-width:760px">Every Rotary club works under Rotary International’s youth protection policy, which sets how adults and young people work together safely.</p>
</section>

${stories.length ? `<section class="h-sec alt" id="stories" style="padding-block:56px"><div class="wrap"><div class="section-head"><h2>From the Balita</h2><a class="link-arrow" href="/balita?q=rotaract">More stories</a></div><div class="sgrid">${stories.map((x) => storyCard(x.i, x.a)).join('')}</div></div></section>` : ''}
${routesStrip('More ways to take part')}`;
  return layout({ title: 'Rotaract, Interact and RYLA · Rotary Club of Manila', description: 'How the Rotary Club of Manila supports young leaders: the Rotaract and Interact clubs it sponsors and the RYLA leadership programme.', image: origin + H('people-of-action'), url: origin + '/youth', body, nav: 'join' });
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

function privacyPage(origin) {
  const body = `<section class="wrap pj-index-head"><span class="kicker">Privacy</span><h1>Privacy policy</h1>
<p class="lead-p">How the Rotary Club of Manila handles the information you give us on rcmanila.org.</p></section>
<section class="wrap section prose" style="padding-top:8px;max-width:760px">
<h2>What we collect</h2>
<p>We only collect what you type into a form on this website: your name, email address, phone number, company or Rotary club, and any message, when you sign up for a meeting or event, send a membership or partnership inquiry, or tell us about a donation. Pages you read are not tied to your name.</p>
<h2>How we use it</h2>
<p>The Club Secretariat uses it to confirm your sign-up, prepare meetings and events, reply to your inquiry and acknowledge donations. Names of people signed up for a meeting or event may be shown on that page only when the sign-up form says so.</p>
<h2>Who sees it</h2>
<p>Only the Secretariat and the Club officers who need it. We never sell or rent your information. It is stored with our hosting providers (Supabase and Vercel) and is not shared with anyone else.</p>
<h2>Photos</h2>
<p>We publish photos of Club meetings, projects and events so the community can see Rotary’s work. We ask people who can be clearly recognised for their permission before a close-up photo of them is published. We do not publish photos in which a child or a patient can be identified unless a parent, guardian or the person has agreed. Photo albums from the Club’s archive are checked before they go online, and albums from medical missions, homes and schools are held back until someone has looked through them.</p>
<p>If you see a photo of yourself or your child that you would like removed, write to the Secretariat at <a href="mailto:${MAIL}">${MAIL}</a> and we will take it down.</p>
<h2>Facebook</h2>
<p>The Club’s Facebook Page shares new Balita issues and events from this website. The website does not receive or store any information about Facebook users.</p>
<h2>Your choices</h2>
<p>You can remove yourself from a meeting or event list on the same page you signed up on, or ask the Secretariat to correct or delete anything you sent us. Your device may remember small settings (such as a dismissed tip or your own sign-ups) in its browser storage; clearing your browser data removes them.</p>
<h2>Contact</h2>
<p>RCM Office, 543 Arquiza St. cor. Grey St., Ermita, Manila · <a href="${TEL}">(02) 8527-1885</a> · <a href="mailto:${MAIL}">${MAIL}</a></p>
<p class="muted-p">This policy follows the Philippine Data Privacy Act of 2012. Last updated October 2026.</p>
</section>`;
  return layout({ title: 'Privacy policy · Rotary Club of Manila', description: 'How the Rotary Club of Manila handles information submitted on rcmanila.org.', image: origin + '/assets/club-logo.png', url: origin + '/privacy', body });
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
// "This week in Club history": up to three things from this same week in past years (old Balita, event albums, recent Balita).
function historyPicks(items) {
  if (!Array.isArray(items) || !items.length) return [];
  const round = (y) => (y % 25 === 0 ? 3 : y % 10 === 0 ? 2 : y % 5 === 0 ? 1 : 0);
  const best = (list) => list.slice().sort((a, b) => (round(b.years_ago) - round(a.years_ago)) || (!!b.blurb - !!a.blurb) || (b.years_ago - a.years_ago))[0];
  const picks = [];
  const old = items.filter((x) => x.kind === 'old').sort((a, b) => (!!b.blurb - !!a.blurb) || (b.years_ago - a.years_ago))[0];
  if (old) picks.push(old);
  const gal = best(items.filter((x) => x.kind === 'gallery')); if (gal) picks.push(gal);
  const bal = best(items.filter((x) => x.kind === 'balita' && !picks.some((p) => p.years_ago === x.years_ago))); if (bal) picks.push(bal);
  for (const x of items.slice().sort((a, b) => b.years_ago - a.years_ago)) { if (picks.length >= 3) break; if (!picks.includes(x) && !picks.some((p) => p.years_ago === x.years_ago && p.kind === x.kind)) picks.push(x); }
  return picks.slice(0, 3);
}
const ARCH = 'https://archive.rcmanila.org/';
const histPic = (x, w) => !x.image_path ? '' : x.kind === 'gallery' ? ARCH + x.image_path.replace(/(\.[a-z]+)$/i, '-t$1').split('/').map(encodeURIComponent).join('/') : img(x.image_path, w || 480);
function historyWeek(items) {
  const picks = historyPicks(items);
  if (!picks.length) return '';
  const pic = (x) => !x.image_path ? '' : x.kind === 'gallery' ? ARCH + x.image_path.replace(/(\.[a-z]+)$/i, '-t$1').split('/').map(encodeURIComponent).join('/') : img(x.image_path, 480);
  const day = (iso) => new Date(iso + 'T12:00:00+08:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' });
  const card = (x) => {
    const im = pic(x);
    const face = im ? `<img src="${esc(im)}" alt="" loading="lazy"${x.kind === 'balita' ? ' class="cov"' : ''}>` : `<span class="h-wk-tile"><b>${esc(String(x.item_date).slice(0, 4))}</b><small>${esc(x.title)}</small></span>`;
    const what = x.kind === 'gallery' ? 'Photographs' : 'The Balita';
    return `<a class="h-wk" href="${esc(x.link)}"><span class="im">${face}</span><span class="t"><span class="yrs">${x.years_ago} year${x.years_ago === 1 ? '' : 's'} ago this week</span><strong>${esc(x.kind === 'gallery' ? x.title : x.blurb || x.title)}</strong><small>${what} · ${esc(day(x.item_date))}${x.kind !== 'gallery' && x.blurb ? ' · ' + esc(x.title) : ''}</small></span></a>`;
  };
  return `<div class="h-week"><h3>This week in Club history</h3><div class="h-week-row">${picks.slice(0, 3).map(card).join('')}</div></div>`;
}
// The Club's own facts for the Heritage Library's "Ask the archive" (read by the rcm-museum function once a day).
function askFacts() {
  const rows = [], add = (kind, title, url, year, body) => rows.push({ kind, title, url, year: year || null, body: String(body || '').replace(/\s+/g, ' ').trim() });
  const cur = PRES.presidents[PRES.presidents.length - 1];
  add('club', 'The founding of the Rotary Club of Manila (1919)', '/past-presidents', 1919, 'In January 1919, Leon J. Lambert and a small group of business leaders met at the Manila Hotel to form a Rotary club; Lambert called the first meeting and became the first president. On 1 June 1919, Rotary International granted Charter No. 478, making the Rotary Club of Manila the first Rotary club in the Philippines and in Asia. The Club launched its newsletter, The Rotary Balita, in April 1919.');
  add('club', 'The Club today', '/meeting', null, `The Rotary Club of Manila belongs to Rotary District 3810 (Metro Manila) and Rotary Zone 10A. It meets every Thursday at 12:15 PM for fellowship and service; guests are welcome. Its president for ${cur.years} is ${cur.name}. ${PRES.presidents.length} presidential terms have been served since 1919. Rotary International's message for 2026-27 is "Create Lasting Impact".`);
  for (const d of PRES.decades) add('history', `The Club, ${d.label}: ${d.title}`, `/past-presidents#d-${d.key}`, Number(d.label.slice(0, 4)), d.blurb);
  for (const i of PRES.interludes || []) add('history', `${i.title} (${i.years})`, '/past-presidents', Number(i.years.slice(0, 4)), i.text);
  for (const x of PRES.presidents) add('president', `${x.name}, president ${x.years}`, `/past-presidents#${presId(x)}`, Number((x.years.match(/\d{4}/) || [])[0]) || null, `${x.name} was president of the Rotary Club of Manila in ${x.years}. ${x.summary || ''}`);
  for (const p of PROJECTS) add('project', p.title, `/projects/${p.slug}`, null, [p.kicker, p.dek, ...(p.need || []), ...(p.did || []).map((d) => (Array.isArray(d) ? d.join(' ') : d)), ...(p.result || []).map((r) => (Array.isArray(r) ? r.join(' ') : r)), p.next].filter(Boolean).join(' '));
  for (const y of YEARS) add('history', `The Club in ${y.year}`, '/', Number(y.year), y.text);
  for (const f of FLAGSHIP) add('project', f.title, f.link || '/projects', null, `${f.tag || ''}. ${f.text}`);
  for (const f of SIGNATURE) add('award', f.title, '/projects', null, f.text);
  add('project', FEATURE.title, '/projects/project-river', null, `${FEATURE.text} ${FEATURE.quote || ''}`);
  return rows;
}

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
  const exNow = LIB.currentExhibit(await LIB.exhibits().catch(() => []));
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
  const offEv = isOff(mt) ? await sameDayEvent(mt.meeting_date) : null;
  const wkMeetingFinal = isOff(mt) ? `<a class="hx-item" href="${offEv ? `/events/${esc(offEv.slug)}` : `/meetings/${mt.meeting_date}`}"><span class="hx-date"><b>${new Date(mt.meeting_date + 'T12:00:00+08:00').toLocaleDateString('en-GB', { timeZone: 'Asia/Manila', day: 'numeric' })}</b>${new Date(mt.meeting_date + 'T12:00:00+08:00').toLocaleDateString('en-GB', { timeZone: 'Asia/Manila', month: 'short' }).toUpperCase()}</span><span class="hx-txt"><small>No weekly meeting this Thursday</small><strong>${offEv ? `Join us at the ${esc(offEv.title)}` : esc(mt.topic || 'Meetings resume next week')}</strong>${offEv && offEv.venue ? `<em>${esc(offEv.time_text ? offEv.time_text + ' · ' : '')}${esc(offEv.venue)}</em>` : ''}</span><span class="hx-go">${offEv ? 'Sign up →' : 'Details →'}</span></a>` : wkMeeting;
  const soonEv = (await upcomingEvents(6)).filter((e) => e.event_date >= manilaToday() && Date.parse(e.event_date) - Date.now() < 21 * 864e5 && !(offEv && e.slug === offEv.slug))[0];
  const wkEvent = soonEv ? `<a class="hx-item" href="/events/${esc(soonEv.slug)}"><span class="hx-date"><b>${new Date(soonEv.event_date + 'T12:00:00+08:00').toLocaleDateString('en-GB', { timeZone: 'Asia/Manila', day: 'numeric' })}</b>${new Date(soonEv.event_date + 'T12:00:00+08:00').toLocaleDateString('en-GB', { timeZone: 'Asia/Manila', month: 'short' }).toUpperCase()}</span><span class="hx-txt"><small>${esc(soonEv.kicker ? soonEv.kicker.split(' · ')[0] : 'Club event')}</small><strong>${esc(soonEv.title)}</strong>${soonEv.venue ? `<em>${esc(soonEv.venue)}</em>` : ''}</span><span class="hx-go">Sign up →</span></a>` : '';
  // The headline is the story the editor picked with "Feature on homepage" (the printed cover is not always the guest speaker).
  const headStory = arts.find((a) => a.lead) || coverStory || arts[0] || null;
  const alsoStory = arts.find((a) => a !== headStory) || null;
  const wkBalita = issue ? `<a class="hx-item" href="/balita/${issue.issue_no}"><span class="hx-cov">${issue.cover_path ? `<img src="${coverSrc(issue, 120)}" alt="">` : ''}</span><span class="hx-txt"><small>Balita No. ${issue.issue_no} · ${esc(fmtDate(issue.issue_date))}</small><strong>${esc(headStory ? headStory.title : guestName ? `Guest speaker: ${guestName}` : 'The latest issue')}</strong>${headStory && coverStory && coverStory !== headStory && guestName ? `<em>Guest speaker: ${esc(guestName)}</em>` : alsoStory ? `<em>Also: ${esc(alsoStory.title)}</em>` : ''}</span><span class="hx-go">Read →</span></a>`
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
<div class="hx-week"><div class="wrap hx-week-in${wkEvent ? ' three' : ''}"><span class="hx-week-l">This week</span>${wkMeetingFinal}${wkEvent}${wkBalita}</div></div>
</section>


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

<section class="poa" id="action"><div class="wrap">
<div class="section-head home-head"><div><span class="kicker">Our service · Rotary 2026–27</span><h2 class="h-theme"><img src="/assets/cli-h-blue.png" alt="Create Lasting Impact" width="1470" height="88"></h2></div><a class="link-arrow" href="/projects">All service projects</a></div>
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




<section class="h-heritage" id="history"><div class="wrap">
<div class="h-head"><div><span class="kicker">107 years · Asia’s first Rotary club</span><h2>Where Rotary in Asia began</h2><p>In 1919, Leon Lambert and a small group of business leaders met at the Manila Hotel and formed the first Rotary club in the Philippines and in Asia, Charter No. 478. More than a century later, the Club still meets every Thursday for fellowship and service, led in 2026–27 by President Reginald T. Yu.</p></div></div>
<div class="h-lib"><a class="h-lib-im" href="/library"><img src="${H('heritage-library')}" alt="The Rotary Balita of 8 July 1948 with Dr. Emilio Javier on the cover, beside pages from the same issue and a 1936 photograph of Club members" width="1200" height="800" loading="lazy"></a>
<div class="h-lib-t"><span class="kicker">The Heritage Library</span><h3>107 years in the Club’s own words and pictures</h3>
<p>Every Balita since 1948, nearly 12,000 photos, the trophy room, past presidents and Club films. Look up your name, or your father’s.</p>
<a class="btn btn-gold" href="/library">Open the library</a>
${exNow ? `<a class="h-lib-ex" href="/library/exhibit/${esc(exNow.slug)}"><small>This month’s exhibit</small>${esc(exNow.title)} →</a>` : ''}</div></div>
<div class="h-pres"><div class="h-pres-head"><h3>${PRES.presidents.length} presidential terms since 1919</h3><a class="link-arrow" href="/past-presidents">See every president and his term</a></div>
<div class="h-pres-row">${PRES.presidents.slice(-8).reverse().map((x) => `<a href="/past-presidents#${presId(x)}"><img src="${x.img}" alt="" width="400" height="600" loading="lazy"><b>${esc(x.name)}</b><span>${esc(x.years)}</span></a>`).join('')}</div></div>
</div></section>



<section class="h-join" id="join"><img class="bg" src="${H('people-of-action')}" alt="" aria-hidden="true" loading="lazy"><div class="wrap">
<span class="kicker">Membership</span>
<h2>Leadership becomes more meaningful in the service of others.</h2>
<p>Join business, professional and civic leaders working for a stronger Manila. Start by joining us at a Thursday meeting as a guest.</p>
<div class="h-cta"><a class="btn btn-gold" href="/meeting">Attend as a guest</a><a class="btn btn-ghost" href="/join">How to join</a></div>
<p class="h-more">Or <a href="/partner">partner with us</a>, <a href="/donate">support a project</a> or <a href="/projects">explore our projects</a>.</p>
</div></section>
${rotaryWorld()}
<div class="app-tip" id="app-tip" hidden><a href="/app"><img src="/assets/apple-touch-icon.png" alt="" width="36" height="36"><span><b>Put the Club on your phone</b>One tap to the meeting, events and the Balita.</span></a><button type="button" aria-label="Not now">×</button></div>
<script>(function(){var t=document.getElementById('app-tip');if(!t)return;var ua=navigator.userAgent;
if(!/iPhone|Android/.test(ua)||window.matchMedia('(display-mode: standalone)').matches||navigator.standalone)return;
// Shown on at most 3 visits, and never again once closed with x (remembered on that phone).
try{if(localStorage.getItem('rcm-app-tip'))return;var n=+(localStorage.getItem('rcm-app-tip-n')||0);if(n>=3)return;localStorage.setItem('rcm-app-tip-n',String(n+1));}catch(e){return;}
setTimeout(function(){t.hidden=false;},1500);
t.querySelector('button').onclick=function(){t.hidden=true;try{localStorage.setItem('rcm-app-tip','1');}catch(e){}};})();</script>
`;
  return layout({
    title: 'Rotary Club of Manila',
    description: 'Asia’s first Rotary club, serving since 1919. See our projects, read the Balita and join us every Thursday.',
    image: pSrc((cover || COVER_FALLBACK).image_path, 1200), // the share picture follows the homepage cover
    url: origin + '/', body, type: 'website', ld: ORG_LD(origin),
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
<div><span class="eyebrow">The official publication of the Rotary Club of Manila</span><h1 style="font-size:48px">Balita</h1><p class="arch-lede">Every issue of the Club’s weekly publication since 2015, grouped by Rotary year. Search finds names, projects and topics inside every issue. Older issues, as printed from 1948 to 2019, are in the <a href="/library/balita">Heritage Library</a>.</p></div>
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
  // The same issue as printed, when a bound volume in the Heritage Library has it (2015–2019).
  let printed = null;
  try {
    const li = await q(`rcm_lib_issues?select=volume_id&issue_no=eq.${Number(issue.issue_no)}&limit=3`);
    if (li.length) { const vs = await q(`rcm_lib_volumes?select=acc&status=eq.published&year_to=gte.2014&id=in.(${li.map((x) => x.volume_id).join(',')})&limit=1`); if (vs[0]) printed = `/library/balita/${vs[0].acc.toLowerCase()}/${issue.issue_no}`; }
  } catch { printed = null; }
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
${/^https:\/\/([a-z0-9-]+\.)*heyzine\.com\//i.test(issue.heyzine_url || '') ? `<p><a class="btn btn-gold" href="${esc(issue.heyzine_url)}" target="_blank" rel="noopener">Flip through the magazine <span aria-hidden="true">↗</span></a></p>` : ''}
${printed ? `<p><a class="link-arrow" style="color:var(--gold)" href="${printed}">See this issue as printed, in the Heritage Library</a></p>` : ''}
${shareBar(url, title, false)}
</div></div></section>
<div class="tabs"><div class="wrap" role="tablist" aria-label="How to read this issue">
${arts.length ? `<button class="tab" role="tab" id="t-a" aria-selected="true" aria-controls="v-a">Articles</button>` : ''}
<button class="tab" role="tab" id="t-l" aria-selected="${arts.length ? 'false' : 'true'}" aria-controls="v-l">${arts.length ? 'Layout view' : 'Read the issue'}</button>
<span style="margin-left:auto;align-self:center;color:var(--muted);font-size:15px">${arts.length ? `${arts.length} stories` : `${pages.length} pages`}${issue.pdf_url ? ` · <a href="${esc(issue.pdf_url)}" target="_blank" rel="noopener">Download PDF</a>` : ''}</span>
</div></div>
${arts.length ? '' : '<div hidden>'}<section class="wrap section" id="v-a" role="tabpanel" aria-labelledby="t-a"><div class="sgrid">${arts.map((a) => storyCard(issue, a)).join('')}</div></section>${arts.length ? '' : '</div>'}
<section class="wrap section" id="v-l" role="tabpanel" aria-labelledby="t-l"${arts.length ? ' hidden' : ''}>
<p style="margin:0;color:var(--ink-2)">${arts.length ? 'The issue as it was printed, spread by spread. Switch to Articles for easy reading on a phone.' : 'The issue as it was printed, spread by spread. Tap a page to see it full size.'}</p>
${pages.length ? '' : '<p class="empty">The printed pages of this issue are not online yet.</p>'}<div class="pages">${pages.map((p, i) => `<figure><a href="${raw(p)}" target="_blank" rel="noopener"><img src="${img(p, 900)}" alt="Balita issue ${issue.issue_no}, PDF page ${i + 1}" loading="lazy"></a><figcaption>Page ${i + 1} of ${pages.length}</figcaption></figure>`).join('')}</div>
</section>
<script>
(function(){if(!document.getElementById('t-a'))return;var a=document.getElementById('t-a'),l=document.getElementById('t-l'),va=document.getElementById('v-a'),vl=document.getElementById('v-l');
function show(x){var isA=x===a;a.setAttribute('aria-selected',isA);l.setAttribute('aria-selected',!isA);va.hidden=!isA;vl.hidden=isA;}
a.onclick=function(){show(a)};l.onclick=function(){show(l)};if(location.hash==='#layout')show(l);})();
</script>`;
  // Link previews (Viber, Facebook): the wide share picture made in the editor, else the cover.
  let shareImg = issue.cover_path ? coverSrc(issue, 1200) : '';
  try {
    const h = await fetch(`${SB}/storage/v1/object/public/rcm/issues/${issue.issue_no}/share.jpg`, { method: 'HEAD' });
    if (h.ok) shareImg = `${SB}/storage/v1/object/public/rcm/issues/${issue.issue_no}/share.jpg?v=${Date.parse(h.headers.get('last-modified') || '') || 1}`;
  } catch (e) { /* keep the cover */ }
  return layout({ title, description: issue.summary || `The ${fmtDate(issue.issue_date)} issue of the Rotary Club of Manila's weekly publication.`, image: shareImg, url, body, nav: 'balita', ads: 'all' });
}

// ---------- Balita by email: an email-safe copy of an issue (tables and inline styles only, so Gmail,
// Outlook and phone mail apps show it as designed). Open /balita/<no>/email, click "Copy email", paste into Gmail.
async function emailPage(origin, no) {
  // /balita/latest/email always gives the newest live issue (the link on the Secretariat page).
  const rows = String(no) === 'latest' ? await liveIssues(1) : await q(`rcm_issues?select=${ICOLS}&issue_no=eq.${Number(no)}`);
  const issue = rows[0];
  if (!issue) return null;
  const arts = (await articlesOf(issue.id)).filter((a) => a.title);
  const url = `${origin}/balita/${issue.issue_no}`;
  const abs = (src) => (src && src[0] === '/' ? origin + src : src);
  const day = fmtDate(issue.issue_date);
  const subject = `Balita No. ${issue.issue_no} · ${day}${issue.guest ? ' · Guest speaker: ' + issue.guest.split(/[,;(]/)[0].trim() : ''}`;
  const NAVY = '#17458f', GOLD = '#f7a81b', INK = '#1f2733', MUTED = '#5b6573', SERIF = "Georgia,'Times New Roman',serif", SANS = 'Arial,Helvetica,sans-serif';
  const aUrl = (a) => `${url}/${encodeURIComponent(a.slug)}`;
  const photoOf = (a) => { const c = leadPhoto(a); return c && c.path ? c : null; };
  const lead = arts.find((a) => a.lead && photoOf(a)) || arts.find((a) => photoOf(a)) || null;
  const rest = arts.filter((a) => a !== lead);
  const kick = (a) => a.kicker ? `<div style="font:bold 11px ${SANS};letter-spacing:1.5px;text-transform:uppercase;color:${NAVY};margin:0 0 6px">${esc(a.kicker)}</div>` : '';
  const leadHtml = lead ? (() => { const ph = photoOf(lead); return `<tr><td style="padding:0 0 8px"><a href="${aUrl(lead)}"><img src="${abs(img(ph.path, 1200))}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a></td></tr>
<tr><td style="padding:16px 32px 28px">${kick(lead)}<a href="${aUrl(lead)}" style="font:bold 26px/1.25 ${SERIF};color:${INK};text-decoration:none">${esc(lead.title)}</a>${lead.dek ? `<p style="font:16px/1.55 ${SERIF};color:${MUTED};margin:10px 0 14px">${esc(lead.dek)}</p>` : ''}<a href="${aUrl(lead)}" style="font:bold 15px ${SANS};color:${NAVY}">Read the story &rarr;</a></td></tr>`; })() : '';
  const row = (a) => { const ph = photoOf(a); return `<tr><td style="padding:0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e3e7ee"><tr>
${ph ? `<td width="126" valign="top" style="padding:20px 16px 20px 0"><a href="${aUrl(a)}"><img src="${abs(img(ph.path, 300))}" width="110" alt="" style="display:block;width:110px;height:auto;border:0;border-radius:4px"></a></td>` : ''}
<td valign="top" style="padding:20px 0">${kick(a)}<a href="${aUrl(a)}" style="font:bold 18px/1.3 ${SERIF};color:${INK};text-decoration:none">${esc(a.title)}</a>${a.dek ? `<p style="font:14px/1.5 ${SANS};color:${MUTED};margin:6px 0 8px">${esc(a.dek.length > 180 ? a.dek.slice(0, 177) + '…' : a.dek)}</p>` : '<div style="height:8px"></div>'}<a href="${aUrl(a)}" style="font:bold 14px ${SANS};color:${NAVY}">Read more &rarr;</a></td></tr></table></td></tr>`; };
  const ads = SUPPORTERS.filter((x) => x.show).map((x) => `<tr><td style="padding:0 32px 14px"><a href="${x.href}"><img src="${origin}/assets/supporters/${x.key}-wide.jpg" width="536" alt="${esc(x.alt)}" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:6px"></a></td></tr>`).join('');
  const hist = historyPicks(await q(`rpc/rcm_history_week?d=${issue.issue_date}`).catch(() => []))[0];
  const histHtml = hist ? (() => { const im = histPic(hist, 300); const h = hist.link[0] === '/' ? origin + hist.link : hist.link;
    return `<tr><td style="padding:0 32px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4ee;border-left:4px solid ${GOLD}"><tr>
${im ? `<td width="126" valign="top" style="padding:16px 0 16px 16px"><a href="${h}"><img src="${abs(im)}" width="110" alt="" style="display:block;width:110px;height:auto;border:0"></a></td>` : ''}
<td valign="top" style="padding:16px"><div style="font:bold 11px ${SANS};letter-spacing:1.5px;text-transform:uppercase;color:${NAVY}">From the Heritage Library &middot; ${hist.years_ago} years ago this week</div>
<a href="${h}" style="display:block;font:bold 17px/1.3 ${SERIF};color:${INK};text-decoration:none;margin:6px 0">${esc(hist.kind === 'gallery' ? hist.title : hist.blurb || hist.title)}</a>
<a href="${h}" style="font:bold 14px ${SANS};color:${NAVY}">${hist.kind === 'gallery' ? 'See the photographs' : 'Open the Balita'} &rarr;</a></td></tr></table></td></tr>`; })() : '';
  const heyzine = /^https:\/\/([a-z0-9-]+\.)*heyzine\.com\//i.test(issue.heyzine_url || '') ? issue.heyzine_url : '';
  const email = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff">
<tr><td style="background:${NAVY};padding:22px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="middle"><a href="${origin}"><img src="${origin}/assets/club-logo-white.png" width="150" alt="Rotary Club of Manila" style="display:block;width:150px;height:auto;border:0"></a></td>
<td valign="middle" align="right" style="font:bold 13px ${SANS};color:#ffffff">THE BALITA<br><span style="font-weight:normal;color:#cfe0f5">No. ${issue.issue_no} &middot; ${esc(day)}</span></td></tr></table></td></tr>
<tr><td style="height:4px;background:${GOLD};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px 32px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${issue.cover_path ? `<td width="150" valign="top" style="padding-right:22px"><a href="${url}"><img src="${abs(coverSrc(issue, 400))}" width="150" alt="Cover of Balita No. ${issue.issue_no}" style="display:block;width:150px;height:auto;border:1px solid #e3e7ee"></a></td>` : ''}
<td valign="top"><div style="font:bold 11px ${SANS};letter-spacing:1.5px;text-transform:uppercase;color:${NAVY}">This week&rsquo;s issue</div>
<div style="font:bold 24px/1.25 ${SERIF};color:${INK};margin:6px 0 8px">Balita No. ${issue.issue_no}</div>
${issue.meeting ? `<div style="font:14px/1.5 ${SANS};color:${MUTED}">${esc(issue.meeting)}</div>` : ''}
${issue.guest ? `<div style="font:14px/1.5 ${SANS};color:${INK};margin-top:6px"><b>Guest speaker:</b> ${esc(issue.guest)}</div>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px"><tr><td style="background:${GOLD};border-radius:4px"><a href="${url}" style="display:inline-block;padding:11px 18px;font:bold 15px ${SANS};color:${NAVY};text-decoration:none">Read the issue online</a></td></tr></table>
${heyzine ? `<div style="margin-top:10px;font:14px ${SANS}"><a href="${esc(heyzine)}" style="color:${NAVY}">Or flip through the magazine &rarr;</a></div>` : ''}</td></tr></table></td></tr>
${issue.summary ? `<tr><td style="padding:0 32px 24px;font:16px/1.6 ${SERIF};color:${INK}">${esc(issue.summary)}</td></tr>` : ''}
<tr><td style="padding:0 32px 14px;font:bold 11px ${SANS};letter-spacing:1.5px;text-transform:uppercase;color:${MUTED}">In this issue &middot; ${arts.length} ${arts.length === 1 ? 'story' : 'stories'}</td></tr>
${leadHtml}
${rest.map(row).join('')}
<tr><td style="padding:12px 32px 28px;border-top:1px solid #e3e7ee" align="center"><table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px"><tr><td style="background:${NAVY};border-radius:4px"><a href="${url}" style="display:inline-block;padding:12px 22px;font:bold 15px ${SANS};color:#ffffff;text-decoration:none">See all ${arts.length} stories on rcmanila.org</a></td></tr></table></td></tr>
${histHtml}
${ads ? `<tr><td style="padding:18px 32px 10px;background:#f6f4ee;font:bold 11px ${SANS};letter-spacing:1.5px;text-transform:uppercase;color:${MUTED}">With thanks to our supporters</td></tr><tr><td style="background:#f6f4ee"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${ads}</table></td></tr><tr><td style="background:#f6f4ee;height:10px;font-size:0">&nbsp;</td></tr>` : ''}
<tr><td style="background:${NAVY};padding:24px 32px;font:13px/1.6 ${SANS};color:#cfe0f5">
<b style="color:#ffffff">Rotary Club of Manila</b> &middot; The first Rotary club in Asia, established 1919<br>
RCM Office, 543 Arquiza St. cor. Grey St., Ermita, Manila &middot; (02) 8527-1885<br>
<a href="${origin}" style="color:#ffffff">rcmanila.org</a> &middot; <a href="${origin}/meeting" style="color:#ffffff">This week&rsquo;s meeting</a> &middot; <a href="${origin}/events" style="color:#ffffff">Events</a> &middot; <a href="${origin}/balita" style="color:#ffffff">Past issues</a></td></tr>
</table></td></tr></table>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(subject)}</title>
<style>body{margin:0;background:#eef1f6}#tb{font:15px/1.5 ${SANS};background:#fff;border-bottom:1px solid #d9dee7;padding:14px 16px;position:sticky;top:0;z-index:2}#tb .in{max-width:760px;margin:0 auto;display:flex;flex-wrap:wrap;gap:10px;align-items:center}#tb button{font:bold 15px ${SANS};padding:9px 14px;border-radius:4px;border:1px solid ${NAVY};background:${NAVY};color:#fff;cursor:pointer}#tb button.l{background:#fff;color:${NAVY}}#tb .s{width:100%;color:${MUTED};font-size:14px}#tb .ok{color:#1d7a3a;font-weight:bold}</style></head><body>
<div id="tb"><div class="in"><b style="color:${NAVY}">Email version</b><button type="button" id="cp">Copy email</button><button type="button" class="l" id="cs">Copy subject line</button><span id="st" class="ok" role="status"></span>
<div class="s">Subject: <span id="sj">${esc(subject)}</span><br>In Gmail: click <b>Copy email</b>, open a new message, click in the message body and paste (Ctrl+V). Then <b>Copy subject line</b> and paste it into the subject. Send to yourself first to check, then to the members&rsquo; list (put the addresses in Bcc).</div></div></div>
<div id="em">${email}</div>
<script>(function(){var st=document.getElementById('st');function sel(n){var r=document.createRange();r.selectNode(n);var s=getSelection();s.removeAllRanges();s.addRange(r);var ok=false;try{ok=document.execCommand('copy')}catch(e){}s.removeAllRanges();return ok}
document.getElementById('cp').onclick=async function(){var n=document.getElementById('em');var ok=false;try{if(window.ClipboardItem&&navigator.clipboard&&navigator.clipboard.write){await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([n.innerHTML],{type:'text/html'}),'text/plain':new Blob([n.innerText],{type:'text/plain'})})]);ok=true}}catch(e){}if(!ok)ok=sel(n);st.textContent=ok?'Copied. Now paste it into a new Gmail message.':'Could not copy. Select the email below with your mouse and copy it.'};
document.getElementById('cs').onclick=function(){var t=document.getElementById('sj').textContent;(navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(t):Promise.reject()).then(function(){st.textContent='Subject line copied.'},function(){sel(document.getElementById('sj'));st.textContent='Subject line copied.'})};})();</script>
</body></html>`;
}

async function articlePage(origin, no, slug) {
  const rows = await q(`rcm_issues?select=${ICOLS}&issue_no=eq.${Number(no)}`);
  const issue = rows[0];
  if (!issue) return null;
  const arts = await articlesOf(issue.id);
  const a = arts.find((x) => x.slug === slug);
  if (!a) return null;
  const html = renderArticle(origin, issue, a, arts);
  const box = await archiveBox(archiveTopic(`${a.title} ${a.kicker || ''}`), 'Earlier years in the Balita').catch(() => '');
  return box ? html.replace('</article>', box + '</article>') : html;
}

// One renderer for the live article page and the editor's preview, so the preview is exactly what goes live.
function renderArticle(origin, issue, a, arts) {
  const url = `${origin}/balita/${issue.issue_no}/${a.slug}`;
  const photos = (a.photos || []).filter((p) => p.include !== false);
  const lead = photos[0];
  const rest = photos.slice(1);
  const all = Array.isArray(a.body) ? a.body : [];
  // The editor can place a photo on a chosen line of the text ({t:'img', path}); photos not placed are spread through the text.
  const placed = new Set(all.filter((b) => b && b.t === 'img').map((b) => b.path));
  const auto = rest.filter((p) => !placed.has(p.path));
  const blocks = all.filter((b) => b && (b.t === 'img' || b.text));
  const textCount = blocks.filter((b) => b.t !== 'img').length;
  const every = auto.length ? Math.max(2, Math.floor(textCount / (auto.length + 1))) : 0;
  let pi = 0, ti = 0, html = '';
  blocks.forEach((b) => {
    if (b.t === 'img') { const p = rest.find((x) => x.path === b.path); if (p) html += figure(p, p.caption || ''); return; }
    if (b.t === 'h') html += `<h2>${esc(b.text)}</h2>`;
    else if (b.t === 'q') html += `<blockquote>${esc(b.text)}</blockquote>`;
    else html += `<p>${esc(b.text)}</p>`;
    ti++;
    if (every && ti % every === 0 && pi < auto.length && ti < textCount) {
      const p = auto[pi++];
      html += figure(p, p.caption || '');
    }
  });
  const leftover = auto.slice(pi);
  // Three or more remaining photos (photo pages from print) show as a gallery grid; tap one to see it full size.
  if (leftover.length >= 3) html += `<div class="art-gallery">${leftover.map((p) => `<a href="${raw(p.path)}" target="_blank" rel="noopener"${p.caption ? ` title="${esc(p.caption)}"` : ''}><img src="${img(p.path, 600)}" alt="${esc(p.caption || '')}" loading="lazy"></a>`).join('')}</div>`;
  else if (leftover.length) html += leftover.map((p) => figure(p, p.caption || '')).join('');
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
  return layout({ title: `${a.title} · Balita ${issue.issue_no}`, description: a.dek || `From the Balita, issue ${issue.issue_no}.`, image: lead ? img(lead.path, 1200) : (issue.cover_path ? coverSrc(issue, 1200) : ''), url, body, nav: 'balita', ads: a.slug || 'a', ld: { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: a.title, description: a.dek || undefined, datePublished: issue.issue_date || undefined, image: lead ? [img(lead.path, 1200)] : undefined, author: a.byline ? { '@type': 'Person', name: a.byline.replace(/^by\s+/i, '') } : { '@type': 'Organization', name: 'Rotary Club of Manila' }, publisher: { '@type': 'Organization', name: 'Rotary Club of Manila', logo: { '@type': 'ImageObject', url: SITE + '/assets/club-logo.png' } }, isPartOf: { '@type': 'PublicationIssue', issueNumber: String(issue.issue_no), name: 'The Rotary Balita' }, mainEntityOfPage: url } });
}

// ---------- Club events: fellowships, fundraisers, exhibits, with online sign-up and a seat limit ----------
const EFN = `${SB}/functions/v1/rcm-events`;
const peso = (n) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const evWhen = (e) => {
  const d = fmtDay(e.event_date);
  if (e.end_date && e.end_date !== e.event_date) return `${d}, until ${fmtDate(e.end_date)}`;
  return d;
};
async function upcomingEvents(limit = 20) {
  const today = manilaToday();
  return q(`rcm_events?select=id,slug,title,kicker,event_date,end_date,time_text,venue,summary,poster_path,capacity,price&status=eq.published&or=(event_date.gte.${today},end_date.gte.${today})&order=event_date&limit=${limit}`).catch(() => []);
}
async function eventsIndex(origin) {
  const today = manilaToday();
  const [up, past, seats] = await Promise.all([
    upcomingEvents(40),
    q(`rcm_events?select=id,slug,title,kicker,event_date,end_date,venue,poster_path&status=eq.published&event_date=lt.${today}&order=event_date.desc&limit=24`).catch(() => []),
    q('rpc/rcm_event_seats').catch(() => []),
  ]);
  const taken = new Map(seats.map((s) => [s.event_id, Number(s.seats)]));
  const upIds = new Set(up.map((e) => e.id));
  const card = (e, isPast) => {
    const left = e.capacity ? Math.max(0, e.capacity - (taken.get(e.id) || 0)) : null;
    return `<a class="ev-card" href="/events/${esc(e.slug)}"><span class="im">${e.poster_path ? `<img src="${esc(img(e.poster_path, 600))}" alt="" loading="lazy">` : ''}</span><span class="ev-b"><small>${esc(e.kicker || 'Club event')}</small><strong>${esc(e.title)}</strong><span>${esc(evWhen(e))}${e.time_text ? ' · ' + esc(e.time_text) : ''}</span>${e.venue ? `<span>${esc(e.venue)}</span>` : ''}${!isPast && left !== null ? `<em class="${left <= 10 ? 'low' : ''}">${left ? `${left} of ${e.capacity} seats left` : 'Fully booked'}</em>` : ''}</span></a>`;
  };
  const body = `<section class="wrap pj-index-head"><span class="kicker">Meetings &amp; events</span><h1>Club events</h1>
<p class="lead-p">Fellowships, fundraisers and special events of the Rotary Club of Manila. Sign up on each event’s page. For the weekly Thursday meeting, see <a href="/meeting">this week’s meeting</a>.</p></section>
<section class="wrap" style="padding-bottom:48px">${up.length ? `<div class="ev-grid">${up.map((e) => card(e, false)).join('')}</div>` : '<p class="muted-p">No upcoming events are posted yet.</p>'}</section>
${past.filter((e) => !upIds.has(e.id)).length ? `<section class="wrap" style="padding-bottom:64px"><h2 style="font-size:24px;margin-bottom:16px">Past events</h2><div class="ev-grid past">${past.filter((e) => !upIds.has(e.id)).map((e) => card(e, true)).join('')}</div></section>` : ''}`;
  return layout({ title: 'Events · Rotary Club of Manila', description: 'Fellowships, fundraisers and special events of the Rotary Club of Manila, with online sign-up.', url: origin + '/events', body, nav: 'events' });
}
async function eventPage(origin, slug) {
  if (!/^[a-z0-9-]{3,80}$/.test(String(slug || ''))) return null;
  const e = (await q(`rcm_events?select=*&status=eq.published&slug=eq.${slug}`).catch(() => []))[0];
  if (!e) return null;
  const pub = await q(`rpc/rcm_event_public?ev=${e.id}`).catch(() => null) || {};
  const taken = Number(pub.seats || 0);
  const today = manilaToday();
  const past = (e.end_date || e.event_date) < today;
  const started = e.event_date < today;
  const left = e.capacity ? Math.max(0, e.capacity - taken) : null;
  const open = e.rsvp_open && !started && (left === null || left > 0);
  const url = `${origin}/events/${e.slug}`;
  const partner = e.who !== 'members';
  const max = Math.max(1, Math.min(10, Number(e.per_member) || 1));
  const calM = { meeting_date: e.event_date, time_text: e.time_text, topic: e.title, label: e.kicker, venue: e.venue, notes: e.summary };
  const seatLine = () => e.capacity ? (left ? `<strong>${left}</strong> of ${e.capacity} seats left` : '<strong>Fully booked</strong>') : (taken ? `<strong>${taken}</strong> ${taken === 1 ? 'person has' : 'people have'} signed up` : 'Be the first to sign up');
  const whoText = e.who === 'members' ? 'For RCM members' : e.who === 'members_partners' ? `For RCM members and their wife or partner${max > 1 ? ` · up to ${max} per member` : ''}` : 'Members, families and friends welcome';
  const body = `
<section class="issue-head meet-head ev-head"><div class="wrap">
${dateChip(e.event_date)}
<div style="display:flex;flex-direction:column;gap:12px">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/events">Events</a></nav>
<span class="eyebrow" style="color:var(--gold)">${esc(e.kicker || 'Club event')}</span>
<h1>${esc(e.title)}</h1>
${e.summary ? `<p style="font-size:19px;color:#fff;max-width:60ch">${esc(e.summary)}</p>` : ''}
${past ? '<p><strong style="color:var(--gold)">This event has ended. Thank you to everyone who took part.</strong></p>' : `<div class="hero-cta">${open ? '<a class="btn btn-gold" href="#rsvp">Sign up</a>' : ''}${/^https:\/\//.test(e.link_url || '') ? `<a class="btn btn-line" style="color:#fff" href="${esc(e.link_url)}" target="_blank" rel="noopener">${esc(e.link_label || 'More details')} ↗</a>` : ''}${!started ? `<a class="btn btn-line" style="color:#fff" href="${calLink(calM)}" target="_blank" rel="noopener">Add to calendar</a>` : ''}</div>`}
</div></div></section>
<div class="wrap meet-grid">
<div class="meet-main">
<dl class="facts">
<div><dt>When</dt><dd>${esc(evWhen(e))}${e.time_text ? ` · ${esc(e.time_text)}` : ''}</dd></div>
${e.venue ? `<div><dt>Where</dt><dd>${esc(e.venue)} · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.venue)}" target="_blank" rel="noopener">Map</a></dd></div>` : ''}
${e.price ? `<div><dt>Ticket</dt><dd>${esc(peso(e.price))}${e.price_note ? ` ${esc(e.price_note)}` : ''}</dd></div>` : ''}
<div><dt>Who</dt><dd>${esc(whoText)}</dd></div>
${e.organizer ? `<div><dt>Organized by</dt><dd>${esc(e.organizer)}</dd></div>` : ''}
</dl>
${e.body ? `<div class="meet-note big">${paras(e.body)}</div>` : ''}
${e.poster_path ? `<figure class="poster"><a href="${raw(e.poster_path)}" target="_blank" rel="noopener"><img src="${img(e.poster_path, 900)}" alt="Event poster: ${esc(e.title)}"></a><figcaption>Tap the poster to see it full size</figcaption></figure>` : ''}
<div class="share-row">${shareBar(url, e.title, true)}</div>
</div>
<aside class="rsvp" id="rsvp">
<h2>${past ? 'This event has ended' : open ? 'Sign up' : left === 0 ? 'Fully booked' : 'Sign-ups closed'}</h2>
<p class="rsvp-count" id="ev-count">${seatLine()}</p>
${e.capacity ? `<div class="ev-meter" aria-hidden="true"><i style="width:${Math.min(100, Math.round(taken / e.capacity * 100))}%"></i></div>` : ''}
${open ? `<form id="ev-form" novalidate>
<label>Your name, as it should appear on the list<input name="name" required maxlength="100" autocomplete="name" placeholder="e.g. PP Juan Dela Cruz"></label>
${partner ? `<label>${e.who === 'members_partners' ? 'Wife or partner coming with you' : 'Guest coming with you'} <span style="font-weight:400;color:var(--muted)">(optional)</span><input name="guest_name" maxlength="100" placeholder="Full name"></label>` : ''}
<label>Mobile number <span style="font-weight:400;color:var(--muted)">(optional, only the Secretariat sees it)</span><input name="contact" maxlength="80" inputmode="tel" autocomplete="tel"></label>
<label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
<button class="btn btn-blue" type="submit" style="width:100%">${e.price ? `Reserve${partner ? '' : ' my seat'}` : 'Sign me up'}</button>
<p id="ev-msg" role="status" aria-live="polite"></p>
</form>
<div id="ev-done" hidden></div>
${e.price ? `<p class="small">Payment details will follow from the ${e.who === 'members' || e.who === 'members_partners' ? 'Secretariat' : 'organizers'}. ${esc(peso(e.price))} ${e.price_note ? esc(e.price_note) : 'per ticket'}.</p>` : ''}` : ''}
${Array.isArray(pub.names) && pub.names.length ? `<details class="ev-who"><summary>Who’s coming (${pub.names.length})</summary><ol>${pub.names.map((n) => `<li>${esc(n)}</li>`).join('')}</ol></details>` : ''}
<p class="small">${e.contact ? `Questions: ${esc(e.contact)}, or the ` : 'Questions: the '}Secretariat at <a href="${TEL}">(02) 8527-1885</a>.</p>
</aside>
</div>
<script>
(function(){
var f=document.getElementById('ev-form'); if(!f) return;
var FN=${JSON.stringify(EFN)}, PUB=${JSON.stringify(PUB)}, KEY='rcm-ev-${e.id}', CAP=${e.capacity || 0};
var msg=document.getElementById('ev-msg'), done=document.getElementById('ev-done'), cnt=document.getElementById('ev-count');
function mine(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(x){return []}}
function save(l){try{localStorage.setItem(KEY,JSON.stringify(l))}catch(x){}}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function setSeats(n){if(CAP){var l=Math.max(0,CAP-n);cnt.innerHTML=l?'<strong>'+l+'</strong> of '+CAP+' seats left':'<strong>Fully booked</strong>';var m=document.querySelector('.ev-meter i');if(m)m.style.width=Math.min(100,Math.round(n/CAP*100))+'%';}else cnt.innerHTML='<strong>'+n+'</strong> signed up';}
function showDone(){var l=mine();if(!l.length){done.hidden=true;f.hidden=false;return;}done.hidden=false;f.hidden=true;
 done.innerHTML='<p class="ok"><strong>You’re on the list.</strong></p><ul class="mine">'+l.map(function(x,i){return '<li>'+esc(x.name)+'<button type="button" class="smallbtn" data-rm="'+i+'">Cancel</button></li>'}).join('')+'</ul><button type="button" class="smallbtn" id="ev-more">Sign up someone else</button>';}
f.addEventListener('submit',async function(ev){ev.preventDefault();
 var d={action:'signup',event_id:${JSON.stringify(e.id)},name:f.name.value,guest_name:f.guest_name?f.guest_name.value:'',contact:f.contact.value,website:f.website.value};
 if(d.name.trim().length<2){msg.textContent='Please type your name.';f.name.focus();return;}
 var b=f.querySelector('button[type=submit]');b.disabled=true;msg.textContent='Saving…';
 try{var r=await fetch(FN,{method:'POST',headers:{'content-type':'application/json',apikey:PUB},body:JSON.stringify(d)});var j=await r.json();
  if(!r.ok||j.error)throw new Error(j.error||'Please try again.');
  var l=mine();l.push({id:j.id,token:j.token,name:d.name.trim()+(d.guest_name.trim()?' & '+d.guest_name.trim():''),seats:d.guest_name.trim()?2:1});save(l);
  setSeats(j.seats);msg.textContent='';f.reset();showDone();
 }catch(err){msg.textContent=err.message||'Something went wrong. Please try again.';}
 finally{b.disabled=false;}
});
done.addEventListener('click',async function(ev){
 if(ev.target.id==='ev-more'){done.hidden=true;f.hidden=false;f.name.focus();return;}
 var rm=ev.target.getAttribute('data-rm');if(rm===null)return;
 var l=mine(),x=l[+rm];ev.target.disabled=true;
 if(x&&x.id){try{await fetch(FN,{method:'POST',headers:{'content-type':'application/json',apikey:PUB},body:JSON.stringify({action:'cancel',id:x.id,token:x.token})});}catch(err){}}
 l.splice(+rm,1);save(l);showDone();
});
showDone();
})();
</script>`;
  return layout({ title: `${e.title} · Rotary Club of Manila`, description: `${evWhen(e)}${e.time_text ? ', ' + e.time_text : ''}${e.venue ? ' at ' + e.venue : ''}. ${e.summary || ''}`.trim(), image: e.poster_path ? (e.poster_path[0] === '/' ? e.poster_path : img(e.poster_path, 1200)) : '', url, body, nav: 'events', ld: { '@context': 'https://schema.org', '@type': 'Event', name: e.title, description: e.summary || undefined, startDate: e.event_date, endDate: e.end_date || undefined, eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', location: e.venue ? { '@type': 'Place', name: e.venue, address: e.venue } : undefined, image: e.poster_path ? [e.poster_path[0] === '/' ? SITE + e.poster_path : img(e.poster_path, 1200)] : undefined, organizer: { '@type': 'Organization', name: 'Rotary Club of Manila', url: SITE + '/' }, url } });
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
  if (isOff(m)) {
    const ev = await sameDayEvent(m.meeting_date), when0 = fmtDay(m.meeting_date);
    const body = `<section class="issue-head meet-head"><div class="wrap">
${dateChip(m.meeting_date)}
<div style="display:flex;flex-direction:column;gap:12px">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/meeting">Meetings</a></nav>
<span class="eyebrow" style="color:var(--gold)">No weekly meeting · ${esc(when0)}</span>
<h1>${esc(m.topic || 'There is no weekly meeting this Thursday')}</h1>
${m.notes ? `<div style="color:#dfe8f7">${paras(m.notes)}</div>` : ''}
${ev ? `<div class="hero-cta"><a class="btn btn-gold" href="/events/${esc(ev.slug)}">${esc(ev.title)}: details and sign-up</a></div>` : ''}
</div></div></section>`;
    return layout({ title: `No weekly meeting on ${when0} · Rotary Club of Manila`, description: m.topic || 'There is no weekly meeting this Thursday.', url: `${origin}/meetings/${m.meeting_date}`, body, nav: 'meeting' });
  }
  const url = `${origin}/meetings/${m.meeting_date}`;
  const count = await signupCount(m.id);
  const past = m.meeting_date < today;
  const open = m.rsvp_open && !past;
  const when = fmtDay(m.meeting_date);
  const title = m.topic ? `${m.topic}${m.speaker ? ' · ' + m.speaker : ''}` : `${m.label || 'Weekly meeting'} · ${when}`;
  const desc = `${when}${m.time_text ? ', ' + m.time_text : ''}${m.venue ? ' at ' + m.venue : ''}. Sign up to attend.`;
  const hist = historyWeek(await q(`rpc/rcm_history_week?d=${m.meeting_date}`).catch(() => []));
  const poster = m.poster_path ? `<figure class="poster"><a href="${raw(m.poster_path)}" target="_blank" rel="noopener"><img src="${img(m.poster_path, 900)}" alt="Meeting poster: ${esc(m.topic || m.label || '')}"></a><figcaption>Tap the poster to see it full size</figcaption></figure>` : '';
  const body = `
<section class="issue-head meet-head"><div class="wrap">
${dateChip(m.meeting_date)}
<div style="display:flex;flex-direction:column;gap:12px">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/meeting">Meetings</a></nav>
<span class="eyebrow" style="color:var(--gold)">${esc(m.label || 'Weekly membership meeting')}</span>
<h1>${esc(m.topic || m.label || 'Weekly meeting')}</h1>
${m.speaker ? `<p style="font-size:20px;color:#fff"><strong>${esc(m.speaker)}</strong>${m.speaker_title ? `<br><span style="color:var(--sky)">${esc(m.speaker_title)}</span>` : ''}</p>` : ''}
${past ? '<p><strong style="color:var(--gold)">This meeting has already taken place.</strong></p>' : `<div class="hero-cta"><a class="btn btn-gold" href="#rsvp">Sign up to attend</a><a class="btn btn-line" style="color:#fff" href="${calLink(m)}" target="_blank" rel="noopener">Add to calendar</a></div><p class="cal-sub">Get every Thursday meeting in your phone’s calendar, kept up to date: <a href="webcal://${origin.replace(/^https?:\/\//, '')}/meetings.ics">iPhone or Outlook</a> · <a href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent('webcal://' + origin.replace(/^https?:\/\//, '') + '/meetings.ics')}" target="_blank" rel="noopener">Google Calendar (Android)</a></p>`}
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
${hist}
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
  return layout({ title: 'Donate · Rotary Club of Manila', description: 'Support the service projects of the Rotary Club of Manila using QR Ph from any bank or e-wallet app.', url: origin + '/donate', body, nav: 'donate' });
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
const PAGES = { about: '/#club', 'who-we-are': '/#club', 'rostrum-and-bell': '/#club', members: '/join', membership: '/join', 'become-a-member': '/join', projects: '/projects', 'our-projects': '/projects', partners: '/partner', volunteer: '/partner', balita: '/balita', 'rotary-balita': '/balita', contact: '/#contact', 'contact-us': '/#contact', donate: '/donate', home: '/', 'about-us': '/#club', 'history-of-the-rotary-club-of-manila': '/library', history: '/library', 'past-presidents': '/past-presidents', 'board-of-directors': '/#club', officers: '/#club', events: '/events', library: '/library', catalog: '/library/collection' };
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
  if (/^cgi-bin\/koha/i.test(path)) return '/library/collection';   // the old library catalogue
  if (/^about-us(\/|$)/i.test(path)) return '/#club';
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
  if (r === 'ics') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="rcm-meetings.ics"');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    return res.end(await meetingsIcs(origin));
  }
  if (r === 'ask-facts') { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'public, s-maxage=3600'); return res.end(JSON.stringify(askFacts())); }
  if (r === 'robots') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.setHeader('Cache-Control', 'public, s-maxage=86400');
    return res.end(`User-agent: *\nDisallow: /admin\nDisallow: /secretariat\nDisallow: /library-admin\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`);
  }
  // A plain-text summary for AI assistants (the llms.txt convention).
  // IndexNow key (Bing and other search engines check this file before accepting our "page changed" pings).
  if (r === 'indexnow') { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.end('d9ca13072ad953191777936aededdca7'); }
  if (r === 'llms') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.setHeader('Cache-Control', 'public, s-maxage=86400');
    return res.end(`# Rotary Club of Manila

> The Rotary Club of Manila (RCM), founded in 1919, is the first Rotary club in Asia. It is a service club of business, professional and civic leaders in Manila, Philippines, part of Rotary International District 3810. Members meet every Thursday for a weekly membership meeting with a guest speaker.

- Secretariat: RCM Office, 543 Arquiza St. cor. Grey St., Ermita, Manila. Phone (02) 8527-1885. Email ${MAIL}
- The Club's foundation is the RCManila Foundation (rcmanilafoundation.com).
- The Rotary Balita is the Club's weekly publication.

## Main pages
- [About the Club](${origin}/#history): who we are and what we do
- [Service projects](${origin}/projects): the Club's current projects in health, education, relief and the environment
- [Weekly meeting](${origin}/meeting): this week's meeting, guest speaker, venue and sign-up
- [Events](${origin}/events): fellowships, fundraisers and other Club events
- [The Balita](${origin}/balita): every issue of the weekly publication, with each story as its own page
- [Guest speakers](${origin}/speakers): speakers at the weekly meetings
- [Past presidents](${origin}/past-presidents): every president of the Club since 1919
- [Heritage Library](${origin}/library): a century of Balita issues, photographs and trophies
- [Join the Club](${origin}/join): how to become a member
- [Donate](${origin}/donate): support the Club's projects
- [Partner or volunteer](${origin}/partner)

## Optional
- [Sitemap](${origin}/sitemap.xml)
`);
  }
  if (r === 'sitemap') {
    try {
      const issues = await q('rcm_issues?select=id,issue_no,issue_date,updated_at&status=eq.published&order=issue_no.desc');
      const byId = new Map(issues.map((i) => [i.id, i]));
      let arts = [], off = 0;
      for (;;) { const page = await q(`rcm_articles?select=slug,issue_id,updated_at&included=eq.true&order=id&limit=1000&offset=${off}`); arts = arts.concat(page); if (page.length < 1000) break; off += 1000; }
      const d = (t) => (t ? String(t).slice(0, 10) : '');
      const urls = [['/', ''], ['/projects', ''], ...PROJECTS.map((p) => [`/projects/${p.slug}`, '']), ['/meeting', ''], ['/balita', ''], ['/join', ''], ['/youth', ''], ['/partner', ''], ['/donate', ''], ['/past-presidents', ''], ['/events', ''], ['/speakers', ''], ['/library', ''], ['/library/balita', ''], ['/library/photos', ''], ['/library/trophies', ''], ['/library/collection', ''], ['/library/timeline', ''], ['/library/exhibit', ''], ['/library/name', ''], ['/library/ask', ''], ['/app', '']]
        .concat((await q('rcm_events?select=slug,updated_at&status=eq.published').catch(() => [])).map((e) => [`/events/${e.slug}`, d(e.updated_at)]))
        .concat([['/library/videos', '']]).concat((await q('rcm_lib_videos?select=slug,updated_at&status=eq.published&path=not.is.null').catch(() => [])).map((v) => [`/library/videos/${v.slug}`, d(v.updated_at)]))
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
  // Short article links for Viber messages: /b/<issue>/<n> goes to the n-th story of that issue.
  if (r === 'history') {
    const top = historyPicks(await q('rpc/rcm_history_week').catch(() => []))[0];
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    res.statusCode = 302; res.setHeader('Location', top ? top.link : '/library'); return res.end();
  }
  if (r === 'short') {
    let to = '/balita';
    try {
      const no = Number(u.searchParams.get('no')), n = Number(u.searchParams.get('n'));
      const iss = (await q(`rcm_issues?select=id,issue_no&issue_no=eq.${no}`))[0];
      if (iss) { to = `/balita/${iss.issue_no}`; const a = (await articlesOf(iss.id)).filter((x) => x.included !== false)[n - 1]; if (a) to += '/' + encodeURIComponent(a.slug); }
    } catch (e) { /* fall back to the Balita index */ }
    res.statusCode = 302; res.setHeader('Location', to); res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.end();
  }
  let html = null;
  try {
    if (r === 'home') html = await home(origin);
    else if (r === 'archive') html = await archive(origin, u.searchParams.get('q'));
    else if (r === 'issue') html = await issuePage(origin, u.searchParams.get('no'));
    else if (r === 'email') html = await emailPage(origin, u.searchParams.get('no'));
    else if (r === 'article') html = await articlePage(origin, u.searchParams.get('no'), u.searchParams.get('slug'));
    else if (r === 'meeting') html = await meetingPage(origin, u.searchParams.get('date'));
    else if (r === 'donate') html = await donatePage(origin, u.searchParams.get('for'));
    else if (r === 'projects') html = projectsIndex(origin);
    else if (r === 'project') { html = await projectPage(origin, u.searchParams.get('slug')); if (!html) { res.statusCode = 301; res.setHeader('Location', '/projects'); return res.end(); } }
    else if (r === 'join') html = joinPage(origin);
    else if (r === 'youth') html = await youthPage(origin);
    else if (r === 'privacy') html = privacyPage(origin);
    else if (r === 'app') html = appPage(origin);
    else if (r === 'presidents') html = presidentsPage(origin);
    else if (r === 'speakers') html = await speakersPage(origin);
    else if (r === 'events') html = await eventsIndex(origin);
    else if (r === 'event') html = await eventPage(origin, u.searchParams.get('slug'));
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

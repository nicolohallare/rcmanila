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
const img = (path, w) => path ? `${SB}/storage/v1/render/image/public/rcm/${path.split('/').map(encodeURIComponent).join('/')}?width=${w}&quality=78` : '';
const raw = (path) => path ? `${SB}/storage/v1/object/public/rcm/${path.split('/').map(encodeURIComponent).join('/')}` : '';
const fmtDate = (d) => d ? new Date(d + 'T12:00:00+08:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' }) : '';
const fmtDay = (d) => d ? new Date(d + 'T12:00:00+08:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' }) : '';
const FN = `${SB}/functions/v1/rcm-admin`;
const PUB = 'sb_publishable_zebFaErs-sjDwYWQUMfq3g_VuF2DTI6';
const MAIL = 'rcmanila@rcmanila.org';
const mailto = (subject) => `mailto:${MAIL}?subject=${encodeURIComponent(subject)}`;
const TEL = 'tel:+63285271885';
const leadPhoto = (a) => (a.photos || []).find((p) => p.include !== false);
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
    let h = Number(x[1]) % 12; const mer = (x[3] || 'PM').toUpperCase(); if (mer === 'PM' || mer === 'NN' || mer === 'NOON') h += (Number(x[1]) === 12 ? 0 : 12); if (Number(x[1]) === 12 && mer === 'AM') h = 0;
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

function layout({ title, description, image, url, body, nav = '' }) {
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
<meta property="og:type" content="article">
${url ? `<meta property="og:url" content="${esc(url)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<div class="topbar"><div class="wrap"><span>Asia's first Rotary club · Serving since 1919</span><a href="/admin">Editor login</a></div></div>
<header class="site-head"><div class="wrap">
<a class="logo" href="/" aria-label="Rotary Club of Manila home"><img src="/assets/logo.png" alt="Rotary Club of Manila" width="255" height="108"></a>
<nav class="nav" aria-label="Main">
<a href="/#club">Our Club</a><a href="/#impact">Our Impact</a><a href="/meeting" class="${nav === 'meeting' ? 'on' : ''}">Meetings &amp; Events</a>
<a href="/balita" class="${nav === 'balita' ? 'on' : ''}">Balita</a><a href="/#join">Membership</a><a href="/#contact">Contact</a>
</nav>
<a class="btn btn-gold" href="/meeting">Attend a meeting</a>
</div></header>
<main>${body}</main>
<footer class="foot" id="contact"><div class="wrap">
<div style="display:flex;flex-direction:column;gap:12px;max-width:320px"><span class="chip"><img src="/assets/logo.png" alt="Rotary Club of Manila"></span><span>Asia's first Rotary club. Service above self since 1919.</span></div>
<address style="font-style:normal"><strong style="color:#fff">Secretariat</strong><br>RCM Office, 543 Arquiza St. cor. Grey St.<br>Ermita, Manila<br><a href="${TEL}">(02) 8527-1885</a><br><a href="mailto:${MAIL}">${MAIL}</a></address>
<div><strong style="color:#fff">Follow us</strong><br><a href="https://www.facebook.com/RotaryClubofManila" target="_blank" rel="noopener">Facebook</a><br><a href="https://www.linkedin.com/company/rotary-club-of-manila/" target="_blank" rel="noopener">LinkedIn</a><br><a href="/balita">Balita archive</a><br><a href="/donate">Donate</a></div>
<div><strong style="color:#fff">Related</strong><br><a href="https://rcmanilafoundation.com/" target="_blank" rel="noopener">RCManila Foundation, Inc.</a><br><a href="https://www.rotary.org/" target="_blank" rel="noopener">Rotary International</a><br>Rotary District 3810</div>
<div style="align-self:flex-end">© ${new Date().getFullYear()} Rotary Club of Manila</div>
</div></footer>
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
  const visual = ph
    ? `<div class="ph"><img src="${img(ph.path, 640)}" alt="" loading="lazy"></div>`
    : `<div class="ph quote">${esc(a.kicker || 'Balita')}</div>`;
  return `<a class="story" href="${href}">${visual}<span class="eyebrow">${esc(a.kicker || 'Balita')}${a.printed_pages ? ' · ' + esc(a.printed_pages) : ''}</span><h3>${esc(a.title)}</h3>${a.dek ? `<p>${esc(a.dek)}</p>` : ''}</a>`;
}

async function liveIssues(limit = 20) {
  return q(`rcm_issues?select=*&order=issue_no.desc&limit=${limit}`);
}
async function articlesOf(issueId) {
  return q(`rcm_articles?select=*&issue_id=eq.${issueId}&order=sort.asc`);
}

async function home(origin) {
  const issues = await liveIssues(1);
  const issue = issues[0];
  const arts = issue ? await articlesOf(issue.id) : [];
  const lead = arts.find((a) => a.lead) || arts.find((a) => leadPhoto(a)) || arts[0];
  const leadPh = lead && leadPhoto(lead);
  const withPhotos = arts.filter((a) => leadPhoto(a));
  const heroSrc = leadPh ? img(leadPh.path, 1400) : '';
  const nextThu = (() => { const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })); const add = (4 - d.getDay() + 7) % 7; d.setDate(d.getDate() + add); return d; })();
  const mt = await nextMeeting().catch(() => null);
  const mtCount = mt ? await signupCount(mt.id) : 0;
  const thuIso = `${nextThu.getFullYear()}-${String(nextThu.getMonth() + 1).padStart(2, '0')}-${String(nextThu.getDate()).padStart(2, '0')}`;
  const meetingCard = mt ? `<article class="card meet-card"><div class="in">
<span class="eyebrow">${esc(mt.label || 'Weekly meeting')}</span>
<div style="display:flex;gap:16px;align-items:flex-start">${dateChip(mt.meeting_date)}
<div style="display:flex;flex-direction:column;gap:4px">${mt.topic ? `<h3>${esc(mt.topic)}</h3>` : ''}${mt.speaker ? `<span><strong>${esc(mt.speaker)}</strong>${mt.speaker_title ? `<br><span style="color:var(--muted)">${esc(mt.speaker_title)}</span>` : ''}</span>` : ''}</div></div>
<p><strong>${esc(mt.time_text || '12:15 PM')}</strong>${mt.venue ? ` · ${esc(mt.venue)}` : ''}</p>
${mt.notes ? `<p class="meet-note">${esc(mt.notes.length > 150 ? mt.notes.slice(0, 147).replace(/\s+\S*$/, '') + '…' : mt.notes)}</p>` : ''}
<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:auto"><a class="btn btn-blue" href="/meetings/${mt.meeting_date}#rsvp">Sign up to attend</a>${mtCount ? `<span style="color:var(--muted);font-size:15px">${mtCount} signed up</span>` : ''}</div>
</div></article>` : `<article class="card"><div class="in">
<span class="eyebrow">Weekly meeting</span>
<div style="display:flex;gap:16px;align-items:center">${dateChip(thuIso)}
<div><strong>Every Thursday at 12:15 PM</strong><br>Registration and lunch from 11:00 AM</div></div>
<p>This week's speaker and venue will be posted here by the Secretariat. Members and guests are welcome.</p>
<a class="more" href="/meeting">Meeting details →</a>
</div></article>`;
  const body = `
<section class="hero"><div class="wrap">
<div class="hero-text">
<span class="eyebrow">People · Partnerships · Lasting change</span>
<h1>The first Rotary club in Asia. Still leading through service.</h1>
<p>Since 1919, leaders in Manila have come together every week to serve communities across the Philippines and beyond.</p>
<div class="hero-cta"><a class="btn btn-gold" href="/meeting">Attend a meeting</a><a class="btn btn-line" style="color:#fff" href="#impact">See our impact</a><a class="btn btn-line" style="color:#fff" href="#join">Explore membership</a></div>
</div>
<figure class="hero-photo" style="margin:0">${heroSrc ? `<img src="${heroSrc}" alt="${esc(leadPh.caption || lead.title)}">` : ''}
${lead ? `<figcaption><a href="/balita/${issue.issue_no}/${lead.slug}" style="color:#fff">${esc(leadPh && leadPh.caption ? leadPh.caption : lead.title)}</a></figcaption>` : ''}</figure>
</div></section>

<div class="band-tint" id="meeting"><div class="wrap cards3">
${meetingCard}
${lead ? `<article class="card">${leadPh ? `<img src="${img(leadPh.path, 800)}" alt="" style="aspect-ratio:16/9;object-fit:cover;width:100%">` : ''}<div class="in">
<span class="eyebrow">Featured story</span><h3>${esc(lead.title)}</h3>${lead.dek ? `<p>${esc(lead.dek)}</p>` : ''}
<a class="more" href="/balita/${issue.issue_no}/${lead.slug}">Read the story →</a></div></article>` : ''}
${issue ? `<article class="card"><div class="in" style="flex-direction:row;gap:18px">
${issue.cover_path ? `<img src="${img(issue.cover_path, 300)}" alt="Cover of Balita issue ${issue.issue_no}" style="width:118px;border-radius:4px;box-shadow:0 8px 20px rgba(7,44,82,.25);align-self:flex-start">` : ''}
<div style="display:flex;flex-direction:column;gap:8px"><span class="eyebrow">Latest Balita</span><h3>Issue No. ${issue.issue_no}</h3><span style="color:var(--muted)">${esc(fmtDate(issue.issue_date))}</span>
<a class="btn btn-blue" href="/balita/${issue.issue_no}" style="margin-top:auto">Read online</a></div></div></article>` : ''}
</div></div>

<section class="wrap section" id="club" style="max-width:1000px">
<div><span class="eyebrow">Our Club</span><h2 style="font-size:34px">Where Rotary in Asia began</h2></div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:28px;font-size:18px;color:var(--ink-2)">
<p style="margin:0">In January 1919, Leon Lambert and a small group of business leaders met at the Manila Hotel to form a Rotary club. On 1 June 1919 Rotary International granted Charter No. 478, making the Rotary Club of Manila the first Rotary club in the Philippines and in Asia.</p>
<p style="margin:0">More than a century later, the Club brings together business, professional and civic leaders every Thursday for fellowship and service, as part of Rotary District 3810. The Club is led in Rotary Year 2026–2027 by President Reginald T. Yu.</p>
</div>
</section>

<section class="impact" id="impact"><div class="wrap">
<h2>Our impact at a glance</h2>
<div class="impact-grid">
<div><b>107</b><strong>Years of service</strong><span>Chartered 1 June 1919 · Charter No. 478</span></div>
<div><b>500</b><strong>Families served</strong><span>Through community service in RY 2025–2026</span></div>
<div><b>1,588</b><strong>Children reached</strong><span>Through community service in RY 2025–2026</span></div>
<div><b>$30K</b><strong>To The Rotary Foundation</strong><span>About US$30,000 in RY 2025–2026</span></div>
</div>
<p class="impact-note">Figures from the Club's RY 2025–2026 report.</p>
</div></section>

${issue ? `<section class="wrap section" id="stories">
<div class="section-head"><div><span class="eyebrow">From the latest Balita</span><h2>Stories of service</h2></div><a class="btn btn-line" style="color:var(--navy)" href="/balita/${issue.issue_no}">See all of issue ${issue.issue_no}</a></div>
<div class="grid3">${(withPhotos.length >= 3 ? withPhotos : arts).slice(0, 6).map((a) => storyCard(issue, a)).join('')}</div>
</section>

<section class="balita-band"><div class="wrap">
${issue.cover_path ? `<img class="cover" src="${img(issue.cover_path, 520)}" alt="Cover of Balita issue ${issue.issue_no}">` : '<div></div>'}
<div><span class="eyebrow">Published every Thursday</span><h2>Balita</h2>
<p style="font-size:19px;color:#243446;max-width:36em;margin:10px 0 0">The official publication of the Rotary Club of Manila. Read each issue as it was laid out, or story by story on your phone, and share any article with a link.</p>
<div class="mini-list">${withPhotos.slice(0, 4).map((a) => `<a class="mini" href="/balita/${issue.issue_no}/${a.slug}"><img src="${img(leadPhoto(a).path, 200)}" alt="">${esc(a.title)}</a>`).join('')}</div>
<div style="display:flex;gap:12px;flex-wrap:wrap"><a class="btn btn-navy" href="/balita/${issue.issue_no}">Read issue ${issue.issue_no}</a><a class="btn btn-line" style="color:var(--navy)" href="/balita">Browse the archive</a></div>
</div></div></section>` : `<div class="empty">The first Balita issue will appear here once it is published.</div>`}

<section class="join" id="join"><div class="wrap" style="display:flex;flex-direction:column;gap:16px">
<span class="eyebrow" style="color:var(--gold)">Membership</span>
<h2>Leadership becomes more meaningful in the service of others.</h2>
<p>Join a community of leaders working for a stronger Manila and a brighter Philippines. Come to a Thursday meeting as our guest.</p>
<div style="display:flex;gap:12px;flex-wrap:wrap"><a class="btn btn-gold" href="/meeting">Attend as a guest</a><a class="btn btn-line" style="color:#fff" href="${mailto('Membership inquiry')}">Membership inquiry</a></div>
</div></section>
<div class="wrap actions">
<a href="/meeting"><b>Attend</b><span>Thursday lunch meetings</span></a><a href="#join"><b>Join</b><span>Become a member</span></a>
<a href="${mailto('Volunteering for a project')}"><b>Volunteer</b><span>Help on a project</span></a><a href="${mailto('Partnering with the Rotary Club of Manila')}"><b>Partner</b><span>Work with the Club</span></a>
<a class="donate" href="/donate"><b>Donate</b><span>Support our projects</span></a>
</div>`;
  return layout({
    title: 'Rotary Club of Manila',
    description: "Asia's first Rotary club, serving since 1919. Read the latest Balita and join us every Thursday.",
    image: heroSrc ? img(leadPh.path, 1200) : '', url: origin + '/', body,
  });
}

async function archive(origin) {
  const issues = await liveIssues(40);
  const body = `<section class="wrap section">
<div><span class="eyebrow">The official publication of the Rotary Club of Manila</span><h1 style="font-size:48px">Balita</h1></div>
${issues.length ? `<div class="grid3">${issues.map((i) => `<a class="story" href="/balita/${i.issue_no}">
${i.cover_path ? `<div class="ph" style="aspect-ratio:9/16;max-width:220px"><img src="${img(i.cover_path, 400)}" alt="Cover of issue ${i.issue_no}" loading="lazy"></div>` : ''}
<h3>Issue No. ${i.issue_no}</h3><p>${esc(fmtDate(i.issue_date))}</p>${i.summary ? `<p>${esc(i.summary)}</p>` : ''}</a>`).join('')}</div>` : '<div class="empty">No issues published yet.</div>'}
</section>`;
  return layout({ title: 'Balita · Rotary Club of Manila', description: 'Every issue of the Balita, the weekly publication of the Rotary Club of Manila.', url: origin + '/balita', body, nav: 'balita' });
}

async function issuePage(origin, no) {
  const rows = await q(`rcm_issues?select=*&issue_no=eq.${Number(no)}`);
  const issue = rows[0];
  if (!issue) return null;
  const arts = await articlesOf(issue.id);
  const url = `${origin}/balita/${issue.issue_no}`;
  const title = `Balita · Issue No. ${issue.issue_no}`;
  const pages = Array.isArray(issue.pages) ? issue.pages : [];
  const body = `
<section class="issue-head"><div class="wrap">
${issue.cover_path ? `<img class="cover" src="${img(issue.cover_path, 520)}" alt="Cover of Balita issue ${issue.issue_no}">` : '<div></div>'}
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
<button class="tab" role="tab" id="t-a" aria-selected="true" aria-controls="v-a">Articles</button>
<button class="tab" role="tab" id="t-l" aria-selected="false" aria-controls="v-l">Layout view</button>
<span style="margin-left:auto;align-self:center;color:var(--muted);font-size:15px">${arts.length} stories</span>
</div></div>
<section class="wrap section" id="v-a" role="tabpanel" aria-labelledby="t-a"><div class="grid3">${arts.map((a) => storyCard(issue, a)).join('')}</div></section>
<section class="wrap section" id="v-l" role="tabpanel" aria-labelledby="t-l" hidden>
<p style="margin:0;color:var(--ink-2)">The issue as it was printed, spread by spread. Switch to Articles for easy reading on a phone.</p>
<div class="pages">${pages.map((p, i) => `<figure><a href="${raw(p)}" target="_blank" rel="noopener"><img src="${img(p, 900)}" alt="Balita issue ${issue.issue_no}, PDF page ${i + 1}" loading="lazy"></a><figcaption>Page ${i + 1} of ${pages.length}</figcaption></figure>`).join('')}</div>
</section>
<script>
(function(){var a=document.getElementById('t-a'),l=document.getElementById('t-l'),va=document.getElementById('v-a'),vl=document.getElementById('v-l');
function show(x){var isA=x===a;a.setAttribute('aria-selected',isA);l.setAttribute('aria-selected',!isA);va.hidden=!isA;vl.hidden=isA;}
a.onclick=function(){show(a)};l.onclick=function(){show(l)};if(location.hash==='#layout')show(l);})();
</script>`;
  return layout({ title, description: issue.summary || `The ${fmtDate(issue.issue_date)} issue of the Rotary Club of Manila's weekly publication.`, image: issue.cover_path ? img(issue.cover_path, 1200) : '', url, body, nav: 'balita' });
}

async function articlePage(origin, no, slug) {
  const rows = await q(`rcm_issues?select=*&issue_no=eq.${Number(no)}`);
  const issue = rows[0];
  if (!issue) return null;
  const arts = await articlesOf(issue.id);
  const a = arts.find((x) => x.slug === slug);
  if (!a) return null;
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
      html += `<figure><img src="${img(p.path, 1200)}" alt="${esc(p.caption)}" loading="lazy">${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`;
    }
  });
  const leftover = rest.slice(pi);
  if (leftover.length) html += leftover.map((p) => `<figure><img src="${img(p.path, 1200)}" alt="${esc(p.caption)}" loading="lazy">${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`).join('');
  const others = arts.filter((x) => x.id !== a.id).slice(0, 3);
  const body = `<article class="article">
<a href="/balita/${issue.issue_no}" style="font-weight:600;font-size:15px">← Balita · Issue ${issue.issue_no} · ${esc(fmtDate(issue.issue_date))}</a>
<span class="eyebrow">${esc(a.kicker || 'Balita')}</span>
<h1>${esc(a.title)}</h1>
${a.dek ? `<p class="dek">${esc(a.dek)}</p>` : ''}
${a.byline ? `<span class="byline">${esc(a.byline)}</span>` : ''}
${lead ? `<figure><img src="${img(lead.path, 1400)}" alt="${esc(lead.caption || a.title)}">${lead.caption ? `<figcaption>${esc(lead.caption)}</figcaption>` : ''}</figure>` : ''}
<div class="share-row">${shareBar(url, a.title, true)}</div>
<div class="body">${html}</div>
<div class="from-issue">${issue.cover_path ? `<img src="${img(issue.cover_path, 160)}" alt="">` : ''}<div><strong>From Balita Issue ${issue.issue_no}</strong>
<a href="/balita/${issue.issue_no}#layout">See this story as printed${a.printed_pages ? ', ' + esc(a.printed_pages) : ''}</a><a href="/balita/${issue.issue_no}">Read the whole issue</a></div></div>
${others.length ? `<h2 style="font-size:24px;margin-top:12px">More from this issue</h2><div style="display:flex;flex-direction:column;gap:14px">${others.map((o) => { const p = leadPhoto(o); return `<a class="mini" style="background:var(--tint)" href="/balita/${issue.issue_no}/${o.slug}">${p ? `<img src="${img(p.path, 200)}" alt="">` : ''}${esc(o.title)}</a>`; }).join('')}</div>` : ''}
</article>`;
  return layout({ title: `${a.title} · Balita ${issue.issue_no}`, description: a.dek || `From the Balita, issue ${issue.issue_no}.`, image: lead ? img(lead.path, 1200) : (issue.cover_path ? img(issue.cover_path, 1200) : ''), url, body, nav: 'balita' });
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

function donatePage(origin) {
  const body = `<section class="wrap section donate-page">
<div><span class="eyebrow">Support our projects</span><h1 style="font-size:clamp(32px,5vw,48px)">Donate to the Rotary Club of Manila</h1>
<p class="lead-p">Your gift supports the Club's service projects in Manila and across the Philippines. Pay with any Philippine bank or e-wallet app, with no fees, using the Club's QR Ph code.</p></div>
<div class="donate-grid">
<figure class="qr-card"><span class="qr-name">ROTARY CLUB OF MANILA</span><img src="/assets/rcm-qrph.png" alt="QR Ph code for the Rotary Club of Manila" width="410" height="410"><figcaption>QR Ph · RCBC QR Pay</figcaption>
<a class="btn btn-navy" href="/assets/rcm-qrph.png" download="Rotary-Club-of-Manila-QRPh.png">Save QR image</a></figure>
<div class="steps-card"><h2>How to give</h2>
<ol class="howto">
<li><strong>Open your bank or e-wallet app</strong> such as GCash, Maya, BPI, BDO, RCBC or any app with QR Ph.</li>
<li><strong>Choose Scan QR or Pay QR,</strong> and point your camera at the code. On a phone, tap <em>Save QR image</em> first, then choose <em>Upload QR</em> in your app.</li>
<li><strong>Check that the name shows Rotary Club of Manila,</strong> enter the amount, and confirm.</li>
<li><strong>Tell us about your gift</strong> so we can thank you and send an acknowledgment: <a href="${mailto('Donation made via QR Ph')}">${MAIL}</a> or <a href="${TEL}">(02) 8527-1885</a>. Mention a project if you'd like your gift to go to one.</li>
</ol></div>
</div></section>`;
  return layout({ title: 'Donate · Rotary Club of Manila', description: 'Support the service projects of the Rotary Club of Manila using QR Ph from any bank or e-wallet app.', url: origin + '/donate', body });
}

module.exports = async (req, res) => {
  const u = new URL(req.url, `https://${req.headers.host}`);
  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const r = u.searchParams.get('r') || 'home';
  let html = null;
  try {
    if (r === 'home') html = await home(origin);
    else if (r === 'archive') html = await archive(origin);
    else if (r === 'issue') html = await issuePage(origin, u.searchParams.get('no'));
    else if (r === 'article') html = await articlePage(origin, u.searchParams.get('no'), u.searchParams.get('slug'));
    else if (r === 'meeting') html = await meetingPage(origin, u.searchParams.get('date'));
    else if (r === 'donate') html = donatePage(origin);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(layout({ title: 'Something went wrong', description: '', body: `<div class="empty">The page could not load (${esc(e.message)}). Please try again in a minute.</div>` }));
  }
  if (!html) {
    res.statusCode = 404;
    html = layout({ title: 'Not found · Rotary Club of Manila', description: '', body: '<div class="empty">This page is not published yet, or the link is wrong. <a href="/balita">See all Balita issues</a>.</div>' });
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  res.end(html);
};

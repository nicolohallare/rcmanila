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
const leadPhoto = (a) => (a.photos || []).find((p) => p.include !== false);

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
<a href="/#about">Our Club</a><a href="/#impact">Our Impact</a><a href="/#meeting">Meetings &amp; Events</a>
<a href="/balita" class="${nav === 'balita' ? 'on' : ''}">Balita</a><a href="/#join">Membership</a><a href="/#contact">Contact</a>
</nav>
<a class="btn btn-gold" href="/#meeting">Attend a meeting</a>
</div></header>
<main>${body}</main>
<footer class="foot" id="contact"><div class="wrap">
<div style="display:flex;flex-direction:column;gap:12px;max-width:320px"><span class="chip"><img src="/assets/logo.png" alt="Rotary Club of Manila"></span><span>Asia's first Rotary club. Service above self since 1919.</span></div>
<div><strong style="color:#fff">Secretariat</strong><br>Contact details to follow</div>
<div><strong style="color:#fff">Balita</strong><br><a href="/balita">All issues</a></div>
<div>Rotary District 3810<br>© ${new Date().getFullYear()} Rotary Club of Manila</div>
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
  const body = `
<section class="hero"><div class="wrap">
<div class="hero-text">
<span class="eyebrow">People · Partnerships · Lasting change</span>
<h1>The first Rotary club in Asia. Still leading through service.</h1>
<p>Since 1919, leaders in Manila have come together every week to serve communities across the Philippines and beyond.</p>
<div class="hero-cta"><a class="btn btn-gold" href="#meeting">Attend a meeting</a><a class="btn btn-line" style="color:#fff" href="#impact">See our impact</a><a class="btn btn-line" style="color:#fff" href="#join">Explore membership</a></div>
</div>
<figure class="hero-photo" style="margin:0">${heroSrc ? `<img src="${heroSrc}" alt="${esc(leadPh.caption || lead.title)}">` : ''}
${lead ? `<figcaption><a href="/balita/${issue.issue_no}/${lead.slug}" style="color:#fff">${esc(leadPh && leadPh.caption ? leadPh.caption : lead.title)}</a></figcaption>` : ''}</figure>
</div></section>

<div class="band-tint" id="meeting"><div class="wrap cards3">
<article class="card"><div class="in">
<span class="eyebrow">Weekly meeting</span>
<div style="display:flex;gap:16px;align-items:center">
<div class="date-chip"><span>${nextThu.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}</span><b>${nextThu.getDate()}</b><small>Thursday</small></div>
<div><strong>Every Thursday, lunch meeting</strong><br>Time and venue from the Secretariat</div>
</div>
<p>Members and guests are welcome at our weekly Thursday meeting.</p>
<a class="more" href="#contact">Ask the Secretariat about attending →</a>
</div></article>
${lead ? `<article class="card">${leadPh ? `<img src="${img(leadPh.path, 800)}" alt="" style="aspect-ratio:16/9;object-fit:cover;width:100%">` : ''}<div class="in">
<span class="eyebrow">Featured story</span><h3>${esc(lead.title)}</h3>${lead.dek ? `<p>${esc(lead.dek)}</p>` : ''}
<a class="more" href="/balita/${issue.issue_no}/${lead.slug}">Read the story →</a></div></article>` : ''}
${issue ? `<article class="card"><div class="in" style="flex-direction:row;gap:18px">
${issue.cover_path ? `<img src="${img(issue.cover_path, 300)}" alt="Cover of Balita issue ${issue.issue_no}" style="width:118px;border-radius:4px;box-shadow:0 8px 20px rgba(7,44,82,.25);align-self:flex-start">` : ''}
<div style="display:flex;flex-direction:column;gap:8px"><span class="eyebrow">Latest Balita</span><h3>Issue No. ${issue.issue_no}</h3><span style="color:var(--muted)">${esc(fmtDate(issue.issue_date))}</span>
<a class="btn btn-blue" href="/balita/${issue.issue_no}" style="margin-top:auto">Read online</a></div></div></article>` : ''}
</div></div>

<section class="impact" id="impact"><div class="wrap">
<h2>Our impact at a glance</h2>
<div class="impact-grid">
<div><b>107</b><strong>Years of service</strong><span>Founded in 1919 at the Manila Hotel</span></div>
<div><b>500</b><strong>Families served</strong><span>Through community service in RY 2025–2026</span></div>
<div><b>1,588</b><strong>Children reached</strong><span>Through community service in RY 2025–2026</span></div>
<div><b>$30K</b><strong>To The Rotary Foundation</strong><span>About US$30,000 in RY 2025–2026</span></div>
</div>
<p class="impact-note">Figures from the Club's RY 2025–2026 report.</p>
</div></section>

${issue ? `<section class="wrap section" id="about">
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
<div style="display:flex;gap:12px;flex-wrap:wrap"><a class="btn btn-gold" href="#meeting">Attend as a guest</a><a class="btn btn-line" style="color:#fff" href="#contact">Membership inquiry</a></div>
</div></section>
<div class="wrap actions">
<a href="#meeting"><b>Attend</b><span>Thursday lunch meetings</span></a><a href="#join"><b>Join</b><span>Become a member</span></a>
<a href="#contact"><b>Volunteer</b><span>Help on a project</span></a><a href="#contact"><b>Partner</b><span>Work with the Club</span></a>
<a class="donate" href="#contact"><b>Donate</b><span>Support our projects</span></a>
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

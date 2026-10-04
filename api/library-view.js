// The Heritage Library: 107 years of the Rotary Club of Manila in its own words and pictures.
// Rendered on the server like the rest of the site; scans and photos are served from the club's public
// archive storage (archive.rcmanila.org). Everything here reads only rows marked published.
const CATALOGUE = require('./library-catalogue.json');

const ARCH = 'https://archive.rcmanila.org';
const LAUNCHED = true; // linked from the menu and open to search engines (set false to hide it again)

module.exports = function libraryModule(ctx) {
  const { layout, esc, q, fmtDate, PRES, searchBalita, img } = ctx;
  // Pictures from the archive (archive.rcmanila.org) or from the website's own storage (Balita photos).
  const anySrc = (p, w = 900) => (!p ? '' : /^(issues|legacy|covers|events|projects)\//.test(p) ? img(p, w) : aSrc(p));
  const aSrc = (p) => (!p ? '' : /^https?:|^\//.test(p) ? p : `${ARCH}/${p.split('/').map(encodeURIComponent).join('/')}`);
  const safe = async (fn, dflt) => { try { return await fn(); } catch (e) { return dflt; } };
  const yearsAgo = (y) => new Date().getFullYear() - y;
  const pad = (n) => String(n).padStart(4, '0');
  const eraOf = (y) => PRES.decades.find((d) => { const [a, b] = d.label.split('–').map(Number); return y >= a && y < b; }) || PRES.decades[PRES.decades.length - 1];
  const eraYear = (d) => Number(d.label.slice(0, 4));
  const presStart = (p) => p.start || Number(p.years.slice(0, 4));
  const presId = (x) => x.id || 'p-' + x.years.slice(0, 4) + (x.years === '1945–1946' ? 'b' : '');
  const volSlug = (v) => (v.acc || v.id).toLowerCase();
  const catCount = (pred) => CATALOGUE.filter(pred).length;

  function page(title, description, body, url, image) {
    let html = layout({ title, description, body, url, image, nav: 'library' });
    if (!LAUNCHED) html = html.replace('<head>', '<head>\n<meta name="robots" content="noindex">');
    return html;
  }
  const libNav = (on) => `<nav class="lib-nav" aria-label="Heritage Library"><div class="wrap">
<a href="/library" class="${on === 'home' ? 'on' : ''}">Library</a><a href="/library/exhibit" class="${on === 'exhibit' ? 'on' : ''}">This month’s exhibit</a><a href="/library/timeline" class="${on === 'timeline' ? 'on' : ''}">Timeline</a><a href="/library/era/1919" class="${on === 'eras' ? 'on' : ''}">Decades</a><a href="/library/balita" class="${on === 'balita' ? 'on' : ''}">Reading room</a><a href="/library/photos" class="${on === 'photos' ? 'on' : ''}">Photographs</a><a href="/library/videos" class="${on === 'videos' ? 'on' : ''}">Video room</a><a href="/library/trophies" class="${on === 'trophies' ? 'on' : ''}">Trophy room</a><a href="/library/name" class="${on === 'name' ? 'on' : ''}">Find a name</a><a href="/library/ask" class="${on === 'ask' ? 'on' : ''}">Ask the archive</a><a href="/library/collection" class="${on === 'collection' ? 'on' : ''}">Catalogue</a>
<form action="/library/search" method="get" role="search" class="lib-nav-s"><input name="q" type="search" placeholder="Search 100 years" aria-label="Search the library"></form>
</div></nav>`;

  // ---------- data ----------
  const volumes = () => safe(() => q('rcm_lib_volumes?select=id,acc,title,years,year_from,year_to,issue_from,issue_to,page_count,cover_path&status=eq.published&order=year_from'), []);
  const galleries = () => safe(() => q('rcm_lib_galleries?select=id,slug,title,event_date,place,cover_path,photo_count,balita_url&status=eq.published&order=event_date.desc'), []);
  const tidyO = (o) => {
    const t = (x) => String(x || '').replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '');
    let title = t(o.title).replace(/\s*—\s*(\d+\s+(plaques?|trophies|trophy|medals?|pieces?|items?)|(colou?red |printed |print )[^—]*|[^—]*(special|parchment) paper[^—]*)$/i, '').replace(/\s*—\s*(\d+\s+(plaques?|trophies|trophy|medals?|pieces?|items?)|(colou?red |printed |print )[^—]*|[^—]*(special|parchment) paper[^—]*)$/i, '').replace(/\s*\[?realia\]?/i, '');
    title = title.replace(/^(presents this|is hereby presented to|is presented to)\s+/i, '');
    if (title) title = title[0].toUpperCase() + title.slice(1);
    let kind = t(o.kind);
    if (/gavel/i.test(kind + ' ' + title) && !/^(Plaque|Trophy|Certificate|Medal)$/.test(kind)) kind = 'Keepsake';
    if (!/^(Plaque|Trophy|Certificate|Medal|Photo album|Sculpture|Ceramic)$/i.test(kind)) kind = kind && kind.length < 16 && !/rotary|club/i.test(kind) ? kind : 'Keepsake';
    if (kind === 'Object') kind = 'Keepsake';
    const giver = t(o.giver).replace(/Rotary Club fof/i, 'Rotary Club of').replace(/^RC Manila$/i, 'Rotary Club of Manila');
    return { ...o, title, kind, giver: giver || null };
  };
  const SRC = { ri: 'From Rotary International and The Rotary Foundation', district: 'From District 3810', club_other: 'From Rotary clubs at home and abroad', partner: 'From partners, communities and friends', rcm: 'The Club\'s own honors and keepsakes', other: 'Other honors and gifts' };
  const srcOf = (o) => {
    if (SRC[o.source_group]) return o.source_group;
    const g = o.giver || '', all = `${g} ${o.title || ''}`;
    if (g) {
      if (/district|\b(P?DG|Dist\.? Gov)/i.test(g)) return 'district';
      if (/rotary international|rotary foundation|^RI\b/i.test(g)) return 'ri';
      if (/(rotary|rotaract|interact) club|RC\s/i.test(g) && !/of manila|RC ?Manila|RCManila/i.test(g)) return 'club_other';
      if (/^Richard D\.? King$/i.test(g) || /presidential citation|paul harris|rotary foundation|\bTRF\b/i.test(o.title || '')) return 'ri';
      if (/gavel|presidential award|club service award|perfect attendance|one hundred percent|pillar of rotary|attendance/i.test(o.title || '')) return 'rcm';
      if (/\b(best|outstanding|excellence|most|champion|top club|quest|all.?star|governor|citation of merit|district|discon|manila area|category \d)\b/i.test(o.title || '') && !/university|school|inc\b|scouts|council|team|hospi/i.test(g)) return 'district';
      if (/manila|RCM|RCManila|\b(PP|Rtn|RTN|STAR Rtn)\.?\s/i.test(g)) return 'rcm';
      return 'partner';
    }
    if (/governor|district|discon|category \d|manila area|\bR\.?I\.? district/i.test(all)) return 'district';
    if (/\bTRF\b|foundation contribution|presidential citation|rotary international/i.test(all)) return 'ri';
    if (/\b(best|outstanding|excellence|most|champion|top club|quest|all.?star|citation of merit)\b/i.test(all)) return 'district';
    if (/anniversary|one century|centennial|gavel|rotary club of manila|meritorious|presidential award|honorary member|plate|album|envelope/i.test(all)) return 'rcm';
    return 'other';
  };
  const objects = (limit = 2000) => safe(() => q(`rcm_lib_objects?select=acc,title,giver,kind,year,image_path,width,height,note,polished,recipient,inscription,featured,original_path,source_group&status=eq.published&order=year.desc.nullslast&limit=${limit}`), []).then((r) => r.map(tidyO));
  const timeline = () => safe(() => q('rcm_lib_events?select=id,year,month,headline,body,links,image_path&status=eq.published&order=year,month.nullsfirst,id'), []);
  const exhibits = () => safe(() => q('rcm_lib_exhibits?select=*&status=eq.published&order=month.desc'), []);
  const currentExhibit = (list) => { const m = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 7) + '-01'; return list.find((x) => x.month <= m) || list[list.length - 1] || null; };
  async function thisWeek(vols) {
    if (!vols.length) return null;
    const ids = vols.map((v) => v.id).join(',');
    const iss = await safe(() => q(`rcm_lib_issues?select=volume_id,issue_no,issue_date,cover_page,cover_path,blurb,is_read&volume_id=in.(${ids})&issue_date=not.is.null`), []);
    const now = new Date(Date.now() + 8 * 3600e3); const t = now.getUTCMonth() * 31 + now.getUTCDate();
    let best = null, bd = 1e9;
    for (const i of iss) { if (!i.issue_date) continue; const m = Number(i.issue_date.slice(5, 7)) - 1, d = Number(i.issue_date.slice(8, 10)); let diff = Math.abs(m * 31 + d - t); diff = Math.min(diff, 372 - diff); if (diff < bd || (diff === bd && i.is_read && !best.is_read)) { bd = diff; best = i; } }
    if (!best) return null;
    const v = vols.find((x) => x.id === best.volume_id);
    const cov = best.cover_path ? [{ image_path: best.cover_path }] : await safe(() => q(`rcm_lib_pages?select=image_path&volume_id=eq.${v.id}&n=eq.${best.cover_page}`), []);
    return { ...best, vol: v, cover: cov[0] && cov[0].image_path };
  }

  // ---------- landing ----------
  async function landing(origin) {
    const [vols, gals, objs, exs, tlc, vids] = await Promise.all([volumes(), galleries(), objects(12), exhibits(), safe(() => q('rcm_lib_events?select=id&status=eq.published&limit=1'), []), videos()]);
    const ex = currentExhibit(exs);
    const pages = vols.reduce((s, v) => s + (v.page_count || 0), 0);
    const photos = gals.reduce((s, g) => s + (g.photo_count || 0), 0);
    const wk = await thisWeek(vols);
    const cats = {};
    for (const c of CATALOGUE) cats[c.c] = (cats[c.c] || 0) + 1;
    const stats = [[PRES.presidents.length, 'presidents since 1919'], [CATALOGUE.length.toLocaleString('en'), 'items catalogued'], pages ? [pages.toLocaleString('en'), 'Balita pages to read'] : null, photos ? [photos.toLocaleString('en'), 'photographs'] : null].filter(Boolean);
    const body = `${libNav('home')}
<section class="lib-hero"><div class="wrap">
<span class="lib-eyebrow">The Heritage Library · 1919–${new Date().getFullYear()}</span>
<h1>A century of service, in the Club’s own words and pictures</h1>
<p>The Balita as members read it, week by week since 1948. The photographs of their projects and fellowship. The plaques, trophies and books the Club gathered in more than a hundred years as Asia’s first Rotary club.</p>
<form action="/library/search" method="get" role="search" class="lib-search"><input name="q" type="search" placeholder="Search a name, a project, a year: “Quirino”, “Pinatubo”, “polio”" aria-label="Search the Heritage Library"><button class="btn btn-gold" type="submit">Search</button></form>
<div class="lib-stats">${stats.map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('')}</div>
<p class="lib-growing">The library is growing: volumes, issues and albums are being added from the Club’s archive every week.</p>
</div></section>
<section class="lib-museum"><div class="wrap lib-museum-in">
${ex ? `<a class="lib-mcard ex" href="/library/exhibit/${esc(ex.slug)}">${ex.cover ? `<span class="im"><img src="${esc(anySrc(ex.cover, 900))}" alt="" loading="lazy"></span>` : ''}<span class="tx"><span class="lib-eyebrow dark">This month’s exhibit</span><strong>${esc(ex.title)}</strong><span>${esc((ex.intro || '').slice(0, 150))}${(ex.intro || '').length > 150 ? '…' : ''}</span><em>Visit the exhibit →</em></span></a>` : ''}
<div class="lib-mcard"><span class="lib-eyebrow dark">Find a name</span><strong>Is your family in the Balita?</strong><span>Search a name and see every page it was printed on since 1948, year by year.</span><form action="/library/name" method="get" class="lib-mform"><input name="q" type="search" placeholder="A name" aria-label="A name"><button class="btn btn-navy" type="submit">Find</button></form></div>
<div class="lib-mcard"><span class="lib-eyebrow dark">Ask the archive</span><strong>Ask a question about the Club’s history</strong><span>Answered from the Balita, with links to the pages.</span><form action="/library/ask" method="get" class="lib-mform"><input name="q" type="search" placeholder="e.g. How has the Club helped fight polio?" aria-label="Your question"><button class="btn btn-navy" type="submit">Ask</button></form>${tlc.length ? '<a class="link-arrow" href="/library/timeline" style="margin-top:6px">Or walk through the timeline</a>' : ''}</div>
</div></section>
${wk ? `<section class="lib-week"><div class="wrap lib-week-in">
<a class="lib-week-cover" href="/library/balita/${volSlug(wk.vol)}/${wk.issue_no}"><img src="${esc(aSrc(wk.cover))}" alt="Cover of Balita No. ${wk.issue_no}" loading="lazy"></a>
<div><span class="lib-eyebrow dark">This week in club history · ${yearsAgo(Number(wk.issue_date.slice(0, 4)))} years ago</span>
<h2>Balita No. ${wk.issue_no}, ${esc(fmtDate(wk.issue_date))}</h2>
${wk.blurb ? `<p>${esc(wk.blurb)}</p>` : ''}
<a class="btn btn-navy" href="/library/balita/${volSlug(wk.vol)}/${wk.issue_no}">Read this issue</a></div>
</div></section>` : ''}
<section class="lib-sec"><div class="wrap">
<div class="section-head"><div><span class="kicker">A century, decade by decade</span><h2>Eleven decades of the Club</h2></div></div>
<div class="lib-eras">${PRES.decades.map((d) => { const ps = PRES.presidents.filter((p) => p.decade === d.key); const face = ps[0]; return `<a class="lib-era" href="/library/era/${eraYear(d)}"><span class="lib-era-y">${esc(d.label)}</span><strong>${esc(d.title)}</strong><span class="lib-era-faces">${ps.slice(0, 5).map((p) => `<img src="${p.img}" alt="" loading="lazy" width="40" height="40">`).join('')}</span><span class="lib-era-n">${ps.length} presidents${vols.filter((v) => v.year_from >= eraYear(d) && v.year_from < eraYear(d) + 10).length ? ` · ${vols.filter((v) => v.year_from >= eraYear(d) && v.year_from < eraYear(d) + 10).length} Balita volumes` : ''}</span></a>`; }).join('')}</div>
</div></section>
<section class="lib-sec lib-paper"><div class="wrap">
<div class="section-head"><div><span class="kicker">The reading room</span><h2>The Rotary Balita, from 1948</h2><p class="lib-lede">Every issue as it was printed, page by page, with the text searchable. The Balita itself began in 1919, but the Club’s records before 1948 were lost when they were burned during the war.</p></div><a class="link-arrow" href="/library/balita">All volumes</a></div>
${shelf(vols.slice(0, 12), true)}
</div></section>
${gals.length ? `<section class="lib-sec"><div class="wrap">
<div class="section-head"><div><span class="kicker">Photographs</span><h2>The Club at work and in fellowship</h2></div><a class="link-arrow" href="/library/photos">All albums</a></div>
<div class="lib-gals">${gals.slice(0, 6).map(galCard).join('')}</div></div></section>` : ''}
${vids.length ? `<section class="lib-sec"><div class="wrap">
<div class="section-head"><div><span class="kicker">The video room</span><h2>The Club on film</h2></div><a class="link-arrow" href="/library/videos">All ${vids.length} films</a></div>
<div class="lib-gals">${vids.filter((v) => v.category === 'film' || v.category === 'project').slice(0, 3).map(vidCard).join('')}</div></div></section>` : ''}
${objs.length ? `<section class="lib-sec lib-dark"><div class="wrap">
<div class="section-head"><div><span class="kicker">The trophy room</span><h2>Honors given and received</h2></div><a class="link-arrow" href="/library/trophies">Enter the trophy room</a></div>
<div class="lib-objs">${objs.slice().sort((a, b) => (b.polished ? 1 : 0) - (a.polished ? 1 : 0)).slice(0, 8).map(objCard).join('')}</div></div></section>` : ''}
<section class="lib-sec"><div class="wrap">
<div class="section-head"><div><span class="kicker">The collection</span><h2>${CATALOGUE.length.toLocaleString('en')} items in the Club’s library</h2><p class="lib-lede">Catalogued in 2023: bound Balita volumes, anniversary programs, handbooks, conference books, photo albums, plaques and trophies.</p></div><a class="link-arrow" href="/library/collection">Browse the catalogue</a></div>
<div class="lib-chips">${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<a href="/library/collection#c=${encodeURIComponent(c)}">${esc(c)} <b>${n.toLocaleString('en')}</b></a>`).join('')}</div>
</div></section>`;
    return page('The Heritage Library · Rotary Club of Manila', 'A century of the Rotary Club of Manila in its own words and pictures: the Balita since 1948, photographs, trophies and 105 presidents since 1919.', body, origin + '/library', wk && wk.cover ? aSrc(wk.cover) : null);
  }

  function shelf(vols, withModern) {
    const cards = vols.map((v) => `<a class="lib-vol" href="/library/balita/${volSlug(v)}"><span class="lib-vol-cv">${v.cover_path ? `<img src="${esc(aSrc(v.cover_path))}" alt="" loading="lazy">` : `<span class="lib-vol-ph">${esc(v.years || '')}</span>`}</span><strong>${esc(v.years || v.title)}</strong><span>${v.issue_from ? `Nos. ${v.issue_from}–${v.issue_to}` : esc(v.title)}</span></a>`);
    if (withModern) cards.push(`<a class="lib-vol modern" href="/balita"><span class="lib-vol-cv"><span class="lib-vol-ph">Today</span></span><strong>Recent issues</strong><span>The weekly Balita on this website</span></a>`);
    return cards.length > (withModern ? 1 : 0) ? `<div class="lib-shelf">${cards.join('')}</div>` : `<div class="lib-empty">The first volumes are being prepared. <a href="/balita">Read the recent Balita issues</a> in the meantime.</div>`;
  }
  const videos = () => safe(() => q('rcm_lib_videos?select=slug,title,category,year,month,speaker,description,poster,duration,width,height,path,links&status=eq.published&path=not.is.null&order=sort.asc,year.asc'), []);
  const VCAT = [['film', 'Club films', 'Short films about the Club and its history.'], ['project', 'Project films', 'Films the Club made about its service projects for its centennial in 2019.'], ['event', 'Club events', 'Award nights, visits and celebrations.'], ['speaker', 'Guest speakers', 'Guests of honor at the Club’s weekly meetings, 2017 to 2020.'], ['meeting', 'Meetings on Zoom', 'Weekly meetings held online during the pandemic, 2020 and 2021.']];
  const MONS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const vWhen = (v) => [v.month ? MONS[v.month] : '', v.year || ''].filter(Boolean).join(' ');
  const vLen = (d) => { d = Math.round(Number(d) || 0); if (!d) return ''; const h = Math.floor(d / 3600), m = Math.floor(d % 3600 / 60), s = d % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`; };
  const vidCard = (v) => `<a class="lib-gal lib-vid" href="/library/videos/${esc(v.slug)}"><span class="im">${v.poster ? `<img src="${esc(aSrc(v.poster))}" alt="" loading="lazy">` : '<span class="ph"></span>'}<i class="play" aria-hidden="true"></i>${v.duration ? `<em>${vLen(v.duration)}</em>` : ''}</span><small>${esc(vWhen(v))}</small><strong>${esc(v.title)}</strong></a>`;
  const galCard = (g) => `<a class="lib-gal" href="/library/photos/${esc(g.slug)}"><span class="im">${g.cover_path ? `<img src="${esc(aSrc(g.cover_path))}" alt="" loading="lazy">` : ''}</span><small>${esc(g.event_date ? fmtDate(g.event_date) : '')}${g.photo_count ? ` · ${g.photo_count} photos` : ''}</small><strong>${esc(g.title)}</strong></a>`;
  const objCard = (o) => `<button type="button" class="lib-obj${o.polished ? ' pol' : ''}" data-obj="${esc(o.acc)}"><span class="im"><img src="${esc(aSrc(String(o.image_path || '').replace(/\.jpg$/, '-t.jpg')))}" data-full="${esc(aSrc(o.image_path))}" onerror="if(this.dataset.full&&this.src!==this.dataset.full)this.src=this.dataset.full" alt="${esc(o.title || '')}" loading="lazy"></span><strong>${esc(o.title || o.kind || 'Object')}</strong><small>${[o.year, o.giver].filter(Boolean).map(esc).join(' · ')}</small></button>`;

  // ---------- an era (decade) ----------
  async function era(origin, y) {
    const d = eraOf(Number(y) || 1919); const y0 = eraYear(d), y1 = y0 + 10;
    const [vols, gals, tl, objs] = await Promise.all([volumes(), galleries(), timeline(), objects()]);
    const ps = PRES.presidents.filter((p) => p.decade === d.key);
    const i = PRES.decades.indexOf(d), prev = PRES.decades[i - 1], next = PRES.decades[i + 1];
    const KEEP = new Set(['Inaugural programs', 'History & anniversaries', 'District conferences', 'TOWER Awards', 'Concerts & chorale', 'Programs of action', 'Handbooks', 'Code of policies', 'Medical missions', 'Projects', 'Foundation']);
    const items = CATALOGUE.filter((c) => c.y && c.y >= y0 && c.y < y1 && KEEP.has(c.c));
    const years = ps.map((p) => {
      const ys = presStart(p);
      const vs = vols.filter((v) => v.year_from === ys);
      const gs = gals.filter((g) => g.event_date && ((Number(g.event_date.slice(0, 4)) === ys && Number(g.event_date.slice(5, 7)) >= 7) || (Number(g.event_date.slice(0, 4)) === ys + 1 && Number(g.event_date.slice(5, 7)) < 7)));
      const t = tl.filter((x) => x.year === ys || x.year === ys + 1);
      const its = items.filter((c) => c.y === ys || c.y === ys + 1).slice(0, 6);
      const ob = objs.filter((o) => o.year === ys || o.year === ys + 1);
      return `<li class="lib-yr" id="${presId(p)}"><div class="lib-yr-y">${esc(p.years)}</div><div class="lib-yr-b">
<a class="lib-yr-p" href="/past-presidents#${presId(p)}"><img src="${p.img}" alt="" width="72" height="72" loading="lazy"><span><small>President</small><strong>${esc(p.name)}</strong></span></a>
${p.summary ? `<p>${esc(p.summary)}</p>` : ''}
${t.map((x) => `<div class="lib-yr-note"><strong>${esc(x.headline || '')}</strong>${x.body ? ` ${esc(x.body)}` : ''}${(x.links || [])[0] ? ` <a href="${esc(x.links[0].url)}">${esc(x.links[0].label || 'Read more')}</a>` : ''}</div>`).join('')}
${vs.length || gs.length || its.length || ob.length || (p.balita || []).length ? `<div class="lib-yr-links">${(p.balita || []).map(([u, t]) => `<a href="${esc(u)}">📰 ${esc(t)}</a>`).join('')}${vs.map((v) => `<a href="/library/balita/${volSlug(v)}">📖 Balita ${esc(v.years || '')}, Nos. ${v.issue_from}–${v.issue_to}</a>`).join('')}${gs.map((g) => `<a href="/library/photos/${esc(g.slug)}">📷 ${esc(g.title)}</a>`).join('')}${ob.length ? `<a href="/library/trophies#y=${ys}">🏆 ${ob.length} plaque${ob.length > 1 ? 's' : ''} and trophies</a>` : ''}${its.map((c) => `<a href="/library/collection#q=${encodeURIComponent(c.a)}">📚 ${esc(c.d.split(' — ').slice(1, 2).join('') || c.d).slice(0, 90)}</a>`).join('')}</div>` : ''}
</div></li>`;
    }).join('');
    const body = `${libNav('eras')}
<section class="lib-era-hero"><div class="wrap">
<span class="lib-eyebrow">${esc(d.label)}</span><h1>${esc(d.title)}</h1><p>${esc(d.blurb)}</p>
<nav class="lib-era-pager">${prev ? `<a href="/library/era/${eraYear(prev)}">← ${esc(prev.label)}</a>` : '<span></span>'}${next ? `<a href="/library/era/${eraYear(next)}">${esc(next.label)} →</a>` : ''}</nav>
<div class="lib-era-strip">${PRES.decades.map((x) => `<a href="/library/era/${eraYear(x)}" class="${x === d ? 'on' : ''}">${eraYear(x)}s</a>`).join('')}</div>
</div></section>
<section class="wrap lib-years"><ol>${years}</ol>
<p class="h-source">Presidents and term notes from the <a href="/past-presidents">Past presidents</a> roll, drawn from “The Work That Endures” (2026) and the Balita archive.</p></section>`;
    return page(`${d.label}: ${d.title} · Heritage Library`, d.blurb, body, `${origin}/library/era/${y0}`, ps[0] && ps[0].img);
  }

  // ---------- reading room ----------
  async function reading(origin) {
    const vols = await volumes();
    const groups = PRES.decades.map((d) => ({ d, vs: vols.filter((v) => v.year_from >= eraYear(d) && v.year_from < eraYear(d) + 10) })).filter((g) => g.vs.length);
    const body = `${libNav('balita')}<section class="wrap lib-page-head"><span class="kicker">The reading room</span><h1>The Rotary Balita</h1><p class="dek">Bound volumes of the Club’s newsletter, page by page as printed. Members’ home addresses printed in old issues have been removed, and member directories are shown without them.</p></section>
<section class="wrap lib-sec" style="padding-top:0">${groups.length ? groups.map((g) => `<h2 class="lib-era-h"><a href="/library/era/${eraYear(g.d)}">${esc(g.d.label)} · ${esc(g.d.title)}</a></h2>${shelf(g.vs)}`).join('') : ''}
<h2 class="lib-era-h">Recent years</h2>${shelf([], true)}</section>`;
    return page('The reading room · Heritage Library', 'Read the Rotary Balita from 1948, page by page as printed.', body, origin + '/library/balita');
  }

  async function volume(origin, slug) {
    const key = String(slug || '').toUpperCase();
    const vs = await safe(() => q(`rcm_lib_volumes?select=*&status=eq.published&${/^RCM-/.test(key) ? `acc=eq.${encodeURIComponent(key)}` : `id=eq.${encodeURIComponent(slug)}`}&limit=1`), []);
    const v = vs[0]; if (!v) return null;
    const iss = await safe(() => q(`rcm_lib_issues?select=*&volume_id=eq.${v.id}&order=issue_no`), []);
    const cp = new Set(iss.filter((i) => !i.cover_path).map((i) => i.cover_page).filter(Boolean));
    const cov = cp.size ? await safe(() => q(`rcm_lib_pages?select=n,image_path&volume_id=eq.${v.id}&n=in.(${[...cp].join(',')})`), []) : [];
    const byN = new Map(cov.map((c) => [c.n, c.image_path]));
    const body = `${libNav('balita')}<section class="wrap lib-page-head"><a class="lib-back" href="/library/balita">← Reading room</a><span class="kicker">Bound volume ${esc(v.acc || '')}</span><h1>The Rotary Balita, ${esc(v.years || '')}</h1><p class="dek">${iss.length} issues${v.issue_from ? `, Nos. ${v.issue_from} to ${v.issue_to}` : ''}${v.page_count ? `, ${v.page_count} pages` : ''}.${v.note ? ' ' + esc(v.note) : ''}</p>
<form action="/library/search" method="get" class="lib-search small"><input type="hidden" name="v" value="${esc(volSlug(v))}"><input name="q" type="search" placeholder="Search this volume" aria-label="Search this volume"><button class="btn btn-navy" type="submit">Search</button></form></section>
<section class="wrap lib-sec" style="padding-top:8px"><div class="lib-issues">${iss.map((i) => `<a class="lib-issue" href="/library/balita/${volSlug(v)}/${i.issue_no}"><span class="cv">${i.cover_path || byN.get(i.cover_page) ? `<img src="${esc(aSrc(i.cover_path || byN.get(i.cover_page)))}" alt="" loading="lazy">` : ''}${i.is_read ? '<span class="tag-read">Articles</span>' : ''}</span><strong>No. ${i.issue_no}</strong><small>${esc(i.issue_date ? fmtDate(i.issue_date) : i.label || '')}</small></a>`).join('')}</div></section>`;
    return page(`Balita ${v.years || ''} · Heritage Library`, `The Rotary Balita, ${v.years || ''}: ${iss.length} issues as printed.`, body, `${origin}/library/balita/${volSlug(v)}`, byN.size ? aSrc([...byN.values()][0]) : null);
  }

  async function issue(origin, slug, no, hl) {
    const key = String(slug || '').toUpperCase();
    const vs = await safe(() => q(`rcm_lib_volumes?select=*&status=eq.published&${/^RCM-/.test(key) ? `acc=eq.${encodeURIComponent(key)}` : `id=eq.${encodeURIComponent(slug)}`}&limit=1`), []);
    const v = vs[0]; if (!v) return null;
    const all = await safe(() => q(`rcm_lib_issues?select=issue_no,issue_date,label,start_page,end_page,cover_page,is_read,blurb,note&volume_id=eq.${v.id}&order=issue_no`), []);
    const k = all.findIndex((x) => x.issue_no === Number(no)); if (k < 0) return null;
    const i = all[k], prev = all[k - 1], next = all[k + 1];
    const [pg, arts, named] = await Promise.all([
      safe(() => q(`rcm_lib_pages?select=n,image_path,width,height,text,flags&volume_id=eq.${v.id}&n=gte.${i.start_page}&n=lte.${i.end_page}&order=n`), []),
      safe(() => q(`rpc/rcm_lib_page_names?v=${encodeURIComponent(volSlug(v))}`), []),
      safe(() => q(`rcm_lib_articles?select=id,title,kind,pages,body,summary,people&volume_id=eq.${v.id}&issue_no=eq.${i.issue_no}&order=sort`), []),
    ]);
    const byN = new Map(pg.map((p) => [p.n, p]));
    const nm = new Map((named || []).map((x) => [x.n, x.names]));
    const pages = []; for (let n = i.start_page; n <= i.end_page; n++) { const p = byN.get(n); pages.push(p ? { n, src: aSrc(p.image_path), w: p.width, h: p.height, t: (p.text || '').slice(0, 6000), f: !!(p.flags && p.flags.length), nm: nm.get(n) || '' } : { n, held: true }); }
    const rel = (n) => n - i.start_page + 1;
    const title = `Balita No. ${i.issue_no}${i.issue_date ? ', ' + fmtDate(i.issue_date) : ''}`;
    const artHtml = arts.map((a) => `<details class="lib-art" id="a-${esc(a.id)}" data-pages="${(a.pages || []).join(',')}"><summary><span class="k">${esc(a.kind || '')}</span><strong>${esc(a.title || '')}</strong>${a.summary ? `<span class="s">${esc(a.summary)}</span>` : ''}<span class="pg">p. ${(a.pages || []).map(rel).join(', ')}</span></summary>
<div class="lib-art-body">${String(a.body || '').split(/\n\s*\n/).map((t) => `<p>${esc(t.trim())}</p>`).join('')}${(a.people || []).length ? `<div class="lib-people"><span>Named in this article</span>${a.people.slice(0, 60).map((p) => `<a href="/library/search?q=${encodeURIComponent('"' + (p.name || p) + '"')}">${esc(p.name || p)}</a>`).join('')}</div>` : ''}</div></details>`).join('');
    const body = `${libNav('balita')}<section class="wrap lib-reader-head"><a class="lib-back" href="/library/balita/${volSlug(v)}">← Balita ${esc(v.years || '')}</a>
<h1>No. ${i.issue_no} <small>${esc(i.issue_date ? fmtDate(i.issue_date) : i.label || '')}</small></h1>${i.blurb ? `<p class="dek">${esc(i.blurb)}</p>` : ''}
<nav class="lib-issue-pager">${prev ? `<a href="/library/balita/${volSlug(v)}/${prev.issue_no}">← No. ${prev.issue_no}</a>` : '<span></span>'}${next ? `<a href="/library/balita/${volSlug(v)}/${next.issue_no}">No. ${next.issue_no} →</a>` : ''}</nav></section>
<section class="wrap lib-reader">
<div class="lib-viewer" id="viewer"><div class="lib-vbar"><button type="button" data-go="-1" aria-label="Previous page">←</button><span id="where"></span><button type="button" data-go="1" aria-label="Next page">→</button><button type="button" id="zoom">Zoom</button><button type="button" id="tagp" title="Help name the people in a photo on this page">Who’s on this page?</button></div><div class="lib-vpage" id="vpage"></div><div class="lib-vnote" id="vnote" hidden>Home addresses on this page have been removed.</div><div class="lib-vnames" id="vnames" hidden></div></div>
<div class="lib-side">${arts.length ? `<h2>${arts.length} articles</h2><p class="muted" style="margin-top:0">Read from the page scans. Open one to read it; the page viewer follows along.</p>${artHtml}` : `<h2>Page text</h2><p class="muted" style="margin-top:0">This issue has not been read into articles yet. The machine-read text of the page is below, and it is searchable.</p><pre class="lib-ocr" id="ocr"></pre>`}</div>
</section>
<script>(function(){var P=${JSON.stringify(pages).replace(/</g, '\\u003c')},HL=${JSON.stringify(String(hl || '').slice(0, 60)).replace(/</g, '\\u003c')},k=0,z=false;var vp=document.getElementById('vpage'),wh=document.getElementById('where'),no=document.getElementById('vnote'),oc=document.getElementById('ocr');
function esc(s){return String(s).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
function mark(t){if(!HL)return esc(t);var h=HL.replace(/"/g,'').trim();if(!h)return esc(t);var re=new RegExp('('+h.replace(/[.*+?^\${}()|[\\]\\\\]/g,'\\\\$&')+')','ig');return esc(t).replace(re,'<mark>$1</mark>')}
function show(i){if(i<0||i>=P.length)return;k=i;var p=P[k];wh.textContent='Page '+(k+1)+' of '+P.length;document.querySelector('[data-go="-1"]').disabled=k===0;document.querySelector('[data-go="1"]').disabled=k===P.length-1;
vp.className='lib-vpage'+(z?' zoom':'');vp.innerHTML=p.held?'<div class="lib-held"><strong>Page withheld</strong><p>This page prints members’ home addresses, so the scan stays in the Club’s private archive.</p></div>':!p.src?'<div class="lib-held"><strong>No scan of this page</strong><p>Only its text survives in the archive.</p></div>':'<img src="'+p.src+'" alt="Page '+(k+1)+' of this issue"'+(p.w?' width="'+p.w+'" height="'+p.h+'"':'')+'>';no.hidden=!p.f;var vn=document.getElementById('vnames');vn.hidden=!p.nm;vn.textContent=p.nm?'Named by members: '+p.nm:'';if(oc)oc.innerHTML=p.held?'':mark(p.t||'(No text was read from this page.)');
document.querySelectorAll('.lib-art').forEach(function(d){d.classList.toggle('here',(','+d.getAttribute('data-pages')+',').indexOf(','+p.n+',')>=0)});try{history.replaceState(null,'','#p'+(k+1))}catch(e){}}
document.querySelectorAll('[data-go]').forEach(function(b){b.onclick=function(){show(k+Number(b.getAttribute('data-go')))}});
document.getElementById('zoom').onclick=function(){z=!z;this.textContent=z?'Fit':'Zoom';show(k)};
document.getElementById('tagp').onclick=function(){var p=P[k];if(!p||!p.src)return;window.RCMTag({kind:'page',ref:'${esc(volSlug(v))}:'+p.n,label:'Balita No. ${i.issue_no}, page '+(k+1),image:p.src})};
document.addEventListener('keydown',function(e){if(e.target.closest('input,textarea'))return;if(e.key==='ArrowRight')show(k+1);if(e.key==='ArrowLeft')show(k-1)});
document.querySelectorAll('.lib-art').forEach(function(d){d.addEventListener('toggle',function(){if(d.open){var f=Number((d.getAttribute('data-pages')||'').split(',')[0]);var j=P.findIndex(function(p){return p.n===f});if(j>=0)show(j)}})});
var m=location.hash.match(/^#p(\\d+)$/),a=location.hash.match(/^#a-(.+)$/);if(a){var el=document.getElementById('a-'+a[1]);if(el){el.open=true;el.scrollIntoView()}}show(m?Number(m[1])-1:0)})();</script>${TAG_FORM}`;
    const cover = pages.find((p) => p.n === i.cover_page && !p.held);
    return page(`${title} · Heritage Library`, i.blurb || `The Rotary Balita, No. ${i.issue_no}, as printed.`, body, `${origin}/library/balita/${volSlug(v)}/${i.issue_no}`, cover && cover.src);
  }

  // ---------- search ----------
  function snippet(text, term) {
    const t = String(text || '').replace(/\s+/g, ' ');
    const words = String(term).replace(/"/g, '').toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const lo = t.toLowerCase(); let at = -1;
    for (const w of words) { at = lo.indexOf(w); if (at >= 0) break; }
    const s = Math.max(0, at - 90), piece = t.slice(s, s + 260);
    let h = esc(piece);
    for (const w of words) h = h.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
    return (s ? '…' : '') + h + (s + 260 < t.length ? '…' : '');
  }
  async function search(origin, term, volFilter) {
    term = String(term || '').trim().slice(0, 80);
    let body = `${libNav('')}<section class="wrap lib-page-head"><span class="kicker">Search the Heritage Library</span><h1>${term ? `Results for “${esc(term)}”` : 'Search 100 years'}</h1>
<form action="/library/search" method="get" class="lib-search small">${volFilter ? `<input type="hidden" name="v" value="${esc(volFilter)}">` : ''}<input name="q" type="search" value="${esc(term)}" placeholder="A name, a project, a place or a year" aria-label="Search"><button class="btn btn-navy" type="submit">Search</button></form>
<p class="muted">Tip: put a full name in quotes, e.g. “Carlos P. Romulo”. Old issues are searched through machine-read text, which can miss some words.</p></section>`;
    if (term.length >= 2) {
      const tsq = encodeURIComponent(term);
      const vols = await volumes(); const vById = new Map(vols.map((v) => [v.id, v]));
      const vf = volFilter ? vols.find((v) => volSlug(v) === String(volFilter).toLowerCase()) : null;
      const vcl = vf ? `&volume_id=eq.${vf.id}` : '';
      const [arts, pgs, modern] = await Promise.all([
        safe(() => q(`rcm_lib_articles?select=id,volume_id,issue_no,title,kind,body,pages&fts=wfts(simple).${tsq}${vcl}&limit=40`), []),
        safe(() => q(`rcm_lib_pages?select=volume_id,n,text&fts=wfts(simple).${tsq}${vcl}&limit=80`), []),
        vf ? [] : safe(() => searchBalita(term), []),
      ]);
      const issuesOf = {};
      const needV = [...new Set(pgs.map((p) => p.volume_id))];
      for (const id of needV) issuesOf[id] = await safe(() => q(`rcm_lib_issues?select=issue_no,issue_date,start_page,end_page&volume_id=eq.${id}`), []);
      const cat = vf ? [] : CATALOGUE.filter((c) => (c.d + ' ' + (c.i || '')).toLowerCase().includes(term.replace(/"/g, '').toLowerCase())).slice(0, 12);
      const rows = [];
      for (const a of arts) { const v = vById.get(a.volume_id); if (v) rows.push(`<li><a href="/library/balita/${volSlug(v)}/${a.issue_no}#a-${esc(a.id)}"><small>Balita No. ${a.issue_no} · ${esc(v.years || '')} · ${esc(a.kind || 'Article')}</small><strong>${esc(a.title)}</strong><span>${snippet(a.body, term)}</span></a></li>`); }
      for (const p of pgs) {
        const v = vById.get(p.volume_id); if (!v) continue;
        const i = (issuesOf[p.volume_id] || []).find((x) => p.n >= x.start_page && p.n <= x.end_page); if (!i) continue;
        rows.push(`<li><a href="/library/balita/${volSlug(v)}/${i.issue_no}?hl=${encodeURIComponent(term)}#p${p.n - i.start_page + 1}"><small>Balita No. ${i.issue_no} · ${esc(i.issue_date ? fmtDate(i.issue_date) : v.years || '')} · page ${p.n - i.start_page + 1}</small><strong>Page ${p.n - i.start_page + 1} of No. ${i.issue_no}</strong><span>${snippet(p.text, term)}</span></a></li>`);
      }
      const modernRows = (modern || []).slice(0, 20).map((r) => `<li><a href="/balita/${r.issue_no}${r.slug ? '/' + esc(r.slug) : ''}"><small>Balita No. ${r.issue_no}${r.issue_date ? ' · ' + esc(fmtDate(r.issue_date)) : ''}</small><strong>${esc(r.title || 'Balita No. ' + r.issue_no)}</strong>${r.snippet ? `<span>${esc(r.snippet)}</span>` : ''}</a></li>`);
      body += `<section class="wrap lib-sec" style="padding-top:0">
${rows.length ? `<h2 class="lib-era-h">In the old Balita (${rows.length}${rows.length >= 100 ? '+' : ''})</h2><ol class="lib-results">${rows.join('')}</ol>` : ''}
${modernRows.length ? `<h2 class="lib-era-h">In recent issues</h2><ol class="lib-results">${modernRows.join('')}</ol>` : ''}
${cat.length ? `<h2 class="lib-era-h">In the catalogue</h2><ol class="lib-results">${cat.map((c) => `<li><a href="/library/collection#q=${encodeURIComponent(c.a)}"><small>${esc(c.a)} · ${esc(c.c)}${c.y ? ' · ' + c.y : ''}</small><strong>${esc(c.d)}</strong></a></li>`).join('')}</ol>` : ''}
${!rows.length && !modernRows.length && !cat.length ? `<div class="lib-empty">Nothing found for “${esc(term)}”. Try a shorter word or another spelling.</div>` : ''}</section>`;
    }
    return page(term ? `“${term}” · Heritage Library search` : 'Search · Heritage Library', 'Search a century of the Rotary Club of Manila.', body, origin + '/library/search');
  }

  // ---------- photographs ----------
  async function photos(origin) {
    const gals = await galleries();
    const byYear = {};
    for (const g of gals) { const y = g.event_date ? g.event_date.slice(0, 4) : 'Undated'; (byYear[y] = byYear[y] || []).push(g); }
    const body = `${libNav('photos')}<section class="wrap lib-page-head"><span class="kicker">Photographs</span><h1>The Club at work and in fellowship</h1><p class="dek">${gals.length ? `${gals.length} albums, ${gals.reduce((s, g) => s + (g.photo_count || 0), 0).toLocaleString('en')} photographs` : 'Albums are being prepared'} from the Club’s projects, meetings and celebrations.</p></section>
<section class="wrap lib-sec" style="padding-top:0">${Object.keys(byYear).sort().reverse().map((y) => `<h2 class="lib-era-h">${esc(y)}</h2><div class="lib-gals">${byYear[y].map(galCard).join('')}</div>`).join('') || '<div class="lib-empty">The first albums will appear here soon.</div>'}</section>`;
    return page('Photographs · Heritage Library', 'Photographs of the Rotary Club of Manila at work and in fellowship.', body, origin + '/library/photos');
  }
  async function gallery(origin, slug) {
    const gs = await safe(() => q(`rcm_lib_galleries?select=*&slug=eq.${encodeURIComponent(slug)}&status=eq.published&limit=1`), []);
    const g = gs[0]; if (!g) return null;
    const ph = await safe(() => q(`rcm_lib_photos?select=n,path,width,height,caption&gallery_id=eq.${g.id}&order=n&limit=1000`), []);
    const list = ph.map((p) => ({ n: p.n, s: aSrc(p.path), t: aSrc(p.path.replace(/(\.[a-z]+)$/i, '-t$1')), w: p.width, h: p.height, c: p.caption || '' }));
    const body = `${libNav('photos')}<section class="wrap lib-page-head"><a class="lib-back" href="/library/photos">← All albums</a><span class="kicker">${esc(g.event_date ? fmtDate(g.event_date) : '')}${g.place ? ' · ' + esc(g.place) : ''}</span><h1>${esc(g.title)}</h1>${g.note ? `<p class="dek">${esc(g.note)}</p>` : ''}${g.balita_url ? `<p><a class="link-arrow" href="${esc(g.balita_url)}">Read about it in the Balita</a></p>` : ''}</section>
<section class="wrap lib-sec" style="padding-top:0"><div class="lib-photos">${list.map((p, k) => `<button type="button" data-k="${k}" style="aspect-ratio:${p.w && p.h ? `${p.w}/${p.h}` : '4/3'}"><img src="${esc(p.t)}" alt="${esc(p.c)}" loading="lazy" onerror="this.onerror=null;this.src='${esc(p.s)}'"></button>`).join('')}</div></section>
<dialog class="lib-lightbox" id="lb"><button type="button" class="x" aria-label="Close">×</button><button type="button" class="nv" data-s="-1" aria-label="Previous">‹</button><figure><img id="lbi" alt=""><figcaption id="lbc"></figcaption><button type="button" class="lib-tagbtn" id="lbt">Know who’s in this photo?</button></figure><button type="button" class="nv" data-s="1" aria-label="Next">›</button></dialog>${TAG_FORM}
<script>(function(){var G=${JSON.stringify({ id: g.id, t: g.title })},L=${JSON.stringify(list).replace(/</g, '\\u003c')},d=document.getElementById('lb'),im=document.getElementById('lbi'),cp=document.getElementById('lbc'),k=0;
function show(i){if(i<0||i>=L.length)return;k=i;im.src=L[k].s;im.alt=L[k].c;cp.textContent=(k+1)+' of '+L.length+(L[k].c?' · '+L[k].c:'');if(!d.open)d.showModal()}
document.querySelector('.lib-photos').onclick=function(e){var b=e.target.closest('[data-k]');if(b)show(Number(b.getAttribute('data-k')))};
d.querySelector('.x').onclick=function(){d.close()};d.querySelectorAll('[data-s]').forEach(function(b){b.onclick=function(){show(k+Number(b.getAttribute('data-s')))}});
document.getElementById('lbt').onclick=function(){var p=L[k];d.close();window.RCMTag({kind:'photo',ref:G.id+':'+p.n,label:G.t+', photo '+(k+1),image:p.t})};
d.addEventListener('keydown',function(e){if(e.key==='ArrowRight')show(k+1);if(e.key==='ArrowLeft')show(k-1)});d.addEventListener('click',function(e){if(e.target===d)d.close()})})();</script>`;
    return page(`${g.title} · Photographs · Heritage Library`, `${g.photo_count || list.length} photographs${g.event_date ? ', ' + fmtDate(g.event_date) : ''}.`, body, `${origin}/library/photos/${g.slug}`, g.cover_path ? aSrc(g.cover_path) : null);
  }

  // ---------- trophy room ----------
  async function trophies(origin) {
    const objs = await objects();
    const AWARD = ['Plaque', 'Trophy', 'Certificate', 'Medal'];
    const isTreasure = (o) => o.featured || (o.kind && !AWARD.includes(o.kind)) || (o.year && o.year < 1980);
    const byNew = (x, y) => (y.year || 0) - (x.year || 0) || Number(!!y.polished) - Number(!!x.polished);
    const treasures = objs.filter(isTreasure).sort((x, y) => Number(!!y.polished) - Number(!!x.polished) || (x.year || 9999) - (y.year || 9999)).slice(0, 12);
    const tset = new Set(treasures.map((o) => o.acc));
    const wall = objs.filter((o) => !tset.has(o.acc));
    const groups = new Map(Object.keys(SRC).map((k) => [k, []]));
    for (const o of wall) groups.get(srcOf(o)).push(o);
    const order = [...groups.keys()].filter((k) => groups.get(k).length);
    const kinds = [...new Set(wall.map((o) => o.kind).filter(Boolean))].sort((x, y) => { const r = (k) => (AWARD.includes(k) ? AWARD.indexOf(k) : k === 'Keepsake' ? 99 : 50); return r(x) - r(y) || x.localeCompare(y); });
    const tagged = (o) => objCard(o).replace(/class="lib-obj( pol)?"/, (m, p1) => `class="lib-obj${p1 || ''}" data-kind="${esc(o.kind || '')}" data-year="${o.year || ''}"`);
    const body = `${libNav('trophies')}<section class="lib-era-hero dark"><div class="wrap"><span class="lib-eyebrow">The trophy room</span><h1>Honors given and received</h1><p>Plaques, trophies, medals and gifts from a century of service: awards from Rotary International and the District, thanks from partners and communities, and tokens from sister clubs around the world.</p></div></section>
${objs.length ? `${treasures.length ? `<section class="lib-sec lib-dark"><div class="wrap"><div class="section-head"><div><span class="kicker">Treasures of the collection</span><h2>Objects with a story</h2></div></div>
<div class="lib-objs lib-treasures">${treasures.map(tagged).join('')}</div></div></section>` : ''}
<section class="wrap lib-sec"><div class="section-head"><div><span class="kicker">The awards wall</span><h2>${wall.length} awards and tokens, by who gave them</h2></div></div>
${kinds.length > 1 ? `<div class="lib-filter" style="margin-top:6px"><button type="button" data-k="" aria-pressed="true">All</button>${kinds.map((k) => `<button type="button" data-k="${esc(k)}" aria-pressed="false">${esc(k)}</button>`).join('')}</div>` : ''}
${order.length > 1 ? `<nav class="lib-srcnav">${order.map((k) => `<a href="#src-${k}">${esc(SRC[k].replace(/^From /, ''))} <small>${groups.get(k).length}</small></a>`).join('')}</nav>` : ''}${order.map((k) => `<div class="lib-decade" id="src-${k}"><h3>${esc(SRC[k])} <small>${groups.get(k).length}</small></h3><div class="lib-objs lib-wall">${groups.get(k).sort(byNew).map(tagged).join('')}</div></div>`).join('')}</section>` : `<section class="wrap lib-sec"><div class="lib-empty">Photographs of about 480 plaques and trophies are being prepared. <a href="/library/collection#c=Plaques%20%26%20trophies">See the list in the catalogue</a>.</div></section>`}
<dialog class="lib-lightbox light lib-objbox" id="lb"><button type="button" class="x" aria-label="Close">×</button><figure><img id="lbi" alt=""><figcaption id="lbc"></figcaption></figure></dialog>
<script>(function(){var O=${JSON.stringify(objs.map((o) => ({ a: o.acc, s: aSrc(o.image_path), o: o.original_path ? aSrc(o.original_path) : '', t: o.title, g: o.giver, r: o.recipient, y: o.year, k: o.kind, i: o.inscription, n: o.note }))).replace(/</g, '\\u003c')},d=document.getElementById('lb');
function el(t,x,c){var e=document.createElement(t);if(c)e.className=c;e.textContent=x;return e}
document.addEventListener('click',function(e){var b=e.target.closest('[data-obj]');if(b){var o=O.find(function(x){return x.a===b.getAttribute('data-obj')});if(!o)return;var im=document.getElementById('lbi');im.src=o.s;im.alt=o.t||'';var c=document.getElementById('lbc');c.innerHTML='';c.appendChild(el('span',[o.k,o.y].filter(Boolean).join(' · '),'kick'));c.appendChild(el('strong',o.t||''));
if(o.g||o.r)c.appendChild(el('span',(o.g?'Presented by '+o.g:'')+(o.g&&o.r?' to ':(o.r?'Presented to ':''))+(o.r||'')));
if(o.i)c.appendChild(el('blockquote',o.i));else if(o.n)c.appendChild(el('p',o.n));
var f=el('span','Catalogue no. '+o.a+' · ','small');if(o.o){var l=document.createElement('a');l.href=o.o;l.target='_blank';l.rel='noopener';l.textContent='original photograph';f.appendChild(l)}c.appendChild(f);d.showModal();return}
var fb=e.target.closest('.lib-filter [data-k]');if(fb){var k=fb.getAttribute('data-k');document.querySelectorAll('.lib-filter [data-k]').forEach(function(x){x.setAttribute('aria-pressed',String(x===fb))});document.querySelectorAll('.lib-wall .lib-obj').forEach(function(x){x.hidden=!!k&&x.getAttribute('data-kind')!==k});document.querySelectorAll('.lib-decade').forEach(function(g){g.hidden=!g.querySelector('.lib-obj:not([hidden])')})}});
d.querySelector('.x').onclick=function(){d.close()};d.addEventListener('click',function(e){if(e.target===d)d.close()});
var oh=location.hash.match(/^#o=(.+)$/);if(oh){var ob=document.querySelector('[data-obj="'+decodeURIComponent(oh[1]).replace(/"/g,'')+'"]');if(ob){ob.scrollIntoView({block:'center'});ob.click()}}
var y=location.hash.match(/^#y=(\\d{4})$/);if(y){document.querySelectorAll('.lib-objs .lib-obj').forEach(function(x){var v=Number(x.getAttribute('data-year'));x.hidden=!(v===Number(y[1])||v===Number(y[1])+1)});document.querySelectorAll('.lib-decade').forEach(function(g){g.hidden=!g.querySelector('.lib-obj:not([hidden])')})}})();</script>`;
    return page('The trophy room · Heritage Library', 'Plaques, trophies, medals and gifts from a century of the Rotary Club of Manila.', body, origin + '/library/trophies');
  }

  // ---------- the collection (catalogue) ----------
  function collection(origin) {
    const cats = {}; for (const c of CATALOGUE) cats[c.c] = (cats[c.c] || 0) + 1;
    const body = `${libNav('collection')}<section class="wrap lib-page-head"><span class="kicker">The collection</span><h1>The Club’s library catalogue</h1><p class="dek">${CATALOGUE.length.toLocaleString('en')} items catalogued in 2023. Items marked <span class="tag-scan">Scanned</span> are in the digital archive; the rest are kept at the Club office. Books by other publishers are listed but not reproduced.</p></section>
<section class="wrap lib-sec" style="padding-top:0"><div class="lib-cat-tools"><input id="cq" type="search" placeholder="Search the catalogue" aria-label="Search the catalogue"><select id="cc" aria-label="Category"><option value="">All categories</option>${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<option value="${esc(c)}">${esc(c)} (${n})</option>`).join('')}</select><select id="cd" aria-label="Decade"><option value="">Any year</option>${PRES.decades.map((d) => `<option value="${eraYear(d)}">${esc(d.label)}</option>`).join('')}</select><label class="lib-chk"><input type="checkbox" id="cs"> Scanned only</label></div>
<p class="muted" id="cn"></p><ol class="lib-results lib-cat" id="cl"></ol><button type="button" class="btn btn-line" id="cm" hidden style="color:var(--navy)">Show more</button></section>
<script>(function(){var D=[],lim=60;var $=function(i){return document.getElementById(i)};function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function draw(){var q=$('cq').value.trim().toLowerCase(),c=$('cc').value,d=Number($('cd').value)||0,s=$('cs').checked;var L=D.filter(function(x){return(!c||x.c===c)&&(!s||x.s)&&(!d||(x.y&&x.y>=d&&x.y<d+10))&&(!q||(x.a+' '+x.d+' '+(x.i||'')).toLowerCase().indexOf(q)>=0)});
$('cn').textContent=L.length.toLocaleString('en')+' item'+(L.length===1?'':'s');$('cl').innerHTML=L.slice(0,lim).map(function(x){return '<li><div><small>'+esc(x.a)+' · '+esc(x.c)+' · '+esc(x.t)+(x.y?' · '+x.y+(x.y2?'–'+x.y2:''):'')+'</small><strong>'+esc(x.d)+'</strong>'+(x.s?' <span class="tag-scan">Scanned</span>':'')+(x.o?' <span class="tag-scan grey">Listed only</span>':'')+'</div></li>'}).join('');$('cm').hidden=L.length<=lim}
function fromHash(){var h=decodeURIComponent(location.hash.slice(1));var m=h.match(/^c=(.+)$/),n=h.match(/^q=(.+)$/);if(m)$('cc').value=m[1];if(n)$('cq').value=n[1]}
['cq','cc','cd','cs'].forEach(function(i){$(i).addEventListener('input',function(){lim=60;draw()})});$('cm').onclick=function(){lim+=120;draw()};
fetch('/assets/library/catalogue.json').then(function(r){return r.json()}).then(function(d){D=d;fromHash();draw()})})();</script>`;
    return page('The collection · Heritage Library', `The Rotary Club of Manila’s library catalogue: ${CATALOGUE.length} items.`, body, origin + '/library/collection');
  }

  // ---------- museum: find a name ----------
  const MARK = (t) => esc(String(t || '').replace(/\s+/g, ' ')).replace(/«/g, '<mark>').replace(/»/g, '</mark>');
  const pageUrl = (r) => `/library/balita/${esc(r.vol)}/${r.issue_no}#p${r.rel}`;
  async function nameFinder(origin, term) {
    term = String(term || '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const presMatch = term.length >= 4 ? PRES.presidents.filter((p) => p.name.toLowerCase().includes(term.toLowerCase())).slice(0, 3) : [];
    let body = `${libNav('name')}<section class="lib-era-hero"><div class="wrap"><span class="lib-eyebrow">Find a name</span><h1>${term ? esc(term) : 'Find your name in a century of the Balita'}</h1>
<p>${term ? 'Every page of the Rotary Balita where this name is printed, year by year.' : 'Type a member’s name, a past president, a guest speaker or a family name. You will see every page where it was printed since 1948, year by year, with a link to the page.'}</p>
<form action="/library/name" method="get" role="search" class="lib-search"><input name="q" type="search" value="${esc(term)}" placeholder="e.g. Carlos P. Romulo, Ramon Magsaysay, your grandfather’s name" aria-label="A name"><button class="btn btn-gold" type="submit">Find</button></form></div></section>`;
    if (term.length < 3) {
      const picks = ['Carlos P. Romulo', 'Ramon Magsaysay', 'Leon J. Lambert', 'Paul Harris', 'Diosdado Macapagal', 'Corazon Aquino'];
      body += `<section class="wrap lib-sec"><h2 class="lib-era-h">Try one</h2><div class="lib-chips">${picks.map((n) => `<a href="/library/name?q=${encodeURIComponent(n)}">${esc(n)}</a>`).join('')}</div>
<p class="muted" style="margin-top:18px">Tips: use the name as it would be printed (first name and surname, or with the middle initial). Old issues are read by machine, so a few spellings may be missed. Members’ home addresses are never shown.</p></section>`;
      return page('Find a name · Heritage Library', 'Find a name in a century of the Rotary Club of Manila’s Balita.', body, origin + '/library/name');
    }
    let rows = await safe(() => q(`rpc/rcm_lib_name?q=${encodeURIComponent(term)}&lim=600`), []);
    const seen = new Set(); rows = rows.filter((r) => { const k = r.issue_no + ':' + r.rel; if (seen.has(k)) return false; seen.add(k); return r.year; });
    const modern = await safe(() => searchBalita(`"${term}"`), []);
    const parts = term.split(' ');
    const alts = [parts.filter((w) => !/^[A-Z]\.?$/.test(w)).join(' '), parts.length > 2 ? parts[0] + ' ' + parts[parts.length - 1] : ''].filter((x) => x && x !== term && x.split(' ').length > 1);
    if (!rows.length && !modern.length) {
      body += `<section class="wrap lib-sec"><div class="lib-empty">“${esc(term)}” was not found in the Balita.${alts.length ? ` Try ${[...new Set(alts)].map((a) => `<a href="/library/name?q=${encodeURIComponent(a)}">${esc(a)}</a>`).join(' or ')}.` : ' Try another spelling, or just the first name and surname.'}</div></section>`;
      return page(`${term} · Find a name · Heritage Library`, `Pages of the Rotary Balita that mention ${term}.`, body, origin + '/library/name');
    }
    const byYear = new Map(); for (const r of rows) { if (!byYear.has(r.year)) byYear.set(r.year, []); byYear.get(r.year).push(r); }
    const years = [...byYear.keys()].sort((a, b) => a - b);
    const issues = new Set(rows.map((r) => r.issue_no)).size;
    const decs = new Map(); for (const y of years) { const d = Math.floor(y / 10) * 10; decs.set(d, (decs.get(d) || 0) + byYear.get(y).length); }
    const dMax = Math.max(1, ...decs.values());
    const allDecs = []; if (years.length) for (let d = Math.floor(years[0] / 10) * 10; d <= Math.floor(years[years.length - 1] / 10) * 10; d += 10) allDecs.push(d);
    body += `<section class="wrap lib-sec" style="padding-top:28px">
${presMatch.map((p) => `<a class="lib-name-pres" href="/past-presidents#${presId(p)}"><img src="${p.img}" alt="" width="64" height="64" loading="lazy"><span><small>President of the Club, ${esc(p.years)}</small><strong>${esc(p.name)}</strong></span></a>`).join('')}
${rows.length ? `<p class="lib-name-sum"><b>${rows.length.toLocaleString('en')}${rows.length >= 600 ? '+' : ''} pages</b> in <b>${issues.toLocaleString('en')} issues</b> of the Balita, ${years[0]}${years.length > 1 ? '–' + years[years.length - 1] : ''}.</p>
<div class="lib-name-bars" aria-hidden="true">${allDecs.map((d) => `<a href="#y${(years.find((y) => y >= d && y < d + 10)) || ''}" style="--h:${Math.round(((decs.get(d) || 0) / dMax) * 100)}%"><i></i><span>${d}s</span></a>`).join('')}</div>
<ol class="lib-name-years">${years.map((y) => { const L = byYear.get(y); const li = (r) => `<li><a href="${pageUrl(r)}"><small>Balita No. ${r.issue_no}${r.issue_date ? ' · ' + esc(fmtDate(r.issue_date)) : ''} · page ${r.rel}</small><span>${MARK(r.snippet)}</span></a></li>`;
      return `<li id="y${y}"><details${years.length <= 6 ? ' open' : ''}><summary><b>${y}</b><span>${L.length} page${L.length > 1 ? 's' : ''}</span></summary><ol class="lib-results">${L.slice(0, 40).map(li).join('')}</ol>${L.length > 40 ? `<p class="muted">And ${L.length - 40} more pages this year. <a href="/library/search?q=${encodeURIComponent('"' + term + '"')}">Search for them</a>.</p>` : ''}</details></li>`; }).join('')}</ol>` : ''}
${modern.length ? `<h2 class="lib-era-h">In the Balita since 2015</h2><ol class="lib-results">${modern.slice(0, 20).map((r) => `<li><a href="/balita/${r.issue_no}${r.slug ? '/' + esc(r.slug) : ''}"><small>Balita No. ${r.issue_no}${r.issue_date ? ' · ' + esc(fmtDate(r.issue_date)) : ''}</small><strong>${esc(r.title || '')}</strong>${r.snippet ? `<span>${esc(r.snippet)}</span>` : ''}</a></li>`).join('')}</ol>` : ''}
${alts.length ? `<p class="muted">Also try: ${[...new Set(alts)].map((a) => `<a href="/library/name?q=${encodeURIComponent(a)}">${esc(a)}</a>`).join(' · ')}</p>` : ''}
<p class="muted" style="font-size:14px">Old issues are read by machine, so a few pages may be missed or misread. Know a photo of this person? Open the page and use “Who’s on this page?”.</p></section>`;
    return page(`${term} in the Balita · Heritage Library`, `${rows.length} pages of the Rotary Balita mention ${term}.`, body, `${origin}/library/name?q=${encodeURIComponent(term)}`);
  }

  // ---------- museum: the Club's timeline ----------
  async function timelinePage(origin) {
    const tl = await timeline();
    const byDec = new Map(); for (const e of tl) { const d = Math.floor(e.year / 10) * 10; if (!byDec.has(d)) byDec.set(d, []); byDec.get(d).push(e); }
    const MON = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const decTitle = (d) => { const x = PRES.decades.find((k) => eraYear(k) === d) || eraOf(d); return x ? x.title : ''; };
    const entry = (e) => `<li class="lib-tl-e"><div class="lib-tl-y">${e.year}${e.month ? `<small>${MON[e.month]}</small>` : ''}</div><div class="lib-tl-b">${e.image_path ? `<img src="${esc(anySrc(e.image_path, 400))}" alt="" loading="lazy">` : ''}<h3>${esc(e.headline)}</h3>${e.body ? `<p>${esc(e.body)}</p>` : ''}${(e.links || []).length ? `<p class="lib-tl-l">${e.links.map((l) => `<a href="${esc(l.url)}">${esc(l.label || 'Read more')}</a>`).join(' · ')}</p>` : ''}</div></li>`;
    const body = `${libNav('timeline')}<section class="lib-era-hero"><div class="wrap"><span class="lib-eyebrow">1919 to today</span><h1>The Club’s timeline</h1><p>Moments from more than a hundred years of the Rotary Club of Manila, each one linked to the Balita page or story where it was reported.</p>
${byDec.size ? `<div class="lib-era-strip">${[...byDec.keys()].map((d) => `<a href="#d${d}">${d}s</a>`).join('')}</div>` : ''}</div></section>
<section class="wrap lib-sec">${byDec.size ? [...byDec.entries()].map(([d, L]) => `<div class="lib-tl-dec" id="d${d}"><h2 class="lib-era-h"><a href="/library/era/${d}">${d}s</a> <small>${esc(decTitle(d))}</small></h2><ol class="lib-tl">${L.map(entry).join('')}</ol></div>`).join('') : `<div class="lib-empty">The timeline is being checked by the Club’s librarian and will appear here soon. In the meantime, browse <a href="/library/era/1919">the Club decade by decade</a>.</div>`}
<p class="h-source">Drawn from the Balita archive, the Club’s presidential profiles and the trophy room. Corrections are welcome: <a href="mailto:rotaryclubofmanila@gmail.com?subject=Club%20timeline">rotaryclubofmanila@gmail.com</a>.</p></section>`;
    return page('The Club’s timeline · Heritage Library', 'More than a hundred years of the Rotary Club of Manila, moment by moment.', body, origin + '/library/timeline');
  }

  // ---------- museum: the monthly exhibit ----------
  const exItemUrl = (it) => it.type === 'page' ? `/library/balita/${it.vol}/${it.issue_no}#p${it.rel}` : it.type === 'object' ? `/library/trophies#o=${encodeURIComponent(it.acc || '')}` : it.type === 'photo' ? `/library/photos/${it.slug}` : it.url || '#';
  const exLabel = (it) => it.type === 'page' ? `Balita No. ${it.issue_no}, page ${it.rel}` : it.type === 'object' ? 'In the trophy room' : it.type === 'photo' ? 'See the album' : 'Read the story';
  async function exhibitPage(origin, slug) {
    const list = await exhibits();
    const ex = slug ? list.find((x) => x.slug === slug) : currentExhibit(list);
    if (!ex) {
      const body = `${libNav('exhibit')}<section class="wrap lib-page-head"><span class="kicker">This month’s exhibit</span><h1>The next exhibit is being prepared</h1><p class="dek">Each month the library tells one story from the Club’s past in pages, photographs and objects. <a href="/library">Return to the library</a>.</p></section>`;
      return page('Exhibit · Heritage Library', 'A monthly exhibit from the Rotary Club of Manila’s archive.', body, origin + '/library/exhibit');
    }
    const items = Array.isArray(ex.items) ? ex.items : [];
    const past = list.filter((x) => x.slug !== ex.slug);
    const monthName = new Date(ex.month + 'T12:00:00+08:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const body = `${libNav('exhibit')}<section class="lib-ex-hero">${ex.cover ? `<img src="${esc(anySrc(ex.cover, 1600))}" alt="" class="bg" aria-hidden="true">` : ''}<div class="wrap"><span class="lib-eyebrow">${esc(ex.kicker || 'Exhibit')} · ${esc(monthName)}</span><h1>${esc(ex.title)}</h1>${ex.intro ? `<p>${esc(ex.intro)}</p>` : ''}</div></section>
<section class="wrap lib-sec"><ol class="lib-ex">${items.map((it, k) => `<li class="lib-ex-i${k % 3 === 0 ? ' big' : ''}"><a href="${esc(exItemUrl(it))}">${it.image ? `<span class="im"><img src="${esc(anySrc(it.image, 1000))}" alt="${esc(it.title || '')}" loading="lazy"></span>` : ''}<span class="tx"><small>${esc(String(it.year || ''))}</small><strong>${esc(it.title || '')}</strong>${it.caption ? `<span>${esc(it.caption)}</span>` : ''}<em>${esc(exLabel(it))} →</em></span></a></li>`).join('')}</ol>
${past.length ? `<h2 class="lib-era-h">Earlier exhibits</h2><div class="lib-chips">${past.map((x) => `<a href="/library/exhibit/${esc(x.slug)}">${esc(x.title)}</a>`).join('')}</div>` : ''}
<p class="h-source">Curated from the Club’s Heritage Library. Captions are drawn from the pages and objects shown.</p></section>`;
    return page(`${ex.title} · Heritage Library exhibit`, ex.intro ? ex.intro.slice(0, 200) : 'A monthly exhibit from the Club’s archive.', body, `${origin}/library/exhibit/${ex.slug}`, ex.cover ? anySrc(ex.cover, 1200) : null);
  }

  // ---------- museum: ask the archive ----------
  function askPage(origin, qs) {
    const ex = ['What did the Club do after Mount Pinatubo erupted?', 'How has the Club helped fight polio?', 'When did Carlos P. Romulo speak to the Club?', 'What is the Alay Lakad?'];
    const body = `${libNav('ask')}<section class="lib-era-hero"><div class="wrap"><span class="lib-eyebrow">Ask the archive</span><h1>Ask a question about the Club’s history</h1><p>The answer is written from the Balita and the library, with links to the pages it comes from. It can be wrong, so check the pages.</p>
<form id="ask-f" class="lib-search"><input id="ask-q" name="q" type="search" maxlength="300" value="${esc(String(qs || '').slice(0, 300))}" placeholder="e.g. When did the Club start the Alay Lakad?" aria-label="Your question" required><button class="btn btn-gold" type="submit">Ask</button></form>
<div class="lib-chips light">${ex.map((x) => `<button type="button" data-ex>${esc(x)}</button>`).join('')}</div></div></section>
<section class="wrap lib-sec"><div id="ask-out" aria-live="polite"></div></section>
<script>(function(){var F='https://unavxknqpibxwcoqemaf.supabase.co/functions/v1/rcm-museum',f=document.getElementById('ask-f'),i=document.getElementById('ask-q'),o=document.getElementById('ask-out');
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function render(d){var src=d.sources||[];var t=esc(d.answer||'').replace(/\\[(\\d+)\\]/g,function(m,n){var s=src[Number(n)-1];return s?'<a class="cite" href="'+esc(s.url)+'">['+n+']</a>':m}).split(/\\n\\s*\\n/).map(function(p){return '<p>'+p+'</p>'}).join('');
o.innerHTML='<div class="lib-ask-a">'+t+'</div>'+(src.length?'<h2 class="lib-era-h">Sources</h2><ol class="lib-results">'+src.map(function(s,k){return '<li><a href="'+esc(s.url)+'"><small>['+(k+1)+'] '+esc(s.where||'')+'</small><strong>'+esc(s.title||'')+'</strong>'+(s.text?'<span>'+esc(s.text)+'</span>':'')+'</a></li>'}).join('')+'</ol>':'')}
async function ask(qv){o.innerHTML='<p class="muted">Reading the archive…</p>';try{var r=await fetch(F,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'ask',question:qv})});var d=await r.json();if(!r.ok||d.error)throw new Error(d.error||('Error '+r.status));render(d);try{history.replaceState(null,'','/library/ask?q='+encodeURIComponent(qv))}catch(e){}}catch(e){o.innerHTML='<div class="lib-empty">'+esc(e.message)+'</div>'}}
f.onsubmit=function(e){e.preventDefault();var v=i.value.trim();if(v.length>4)ask(v)};
document.querySelectorAll('[data-ex]').forEach(function(b){b.onclick=function(){i.value=b.textContent;ask(b.textContent)}});
if(i.value.trim().length>4)ask(i.value.trim())})();</script>`;
    return page('Ask the archive · Heritage Library', 'Ask a question about the Rotary Club of Manila’s history and get an answer from the Balita, with sources.', body, origin + '/library/ask');
  }

  // ---------- museum: this week's history minute (read aloud at the weekly meeting) ----------
  async function minutePage(origin, wk) {
    const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    const all = await safe(() => q('rcm_lib_minutes?select=week,title,script,links&status=eq.published&order=week'), []);
    const m = (wk && all.find((x) => x.week === wk)) || all.find((x) => x.week >= today) || all[all.length - 1];
    const next = all.filter((x) => x.week >= today && (!m || x.week !== m.week)).slice(0, 6);
    const body = `${libNav('')}<section class="wrap lib-page-head lib-minute"><span class="kicker">History minute${m ? ' · ' + esc(new Date(m.week + 'T12:00:00+08:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) : ''}</span>
${m ? `<h1>${esc(m.title)}</h1><div class="lib-minute-t">${String(m.script).split(/\n\s*\n/).map((t) => `<p>${esc(t.trim())}</p>`).join('')}</div>
<p class="lib-tl-l">${(m.links || []).map((l) => `<a href="${esc(l.url)}">${esc(l.label || 'Read it in the Balita')}</a>`).join(' · ')}</p>
<div class="row lib-minute-act"><button class="btn btn-navy" type="button" onclick="window.print()">Print</button><button class="btn btn-line" type="button" style="color:var(--navy)" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.querySelector('.lib-minute-t').innerText).then(function(){this.textContent='Copied'}.bind(this))">Copy the text</button></div>` : '<h1>No history minute yet</h1>'}
${next.length ? `<h2 class="lib-era-h">Coming weeks</h2><ul class="lib-results">${next.map((x) => `<li><a href="/library/minute?w=${x.week}"><small>${esc(fmtDate(x.week))}</small><strong>${esc(x.title)}</strong></a></li>`).join('')}</ul>` : ''}
<p class="muted" style="font-size:14px">A one-minute story from the Club’s past for the host to read at the weekly meeting, drawn from the Balita of the same week in an earlier year.</p></section>`;
    return page(m ? `History minute: ${m.title}` : 'History minute · Heritage Library', 'A one-minute story from the Rotary Club of Manila’s past, for the weekly meeting.', body, origin + '/library/minute');
  }

  // ---------- museum: "Who's in this photo?" form (shared by albums and the page reader) ----------
  const TAG_FORM = `<dialog class="lib-tagdlg" id="tagdlg"><form method="dialog" id="tagf"><h2>Who’s in this picture?</h2><p class="muted">Help the library name the people in this picture. The Club’s librarian checks every suggestion before it appears.</p>
<img id="tag-img" alt="" hidden><label>Names, left to right<textarea name="names" required maxlength="600" placeholder="e.g. (left) PP Juan dela Cruz, (center) Gov. ..."></textarea></label>
<label>How do you know? <span class="muted">(optional)</span><input name="note" maxlength="300" placeholder="e.g. He is my grandfather"></label>
<label>Your name<input name="submitter" required maxlength="100" autocomplete="name"></label>
<label>Email or mobile, in case the librarian has a question <span class="muted">(not shown)</span><input name="contact" maxlength="120" autocomplete="email"></label>
<input name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
<div class="row"><button class="btn btn-navy" type="submit" value="send">Send to the librarian</button><button class="btn btn-line" type="button" style="color:var(--navy)" id="tag-x">Cancel</button></div><p id="tag-msg" class="muted" aria-live="polite"></p></form></dialog>
<script>(function(){var d=document.getElementById('tagdlg'),f=document.getElementById('tagf'),m=document.getElementById('tag-msg'),cur=null;
window.RCMTag=function(o){cur=o;f.reset();m.textContent='';var im=document.getElementById('tag-img');im.hidden=!o.image;if(o.image)im.src=o.image;d.showModal()};
document.getElementById('tag-x').onclick=function(){d.close()};
f.addEventListener('submit',async function(e){e.preventDefault();var fd=new FormData(f);if(fd.get('website'))return;m.textContent='Sending…';
try{var r=await fetch('https://unavxknqpibxwcoqemaf.supabase.co/functions/v1/rcm-museum',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'tag',kind:cur.kind,ref:cur.ref,label:cur.label,image:cur.image,names:fd.get('names'),note:fd.get('note'),submitter:fd.get('submitter'),contact:fd.get('contact')})});var j=await r.json();if(!r.ok||j.error)throw new Error(j.error||'Please try again');m.textContent='Thank you. The librarian will check it.';setTimeout(function(){d.close()},1800)}catch(err){m.textContent=err.message}})})();</script>`;

  // ---------- the Video room ----------
  async function videoRoom(origin) {
    const L = await videos();
    const secs = VCAT.map(([k, h, d]) => [k, h, d, L.filter((v) => v.category === k)]).filter((x) => x[3].length);
    const body = `${libNav('videos')}<section class="wrap lib-page-head"><span class="kicker">The video room</span><h1>The Club on film</h1><p class="dek">${L.length ? `${L.length} films and recordings` : 'Films are being prepared'}: the Club’s own films, the project films made for its centennial, award nights, and guests of honor at its weekly meetings.</p>
${secs.length > 1 ? `<nav class="lib-vnav" aria-label="Sections">${secs.map(([k, h]) => `<a href="#${k}">${esc(h)}</a>`).join('')}</nav>` : ''}</section>
<section class="wrap lib-sec" style="padding-top:0">${secs.map(([k, h, d, vs]) => `<h2 class="lib-era-h" id="${k}">${esc(h)}</h2><p class="lib-lede" style="margin:4px 0 0">${esc(d)}</p><div class="lib-gals">${vs.map(vidCard).join('')}</div>`).join('') || '<div class="lib-empty">The first films will appear here soon.</div>'}</section>`;
    return page('Video room · Heritage Library', 'Films and recordings of the Rotary Club of Manila: Club films, centennial project films, award nights and guest speakers.', body, origin + '/library/videos');
  }
  async function videoPage(origin, slug) {
    const L = await videos();
    const v = L.find((x) => x.slug === slug);
    if (!v) return null;
    const src = aSrc(v.path), when = vWhen(v);
    const cat = (VCAT.find((c) => c[0] === v.category) || [])[1] || 'Video';
    const more = L.filter((x) => x.category === v.category && x.slug !== v.slug).slice(0, 6);
    const iso = (d) => { d = Math.round(Number(d) || 0); return d ? `PT${Math.floor(d / 60)}M${d % 60}S` : undefined; };
    const ld = { '@context': 'https://schema.org', '@type': 'VideoObject', name: v.title, description: v.description || v.title, thumbnailUrl: v.poster ? aSrc(v.poster) : origin + '/assets/club-logo.png', uploadDate: `${v.year || 2019}-${String(v.month || 1).padStart(2, '0')}-01`, contentUrl: src, duration: iso(v.duration), publisher: { '@type': 'Organization', name: 'Rotary Club of Manila' } };
    const body = `${libNav('videos')}<section class="wrap lib-page-head lib-vid-page"><a class="lib-back" href="/library/videos#${esc(v.category)}">← Video room</a><span class="kicker">${esc(cat)}${when ? ' · ' + esc(when) : ''}</span><h1>${esc(v.title)}</h1>
<div class="lib-player" style="aspect-ratio:${v.width && v.height ? `${v.width}/${v.height}` : '16/9'}"><video controls preload="metadata" playsinline${v.poster ? ` poster="${esc(aSrc(v.poster))}"` : ''} src="${esc(src)}"></video></div>
${v.description ? `<p class="dek">${esc(v.description)}</p>` : ''}
${(v.links || []).length || v.speaker ? `<p class="lib-vlinks">${(v.links || []).map((l) => `<a class="link-arrow" href="${esc(l.url)}">${esc(l.label || 'Read more')}</a>`).join(' ')}${v.speaker ? ` <a class="link-arrow" href="/library/name?q=${encodeURIComponent(v.speaker)}">${esc(v.speaker)} in the archive</a>` : ''}</p>` : ''}
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script></section>
${more.length ? `<section class="wrap lib-sec" style="padding-top:8px"><h2 class="lib-era-h">More ${esc(cat.toLowerCase())}</h2><div class="lib-gals">${more.map(vidCard).join('')}</div></section>` : ''}`;
    return page(`${v.title} · Video room`, v.description || `${v.title}, from the Rotary Club of Manila’s video room.`, body, origin + '/library/videos/' + v.slug, v.poster ? aSrc(v.poster) : null);
  }

  async function route(origin, u) {
    const parts = String(u.searchParams.get('p') || '').split('/').filter(Boolean);
    const [a, b, c] = parts;
    if (!a) return landing(origin);
    if (a === 'era') return era(origin, b);
    if (a === 'balita') { if (!b) return reading(origin); if (!c) return volume(origin, b); return issue(origin, b, c, u.searchParams.get('hl')); }
    if (a === 'search') return search(origin, u.searchParams.get('q'), u.searchParams.get('v'));
    if (a === 'photos') return b ? gallery(origin, b) : photos(origin);
    if (a === 'videos') return b ? videoPage(origin, b) : videoRoom(origin);
    if (a === 'trophies') return trophies(origin);
    if (a === 'collection') return collection(origin);
    if (a === 'name') return nameFinder(origin, u.searchParams.get('q'));
    if (a === 'timeline') return timelinePage(origin);
    if (a === 'exhibit') return exhibitPage(origin, b);
    if (a === 'ask') return askPage(origin, u.searchParams.get('q'));
    if (a === 'minute') return minutePage(origin, u.searchParams.get('w'));
    return null;
  }
  return { route, exhibits, currentExhibit, anySrc };
};

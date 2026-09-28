// The Heritage Library: 107 years of the Rotary Club of Manila in its own words and pictures.
// Rendered on the server like the rest of the site; scans and photos are served from the club's public
// archive storage (archive.rcmanila.org). Everything here reads only rows marked published.
const CATALOGUE = require('./library-catalogue.json');

const ARCH = 'https://archive.rcmanila.org';
const LAUNCHED = true; // linked from the menu and open to search engines (set false to hide it again)

module.exports = function libraryModule(ctx) {
  const { layout, esc, q, fmtDate, PRES, searchBalita } = ctx;
  const aSrc = (p) => (!p ? '' : /^https?:|^\//.test(p) ? p : `${ARCH}/${p.split('/').map(encodeURIComponent).join('/')}`);
  const safe = async (fn, dflt) => { try { return await fn(); } catch (e) { return dflt; } };
  const yearsAgo = (y) => new Date().getFullYear() - y;
  const pad = (n) => String(n).padStart(4, '0');
  const eraOf = (y) => PRES.decades.find((d) => { const [a, b] = d.label.split('–').map(Number); return y >= a && y < b; }) || PRES.decades[PRES.decades.length - 1];
  const eraYear = (d) => Number(d.label.slice(0, 4));
  const presStart = (p) => Number(p.years.slice(0, 4));
  const presId = (x) => 'p-' + x.years.slice(0, 4) + (x.years === '1945–1946' ? 'b' : '');
  const volSlug = (v) => (v.acc || v.id).toLowerCase();
  const catCount = (pred) => CATALOGUE.filter(pred).length;

  function page(title, description, body, url, image) {
    let html = layout({ title, description, body, url, image, nav: 'library' });
    if (!LAUNCHED) html = html.replace('<head>', '<head>\n<meta name="robots" content="noindex">');
    return html;
  }
  const libNav = (on) => `<nav class="lib-nav" aria-label="Heritage Library"><div class="wrap">
<a href="/library" class="${on === 'home' ? 'on' : ''}">Library</a><a href="/library/era/1919" class="${on === 'eras' ? 'on' : ''}">A century, decade by decade</a><a href="/library/balita" class="${on === 'balita' ? 'on' : ''}">Reading room</a><a href="/library/photos" class="${on === 'photos' ? 'on' : ''}">Photographs</a><a href="/library/trophies" class="${on === 'trophies' ? 'on' : ''}">Trophy room</a><a href="/library/collection" class="${on === 'collection' ? 'on' : ''}">The collection</a>
<form action="/library/search" method="get" role="search" class="lib-nav-s"><input name="q" type="search" placeholder="Search 100 years" aria-label="Search the library"></form>
</div></nav>`;

  // ---------- data ----------
  const volumes = () => safe(() => q('rcm_lib_volumes?select=id,acc,title,years,year_from,year_to,issue_from,issue_to,page_count,cover_path&status=eq.published&order=year_from'), []);
  const galleries = () => safe(() => q('rcm_lib_galleries?select=id,slug,title,event_date,place,cover_path,photo_count,balita_url&status=eq.published&order=event_date.desc'), []);
  const objects = (limit = 2000) => safe(() => q(`rcm_lib_objects?select=acc,title,giver,kind,year,image_path,width,height,note&status=eq.published&order=year.desc.nullslast&limit=${limit}`), []);
  const timeline = () => safe(() => q('rcm_lib_timeline?select=*&order=year'), []);
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
    const [vols, gals, objs] = await Promise.all([volumes(), galleries(), objects(12)]);
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
${objs.length ? `<section class="lib-sec lib-dark"><div class="wrap">
<div class="section-head"><div><span class="kicker">The trophy room</span><h2>Honors given and received</h2></div><a class="link-arrow" href="/library/trophies">Enter the trophy room</a></div>
<div class="lib-objs">${objs.slice(0, 8).map(objCard).join('')}</div></div></section>` : ''}
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
  const galCard = (g) => `<a class="lib-gal" href="/library/photos/${esc(g.slug)}"><span class="im">${g.cover_path ? `<img src="${esc(aSrc(g.cover_path))}" alt="" loading="lazy">` : ''}</span><small>${esc(g.event_date ? fmtDate(g.event_date) : '')}${g.photo_count ? ` · ${g.photo_count} photos` : ''}</small><strong>${esc(g.title)}</strong></a>`;
  const objCard = (o) => `<button type="button" class="lib-obj" data-obj="${esc(o.acc)}"><span class="im"><img src="${esc(aSrc(String(o.image_path || '').replace(/\.jpg$/, '-t.jpg')))}" data-full="${esc(aSrc(o.image_path))}" onerror="if(this.dataset.full&&this.src!==this.dataset.full)this.src=this.dataset.full" alt="${esc(o.title || '')}" loading="lazy"></span><strong>${esc(o.title || o.kind || 'Object')}</strong><small>${[o.year, o.giver].filter(Boolean).map(esc).join(' · ')}</small></button>`;

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
${t.map((x) => `<div class="lib-yr-note"><strong>${esc(x.headline || '')}</strong>${x.body ? ` ${esc(x.body)}` : ''}</div>`).join('')}
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
    const [pg, arts] = await Promise.all([
      safe(() => q(`rcm_lib_pages?select=n,image_path,width,height,text,flags&volume_id=eq.${v.id}&n=gte.${i.start_page}&n=lte.${i.end_page}&order=n`), []),
      safe(() => q(`rcm_lib_articles?select=id,title,kind,pages,body,summary,people&volume_id=eq.${v.id}&issue_no=eq.${i.issue_no}&order=sort`), []),
    ]);
    const byN = new Map(pg.map((p) => [p.n, p]));
    const pages = []; for (let n = i.start_page; n <= i.end_page; n++) { const p = byN.get(n); pages.push(p ? { n, src: aSrc(p.image_path), w: p.width, h: p.height, t: (p.text || '').slice(0, 6000), f: !!(p.flags && p.flags.length) } : { n, held: true }); }
    const rel = (n) => n - i.start_page + 1;
    const title = `Balita No. ${i.issue_no}${i.issue_date ? ', ' + fmtDate(i.issue_date) : ''}`;
    const artHtml = arts.map((a) => `<details class="lib-art" id="a-${esc(a.id)}" data-pages="${(a.pages || []).join(',')}"><summary><span class="k">${esc(a.kind || '')}</span><strong>${esc(a.title || '')}</strong>${a.summary ? `<span class="s">${esc(a.summary)}</span>` : ''}<span class="pg">p. ${(a.pages || []).map(rel).join(', ')}</span></summary>
<div class="lib-art-body">${String(a.body || '').split(/\n\s*\n/).map((t) => `<p>${esc(t.trim())}</p>`).join('')}${(a.people || []).length ? `<div class="lib-people"><span>Named in this article</span>${a.people.slice(0, 60).map((p) => `<a href="/library/search?q=${encodeURIComponent('"' + (p.name || p) + '"')}">${esc(p.name || p)}</a>`).join('')}</div>` : ''}</div></details>`).join('');
    const body = `${libNav('balita')}<section class="wrap lib-reader-head"><a class="lib-back" href="/library/balita/${volSlug(v)}">← Balita ${esc(v.years || '')}</a>
<h1>No. ${i.issue_no} <small>${esc(i.issue_date ? fmtDate(i.issue_date) : i.label || '')}</small></h1>${i.blurb ? `<p class="dek">${esc(i.blurb)}</p>` : ''}
<nav class="lib-issue-pager">${prev ? `<a href="/library/balita/${volSlug(v)}/${prev.issue_no}">← No. ${prev.issue_no}</a>` : '<span></span>'}${next ? `<a href="/library/balita/${volSlug(v)}/${next.issue_no}">No. ${next.issue_no} →</a>` : ''}</nav></section>
<section class="wrap lib-reader">
<div class="lib-viewer" id="viewer"><div class="lib-vbar"><button type="button" data-go="-1" aria-label="Previous page">←</button><span id="where"></span><button type="button" data-go="1" aria-label="Next page">→</button><button type="button" id="zoom">Zoom</button></div><div class="lib-vpage" id="vpage"></div><div class="lib-vnote" id="vnote" hidden>Home addresses on this page have been removed.</div></div>
<div class="lib-side">${arts.length ? `<h2>${arts.length} articles</h2><p class="muted" style="margin-top:0">Read from the page scans. Open one to read it; the page viewer follows along.</p>${artHtml}` : `<h2>Page text</h2><p class="muted" style="margin-top:0">This issue has not been read into articles yet. The machine-read text of the page is below, and it is searchable.</p><pre class="lib-ocr" id="ocr"></pre>`}</div>
</section>
<script>(function(){var P=${JSON.stringify(pages).replace(/</g, '\\u003c')},HL=${JSON.stringify(String(hl || '').slice(0, 60)).replace(/</g, '\\u003c')},k=0,z=false;var vp=document.getElementById('vpage'),wh=document.getElementById('where'),no=document.getElementById('vnote'),oc=document.getElementById('ocr');
function esc(s){return String(s).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
function mark(t){if(!HL)return esc(t);var h=HL.replace(/"/g,'').trim();if(!h)return esc(t);var re=new RegExp('('+h.replace(/[.*+?^\${}()|[\\]\\\\]/g,'\\\\$&')+')','ig');return esc(t).replace(re,'<mark>$1</mark>')}
function show(i){if(i<0||i>=P.length)return;k=i;var p=P[k];wh.textContent='Page '+(k+1)+' of '+P.length;document.querySelector('[data-go="-1"]').disabled=k===0;document.querySelector('[data-go="1"]').disabled=k===P.length-1;
vp.className='lib-vpage'+(z?' zoom':'');vp.innerHTML=p.held?'<div class="lib-held"><strong>Page withheld</strong><p>This page prints members’ home addresses, so the scan stays in the Club’s private archive.</p></div>':!p.src?'<div class="lib-held"><strong>No scan of this page</strong><p>Only its text survives in the archive.</p></div>':'<img src="'+p.src+'" alt="Page '+(k+1)+' of this issue"'+(p.w?' width="'+p.w+'" height="'+p.h+'"':'')+'>';no.hidden=!p.f;if(oc)oc.innerHTML=p.held?'':mark(p.t||'(No text was read from this page.)');
document.querySelectorAll('.lib-art').forEach(function(d){d.classList.toggle('here',(','+d.getAttribute('data-pages')+',').indexOf(','+p.n+',')>=0)});try{history.replaceState(null,'','#p'+(k+1))}catch(e){}}
document.querySelectorAll('[data-go]').forEach(function(b){b.onclick=function(){show(k+Number(b.getAttribute('data-go')))}});
document.getElementById('zoom').onclick=function(){z=!z;this.textContent=z?'Fit':'Zoom';show(k)};
document.addEventListener('keydown',function(e){if(e.target.closest('input,textarea'))return;if(e.key==='ArrowRight')show(k+1);if(e.key==='ArrowLeft')show(k-1)});
document.querySelectorAll('.lib-art').forEach(function(d){d.addEventListener('toggle',function(){if(d.open){var f=Number((d.getAttribute('data-pages')||'').split(',')[0]);var j=P.findIndex(function(p){return p.n===f});if(j>=0)show(j)}})});
var m=location.hash.match(/^#p(\\d+)$/),a=location.hash.match(/^#a-(.+)$/);if(a){var el=document.getElementById('a-'+a[1]);if(el){el.open=true;el.scrollIntoView()}}show(m?Number(m[1])-1:0)})();</script>`;
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
    const list = ph.map((p) => ({ s: aSrc(p.path), t: aSrc(p.path.replace(/(\.[a-z]+)$/i, '-t$1')), w: p.width, h: p.height, c: p.caption || '' }));
    const body = `${libNav('photos')}<section class="wrap lib-page-head"><a class="lib-back" href="/library/photos">← All albums</a><span class="kicker">${esc(g.event_date ? fmtDate(g.event_date) : '')}${g.place ? ' · ' + esc(g.place) : ''}</span><h1>${esc(g.title)}</h1>${g.note ? `<p class="dek">${esc(g.note)}</p>` : ''}${g.balita_url ? `<p><a class="link-arrow" href="${esc(g.balita_url)}">Read about it in the Balita</a></p>` : ''}</section>
<section class="wrap lib-sec" style="padding-top:0"><div class="lib-photos">${list.map((p, k) => `<button type="button" data-k="${k}" style="aspect-ratio:${p.w && p.h ? `${p.w}/${p.h}` : '4/3'}"><img src="${esc(p.t)}" alt="${esc(p.c)}" loading="lazy" onerror="this.onerror=null;this.src='${esc(p.s)}'"></button>`).join('')}</div></section>
<dialog class="lib-lightbox" id="lb"><button type="button" class="x" aria-label="Close">×</button><button type="button" class="nv" data-s="-1" aria-label="Previous">‹</button><figure><img id="lbi" alt=""><figcaption id="lbc"></figcaption></figure><button type="button" class="nv" data-s="1" aria-label="Next">›</button></dialog>
<script>(function(){var L=${JSON.stringify(list).replace(/</g, '\\u003c')},d=document.getElementById('lb'),im=document.getElementById('lbi'),cp=document.getElementById('lbc'),k=0;
function show(i){if(i<0||i>=L.length)return;k=i;im.src=L[k].s;im.alt=L[k].c;cp.textContent=(k+1)+' of '+L.length+(L[k].c?' · '+L[k].c:'');if(!d.open)d.showModal()}
document.querySelector('.lib-photos').onclick=function(e){var b=e.target.closest('[data-k]');if(b)show(Number(b.getAttribute('data-k')))};
d.querySelector('.x').onclick=function(){d.close()};d.querySelectorAll('[data-s]').forEach(function(b){b.onclick=function(){show(k+Number(b.getAttribute('data-s')))}});
d.addEventListener('keydown',function(e){if(e.key==='ArrowRight')show(k+1);if(e.key==='ArrowLeft')show(k-1)});d.addEventListener('click',function(e){if(e.target===d)d.close()})})();</script>`;
    return page(`${g.title} · Photographs · Heritage Library`, `${g.photo_count || list.length} photographs${g.event_date ? ', ' + fmtDate(g.event_date) : ''}.`, body, `${origin}/library/photos/${g.slug}`, g.cover_path ? aSrc(g.cover_path) : null);
  }

  // ---------- trophy room ----------
  async function trophies(origin) {
    const objs = await objects();
    const kinds = [...new Set(objs.map((o) => o.kind).filter(Boolean))].sort();
    const body = `${libNav('trophies')}<section class="lib-era-hero dark"><div class="wrap"><span class="lib-eyebrow">The trophy room</span><h1>Honors given and received</h1><p>Plaques, trophies, medals and gifts from a century of service: awards from Rotary International and the District, thanks from partners and communities, and tokens from sister clubs around the world.</p></div></section>
<section class="wrap lib-sec" style="padding-top:20px">${objs.length ? `<div class="lib-filter"><button type="button" data-k="" aria-pressed="true">All ${objs.length}</button>${kinds.map((k) => `<button type="button" data-k="${esc(k)}" aria-pressed="false">${esc(k)} ${objs.filter((o) => o.kind === k).length}</button>`).join('')}</div>
<div class="lib-objs">${objs.map((o) => objCard(o).replace('class="lib-obj"', `class="lib-obj" data-kind="${esc(o.kind || '')}" data-year="${o.year || ''}"`)).join('')}</div>` : `<div class="lib-empty">Photographs of about 480 plaques and trophies are being prepared. <a href="/library/collection#c=Plaques%20%26%20trophies">See the list in the catalogue</a>.</div>`}</section>
<dialog class="lib-lightbox light" id="lb"><button type="button" class="x" aria-label="Close">×</button><figure><img id="lbi" alt=""><figcaption id="lbc"></figcaption></figure></dialog>
<script>(function(){var O=${JSON.stringify(objs.map((o) => ({ a: o.acc, s: aSrc(o.image_path), t: o.title, g: o.giver, y: o.year, k: o.kind, n: o.note }))).replace(/</g, '\\u003c')},d=document.getElementById('lb');
document.addEventListener('click',function(e){var b=e.target.closest('[data-obj]');if(b){var o=O.find(function(x){return x.a===b.getAttribute('data-obj')});if(!o)return;document.getElementById('lbi').src=o.s;var c=document.getElementById('lbc');c.innerHTML='';var s=document.createElement('strong');s.textContent=o.t||'';c.appendChild(s);var m=document.createElement('span');m.textContent=[o.k,o.y,o.g,o.a].filter(Boolean).join(' · ');c.appendChild(m);if(o.n){var p=document.createElement('p');p.textContent=o.n;c.appendChild(p)}d.showModal();return}
var f=e.target.closest('.lib-filter [data-k]');if(f){var k=f.getAttribute('data-k');document.querySelectorAll('.lib-filter [data-k]').forEach(function(x){x.setAttribute('aria-pressed',String(x===f))});document.querySelectorAll('.lib-objs .lib-obj').forEach(function(x){x.hidden=!!k&&x.getAttribute('data-kind')!==k})}});
d.querySelector('.x').onclick=function(){d.close()};d.addEventListener('click',function(e){if(e.target===d)d.close()});
var y=location.hash.match(/^#y=(\\d{4})$/);if(y){document.querySelectorAll('.lib-objs .lib-obj').forEach(function(x){var v=Number(x.getAttribute('data-year'));x.hidden=!(v===Number(y[1])||v===Number(y[1])+1)})}})();</script>`;
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

  async function route(origin, u) {
    const parts = String(u.searchParams.get('p') || '').split('/').filter(Boolean);
    const [a, b, c] = parts;
    if (!a) return landing(origin);
    if (a === 'era') return era(origin, b);
    if (a === 'balita') { if (!b) return reading(origin); if (!c) return volume(origin, b); return issue(origin, b, c, u.searchParams.get('hl')); }
    if (a === 'search') return search(origin, u.searchParams.get('q'), u.searchParams.get('v'));
    if (a === 'photos') return b ? gallery(origin, b) : photos(origin);
    if (a === 'trophies') return trophies(origin);
    if (a === 'collection') return collection(origin);
    return null;
  }
  return { route };
};

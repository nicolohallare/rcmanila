(function () {
  const SB = 'https://unavxknqpibxwcoqemaf.supabase.co';
  const FN = SB + '/functions/v1/rcm-admin';
  const PUB = 'sb_publishable_zebFaErs-sjDwYWQUMfq3g_VuF2DTI6';
  const $ = (id) => document.getElementById(id);
  // Some PDFs carry null characters or broken characters in their text, which the database refuses
  // ("unsupported Unicode escape sequence"). Strip them from every page's text right after reading.
  const cleanText = (t) => String(t || '').replace(/\u0000/g, '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
  if (window.BalitaExtract && !window.BalitaExtract._clean) {
    const orig = window.BalitaExtract.extractPdf;
    window.BalitaExtract.extractPdf = async (...a) => { const ps = await orig(...a); for (const p of ps) if (p && typeof p.text === 'string') p.text = cleanText(p.text); return ps; };
    window.BalitaExtract._clean = true;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const imgUrl = (path, w) => `${SB}/storage/v1/render/image/public/rcm/${path.split('/').map(encodeURIComponent).join('/')}?width=${w}&resize=contain&quality=75`;
  let code = '';
  try { code = localStorage.getItem('rcm-editor-code') || ''; } catch (e) {}

  function show(v) { for (const id of ['v-login', 'v-home', 'v-run', 'v-review']) $(id).classList.toggle('hidden', id !== v); $('main').classList.toggle('wide', v === 'v-review'); window.scrollTo(0, 0); }

  async function call(action, payload) {
    const r = await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', 'x-editor-code': code, apikey: PUB }, body: JSON.stringify(Object.assign({ action }, payload || {})) });
    const text = await r.text();
    const line = text.trim().split('\n').pop();
    let data;
    try { data = JSON.parse(line); } catch (e) { throw new Error('The server did not answer properly (' + r.status + '). Please try again.'); }
    if (r.status === 401) { throw Object.assign(new Error(data.error || 'Wrong passcode'), { auth: true }); }
    if (!r.ok || data.error) throw new Error(data.error || ('Error ' + r.status));
    if ('ok' in data && 'data' in data) { if (!data.ok) throw new Error(data.error); return data.data; }
    if (data.ok === false) throw new Error(data.error);
    return data;
  }

  // ---------- sign in ----------
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    code = $('code').value.trim();
    $('login-err').classList.add('hidden');
    try { await call('login'); try { localStorage.setItem('rcm-editor-code', code); } catch (x) {} openHome(); }
    catch (err) { $('login-err').textContent = err.auth ? 'That passcode is not right. Check it and try again.' : err.message; $('login-err').classList.remove('hidden'); }
  });
  $('signout').onclick = () => { try { localStorage.removeItem('rcm-editor-code'); } catch (e) {} code = ''; show('v-login'); };

  // ---------- home ----------
  const STATUS = { processing: ['Processing', 'run'], draft: ['Ready to check', 'flag'], scheduled: ['Scheduled', 'ok'], published: ['Live', 'ok'] };
  async function openHome() {
    show('v-home');
    document.dispatchEvent(new Event('rcmed:home'));
    return openHomeList();
  }
  async function openHomeList() {
    try {
      const { issues } = await call('issues');
      $('issues').innerHTML = issues.length ? issues.slice(0, 8).map(issueRow).join('') : '<li class="muted">No issues yet. Upload the first one above.</li>';
      // The list call has no guest names; read them from the public issue list so each row says who was on the cover.
      const top = issues.slice(0, 8);
      if (top.length && top.some((i) => !i.guest)) {
        try {
          const r = await fetch(`${SB}/rest/v1/rcm_issues?select=issue_no,guest&issue_no=in.(${top.map((i) => i.issue_no).join(',')})`, { headers: { apikey: PUB } });
          if (r.ok) { const g = new Map((await r.json()).map((x) => [x.issue_no, x.guest])); top.forEach((i) => { if (!i.guest && g.get(i.issue_no)) i.guest = g.get(i.issue_no); }); $('issues').innerHTML = top.map(issueRow).join(''); }
        } catch (e) {}
      }
    } catch (err) {
      if (err.auth) return show('v-login');
      $('issues').innerHTML = `<li class="err">${esc(err.message)}</li>`;
    }
  }
  function issueRow(i) {
    const s = STATUS[i.status] || [i.status, 'wait'];
    const when = i.status === 'scheduled' && i.publish_at ? ' · goes live ' + new Date(i.publish_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }) : '';
    return `<li>${i.cover_path ? `<img class="icov${i.issue_date && i.issue_date < '2024-07-01' ? ' pg' : ''}" src="${imgUrl(i.cover_path, 200)}&v=${Date.parse(i.updated_at || 0)}" alt="">` : '<img class="icov" alt="">'}<div style="flex:1"><b>Issue ${i.issue_no}</b><br><span class="muted">${esc(i.issue_date || '')}${esc(when)}${i.guest ? ' · ' + esc(i.guest.length > 70 ? i.guest.slice(0, 68) + '…' : i.guest) : ''}</span></div><span class="tag ${s[1]}">${s[0]}</span><button class="smallbtn" data-open="${i.id}" type="button">${i.status === 'published' ? 'Edit' : 'Check and publish'}</button>${i.status === 'published' || i.status === 'scheduled' ? `<a class="smallbtn" href="/balita/${i.issue_no}" target="_blank" rel="noopener">View</a>` : ''}</li>`;
  }
  window.RCMEditor = { open: (id) => openReview(id), code: () => code, signin: () => show('v-login') };
  ['issues', 'find-list'].forEach((id) => $(id).addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) openReview(b.getAttribute('data-open')); }));
  // Find any past issue: by number, date, guest, or a word in the issue or an article title.
  $('find-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('find-q').value.trim(), out = $('find-list');
    if (!q) { out.innerHTML = ''; return; }
    out.innerHTML = '<li class="muted">Searching…</li>';
    const cols = 'id,issue_no,issue_date,status,publish_at,cover_path,updated_at,guest';
    const get = async (f) => { const r = await fetch(`${SB}/rest/v1/rcm_issues?select=${cols}&${f}&order=issue_no.desc&limit=30`, { headers: { apikey: PUB } }); if (!r.ok) throw new Error('Search did not work (' + r.status + ')'); return r.json(); };
    try {
      let list;
      if (/^\d{3,5}$/.test(q)) list = await get(`issue_no=eq.${q}`);
      else if (/^\d{4}-\d{2}(-\d{2})?$/.test(q)) list = await get(q.length === 10 ? `issue_date=eq.${q}` : `issue_date=gte.${q}-01&issue_date=lte.${q}-31`);
      else {
        const w = encodeURIComponent('*' + q.replace(/[(),*]/g, ' ') + '*');
        const byArt = await (await fetch(`${SB}/rest/v1/rcm_articles?select=issue_id&title=ilike.${w}&limit=60`, { headers: { apikey: PUB } })).json().catch(() => []);
        const ids = [...new Set((Array.isArray(byArt) ? byArt : []).map((a) => a.issue_id))];
        list = await get(`or=(guest.ilike.${w},summary.ilike.${w},search_text.ilike.${w}${ids.length ? `,id.in.(${ids.join(',')})` : ''})`);
      }
      out.innerHTML = list.length ? list.map(issueRow).join('') : '<li class="muted">No issue found. Try the issue number or another word.</li>';
    } catch (err) { out.innerHTML = `<li class="err">${esc(err.message)}</li>`; }
  });

  const drop = $('drop');
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) run(f); });
  $('file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) run(f); });

  // ---------- processing ----------
  const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, sept: 9, october: 10, november: 11, december: 12 };
  function guessMeta(text, filename) {
    const out = {};
    const n = /issue\s*no\.?\s*(\d{3,5})/i.exec(text); if (n) out.no = Number(n[1]);
    const d = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i.exec(text) ||
      /(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*[_\s.-]+(\d{1,2})[_\s.,-]+(\d{4})/i.exec(filename);
    if (d) {
      const key = d[1].toLowerCase(); const m = MONTHS[key] || MONTHS[Object.keys(MONTHS).find((k) => k.startsWith(key.slice(0, 3)))];
      if (m) out.date = `${d[3]}-${String(m).padStart(2, '0')}-${String(d[2]).padStart(2, '0')}`;
    }
    return out;
  }
  function step(i, state, text) {
    const d = $('d' + i); d.className = 'dot ' + (state || ''); d.textContent = state === 'ok' ? '✓' : state === 'err' ? '!' : '';
    if (text) $('s' + i).textContent = text;
  }
  function setBar(f) { $('bar').style.width = Math.round(f * 100) + '%'; }
  function fail(msg) { $('run-err').textContent = msg; $('run-err').classList.remove('hidden'); $('run-title').textContent = 'Something went wrong'; }

  async function pool(items, n, fn) {
    let i = 0; const res = [];
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; res[k] = await fn(items[k], k); } }));
    return res;
  }

  async function uploadAll(issueNo, files, onEach) {
    const names = files.map((f) => f.name);
    const signed = [];
    for (let i = 0; i < names.length; i += 100) signed.push(...(await call('sign', { issue_no: issueNo, names: names.slice(i, i + 100) })).uploads);
    const byName = new Map(signed.map((s) => [s.name, s]));
    let done = 0;
    await pool(files, 6, async (f) => {
      const s = byName.get(f.name); if (!s) return;
      const fd = new FormData(); fd.append('cacheControl', '31536000'); fd.append('', f.blob, f.name.split('/').pop());
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await fetch(s.signedUrl, { method: 'PUT', headers: { 'x-upsert': 'true' }, body: fd });
        if (r.ok) break;
        if (attempt === 2) throw new Error('Could not save ' + f.name + ' (' + r.status + ')');
      }
      f.path = s.path; onEach(++done);
    });
    return files;
  }

  // Long articles are drafted in parts so the AI never runs out of room.
  function splitParts(ps) {
    const parts = []; let cur = []; let len = 0; let nph = 0;
    for (const p of ps) {
      const tl = (p.text || '').length, pc = p.photos.length;
      if (cur.length && (len + tl > 14000 || nph + pc > 36 || cur.length >= 6)) { parts.push(cur); cur = []; len = 0; nph = 0; }
      cur.push(p); len += tl; nph += pc;
    }
    if (cur.length) parts.push(cur);
    return parts;
  }
  let runCtx = null;
  async function draftArticle(a, i) {
    const { issue, pages, pathOf } = runCtx;
    const li = $('a' + i);
    const tag = li.querySelector('.tag');
    const note = li.querySelector('.anote') || li.querySelector('div').appendChild(Object.assign(document.createElement('div'), { className: 'anote' }));
    const old = li.querySelector('.retry'); if (old) old.remove();
    note.textContent = ''; note.className = 'anote';
    tag.className = 'tag run'; tag.textContent = 'Drafting…';
    const ps = pages.filter((p) => p.n >= a.from && p.n <= a.to);
    const groups = splitParts(ps);
    try {
      const parts = [];
      for (let k = 0; k < groups.length; k++) {
        if (groups.length > 1) tag.textContent = `Drafting part ${k + 1} of ${groups.length}…`;
        const g = groups[k];
        const photos = g.flatMap((p) => p.photos.map((ph) => ({ id: ph.id, page: ph.page, path: pathOf.get(ph.id), width: ph.width, height: ph.height, preview: ph.preview })));
        let res, err;
        for (let attempt = 0; attempt < 2 && !res; attempt++) {
          try { res = await call('clean-part', { article: a, part: k, parts: groups.length, pages: g.map((p) => ({ n: p.n, text: p.text })), photos }); }
          catch (e) { err = e; }
        }
        if (!res) throw err;
        parts.push(res);
      }
      const saved = await call('save-draft', { issue_id: issue.id, sort: i, article: a, parts });
      const ph = (saved.photos || [])[0];
      if (ph) li.querySelector('img').src = imgUrl(ph.path, 140);
      li.querySelector('b').textContent = saved.title;
      tag.className = 'tag ' + (saved.flag ? 'flag' : 'ok'); tag.textContent = saved.flag ? 'Needs a look' : 'Drafted';
      return saved;
    } catch (err) {
      if (err.auth) throw err;
      tag.className = 'tag off'; tag.textContent = 'Could not draft';
      note.className = 'anote err'; note.textContent = 'Reason: ' + err.message;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'smallbtn retry'; b.textContent = 'Try again';
      b.onclick = async () => { b.disabled = true; const r = await draftArticle(a, i); if (r) { const left = document.querySelectorAll('#alist .tag.off').length; step(4, left ? 'err' : 'ok', left ? `${left} article(s) still need drafting` : 'All articles drafted'); } };
      li.appendChild(b);
      return null;
    }
  }

  let current = null;
  async function run(file) {
    show('v-run');
    $('run-err').classList.add('hidden'); $('alist').innerHTML = ''; $('thumbs').innerHTML = ''; $('to-review').classList.add('hidden');
    for (let i = 1; i <= 4; i++) step(i, '');
    $('run-file').textContent = file.name + ' · ' + (file.size / 1048576).toFixed(1) + ' MB';
    $('run-title').textContent = 'Reading the issue…';
    setBar(0);
    let pages;
    try {
      step(1, 'run', 'Reading pages…');
      pages = await BalitaExtract.extractPdf(file, ({ n, total, page }) => {
        setBar(n / total * 0.25);
        step(1, 'run', `Reading page ${n} of ${total} · ${pagesPhotos()} photos found`);
        const t = document.createElement('img'); t.src = page.thumbUrl; t.alt = ''; $('thumbs').prepend(t);
        while ($('thumbs').children.length > 14) $('thumbs').lastChild.remove();
        function pagesPhotos() { return (window.__photoCount = (window.__photoCount || 0) + page.photos.length); }
      });
      window.__photoCount = 0;
      const photoTotal = pages.reduce((a, p) => a + p.photos.length, 0);
      step(1, 'ok', `Read ${pages.length} pages and found ${photoTotal} photos`);
      const meta = guessMeta(pages[0].text + '\n' + (pages[1] ? pages[1].text : ''), file.name);
      if (!$('in-no').value && meta.no) $('in-no').value = meta.no;
      if (!$('in-date').value && meta.date) $('in-date').value = meta.date;

      step(2, 'run', 'The AI is finding the articles…'); setBar(0.3);
      $('run-title').textContent = 'Finding the articles…';
      const plan = await call('plan', { pages: pages.map((p) => ({ n: p.n, text: p.text })) });
      const arts = (plan.articles || []).filter((a) => a.from && a.to);
      if (!arts.length) throw new Error('The AI could not find any articles in this PDF.');
      if (!$('in-no').value && plan.issue && plan.issue.issue_no) $('in-no').value = plan.issue.issue_no;
      if (!$('in-date').value && plan.issue && plan.issue.date) $('in-date').value = plan.issue.date;
      const issueNo = Number($('in-no').value);
      if (!issueNo) throw new Error('Type the issue number in the box above, then upload the PDF again.');
      step(2, 'ok', `Found ${arts.length} articles`);
      $('alist').innerHTML = arts.map((a, i) => `<li id="a${i}"><img alt=""><div style="flex:1"><b>${esc(a.title)}</b><br><span class="muted">${esc(a.kicker || '')}${a.printed ? ' · ' + esc(a.printed) : ''}</span></div><span class="tag wait">Waiting</span></li>`).join('');

      $('run-title').textContent = 'Saving pages and photos…';
      let keep = false;
      const chk = await call('check-issue', { issue_no: issueNo });
      if (chk.exists && chk.articles) {
        keep = window.confirm(`Issue ${issueNo} is already on the website with ${chk.articles} articles.\n\nOK = keep those articles (and your checks) and only add the ones that are missing.\nCancel = replace the whole issue with this upload.`);
      }
      const { issue, kept } = await call('start', { issue_no: issueNo, issue_date: $('in-date').value || null, page_count: pages.length, keep });
      current = issue;
      const keptFrom = new Set((kept || []).map((k) => k.page_from));
      arts.forEach((a, i) => { if (keptFrom.has(a.from)) { a.skip = true; const li = $('a' + i); li.querySelector('.tag').className = 'tag ok'; li.querySelector('.tag').textContent = 'Already on the site'; } });
      const files = [];
      const v = Date.now().toString(36); // new file names on every upload, so no one sees an old copy
      pages.forEach((p) => {
        files.push({ name: `pages/page-${String(p.n).padStart(3, '0')}-${v}.jpg`, blob: p.thumbBlob, page: p.n, kind: 'page' });
        p.photos.forEach((ph) => files.push({ name: `photos/${ph.id}-${v}.jpg`, blob: ph.blob, photo: ph, kind: 'photo' }));
      });
      files.push({ name: `cover-${v}.jpg`, blob: await BalitaExtract.coverFrom(pages[0]), kind: 'cover' });
      step(3, 'run', `Saving 0 of ${files.length} files…`);
      await uploadAll(issueNo, files, (n) => { step(3, 'run', `Saving ${n} of ${files.length} files…`); setBar(0.3 + n / files.length * 0.25); });
      step(3, 'ok', `Saved ${files.length} pages and photos`);
      const pathOf = new Map(files.filter((f) => f.photo).map((f) => [f.photo.id, f.path]));
      const pagePaths = files.filter((f) => f.kind === 'page').map((f) => f.path);
      const cover = files.find((f) => f.kind === 'cover').path;

      $('run-title').textContent = 'Drafting the articles…';
      const todo = arts.map((a, i) => [a, i]).filter(([a]) => !a.skip);
      let drafted = 0;
      step(4, 'run', `Drafting 0 of ${todo.length} articles…`);
      runCtx = { issue, pages, pathOf };
      const results = await pool(todo, 3, async ([a, i]) => {
        const r = await draftArticle(a, i);
        drafted++; step(4, 'run', `Drafting ${drafted} of ${todo.length} articles…`); setBar(0.55 + drafted / Math.max(1, todo.length) * 0.45);
        return r;
      });
      const ok = results.filter(Boolean).length; const total = todo.length;
      await call('finish', { issue_id: issue.id, fields: { issue_date: $('in-date').value || null, meeting: plan.issue && plan.issue.meeting, guest: plan.issue && plan.issue.guest, summary: plan.issue && plan.issue.summary, cover_path: cover, pages: pagePaths, page_count: pages.length, search_text: pages.map((p) => p.text || '').join('\n\n').slice(0, 400000) } });
      step(4, ok === total ? 'ok' : 'err', ok === total ? `Drafted all ${ok} articles` : `Drafted ${ok} of ${total} articles. Click “Try again” next to the ones that failed.`);
      setBar(1);
      $('run-title').textContent = 'Ready for you to check';
      $('to-review').classList.remove('hidden');
    } catch (err) {
      if (err.auth) return show('v-login');
      [1, 2, 3, 4].forEach((i) => { if ($('d' + i).classList.contains('run')) step(i, 'err'); });
      fail(err.message);
    }
  }
  $('to-review').onclick = () => current && openReview(current.id);

  // ---------- old issues: reader + search only, no AI ----------
  let oldQueue = [];
  $('old-files').addEventListener('change', async (e) => {
    const files = [...e.target.files].sort((a, b) => a.name.localeCompare(b.name));
    e.target.value = '';
    if (!files.length) return;
    $('old-table').classList.remove('hidden'); $('old-msg').textContent = 'Reading the first pages to find issue numbers and dates…';
    oldQueue = files.map((f, k) => ({ f, k, no: '', date: '', state: 'Waiting' }));
    drawOld();
    for (const it of oldQueue) {
      try { const pk = await BalitaExtract.peek(it.f); const m = guessMeta(pk.text, it.f.name); it.no = m.no || ''; it.date = m.date || ''; it.pages = pk.pages; }
      catch (err) { it.state = 'Could not open this PDF'; }
      drawOld();
    }
    $('old-msg').textContent = 'Check the issue numbers and dates, fix any that are blank or wrong, then click Add these issues.';
  });
  function drawOld() {
    $('old-rows').innerHTML = oldQueue.map((it) => `<tr><td title="${esc(it.f.name)}">${esc(it.f.name)}<br><span class="muted" style="font-size:13px">${(it.f.size / 1048576).toFixed(1)} MB${it.pages ? ' · ' + it.pages + ' pages' : ''}</span></td>
<td><input type="number" data-ono="${it.k}" value="${esc(it.no)}" style="width:100px"></td><td><input type="date" data-odate="${it.k}" value="${esc(it.date)}"></td><td data-ost="${it.k}">${esc(it.state)}</td></tr>`).join('');
  }
  $('old-rows').addEventListener('input', (e) => {
    const n = e.target.getAttribute('data-ono'), d = e.target.getAttribute('data-odate');
    if (n != null) oldQueue[+n].no = e.target.value; if (d != null) oldQueue[+d].date = e.target.value;
  });
  const setOld = (it, t) => { it.state = t; const c = document.querySelector(`[data-ost="${it.k}"]`); if (c) c.textContent = t; };
  $('old-start').onclick = async () => {
    const btn = $('old-start'); btn.disabled = true;
    let done = 0, skipped = 0, failed = 0;
    for (const it of oldQueue) {
      if (/^(Added|Already)/.test(it.state)) continue;
      const no = Number(it.no);
      if (!no) { setOld(it, 'Needs an issue number'); failed++; continue; }
      try {
        const chk = await call('check-issue', { issue_no: no });
        // An issue that so far has only the old website's articles gets its pages added; anything else is left alone.
        const addPagesOnly = chk.exists && chk.source === 'legacy' && !chk.has_pages;
        if (chk.exists && !addPagesOnly) { setOld(it, 'Already on the website, skipped'); skipped++; continue; }
        setOld(it, 'Reading pages…');
        const pages = await BalitaExtract.extractPdf(it.f, ({ n, total }) => setOld(it, `Reading page ${n} of ${total}…`), { pagesOnly: true });
        const { issue } = await call('start', { issue_no: no, issue_date: it.date || null, page_count: pages.length, source: 'legacy', keep: addPagesOnly });
        const v = Date.now().toString(36);
        const files = pages.map((p) => ({ name: `pages/page-${String(p.n).padStart(3, '0')}-${v}.jpg`, blob: p.thumbBlob, kind: 'page' }));
        files.push({ name: `cover-${v}.jpg`, blob: await BalitaExtract.coverFrom(pages[0]), kind: 'cover' });
        if (it.f.size <= 49 * 1048576) files.push({ name: `balita-${no}-${v}.pdf`, blob: it.f, kind: 'pdf' });
        await uploadAll(no, files, (n) => setOld(it, `Saving ${n} of ${files.length} files…`));
        const text = pages.map((p) => p.text || '').join('\n\n').slice(0, 400000);
        const pdf = files.find((f) => f.kind === 'pdf');
        await call('legacy-finish', { issue_id: issue.id, fields: { issue_date: it.date || null, cover_path: files.find((f) => f.kind === 'cover').path, pages: files.filter((f) => f.kind === 'page').map((f) => f.path), page_count: pages.length, search_text: text, pdf_url: pdf ? `${SB}/storage/v1/object/public/rcm/${pdf.path}` : null } });
        setOld(it, text.trim().length > 200 ? 'Added ✓' : 'Added ✓ (no text found: scanned pages are not searchable)'); done++;
      } catch (err) { if (err.auth) return show('v-login'); setOld(it, 'Failed: ' + err.message); failed++; }
    }
    $('old-msg').textContent = `${done} added, ${skipped} skipped${failed ? `, ${failed} need attention` : ''}.`;
    btn.disabled = false; openHomeList();
  };

  // ---------- old issues: split into articles with the AI (PDF-only or text-only back issues) ----------
  const rest = async (q) => { const r = await fetch(`${SB}/rest/v1/${q}`, { headers: { apikey: PUB } }); if (!r.ok) throw new Error('Could not load the list (' + r.status + ')'); return r.json(); };
  let splitQ = [];
  $('split-load').onclick = async () => {
    $('split-msg').textContent = 'Loading…';
    try {
      const issues = await rest('rcm_issues?select=id,issue_no,issue_date,pdf_url,page_count&source=eq.legacy&order=issue_no.desc&limit=2000');
      const arts = [];
      for (let i = 0; i < issues.length; i += 20) arts.push(...await rest(`rcm_articles?select=issue_id,first:photos->0&issue_id=in.(${issues.slice(i, i + 20).map((x) => x.id).join(',')})&limit=1000`));
      // Issues whose pages and photos are already saved, waiting for their articles to be written in the Claude chat.
      const prepared = new Set(await fetch(`${SB}/rest/v1/rpc/rcm_manifest_nos`, { method: 'POST', headers: { apikey: PUB, 'content-type': 'application/json' }, body: '{}' }).then((r) => (r.ok ? r.json() : [])).catch(() => []));
      const by = new Map();
      for (const a of arts) { const s = by.get(a.issue_id) || { n: 0, ph: 0 }; s.n++; if (a.first) s.ph++; by.set(a.issue_id, s); }
      const NOPAGES = 'Articles done, page images missing';
      splitQ = issues.map((i, k) => {
        const s = by.get(i.id) || { n: 0, ph: 0 };
        const now = !s.n ? (i.page_count ? 'Pages only: photos and articles missing' : 'PDF only') : !i.page_count ? NOPAGES : s.ph <= s.n / 3 ? `${s.n} articles, mostly without photos` : null;
        return { k, i, now, onSite: /supabase\.co\/storage/.test(i.pdf_url || ''), file: null, on: true, state: 'Waiting' };
      }).filter((x) => x.now && !prepared.has(x.i.issue_no));
      drawSplit();
      const wait = prepared.size ? ` ${prepared.size} more already have their pages saved and are waiting for their articles.` : '';
      $('split-msg').textContent = (splitQ.length ? `${splitQ.length} issues could be improved.` : 'Every old issue already has its articles and photos.') + wait;
    } catch (err) { $('split-msg').textContent = err.message; }
  };
  function drawSplit() {
    $('split-table').classList.toggle('hidden', !splitQ.length);
    $('split-rows').innerHTML = splitQ.map((x) => `<tr><td><input type="checkbox" data-son="${x.k}" ${x.on ? 'checked' : ''} aria-label="Split issue ${x.i.issue_no}"></td>
<td><b>No. ${x.i.issue_no}</b><br><span class="muted" style="font-size:13px">${esc(x.i.issue_date || '')}</span></td><td>${esc(x.now)}</td>
<td>${x.onSite && !x.file ? 'On the website' : x.file ? esc(x.file.name) : ''}<br><label class="smallbtn" style="display:inline-block;margin-top:4px">${x.onSite || x.file ? 'Use another PDF' : 'Choose the PDF'}<input type="file" accept="application/pdf" data-sfile="${x.k}" class="hidden"></label></td>
<td data-sst="${x.k}">${esc(x.state)}</td></tr>`).join('');
    const n = splitQ.filter((x) => x.on).length;
    $('split-sum').textContent = n ? `${n} ticked` + ($('split-ai').checked ? ` · roughly US$${Math.round(n * 0.5)}–${n} of AI` : ' · no AI cost') : '';
  }
  $('split-rows').addEventListener('change', (e) => {
    const on = e.target.getAttribute('data-son'), f = e.target.getAttribute('data-sfile');
    if (on != null) { splitQ.find((x) => x.k === +on).on = e.target.checked; drawSplit(); }
    if (f != null && e.target.files[0]) { splitQ.find((x) => x.k === +f).file = e.target.files[0]; drawSplit(); }
  });
  $('split-ai').addEventListener('change', drawSplit);
  $('split-all').addEventListener('change', (e) => { splitQ.forEach((x) => { x.on = e.target.checked; }); drawSplit(); });
  // Many PDFs at once: match each to its row by the issue number printed inside, or the date in the file name/cover.
  $('split-files').addEventListener('change', async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    let matched = 0; const miss = [];
    for (const f of files) {
      $('split-sum').textContent = `Matching ${f.name}…`;
      let m = {};
      try { const pk = await BalitaExtract.peek(f); m = guessMeta(pk.text, f.name); } catch (err) { m = guessMeta('', f.name); }
      const x = splitQ.find((q) => (m.no && q.i.issue_no === m.no) || (!m.no && m.date && q.i.issue_date === m.date)) || (m.date && splitQ.find((q) => q.i.issue_date === m.date));
      if (x) { x.file = f; x.on = true; matched++; } else miss.push(f.name);
    }
    drawSplit();
    $('split-msg').textContent = `${matched} of ${files.length} PDFs matched to an issue.` + (miss.length ? ` Not matched: ${miss.join(', ')}. Use “Choose the PDF” on the right row for these.` : '');
  });
  const setSplit = (x, t) => { x.state = t; const c = document.querySelector(`[data-sst="${x.k}"]`); if (c) c.textContent = t; };

  async function splitOne(x) {
    const no = x.i.issue_no;
    let blob = x.file;
    if (!blob) {
      if (!x.onSite) throw new Error('Choose the PDF for this issue first');
      setSplit(x, 'Downloading the PDF…');
      const r = await fetch(x.i.pdf_url); if (!r.ok) throw new Error('Could not download the PDF (' + r.status + ')');
      blob = await r.blob();
    }
    setSplit(x, 'Reading pages…');
    if (/page images missing/.test(x.now)) return pagesOnly(x, blob);
    const pages = await BalitaExtract.extractPdf(blob, ({ n, total }) => setSplit(x, `Reading page ${n} of ${total}…`));
    if (!$('split-ai').checked) return prepareOnly(x, blob, pages);
    setSplit(x, 'The AI is finding the articles…');
    const plan = await call('plan', { pages: pages.map((p) => ({ n: p.n, text: p.text })) });
    const arts = (plan.articles || []).filter((a) => a.from && a.to);
    if (!arts.length) throw new Error('The AI could not find articles in this PDF');
    const { issue } = await call('start', { issue_no: no, issue_date: x.i.issue_date, page_count: pages.length, source: 'legacy' });
    const publishBack = (fields) => call('legacy-finish', { issue_id: issue.id, fields: Object.assign({ issue_date: x.i.issue_date }, fields || {}) });
    try {
      const v = Date.now().toString(36);
      const files = [];
      pages.forEach((p) => {
        files.push({ name: `pages/page-${String(p.n).padStart(3, '0')}-${v}.jpg`, blob: p.thumbBlob, kind: 'page' });
        p.photos.forEach((ph) => files.push({ name: `photos/${ph.id}-${v}.jpg`, blob: ph.blob, photo: ph, kind: 'photo' }));
      });
      files.push({ name: `cover-${v}.jpg`, blob: await BalitaExtract.coverFrom(pages[0]), kind: 'cover' });
      if (!x.onSite && blob.size <= 49 * 1048576) files.push({ name: `balita-${no}-${v}.pdf`, blob, kind: 'pdf' });
      await uploadAll(no, files, (n) => setSplit(x, `Saving ${n} of ${files.length} pages and photos…`));
      const pathOf = new Map(files.filter((f) => f.photo).map((f) => [f.photo.id, f.path]));
      let done = 0, flagged = 0, failed = 0;
      await pool(arts.map((a, i) => [a, i]), 3, async ([a, i]) => {
        const groups = splitParts(pages.filter((p) => p.n >= a.from && p.n <= a.to));
        try {
          const parts = [];
          for (let k = 0; k < groups.length; k++) {
            const g = groups[k];
            const photos = g.flatMap((p) => p.photos.map((ph) => ({ id: ph.id, page: ph.page, path: pathOf.get(ph.id), width: ph.width, height: ph.height, preview: ph.preview })));
            let res, err;
            for (let attempt = 0; attempt < 2 && !res; attempt++) {
              try { res = await call('clean-part', { article: a, part: k, parts: groups.length, pages: g.map((p) => ({ n: p.n, text: p.text })), photos }); } catch (e) { err = e; }
            }
            if (!res) throw err;
            parts.push(res);
          }
          const saved = await call('save-draft', { issue_id: issue.id, sort: i, article: a, parts });
          if (saved.flag) flagged++;
        } catch (e) { if (e.auth) throw e; failed++; }
        done++; setSplit(x, `Writing articles: ${done} of ${arts.length}…`);
      });
      const pdf = files.find((f) => f.kind === 'pdf');
      await call('finish', { issue_id: issue.id, fields: { meeting: plan.issue && plan.issue.meeting, summary: plan.issue && plan.issue.summary, ...(plan.issue && plan.issue.guest ? { guest: plan.issue.guest } : {}) } });
      await publishBack({ cover_path: files.find((f) => f.kind === 'cover').path, pages: files.filter((f) => f.kind === 'page').map((f) => f.path), page_count: pages.length, search_text: pages.map((p) => p.text || '').join('\n\n').slice(0, 400000), ...(pdf ? { pdf_url: `${SB}/storage/v1/object/public/rcm/${pdf.path}` } : {}) });
      return `Done ✓ ${arts.length - failed} articles` + (flagged ? ` · ${flagged} to look at (open it under Recent issues)` : '') + (failed ? ` · ${failed} could not be written` : '');
    } catch (err) {
      try { await publishBack(); } catch (e) { /* keep the first error */ }
      throw err;
    }
  }
  // Issues whose articles and photos are already done but have no page images: add the pages and text only.
  async function pagesOnly(x, blob) {
    const no = x.i.issue_no;
    const pages = await BalitaExtract.extractPdf(blob, ({ n, total }) => setSplit(x, `Reading page ${n} of ${total}…`), { pagesOnly: true });
    const { issue } = await call('start', { issue_no: no, issue_date: x.i.issue_date, page_count: pages.length, source: 'legacy', keep: true });
    const v = Date.now().toString(36);
    const files = pages.map((p) => ({ name: `pages/page-${String(p.n).padStart(3, '0')}-${v}.jpg`, blob: p.thumbBlob, kind: 'page' }));
    files.push({ name: `cover-${v}.jpg`, blob: await BalitaExtract.coverFrom(pages[0]), kind: 'cover' });
    await uploadAll(no, files, (n) => setSplit(x, `Saving ${n} of ${files.length} pages…`));
    await call('legacy-finish', { issue_id: issue.id, fields: { issue_date: x.i.issue_date, cover_path: files.find((f) => f.kind === 'cover').path, pages: files.filter((f) => f.kind === 'page').map((f) => f.path), page_count: pages.length, search_text: pages.map((p) => p.text || '').join('\n\n').slice(0, 400000) } });
    return `Done ✓ ${pages.length} pages added`;
  }
  // Without the website's AI: save pages, photos and the page text; the articles are then written in the Claude chat.
  async function prepareOnly(x, blob, pages) {
    const no = x.i.issue_no;
    const { issue } = await call('start', { issue_no: no, issue_date: x.i.issue_date, page_count: pages.length, source: 'legacy', keep: true });
    const v = Date.now().toString(36);
    const files = [];
    pages.forEach((p) => {
      files.push({ name: `pages/page-${String(p.n).padStart(3, '0')}-${v}.jpg`, blob: p.thumbBlob, kind: 'page' });
      p.photos.forEach((ph) => files.push({ name: `photos/${ph.id}-${v}.jpg`, blob: ph.blob, photo: ph, kind: 'photo' }));
    });
    files.push({ name: `cover-${v}.jpg`, blob: await BalitaExtract.coverFrom(pages[0]), kind: 'cover' });
    if (!x.onSite && blob.size <= 49 * 1048576) files.push({ name: `balita-${no}-${v}.pdf`, blob, kind: 'pdf' });
    await uploadAll(no, files, (n) => setSplit(x, `Saving ${n} of ${files.length} pages and photos…`));
    const pdf = files.find((f) => f.kind === 'pdf');
    await call('legacy-finish', { issue_id: issue.id, fields: { issue_date: x.i.issue_date, cover_path: files.find((f) => f.kind === 'cover').path, pages: files.filter((f) => f.kind === 'page').map((f) => f.path), page_count: pages.length, search_text: pages.map((p) => p.text || '').join('\n\n').slice(0, 400000), ...(pdf ? { pdf_url: `${SB}/storage/v1/object/public/rcm/${pdf.path}` } : {}) } });
    const manifest = { issue_no: no, v, pages: pages.map((p) => ({ n: p.n, text: p.text || '' })), photos: files.filter((f) => f.photo).map((f) => ({ id: f.photo.id, page: f.photo.page, path: f.path, width: f.photo.width, height: f.photo.height })) };
    const r = await fetch(SB + '/functions/v1/rcm-legacy-copy', { method: 'POST', headers: { 'content-type': 'application/json', apikey: PUB }, body: JSON.stringify({ code, manifest }) });
    if (!r.ok) throw new Error('Could not save the page text (' + r.status + ')');
    return `Pages and ${manifest.photos.length} photos saved ✓ · articles to be written in the Claude chat`;
  }
  $('split-start').onclick = async () => {
    const btn = $('split-start'); btn.disabled = true; $('split-load').disabled = true;
    let ok = 0, bad = 0;
    for (const x of splitQ) {
      if (!x.on || /^Done/.test(x.state)) continue;
      try { setSplit(x, await splitOne(x)); ok++; x.on = false; }
      catch (err) { if (err.auth) { btn.disabled = false; return show('v-login'); } setSplit(x, 'Failed: ' + err.message); bad++; }
    }
    $('split-sum').textContent = `${ok} finished${bad ? `, ${bad} need attention` : ''}.`;
    btn.disabled = false; $('split-load').disabled = false; openHomeList();
  };

  // ---------- review ----------
  let R = { issue: null, articles: [], sel: 0 };
  function toLocalInput(d) {
    const z = new Date(d.getTime() + 8 * 3600 * 1000); return z.toISOString().slice(0, 16);
  }
  function defaultGoLive(issue) {
    if (issue.publish_at) return new Date(issue.publish_at);
    if (issue.issue_date) { const d = new Date(issue.issue_date + 'T12:00:00+08:00'); if (d > new Date()) return d; }
    return new Date(Date.now() + 5 * 60000);
  }
  async function openReview(id) {
    show('v-review');
    $('editor').innerHTML = '<p class="muted">Loading…</p>';
    try {
      const d = await call('get', { issue_id: id });
      R = { issue: d.issue, articles: d.articles || [], sel: 0 };
      { const em = document.getElementById('th-email'); if (em) em.href = `/balita/${d.issue.issue_no}/email`; }
      $('pub-at').value = toLocalInput(defaultGoLive(d.issue));
      renderReview();
      if (d.issue.status === 'scheduled' || d.issue.status === 'published') showPublished();
      else $('published').classList.add('hidden');
      cardFor = ''; loadHeyzine();
    } catch (err) { if (err.auth) return show('v-login'); $('editor').innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  }
  // Turn internal photo ids (p004-1) in the AI's note into "Photo 2", matching the numbers on the photo tiles.
  function plainFlag(a) {
    const ids = (a.photos || []).map((p) => p.id);
    return String(a.flag || '').replace(/\(?\b(?:p(\d{3})-(\d+))(?:\s*(?:through|to|–|-)\s*p\d{3}-\d+)?\)?/g, (m, pg) => {
      const range = /\s/.test(m.replace(/[()]/g, '').trim());
      const k = ids.indexOf(m.replace(/[()]/g, '').split(/\s/)[0]);
      const x = range ? 'the photos on PDF page ' + Number(pg) : k >= 0 ? 'Photo ' + (k + 1) : 'a photo on PDF page ' + Number(pg);
      return m.startsWith('(') ? '(' + x + ')' : x;
    });
  }
  // The first included photo leads the article; it is never placed inside the text.
  function isTop(a, k) { return (a.photos || []).findIndex((p) => p.include !== false) === k; }
  // The article's text with a photo marker wherever a photo shows. Photos placed by hand keep their line; the rest are
  // shown where the website spreads them (the same rule as the website), so the editor sees and can move every one.
  function bodyWithPhotos(a, everyPhoto) {
    const photos = a.photos || [];
    const idx = (path) => photos.findIndex((p) => p.path === path);
    const rest = photos.map((p, k) => ({ p, k })).filter(({ p, k }) => p.include !== false && !isTop(a, k));
    const restPaths = new Set(rest.map((x) => x.p.path));
    const all = (a.body || []).filter((b) => b && (b.t === 'img' ? restPaths.has(b.path) : b.text));
    const placed = new Set(all.filter((b) => b.t === 'img').map((b) => b.path));
    const auto = rest.filter((x) => !placed.has(x.p.path));
    const textCount = all.filter((b) => b.t !== 'img').length;
    const every = auto.length ? Math.max(2, Math.floor(textCount / (auto.length + 1))) : 0;
    const out = []; let pi = 0, ti = 0;
    all.forEach((b) => {
      if (b.t === 'img') { out.push({ t: 'img', n: idx(b.path) + 1 }); return; }
      out.push(b); ti++;
      if (every && ti % every === 0 && pi < auto.length && ti < textCount) out.push({ t: 'img', n: auto[pi++].k + 1 });
    });
    // Photos left over go at the end (three or more show as a grid on the website, so leave those unmarked).
    const left = auto.slice(pi); if (everyPhoto || left.length < 3) left.forEach((x) => out.push({ t: 'img', n: x.k + 1 }));
    return out;
  }
  // ---------- "Where the photos go": the article as a list of paragraphs and photos, rearranged by click, drag or arrows ----------
  let arrPick = -1;
  function arrSeq(a) {
    const cur = readEditor(a);
    return bodyWithPhotos({ photos: cur.photos, body: cur.body }, true);
  }
  function arrWrite(a, seq) {
    $('e-body').value = seq.map((b) => b.t === 'img' ? `[Photo ${b.n}]` : (b.t === 'h' ? '## ' : b.t === 'q' ? '> ' : '') + b.text).join('\n\n');
    drawArrange(); schedulePreview(true);
    $('e-msg').textContent = 'Photos moved. Click Save changes to keep it.';
  }
  function arrMove(a, n, gap) {
    // gap = position in the sequence (0 = before the first paragraph) where the photo should go
    const seq = arrSeq(a); const from = seq.findIndex((b) => b.t === 'img' && b.n === n); if (from < 0) return;
    const [item] = seq.splice(from, 1); if (gap > from) gap--;
    seq.splice(Math.max(0, Math.min(seq.length, gap)), 0, item);
    arrPick = -1; arrWrite(a, seq);
  }
  function arrStep(a, n, dir) {
    // Move one paragraph up or down (photos next to each other swap places).
    const seq = arrSeq(a); const at = seq.findIndex((b) => b.t === 'img' && b.n === n); if (at < 0) return;
    const to = at + dir; if (to < 0 || to >= seq.length) return;
    [seq[at], seq[to]] = [seq[to], seq[at]]; arrWrite(a, seq);
  }
  const STOP = new Set('the and for with from that this his her their our its was were are has have had into onto upon rotarian rotarians star club rotary manila quarter photo award awards presents presented receives received during year best'.split(' '));
  const words = (t) => new Set(String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z]{3,}/g)?.filter((w) => !STOP.has(w)) || []);
  function arrMatch(a) {
    const seq = arrSeq(a); const photos = readEditor(a).photos;
    const texts = seq.filter((b) => b.t !== 'img');
    let moved = 0;
    const keep = seq.filter((b) => b.t !== 'img'); const placed = new Map(); const unmatched = [];
    seq.forEach((b, i) => {
      if (b.t !== 'img') return;
      const cap = words(photos[b.n - 1] && photos[b.n - 1].caption);
      let best = null, score = 0;
      if (cap.size) texts.forEach((t) => { const w = words(t.text); let sc = 0; cap.forEach((x) => { if (w.has(x)) sc++; }); if (sc > score) { score = sc; best = t; } });
      if (best && score >= 2) { if (!placed.has(best)) placed.set(best, []); placed.get(best).push(b); moved++; }
      else { const prev = seq.slice(0, i).reverse().find((x) => x.t !== 'img'); unmatched.push({ b, after: prev || null }); }
    });
    if (!moved) { $('e-msg').textContent = 'No captions matched the text. Type a caption with the person’s name, or move the photos by hand.'; return; }
    const out = [];
    unmatched.filter((u) => !u.after).forEach((u) => out.push(u.b));
    keep.forEach((t) => { out.push(t); (placed.get(t) || []).forEach((b) => out.push(b)); unmatched.filter((u) => u.after === t).forEach((u) => out.push(u.b)); });
    arrWrite(a, out);
    $('e-msg').textContent = `Placed ${moved} photo${moved === 1 ? '' : 's'} under the paragraph that names the same people. Check the preview, then Save changes.`;
  }
  function drawArrange() {
    const box = $('arr'); const a = R.articles[R.sel]; if (!box || !a) return;
    const seq = arrSeq(a); const photos = readEditor(a).photos;
    const top = photos.findIndex((p) => p.include !== false);
    const gap = (g) => arrPick >= 0 ? `<button type="button" class="arr-gap on" data-gap="${g}">Put Photo ${arrPick} here</button>` : `<div class="arr-gap" data-gap="${g}"></div>`;
    let h = top >= 0 ? `<div class="arr-top"><img src="${imgUrl(photos[top].path, 200)}" alt=""><span><b>Photo ${top + 1}</b>Top of the article<small>Use “Make first” above to change it</small></span></div>` : '';
    seq.forEach((b, i) => {
      h += gap(i);
      if (b.t === 'img') {
        const p = photos[b.n - 1] || {};
        h += `<div class="arr-ph${arrPick === b.n ? ' picked' : ''}" draggable="true" data-pick="${b.n}"><img src="${imgUrl(p.path, 200)}" alt=""><span><b>Photo ${b.n}</b>${p.caption ? esc(p.caption) : '<i>No caption</i>'}</span><span class="arr-ud"><button type="button" class="smallbtn" data-up="${b.n}" aria-label="Move photo ${b.n} up">↑</button><button type="button" class="smallbtn" data-dn="${b.n}" aria-label="Move photo ${b.n} down">↓</button></span></div>`;
      } else h += `<div class="arr-p${b.t === 'h' ? ' h' : ''}">${esc(b.text.length > 220 ? b.text.slice(0, 220) + '…' : b.text)}</div>`;
    });
    h += gap(seq.length);
    box.innerHTML = h || '<p class="muted">No text yet.</p>';
    $('arr-help').innerHTML = arrPick >= 0 ? `Now click <b>Put Photo ${arrPick} here</b> under the paragraph it belongs with. <button type="button" class="smallbtn" data-cancel="1">Cancel</button>` : 'Click a photo, then click <b>Put it here</b> where it belongs. You can also drag a photo, or use the ↑ ↓ arrows.';
  }
  function isLive() { return R.issue && R.issue.status === 'published'; }
  function statusOf(a) { if (!a.included) return ['Left out', 'off']; if (a.checked) return ['Checked', 'ok']; if (a.flag) return ['Needs a look', 'flag']; return ['To check', 'wait']; }
  function renderReview() {
    if (R.issue) setTimeout(() => { try { $('msg').textContent = shareMessage(); } catch (e) {} }, 0);
    const { issue, articles } = R;
    $('rv-sub').textContent = `Issue ${issue.issue_no} · ${issue.issue_date || ''}`;
    const checked = articles.filter((a) => a.checked || !a.included).length;
    $('rv-count').textContent = `${checked} of ${articles.length} articles checked`;
    $('rlist').innerHTML = articles.map((a, i) => { const s = statusOf(a); return `<li><button type="button" data-i="${i}" aria-current="${i === R.sel}"><b>${esc(a.title)}</b><span class="tag ${s[1]}" style="align-self:flex-start">${s[0]}</span></button></li>`; }).join('');
    const a = articles[R.sel]; if (!a) { $('editor').innerHTML = '<p class="muted">No articles.</p>'; return; }
    const pages = (issue.pages || []).slice((a.page_from || 1) - 1, a.page_to || a.page_from || 1);
    $('pp').textContent = a.printed_pages || `PDF pages ${a.page_from}–${a.page_to}`;
    $('printed').innerHTML = pages.map((p) => `<img src="${imgUrl(p, 900)}" alt="Printed page" loading="lazy">`).join('') || '<p class="muted">No page images.</p>';
    const bodyText = bodyWithPhotos(a).map((b) => b.t === 'img' ? `[Photo ${b.n}]` : (b.t === 'h' ? '## ' : b.t === 'q' ? '> ' : '') + b.text).join('\n\n');
    const inText = new Set(bodyWithPhotos(a).filter((b) => b.t === 'img').map((b) => b.n - 1));
    $('editor').innerHTML = `
${isLive() ? `<div class="okbox" style="padding:12px 14px">This issue is live. Changes you save here show on the website within a minute. <a href="/balita/${R.issue.issue_no}/${esc(a.slug)}" target="_blank" rel="noopener">View this article on the website ↗</a></div>` : ''}
${a.flag ? `<div class="note stack" role="note" style="gap:8px"><div><strong>The AI asks you to check:</strong> ${esc(plainFlag(a))}</div><div class="muted" style="color:#5c3a00">To fix it, change the headline, text or photo captions below. Compare with the “As printed” tab beside the preview.</div><div class="row"><button class="btn btn-blue" type="button" id="f-done" style="padding:8px 14px">Done, it's correct now</button></div></div>` : ''}
<label class="f" for="e-title">Headline<input id="e-title" type="text" value="${esc(a.title)}"></label>
<label class="f" for="e-dek">Summary shown when shared<textarea id="e-dek" style="min-height:64px">${esc(a.dek || '')}</textarea></label>
<div class="row"><label class="f" for="e-byline" style="flex:1">Byline<input id="e-byline" type="text" value="${esc(a.byline || '')}"></label><label class="f" for="e-kicker" style="flex:1">Section label<input id="e-kicker" type="text" value="${esc(a.kicker || '')}"></label></div>
<div class="stack" style="gap:8px"><strong style="font-size:14px;color:var(--ink-2)">Photos — the first one included leads the article</strong>
<div class="pgrid">${(a.photos || []).map((p, k) => `<div class="pcell ${p.include === false ? 'off' : ''}"><strong style="font-size:13px">Photo ${k + 1}${p.include === false ? ' · left out' : k === 0 || (a.photos || []).slice(0, k).every((x) => x.include === false) ? ' · top of article' : inText.has(k) ? ' · in the text' : ''}</strong><img src="${imgUrl(p.path, 320)}" alt=""><textarea data-cap="${k}" aria-label="Caption for photo ${k + 1}" placeholder="Caption (optional)">${esc(p.caption || '')}</textarea><div class="row"><button class="smallbtn" type="button" data-tog="${k}">${p.include === false ? 'Include' : 'Leave out'}</button>${k > 0 ? `<button class="smallbtn" type="button" data-lead="${k}">Make first</button>` : ''}<button class="smallbtn" type="button" data-crop="${k}">Crop</button>${p.orig_path ? `<button class="smallbtn" type="button" data-uncrop="${k}">Undo crop</button>` : p.pdf_cut_old ? `<button class="smallbtn" type="button" data-unrecut="${k}" title="Go back to the photo as first cut from the page">Use old cut</button>` : ''}</div></div>`).join('') || '<p class="muted">No photos for this article.</p>'}</div></div>
<div class="arr-wrap stack" style="gap:8px"><div class="row" style="justify-content:space-between;align-items:center"><strong style="font-size:16px;color:var(--ink-2)">Where the photos go</strong><button class="smallbtn" type="button" id="arr-match" title="Puts each photo under the paragraph that mentions the same names as its caption">Match photos to captions</button></div>
<p class="muted" style="margin:0;font-size:14px" id="arr-help">Click a photo, then click <b>Put it here</b> where it belongs. You can also drag a photo, or use the ↑ ↓ arrows.</p>
<div id="arr" class="arr" aria-label="Article layout"></div></div>
<label class="f" for="e-body">Text <span class="muted" style="font-weight:400">(blank line between paragraphs; start a line with ## for a subheading; a [Photo 5] line is where that photo shows)</span><textarea id="e-body" style="min-height:320px">${esc(bodyText)}</textarea></label>
<div class="row" style="justify-content:space-between">
<div class="row"><button class="smallbtn" type="button" id="e-incl">${a.included ? 'Leave out of website' : 'Put back on website'}</button><button class="smallbtn" type="button" id="e-lead">${a.lead ? '★ Featured on homepage' : 'Feature on homepage'}</button></div>
<div class="row"><button class="btn btn-line" style="color:var(--blue)" type="button" id="e-save">Save changes</button><button class="btn btn-blue" type="button" id="e-ok">Looks right ✓</button></div>
</div><p id="e-msg" class="muted" aria-live="polite"></p>`;
    arrPick = -1; drawArrange();
    schedulePreview(true);
  }
  function readEditor(a) {
    const MARK = /^\s*\[\s*photo\s*(\d+)\s*\]\s*$/i, seen = new Set();
    // A [Photo N] line puts that photo there; it may sit on its own line inside a paragraph, so split those out.
    const chunks = [];
    $('e-body').value.split(/\n\s*\n/).forEach((c) => { let buf = []; c.split('\n').forEach((l) => { if (MARK.test(l)) { if (buf.length) chunks.push(buf.join('\n')); buf = []; chunks.push(l.trim()); } else buf.push(l); }); if (buf.length) chunks.push(buf.join('\n')); });
    const blocks = chunks.map((s) => s.trim()).filter(Boolean).map((s) => {
      const m = s.match(MARK);
      if (m) { const ph = (a.photos || [])[Number(m[1]) - 1]; if (!ph || seen.has(ph.path)) return null; seen.add(ph.path); return { t: 'img', path: ph.path, text: '' }; }
      return s.startsWith('## ') ? { t: 'h', text: s.slice(3).trim() } : s.startsWith('> ') ? { t: 'q', text: s.slice(2).trim() } : { t: 'p', text: s };
    }).filter(Boolean);
    const photos = (a.photos || []).map((p, k) => Object.assign({}, p, { caption: (document.querySelector(`[data-cap="${k}"]`) || {}).value ?? p.caption }));
    return { title: $('e-title').value.trim() || a.title, dek: $('e-dek').value.trim(), byline: $('e-byline').value.trim() || null, kicker: $('e-kicker').value.trim(), body: blocks, photos };
  }
  async function save(extra) {
    const a = R.articles[R.sel];
    const fields = Object.assign(readEditor(a), extra || {});
    $('e-msg').textContent = 'Saving…';
    try {
      const { article } = await call('save-article', { id: a.id, fields });
      if (fields.lead) R.articles.forEach((x) => { x.lead = false; });
      R.articles[R.sel] = article; renderReview(); $('e-msg').textContent = isLive() ? 'Saved. The website will show it within a minute.' : 'Saved.';
    } catch (err) { $('e-msg').textContent = err.message; }
  }
  $('rlist').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (!b) return; R.sel = Number(b.getAttribute('data-i')); renderReview(); });
  $('editor').addEventListener('click', (e) => {
    const a = R.articles[R.sel]; if (!a) return;
    const t = e.target.closest('[data-tog]'), l = e.target.closest('[data-lead]');
    if (t) { const k = +t.getAttribute('data-tog'); const cur = readEditor(a); cur.photos[k].include = cur.photos[k].include === false; Object.assign(a, cur); renderReview(); return; }
    if (l) { const k = +l.getAttribute('data-lead'); const cur = readEditor(a); cur.photos.unshift(cur.photos.splice(k, 1)[0]); Object.assign(a, cur); renderReview(); return; }
    const up = e.target.closest('[data-up]'), dn = e.target.closest('[data-dn]'), gp = e.target.closest('button[data-gap]'), pk = e.target.closest('[data-pick]');
    if (up) { arrStep(a, +up.getAttribute('data-up'), -1); return; }
    if (dn) { arrStep(a, +dn.getAttribute('data-dn'), 1); return; }
    if (gp) { arrMove(a, arrPick, +gp.getAttribute('data-gap')); return; }
    if (e.target.closest('[data-cancel]')) { arrPick = -1; drawArrange(); return; }
    if (pk) { const n = +pk.getAttribute('data-pick'); arrPick = arrPick === n ? -1 : n; drawArrange(); return; }
    if (e.target.id === 'arr-match') { arrMatch(a); return; }
    const cr = e.target.closest('[data-crop]'), uc = e.target.closest('[data-uncrop]');
    if (cr) { openCrop(a, +cr.getAttribute('data-crop')); return; }
    const ur = e.target.closest('[data-unrecut]');
    if (ur) { const k = +ur.getAttribute('data-unrecut'); const cur = readEditor(a); const ph = cur.photos[k]; ph.path = ph.pdf_cut_old; delete ph.pdf_cut_old; delete ph.width; delete ph.height; Object.assign(a, cur); save(); return; }
    if (uc) {
      const k = +uc.getAttribute('data-uncrop'); const cur = readEditor(a); const ph = cur.photos[k];
      Object.assign(ph, { path: ph.orig_path, width: ph.orig_width || ph.width, height: ph.orig_height || ph.height }); delete ph.orig_path; delete ph.orig_width; delete ph.orig_height;
      if (ph.thumb && ph.card && ph.card.manual) { delete ph.card; delete ph.thumb; }
      Object.assign(a, cur); save(); return;
    }
    if (e.target.id === 'e-save') save();
    if (e.target.id === 'f-done') { save({ flag: null, checked: true }); return; }
    if (e.target.id === 'e-ok') save({ checked: true, flag: null }).then(() => { const next = R.articles.findIndex((x, i) => i > R.sel && !x.checked && x.included); if (next >= 0) { R.sel = next; renderReview(); } });
    if (e.target.id === 'e-incl') save({ included: !a.included });
    if (e.target.id === 'e-lead') save({ lead: true });
  });
  // ---------- crop a photo by hand: drag the box over the part to keep ----------
  function openCrop(a, k) {
    const cur = readEditor(a); Object.assign(a, cur);
    const ph = a.photos[k]; const src = ph.orig_path || ph.path;
    const dlg = document.createElement('dialog'); dlg.className = 'crop-dlg';
    dlg.innerHTML = `<h2>Crop photo ${k + 1}</h2><p class="muted">Drag the box to move it, and drag its corners to resize. Keep only the photograph: no page text, captions or borders.</p>
<div class="crop-stage"><img alt="" crossorigin="anonymous"><div class="crop-box"><i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div></div>
<div class="row" style="margin-top:12px"><button class="btn btn-blue" type="button" data-c="ok">Use this crop</button><button class="btn btn-line" type="button" data-c="all">Whole photo</button><button class="btn btn-line" type="button" data-c="x">Cancel</button><span class="muted" data-c="msg"></span></div>`;
    document.body.appendChild(dlg); dlg.showModal();
    const im = dlg.querySelector('img'), box = dlg.querySelector('.crop-box'), msg = dlg.querySelector('[data-c="msg"]');
    let r = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };            // crop box as fractions of the photo
    const draw = () => { box.style.left = r.x * 100 + '%'; box.style.top = r.y * 100 + '%'; box.style.width = r.w * 100 + '%'; box.style.height = r.h * 100 + '%'; };
    im.onload = draw; im.onerror = () => { msg.textContent = 'Could not load the photo.'; };
    im.src = `${SB}/storage/v1/object/public/rcm/${src.split('/').map(encodeURIComponent).join('/')}`;
    let drag = null;
    box.addEventListener('pointerdown', (e) => { e.preventDefault(); box.setPointerCapture(e.pointerId); const b = im.getBoundingClientRect(); drag = { h: e.target.getAttribute('data-h') || 'move', x0: e.clientX, y0: e.clientY, r0: Object.assign({}, r), W: b.width, H: b.height }; });
    box.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.x0) / drag.W, dy = (e.clientY - drag.y0) / drag.H, o = drag.r0, M = 0.05;
      let { x, y, w, h } = o;
      if (drag.h === 'move') { x = Math.min(Math.max(0, o.x + dx), 1 - o.w); y = Math.min(Math.max(0, o.y + dy), 1 - o.h); }
      else {
        if (drag.h.includes('w')) { x = Math.min(Math.max(0, o.x + dx), o.x + o.w - M); w = o.x + o.w - x; }
        if (drag.h.includes('e')) { w = Math.min(Math.max(M, o.w + dx), 1 - o.x); }
        if (drag.h.includes('n')) { y = Math.min(Math.max(0, o.y + dy), o.y + o.h - M); h = o.y + o.h - y; }
        if (drag.h.includes('s')) { h = Math.min(Math.max(M, o.h + dy), 1 - o.y); }
      }
      r = { x, y, w, h }; draw();
    });
    box.addEventListener('pointerup', () => { drag = null; });
    const close = () => { dlg.close(); dlg.remove(); };
    dlg.addEventListener('click', async (e) => {
      const c = e.target.getAttribute && e.target.getAttribute('data-c');
      if (c === 'x') close();
      if (c === 'all') { r = { x: 0, y: 0, w: 1, h: 1 }; draw(); }
      if (c !== 'ok') return;
      e.target.disabled = true; msg.textContent = 'Saving the crop…';
      try {
        const NW = im.naturalWidth, NH = im.naturalHeight;
        let sw = Math.round(r.w * NW), sh = Math.round(r.h * NH); const sx = Math.round(r.x * NW), sy = Math.round(r.y * NH);
        const k2 = Math.min(1, 1800 / sw); const cv = document.createElement('canvas'); cv.width = Math.round(sw * k2); cv.height = Math.round(sh * k2);
        cv.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
        const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.88));
        const f = { name: `photos/crop-${a.id.slice(0, 8)}-${Date.now().toString(36)}.jpg`, blob };
        await uploadAll(R.issue.issue_no, [f], () => {});
        const cur2 = readEditor(a); const p2 = cur2.photos[k];
        if (!p2.orig_path) Object.assign(p2, { orig_path: p2.path, orig_width: p2.width, orig_height: p2.height });
        Object.assign(p2, { path: f.path, width: cv.width, height: cv.height });
        // The hand-cropped photo also becomes the story's card photo if it already was, or if the story has none.
        const hasCard = cur2.photos.some((x) => x.thumb && x.card);
        if (p2.thumb || !hasCard) { cur2.photos.forEach((x) => { delete x.thumb; delete x.card; }); p2.thumb = true; p2.card = { path: f.path, width: cv.width, height: cv.height, manual: true }; p2.include = true; }
        Object.assign(a, cur2); close(); save();
      } catch (err) { msg.textContent = err.message || 'Could not save the crop.'; e.target.disabled = false; }
    });
  }
  // ---------- live preview: the website's own page, rendered from what is in the form ----------
  let pvMode = 'web', pvTimer = null, pvSeq = 0;
  function fitPreview() {
    const box = $('pv-frame'), f = $('pv'); if (!box || !f) return;
    if (pvMode === 'phone') { box.classList.add('phone'); f.style.width = '390px'; f.style.height = '100%'; f.style.transform = ''; return; }
    box.classList.remove('phone');
    const W = Math.max(box.clientWidth, 1000), k = box.clientWidth / W;
    f.style.width = W + 'px'; f.style.height = (box.clientHeight / k) + 'px'; f.style.transform = `scale(${k})`;
  }
  function schedulePreview(now) { clearTimeout(pvTimer); $('pv-state').textContent = 'Updating…'; pvTimer = setTimeout(renderPreview, now ? 0 : 700); }
  async function renderPreview() {
    const a = R.articles[R.sel]; if (!a || !$('e-body')) return;
    const seq = ++pvSeq;
    const article = Object.assign({}, a, readEditor(a));
    try {
      const r = await fetch('/api/page?r=preview', { method: 'POST', headers: { 'content-type': 'application/json', 'x-editor-code': code }, body: JSON.stringify({ issue: R.issue, article, others: R.articles.filter((x) => x.id !== a.id).map((x) => ({ id: x.id, slug: x.slug, title: x.title, photos: (x.photos || []).slice(0, 1), included: x.included })) }) });
      const html = await r.text();
      if (seq !== pvSeq) return;
      if (!r.ok) throw new Error(html.slice(0, 120));
      const f = $('pv'), y = f.contentWindow ? f.contentWindow.scrollY : 0;
      f.onload = () => { try { f.contentWindow.scrollTo(0, y); } catch (e) {} };
      f.srcdoc = html; fitPreview();
      $('pv-state').textContent = 'Up to date';
    } catch (err) { if (seq === pvSeq) $('pv-state').textContent = 'Preview not available: ' + err.message; }
  }
  document.querySelector('.pv-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pv]'); if (!b) return;
    pvMode = b.getAttribute('data-pv');
    document.querySelectorAll('[data-pv]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const print = pvMode === 'print';
    $('pv-frame').classList.toggle('hidden', print); $('printed-wrap').classList.toggle('hidden', !print);
    if (!print) fitPreview();
  });
  window.addEventListener('resize', fitPreview);
  $('editor').addEventListener('input', (e) => { schedulePreview(); if (e.target.id === 'e-body' || e.target.hasAttribute('data-cap')) { clearTimeout(arrT); arrT = setTimeout(drawArrange, 500); } });
  let arrT = 0, dragN = -1;
  $('editor').addEventListener('dragstart', (e) => { const p = e.target.closest && e.target.closest('[data-pick]'); if (!p) return; dragN = +p.getAttribute('data-pick'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(dragN)); } catch (x) {} $('arr').classList.add('dragging'); });
  $('editor').addEventListener('dragend', () => { dragN = -1; const b = $('arr'); if (b) { b.classList.remove('dragging'); b.querySelectorAll('.over').forEach((x) => x.classList.remove('over')); } });
  $('editor').addEventListener('dragover', (e) => { if (dragN < 0) return; const t = e.target.closest && (e.target.closest('[data-gap]') || e.target.closest('.arr-p,.arr-ph')); if (!t) return; e.preventDefault(); $('arr').querySelectorAll('.over').forEach((x) => x.classList.remove('over')); const g = t.matches('[data-gap]') ? t : t.nextElementSibling; if (g) g.classList.add('over'); });
  $('editor').addEventListener('drop', (e) => { if (dragN < 0) return; const t = e.target.closest && (e.target.closest('[data-gap]') || e.target.closest('.arr-p,.arr-ph')); if (!t) return; e.preventDefault(); const g = t.matches('[data-gap]') ? t : t.nextElementSibling; const a = R.articles[R.sel]; if (g && a) arrMove(a, dragN, +g.getAttribute('data-gap')); dragN = -1; });
  async function publish(at) {
    try {
      const { issue } = await call('publish', { issue_id: R.issue.id, publish_at: at });
      R.issue = issue; showPublished();
    } catch (err) { alertBox(err.message); }
  }
  function alertBox(m) { const p = $('published'); p.classList.remove('hidden'); p.innerHTML = `<p class="err">${esc(m)}</p>`; }
  $('btn-schedule').onclick = () => { const v = $('pub-at').value; if (!v) return; publish(new Date(v + ':00+08:00').toISOString()); };
  $('btn-now').onclick = () => publish(null);
  function showPublished() {
    const i = R.issue;
    const live = i.status === 'published';
    const when = new Date(i.publish_at).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
    const p = $('published'); p.classList.remove('hidden');
    p.innerHTML = `<strong style="color:#1d7a46;text-transform:uppercase;letter-spacing:.08em;font-size:14px">${live ? 'Live now' : 'Scheduled'}</strong>
<h2 style="font-size:24px">${live ? `Issue ${i.issue_no} is live on the website` : `Issue ${i.issue_no} goes live ${esc(when)}`}</h2>
<p class="muted" style="margin:0">The message and picture for Viber are just below.</p>
<div class="row">${live ? `<a class="btn btn-line" style="color:var(--blue)" href="/balita/${i.issue_no}" target="_blank" rel="noopener">Open the issue page</a>` : ''}<button class="smallbtn" type="button" id="unpub">${live ? 'Take offline' : 'Cancel schedule'}</button></div>`;
    $('unpub').onclick = async () => { try { const { issue } = await call('unpublish', { issue_id: i.id }); R.issue = issue; $('published').classList.add('hidden'); renderShare(); } catch (e) { alertBox(e.message); } };
    renderShare();
  }

  // ---------- share on Viber: the Heyzine link, a ready message, and a picture of the cover ----------
  const SITE = 'https://rcmanila.org';
  const LIB = SB + '/functions/v1/rcm-library';
  document.addEventListener('click', async (e) => {
    if (!e.target || e.target.id !== 'th-pick' || !R || !R.issue) return;
    const b = e.target, m = document.getElementById('th-msg');
    b.disabled = true; m.textContent = 'Starting…';
    const call = async (action) => {
      const r = await fetch(SB + '/functions/v1/rcm-thumbs', { method: 'POST', headers: { 'content-type': 'application/json', 'x-editor-code': code, apikey: PUB }, body: JSON.stringify({ action, issue_id: R.issue.id }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || ('Error ' + r.status));
      return d;
    };
    try {
      const s = await call('issue');
      if (!s.started) { m.textContent = 'No stories with photos in this issue.'; return; }
      // The photos are chosen in the background, one story at a time (about half a minute each).
      for (;;) {
        await new Promise((res) => setTimeout(res, 5000));
        const st = await call('status');
        if (st.finished) { m.textContent = `Done. Clean card photos chosen for ${st.cards} of ${st.total} stories. The rest show the Club logo card.`; break; }
        if (Date.now() - Date.parse(st.at) > 180000) { m.textContent = `Stopped at ${st.done} of ${st.total}. Click the button again to retry.`; break; }
        m.textContent = `Picking photos… ${st.done} of ${st.total} stories (about ${Math.max(1, Math.ceil((st.total - st.done) / 2))} min left). You can keep working.`;
      }
    } catch (err) { m.textContent = err.message; } finally { b.disabled = false; }
  });
  // Re-cut: read an issue's PDF again with the clean photo reader and swap in the clean copies.
  // Photos the editor cropped by hand are left alone. Returns how many photos were replaced.
  async function recutIssue(file, issue, articles, say) {
    const want = new Set();
    articles.forEach((a) => (a.photos || []).forEach((p) => { if (p.id && !p.orig_path) want.add(p.id); }));
    if (!want.size) return { n: 0, articles };
    const pages = await BalitaExtract.extractPdf(file, (p) => say(`reading page ${p.n} of ${p.total}…`), { recut: true, only: want });
    const ts = Date.now().toString(36);
    const files = pages.flatMap((pg) => pg.photos).map((ph) => ({ name: `photos/${ph.id}-clean-${ts}.jpg`, blob: ph.blob, id: ph.id, width: ph.width, height: ph.height }));
    if (!files.length) throw new Error('this PDF does not seem to match the issue (no photos found to replace)');
    await uploadAll(issue.issue_no, files, (d) => say(`saving clean photos… ${d} of ${files.length}`));
    const byId = new Map(files.map((f) => [f.id, f]));
    let n = 0; const out = articles.slice();
    for (let i = 0; i < out.length; i++) {
      const a = out[i]; let changed = false;
      const photos = (a.photos || []).map((p) => {
        const f = byId.get(p.id); if (!f || p.orig_path) return p;
        changed = true; n++;
        return Object.assign({}, p, { path: f.path, width: f.width, height: f.height, pdf_cut_old: p.pdf_cut_old || p.path });
      });
      if (changed) { const { article } = await call('save-article', { id: a.id, fields: { photos } }); out[i] = article; }
    }
    return { n, articles: out };
  }
  function pickCards(issueId) {
    return fetch(SB + '/functions/v1/rcm-thumbs', { method: 'POST', headers: { 'content-type': 'application/json', 'x-editor-code': code, apikey: PUB }, body: JSON.stringify({ action: 'issue', issue_id: issueId }) }).catch(() => {});
  }
  document.addEventListener('click', (e) => { if (e.target && e.target.id === 'th-recut') document.getElementById('th-recut-file').click(); });
  document.addEventListener('change', async (e) => {
    if (!e.target || e.target.id !== 'th-recut-file' || !R || !R.issue) return;
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    const m = document.getElementById('th-msg'), b = document.getElementById('th-recut'); b.disabled = true;
    try {
      const r = await recutIssue(file, R.issue, R.articles, (t) => { m.textContent = t; });
      R.articles = r.articles; renderReview();
      if (!r.n) { m.textContent = 'No photos to re-cut.'; return; }
      m.textContent = `Replaced ${r.n} photos with clean copies. Now picking card photos…`;
      document.getElementById('th-pick').click();
    } catch (err) { m.textContent = err.message || 'Could not re-cut the photos.'; } finally { b.disabled = false; }
  });
  // Home page: clean up past issues in one go. Choose several PDFs at once; each is matched to its issue
  // by the issue number printed inside it.
  document.addEventListener('change', async (e) => {
    if (!e.target || e.target.id !== 'rc-files') return;
    const files = [...e.target.files]; e.target.value = ''; if (!files.length) return;
    const log = $('rc-log'), btn = $('rc-btn'); btn.disabled = true; log.innerHTML = '';
    const line = (txt) => { const li = document.createElement('li'); li.textContent = txt; log.appendChild(li); return li; };
    try {
      const { issues } = await call('issues');
      const byNo = new Map((issues || []).map((i) => [Number(i.issue_no), i]));
      let total = 0;
      for (const f of files) {
        const li = line(`${f.name}: checking…`);
        try {
          let meta = {}; try { meta = guessMeta((await BalitaExtract.peek(f)).text, f.name); } catch (err) { meta = guessMeta('', f.name); }
          const iss = meta.no && byNo.get(Number(meta.no));
          if (!iss) { li.textContent = `${f.name}: skipped, could not find its issue on the site${meta.no ? ' (No. ' + meta.no + ')' : ''}.`; continue; }
          const say = (t) => { li.textContent = `Issue ${iss.issue_no}: ${t}`; };
          const { issue, articles } = await call('get', { issue_id: iss.id });
          const r = await recutIssue(f, issue, articles || [], say);
          total += r.n;
          if (r.n) { pickCards(issue.id); say(`done, ${r.n} photos replaced. Card photos are being picked in the background.`); }
          else say('nothing to replace (no photos from the PDF, or all cropped by hand).');
        } catch (err) { li.textContent = `${f.name}: ${err.message || 'failed'}`; }
      }
      line(`Finished. ${total} photos replaced in total.`);
    } catch (err) { line(err.message || 'Something went wrong.'); } finally { btn.disabled = false; }
  });
  document.addEventListener('click', (e) => { if (e.target && e.target.id === 'rc-btn') $('rc-files').click(); });
  async function libCall(action, payload) {
    const r = await fetch(LIB, { method: 'POST', headers: { 'content-type': 'application/json', 'x-editor-code': code, apikey: PUB }, body: JSON.stringify(Object.assign({ action }, payload || {})) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error || ('Error ' + r.status));
    return d;
  }
  // Short on purpose: Viber shows the link's preview card above it, so the message only needs the essentials.
  function shareMessage() {
    const i = R.issue; if (!i) return '';
    const day = i.issue_date ? new Date(i.issue_date + 'T12:00:00+08:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' }) : '';
    const guest = i.guest ? i.guest.split(/[,;(]/)[0].trim() : '';
    // Viber can't turn a title into a link, so each story gets a short link (rcmanila.org/b/<issue>/<n>) under it.
    const live = R.articles.filter((a) => a.included).sort((a, b) => a.sort - b.sort);
    const top = live.map((a, k) => ({ a, n: k + 1 })).sort((x, y) => (y.a.lead - x.a.lead) || (x.n - y.n)).slice(0, 5);
    const lines = [`📰 *Balita No. ${i.issue_no}*${day ? ' · ' + day : ''}`];
    if (guest) lines.push(`Guest speaker: ${guest}`);
    lines.push('', `Read the issue: ${SITE}/balita/${i.issue_no}`);
    if (top.length) { lines.push('', '*In this issue*'); for (const { a, n } of top) lines.push(`▸ ${a.title}`, `${SITE}/b/${i.issue_no}/${n}`); }
    lines.push('', '📜 *This week in Club history*', `${SITE}/history-week`);
    return lines.join('\n');
  }
  // Wide picture (1200×630) that Viber, Facebook and Messenger show when the issue link is shared.
  // Saved as issues/<no>/share.jpg; the issue page points its preview to it.
  let wideFor = '';
  async function saveWideShare() {
    const i = R.issue; if (!i || !i.cover_path) return;
    const key = i.id + '|' + i.cover_path + '|' + (i.updated_at || '') + '|' + (i.guest || '');
    if (key === wideFor) return;
    const c = document.createElement('canvas'), W = 1200, H = 630; c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#17458f'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#f7a81b'; x.fillRect(0, H - 10, W, 10);
    const im = await loadImg(imgUrl(i.cover_path, 900) + '&v=' + Date.parse(i.updated_at || 0));
    const ch = H - 90, cw = im.width * ch / im.height, cx = 60, cy = 40;
    x.save(); x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 30; x.shadowOffsetY = 12; x.fillStyle = '#fff'; x.fillRect(cx, cy, cw, ch); x.restore();
    x.drawImage(im, cx, cy, cw, ch);
    const tx = cx + cw + 56, tw = W - tx - 56;
    try { const logo = await loadImg('/assets/club-logo-white.png'); const lh = 62, lw = logo.width * lh / logo.height; x.drawImage(logo, tx, 64, lw, lh); } catch (e) {}
    const day = i.issue_date ? new Date(i.issue_date + 'T12:00:00+08:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' }) : '';
    x.fillStyle = '#f7a81b'; x.font = '800 24px "Open Sans", Arial, sans-serif'; x.fillText('THE BALITA · NEW ISSUE', tx, 196);
    x.fillStyle = '#fff'; x.font = '700 64px Georgia, "Times New Roman", serif'; x.fillText(`No. ${i.issue_no}`, tx, 270, tw);
    x.fillStyle = '#dbe8f5'; x.font = '600 30px "Open Sans", Arial, sans-serif'; x.fillText(day, tx, 318, tw);
    let y = 392;
    if (i.guest) {
      x.fillStyle = '#f7a81b'; x.font = '700 22px "Open Sans", Arial, sans-serif'; x.fillText('GUEST SPEAKER', tx, y); y += 40;
      x.fillStyle = '#fff'; x.font = '700 32px "Open Sans", Arial, sans-serif';
      for (const ln of wrapLines(x, i.guest.split(/[,;(]/)[0].trim(), tw).slice(0, 2)) { x.fillText(ln, tx, y); y += 42; }
    }
    x.fillStyle = '#dbe8f5'; x.font = '600 26px "Open Sans", Arial, sans-serif'; x.fillText('rcmanila.org', tx, H - 52);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.88));
    await uploadAll(i.issue_no, [{ name: 'share.jpg', blob }], () => {});
    wideFor = key;
  }
  let cardBlob = null, cardFor = '';
  function loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = rej; im.src = src; }); }
  function wrapLines(ctx, text, maxW) { const out = []; let line = ''; for (const w of String(text).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }
  async function drawCard() {
    const i = R.issue; if (!i) return;
    const key = i.id + '|' + (i.cover_path || '') + '|' + (i.updated_at || '') + '|' + (i.guest || '');
    if (key === cardFor && cardBlob) return;
    const c = $('card'), x = c.getContext('2d'), W = 1080, H = 1350;
    x.fillStyle = '#17458f'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#f7a81b'; x.fillRect(0, H - 330, W, 8);
    try { const logo = await loadImg('/assets/club-logo-white.png'); const lh = 70, lw = logo.width * lh / logo.height; x.drawImage(logo, 60, 50, lw, lh); } catch (e) {}
    x.fillStyle = '#f7a81b'; x.font = '800 26px "Open Sans", Arial, sans-serif'; x.textAlign = 'right'; x.fillText('NEW ISSUE', W - 60, 96); x.textAlign = 'left';
    if (i.cover_path) {
      try {
        const im = await loadImg(imgUrl(i.cover_path, 1200) + '&v=' + Date.parse(i.updated_at || 0));
        const boxT = 160, boxH = H - 330 - 40 - boxT, boxW = W - 120;
        const sc = Math.min(boxW / im.width, boxH / im.height), dw = im.width * sc, dh = im.height * sc, dx = (W - dw) / 2, dy = boxT + (boxH - dh) / 2;
        x.save(); x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 40; x.shadowOffsetY = 16; x.fillStyle = '#fff'; x.fillRect(dx, dy, dw, dh); x.restore();
        x.drawImage(im, dx, dy, dw, dh);
      } catch (e) {}
    }
    const day = i.issue_date ? new Date(i.issue_date + 'T12:00:00+08:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' }) : '';
    x.fillStyle = '#fff'; x.font = '700 64px Georgia, "Times New Roman", serif'; x.fillText(`Balita No. ${i.issue_no}`, 60, H - 230);
    x.fillStyle = '#f7a81b'; x.font = '700 32px "Open Sans", Arial, sans-serif'; x.fillText(day + (i.guest ? '  ·  ' + i.guest : ''), 60, H - 175, W - 120);
    x.fillStyle = '#dbe8f5'; x.font = '600 30px "Open Sans", Arial, sans-serif'; x.fillText(`Read it at rcmanila.org/balita/${i.issue_no}`, 60, H - 100, W - 120);
    cardBlob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9)); cardFor = key;
  }
  function renderShare() {
    const i = R.issue; if (!i) return;
    const live = i.status === 'published';
    $('share-note').textContent = live ? '' : 'The links work once the issue is live.';
    $('msg').textContent = shareMessage();
    drawCard().catch(() => {});
    saveWideShare().catch(() => {});
  }
  async function loadHeyzine() {
    R.hz = null; $('hz').value = ''; $('hz-msg').textContent = '';
    try { const d = await libCall('issue-heyzine', { issue_id: R.issue.id }); R.hz = d.heyzine_url; $('hz').value = R.hz || ''; } catch (e) { $('hz-msg').textContent = e.message; }
    renderShare();
  }
  $('hz-save').onclick = async () => {
    $('hz-msg').textContent = 'Saving…';
    try { const d = await libCall('issue-heyzine', { issue_id: R.issue.id, url: $('hz').value.trim() }); R.hz = d.heyzine_url; $('hz').value = R.hz || ''; $('hz-msg').textContent = R.hz ? 'Saved. The issue page now shows a “Flip through the magazine” button.' : 'Removed.'; renderShare(); }
    catch (e) { $('hz-msg').textContent = e.message; }
  };
  async function copyText(t) { try { await navigator.clipboard.writeText(t); return true; } catch (e) { const r = document.createRange(); r.selectNodeContents($('msg')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); return false; } }
  $('copy-msg').onclick = async () => { const ok = await copyText(shareMessage()); $('copy-msg').textContent = ok ? 'Copied' : 'Selected: press copy'; setTimeout(() => { $('copy-msg').textContent = 'Copy message'; }, 2500); };
  $('dl-card').onclick = async () => { await drawCard(); if (!cardBlob) return; const a = document.createElement('a'); a.href = URL.createObjectURL(cardBlob); a.download = `balita-${R.issue.issue_no}.jpg`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
  $('share-go').onclick = async () => {
    const msg = shareMessage(); await copyText(msg); await drawCard();
    const file = cardBlob ? new File([cardBlob], `balita-${R.issue.issue_no}.jpg`, { type: 'image/jpeg' }) : null;
    try {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: msg });
      else if (navigator.share) await navigator.share({ text: msg });
      else { $('share-go').textContent = 'Message copied: download the picture and paste in Viber'; setTimeout(() => { $('share-go').textContent = 'Share picture and message…'; }, 4000); }
    } catch (e) { /* the person closed the share menu */ }
  };
  $('back-home').onclick = openHome;
  $('del-issue').onclick = async () => {
    if (!R.issue) return;
    if (!window.confirm(`Delete Balita issue ${R.issue.issue_no} from the website? Its articles, pages and photos will be removed. You can upload the PDF again afterwards.`)) return;
    try { await call('delete-issue', { issue_id: R.issue.id }); openHome(); } catch (e) { alertBox(e.message); }
  };

  if (code) call('login').then(openHome).catch(() => show('v-login')); else show('v-login');
})();

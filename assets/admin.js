(function () {
  const SB = 'https://unavxknqpibxwcoqemaf.supabase.co';
  const FN = SB + '/functions/v1/rcm-admin';
  const PUB = 'sb_publishable_zebFaErs-sjDwYWQUMfq3g_VuF2DTI6';
  const $ = (id) => document.getElementById(id);
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
    return openHomeList();
  }
  async function openHomeList() {
    try {
      const { issues } = await call('issues');
      $('issues').innerHTML = issues.length ? issues.map((i) => {
        const s = STATUS[i.status] || [i.status, 'wait'];
        const when = i.status === 'scheduled' && i.publish_at ? ' · goes live ' + new Date(i.publish_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }) : '';
        return `<li>${i.cover_path ? `<img src="${imgUrl(i.cover_path, 140)}&v=${Date.parse(i.updated_at || 0)}" alt="" style="object-position:right top">` : '<img alt="">'}<div style="flex:1"><b>Issue ${i.issue_no}</b><br><span class="muted">${esc(i.issue_date || '')}${esc(when)}</span></div><span class="tag ${s[1]}">${s[0]}</span><button class="smallbtn" data-open="${i.id}" type="button">${i.status === 'published' ? 'Edit' : 'Check and publish'}</button>${i.status === 'published' || i.status === 'scheduled' ? `<a class="smallbtn" href="/balita/${i.issue_no}" target="_blank" rel="noopener">View</a>` : ''}</li>`;
      }).join('') : '<li class="muted">No issues yet. Upload the first one above.</li>';
    } catch (err) {
      if (err.auth) return show('v-login');
      $('issues').innerHTML = `<li class="err">${esc(err.message)}</li>`;
    }
  }
  $('issues').addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) openReview(b.getAttribute('data-open')); });

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
        if (it.f.size <= 19.5 * 1048576) files.push({ name: `balita-${no}-${v}.pdf`, blob: it.f, kind: 'pdf' });
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
      $('pub-at').value = toLocalInput(defaultGoLive(d.issue));
      renderReview();
      if (d.issue.status === 'scheduled' || d.issue.status === 'published') showPublished();
      else $('published').classList.add('hidden');
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
  function isLive() { return R.issue && R.issue.status === 'published'; }
  function statusOf(a) { if (!a.included) return ['Left out', 'off']; if (a.checked) return ['Checked', 'ok']; if (a.flag) return ['Needs a look', 'flag']; return ['To check', 'wait']; }
  function renderReview() {
    const { issue, articles } = R;
    $('rv-sub').textContent = `Issue ${issue.issue_no} · ${issue.issue_date || ''}`;
    const checked = articles.filter((a) => a.checked || !a.included).length;
    $('rv-count').textContent = `${checked} of ${articles.length} articles checked`;
    $('rlist').innerHTML = articles.map((a, i) => { const s = statusOf(a); return `<li><button type="button" data-i="${i}" aria-current="${i === R.sel}"><b>${esc(a.title)}</b><span class="tag ${s[1]}" style="align-self:flex-start">${s[0]}</span></button></li>`; }).join('');
    const a = articles[R.sel]; if (!a) { $('editor').innerHTML = '<p class="muted">No articles.</p>'; return; }
    const pages = (issue.pages || []).slice((a.page_from || 1) - 1, a.page_to || a.page_from || 1);
    $('pp').textContent = a.printed_pages || `PDF pages ${a.page_from}–${a.page_to}`;
    $('printed').innerHTML = pages.map((p) => `<img src="${imgUrl(p, 900)}" alt="Printed page" loading="lazy">`).join('') || '<p class="muted">No page images.</p>';
    const bodyText = (a.body || []).map((b) => (b.t === 'h' ? '## ' : b.t === 'q' ? '> ' : '') + b.text).join('\n\n');
    $('editor').innerHTML = `
${isLive() ? `<div class="okbox" style="padding:12px 14px">This issue is live. Changes you save here show on the website within a minute. <a href="/balita/${R.issue.issue_no}/${esc(a.slug)}" target="_blank" rel="noopener">View this article on the website ↗</a></div>` : ''}
${a.flag ? `<div class="note stack" role="note" style="gap:8px"><div><strong>The AI asks you to check:</strong> ${esc(plainFlag(a))}</div><div class="muted" style="color:#5c3a00">To fix it, change the headline, text or photo captions below. Compare with the “As printed” tab beside the preview.</div><div class="row"><button class="btn btn-blue" type="button" id="f-done" style="padding:8px 14px">Done, it's correct now</button></div></div>` : ''}
<label class="f" for="e-title">Headline<input id="e-title" type="text" value="${esc(a.title)}"></label>
<label class="f" for="e-dek">Summary shown when shared<textarea id="e-dek" style="min-height:64px">${esc(a.dek || '')}</textarea></label>
<div class="row"><label class="f" for="e-byline" style="flex:1">Byline<input id="e-byline" type="text" value="${esc(a.byline || '')}"></label><label class="f" for="e-kicker" style="flex:1">Section label<input id="e-kicker" type="text" value="${esc(a.kicker || '')}"></label></div>
<div class="stack" style="gap:8px"><strong style="font-size:14px;color:var(--ink-2)">Photos — the first one included leads the article</strong>
<div class="pgrid">${(a.photos || []).map((p, k) => `<div class="pcell ${p.include === false ? 'off' : ''}"><strong style="font-size:13px">Photo ${k + 1}${p.include === false ? ' · left out' : k === 0 || (a.photos || []).slice(0, k).every((x) => x.include === false) ? ' · top of article' : ''}</strong><img src="${imgUrl(p.path, 320)}" alt=""><textarea data-cap="${k}" aria-label="Caption for photo ${k + 1}" placeholder="Caption (optional)">${esc(p.caption || '')}</textarea><div class="row"><button class="smallbtn" type="button" data-tog="${k}">${p.include === false ? 'Include' : 'Leave out'}</button>${k > 0 ? `<button class="smallbtn" type="button" data-lead="${k}">Make first</button>` : ''}</div></div>`).join('') || '<p class="muted">No photos for this article.</p>'}</div></div>
<label class="f" for="e-body">Text <span class="muted" style="font-weight:400">(blank line between paragraphs; start a line with ## for a subheading)</span><textarea id="e-body" style="min-height:320px">${esc(bodyText)}</textarea></label>
<div class="row" style="justify-content:space-between">
<div class="row"><button class="smallbtn" type="button" id="e-incl">${a.included ? 'Leave out of website' : 'Put back on website'}</button><button class="smallbtn" type="button" id="e-lead">${a.lead ? '★ Featured on homepage' : 'Feature on homepage'}</button></div>
<div class="row"><button class="btn btn-line" style="color:var(--blue)" type="button" id="e-save">Save changes</button><button class="btn btn-blue" type="button" id="e-ok">Looks right ✓</button></div>
</div><p id="e-msg" class="muted" aria-live="polite"></p>`;
    schedulePreview(true);
  }
  function readEditor(a) {
    const blocks = $('e-body').value.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).map((s) => s.startsWith('## ') ? { t: 'h', text: s.slice(3).trim() } : s.startsWith('> ') ? { t: 'q', text: s.slice(2).trim() } : { t: 'p', text: s });
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
    if (e.target.id === 'e-save') save();
    if (e.target.id === 'f-done') { save({ flag: null, checked: true }); return; }
    if (e.target.id === 'e-ok') save({ checked: true, flag: null }).then(() => { const next = R.articles.findIndex((x, i) => i > R.sel && !x.checked && x.included); if (next >= 0) { R.sel = next; renderReview(); } });
    if (e.target.id === 'e-incl') save({ included: !a.included });
    if (e.target.id === 'e-lead') save({ lead: true });
  });
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
  $('editor').addEventListener('input', () => schedulePreview());
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
    const i = R.issue, base = location.origin;
    const live = i.status === 'published';
    const when = new Date(i.publish_at).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
    const top = R.articles.filter((a) => a.included).sort((a, b) => (b.lead - a.lead) || (a.sort - b.sort)).slice(0, 4);
    const msg = `Balita Issue ${i.issue_no} is out. Read it online:\n${base}/balita/${i.issue_no}\n\nIn this issue:\n` + top.map((a) => `• ${a.title}: ${base}/balita/${i.issue_no}/${a.slug}`).join('\n');
    const p = $('published'); p.classList.remove('hidden');
    p.innerHTML = `<strong style="color:#1d7a46;text-transform:uppercase;letter-spacing:.08em;font-size:14px">${live ? 'Live now' : 'Scheduled'}</strong>
<h2 style="font-size:24px">${live ? `Issue ${i.issue_no} is live on the website` : `Issue ${i.issue_no} goes live ${esc(when)}`}</h2>
<div class="sharemsg" id="msg">${esc(msg)}</div>
<div class="row"><button class="btn btn-gold" type="button" id="copy-msg">Copy message for Viber and Facebook</button>${live ? `<a class="btn btn-line" style="color:var(--blue)" href="/balita/${i.issue_no}" target="_blank" rel="noopener">Open the issue page</a>` : ''}<button class="smallbtn" type="button" id="unpub">${live ? 'Take offline' : 'Cancel schedule'}</button></div>`;
    $('copy-msg').onclick = async () => { try { await navigator.clipboard.writeText(msg); $('copy-msg').textContent = 'Copied'; } catch (e) { const r = document.createRange(); r.selectNodeContents($('msg')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } };
    $('unpub').onclick = async () => { try { const { issue } = await call('unpublish', { issue_id: i.id }); R.issue = issue; $('published').classList.add('hidden'); } catch (e) { alertBox(e.message); } };
  }
  $('back-home').onclick = openHome;
  $('del-issue').onclick = async () => {
    if (!R.issue) return;
    if (!window.confirm(`Delete Balita issue ${R.issue.issue_no} from the website? Its articles, pages and photos will be removed. You can upload the PDF again afterwards.`)) return;
    try { await call('delete-issue', { issue_id: R.issue.id }); openHome(); } catch (e) { alertBox(e.message); }
  };

  if (code) call('login').then(openHome).catch(() => show('v-login')); else show('v-login');
})();

/* Heritage Library workshop: turns the Club's private archive (Cloudflare R2 `rcm-archive`) into the public
   library. Runs in the editor's browser: reads originals through short-lived links, makes web copies,
   blanks home addresses, writes the copies to the public bucket and the records to the library tables. */
(function () {
  const SB = 'https://unavxknqpibxwcoqemaf.supabase.co';
  const LIB = SB + '/functions/v1/rcm-library';
  const ADM = SB + '/functions/v1/rcm-admin';
  const PUB = 'sb_publishable_zebFaErs-sjDwYWQUMfq3g_VuF2DTI6';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let code = ''; try { code = sessionStorage.getItem('rcm-library-code') || ''; } catch (e) {} // asks again in each new browser session; separate from the Balita editor's sign-in

  // Text from old PDFs can hold null characters and broken surrogates, which the database refuses; strip them before sending.
  const pgSafe = (v) => typeof v === 'string' ? v.replace(/\u0000/g, '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    : Array.isArray(v) ? v.map(pgSafe) : v && typeof v === 'object' && !(v instanceof Blob) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, pgSafe(x)])) : v;
  async function post(url, action, payload) {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-editor-code': code, apikey: PUB }, body: JSON.stringify(pgSafe(Object.assign({ action }, payload || {}))) });
    const text = await r.text();
    let d; try { d = JSON.parse(text.trim().split('\n').pop()); } catch (e) { throw new Error('The server did not answer properly (' + r.status + ').'); }
    if (r.status === 401) throw Object.assign(new Error(d.error || 'Wrong passcode'), { auth: true });
    if (!r.ok || d.error) throw new Error(d.error || ('Error ' + r.status));
    if ('ok' in d && 'data' in d) { if (!d.ok) throw new Error(d.error); return d.data; }
    return d;
  }
  const call = (a, p) => post(LIB, a, p);
  window.RCMLib = { call, review: (a, p) => post(SB + '/functions/v1/rcm-museum-review', a, p), video: (a, p) => post(SB + '/functions/v1/rcm-video', a, p), code: () => code, show: (v) => show(v), tab: (t) => tab(t) };
  const admin = (a, p) => post(ADM, a, p);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function retry(fn, n = 3) { let e; for (let i = 0; i < n; i++) { try { return await fn(); } catch (x) { e = x; if (x.auth) throw x; await sleep(1500 * (i + 1)); } } throw e; }
  async function pool(items, n, fn, stop) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length && !stop()) { const k = i++; await fn(items[k], k); } })); }

  // ---------- storage helpers ----------
  async function listAll(prefix, bucket) {
    let token = null, out = [];
    do { const r = await retry(() => call('r2-list', { prefix, token, bucket })); out = out.concat(r.keys); token = r.next; } while (token);
    return out;
  }
  async function getUrls(keys) { const out = []; for (let i = 0; i < keys.length; i += 150) out.push(...(await retry(() => call('r2-get', { keys: keys.slice(i, i + 150) }))).urls); return out; }
  async function putFiles(files) { // [{key, blob}]
    const urls = []; for (let i = 0; i < files.length; i += 200) urls.push(...(await retry(() => call('r2-put', { keys: files.slice(i, i + 200).map((f) => f.key) }))).urls);
    await pool(files, 4, async (f, k) => { await retry(async () => { const r = await fetch(urls[k], { method: 'PUT', headers: { 'content-type': f.type || 'image/jpeg', 'cache-control': 'public, max-age=31536000' }, body: f.blob }); if (!r.ok) throw new Error('Could not save ' + f.key + ' (' + r.status + ')'); }); }, () => false);
  }
  const toBlob = (c, q = 0.78) => new Promise((res) => c.toBlob(res, 'image/jpeg', q));
  function scaled(src, maxW, maxH) {
    const w = src.width, h = src.height, k = Math.min(1, maxW / w, (maxH || 1e9) / h);
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height); return c;
  }
  const accOf = (key) => { const m = key.match(/RCM-?0*(\d{1,6})/i); return m ? 'RCM-' + m[1].padStart(6, '0') : null; };
  const preview = (el, blob) => { const i = new Image(); i.src = URL.createObjectURL(blob); el.prepend(i); while (el.children.length > 12) { URL.revokeObjectURL(el.lastChild.src); el.lastChild.remove(); } };

  let CAT = null, RAW = null, STATE = new Map(), VDB = new Map(), DONE = new Map();
  async function catalogue() { if (!CAT) { const d = await (await fetch('/assets/library/catalogue.json')).json(); CAT = new Map(d.map((x) => [x.a, x])); } return CAT; }
  async function rawIndex() {
    if (RAW) return RAW;
    const keys = await listAll('RAW/');
    RAW = new Map();
    for (const k of keys) { const a = accOf(k.key.split('/').pop()); if (!a) continue; (RAW.get(a) || RAW.set(a, []).get(a)).push(k); }
    RAW.all = keys; return RAW;
  }
  async function loadState() { const r = await call('src-list'); STATE = new Map(r.items.map((x) => [x.acc, x])); }
  const setState = (acc, job, state, result) => { STATE.set(acc, { acc, job, state, result }); return call('src-state', { items: [{ acc, job, state, result }] }).catch(() => {}); };
  const stTag = (s) => { const k = !s ? 'wait' : /done|added|skip/i.test(s) ? 'done' : /fail/i.test(s) ? 'fail' : /wait/.test(s) ? 'wait' : 'run'; return `<span class="st ${k}">${esc(s || 'Waiting')}</span>`; };

  // ---------- sign in / overview ----------
  function show(v) { $('v-login').classList.toggle('hidden', v !== 'login'); $('v-main').classList.toggle('hidden', v !== 'main'); }
  $('login-form').onsubmit = async (e) => { e.preventDefault(); code = $('code').value.trim(); try { await call('status'); try { sessionStorage.setItem('rcm-library-code', code); } catch (x) {} open(); } catch (err) { $('login-err').textContent = err.auth ? 'That passcode is not right.' : err.message; $('login-err').classList.remove('hidden'); } };
  async function open() {
    show('main');
    try {
      const s = await call('status');
      $('stats').innerHTML = [['Volumes', s.counts.rcm_lib_volumes], ['Pages', s.counts.rcm_lib_pages], ['Articles', s.counts.rcm_lib_articles], ['Albums', s.counts.rcm_lib_galleries], ['Photos', s.counts.rcm_lib_photos]].map(([l, n]) => `<div class="stat"><b>${(n || 0).toLocaleString('en')}</b>${l}</div>`).join('');
      $('storage').innerHTML = s.storage === 'ok' ? '<span class="ok">Connected to the archive storage.</span>' : `<span class="err">Archive storage not reachable: ${esc(s.storage)}</span>`;
      await loadState();
      tab(current);
    } catch (err) { if (err.auth) return show('login'); $('storage').innerHTML = `<span class="err">${esc(err.message)}</span>`; }
  }
  $('refresh').onclick = open;
  $('signout').onclick = (e) => { e.preventDefault(); try { sessionStorage.removeItem('rcm-library-code'); } catch (x) {} code = ''; $('code').value = ''; show('login'); };
  let current = 'home';
  function tab(t) { current = t; document.querySelectorAll('#tabs [data-t]').forEach((b) => b.setAttribute('aria-current', String(b.getAttribute('data-t') === t))); for (const k of ['home', 'obj', 'vol', 'dig', 'gal', 'held', 'vid', 'browse', 'tl', 'ex', 'tags', 'min']) { const el = $('t-' + k); if (el) el.classList.toggle('hidden', k !== t); } document.dispatchEvent(new CustomEvent('rcmlib:tab', { detail: t })); if (t === 'obj') objList(); if (t === 'vol') volList(); if (t === 'held') heldList(); window.scrollTo(0, 0); }
  $('tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) tab(b.getAttribute('data-t')); };

  // ---------- trophy room ----------
  let OBJ = [], objStop = false;
  async function objList() {
    $('obj-msg').textContent = 'Reading the archive list…';
    try {
      const [cat, raw] = await Promise.all([catalogue(), rawIndex()]);
      OBJ = [];
      for (const [acc, keys] of raw) {
        const c = cat.get(acc); if (!c || !(c.c === 'Plaques & trophies' || c.c === 'Four-Way Test')) continue;
        const img = keys.find((k) => /\.(jpe?g|png|webp)$/i.test(k.key)); if (!img) continue;
        OBJ.push({ acc, c, key: img.key });
      }
      OBJ.sort((a, b) => a.acc.localeCompare(b.acc));
      drawObj(); $('obj-msg').textContent = `${OBJ.length} photographed items; ${OBJ.filter((o) => (STATE.get(o.acc) || {}).state === 'done').length} done.`;
    } catch (err) { if (err.auth) return show('login'); $('obj-msg').textContent = err.message; }
  }
  function drawObj() { $('obj-rows').innerHTML = OBJ.map((o) => `<tr><td>${esc(o.acc)}</td><td>${esc(o.c.d)}</td><td id="os-${o.acc}">${stTag((STATE.get(o.acc) || {}).state)}</td></tr>`).join(''); }
  function objMeta(c) {
    const parts = c.d.split(' — ').map((s) => s.trim()).filter(Boolean);
    let giver = parts.length > 1 ? parts[0].replace(/\.$/, '') : null;
    if (giver && /^rotary club of manila/i.test(giver)) giver = null;
    const title = (parts.length > 1 ? parts.slice(1) : parts).join(' — ').replace(/^\[|\]$/g, '');
    return { title: title.charAt(0).toUpperCase() + title.slice(1), giver, kind: c.t, year: c.y || null };
  }
  $('obj-start').onclick = async () => {
    objStop = false; $('obj-start').disabled = true; $('obj-stop').disabled = false;
    const todo = OBJ.filter((o) => (STATE.get(o.acc) || {}).state !== 'done');
    let done = 0, batch = [];
    const flush = async () => { if (batch.length) { const b = batch; batch = []; await retry(() => call('objects-save', { objects: b })); } };
    try {
      await pool(todo, 3, async (o) => {
        const cell = $('os-' + o.acc); if (cell) cell.innerHTML = stTag('Working…');
        try {
          const [url] = await getUrls([o.key]);
          const bm = await createImageBitmap(await (await fetch(url)).blob());
          const big = scaled(bm, 1400, 1400), th = scaled(bm, 520, 520);
          const bb = await toBlob(big, 0.82), tb = await toBlob(th, 0.8);
          const base = `obj/${o.acc.toLowerCase()}`;
          await putFiles([{ key: base + '.jpg', blob: bb }, { key: base + '-t.jpg', blob: tb }]);
          preview($('obj-prev'), tb);
          batch.push(Object.assign({ acc: o.acc, image_path: base + '.jpg', width: big.width, height: big.height, status: 'draft' }, objMeta(o.c)));
          if (batch.length >= 20) await flush();
          await setState(o.acc, 'object', 'done'); if (cell) cell.innerHTML = stTag('done');
        } catch (err) { if (err.auth) throw err; await setState(o.acc, 'object', 'failed: ' + err.message.slice(0, 80)); if (cell) cell.innerHTML = stTag('failed'); }
        done++; $('obj-bar').style.width = Math.round(done / todo.length * 100) + '%'; $('obj-msg').textContent = `${done} of ${todo.length}`;
      }, () => objStop);
      await flush();
      $('obj-msg').textContent = objStop ? 'Stopped.' : `Finished: ${done} items. Check them, then click “Publish all”.`;
    } catch (err) { if (err.auth) return show('login'); $('obj-msg').textContent = err.message; }
    $('obj-start').disabled = false; $('obj-stop').disabled = true;
  };
  // ---------- trophy room: polish photos and read labels ----------
  let BGR = null;
  async function cutout(url) {
    if (!BGR) BGR = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm');
    return createImageBitmap(await BGR.removeBackground(url, { output: { format: 'image/png' } }));
  }
  function bbox(src, alphaMode) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d'); x.drawImage(src, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
    for (let j = 0; j < H; j += 2) for (let i = 0; i < W; i += 2) { if (d[(j * W + i) * 4 + 3] > 40) { n++; if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; } }
    return { c, x0, y0, x1, y1, share: n / (W * H / 4) };
  }
  // The gallery backdrop: warm off-white with a soft floor shadow, the object standing on it.
  function stage(src, b, S) {
    const o = document.createElement('canvas'); o.width = S; o.height = S; const q = o.getContext('2d');
    const g = q.createRadialGradient(S / 2, S * 0.4, S * 0.05, S / 2, S / 2, S * 0.75); g.addColorStop(0, '#fbfaf7'); g.addColorStop(1, '#e2ded5'); q.fillStyle = g; q.fillRect(0, 0, S, S);
    const pad = 0.09, sc = Math.min(S * (1 - 2 * pad) / (b.x1 - b.x0), S * (1 - 2 * pad - 0.03) / (b.y1 - b.y0));
    const dw = (b.x1 - b.x0) * sc, dh = (b.y1 - b.y0) * sc, dx = (S - dw) / 2, dy = S * (1 - pad) - dh;
    q.save(); q.fillStyle = 'rgba(0,0,0,.18)'; q.filter = 'blur(' + Math.round(S / 100) + 'px)'; q.beginPath(); q.ellipse(S / 2, dy + dh, dw * 0.42, S * 0.018, 0, 0, Math.PI * 2); q.fill(); q.restore();
    q.save(); q.shadowColor = 'rgba(0,0,0,.22)'; q.shadowBlur = S * 0.03; q.shadowOffsetY = S * 0.01; q.drawImage(src, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, dx, dy, dw, dh); q.restore();
    return o;
  }
  const KIND = { Plaque: 'Plaque', Trophy: 'Trophy', Medal: 'Medal', Certificate: 'Certificate', Banner: 'Banner', Flag: 'Flag', Gavel: 'Gavel', Bell: 'Bell', Plate: 'Plate', Figurine: 'Figurine', Book: 'Book', Object: 'Object' };
  const tidyCat = (t) => String(t || '').replace(/\[[^\]]*\]/g, '').replace(/—\s*\d+\s+(plaque|trophy|trophies|medal|banner|gavel|woodblock|certificate)s?\b/gi, '').replace(/\s+—\s*$/, '').replace(/\s{2,}/g, ' ').replace(/^[\s—-]+|[\s—-]+$/g, '').trim();
  $('obj-polish').onclick = async () => {
    objStop = false; $('obj-polish').disabled = true; $('obj-start').disabled = true; $('obj-stop').disabled = false;
    try {
      const [{ objects }, cat] = await Promise.all([call('objects-list'), catalogue()]);
      const todo = objects.filter((o) => !o.polished);
      let done = 0, failed = 0;
      $('obj-msg').textContent = `${todo.length} to polish. The first one takes longer while the cut-out tool loads.`;
      for (const o of todo) {
        if (objStop) break;
        const cell = $('os-' + o.acc); if (cell) cell.innerHTML = stTag('Polishing…');
        try {
          const orig = o.original_path || o.image_path;
          const url = `${ARCH}/${orig}`;
          const readP = retry(() => call('object-read', { image_path: orig, hint: (cat.get(o.acc) || {}).d || o.title })).catch(() => null);
          let src, b;
          try { src = await cutout(url); b = bbox(src); if (b.share < 0.04 || b.x1 - b.x0 < 20) throw new Error('mask'); }
          catch (e) { src = await createImageBitmap(await (await fetch(url)).blob()); b = { x0: 0, y0: 0, x1: src.width, y1: src.height }; }
          const big = stage(src, b, 1200), th = stage(src, b, 480);
          const key = `obj/${o.acc.toLowerCase()}-p.jpg`;
          const [bb, tb] = await Promise.all([toBlob(big, 0.86), toBlob(th, 0.82)]);
          await putFiles([{ key, blob: bb }, { key: key.replace(/\.jpg$/, '-t.jpg'), blob: tb }]);
          preview($('obj-prev'), tb);
          const r = (await readP) || {};
          const kind = KIND[r.kind] || o.kind || 'Object';
          const giver = r.giver || o.giver || null;
          const title = (r.legible && r.title) ? r.title : (giver ? `${kind} from ${giver}` : (tidyCat(o.catalogue_title || o.title) || kind));
          await retry(() => call('objects-save', { objects: [{ acc: o.acc, status: o.status, image_path: key, width: 1200, height: 1200, original_path: orig, catalogue_title: o.catalogue_title || o.title, polished: true, title, giver, kind, year: r.year || o.year || null, recipient: r.recipient || null, inscription: r.inscription || null, note: o.note || null, read_at: !!r.kind, source_group: r.from && r.from !== 'unknown' ? r.from : null }] }));
          done++; if (cell) cell.innerHTML = stTag('done');
        } catch (err) { if (err.auth) return show('login'); failed++; if (cell) cell.innerHTML = stTag('failed: ' + String(err.message).slice(0, 60)); }
        $('obj-bar').style.width = Math.round((done + failed) / todo.length * 100) + '%';
        $('obj-msg').textContent = `Polished ${done} of ${todo.length}${failed ? ` (${failed} failed)` : ''}.`;
      }
      $('obj-msg').textContent = objStop ? 'Stopped. Click again to carry on.' : `Finished: ${done} polished${failed ? `, ${failed} failed` : ''}. Check the trophy room, then click “Publish all”.`;
    } catch (err) { if (err.auth) return show('login'); $('obj-msg').textContent = err.message; }
    $('obj-polish').disabled = false; $('obj-start').disabled = false; $('obj-stop').disabled = true;
  };
  $('obj-stop').onclick = () => { objStop = true; $('obj-msg').textContent = 'Stopping after the current items…'; };
  $('obj-pub').onclick = async () => { try { await call('objects-publish', {}); $('obj-msg').textContent = 'Published. The trophy room now shows them.'; } catch (err) { $('obj-msg').textContent = err.message; } };

  // ---------- bound Balita volumes ----------
  let VOL = [], volStop = false;
  const logv = (t) => { const l = $('vol-log'); l.textContent += t + '\n'; l.scrollTop = l.scrollHeight; };
  async function volList() {
    $('vol-msg').textContent = 'Reading the archive list…';
    try {
      const [cat, raw] = await Promise.all([catalogue(), rawIndex()]);
      const groups = new Map();
      for (const [acc, keys] of raw) {
        const c = cat.get(acc); if (!c || c.c !== 'Balita') continue;
        const pdfs = keys.filter((k) => /\.pdf$/i.test(k.key)); if (!pdfs.length) continue;
        const best = pdfs.sort((a, b) => (/ocr/i.test(b.key) - /ocr/i.test(a.key)) || b.size - a.size)[0];
        const range = c.i || c.d; const g = groups.get(range) || groups.set(range, []).get(range);
        g.push({ acc, c, key: best.key, size: best.size, ocr: /ocr/i.test(best.key) });
      }
      VOL = [];
      for (const [range, list] of groups) {
        list.sort((a, b) => (b.ocr - a.ocr) || (b.size - a.size));
        list.forEach((v, k) => { v.range = range; v.pick = k === 0; v.spare = k > 0; VOL.push(v); });
      }
      VOL.sort((a, b) => (a.c.y || 0) - (b.c.y || 0) || a.acc.localeCompare(b.acc));
      // What is already in the library decides the ticks: published volumes are never re-run by accident,
      // and a volume that stopped part-way continues where it stopped.
      VDB = new Map(); try { (await call('vol-list')).volumes.forEach((x) => VDB.set(x.acc, x)); } catch (e) {}
      DONE = new Map(); try { const d = await window.RCMDash.load('library', code); (d.todo.volumes_draft || []).forEach((x) => DONE.set(x.acc, x.done)); } catch (e) {}
      for (const v of VOL) { const db = VDB.get(v.acc); const st = (STATE.get(v.acc) || {}).state || ''; v.online = !!(db && db.status === 'published'); v.skip = /^skip/.test(st); v.pick = !v.online && !v.spare && !v.skip; }
      // A range already online (another copy is published) needs no spare: tick only ranges with nothing online.
      const onlineRanges = new Set(VOL.filter((v) => v.online).map((v) => v.range));
      for (const v of VOL) if (v.pick && onlineRanges.has(v.range)) v.pick = false;
      drawVol();
      $('vol-msg').textContent = `${groups.size} volumes (${VOL.length} copies). ${VOL.filter((v) => v.online).length} copies are in the library. ${VOL.filter((v) => v.pick).length} ticked to process.`;
    } catch (err) { if (err.auth) return show('login'); $('vol-msg').textContent = err.message; }
  }
  function drawVol() {
    $('vol-rows').innerHTML = VOL.map((v, k) => { const s = (STATE.get(v.acc) || {}).state; return `<tr${v.spare ? ' style="opacity:.6"' : ''}><td><input type="checkbox" data-v="${k}" ${v.pick ? 'checked' : ''}></td><td><b>${esc(v.acc)}</b>${v.spare ? ' <span class="muted">(spare copy)</span>' : ''}<br><span class="muted">${esc(v.c.d.slice(0, 90))}</span></td><td>${esc(v.c.i || '')}</td><td>${(v.size / 1048576).toFixed(0)} MB${v.ocr ? ' · text' : ''}</td><td id="vs-${v.acc}">${stTag(s)}</td></tr>`; }).join('');
  }
  $('vol-rows').onchange = (e) => { const c = e.target.closest('[data-v]'); if (c) VOL[+c.getAttribute('data-v')].pick = c.checked; };
  $('vol-stop').onclick = () => { volStop = true; $('vol-msg').textContent = 'Stopping…'; };
  $('vol-start').onclick = async () => {
    volStop = false; $('vol-start').disabled = true; $('vol-stop').disabled = false;
    const todo = VOL.filter((v) => v.pick);
    for (let k = 0; k < todo.length && !volStop; k++) {
      const v = todo[k]; const cell = $('vs-' + v.acc);
      try { if (cell) cell.innerHTML = stTag('Working…'); const r = await processVolume(v, (t, f) => { $('vol-msg').textContent = `${v.acc} (${k + 1} of ${todo.length}): ${t}`; if (f != null) $('vol-bar').style.width = Math.round(f * 100) + '%'; });
        await setState(v.acc, 'volume', volStop ? 'stopped' : 'done', r); if (cell) cell.innerHTML = stTag(volStop ? 'stopped' : 'done'); logv(`${v.acc}: ${r.pages} pages, ${r.issues} issues, ${r.withheld} withheld, ${r.blanked} with addresses blanked, ${r.ocr} read by machine.`); }
      catch (err) {
        if (err.auth) return show('login');
        await setState(v.acc, 'volume', 'failed: ' + err.message.slice(0, 80)); if (cell) cell.innerHTML = stTag('failed'); logv(`${v.acc}: FAILED ${err.message}`);
        if (/allocation|memory/i.test(err.message)) { logv('The browser ran out of memory. Close other tabs, reload this page and click Process again: it continues where it stopped.'); $('vol-msg').textContent = 'Stopped: the browser ran out of memory. Reload the page and click Process again; it continues where it stopped.'; break; }
      }
    }
    $('vol-start').disabled = false; $('vol-stop').disabled = true; if (!volStop) $('vol-msg').textContent = 'Finished.';
  };

  // Group positioned text pieces into lines (canvas pixels, top-left origin).
  function linesFromText(items, vp) {
    const pcs = items.filter((i) => i.str && i.str.trim()).map((i) => {
      const t = window.pdfjsLib.Util.transform(vp.transform, i.transform);
      const h = Math.hypot(t[2], t[3]) || 10;
      return { x: t[4], y: t[5] - h, w: i.width * vp.scale, h, s: i.str };
    }).sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    for (const p of pcs) {
      const l = lines.find((L) => Math.abs(L.y + L.h / 2 - (p.y + p.h / 2)) < Math.max(L.h, p.h) * 0.55 && (p.x > L.x1 - 5 ? p.x - L.x1 < vp.width * 0.08 : true));
      if (l) { l.parts.push(p); l.x0 = Math.min(l.x0, p.x); l.x1 = Math.max(l.x1, p.x + p.w); l.y = Math.min(l.y, p.y); l.h = Math.max(l.h, p.h); }
      else lines.push({ x0: p.x, x1: p.x + p.w, y: p.y, h: p.h, parts: [p] });
    }
    return lines.map((l) => ({ x0: l.x0, x1: l.x1, y0: l.y, y1: l.y + l.h, t: l.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(' ').replace(/\s+/g, ' ').trim() })).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  }
  let tess = null;
  async function ocr(canvas) {
    if (!tess) {
      if (!window.Tesseract) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the text reader.')); document.head.appendChild(s); });
      tess = await window.Tesseract.createWorker('eng');
    }
    const { data } = await tess.recognize(canvas);
    return (data.lines || []).map((l) => ({ x0: l.bbox.x0, x1: l.bbox.x1, y0: l.bbox.y0, y1: l.bbox.y1, t: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.t);
  }
  const ADDR = /\b(Res\.?|Resid|Residence|Home)\b|\bTel\.?\s*\(?Res/i;
  const STREETS = /\b(St\.|Street|Ave\.?|Avenue|Blvd|Road|Village|Subd|Heights|Forbes|Dasmari|San Juan|Quezon City|Pasay|Makati|Mandaluyong|San Lorenzo|Urdaneta|Bel-?Air)\b/i;
  async function privacy(lines) {
    const hasRes = lines.some((l) => ADDR.test(l.t));
    const streetish = lines.filter((l) => STREETS.test(l.t)).length;
    if (!hasRes && streetish < 4) return { directory: false, remove: [] };
    return retry(() => call('privacy', { lines: lines.map((l) => l.t) }));
  }
  const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
  function findIssue(text, lo, hi) {
    const head = text.slice(0, 700);
    const m = head.match(/\bN[Oo][.,]?\s*(\d{3,4})\b/); if (!m) return null;
    const no = Number(m[1]); if (lo && (no < lo || no > hi)) return null;
    const d = head.match(new RegExp(`(${MONTHS})\\.?\\s+(\\d{1,2}),?\\s+(19\\d\\d|20\\d\\d)`, 'i'));
    let date = null; if (d) { const mm = MONTHS.split('|').findIndex((x) => x.toLowerCase() === d[1].toLowerCase()) + 1; date = `${d[3]}-${String(mm).padStart(2, '0')}-${String(d[2]).padStart(2, '0')}`; }
    return { no, date };
  }

  async function processVolume(v, prog) {
    const acc = v.acc, slug = acc.toLowerCase();
    const [lo, hi] = String(v.c.i || '').split('-').map(Number);
    const yf = v.c.y || null, yt = v.c.y2 || (yf ? yf + 1 : null);
    const years = yf ? (yt && yt !== yf ? `${yf}–${String(yt).slice(2)}` : String(yf)) : '';
    prog('opening the scan…', 0);
    const [url] = await getUrls([v.key]);
    const pdfjs = await window.BalitaExtract.loadPdfJs();
    // Read the scan piece by piece as pages are needed, instead of downloading it whole first (large volumes are 1–2 GB).
    let doc;
    try {
      const head = await fetch(url, { headers: { Range: 'bytes=0-0' } });
      const len = Number((head.headers.get('content-range') || '').split('/')[1]) || v.size;
      if (head.status !== 206 || !len) throw new Error('no ranges');
      const rt = new pdfjs.PDFDataRangeTransport(len, null);
      rt.requestDataRange = (begin, end) => { retry(async () => { const r = await fetch(url, { headers: { Range: `bytes=${begin}-${end - 1}` } }); if (r.status !== 206) throw new Error('The storage did not send part of the file (' + r.status + ').'); rt.onDataRange(begin, new Uint8Array(await r.arrayBuffer())); }).catch((e) => logv(`${acc}: ${e.message}`)); };
      doc = await pdfjs.getDocument({ range: rt, length: len, rangeChunkSize: 2097152, disableAutoFetch: true, disableStream: true, isEvalSupported: false }).promise;
    } catch (e) {
      if (!/no ranges/.test(e.message)) throw e;
      const resp = await fetch(url); if (!resp.ok) throw new Error('Could not download (' + resp.status + ')');
      const data = new Uint8Array(await resp.arrayBuffer());
      doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
    }
    const N = doc.numPages;
    const known = VDB.get(acc);
    const fields = { acc, title: `The Rotary Balita, ${years}`, years, year_from: yf, year_to: yt, issue_from: lo || null, issue_to: hi || null, source_key: v.key, page_count: N };
    const { volume } = known ? await call('vol-save', { id: known.id, fields: known.status === 'published' ? fields : { ...fields, status: 'draft' } }) : await call('vol-save', { fields: { ...fields, status: 'draft' } });
    VDB.set(acc, volume);
    // Continue a volume that stopped part-way: pages already saved are only read for issue numbers.
    const resumeFrom = known && known.status !== 'published' ? Math.max(1, (DONE.get(acc) || 0) - 14) : 1;
    if (resumeFrom > 1) logv(`${acc}: continuing from page ${resumeFrom} of ${N}.`);
    let batch = [], starts = [], withheld = 0, blanked = 0, ocrN = 0, cover = resumeFrom > 1 ? `vol/${slug}/p/0001.jpg` : null;
    for (let n = 1; n <= N; n++) {
      if (volStop) break;
      if (n < resumeFrom) {
        if (n % 10 === 1) prog(`finding issues on saved page ${n} of ${resumeFrom - 1}`, 0.1 * n / resumeFrom);
        try { const pg = await doc.getPage(n); const t = (await pg.getTextContent()).items.map((i) => i.str).join(' '); const iss = findIssue(t, lo, hi); if (iss && !starts.some((x) => x.no === iss.no)) starts.push({ no: iss.no, date: iss.date, n }); pg.cleanup(); } catch (e) {}
        continue;
      }
      prog(`page ${n} of ${N}`, 0.1 + 0.88 * n / N);
      const page = await doc.getPage(n);
      const vp0 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(3, 1500 / vp0.width) });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      let lines = linesFromText((await page.getTextContent()).items, vp);
      if (lines.map((l) => l.t).join('').length < 40) { lines = await ocr(c); ocrN++; }
      const pv = await privacy(lines);
      const rec = { n };
      if (pv.directory) { rec.withheld = true; withheld++; }
      else {
        const rm = new Set(pv.remove);
        if (rm.size) {
          blanked++; const x = c.getContext('2d');
          for (const i of rm) { const l = lines[i]; if (!l) continue; x.fillStyle = '#f4efe2'; x.fillRect(l.x0 - 4, l.y0 - 3, l.x1 - l.x0 + 8, l.y1 - l.y0 + 6); x.fillStyle = '#8a7a58'; x.font = `${Math.max(10, Math.round((l.y1 - l.y0) * 0.55))}px sans-serif`; x.fillText('home address withheld', l.x0, l.y1 - 2); }
          rec.flags = ['home addresses blanked'];
        }
        rec.text = lines.map((l, i) => (rm.has(i) ? '[home address withheld]' : l.t)).join('\n');
        const out = scaled(c, 1400); const blob = await toBlob(out, 0.72);
        const key = `vol/${slug}/p/${String(n).padStart(4, '0')}.jpg`;
        await putFiles([{ key, blob }]);
        Object.assign(rec, { image_path: key, width: out.width, height: out.height });
        if (!cover) cover = key;
        if (n % 5 === 1) preview($('vol-prev'), blob);
        const iss = findIssue(rec.text, lo, hi); if (iss && !starts.some((s) => s.no === iss.no)) starts.push({ no: iss.no, date: iss.date, n });
      }
      batch.push(rec);
      if (batch.length >= 15) { const b = batch; batch = []; await retry(() => call('pages-save', { volume_id: volume.id, pages: b })); }
      page.cleanup();
    }
    if (batch.length) await retry(() => call('pages-save', { volume_id: volume.id, pages: batch }));
    starts.sort((a, b) => a.n - b.n);
    let issues = starts.map((s, k) => ({ issue_no: s.no, issue_date: s.date, start_page: s.n, end_page: (starts[k + 1] ? starts[k + 1].n - 1 : N), cover_page: s.n }));
    if (!issues.length) issues = [{ issue_no: lo || 0, label: years ? `Balita ${years}` : 'Balita', start_page: 1, end_page: N, cover_page: 1 }];
    else if (issues[0].start_page > 1) issues[0].start_page = 1;
    await call('issues-save', { volume_id: volume.id, issues, replace: true });
    await call('vol-save', { id: volume.id, fields: { cover_path: cover, page_count: N, status: $('vol-pub').checked && !volStop ? 'published' : 'draft' } });
    await doc.destroy();
    prog('done', 1);
    return { pages: N, issues: issues.length, withheld, blanked, ocr: ocrN };
  }

  // ---------- digital Balita 2015–2025 → the regular Balita archive ----------
  let DIG = [], digStop = false, ISS = [];
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, arp: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const MONRX = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|a(?:pr|rp)(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const iso = (y, m, d) => (y >= 2014 && y <= 2027 && m >= 1 && m <= 12 && d >= 1 && d <= 31) ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
  function dateFromName(name) {
    const n = name.replace(/\.pdf$/i, '').replace(/_\d{9,}$/, '');
    let m = n.match(new RegExp(MONRX + '\\.?[\\s._-]*(\\d{1,2})(?:st|nd|rd|th)?[,\\s._-]+(20\\d\\d)(?!\\d)', 'i'));
    if (!m) m = n.match(new RegExp(MONRX + '[\\s._-]*(\\d{1,2})(20\\d\\d)(?!\\d)', 'i'));
    return m ? iso(Number(m[3]), MON[m[1].slice(0, 3).toLowerCase()], Number(m[2])) : '';
  }
  function dateFromText(text) {
    const d = text.slice(0, 1500).match(new RegExp(`(${MONTHS})\\.?\\s+(\\d{1,2}),?\\s+(20\\d\\d)`, 'i'));
    return d ? iso(Number(d[3]), MONTHS.split('|').findIndex((x) => x.toLowerCase() === d[1].toLowerCase()) + 1, Number(d[2])) : '';
  }
  // Collapse letter-spaced words ("A U G U S T 2 7 , 2 0 2 0" → "AUGUST27,2020" style runs) so the number and date can be read.
  const despace = (t) => t.replace(/(?:\b\S ){2,}\S\b/g, (m) => m.replace(/ /g, '')).replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/(\d),(\d{4})/g, '$1, $2').replace(/\s+([.,])/g, '$1');
  // The date printed in the masthead (next to "ISSUE NO.") wins over the file name, which is sometimes wrong.
  function mastDate(text, nameDate) {
    const m = text.match(/ISSUE\s*N[Oo]\.?\s*[:#]?\s*\d{4}/i);
    if (m) { const t = dateFromText(text.slice(m.index, m.index + 300)); if (t) return t; }
    const t = dateFromText(text);
    if (!t) return '';
    if (!nameDate) return t;
    return Math.abs(Date.parse(t) - Date.parse(nameDate)) < 40 * 864e5 || t.slice(5) === nameDate.slice(5) ? t : '';
  }
  // Issue numbers run about 40 a year; No. 4013 was 20 June 2024. Used only to reject stray numbers (e.g. District 3810).
  const expectNo = (date) => date ? 4013 + (Date.parse(date) - Date.parse('2024-06-20')) / 864e5 / 7 * 0.8 : null;
  function issueNo(text, date) {
    const head = text.slice(0, 2500);
    const strong = head.match(/ISSUE\s*N[Oo]\.?\s*[:#]?\s*(\d{4})\b/i);
    if (strong && +strong[1] >= 3300 && +strong[1] < 4200) return +strong[1];
    const exp = expectNo(date); let best = null;
    for (const m of head.matchAll(/(.{0,14})\bN[Oo][.,]?\s*(\d{4})\b/g)) {
      const no = +m[2]; if (no < 3300 || no >= 4200 || /district|\bD\.?\s*$/i.test(m[1]) || [3780, 3790, 3800, 3810, 3820, 3830].includes(no)) continue;
      if (exp == null) { if (!best) best = no; continue; }
      if (Math.abs(no - exp) <= 150 && (best == null || Math.abs(no - exp) < Math.abs(best - exp))) best = no;
    }
    return best;
  }
  async function frontOcr(file) {
    const pdfjs = await window.BalitaExtract.loadPdfJs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const page = await doc.getPage(1); const vp0 = page.getViewport({ scale: 1 }); const vp = page.getViewport({ scale: Math.min(3, 1600 / vp0.width) });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    const top = document.createElement('canvas'); top.width = c.width; top.height = Math.round(c.height * 0.4); top.getContext('2d').drawImage(c, 0, 0);
    const lines = await ocr(top); await doc.destroy(); return lines.map((l) => l.t).join('\n');
  }
  $('dig-find').onclick = async () => {
    $('dig-msg').textContent = 'Looking through the archive…';
    try {
      const [raw, legacy, wp] = await Promise.all([rawIndex(), listAll('legacy-pdf/'), listAll('wordpress/meeting-photos/-A/rcmanila.org/wp-content/uploads/')]);
      const cands = raw.all.concat(legacy, wp).filter((k) => /\.pdf$/i.test(k.key) && !accOf(k.key.split('/').pop()) && /balita|newsletter/i.test(k.key.split('/').pop()));
      let have = new Map();
      try { const r = await fetch(`${SB}/rest/v1/rcm_issues?select=issue_no,issue_date&limit=5000`, { headers: { apikey: PUB } }); if (r.ok) { ISS = (await r.json()).filter((x) => x.issue_date); have = new Map(ISS.map((x) => [x.issue_date, x.issue_no])); } } catch (e) {}
      const byDate = new Map(), undated = [], seen = new Set();
      for (const k of cands) {
        const name = k.key.split('/').pop().replace(/^[0-9a-f]{32}_/, '');
        if (seen.has(name.toLowerCase() + k.size)) continue; seen.add(name.toLowerCase() + k.size);
        const d = { key: k.key, size: k.size, name, no: null, date: dateFromName(name), state: '', copies: 1 };
        if (!d.date) { undated.push(d); continue; }
        const cur = byDate.get(d.date);
        if (!cur) { byDate.set(d.date, d); continue; }
        const fits = (x) => x.size <= 19.5 * 1048576;
        const better = (fits(d) && !fits(cur)) || (fits(d) === fits(cur) && (fits(d) ? d.size > cur.size : d.size < cur.size));
        const n = cur.copies + 1; if (better) { d.copies = n; byDate.set(d.date, d); } else cur.copies = n;
      }
      DIG = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).concat(undated.sort((a, b) => a.name.localeCompare(b.name)));
      for (const d of DIG) if (d.date && have.has(d.date)) { d.no = have.get(d.date); d.state = 'Already on the website'; }
      drawDig();
      const todo = DIG.filter((d) => !d.state).length;
      $('dig-msg').textContent = `${DIG.length} issues found (${cands.length} files, duplicates removed). ${DIG.length - todo} already on the website; ${todo} to add. Issue numbers are read from each front page.`;
      $('dig-start').disabled = !todo;
    } catch (err) { if (err.auth) return show('login'); $('dig-msg').textContent = err.message; }
  };
  // For an issue whose number could not be read: the numbers missing between its neighbours tell which one it is.
  function suggestNo(date) {
    if (!date) return null;
    const L = ISS.slice().sort((x, y) => x.issue_date.localeCompare(y.issue_date));
    const prev = [...L].reverse().find((x) => x.issue_date < date), next = L.find((x) => x.issue_date > date);
    if (!prev || !next) return null;
    const nos = new Set(L.map((x) => x.issue_no)), miss = [];
    for (let n = prev.issue_no + 1; n < next.issue_no; n++) if (!nos.has(n)) miss.push(n);
    if (!miss.length) return null; if (miss.length === 1) return miss[0];
    const g = prev.issue_no + Math.round((Date.parse(date) - Date.parse(prev.issue_date)) / 6048e5);
    return miss.includes(g) ? g : null;
  }
  const noCell = (d, k) => /^failed/.test(d.state || '') && d.date
    ? `<input type="number" data-dn="${k}" value="${d.no || suggestNo(d.date) || ''}" style="width:78px;font-size:14px;padding:4px 6px"><br><button class="smallbtn" type="button" data-retry="${k}">Retry</button> <a href="#" data-view="${k}">front page</a>${!d.no && suggestNo(d.date) ? '<br><span class="muted">suggested from the neighbouring issues</span>' : ''}`
    : (d.no || '');
  function drawDig() { $('dig-rows').innerHTML = DIG.map((d, k) => `<tr><td>${esc(d.name)}<br><span class="muted">${(d.size / 1048576).toFixed(1)} MB</span></td><td id="dn-${k}">${noCell(d, k)}</td><td id="dd-${k}">${esc(d.date)}${d.copies > 1 ? `<br><span class="muted">${d.copies} copies</span>` : ''}</td><td id="dst-${k}">${stTag(d.state)}</td></tr>`).join(''); }
  $('dig-rows').onclick = async (e) => {
    const v = e.target.closest('[data-view]');
    if (v) { e.preventDefault(); const [url] = await getUrls([DIG[+v.dataset.view].key]); window.open(url, '_blank', 'noopener'); return; }
    const r = e.target.closest('[data-retry]');
    if (r) { const k = +r.dataset.retry; const n = Number(($('dig-rows').querySelector(`[data-dn="${k}"]`) || {}).value); if (!(n >= 3300 && n < 4200)) { alert('Type the issue number printed on the front page.'); return; } r.disabled = true; await addOne(k, n); drawDig(); }
  };
  const setDig = (k, s) => { DIG[k].state = s; const c = $('dst-' + k); if (c) c.innerHTML = stTag(s); };
  $('dig-stop').onclick = () => { digStop = true; };
  async function addOne(k, forcedNo) {
    const d = DIG[k];
    try {
      setDig(k, 'Downloading…');
      const [url] = await getUrls([d.key]); const blob = await (await fetch(url)).blob(); const f = new File([blob], d.name, { type: 'application/pdf' });
      const pk = await window.BalitaExtract.peek(f);
      if ((pk.text || '').replace(/\s/g, '').length < 60) { setDig(k, 'Reading the front page…'); pk.text = (await frontOcr(f)) + '\n' + (pk.text || ''); }
      const T = despace(pk.text || '') + '\n' + (pk.text || ''); // some mastheads are letter-spaced ("I S S U E  N O . 3 8 3 7")
      const td = mastDate(T, d.date); if (td) d.date = td;
      d.no = forcedNo || issueNo(T, d.date);
      $('dn-' + k).textContent = d.no || '?'; $('dd-' + k).textContent = d.date || '';
      if (!d.no) { setDig(k, 'failed: no issue number on the front page'); return false; }
      const chk = await admin('check-issue', { issue_no: d.no });
      const stuck = chk.exists && chk.status !== 'published'; // an earlier try stopped partway: redo it from the start
      const addPagesOnly = !stuck && chk.exists && chk.source === 'legacy' && !chk.has_pages;
      if (chk.exists && !stuck && !addPagesOnly) { setDig(k, 'Already on the website'); return false; }
      setDig(k, 'Reading pages…');
      const pages = await window.BalitaExtract.extractPdf(f, ({ n, total }) => setDig(k, `Reading page ${n} of ${total}…`), { pagesOnly: true });
      const { issue } = await admin('start', { issue_no: d.no, issue_date: d.date || null, page_count: pages.length, source: 'legacy', keep: addPagesOnly });
      const v = Date.now().toString(36);
      const files = pages.map((p) => ({ name: `pages/page-${String(p.n).padStart(3, '0')}-${v}.jpg`, blob: p.thumbBlob, kind: 'page' }));
      files.push({ name: `cover-${v}.jpg`, blob: await window.BalitaExtract.coverFrom(pages[0]), kind: 'cover' });
      if (f.size <= 19.5 * 1048576) files.push({ name: `balita-${d.no}-${v}.pdf`, blob: f, kind: 'pdf' });
      const signed = []; for (let i = 0; i < files.length; i += 100) signed.push(...(await admin('sign', { issue_no: d.no, names: files.slice(i, i + 100).map((x) => x.name) })).uploads);
      const byName = new Map(signed.map((s) => [s.name, s])); let up = 0;
      await pool(files, 5, async (x) => { const s = byName.get(x.name); const fd = new FormData(); fd.append('cacheControl', '31536000'); fd.append('', x.blob, x.name.split('/').pop()); await retry(async () => { const r = await fetch(s.signedUrl, { method: 'PUT', headers: { 'x-upsert': 'true' }, body: fd }); if (!r.ok) throw new Error('upload ' + r.status); }); x.path = s.path; setDig(k, `Saving ${++up} of ${files.length}…`); }, () => false);
      const text = pages.map((p) => p.text || '').join('\n\n').slice(0, 400000); const pdf = files.find((x) => x.kind === 'pdf');
      await admin('legacy-finish', { issue_id: issue.id, fields: { issue_date: d.date || null, cover_path: files.find((x) => x.kind === 'cover').path, pages: files.filter((x) => x.kind === 'page').map((x) => x.path), page_count: pages.length, search_text: text, pdf_url: pdf ? `${SB}/storage/v1/object/public/rcm/${pdf.path}` : null } });
      setDig(k, 'Added ✓'); ISS.push({ issue_no: d.no, issue_date: d.date }); return true;
    } catch (err) { if (err.auth) { show('login'); return false; } setDig(k, 'failed: ' + err.message.slice(0, 160)); }
    return false;
  }
  $('dig-start').onclick = async () => {
    digStop = false; $('dig-start').disabled = true; $('dig-stop').disabled = false; let added = 0;
    for (let k = 0; k < DIG.length && !digStop; k++) {
      const d = DIG[k]; if (/^(Added|Already)/.test(d.state)) { $('dig-bar').style.width = Math.round((k + 1) / DIG.length * 100) + '%'; continue; }
      if (await addOne(k)) added++;

      $('dig-bar').style.width = Math.round((k + 1) / DIG.length * 100) + '%';
    }
    drawDig(); $('dig-msg').textContent = `${added} issues added.` + (DIG.some((d) => /^failed/.test(d.state || '')) ? ' Rows that failed now have a box for the issue number: check the front page, then Retry.' : ''); $('dig-start').disabled = false; $('dig-stop').disabled = true;
  };

  // ---------- photo galleries (from the old website's crawl) ----------
  let GAL = [], galStop = false;
  const titleCase = (s) => s.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(Rcm|Rc|Ri|Trf|Pe|Dg|Dgn|Pdg|Rcmfi)\b/g, (w) => w.toUpperCase()).replace(/\b(Of|And|The|In|On|At|To|For|With)\b/g, (w, _, i) => i ? w.toLowerCase() : w);
  const SITE = 'wordpress/meeting-photos/-A/rcmanila.org/';
  function slugDate(slug) {
    const t = slug.toLowerCase().replace(/_/g, '-');
    let m = t.match(new RegExp(MONRX + '-(\\d{1,2})(?:st|nd|rd|th)?-?(20\\d\\d)(?!\\d)'));
    if (m) return iso(+m[3], MON[m[1].slice(0, 3)], +m[2]);
    m = t.match(/(20\d\d)-(\d{2})-(\d{2})/); return m ? iso(+m[1], +m[2], +m[3]) : '';
  }
  // Albums likely to show beneficiaries (children, patients, the elderly): processed, but kept back for a person to check.
  const SENSITIVE = /medcap|medical|mission|dental|circumcis|hospital|patient|clinic|asilo|hospicio|orphan|child|kids|youth|school|scholar|student|reap|educational|feeding|relief|yolanda|typhoon|outreach|gift-of-life|christmas-cheer|home-for|elderly|aged|brigade|marawi|leap/i;
  const cleanTitle = (t) => t.replace(/\s*[–|-]\s*Rotary Club of Manila\s*$/i, '').replace(/\s+/g, ' ').trim();
  async function postMeta(key) {
    const [url] = await getUrls([key]); const html = await (await fetch(url)).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const meta = (p) => { const e = doc.querySelector(`meta[property="${p}"],meta[name="${p}"]`); return e ? e.getAttribute('content') || '' : ''; };
    const title = cleanTitle(meta('og:title') || (doc.querySelector('h1.entry-title,h1') || {}).textContent || doc.title || '');
    const pub = (meta('article:published_time') || (doc.querySelector('time[datetime]') || { getAttribute: () => '' }).getAttribute('datetime') || '').slice(0, 10);
    let note = ''; const body = doc.querySelector('.entry-content,article');
    if (body) note = [...body.querySelectorAll('p')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()).filter((t) => t.length > 40)[0] || '';
    return { title, date: /^\d{4}-\d{2}-\d{2}$/.test(pub) ? pub : '', note: note.slice(0, 500) };
  }
  $('gal-find').onclick = async () => {
    $('gal-msg').textContent = 'Looking through the old website’s photo albums…';
    try {
      const all = await listAll('wordpress/');
      const posts = new Set(all.filter((k) => /\/index\.html$/.test(k.key)).map((k) => k.key));
      const keys = all.filter((k) => /\.(jpe?g|png|webp)$/i.test(k.key) && k.size > 30000 && !/-\d{2,4}x\d{2,4}(_c)?\.(jpe?g|png|webp)$/i.test(k.key) && !/\/(thumbs|dynamic|cache)\//i.test(k.key) && !/^thumbs_/i.test(k.key.split('/').pop()) && !/\/wp-content\/uploads\//.test(k.key) && !/\/video\//.test(k.key));
      const groups = new Map();
      for (const k of keys) { const dir = k.key.split('/').slice(0, -1).join('/'); if (dir === 'wordpress' || /\/uploads$/.test(dir)) continue; (groups.get(dir) || groups.set(dir, []).get(dir)).push(k); }
      // The same album can appear twice (the site crawl and a separate "Gallery" copy): keep the fuller one.
      const byName = new Map();
      for (const [dir, ks] of groups) { if (ks.length < 4) continue; const name = dir.split('/').pop().toLowerCase(); const cur = byName.get(name); if (!cur || ks.length > cur.keys.length) byName.set(name, { dir, keys: ks }); }
      GAL = [...byName.values()].map(({ dir, keys }) => {
        const slug = dir.split('/').pop();
        const post = SITE + slug + '/index.html';
        return { dir, slug, keys: keys.sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true })), title: titleCase(slug.replace(/-(gallery|photos)$/i, '')), date: slugDate(slug), note: '', sensitive: SENSITIVE.test(slug), post: posts.has(post) ? post : (posts.has(SITE + slug.toLowerCase() + '/index.html') ? SITE + slug.toLowerCase() + '/index.html' : null), pick: true };
      });
      let n = 0; const withPost = GAL.filter((g) => g.post);
      await pool(withPost, 6, async (g) => { try { const m = await postMeta(g.post); if (m.title) g.title = m.title; if (m.date && !g.date) g.date = m.date; g.note = m.note; } catch (e) {} $('gal-msg').textContent = `Reading the old posts for titles and dates… ${++n} of ${withPost.length}`; }, () => false);
      GAL.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.title.localeCompare(b.title));
      const undated = GAL.filter((g) => !g.date).length;
      $('gal-intro').textContent = `${GAL.length} albums, ${GAL.reduce((s, g) => s + g.keys.length, 0).toLocaleString('en')} photos. Titles and dates come from the old website’s posts where there is one${undated ? `; ${undated} albums have no date yet (type one in, YYYY-MM-DD, or they won’t appear on the century timeline)` : ''}. Untick any album that shouldn’t be public.`;
      $('gal-rows').innerHTML = GAL.map((g, k) => `<tr><td><input type="checkbox" data-g="${k}" checked></td><td><input type="search" data-gt="${k}" value="${esc(g.title)}" style="width:100%;font-size:14px;padding:6px 8px"><br><span class="muted">${esc(g.slug)}${g.post ? '' : ' · no post found'}</span>${g.sensitive ? '<br><span class="st fail">kept back: may show children or patients</span>' : ''}</td><td><input type="search" data-gd="${k}" value="${esc(g.date || '')}" placeholder="YYYY-MM-DD" style="width:120px;font-size:14px;padding:6px 8px"></td><td>${g.keys.length}</td><td id="gs-${k}">${stTag((STATE.get('gal:' + g.dir) || {}).state)}</td></tr>`).join('');
      $('gal-start').disabled = !GAL.length; $('gal-msg').textContent = '';
    } catch (err) { if (err.auth) return show('login'); $('gal-msg').textContent = err.message; }
  };
  $('gal-rows').oninput = (e) => { const t = e.target; if (t.dataset.g) GAL[+t.dataset.g].pick = t.checked; if (t.dataset.gt) GAL[+t.dataset.gt].title = t.value; if (t.dataset.gd) GAL[+t.dataset.gd].date = t.value; };
  $('gal-rows').onchange = $('gal-rows').oninput;
  $('gal-stop').onclick = () => { galStop = true; };
  $('gal-start').onclick = async () => {
    galStop = false; $('gal-start').disabled = true; $('gal-stop').disabled = false;
    const todo = GAL.map((g, k) => Object.assign(g, { k })).filter((g) => g.pick && !/done/.test((STATE.get('gal:' + g.dir) || {}).state || ''));
    for (let j = 0; j < todo.length && !galStop; j++) {
      const g = todo[j]; const cell = $('gs-' + g.k);
      try {
        cell.innerHTML = stTag('Working…');
        const { gallery } = await call('gal-save', { fields: { title: g.title, event_date: /^\d{4}-\d{2}-\d{2}$/.test(g.date || '') ? g.date : null, source_prefix: g.dir, note: g.note || null, status: 'draft' } });
        const urls = await getUrls(g.keys.map((k) => k.key)); const photos = []; let n = 0;
        await pool(g.keys, 3, async (k, i) => {
          const bm = await createImageBitmap(await (await fetch(urls[i])).blob());
          const big = scaled(bm, 1800, 1800), th = scaled(bm, 600, 600);
          const bb = await toBlob(big, 0.8), tb = await toBlob(th, 0.76);
          const key = `gal/${gallery.slug}/${String(i + 1).padStart(4, '0')}.jpg`;
          await putFiles([{ key, blob: bb }, { key: key.replace(/\.jpg$/, '-t.jpg'), blob: tb }]);
          photos.push({ n: i + 1, path: key, width: big.width, height: big.height }); if (i % 8 === 0) preview($('gal-prev'), tb);
          cell.innerHTML = stTag(`${++n} of ${g.keys.length}`);
        }, () => galStop);
        photos.sort((a, b) => a.n - b.n);
        for (let i = 0; i < photos.length; i += 200) await retry(() => call('photos-save', { gallery_id: gallery.id, photos: photos.slice(i, i + 200) }));
        await call('gal-save', { id: gallery.id, fields: { cover_path: photos[0] && photos[0].path, photo_count: photos.length, status: $('gal-pub').checked && !galStop && !g.sensitive ? 'published' : 'draft' } });
        await setState('gal:' + g.dir, 'gallery', galStop ? 'stopped' : 'done'); cell.innerHTML = stTag(galStop ? 'stopped' : 'done');
      } catch (err) { if (err.auth) return show('login'); await setState('gal:' + g.dir, 'gallery', 'failed'); cell.innerHTML = stTag('failed: ' + err.message.slice(0, 50)); }
      $('gal-bar').style.width = Math.round((j + 1) / todo.length * 100) + '%';
    }
    $('gal-start').disabled = false; $('gal-stop').disabled = true; $('gal-msg').textContent = 'Finished.';
  };

  // ---------- albums kept back for a check ----------
  const heldRow = (g) => `<tr data-row="${g.id}"><td>${g.cover_path ? `<img src="${ARCH}/${esc(g.cover_path.replace(/\.jpg$/, '-t.jpg'))}" alt="" style="height:54px;border-radius:3px">` : ''}</td><td><b>${esc(g.title.replace(/ \| The Rotary Club of Manila$/, ''))}</b><br><span class="muted">${esc(g.event_date || 'no date')} · ${g.photo_count} photos</span><div class="preview hidden" id="hp-${g.id}" style="height:90px;margin-top:6px;flex-wrap:wrap;overflow:auto"></div></td><td style="white-space:nowrap"><button class="smallbtn" type="button" data-look="${g.id}" data-slug="${esc(g.slug)}">Look</button> ${g.kept_private ? `<button class="smallbtn" type="button" data-priv="${g.id}" data-v="0">Check again</button>` : `<button class="smallbtn" type="button" data-pubg="${g.id}">Publish</button> <button class="smallbtn" type="button" data-priv="${g.id}" data-v="1">Keep private</button>`}</td></tr>`;
  async function heldList() {
    $('held').innerHTML = '<tr><td class="muted">Loading…</td></tr>';
    try {
      const { items } = await window.RCMLib.review('held-list', {});
      const todo = items.filter((g) => !g.kept_private), kept = items.filter((g) => g.kept_private);
      $('held').innerHTML = (todo.length ? todo.map(heldRow).join('') : '<tr><td class="muted">No albums waiting for a check.</td></tr>')
        + (kept.length ? `<tr><td colspan="3" style="padding-top:18px"><b>Kept private (${kept.length})</b> <span class="muted">· not on the website and no longer on your to-do list</span></td></tr>` + kept.map(heldRow).join('') : '');
      $('held-msg').textContent = todo.length ? `${todo.length} to check. Use Look to see the photos, then Publish, or Keep private if children or patients can be identified and there is no consent.` : '';
    } catch (err) { if (err.auth) return show('login'); $('held').innerHTML = `<tr><td class="err">${esc(err.message)}</td></tr>`; }
  }
  const ARCH = 'https://archive.rcmanila.org';
  $('held').onclick = async (e) => {
    const lk = e.target.closest('[data-look]');
    if (lk) { const box = $('hp-' + lk.dataset.look); box.classList.toggle('hidden'); if (!box.children.length) { const r = await call('r2-list', { bucket: 'rcm-library', prefix: 'gal/' + lk.dataset.slug + '/' }); box.innerHTML = r.keys.filter((k) => /-t\.jpg$/.test(k.key)).map((k) => `<img src="${ARCH}/${esc(k.key)}" alt="" loading="lazy" style="height:84px">`).join(''); } return; }
    const pb = e.target.closest('[data-pubg]');
    if (pb) { pb.disabled = true; try { await call('publish', { kind: 'gallery', id: pb.dataset.pubg, status: 'published' }); pb.closest('tr').remove(); $('held-msg').textContent = 'Published ✓'; } catch (err) { pb.disabled = false; $('held-msg').textContent = err.message; } return; }
    const pv = e.target.closest('[data-priv]');
    if (pv) { pv.disabled = true; try { await window.RCMLib.review('gallery-private', { id: pv.dataset.priv, private: pv.dataset.v === '1' }); heldList(); } catch (err) { pv.disabled = false; $('held-msg').textContent = err.message; } }
  };
  const alertMsg = (t) => { $('gal-msg').textContent = t; };

  // ---------- storage browser ----------
  $('br-go').onclick = async () => {
    $('br-msg').textContent = 'Listing…';
    try {
      const r = await call('r2-list', { prefix: $('br-prefix').value.trim() });
      $('br-rows').innerHTML = r.keys.map((k) => `<tr><td>${esc(k.key)}</td><td>${(k.size / 1048576).toFixed(2)} MB</td></tr>`).join('');
      $('br-msg').textContent = `${r.keys.length} files shown${r.next ? ' (first 1,000)' : ''}.`;
    } catch (err) { $('br-msg').textContent = err.message; }
  };

  if (code) open(); else show('login');
})();

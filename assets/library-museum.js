/* Heritage Library workshop, museum tabs: review the Club timeline, the monthly exhibits, members' suggestions of
   who is in a photo, and the weekly history minutes; print QR labels for the trophy room.
   Uses the workshop's signed-in connection (window.RCMLib.call). */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const call = (a, p) => window.RCMLib.review(a, p);
  const ARCH = 'https://archive.rcmanila.org/';
  const SB = 'https://unavxknqpibxwcoqemaf.supabase.co';
  const PUB = 'sb_publishable_zebFaErs-sjDwYWQUMfq3g_VuF2DTI6';
  const src = (p, w) => !p ? '' : /^https?:/.test(p) ? p : /^(issues|legacy)\//.test(p) ? `${SB}/storage/v1/render/image/public/rcm/${p.split('/').map(encodeURIComponent).join('/')}?width=${w || 300}&resize=contain&quality=70` : ARCH + p.split('/').map(encodeURIComponent).join('/');
  const MON = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const msg = (id, t, bad) => { const el = $(id); if (el) { el.textContent = t; el.className = bad ? 'err' : 'muted'; } };

  // ---------- timeline ----------
  let EV = [];
  async function tl() {
    msg('tl-msg', 'Loading…');
    try { EV = (await call('events-list', {})).items; drawTl(); } catch (e) { msg('tl-msg', e.message, true); }
  }
  function drawTl() {
    const st = $('tl-show').value, dec = Number($('tl-dec').value) || 0;
    const counts = { draft: 0, published: 0, hidden: 0 }; EV.forEach((e) => { counts[e.status] = (counts[e.status] || 0) + 1; });
    $('tl-count').textContent = `${counts.draft} waiting for review · ${counts.published} on the website · ${counts.hidden} hidden`;
    const decs = [...new Set(EV.map((e) => Math.floor(e.year / 10) * 10))].sort();
    if ($('tl-dec').options.length <= 1) $('tl-dec').insertAdjacentHTML('beforeend', decs.map((d) => `<option value="${d}">${d}s</option>`).join(''));
    const L = EV.filter((e) => (st === 'all' || e.status === st) && (!dec || (e.year >= dec && e.year < dec + 10)));
    $('tl-list').innerHTML = L.length ? L.map((e) => `<li class="mu-card" data-id="${e.id}">
<div class="mu-row"><input class="mu-y" data-f="year" type="number" value="${e.year}" aria-label="Year"><select data-f="month" aria-label="Month">${MON.map((m, k) => `<option value="${k || ''}"${(e.month || 0) === k ? ' selected' : ''}>${k ? m : '—'}</option>`).join('')}</select><span class="st ${e.status === 'published' ? 'done' : e.status === 'hidden' ? 'fail' : 'wait'}">${e.status === 'published' ? 'On the website' : e.status === 'hidden' ? 'Hidden' : 'Draft'}</span></div>
${e.check_note && e.status === 'draft' ? `<p class="note small" style="margin:0"><b>Check:</b> ${esc(e.check_note)}</p>` : ''}<input data-f="headline" value="${esc(e.headline)}" aria-label="Headline" class="mu-h">
<textarea data-f="body" rows="2" aria-label="Text">${esc(e.body || '')}</textarea>
<div class="mu-row small">${(e.links || []).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.url)} ↗</a>`).join(' · ')}${e.source ? `<span class="muted">· Source: ${esc(e.source)}</span>` : ''}</div>
<div class="mu-row"><button class="btn btn-blue mu-b" data-do="published" type="button">${e.status === 'published' ? 'Save' : 'Publish'}</button>${e.status !== 'draft' ? '<button class="smallbtn" data-do="draft" type="button">Back to draft</button>' : ''}${e.status !== 'hidden' ? '<button class="smallbtn" data-do="hidden" type="button">Hide</button>' : ''}<span class="muted mu-m"></span></div></li>`).join('') : '<li class="muted">Nothing here.</li>';
    msg('tl-msg', '');
  }
  async function saveCard(li, action, fields, done) {
    const m = li.querySelector('.mu-m'); m.textContent = 'Saving…';
    try { await call(action, fields); m.textContent = 'Saved ✓'; done && done(); } catch (e) { m.textContent = e.message; }
  }
  function onTl(e) {
    const b = e.target.closest('[data-do]'); if (!b) return;
    const li = b.closest('[data-id]'); const id = Number(li.dataset.id);
    const f = { id, status: b.dataset.do };
    li.querySelectorAll('[data-f]').forEach((x) => { f[x.dataset.f] = x.dataset.f === 'year' || x.dataset.f === 'month' ? (x.value ? Number(x.value) : null) : x.value.trim(); });
    saveCard(li, 'event-save', f, () => { const ev = EV.find((x) => x.id === id); Object.assign(ev, f); setTimeout(drawTl, 400); });
  }
  async function publishShown() {
    const st = $('tl-show').value, dec = Number($('tl-dec').value) || 0;
    const ids = EV.filter((e) => e.status === 'draft' && (st === 'all' || st === 'draft') && (!dec || (e.year >= dec && e.year < dec + 10))).map((e) => e.id);
    if (!ids.length) return msg('tl-msg', 'No drafts in this view.');
    const fl = EV.filter((e) => ids.includes(e.id) && e.check_note).length;
    if (!confirm(`Publish ${ids.length} draft entries to the website?` + (fl ? `\n\n${fl} of them are marked “Check” and have not been checked yet.` : ''))) return;
    try { await call('events-status', { ids, status: 'published' }); EV.forEach((e) => { if (ids.includes(e.id)) e.status = 'published'; }); drawTl(); msg('tl-msg', `${ids.length} published ✓`); } catch (e) { msg('tl-msg', e.message, true); }
  }

  // ---------- exhibits ----------
  let EX = [];
  async function ex() {
    msg('ex-msg', 'Loading…');
    try { EX = (await call('exhibits-list', {})).items; drawEx(); msg('ex-msg', ''); } catch (e) { msg('ex-msg', e.message, true); }
  }
  function drawEx() {
    $('ex-list').innerHTML = EX.map((x) => `<li class="mu-card" data-ex="${x.id}">
<div class="mu-row"><strong>${esc(new Date(x.month + 'T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }))}</strong><span class="st ${x.status === 'published' ? 'done' : 'wait'}">${x.status === 'published' ? 'On the website' : 'Draft'}</span><a class="smallbtn" href="/library/exhibit/${esc(x.slug)}" target="_blank" rel="noopener">View ↗</a></div>
<input data-f="title" value="${esc(x.title)}" class="mu-h" aria-label="Title"><textarea data-f="intro" rows="4" aria-label="Introduction">${esc(x.intro || '')}</textarea>
<div class="mu-thumbs">${(x.items || []).map((it) => `<figure title="${esc((it.year || '') + ' · ' + (it.title || ''))}">${it.image ? `<img src="${esc(src(it.image, 200))}" alt="" loading="lazy">` : '<span></span>'}<figcaption>${esc(String(it.year || ''))}</figcaption></figure>`).join('')}</div>
<div class="mu-row"><button class="btn btn-blue" data-do="save" type="button">Save</button>${x.status === 'published' ? '<button class="smallbtn" data-do="draft" type="button">Take off the website</button>' : '<button class="btn btn-gold" data-do="published" type="button">Publish</button>'}<span class="muted mu-m"></span></div></li>`).join('') || '<li class="muted">No exhibits yet.</li>';
  }
  function onEx(e) {
    const b = e.target.closest('[data-do]'); if (!b) return;
    const li = b.closest('[data-ex]'); const id = li.dataset.ex; const x = EX.find((y) => y.id === id);
    const f = { id, title: li.querySelector('[data-f=title]').value.trim(), intro: li.querySelector('[data-f=intro]').value.trim() };
    if (b.dataset.do !== 'save') f.status = b.dataset.do;
    saveCard(li, 'exhibit-save', f, () => { Object.assign(x, f); setTimeout(drawEx, 400); });
  }

  // ---------- photo names ----------
  async function tags() {
    msg('tags-msg', 'Loading…');
    try {
      const L = (await call('tags-list', { status: $('tags-show').value })).items;
      $('tags-list').innerHTML = L.map((t) => `<li class="mu-card mu-tag" data-tag="${t.id}">${t.image ? `<a href="${esc(t.image)}" target="_blank" rel="noopener"><img src="${esc(t.image)}" alt="" loading="lazy"></a>` : ''}<div>
<div class="mu-row small"><strong>${esc(t.label || t.ref)}</strong><span class="muted">${esc(new Date(t.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))}</span></div>
<label class="f">Names<textarea data-f="names" rows="2">${esc(t.names)}</textarea></label>
${t.note ? `<p class="small" style="margin:0">“${esc(t.note)}”</p>` : ''}<p class="small muted" style="margin:0">From ${esc(t.submitter || '')}${t.contact ? ' · ' + esc(t.contact) : ''}</p>
${t.status === 'new' ? `<div class="mu-row"><button class="btn btn-blue" data-do="approved" type="button">Approve</button><button class="smallbtn" data-do="rejected" type="button">Reject</button><span class="muted mu-m"></span></div>` : `<span class="st ${t.status === 'approved' ? 'done' : 'fail'}">${t.status === 'approved' ? 'Approved' : 'Rejected'}</span>`}</div></li>`).join('') || '<li class="muted">No suggestions here.</li>';
      msg('tags-msg', L.length ? `${L.length} shown` : '');
    } catch (e) { msg('tags-msg', e.message, true); }
  }
  function onTags(e) {
    const b = e.target.closest('[data-do]'); if (!b) return;
    const li = b.closest('[data-tag]');
    saveCard(li, 'tag-review', { id: li.dataset.tag, status: b.dataset.do, names: li.querySelector('[data-f=names]').value.trim() }, () => setTimeout(() => li.remove(), 500));
  }

  // ---------- history minutes ----------
  async function min() {
    msg('min-msg', 'Loading…');
    try {
      const L = (await call('minutes-list', {})).items; const today = new Date().toISOString().slice(0, 10);
      $('min-list').innerHTML = L.map((m) => `<li class="mu-card${m.week < today ? ' past' : ''}" data-wk="${m.week}"><div class="mu-row"><strong>${esc(new Date(m.week + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }))}</strong>${m.week < today ? '<span class="muted">past</span>' : ''}<a class="smallbtn" href="/library/minute?w=${m.week}" target="_blank" rel="noopener">View ↗</a></div>
<input data-f="title" value="${esc(m.title)}" class="mu-h" aria-label="Title"><textarea data-f="script" rows="6" aria-label="Script">${esc(m.script)}</textarea>
<div class="mu-row"><button class="btn btn-blue" data-do="save" type="button">Save</button><label class="row small" style="gap:6px"><input type="checkbox" data-f="pub"${m.status === 'published' ? ' checked' : ''}> Show on the website and Secretariat page</label><span class="muted mu-m"></span></div></li>`).join('') || '<li class="muted">No history minutes yet.</li>';
      msg('min-msg', '');
    } catch (e) { msg('min-msg', e.message, true); }
  }
  function onMin(e) {
    const b = e.target.closest('[data-do]'); if (!b) return;
    const li = b.closest('[data-wk]');
    saveCard(li, 'minute-save', { week: li.dataset.wk, title: li.querySelector('[data-f=title]').value.trim(), script: li.querySelector('[data-f=script]').value.trim(), status: li.querySelector('[data-f=pub]').checked ? 'published' : 'draft' });
  }

  // ---------- QR labels for the trophy room ----------
  async function qrLabels() {
    const r = await fetch(`${SB}/rest/v1/rcm_lib_objects?select=acc,title,year,kind&status=eq.published&order=acc&limit=2000`, { headers: { apikey: PUB } });
    const L = r.ok ? await r.json() : [];
    if (!L.length) return alert('No published trophies yet.');
    const w = window.open('', '_blank'); if (!w) return alert('Allow pop-ups for this page to print the labels.');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Trophy room QR labels</title><style>body{font-family:Arial,sans-serif;margin:12mm}h1{font-size:16px}.g{display:grid;grid-template-columns:repeat(4,1fr);gap:6mm}.l{border:1px dashed #999;padding:4mm;text-align:center;break-inside:avoid;font-size:10px}.l b{display:block;font-size:11px;margin-top:2mm}.q{display:flex;justify-content:center}@media print{h1,p{display:none}}</style></head><body><h1>Trophy room QR labels (${L.length})</h1><p>Print on sticker paper or cut out. Each code opens the object's page in the online trophy room.</p><div class="g">${L.map((o, k) => `<div class="l"><div class="q" id="q${k}"></div><b>${esc(o.title || o.kind || 'Object')}</b>${esc([o.year, o.acc].filter(Boolean).join(' · '))}</div>`).join('')}</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script><script>var L=${JSON.stringify(L.map((o) => o.acc))};window.onload=function(){L.forEach(function(a,k){new QRCode(document.getElementById('q'+k),{text:'https://rcmanila.org/library/trophies#o='+encodeURIComponent(a),width:96,height:96,correctLevel:QRCode.CorrectLevel.M})})}<\/script></body></html>`);
    w.document.close();
  }

  // ---------- wiring ----------
  document.addEventListener('rcmlib:tab', (e) => { const t = e.detail; if (t === 'home') { /* drawn by library-dash.js */ } if (t === 'tl') tl(); if (t === 'ex') ex(); if (t === 'tags') tags(); if (t === 'min') min(); });
  document.addEventListener('DOMContentLoaded', () => {
    $('tl-list').addEventListener('click', onTl); $('ex-list').addEventListener('click', onEx); $('tags-list').addEventListener('click', onTags); $('min-list').addEventListener('click', onMin);
    $('tl-show').onchange = drawTl; $('tl-dec').onchange = drawTl; $('tl-pub').onclick = publishShown;
    $('tags-show').onchange = tags; $('obj-qr').onclick = qrLabels; if ($('dh-qr')) $('dh-qr').onclick = qrLabels;
  });
})();

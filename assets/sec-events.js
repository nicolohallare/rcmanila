/* Secretariat: club events (fellowships, fundraisers, exhibits) with sign-ups, seat limits and a Viber share panel. */
(function () {
  const $ = (id) => document.getElementById(id);
  const S = () => window.RCMSec;
  const esc = (s) => S().esc(s);
  const SB = 'https://unavxknqpibxwcoqemaf.supabase.co';
  const FN = SB + '/functions/v1/rcm-events';
  const PUB = 'sb_publishable_zebFaErs-sjDwYWQUMfq3g_VuF2DTI6';
  const SITE = 'https://rcmanila.org';
  const F = $('ev-form');
  const TEXT = ['title', 'kicker', 'event_date', 'end_date', 'time_text', 'venue', 'summary', 'body', 'organizer', 'contact', 'price', 'price_note', 'capacity', 'per_member', 'who', 'link_url', 'link_label'];
  const imgUrl = (p, w) => !p ? '' : p[0] === '/' ? p : `${SB}/storage/v1/render/image/public/rcm/${p.split('/').map(encodeURIComponent).join('/')}?width=${w}&resize=contain&quality=80`;
  const longDate = (iso) => new Date(iso + 'T12:00:00+08:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' });
  const shortDate = (iso) => new Date(iso + 'T12:00:00+08:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' });
  const peso = (n) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });
  let E = null, SU = [], posterPath = null, pendingNames = [], mode = 'announce';

  async function call(action, payload) {
    const r = await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', 'x-editor-code': S().code(), apikey: PUB }, body: JSON.stringify(Object.assign({ action }, payload || {})) });
    const d = await r.json().catch(() => ({ error: 'The server did not answer. Please try again.' }));
    if (r.status === 401) throw Object.assign(new Error(d.error || 'Wrong passcode'), { auth: true });
    if (!r.ok || d.error) throw new Error(d.error || ('Error ' + r.status));
    return d;
  }

  // ---------- list ----------
  async function openList() {
    S().show('v-ev');
    $('ev-edit').classList.add('hidden'); $('ev-listp').classList.remove('hidden'); $('ev-new').hidden = false;
    try {
      const { events, today } = await call('e-list');
      $('ev-list').innerHTML = events.length ? events.map((e) => {
        const past = e.event_date < today;
        const tag = e.status === 'published' ? (past ? ['Past', 'wait'] : ['On the website', 'ok']) : ['Draft', 'flag'];
        return `<li><div style="flex:1;min-width:220px"><b>${esc(shortDate(e.event_date))}</b> · ${esc(e.title)}<br><span class="muted">${e.capacity ? `${e.seats} of ${e.capacity} seats taken` : `${e.seats} signed up`}</span></div><span class="tag ${tag[1]}">${tag[0]}</span><button class="btn btn-line" style="color:var(--blue)" type="button" data-ev="${e.id}">Open</button></li>`;
      }).join('') : '<li class="muted">No events yet. Click “New event”, then paste the Viber announcement.</li>';
    } catch (err) { if (err.auth) return S().show('v-login'); $('ev-list').innerHTML = `<li class="err">${esc(err.message)}</li>`; }
  }
  $('ev-list').addEventListener('click', (e) => { const b = e.target.closest('[data-ev]'); if (b) openEvent(b.getAttribute('data-ev')); });
  document.querySelector('.sec-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b && b.getAttribute('data-tab') === 'v-ev') openList(); });
  $('ev-back').onclick = openList;

  // ---------- editor ----------
  function showEditor() { $('ev-listp').classList.add('hidden'); $('ev-new').hidden = true; $('ev-edit').classList.remove('hidden'); window.scrollTo(0, 0); }
  function fill(e) {
    TEXT.forEach((k) => { const el = F.elements[k]; if (el) el.value = e[k] == null ? (k === 'per_member' ? '1' : k === 'who' ? 'members' : '') : e[k]; });
    F.elements.published.checked = e.status === 'published';
    F.elements.rsvp_open.checked = e.rsvp_open !== false;
    F.elements.show_attendees.checked = !!e.show_attendees;
    setPoster(e.poster_path || null);
  }
  function read() {
    const f = {};
    TEXT.forEach((k) => { f[k] = F.elements[k].value.trim(); });
    f.status = F.elements.published.checked ? 'published' : 'draft';
    f.rsvp_open = F.elements.rsvp_open.checked;
    f.show_attendees = F.elements.show_attendees.checked;
    f.poster_path = posterPath;
    return f;
  }
  function setPoster(p) { posterPath = p; $('ev-poster-img').hidden = !p; $('ev-poster-rm').hidden = !p; if (p) $('ev-poster-img').src = imgUrl(p, 300); }
  $('ev-new').onclick = () => {
    E = null; SU = []; pendingNames = [];
    fill({}); F.elements.rsvp_open.checked = true;
    $('ev-title').textContent = 'New event'; $('ev-save-msg').textContent = ''; $('ev-fill-msg').textContent = ''; $('ev-paste').value = '';
    $('ev-spanel').classList.add('hidden'); $('ev-share').hidden = true; $('ev-links').innerHTML = '';
    showEditor();
  };
  async function openEvent(id) {
    showEditor(); $('ev-title').textContent = 'Loading…';
    try {
      const d = await call('e-get', { id });
      E = d.event; SU = d.signups; pendingNames = [];
      fill(E); $('ev-title').textContent = E.title; $('ev-save-msg').textContent = ''; $('ev-fill-msg').textContent = ''; $('ev-paste').value = '';
      $('ev-spanel').classList.remove('hidden');
      renderLinks(); renderSignups(); renderShare();
    } catch (err) { if (err.auth) return S().show('v-login'); $('ev-title').textContent = err.message; }
  }
  function renderLinks() {
    $('ev-links').innerHTML = E && E.status === 'published' ? `<a class="btn btn-line" style="color:var(--blue)" href="/events/${esc(E.slug)}" target="_blank" rel="noopener">View on website ↗</a>` : E ? '<span class="tag flag">Draft: not on the website yet</span>' : '';
  }
  $('ev-fill').onclick = async () => {
    const text = $('ev-paste').value.trim();
    if (text.length < 20) { $('ev-fill-msg').textContent = 'Paste the announcement first.'; return; }
    $('ev-fill').disabled = true; $('ev-fill-msg').textContent = 'Reading the announcement… (about 15 seconds)';
    try {
      const { fields, names } = await call('e-parse', { text });
      Object.keys(fields).forEach((k) => { const el = F.elements[k]; if (el && fields[k] != null && fields[k] !== '') el.value = fields[k]; });
      pendingNames = names || [];
      $('ev-fill-msg').textContent = `Filled in. Check each field${pendingNames.length ? `, then Save: the ${pendingNames.length} names from the list will be added to “Who's coming”` : ', then Save'}. Upload the poster below.`;
    } catch (err) { $('ev-fill-msg').textContent = err.message; }
    finally { $('ev-fill').disabled = false; }
  };
  F.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fields = read();
    if (!fields.title) { $('ev-save-msg').textContent = 'Type the event name.'; return; }
    if (!fields.event_date) { $('ev-save-msg').textContent = 'Choose the date.'; return; }
    $('ev-save').disabled = true; $('ev-save-msg').textContent = 'Saving…';
    try {
      const { event } = await call('e-save', { id: E && E.id, fields });
      E = event;
      let added = 0;
      if (pendingNames.length) { added = (await call('e-add-people', { event_id: E.id, people: pendingNames })).added; pendingNames = []; }
      const d = await call('e-get', { id: E.id }); SU = d.signups;
      $('ev-title').textContent = E.title;
      $('ev-save-msg').textContent = (E.status === 'published' ? 'Saved. It is on the website now (it can take up to a minute to appear).' : 'Saved as a draft. Tick “Show this event on the website” when it is ready.') + (added ? ` ${added} names added to the list.` : '');
      $('ev-spanel').classList.remove('hidden');
      renderLinks(); renderSignups(); renderShare();
    } catch (err) { if (err.auth) return S().show('v-login'); $('ev-save-msg').textContent = err.message; }
    finally { $('ev-save').disabled = false; }
  });
  $('ev-del').onclick = async () => {
    if (!E) { openList(); return; }
    if (!window.confirm(`Delete “${E.title}” and its list of ${SU.length} sign-ups? This cannot be undone.`)) return;
    try { await call('e-delete', { id: E.id }); openList(); } catch (err) { $('ev-save-msg').textContent = err.message; }
  };
  function shrink(file, maxW) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => { const s = Math.min(1, maxW / im.naturalWidth); const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the image.'))), 'image/jpeg', 0.86); URL.revokeObjectURL(im.src); };
      im.onerror = () => reject(new Error('That file is not an image this browser can open. Try a JPG or PNG.'));
      im.src = URL.createObjectURL(file);
    });
  }
  $('ev-poster-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    $('ev-poster-msg').textContent = 'Uploading…';
    try {
      const blob = await shrink(file, 1600);
      const s = await call('e-poster-sign', { event_id: E ? E.id : 'new' });
      const fd = new FormData(); fd.append('cacheControl', '31536000'); fd.append('', blob, 'poster.jpg');
      const r = await fetch(s.signedUrl, { method: 'PUT', headers: { 'x-upsert': 'true' }, body: fd });
      if (!r.ok) throw new Error('Upload failed (' + r.status + ').');
      setPoster(s.path); $('ev-poster-msg').textContent = 'Uploaded. Click Save to keep it.';
    } catch (err) { $('ev-poster-msg').textContent = err.message; }
  });
  $('ev-poster-rm').onclick = () => { setPoster(null); $('ev-poster-msg').textContent = 'Removed. Click Save to keep this change.'; };

  // ---------- who's coming ----------
  const seats = () => SU.reduce((n, s) => n + (s.seats || 1), 0);
  const lineOf = (s) => s.name + (s.guest_name ? ` & ${s.guest_name}` : '');
  function renderSignups() {
    const n = seats(), paid = SU.filter((s) => s.paid).reduce((k, s) => k + (s.seats || 1), 0);
    $('ev-stats').innerHTML = `<div class="stat"><b>${n}${E && E.capacity ? ` / ${E.capacity}` : ''}</b>seats</div><div class="stat"><b>${SU.length}</b>sign-ups</div>${E && E.price ? `<div class="stat"><b>${paid}</b>seats paid</div>` : ''}`;
    $('ev-slist').innerHTML = SU.length ? SU.map((s) => `<li><span class="nm">${esc(lineOf(s))}${s.contact ? `<br><small class="muted">${esc(s.contact)}</small>` : ''}${s.source === 'web' ? ' <small class="muted">(website)</small>' : ''}</span>${E && E.price ? `<label class="paid"><input type="checkbox" data-paid="${s.id}" ${s.paid ? 'checked' : ''}> Paid</label>` : ''}<button class="smallbtn" type="button" data-rm="${s.id}" aria-label="Remove ${esc(s.name)}">Remove</button></li>`).join('') : '<li class="muted" style="list-style:none">No one yet.</li>';
    if (E && !$('ev-share').hidden) $('evs-msg').textContent = message();
  }
  $('ev-slist').addEventListener('click', async (e) => {
    const rm = e.target.getAttribute('data-rm');
    if (rm) { const s = SU.find((x) => x.id === rm); if (!window.confirm(`Remove ${s ? lineOf(s) : 'this name'} from the list?`)) return; try { await call('e-remove', { id: rm }); SU = SU.filter((x) => x.id !== rm); renderSignups(); } catch (err) { $('ev-add-msg').textContent = err.message; } }
  });
  $('ev-slist').addEventListener('change', async (e) => {
    const id = e.target.getAttribute('data-paid'); if (!id) return;
    try { await call('e-update-signup', { id, paid: e.target.checked }); const s = SU.find((x) => x.id === id); if (s) s.paid = e.target.checked; renderSignups(); } catch (err) { e.target.checked = !e.target.checked; $('ev-add-msg').textContent = err.message; }
  });
  $('ev-refresh').onclick = async () => { if (!E) return; try { SU = (await call('e-get', { id: E.id })).signups; renderSignups(); } catch (err) { $('ev-add-msg').textContent = err.message; } };
  $('ev-add-btn').onclick = async () => {
    const text = $('ev-add-text').value.trim(); if (!text || !E) return;
    try { const r = await call('e-add-names', { event_id: E.id, text }); $('ev-add-text').value = ''; $('ev-add-msg').textContent = `Added ${r.added}.`; SU = (await call('e-get', { id: E.id })).signups; renderSignups(); }
    catch (err) { $('ev-add-msg').textContent = err.message; }
  };
  function copy(text, btn) {
    const done = () => { const t = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = t; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, fb); else fb();
    function fb() { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} ta.remove(); }
  }
  $('ev-copy-list').onclick = () => copy(`${E.title}\n${longDate(E.event_date)}\n\n` + SU.map((s, i) => `${i + 1}. ${lineOf(s)}${E.price && s.paid ? ' (paid)' : ''}`).join('\n') + `\n\n${seats()}${E.capacity ? ` of ${E.capacity}` : ''} seats`, $('ev-copy-list'));
  $('ev-dl-list').onclick = () => {
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['No.', 'Name', 'Wife / partner / guest', 'Seats', 'Mobile', 'Paid', 'Signed up via', 'Signed up (Manila time)']].concat(SU.map((s, i) => [i + 1, s.name, s.guest_name || '', s.seats || 1, s.contact || '', s.paid ? 'Yes' : '', s.source === 'web' ? 'Website' : 'Added by Secretariat', new Date(s.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })]));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `RCM-event-${E.slug || 'list'}.csv`; document.body.appendChild(a); a.click(); a.remove();
  };

  // ---------- share on Viber ----------
  function message() {
    if (!E) return '';
    const url = `${SITE}/events/${E.slug}`, n = seats(), left = E.capacity ? Math.max(0, E.capacity - n) : null;
    const when = longDate(E.event_date) + (E.time_text ? ` · ${E.time_text}` : '');
    const L = [];
    if (mode === 'remind') {
      L.push(`⏰ Reminder: *${E.title}*`, `📅 ${when}`);
      if (E.venue) L.push(`📍 ${E.venue}`);
      L.push('', left === null ? `${n} ${n === 1 ? 'person has' : 'people have'} signed up so far.` : left ? `Only ${left} of ${E.capacity} seats left!` : 'Fully booked. Thank you!');
      if (left !== 0) L.push('Sign up here:', url);
    } else {
      L.push(`📣 *${E.title}*`);
      if (E.summary) L.push(E.summary);
      L.push('', `📅 ${when}${E.end_date && E.end_date !== E.event_date ? ` (until ${new Date(E.end_date + 'T12:00:00+08:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Asia/Manila' })})` : ''}`);
      if (E.venue) L.push(`📍 ${E.venue}`);
      if (E.price) L.push(`🎟️ ${peso(E.price)}${E.price_note ? ' ' + E.price_note : ' per ticket'}${Number(E.per_member) > 1 ? ` · up to ${E.per_member} per member` : ''}`);
      if (E.capacity) L.push(left ? `Only ${E.capacity} seats: ${left} left now.` : 'Fully booked.');
      if (E.link_url) L.push('', `${E.link_label || 'More details'}: ${E.link_url}`);
      L.push('', 'Sign up on the website (no need to reply here):', url);
      if (E.organizer) L.push('', E.organizer);
    }
    return L.join('\n');
  }
  let blob = null, blobFor = '';
  function loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = rej; im.src = src; }); }
  async function drawCard() {
    if (!E) return;
    const key = [E.id, E.updated_at, E.poster_path].join('|'); if (key === blobFor && blob) return;
    const c = $('evs-card'), x = c.getContext('2d');
    if (E.poster_path) {
      try { const im = await loadImg(imgUrl(E.poster_path, 1400)); c.width = Math.min(1400, im.width); c.height = Math.round(c.width * im.height / im.width); x.drawImage(im, 0, 0, c.width, c.height); blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); blobFor = key; return; } catch (e) {}
    }
    const W = 1080, H = 1350; c.width = W; c.height = H;
    x.fillStyle = '#17458f'; x.fillRect(0, 0, W, H);
    try { const logo = await loadImg('/assets/club-logo-white.png'); const lh = 80; x.drawImage(logo, 72, 64, logo.width * lh / logo.height, lh); } catch (e) {}
    x.fillStyle = '#f7a81b'; x.font = '800 30px "Open Sans", Arial, sans-serif'; x.fillText(String(E.kicker || 'Club event').toUpperCase(), 72, 300, W - 144);
    x.fillStyle = '#fff'; x.font = '700 72px Georgia, "Times New Roman", serif';
    const words = String(E.title).split(/\s+/); let line = '', y = 400;
    for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > W - 144 && line) { x.fillText(line, 72, y); y += 84; line = w; } else line = t; } if (line) { x.fillText(line, 72, y); y += 84; }
    x.fillStyle = '#dbe8f5'; x.font = '600 34px "Open Sans", Arial, sans-serif'; x.fillText(longDate(E.event_date) + (E.time_text ? ' · ' + E.time_text : ''), 72, y + 40, W - 144);
    if (E.venue) x.fillText(E.venue, 72, y + 90, W - 144);
    x.fillStyle = '#0c2d62'; x.fillRect(0, H - 170, W, 170); x.fillStyle = '#f7a81b'; x.fillRect(0, H - 170, W, 6);
    x.font = '800 34px "Open Sans", Arial, sans-serif'; x.fillText(`Sign up at rcmanila.org/events`, 72, H - 70, W - 144);
    blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); blobFor = key;
  }
  function renderShare() {
    if (!E) { $('ev-share').hidden = true; return; }
    $('ev-share').hidden = false;
    $('evs-note').textContent = E.status === 'published' ? '' : '(draft: the link works once the event is shown on the website)';
    $('evs-msg').textContent = message();
    drawCard().catch(() => {});
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-evmode]'); if (!b) return; mode = b.getAttribute('data-evmode'); document.querySelectorAll('[data-evmode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); $('evs-msg').textContent = message(); });
  $('evs-copy').onclick = () => copy(message(), $('evs-copy'));
  $('evs-dl').onclick = async () => { await drawCard(); if (!blob) return; const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `event-${E.slug}.jpg`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
  $('evs-go').onclick = async () => {
    const msg = message(); try { await navigator.clipboard.writeText(msg); } catch (e) {}
    await drawCard();
    const file = blob ? new File([blob], `event-${E.slug}.jpg`, { type: 'image/jpeg' }) : null;
    try {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: msg });
      else if (navigator.share) await navigator.share({ text: msg });
      else copy(msg, $('evs-go'));
    } catch (e) { /* share menu closed */ }
  };
})();

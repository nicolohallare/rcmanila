(function () {
  const SB = 'https://unavxknqpibxwcoqemaf.supabase.co';
  const FN = SB + '/functions/v1/rcm-admin';
  const PUB = 'sb_publishable_zebFaErs-sjDwYWQUMfq3g_VuF2DTI6';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const imgUrl = (path, w) => path[0] === '/' ? path : `${SB}/storage/v1/render/image/public/rcm/${path.split('/').map(encodeURIComponent).join('/')}?width=${w}&resize=contain&quality=75`;
  const F = $('mform');
  const TEXT = ['meeting_date', 'label', 'topic', 'speaker', 'speaker_title', 'time_text', 'registration_text', 'venue', 'notes', 'speaker_bio'];
  let code = '';
  try { code = localStorage.getItem('rcm-sec-code') || ''; } catch (e) {}
  let state = { meeting: null, signups: [], posterPath: null, lastVenue: null };

  function show(v) {
    for (const id of ['v-login', 'v-home', 'v-list', 'v-edit', 'v-att', 'v-don', 'v-camp', 'v-inq', 'v-ev']) $(id).classList.toggle('hidden', id !== v);
    $('sec-tabs').classList.toggle('hidden', v === 'v-login');
    const tab = v === 'v-edit' ? 'v-list' : v;
    document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-current', String(b.getAttribute('data-tab') === tab)));
    window.scrollTo(0, 0);
  }
  window.RCMSec = { call: (a, p) => call(a, p), show: (v) => show(v), esc, openList: () => openList(), openMeeting: (id) => openMeeting(id), newMeeting: async () => { await openList(); $('new-meeting').click(); }, home: () => openHome(), code: () => code };
  function openHome() { show('v-home'); document.dispatchEvent(new Event('rcmsec:home')); }

  async function call(action, payload) {
    const r = await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', 'x-editor-code': code, apikey: PUB }, body: JSON.stringify(Object.assign({ action }, payload || {})) });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text.trim().split('\n').pop()); } catch (e) { throw new Error('The server did not answer properly (' + r.status + '). Please try again.'); }
    if (r.status === 401) throw Object.assign(new Error(data.error || 'Wrong passcode'), { auth: true });
    if (!r.ok || data.error) throw new Error(data.error || ('Error ' + r.status));
    if ('ok' in data && 'data' in data) { if (!data.ok) throw new Error(data.error); return data.data; }
    return data;
  }

  const longDate = (iso) => new Date(iso + 'T12:00:00+08:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' });
  const shortDate = (iso) => new Date(iso + 'T12:00:00+08:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' });
  const manilaToday = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  function nextThursdayAfter(iso) {
    const d = new Date((iso || manilaToday()) + 'T12:00:00Z');
    if (iso) d.setUTCDate(d.getUTCDate() + 1);
    while (d.getUTCDay() !== 4) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  // ---------- sign in ----------
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    code = $('code').value.trim();
    $('login-err').classList.add('hidden');
    try { await call('login', { need: 'meetings' }); try { localStorage.setItem('rcm-sec-code', code); } catch (x) {} openHome(); }
    catch (err) { $('login-err').textContent = err.auth ? 'That passcode is not right. Check it and try again.' : err.message; $('login-err').classList.remove('hidden'); }
  });
  $('signout').onclick = () => { try { localStorage.removeItem('rcm-sec-code'); } catch (e) {} code = ''; show('v-login'); };

  // ---------- list ----------
  let listData = null;
  async function openList() {
    show('v-list');
    try {
      listData = await call('m-list');
      state.lastVenue = listData.last_venue;
      const today = listData.today;
      $('mlist').innerHTML = listData.meetings.length ? listData.meetings.map((m) => {
        const past = m.meeting_date < today;
        const tag = m.status === 'published' ? (past ? ['Past', 'wait'] : ['On the website', 'ok']) : ['Draft', 'flag'];
        return `<li><div style="flex:1;min-width:220px"><b>${esc(shortDate(m.meeting_date))}</b> · ${esc(m.label || 'Weekly meeting')}<br><span class="muted">${esc([m.topic, m.speaker].filter(Boolean).join(' · ') || 'No speaker yet')}</span></div><span class="tag ${tag[1]}">${tag[0]}</span><span class="muted" style="min-width:90px">${m.signups} signed up</span><button class="smallbtn" type="button" data-open="${m.id}">Open</button></li>`;
      }).join('') : '<li class="muted">No meetings yet. Click “New meeting” to add this week\'s.</li>';
    } catch (err) {
      if (err.auth) return show('v-login');
      $('mlist').innerHTML = `<li class="err">${esc(err.message)}</li>`;
    }
  }
  $('mlist').addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) openMeeting(b.getAttribute('data-open')); });
  $('back').onclick = openList;
  $('new-meeting').onclick = () => {
    const latest = listData && listData.meetings[0] ? listData.meetings[0].meeting_date : null;
    const base = latest && latest >= manilaToday() ? latest : null;
    fillForm({
      meeting_date: nextThursdayAfter(base),
      time_text: '12:15 PM',
      registration_text: 'Registration and lunch from 11:00 AM',
      venue: state.lastVenue && state.lastVenue.venue || '',
      status: 'draft', rsvp_open: true,
    });
    state.meeting = null; state.signups = [];
    $('ed-title').textContent = 'New meeting';
    $('spanel').classList.add('hidden');
    renderLinks();
    show('v-edit');
  };

  // ---------- form ----------
  function fillForm(m) {
    TEXT.forEach((k) => { F.elements[k].value = m[k] || ''; });
    F.elements.published.checked = m.status === 'published';
    F.elements.rsvp_open.checked = m.rsvp_open !== false;
    setPoster(m.poster_path || null);
    $('save-msg').textContent = ''; $('fill-msg').textContent = ''; $('paste').value = '';
  }
  function readForm() {
    const f = {};
    TEXT.forEach((k) => { f[k] = F.elements[k].value.trim(); });
    f.status = F.elements.published.checked ? 'published' : 'draft';
    f.rsvp_open = F.elements.rsvp_open.checked;
    f.poster_path = state.posterPath;
    return f;
  }
  function setPoster(path) {
    state.posterPath = path;
    $('poster-img').hidden = !path; $('poster-rm').hidden = !path;
    if (path) $('poster-img').src = imgUrl(path, 300);
  }
  function renderLinks() {
    const m = state.meeting;
    if (!m) { $('ed-links').innerHTML = ''; $('mshare').hidden = true; return; }
    const url = location.origin + '/meetings/' + m.meeting_date;
    $('ed-links').innerHTML = (m.status === 'published' ? `<a class="btn btn-line" style="color:var(--blue)" href="/meetings/${m.meeting_date}" target="_blank" rel="noopener">View on website ↗</a><button class="btn btn-gold" type="button" id="copy-link">Copy sign-up link for Viber</button>` : '<span class="tag flag">Draft: not on the website yet</span>');
    const b = $('copy-link');
    if (b) b.onclick = () => copyText(`Sign up for ${m.label || 'our meeting'} on ${longDate(m.meeting_date)}${m.topic ? ` (${m.topic})` : ''} here:\n${url}`, b);
    renderShare();
  }

  // ---------- share this meeting on Viber: a ready message and a picture (the poster, or a card made here) ----------
  const SITE = 'https://rcmanila.org';
  let msMode = 'announce';
  function reminderMessage() {
    const m = state.meeting; if (!m) return '';
    const n = (state.signups || []).length;
    const L = [`⏰ Reminder: *${m.label || 'Our weekly meeting'}* is this ${longDate(m.meeting_date)}.`];
    if (m.speaker) L.push(`🎤 ${m.speaker}${m.speaker_title ? ', ' + m.speaker_title : ''}${m.topic ? ` on “${m.topic}”` : ''}`);
    const when = [m.time_text, m.venue].filter(Boolean).join(' · ');
    if (when) L.push(`🕛 ${when}`);
    if (m.rsvp_open !== false) L.push('', n ? `${n} ${n === 1 ? 'member has' : 'members have'} signed up so far. Not yet? Sign up here:` : 'Sign up here so the Secretariat can prepare your seat:', `${SITE}/meetings/${m.meeting_date}`);
    return L.join('\n');
  }
  function currentMessage() { return msMode === 'remind' ? reminderMessage() : meetingMessage(); }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-msmode]'); if (!b) return; msMode = b.getAttribute('data-msmode'); document.querySelectorAll('[data-msmode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); $('ms-msg').textContent = currentMessage(); });
  function meetingMessage() {
    const m = state.meeting; if (!m) return '';
    const L = [`📅 *${m.label || 'Weekly meeting'}*`, longDate(m.meeting_date)];
    if (m.speaker) L.push('', `🎤 Guest speaker: *${m.speaker}*${m.speaker_title ? ', ' + m.speaker_title : ''}`);
    if (m.topic) L.push(`Topic: ${m.topic}`);
    const when = [m.time_text, m.venue].filter(Boolean).join(' · ');
    if (when) L.push('', `🕛 ${when}`);
    if (m.registration_text) L.push(m.registration_text);
    if (m.notes) L.push('', m.notes.trim());
    if (m.rsvp_open !== false) L.push('', 'Coming? Sign up here so the Secretariat can prepare your seat:', `${SITE}/meetings/${m.meeting_date}`);
    else L.push('', 'Details:', `${SITE}/meetings/${m.meeting_date}`);
    return L.join('\n');
  }
  let msBlob = null, msFor = '';
  function loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = rej; im.src = src; }); }
  function wrap(x, text, maxW) { const out = []; let line = ''; for (const w of String(text).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }
  async function drawMeetingCard() {
    const m = state.meeting; if (!m) return;
    const key = [m.id, m.updated_at, m.poster_path].join('|');
    if (key === msFor && msBlob) return;
    const c = $('ms-card'), x = c.getContext('2d');
    if (m.poster_path) {
      try {
        const im = await loadImg(imgUrl(m.poster_path, 1400) + (m.updated_at ? '&v=' + Date.parse(m.updated_at) : ''));
        c.width = Math.min(1400, im.width); c.height = Math.round(c.width * im.height / im.width);
        x.drawImage(im, 0, 0, c.width, c.height);
        msBlob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9)); msFor = key; return;
      } catch (e) { /* fall back to the card */ }
    }
    const W = 1080, H = 1350; c.width = W; c.height = H;
    x.fillStyle = '#17458f'; x.fillRect(0, 0, W, H);
    try { const logo = await loadImg('/assets/club-logo-white.png'); const lh = 80, lw = logo.width * lh / logo.height; x.drawImage(logo, 72, 64, lw, lh); } catch (e) {}
    x.fillStyle = '#f7a81b'; x.fillRect(72, 230, 120, 8);
    x.fillStyle = '#f7a81b'; x.font = '800 30px "Open Sans", Arial, sans-serif'; x.fillText((m.label || 'Weekly meeting').toUpperCase(), 72, 300, W - 144);
    x.fillStyle = '#fff'; x.font = '700 76px Georgia, "Times New Roman", serif';
    const d = new Date(m.meeting_date + 'T12:00:00+08:00');
    x.fillText(d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Asia/Manila' }), 72, 400);
    x.fillText(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' }), 72, 490);
    let y = 620;
    if (m.speaker) {
      x.fillStyle = '#b9d9eb'; x.font = '700 28px "Open Sans", Arial, sans-serif'; x.fillText('GUEST SPEAKER', 72, y); y += 64;
      x.fillStyle = '#fff'; x.font = '700 56px Georgia, "Times New Roman", serif';
      for (const l of wrap(x, m.speaker, W - 144).slice(0, 2)) { x.fillText(l, 72, y); y += 66; }
      if (m.speaker_title) { x.fillStyle = '#dbe8f5'; x.font = '600 30px "Open Sans", Arial, sans-serif'; for (const l of wrap(x, m.speaker_title, W - 144).slice(0, 2)) { x.fillText(l, 72, y); y += 42; } }
      y += 30;
    }
    if (m.topic) { x.fillStyle = '#f7a81b'; x.font = 'italic 700 40px Georgia, "Times New Roman", serif'; for (const l of wrap(x, '“' + m.topic + '”', W - 144).slice(0, 3)) { x.fillText(l, 72, y); y += 52; } }
    x.fillStyle = '#0c2d62'; x.fillRect(0, H - 190, W, 190); x.fillStyle = '#f7a81b'; x.fillRect(0, H - 190, W, 6);
    x.fillStyle = '#fff'; x.font = '600 32px "Open Sans", Arial, sans-serif';
    const when = [m.time_text, m.venue].filter(Boolean).join('  ·  ');
    if (when) x.fillText(when, 72, H - 118, W - 144);
    x.fillStyle = '#f7a81b'; x.font = '800 32px "Open Sans", Arial, sans-serif'; x.fillText(`Sign up at rcmanila.org/meeting`, 72, H - 62, W - 144);
    msBlob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9)); msFor = key;
  }
  function renderShare() {
    const m = state.meeting, box = $('mshare');
    if (!m) { box.hidden = true; return; }
    box.hidden = false;
    $('ms-note').textContent = m.status === 'published' ? '' : '(draft: the link works once “Show this meeting on the website” is ticked and saved)';
    $('ms-msg').textContent = currentMessage();
    drawMeetingCard().catch(() => {});
  }
  async function msCopy(t) { try { await navigator.clipboard.writeText(t); return true; } catch (e) { return false; } }
  $('ms-copy').onclick = () => copyText(currentMessage(), $('ms-copy'));
  $('ms-dl').onclick = async () => { await drawMeetingCard(); if (!msBlob) return; const a = document.createElement('a'); a.href = URL.createObjectURL(msBlob); a.download = `meeting-${state.meeting.meeting_date}.jpg`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
  $('ms-go').onclick = async () => {
    const msg = currentMessage(); await msCopy(msg); await drawMeetingCard();
    const file = msBlob ? new File([msBlob], `meeting-${state.meeting.meeting_date}.jpg`, { type: 'image/jpeg' }) : null;
    try {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: msg });
      else if (navigator.share) await navigator.share({ text: msg });
      else { copyText(msg, $('ms-go')); }
    } catch (e) { /* share menu closed */ }
  };
  async function openMeeting(id) {
    show('v-edit');
    $('ed-title').textContent = 'Loading…';
    try {
      const d = await call('m-get', { id });
      state.meeting = d.meeting; state.signups = d.signups;
      fillForm(d.meeting);
      $('ed-title').textContent = shortDate(d.meeting.meeting_date) + (d.meeting.label ? ' · ' + d.meeting.label : '');
      $('spanel').classList.remove('hidden');
      renderLinks(); renderSignups();
    } catch (err) { if (err.auth) return show('v-login'); $('ed-title').textContent = err.message; }
  }

  F.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fields = readForm();
    if (!fields.meeting_date) { $('save-msg').textContent = 'Choose the meeting date.'; return; }
    $('save').disabled = true; $('save-msg').textContent = 'Saving…';
    try {
      const { meeting } = await call('m-save', { id: state.meeting && state.meeting.id, fields });
      const isNew = !state.meeting;
      state.meeting = meeting;
      $('ed-title').textContent = shortDate(meeting.meeting_date) + (meeting.label ? ' · ' + meeting.label : '');
      $('save-msg').textContent = meeting.status === 'published' ? 'Saved. It is on the website now (it can take up to a minute to appear).' : 'Saved as a draft. Tick “Show this meeting on the website” when it is ready.';
      if (isNew) { state.signups = []; $('spanel').classList.remove('hidden'); renderSignups(); }
      renderLinks();
    } catch (err) { if (err.auth) return show('v-login'); $('save-msg').textContent = err.message; }
    finally { $('save').disabled = false; }
  });
  $('del').onclick = async () => {
    if (!state.meeting) { openList(); return; }
    if (!window.confirm('Delete this meeting and its sign-up list? This cannot be undone.')) return;
    try { await call('m-delete', { id: state.meeting.id }); openList(); } catch (err) { $('save-msg').textContent = err.message; }
  };

  // Quick fill from the Viber announcement.
  $('fill').onclick = async () => {
    const text = $('paste').value.trim();
    if (text.length < 20) { $('fill-msg').textContent = 'Paste the announcement first.'; return; }
    $('fill').disabled = true; $('fill-msg').textContent = 'Reading the announcement… (about 10 seconds)';
    try {
      const d = await call('m-parse', { text });
      let n = 0;
      TEXT.forEach((k) => { if (d[k]) { F.elements[k].value = d[k]; n++; } });
      $('fill-msg').textContent = n ? 'Done. Check the details below, then click Save.' : 'Could not find the details. Please type them in.';
    } catch (err) { $('fill-msg').textContent = err.message; }
    finally { $('fill').disabled = false; }
  };

  // Poster upload: shrink on this computer, then save to storage.
  function shrink(file, maxW) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, maxW / img.naturalWidth);
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the image.'))), 'image/jpeg', 0.86);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => reject(new Error('That file is not an image this browser can open. Try a JPG or PNG.'));
      img.src = URL.createObjectURL(file);
    });
  }
  $('poster-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    const date = F.elements.meeting_date.value;
    if (!date) { $('poster-msg').textContent = 'Choose the meeting date first.'; return; }
    $('poster-msg').textContent = 'Uploading…';
    try {
      const blob = await shrink(file, 1600);
      const s = await call('m-poster-sign', { meeting_date: date });
      const fd = new FormData(); fd.append('cacheControl', '31536000'); fd.append('', blob, 'poster.jpg');
      const r = await fetch(s.signedUrl, { method: 'PUT', headers: { 'x-upsert': 'true' }, body: fd });
      if (!r.ok) throw new Error('Upload failed (' + r.status + ').');
      setPoster(s.path);
      $('poster-msg').textContent = 'Uploaded. Click Save to keep it.';
    } catch (err) { $('poster-msg').textContent = err.message; }
  });
  $('poster-rm').onclick = () => { setPoster(null); $('poster-msg').textContent = 'Removed. Click Save to keep this change.'; };

  // ---------- sign-ups ----------
  const lineOf = (s) => s.name + (s.affiliation ? ' - ' + s.affiliation : '') + (s.kind === 'guest' && s.guest_of ? ` (guest of ${s.guest_of})` : '');
  function renderSignups() {
    if (state.meeting && !$('mshare').hidden) $('ms-msg').textContent = currentMessage();
    const list = state.signups;
    const guests = list.filter((s) => s.kind === 'guest').length;
    $('stats').innerHTML = `<div class="stat"><b>${list.length}</b>total</div><div class="stat"><b>${list.length - guests}</b>members</div><div class="stat"><b>${guests}</b>guests</div>`;
    $('slist').innerHTML = list.length ? list.map((s) => `<li><span class="nm">${esc(lineOf(s))}</span><span class="src">${s.source === 'web' ? 'website' : 'added'}</span><button type="button" title="Remove" aria-label="Remove ${esc(s.name)}" data-rm="${s.id}">×</button></li>`).join('') : '<li class="muted" style="list-style:none">No one yet. Share the sign-up link in Viber, or add names below.</li>';
  }
  async function reloadSignups() {
    if (!state.meeting) return;
    const d = await call('m-get', { id: state.meeting.id });
    state.signups = d.signups; renderSignups();
  }
  $('refresh').onclick = () => reloadSignups().catch((err) => alertMsg(err.message));
  function alertMsg(m) { $('add-msg').textContent = m; }
  $('slist').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    const s = state.signups.find((x) => x.id === b.getAttribute('data-rm'));
    if (!s || !window.confirm(`Remove “${s.name}” from the list?`)) return;
    try { await call('m-remove-signup', { id: s.id }); await reloadSignups(); } catch (err) { alertMsg(err.message); }
  });
  $('add-btn').onclick = async () => {
    const text = $('add-text').value;
    if (!text.trim()) return;
    $('add-btn').disabled = true; $('add-msg').textContent = 'Adding…';
    try {
      const r = await call('m-add-names', { meeting_id: state.meeting.id, text });
      $('add-text').value = '';
      $('add-msg').textContent = `Added ${r.added}${r.skipped ? `; ${r.skipped} already on the list` : ''}.`;
      await reloadSignups();
    } catch (err) { $('add-msg').textContent = err.message; }
    finally { $('add-btn').disabled = false; }
  };

  function copyText(text, btn) {
    const done = () => { const t = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = t; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => fallback());
    else fallback();
    function fallback() { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} ta.remove(); }
  }
  $('copy-list').onclick = () => {
    const m = state.meeting;
    const head = `Attending: ${m.label || 'Weekly meeting'}, ${longDate(m.meeting_date)}${m.topic ? ` (${m.topic})` : ''}`;
    copyText(head + '\n\n' + state.signups.map((s, i) => `${i + 1}. ${lineOf(s)}`).join('\n'), $('copy-list'));
  };
  $('dl').onclick = () => {
    const m = state.meeting;
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['No.', 'Name', 'Member or guest', 'Guest of', 'Title / organization', 'Signed up via', 'Signed up (Manila time)']].concat(
      state.signups.map((s, i) => [i + 1, s.name, s.kind === 'guest' ? 'Guest' : 'Member', s.guest_of || '', s.affiliation || '', s.source === 'web' ? 'Website' : 'Added by Secretariat',
        new Date(s.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })]));
    const csv = '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `RCM-attendees-${m.meeting_date}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  if (code) call('login', { need: 'meetings' }).then(openHome).catch(() => show('v-login')); else show('v-login');
})();

/* Secretariat: members' weekly attendance, make-ups, the quarterly ranking and the member list.
   Private: served only through rcm-admin with the Secretariat or editor passcode. */
(function () {
  const $ = (id) => document.getElementById(id);
  const S = () => window.RCMSec;
  const esc = (s) => S().esc(s);
  const CURRENT = ['ACTIVE', 'SR. ACTIVE', 'EXEMPTED', 'ON LEAVE'];
  const TAG = { 'SR. ACTIVE': 'Senior', EXEMPTED: 'Exempted', 'ON LEAVE': 'On leave', RESIGNED: 'Resigned', TERMINATED: 'Terminated', DECEASED: 'Deceased', FORMER: 'Former' };
  const manilaToday = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const shortDate = (iso) => new Date(iso + 'T12:00:00+08:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' });
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  function lastThursday(iso) { let d = iso || manilaToday(); while (new Date(d + 'T12:00:00Z').getUTCDay() !== 4) d = addDays(d, -1); return d; }
  const tag = (st) => TAG[st] ? `<span class="tag">${esc(TAG[st])}</span>` : '';
  const fail = (err, el) => { if (err.auth) return S().show('v-login'); if (el) { el.textContent = err.message; el.className = 'err'; } };

  // ---------- name matching (for pasted Viber lists and website sign-ups) ----------
  const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9, ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const TITLES = /^(rtn|rtn\.|rotarian|pp|pdg|dg|dgn|dge|ipp|pe|pn|vp|dir|director|sec|secretary|treas|treasurer|atty|dr|engr|hon|sir|mr|ms|mrs|star rtn|star|past president|president|pres|ret|gen|amb|saa|dsaa)\s+/;
  function stripTitles(s) { let x = s, prev; do { prev = x; x = x.replace(TITLES, ''); } while (x !== prev); return x; }
  let index = null;
  function buildIndex(members) {
    const byNick = new Map(), rows = [];
    for (const m of members) {
      const nick = norm(m.nickname);
      const [sur, given = ''] = String(m.full_name).split(',');
      const s = norm(sur), g = norm(given).split(' ').filter((t) => t.length > 1 && !/^(jr|sr|ii|iii|iv|md)$/.test(t));
      const toks = new Set([...nick.split(' '), ...s.split(' '), ...g].filter(Boolean));
      if (nick) byNick.set(nick, m.id);
      byNick.set(norm((g[0] || '') + ' ' + s), byNick.get(norm((g[0] || '') + ' ' + s)) === undefined ? m.id : null);
      rows.push({ id: m.id, sur: s, toks });
    }
    return { byNick, rows };
  }
  function matchName(line) {
    let x = norm(line.replace(/^\s*\d+\s*[.)\-]?\s*/, '').replace(/\(.*?\)/g, ' '));
    x = stripTitles(x);
    if (!x || x.length < 2) return null;
    if (x.includes(',')) { const [a, b] = x.split(','); x = norm(b + ' ' + a); }
    x = x.replace(/,/g, ' ').trim();
    const hit = index.byNick.get(x);
    if (hit) return hit;
    const words = x.split(' ').filter((t) => t.length > 1 && !/^(jr|sr|ii|iii|iv)$/.test(t));
    if (!words.length) return null;
    let cands = index.rows.filter((r) => words.every((w) => r.toks.has(w)));
    if (cands.length === 1) return cands[0].id;
    if (words.length >= 2) {
      const last = words[words.length - 1];
      cands = index.rows.filter((r) => r.sur.split(' ').includes(last) && [...r.toks].some((t) => t.startsWith(words[0].slice(0, 3))));
      if (cands.length === 1) return cands[0].id;
    }
    return null;
  }

  // ---------- sub-tabs ----------
  let sub = 'take';
  function showSub(k) {
    sub = k;
    document.querySelectorAll('#att-sub [data-sub]').forEach((b) => b.setAttribute('aria-current', String(b.getAttribute('data-sub') === k)));
    $('att-take').classList.toggle('hidden', k !== 'take');
    $('att-mk').classList.toggle('hidden', k !== 'mk');
    $('att-rep').classList.toggle('hidden', k !== 'rep');
    $('att-mem').classList.toggle('hidden', k !== 'mem');
    if (k === 'take') openTake(); else if (k === 'mk') openMk(); else if (k === 'rep') openRep(); else openMem();
  }
  $('att-sub').addEventListener('click', (e) => { const b = e.target.closest('[data-sub]'); if (b) { if (sub === 'take' && dirty() && !confirm('You have unsaved attendance. Leave without saving?')) return; showSub(b.getAttribute('data-sub')); } });
  document.querySelector('.sec-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b && b.getAttribute('data-tab') === 'v-att') { S().show('v-att'); showSub(sub); } });

  // ---------- take attendance ----------
  let T = { date: null, members: [], present: new Set(), saved: new Set(), signups: [], kind: 'regular' };
  const dirty = () => T.date && (T.present.size !== T.saved.size || [...T.present].some((x) => !T.saved.has(x)) || $('att-none').checked !== (T.kind === 'none'));
  async function openTake(date) {
    const d = date || T.date || lastThursday();
    $('att-date').value = d; $('att-date').max = manilaToday();
    $('att-msg').textContent = ''; $('att-msg').className = 'muted';
    $('att-list').innerHTML = '<li class="muted">Loading…</li>';
    try {
      const r = await S().call('m-att-get', { date: d });
      T = { date: d, members: r.members, present: new Set(r.present), saved: new Set(r.present), signups: r.signups || [], kind: r.meeting ? r.meeting.kind : 'regular' };
      index = buildIndex(T.members);
      $('att-title').value = r.meeting ? (r.meeting.title || '') : (r.suggested_title || '');
      $('att-none').checked = T.kind === 'none';
      const sb = $('att-signups');
      sb.hidden = !T.signups.length; sb.textContent = `Tick the ${T.signups.length} members who signed up on the website`;
      drawTake();
      loadRecent();
    } catch (err) { fail(err, $('att-msg')); }
  }
  function drawTake() {
    const q = norm($('att-q').value), only = $('att-only').checked, none = $('att-none').checked;
    const list = T.members.filter((m) => (!only || T.present.has(m.id)) && (!q || norm(m.full_name + ' ' + (m.nickname || '')).includes(q)));
    $('att-list').innerHTML = list.map((m) => `<li><label class="${T.present.has(m.id) ? 'on' : ''}"><input type="checkbox" data-m="${m.id}" ${T.present.has(m.id) ? 'checked' : ''} ${none ? 'disabled' : ''}><span>${esc(m.full_name)} ${tag(m.status)}</span><span class="nk">${esc(m.nickname || '')}</span></label></li>`).join('') || '<li class="muted">No member matches.</li>';
    $('att-count').textContent = none ? 0 : T.present.size;
    $('att-dirty').textContent = dirty() ? '· not saved yet' : '';
    $('att-quick').classList.toggle('hidden', none);
  }
  $('att-list').addEventListener('change', (e) => { const c = e.target.closest('[data-m]'); if (!c) return; c.checked ? T.present.add(c.getAttribute('data-m')) : T.present.delete(c.getAttribute('data-m')); c.closest('label').classList.toggle('on', c.checked); $('att-count').textContent = T.present.size; $('att-dirty').textContent = dirty() ? '· not saved yet' : ''; });
  $('att-q').oninput = drawTake; $('att-only').onchange = drawTake; $('att-none').onchange = drawTake;
  $('att-date').onchange = () => {
    const d = $('att-date').value; if (!d) return;
    if (dirty() && !confirm('You have unsaved attendance for ' + shortDate(T.date) + '. Switch dates without saving?')) { $('att-date').value = T.date; return; }
    openTake(d);
  };
  function tickLines(lines, where) {
    let n = 0; const miss = [];
    for (const l of lines) { const id = matchName(l); if (id) { if (!T.present.has(id)) n++; T.present.add(id); } else if (norm(l).length > 1) miss.push(l.trim()); }
    drawTake();
    $('att-paste-msg').innerHTML = `Ticked ${n} more.` + (miss.length ? ` <strong>Not found (${miss.length}):</strong> ${esc(miss.slice(0, 25).join('; '))}${miss.length > 25 ? '…' : ''}. Tick them by hand, or they may be guests.` : ' Everyone was found.');
  }
  $('att-paste-go').onclick = () => tickLines($('att-paste').value.split(/\r?\n/).filter((l) => l.trim()), 'paste');
  $('att-signups').onclick = () => tickLines(T.signups, 'web');
  $('att-clear').onclick = () => { if (T.present.size && confirm('Untick everyone for this date?')) { T.present.clear(); drawTake(); } };
  $('att-save').onclick = async () => {
    const btn = $('att-save'); btn.disabled = true; $('att-msg').className = 'muted'; $('att-msg').textContent = 'Saving…';
    try {
      const none = $('att-none').checked;
      const r = await S().call('m-att-save', { date: T.date, title: $('att-title').value, kind: none ? 'none' : 'regular', present: [...T.present] });
      T.saved = new Set(none ? [] : T.present); T.kind = none ? 'none' : 'regular'; if (none) T.present.clear();
      $('att-msg').textContent = none ? `Saved: no meeting on ${shortDate(T.date)}.` : `Saved: ${r.present} members present on ${shortDate(T.date)}.`;
      drawTake(); loadRecent();
    } catch (err) { fail(err, $('att-msg')); }
    btn.disabled = false;
  };
  async function loadRecent() {
    try {
      const r = await S().call('m-att-list', { from: addDays(manilaToday(), -200), to: manilaToday() });
      const have = new Set(r.meetings.map((m) => m.meeting_date));
      const rows = r.meetings.slice();
      // Show Thursdays that have passed but have no attendance yet, so nothing is forgotten.
      for (let d = lastThursday(); d > addDays(manilaToday(), -35); d = addDays(d, -7)) if (!have.has(d)) rows.push({ meeting_date: d, title: null, kind: 'todo', present: 0 });
      rows.sort((a, b) => (a.meeting_date < b.meeting_date ? 1 : -1));
      $('att-recent').innerHTML = rows.map((m) => `<li><button type="button" data-d="${m.meeting_date}" aria-current="${m.meeting_date === T.date}"><span>${esc(shortDate(m.meeting_date))}</span><b>${m.kind === 'none' ? '<span class="tag">No meeting</span>' : m.kind === 'todo' ? '<span class="tag" style="background:#fdf0d5;color:#8a4b00">Not taken</span>' : m.present}</b><small>${esc(m.title || '')}</small></button></li>`).join('');
    } catch (err) { /* list is optional */ }
  }
  $('att-recent').addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (!b) return; if (dirty() && !confirm('You have unsaved attendance. Switch dates without saving?')) return; openTake(b.getAttribute('data-d')); });
  window.addEventListener('beforeunload', (e) => { if (!$('v-att').classList.contains('hidden') && sub === 'take' && dirty()) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- make-ups ----------
  let MK = { month: null, members: [], counts: new Map(), orig: new Map() };
  async function openMk() {
    const m = $('mk-month').value || manilaToday().slice(0, 7);
    $('mk-month').value = m; $('mk-month').max = manilaToday().slice(0, 7);
    $('mk-rows').innerHTML = '<tr><td colspan="4" class="muted">Loading…</td></tr>';
    try {
      const [mem, r] = await Promise.all([membersAll(), S().call('m-att-makeups', { month: m })]);
      const counts = new Map(r.makeups.map((x) => [x.member_id, x.count]));
      MK = { month: m, members: mem.filter((x) => CURRENT.includes(x.status) || counts.has(x.id)), counts, orig: new Map(counts) };
      drawMk(); $('mk-msg').textContent = '';
    } catch (err) { fail(err, $('mk-msg')); }
  }
  function drawMk() {
    const q = norm($('mk-q').value);
    const list = MK.members.filter((m) => !q || norm(m.full_name + ' ' + (m.nickname || '')).includes(q));
    $('mk-rows').innerHTML = list.map((m, i) => `<tr><td>${i + 1}</td><td>${esc(m.full_name)}</td><td>${tag(m.status) || '<span class="muted">Active</span>'}</td><td><input class="mk-in" type="number" min="0" max="10" data-mk="${m.id}" value="${MK.counts.get(m.id) || ''}"></td></tr>`).join('');
  }
  $('mk-rows').addEventListener('input', (e) => { const i = e.target.closest('[data-mk]'); if (!i) return; MK.counts.set(i.getAttribute('data-mk'), Math.max(0, Math.min(10, Number(i.value) || 0))); });
  $('mk-q').oninput = drawMk; $('mk-month').onchange = openMk;
  $('mk-save').onclick = async () => {
    const set = [...MK.counts].filter(([id, n]) => (MK.orig.get(id) || 0) !== n).map(([member_id, count]) => ({ member_id, count }));
    if (!set.length) { $('mk-msg').textContent = 'Nothing changed.'; return; }
    $('mk-msg').textContent = 'Saving…';
    try { const r = await S().call('m-att-makeups', { month: MK.month, set }); MK.orig = new Map(r.makeups.map((x) => [x.member_id, x.count])); MK.counts = new Map(MK.orig); $('mk-msg').textContent = `Saved ${set.length} change${set.length > 1 ? 's' : ''}.`; }
    catch (err) { fail(err, $('mk-msg')); }
  };

  // ---------- report ----------
  function presets() {
    const t = manilaToday(), y = Number(t.slice(0, 4)), mo = Number(t.slice(5, 7));
    const ry = mo >= 7 ? y : y - 1; // Rotary year starts 1 July
    const Q = [['07-01', '09-30', 0], ['10-01', '12-31', 0], ['01-01', '03-31', 1], ['04-01', '06-30', 1]];
    const out = [];
    const qNow = mo >= 7 ? (mo <= 9 ? 0 : 1) : (mo <= 3 ? 2 : 3);
    for (let k = qNow, yr = ry, n = 0; n < 4; n++) {
      const [a, b, off] = Q[k];
      out.push({ label: `${['1st', '2nd', '3rd', '4th'][k]} quarter, RY ${yr}–${String(yr + 1).slice(2)}${n === 0 ? ' (so far)' : ''}`, from: `${yr + off}-${a}`, to: `${yr + off}-${b}` });
      k--; if (k < 0) { k = 3; yr--; }
    }
    out.unshift({ label: `Rotary year ${ry}–${String(ry + 1).slice(2)} so far`, from: `${ry}-07-01`, to: t });
    for (let yr = ry - 1; yr >= 2023; yr--) out.push({ label: `Full Rotary year ${yr}–${String(yr + 1).slice(2)}`, from: `${yr}-07-01`, to: `${yr + 1}-06-30` });
    return out;
  }
  let R = [], P = [];
  function openRep() {
    if (!P.length) {
      P = presets();
      $('rep-preset').innerHTML = P.map((p, i) => `<option value="${i}">${esc(p.label)}</option>`).join('') + '<option value="custom">Custom dates</option>';
      $('rep-preset').value = '1'; setPreset();
    }
    loadRep();
  }
  function setPreset() { const p = P[Number($('rep-preset').value)]; if (p) { $('rep-from').value = p.from; $('rep-to').value = p.to; } }
  $('rep-preset').onchange = () => { setPreset(); loadRep(); };
  $('rep-from').onchange = $('rep-to').onchange = () => { $('rep-preset').value = 'custom'; loadRep(); };
  $('rep-status').onchange = drawRep;
  async function loadRep() {
    $('rep-rows').innerHTML = '<tr><td colspan="8" class="muted">Loading…</td></tr>';
    try { R = (await S().call('m-att-report', { from: $('rep-from').value, to: $('rep-to').value })).rows; drawRep(); }
    catch (err) { if (err.auth) return S().show('v-login'); $('rep-rows').innerHTML = `<tr><td colspan="8" class="err">${esc(err.message)}</td></tr>`; }
  }
  function repRows() {
    const f = $('rep-status').value;
    return R.filter((r) => f === 'all' || (f === 'current' ? CURRENT.includes(r.status) : r.status === f))
      .map((r) => { const tot = Math.min(r.regular + r.makeups, r.meetings); return Object.assign({}, r, { total: tot, pct: r.meetings ? tot / r.meetings : 0 }); })
      .sort((a, b) => b.pct - a.pct || b.regular - a.regular || a.full_name.localeCompare(b.full_name));
  }
  const pct = (x) => Math.round(x * 100) + '%';
  function drawRep() {
    const rows = repRows(), n = rows[0] ? rows[0].meetings : 0;
    const avg = rows.length ? rows.reduce((s, r) => s + r.pct, 0) / rows.length : 0;
    const full = rows.filter((r) => r.pct >= 1).length, low = rows.filter((r) => r.pct < 0.5).length;
    $('rep-stats').innerHTML = `<div class="stat"><b>${n}</b>meetings held</div><div class="stat"><b>${rows.length}</b>members listed</div><div class="stat"><b>${pct(avg)}</b>average attendance</div><div class="stat"><b>${full}</b>at 100%</div><div class="stat"><b>${low}</b>below 50%</div>`;
    $('rep-rows').innerHTML = rows.map((r, i) => `<tr class="${r.pct < 0.5 ? 'low' : ''}"><td>${i + 1}</td><td>${esc(r.full_name)}</td><td>${tag(r.status) || '<span class="muted">Active</span>'}</td><td>${r.regular}</td><td>${r.makeups || ''}</td><td><b>${r.total}</b></td><td>${r.meetings}</td><td><b>${pct(r.pct)}</b></td></tr>`).join('') || '<tr><td colspan="8" class="muted">No meetings recorded in these dates.</td></tr>';
  }
  $('rep-csv').onclick = () => {
    const rows = repRows();
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = [['Rank', 'Full name', 'Nickname', 'RI no.', 'Status', 'Regular attendance', 'Make-ups', 'Total', 'Meetings held', 'Percent'].map(q).join(',')]
      .concat(rows.map((r, i) => [i + 1, r.full_name, r.nickname, r.ri_no, r.status, r.regular, r.makeups, r.total, r.meetings, pct(r.pct)].map(q).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `RCM-attendance-${$('rep-from').value}-to-${$('rep-to').value}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  // ---------- members ----------
  let M = null;
  async function membersAll(force) { if (!M || force) M = (await S().call('m-att-members')).members; return M; }
  const STATUSES = ['ACTIVE', 'SR. ACTIVE', 'EXEMPTED', 'ON LEAVE', 'RESIGNED', 'TERMINATED', 'DECEASED', 'FORMER'];
  async function openMem() {
    $('mem-rows').innerHTML = '<tr><td colspan="5" class="muted">Loading…</td></tr>';
    try { await membersAll(true); drawMem(); } catch (err) { if (err.auth) return S().show('v-login'); $('mem-rows').innerHTML = `<tr><td colspan="5" class="err">${esc(err.message)}</td></tr>`; }
  }
  function drawMem() {
    const q = norm($('mem-q').value), all = $('mem-show').value === 'all';
    const list = M.filter((m) => (all || CURRENT.includes(m.status)) && (!q || norm(m.full_name + ' ' + (m.nickname || '') + ' ' + (m.ri_no || '')).includes(q)));
    $('mem-rows').innerHTML = list.map((m, i) => `<tr><td>${i + 1}</td><td>${esc(m.full_name)}</td><td>${esc(m.nickname || '')}</td><td>${esc(m.ri_no || '')}</td><td class="mini"><select data-st="${m.id}">${STATUSES.map((s) => `<option ${s === m.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('');
  }
  $('mem-q').oninput = () => M && drawMem(); $('mem-show').onchange = () => M && drawMem();
  $('mem-rows').addEventListener('change', async (e) => {
    const s = e.target.closest('[data-st]'); if (!s) return;
    s.disabled = true;
    try { const r = await S().call('m-att-member-save', { id: s.getAttribute('data-st'), status: s.value }); const m = M.find((x) => x.id === r.member.id); if (m) m.status = r.member.status; }
    catch (err) { alert(err.message); }
    s.disabled = false;
  });
  $('mem-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, msg = $('mem-msg');
    msg.className = 'muted'; msg.textContent = 'Saving…';
    try {
      const r = await S().call('m-att-member-save', { full_name: f.full_name.value, nickname: f.nickname.value, ri_no: f.ri_no.value, status: f.status.value });
      M.push(r.member); M.sort((a, b) => a.full_name.localeCompare(b.full_name)); f.reset();
      msg.textContent = `Added ${r.member.full_name}.`; drawMem();
    } catch (err) { fail(err, msg); }
  });
})();

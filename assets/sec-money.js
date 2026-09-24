/* Secretariat: donations sent through the Donate page, and the initiatives donors can choose. */
(function () {
  const $ = (id) => document.getElementById(id);
  const S = () => window.RCMSec;
  const esc = (s) => S().esc(s);
  const SB = 'https://unavxknqpibxwcoqemaf.supabase.co';
  const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
  const ref = (id) => id.slice(0, 8).toUpperCase();

  // What the screenshot check found, in plain words.
  const CHECK = {
    match: ['Amount matches', 'The screenshot shows the same amount, paid to Rotary Club of Manila.'],
    mismatch: ['Amount differs', 'The amount on the screenshot is different from what the donor typed.'],
    check_payee: ['Check the payee', 'The amount matches, but the payee on the screenshot does not say Rotary Club of Manila.'],
    duplicate: ['Same reference used before', 'Another donation already has this payment reference number. It may be sent twice.'],
    failed: ['Payment not completed', 'The screenshot shows a failed payment.'],
    unreadable: ['Could not read', 'The screenshot could not be read as a payment confirmation. Check it yourself.'],
    pending: ['Checking…', 'The screenshot is still being read. Click Refresh in a moment.'],
  };
  const STATUS = { new: 'New', verified: 'Verified', receipt_sent: 'Receipt sent', rejected: 'Rejected' };

  // ---------- tabs ----------
  document.querySelector('.sec-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    const t = b.getAttribute('data-tab');
    if (t === 'v-list') S().openList(); else if (t === 'v-don') openDon(); else openCamp();
  });

  // ---------- donations ----------
  let D = [], sel = null;
  async function openDon() {
    S().show('v-don');
    try { D = (await S().call('m-don-list')).donations; drawDon(); }
    catch (err) { if (err.auth) return S().show('v-login'); $('don-list').innerHTML = `<li class="err" style="padding:16px">${esc(err.message)}</li>`; }
  }
  function filtered() {
    const show = $('don-show').value, q = $('don-q').value.trim().toLowerCase();
    return D.filter((d) => (show === 'all' || (show === 'todo' ? d.status === 'new' : d.status === show)) &&
      (!q || [d.member_name, d.receipt_name, d.campaign_title, ref(d.id), d.ai && d.ai.reference].join(' ').toLowerCase().includes(q)));
  }
  function drawDon() {
    const ok = D.filter((d) => d.status === 'verified' || d.status === 'receipt_sent');
    const byCamp = {};
    ok.forEach((d) => { const k = d.campaign_title || 'Not specified'; byCamp[k] = (byCamp[k] || 0) + Number(d.amount); });
    $('don-stats').innerHTML = `<div class="stat"><b>${D.filter((d) => d.status === 'new').length}</b>to check</div><div class="stat"><b>${D.filter((d) => d.status === 'verified').length}</b>receipts to send</div><div class="stat"><b>${peso(ok.reduce((a, d) => a + Number(d.amount), 0))}</b>verified so far</div>` +
      Object.entries(byCamp).map(([k, v]) => `<div class="stat"><b>${peso(v)}</b>${esc(k)}</div>`).join('');
    const list = filtered();
    $('don-list').innerHTML = list.length ? list.map((d) => { const c = CHECK[d.check_status] || CHECK.pending; return `<li><button type="button" data-d="${d.id}" aria-current="${d.id === sel}"><span><b>${esc(d.member_name)}</b><br><small>${esc(when(d.created_at))} · ${esc(d.campaign_title || 'No initiative chosen')} · ${STATUS[d.status] || d.status}</small></span><span class="amt">${peso(d.amount)}<br><span class="chk ${esc(d.check_status)}">${c[0]}</span></span></button></li>`; }).join('')
      : '<li class="muted" style="padding:16px">Nothing here.</li>';
  }
  $('don-show').onchange = drawDon; $('don-q').oninput = drawDon; $('don-refresh').onclick = openDon;
  $('don-list').addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (b) openOne(b.getAttribute('data-d')); });

  async function openOne(id) {
    sel = id; drawDon();
    const d = D.find((x) => x.id === id); if (!d) return;
    const c = CHECK[d.check_status] || CHECK.pending, ai = d.ai || {};
    $('don-detail').innerHTML = `<div class="row" style="justify-content:space-between"><h2 style="font-size:22px">${esc(d.member_name)} · ${peso(d.amount)}</h2><span class="muted">Ref. ${ref(d.id)}</span></div>
<div class="note" style="${d.check_status === 'match' ? 'background:#e8f5ec;border-color:#b9dcc6;color:#1d5a36' : ''}"><strong>${c[0]}.</strong> ${c[1]}${ai.amount != null ? ` Screenshot: <b>${peso(ai.amount)}</b>${ai.recipient ? ` to ${esc(ai.recipient)}` : ''}${ai.reference ? `, ref. ${esc(ai.reference)}` : ''}${ai.date ? `, ${esc(ai.date)}${ai.time ? ' ' + esc(ai.time) : ''}` : ''}.` : ''}${ai.remark ? ` <em>${esc(ai.remark)}</em>` : ''}</div>
<dl class="kv"><dt>Sent</dt><dd>${esc(when(d.created_at))}</dd><dt>For</dt><dd>${esc(d.campaign_title || 'No initiative chosen')}</dd>
<dt>Donor (member)</dt><dd><input id="dd-member" value="${esc(d.member_name)}"></dd>
<dt>Name on receipt</dt><dd><input id="dd-receipt" value="${esc(d.receipt_name)}"></dd>
<dt>Amount they typed</dt><dd><input id="dd-amount" type="number" step="0.01" value="${esc(d.amount)}" style="max-width:180px"></dd>
<dt>Send receipt to</dt><dd>${esc(d.contact || '')}</dd>${d.notes ? `<dt>Their note</dt><dd>${esc(d.notes)}</dd>` : ''}
<dt>Status</dt><dd>${STATUS[d.status] || d.status}${d.verified_at ? ` · verified ${esc(when(d.verified_at))}` : ''}</dd></dl>
<label class="f">Secretariat note (only you see it)<textarea id="dd-note" style="min-height:60px">${esc(d.secretariat_note || '')}</textarea></label>
<div class="row"><button class="btn btn-blue" type="button" data-st="verified">Verified with bank record</button><button class="btn btn-gold" type="button" data-st="receipt_sent">Receipt sent</button><button class="smallbtn" type="button" data-st="save">Save changes</button><button class="smallbtn" type="button" data-st="rejected" style="color:#a3262a">Reject</button><button class="smallbtn" type="button" data-st="new">Back to new</button><button class="smallbtn" type="button" id="dd-recheck">Read screenshot again</button></div>
<p id="dd-msg" class="muted" aria-live="polite"></p>
<div class="stack" style="gap:8px"><strong>Screenshot</strong><div id="dd-proof" class="muted">Loading…</div></div>`;
    try { const { url } = await S().call('m-don-proof', { id }); if (sel === id) $('dd-proof').innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener"><img class="proof" src="${esc(url)}" alt="Payment screenshot"></a>`; }
    catch (err) { $('dd-proof').textContent = err.message; }
  }
  $('don-detail').addEventListener('click', async (e) => {
    const d = D.find((x) => x.id === sel); if (!d) return;
    const b = e.target.closest('[data-st]');
    if (b) {
      const st = b.getAttribute('data-st');
      const payload = { id: d.id, secretariat_note: $('dd-note').value, member_name: $('dd-member').value, receipt_name: $('dd-receipt').value, amount: $('dd-amount').value };
      if (st !== 'save') payload.status = st;
      if (st === 'rejected' && !window.confirm('Mark this donation as rejected? You can change it back later.')) return;
      $('dd-msg').textContent = 'Saving…';
      try { const { donation } = await S().call('m-don-update', payload); Object.assign(d, donation); drawDon(); openOne(d.id); }
      catch (err) { $('dd-msg').textContent = err.message; }
    }
    if (e.target.id === 'dd-recheck') {
      $('dd-msg').textContent = 'Reading the screenshot…';
      try { const { donation } = await S().call('m-don-recheck', { id: d.id }); Object.assign(d, donation); drawDon(); openOne(d.id); }
      catch (err) { $('dd-msg').textContent = err.message; }
    }
  });
  $('don-csv').onclick = () => {
    const rows = [['Ref', 'Date sent', 'Initiative', 'Donor (member)', 'Name on receipt', 'Amount typed', 'Amount on screenshot', 'Payment reference', 'Payment date', 'Screenshot check', 'Status', 'Send receipt to', 'Donor note', 'Secretariat note']]
      .concat(filtered().map((d) => { const ai = d.ai || {}; return [ref(d.id), when(d.created_at), d.campaign_title || '', d.member_name, d.receipt_name, d.amount, ai.amount ?? '', ai.reference || '', ai.date || '', (CHECK[d.check_status] || CHECK.pending)[0], STATUS[d.status] || d.status, d.contact || '', d.notes || '', d.secretariat_note || '']; }));
    const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `RCM-donations-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  // ---------- initiatives ----------
  let C = [], cur = null, campImg = null;
  async function openCamp() {
    S().show('v-camp');
    try { C = (await S().call('m-camp-list')).campaigns; drawCamp(); }
    catch (err) { if (err.auth) return S().show('v-login'); $('camp-list').innerHTML = `<li class="err" style="padding:16px">${esc(err.message)}</li>`; }
  }
  function drawCamp() {
    $('camp-list').innerHTML = C.length ? C.map((c) => `<li><button type="button" data-c="${c.id}" aria-current="${cur && cur.id === c.id}"><span><b>${esc(c.title)}</b><br><small>${esc(c.blurb || '')}</small></span><span class="chk ${c.active ? 'match' : 'pending'}">${c.active ? 'On the Donate page' : 'Hidden'}</span></button></li>`).join('')
      : '<li class="muted" style="padding:16px">No initiatives yet.</li>';
  }
  function editCamp(c) {
    cur = c; drawCamp();
    const f = $('camp-form'); f.classList.remove('hidden');
    f.title.value = c ? c.title : ''; f.blurb.value = c ? c.blurb || '' : ''; f.goal.value = c && c.goal != null ? c.goal : ''; f.sort.value = c ? c.sort : C.length; f.active.checked = c ? c.active : true;
    setImg(c ? c.image_path : null); $('camp-msg').textContent = ''; $('camp-del').hidden = !c;
  }
  function setImg(p) { campImg = p; $('camp-img').hidden = !p; if (p) $('camp-img').src = `${SB}/storage/v1/render/image/public/rcm/${p}?width=300&resize=contain`; }
  $('camp-new').onclick = () => editCamp(null);
  $('camp-list').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) editCamp(C.find((c) => c.id === b.getAttribute('data-c'))); });
  $('camp-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    $('camp-img-msg').textContent = 'Uploading…';
    try {
      const bm = await createImageBitmap(file); const k = Math.min(1, 1600 / bm.width);
      const cv = document.createElement('canvas'); cv.width = Math.round(bm.width * k); cv.height = Math.round(bm.height * k); cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height);
      const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.86));
      const s = await S().call('m-camp-image-sign');
      const fd = new FormData(); fd.append('cacheControl', '31536000'); fd.append('', blob, 'photo.jpg');
      const r = await fetch(s.signedUrl, { method: 'PUT', headers: { 'x-upsert': 'true' }, body: fd });
      if (!r.ok) throw new Error('Upload failed (' + r.status + ')');
      setImg(s.path); $('camp-img-msg').textContent = 'Uploaded. Click Save to keep it.';
    } catch (err) { $('camp-img-msg').textContent = err.message; }
  });
  $('camp-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target;
    const fields = { title: f.title.value, blurb: f.blurb.value, goal: f.goal.value, sort: f.sort.value, active: f.active.checked, image_path: campImg };
    $('camp-msg').textContent = 'Saving…';
    try { const { campaign } = await S().call('m-camp-save', { id: cur && cur.id, fields }); const i = C.findIndex((c) => c.id === campaign.id); if (i >= 0) C[i] = campaign; else C.push(campaign); cur = campaign; drawCamp(); $('camp-msg').textContent = 'Saved.'; $('camp-del').hidden = false; }
    catch (err) { $('camp-msg').textContent = err.message; }
  });
  $('camp-del').onclick = async () => {
    if (!cur || !window.confirm(`Delete “${cur.title}”? Donations already made for it keep its name.`)) return;
    try { await S().call('m-camp-delete', { id: cur.id }); C = C.filter((c) => c.id !== cur.id); cur = null; $('camp-form').classList.add('hidden'); drawCamp(); }
    catch (err) { $('camp-msg').textContent = err.message; }
  };
})();

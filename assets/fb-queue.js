/* Balita editor: "Facebook this week". The posts planned for the Club's Facebook Page, each waiting for the editor's OK.
   Nothing goes to Facebook until it is approved here. Approved posts go out at their time (one a day, 8 am to 8 pm). */
(function () {
  const FN = 'https://unavxknqpibxwcoqemaf.supabase.co/functions/v1/rcm-fb';
  const PUB = 'sb_publishable_zebFaErs-sjDwYWQUMfq3g_VuF2DTI6';
  const $ = (id) => document.getElementById(id);
  const D = window.RCMDash, E = () => window.RCMEditor;
  const esc = D.esc;
  const KIND = { issue: 'New Balita issue', story: 'Story from the Balita', history: 'History minute', meeting: 'Meeting invitation', event: 'Event', 'event-reminder': 'Event reminder' };
  const STATUS = { pending: ['Waiting for you', 'wait'], approved: ['Approved', 'ok'], posted: ['On Facebook', 'done'], skipped: ['Skipped', 'off'], failed: ['Did not post', 'bad'] };
  let items = [], editing = null, swapping = null;

  async function call(body) {
    const r = await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', 'x-editor-code': E().code() || '', apikey: PUB }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({ error: 'The server did not answer. Please try again.' }));
    if (r.status === 401) throw Object.assign(new Error(d.error || 'Wrong passcode'), { auth: true });
    if (!r.ok || d.error) throw new Error(d.error || 'Error ' + r.status);
    return d;
  }

  const when = (iso) => {
    const d = new Date(iso);
    const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Manila' });
    const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
    return `${day}, ${t}`;
  };
  // Links in the caption, without the tracking tail, so the text reads cleanly here.
  const show = (s) => esc(String(s || '').replace(/[?&]utm_source=facebook[^\s#]*/g, ''));

  function row(q) {
    const [label, cls] = STATUS[q.status] || [q.status, 'off'];
    const open = q.status === 'pending' || q.status === 'approved' || q.status === 'failed';
    const title = (q.meta && q.meta.label) || KIND[q.kind] || q.kind;
    const opts = q.kind === 'story' && q.meta && Array.isArray(q.meta.options) ? q.meta.options : [];
    let body = `<p class="fbq-cap">${show(q.message)}</p>`;
    if (editing === q.id) body = `<label class="f fbq-edit">Caption<textarea id="fbq-text" rows="10">${esc(q.message)}</textarea></label><div class="row"><button class="btn btn-blue fbq-btn" data-a="save" data-id="${q.id}" type="button">Save</button><button class="smallbtn" data-a="cancel" type="button">Cancel</button></div>`;
    if (swapping === q.id) body += `<div class="fbq-swap"><p class="muted small">Post a different story from this issue instead:</p>${opts.filter((o) => o.id !== q.ref).map((o) => `<button type="button" class="fbq-opt" data-a="pick" data-id="${q.id}" data-ref="${esc(o.id)}"><small>${esc(o.kicker || '')}</small>${esc(o.title)}</button>`).join('')}<button class="smallbtn" data-a="cancel" type="button">Keep this one</button></div>`;
    const acts = !open || editing === q.id ? '' : `<div class="fbq-acts">
${q.status !== 'approved' ? `<button class="btn btn-blue fbq-btn" data-a="approve" data-id="${q.id}" type="button">Approve</button>` : ''}
<button class="smallbtn" data-a="edit" data-id="${q.id}" type="button">Edit text</button>
${opts.length > 1 ? `<button class="smallbtn" data-a="swap" data-id="${q.id}" type="button">Swap story</button>` : ''}
<button class="smallbtn" data-a="skip" data-id="${q.id}" type="button">Skip</button></div>`;
    const note = q.status === 'approved' ? `<p class="muted small fbq-note">Goes out ${esc(when(q.scheduled_at))} (or soon after, if another post is already out that day).</p>`
      : q.status === 'failed' ? `<p class="err small">${esc(q.error || 'Facebook did not accept it.')} Approve it again to retry.</p>`
      : q.status === 'skipped' ? `<p class="muted small fbq-note">${q.error ? esc(q.error) + '. ' : ''}<button class="linkbtn" data-a="unskip" data-id="${q.id}" type="button">Bring it back</button></p>` : '';
    return `<li class="fbq-i ${cls}" id="fbq-${q.id}">
<button class="fbq-img" type="button" data-a="view" data-id="${q.id}" aria-label="See the picture larger">${q.card_url ? `<img src="${esc(q.card_url)}" alt="" loading="lazy">` : ''}</button>
<div class="fbq-t"><div class="fbq-h"><small>${esc(when(q.posted_at || q.scheduled_at))} · ${esc(KIND[q.kind] || q.kind)}</small><span class="fbq-s ${cls}">${esc(label)}</span></div>
<strong>${esc(title)}</strong>${body}${note}${acts}</div></li>`;
  }

  function draw() {
    const box = $('fbq-list'); if (!box) return;
    const live = items.filter((q) => q.status !== 'skipped' || Date.parse(q.scheduled_at) > Date.now() - 864e5);
    const waiting = items.filter((q) => q.status === 'pending').length;
    $('fbq-all').classList.toggle('hidden', waiting < 2);
    $('fbq-all').textContent = `Approve all ${waiting}`;
    $('fbq-sum').textContent = waiting ? `${waiting} post${waiting === 1 ? ' is' : 's are'} waiting for your OK. Nothing goes to Facebook until you approve it.` : 'Nothing is waiting for you. Approved posts go out at their time, one a day.';
    box.innerHTML = live.length ? live.map(row).join('') : '<li class="muted">Nothing planned yet. Posts appear here when the next issue, meeting or event is published.</li>';
  }

  async function load() {
    const box = $('fbq-list'); if (!box) return;
    try { const d = await call({ action: 'q-list' }); items = d.items || []; draw(); }
    catch (e) { if (e.auth) return E().signin(); box.innerHTML = `<li class="err">${esc(e.message)}</li>`; }
  }

  async function act(btn, body, after) {
    btn.disabled = true;
    try { const d = await call(body); if (d.item) items = items.map((q) => (q.id === d.item.id ? { ...q, ...d.item } : q)); if (after) after(d); editing = swapping = null; draw(); }
    catch (e) { btn.disabled = false; alertIn(btn, e.message); }
  }
  function alertIn(btn, msg) { const li = btn.closest('li') || $('fbq-list'); let p = li.querySelector('.fbq-err'); if (!p) { p = document.createElement('p'); p.className = 'err small fbq-err'; li.querySelector('.fbq-t') ? li.querySelector('.fbq-t').appendChild(p) : li.appendChild(p); } p.textContent = msg; }

  function view(q) {
    const dlg = $('fbq-dlg');
    $('fbq-dlg-body').innerHTML = `<div class="fbq-fb"><div class="fbq-fb-h"><img src="/assets/club-logo-white.png" alt=""><div><b>Rotary Club of Manila</b><small>${esc(when(q.scheduled_at))}</small></div></div><p class="fbq-cap">${show(q.message)}</p>${q.card_url ? `<img class="fbq-fb-img" src="${esc(q.card_url)}" alt="">` : ''}</div>`;
    dlg.showModal();
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('#fbq [data-a], #fbq-dlg [data-a]'); if (!b) return;
    const a = b.getAttribute('data-a'), id = b.getAttribute('data-id'), q = items.find((x) => x.id === id);
    if (a === 'view' && q) return view(q);
    if (a === 'close') return $('fbq-dlg').close();
    if (a === 'edit') { editing = id; swapping = null; draw(); const t = $('fbq-text'); if (t) t.focus(); return; }
    if (a === 'swap') { swapping = id; editing = null; draw(); return; }
    if (a === 'cancel') { editing = swapping = null; draw(); return; }
    if (a === 'approve') return act(b, { action: 'q-approve', id });
    if (a === 'skip') return act(b, { action: 'q-skip', id });
    if (a === 'unskip') return act(b, { action: 'q-unskip', id });
    if (a === 'save') return act(b, { action: 'q-edit', id, message: $('fbq-text').value });
    if (a === 'pick') return act(b, { action: 'q-swap', id, ref: b.getAttribute('data-ref') });
  });
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('#fbq-all'); if (!b) return;
    b.disabled = true;
    try { await call({ action: 'q-approve-all' }); await load(); } catch (err) { alertIn(b, err.message); }
    b.disabled = false;
  });
  document.addEventListener('rcmed:home', load);
})();

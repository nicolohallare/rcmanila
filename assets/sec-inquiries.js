/* Secretariat: membership, partnership and volunteer inquiries from the Join and Partner pages. */
(function () {
  const $ = (id) => document.getElementById(id);
  const S = () => window.RCMSec;
  const esc = (s) => S().esc(s);
  const FN = 'https://unavxknqpibxwcoqemaf.supabase.co/functions/v1/rcm-inquiry';
  const PUB = 'sb_publishable_zebFaErs-sjDwYWQUMfq3g_VuF2DTI6';
  const KIND = { join: 'Membership', partner: 'Partner or sponsor', volunteer: 'Volunteer', other: 'Other' };
  const STATUS = { new: 'New', contacted: 'Contacted', closed: 'Closed' };
  const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
  let L = [], sel = null;

  async function call(action, payload) {
    const r = await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', 'x-editor-code': S().code(), apikey: PUB }, body: JSON.stringify(Object.assign({ action }, payload || {})) });
    const d = await r.json().catch(() => ({ error: 'The server did not answer. Please try again.' }));
    if (r.status === 401) throw Object.assign(new Error(d.error || 'Wrong passcode'), { auth: true });
    if (!r.ok || d.error) throw new Error(d.error || ('Error ' + r.status));
    return d;
  }

  async function load() {
    L = (await call('list')).inquiries;
    const n = L.filter((x) => x.status === 'new').length;
    $('inq-badge').hidden = !n; $('inq-badge').textContent = n;
  }
  async function open() {
    S().show('v-inq');
    try { await load(); draw(); }
    catch (err) { if (err.auth) return S().show('v-login'); $('inq-list').innerHTML = `<li class="err" style="padding:16px">${esc(err.message)}</li>`; }
  }
  function draw() {
    const show = $('inq-show').value;
    const list = L.filter((x) => show === 'all' || x.status === show);
    $('inq-list').innerHTML = list.length ? list.map((x) => `<li><button type="button" data-q="${x.id}" aria-current="${x.id === sel}"><span><b>${esc(x.name)}</b><br><small>${esc(when(x.created_at))}${x.organization ? ' · ' + esc(x.organization) : ''}</small></span><span class="amt">${esc(KIND[x.kind] || x.kind)}</span></button></li>`).join('')
      : '<li class="muted" style="padding:16px">Nothing here.</li>';
  }
  function detail(id) {
    sel = id; draw();
    const x = L.find((q) => q.id === id); if (!x) return;
    const mail = x.email ? `mailto:${encodeURIComponent(x.email)}?subject=${encodeURIComponent('Rotary Club of Manila: your ' + (x.kind === 'join' ? 'membership inquiry' : 'message'))}` : '';
    $('inq-detail').innerHTML = `<div class="row" style="justify-content:space-between"><h2 style="font-size:22px">${esc(x.name)}</h2><span class="muted">${esc(KIND[x.kind] || x.kind)} · ${esc(STATUS[x.status])}</span></div>
<p class="muted">${esc(when(x.created_at))}${x.page ? ' · from ' + esc(x.page) : ''}</p>
<dl class="stack" style="gap:8px;margin:0">
${x.organization ? `<div><b>Organization or profession:</b> ${esc(x.organization)}</div>` : ''}
${x.email ? `<div><b>Email:</b> <a href="${mail}">${esc(x.email)}</a></div>` : ''}
${x.phone ? `<div><b>Mobile:</b> <a href="tel:${esc(x.phone.replace(/[^0-9+]/g, ''))}">${esc(x.phone)}</a></div>` : ''}
${x.interest ? `<div><b>Interest:</b> ${esc(x.interest)}</div>` : ''}
</dl>
${x.message ? `<div class="note" style="white-space:pre-wrap">${esc(x.message)}</div>` : ''}
<label class="f">Note for the Secretariat<textarea id="inq-note" rows="2">${esc(x.secretariat_note || '')}</textarea></label>
<div class="row"><button class="btn btn-blue" type="button" data-set="contacted">Mark contacted</button><button class="btn btn-line" style="color:var(--blue)" type="button" data-set="closed">Close</button>${x.status !== 'new' ? '<button class="smallbtn" type="button" data-set="new">Back to new</button>' : ''}<span id="inq-msg" class="muted"></span></div>`;
  }
  async function save(status) {
    try {
      $('inq-msg').textContent = 'Saving…';
      const { inquiry } = await call('update', { id: sel, status, secretariat_note: $('inq-note').value });
      L = L.map((x) => (x.id === inquiry.id ? inquiry : x));
      const n = L.filter((x) => x.status === 'new').length; $('inq-badge').hidden = !n; $('inq-badge').textContent = n;
      detail(sel);
    } catch (err) { $('inq-msg').textContent = err.message; }
  }

  document.querySelector('.sec-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b && b.getAttribute('data-tab') === 'v-inq') open(); });
  $('inq-refresh').onclick = open;
  $('inq-show').onchange = draw;
  $('inq-list').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) detail(b.getAttribute('data-q')); });
  $('inq-detail').addEventListener('click', (e) => { const b = e.target.closest('[data-set]'); if (b) save(b.getAttribute('data-set')); });
  // Show how many new messages are waiting as soon as the Secretariat signs in.
  const tabs = $('sec-tabs');
  new MutationObserver(() => { if (!tabs.classList.contains('hidden') && S().code()) load().catch(() => {}); }).observe(tabs, { attributes: true, attributeFilter: ['class'] });
})();

/* Editor: the homepage cover photo of the month. */
(function () {
  const $ = (id) => document.getElementById(id);
  const FN = 'https://unavxknqpibxwcoqemaf.supabase.co/functions/v1/rcm-cover';
  const PUB = 'sb_publishable_zebFaErs-sjDwYWQUMfq3g_VuF2DTI6';
  const IMG = (p) => (p && p[0] === '/' ? p : `https://unavxknqpibxwcoqemaf.supabase.co/storage/v1/render/image/public/rcm/${p}?width=600&resize=contain&quality=75`);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const code = () => { try { return localStorage.getItem('rcm-editor-code') || ''; } catch (e) { return ''; } };
  const monthName = (iso) => new Date(iso.slice(0, 10) + 'T12:00:00+08:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Manila' });
  let covers = [], photo = null;

  async function call(action, payload) {
    const r = await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', 'x-editor-code': code(), apikey: PUB }, body: JSON.stringify(Object.assign({ action }, payload || {})) });
    const d = await r.json().catch(() => ({ error: 'The server did not answer. Please try again.' }));
    if (!r.ok || d.error) throw new Error(d.error || 'Error ' + r.status);
    return d;
  }
  function thisMonth() { const d = new Date(Date.now() + 8 * 3600 * 1000); return d.toISOString().slice(0, 7); }
  function draw() {
    const now = thisMonth();
    const live = covers.find((c) => c.month.slice(0, 7) <= now);
    $('cover-now').innerHTML = live ? `<div class="row" style="gap:14px;align-items:center"><img src="${IMG(live.image_path)}" alt="" style="width:160px;border-radius:4px"><div><b>On the homepage now:</b> ${esc(monthName(live.month))}<br><span class="muted">${esc(live.caption)}</span></div></div>` : 'No cover set yet.';
    $('cover-list').innerHTML = covers.map((c) => `<li><div class="row" style="gap:12px;align-items:center;justify-content:space-between"><span class="row" style="gap:12px;align-items:center"><img src="${IMG(c.image_path)}" alt="" style="width:90px;border-radius:3px"><span><b>${esc(monthName(c.month))}</b>${c.month.slice(0, 7) > now ? ' · scheduled' : ''}<br><span class="muted">${esc(c.caption)}</span></span></span><span class="row"><button type="button" class="smallbtn" data-edit="${c.id}">Edit</button><button type="button" class="smallbtn" data-del="${c.id}">Remove</button></span></div></li>`).join('') || '<li class="muted">None yet.</li>';
  }
  async function load() { try { covers = (await call('list')).covers; draw(); } catch (e) { $('cover-now').textContent = e.message; } }

  function resize(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file); const im = new Image();
      im.onload = () => { const max = 2400; const k = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); const data = c.toDataURL('image/jpeg', 0.86); res({ data, w: c.width, h: c.height }); };
      im.onerror = () => rej(new Error('That file could not be opened as a photo.')); im.src = url;
    });
  }
  $('cv-file').addEventListener('change', async () => {
    const f = $('cv-file').files[0]; photo = null; if (!f) return;
    try { photo = await resize(f); $('cv-preview').src = photo.data; $('cv-preview').style.display = 'block';
      $('cv-msg').textContent = photo.w < 1800 ? 'This photo is small and will look soft across a large screen. Use one at least 2000 pixels wide if you can.' : ''; }
    catch (e) { $('cv-msg').textContent = e.message; }
  });
  $('cover-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const b = $('cv-save');
    const payload = { month: $('cv-month').value, caption: $('cv-caption').value, alt: $('cv-alt').value, link: $('cv-link').value, tagline: $('cv-tagline').value, focus: $('cv-focus').value };
    if (!payload.month) { $('cv-msg').textContent = 'Choose the month.'; return; }
    if (photo) payload.image = photo.data.split(',')[1];
    b.disabled = true; $('cv-msg').textContent = 'Saving…';
    try { await call('save', payload); $('cv-msg').textContent = 'Saved. The homepage updates within a minute.'; photo = null; $('cv-file').value = ''; $('cv-preview').style.display = 'none'; await load(); }
    catch (err) { $('cv-msg').textContent = err.message; }
    b.disabled = false;
  });
  $('cover-list').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]'); const del = e.target.closest('[data-del]');
    if (ed) { const c = covers.find((x) => x.id === ed.getAttribute('data-edit')); if (!c) return;
      $('cv-month').value = c.month.slice(0, 7); $('cv-caption').value = c.caption || ''; $('cv-alt').value = c.alt || ''; $('cv-link').value = c.link || ''; $('cv-tagline').value = c.tagline || ''; $('cv-focus').value = ['center', 'center 25%', 'center 75%'].includes(c.focus) ? c.focus : 'center';
      $('cv-msg').textContent = 'Editing ' + monthName(c.month) + '. Choose a new photo only if you want to replace it.'; $('cover-form').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    if (del) { const c = covers.find((x) => x.id === del.getAttribute('data-del')); if (!c) return;
      if (!window.confirm('Remove the cover for ' + monthName(c.month) + '? The previous month’s cover will show instead.')) return;
      try { await call('delete', { id: c.id }); await load(); } catch (err) { $('cv-msg').textContent = err.message; } }
  });
  $('cv-month').value = thisMonth();
  // Load once the editor has signed in and the home view is showing.
  const home = $('v-home');
  const go = () => { if (!home.classList.contains('hidden') && code()) { load(); obs.disconnect(); } };
  const obs = new MutationObserver(go); obs.observe(home, { attributes: true, attributeFilter: ['class'] }); go();
})();

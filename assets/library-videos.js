/* Heritage Library workshop: the Video room. Review and publish videos, make their still frames, and add new ones.
   Still frames are drawn in this browser from the video itself and saved to the public library storage. */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const L = () => window.RCMLib;
  const vcall = (a, p) => L().video(a, p);
  const ARCH = 'https://archive.rcmanila.org/';
  const pub = (p) => ARCH + String(p).split('/').map(encodeURIComponent).join('/');
  const CATS = { film: 'Club films', project: 'Project films', event: 'Club events', speaker: 'Guest speakers', meeting: 'Meetings on Zoom' };
  const ST = { draft: ['Waiting', 'wait'], held: ['Held for a check', 'fail'], published: ['On the website', 'done'], hidden: ['Hidden', 'wait'] };
  const MON = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const len = (d) => { d = Math.round(Number(d) || 0); if (!d) return ''; const h = Math.floor(d / 3600), m = Math.floor(d % 3600 / 60); return h ? `${h} h ${m} min` : `${m || 1} min`; };
  const msg = (t, bad) => { const el = $('vid-msg'); el.textContent = t; el.className = bad ? 'err' : 'muted'; };
  let V = [], busy = false;

  async function load() {
    msg('Loading…');
    try { V = (await vcall('list', {})).items; draw(); msg(''); }
    catch (e) { if (e.auth) return L().show('login'); msg(e.message, true); }
  }
  function card(v) {
    const s = ST[v.status] || ST.draft;
    return `<li class="mu-card mu-tag" data-v="${v.id}">
<a ${v.status === 'published' ? `href="/library/videos/${esc(v.slug)}" target="_blank" rel="noopener"` : `href="#" data-watch="${v.id}"`} class="vthumb">${v.poster ? `<img src="${esc(pub(v.poster))}" alt="" loading="lazy">` : '<span class="vph">No still yet</span>'}</a>
<div><div class="mu-row small"><span class="st ${s[1]}">${s[0]}</span>${v.plays === false ? '<span class="st fail">Will not play in browsers</span>' : ''}<span class="muted">${esc(CATS[v.category] || v.category)}${v.duration ? ' · ' + len(v.duration) : ''}${v.src_size ? ' · ' + Math.round(v.src_size / 1048576) + ' MB' : ''}</span></div>
<input data-f="title" value="${esc(v.title)}" class="mu-h" aria-label="Title">
<div class="mu-row"><select data-f="category" aria-label="Section">${Object.entries(CATS).map(([k, t]) => `<option value="${k}"${k === v.category ? ' selected' : ''}>${t}</option>`).join('')}</select><select data-f="month" aria-label="Month">${MON.map((m, k) => `<option value="${k || ''}"${(v.month || 0) === k ? ' selected' : ''}>${k ? m : 'Month'}</option>`).join('')}</select><input data-f="year" type="number" class="mu-y" value="${v.year || ''}" placeholder="Year" aria-label="Year"><input data-f="speaker" value="${esc(v.speaker || '')}" placeholder="Speaker (if any)" aria-label="Speaker" style="flex:1;min-width:160px"></div>
<textarea data-f="description" rows="2" aria-label="Description" placeholder="One or two sentences: what it shows, where and when">${esc(v.description || '')}</textarea>
<div class="mu-row">${v.status === 'published' ? '<button class="btn btn-blue" data-do="save" type="button">Save</button><button class="smallbtn" data-do="hidden" type="button">Take off the website</button>' : `<button class="btn btn-blue" data-do="published" type="button">Publish</button><button class="smallbtn" data-do="save" type="button">Save</button>${v.status !== 'hidden' ? '<button class="smallbtn" data-do="hidden" type="button">Hide</button>' : '<button class="smallbtn" data-do="draft" type="button">Back to waiting</button>'}`}<button class="smallbtn" data-do="frame" type="button">${v.poster ? 'New still' : 'Make still'}</button><span class="muted mu-m"></span></div>
<video class="vprev hidden" controls preload="none"></video></div></li>`;
  }
  function draw() {
    const show = $('vid-show').value;
    const wait = V.filter((v) => v.status === 'draft' || v.status === 'held');
    const groups = { waiting: wait, published: V.filter((v) => v.status === 'published'), hidden: V.filter((v) => v.status === 'hidden') };
    const L2 = groups[show] || wait;
    const noStill = V.filter((v) => v.status === 'published' && v.path && !v.poster && v.plays !== false).length;
    $('vid-count').textContent = `${wait.length} waiting · ${groups.published.length} on the website · ${groups.hidden.length} hidden`;
    $('vid-frames').textContent = noStill ? `Make still frames (${noStill})` : 'Make still frames';
    $('vid-frames').disabled = !noStill;
    $('vid-list').innerHTML = L2.map(card).join('') || '<li class="muted">Nothing here.</li>';
  }

  // ---------- still frames: drawn from the video in this browser ----------
  async function srcFor(v) {
    if (v.src_key) { const r = await L().call('r2-get', { keys: [v.src_key] }); return r.urls[0]; }
    const r = await L().call('r2-get', { keys: [v.path], bucket: 'rcm-library' }); return r.urls[0];
  }
  function grab(url) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('video');
      el.crossOrigin = 'anonymous'; el.muted = true; el.preload = 'metadata'; el.playsInline = true;
      const t = setTimeout(() => reject(new Error('The video took too long to open.')), 60000);
      el.onerror = () => { clearTimeout(t); reject(Object.assign(new Error('This browser cannot play the video.'), { noplay: true })); };
      el.onloadedmetadata = () => { el.currentTime = Math.min(Math.max(1, el.duration * 0.15), 25); };
      el.onseeked = () => {
        clearTimeout(t);
        try {
          const w = Math.min(1280, el.videoWidth || 1280), h = Math.round(w * (el.videoHeight || 720) / (el.videoWidth || 1280));
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(el, 0, 0, w, h);
          c.toBlob((b) => b ? resolve({ blob: b, duration: el.duration, width: el.videoWidth, height: el.videoHeight }) : reject(new Error('Could not save the still.')), 'image/jpeg', 0.82);
        } catch (e) { reject(e); }
        el.removeAttribute('src'); el.load();
      };
      el.src = url;
    });
  }
  async function putPublic(key, blob, type) {
    const { urls } = await L().call('r2-put', { keys: [key] });
    const r = await fetch(urls[0], { method: 'PUT', headers: { 'content-type': type, 'cache-control': 'public, max-age=31536000' }, body: blob });
    if (!r.ok) throw new Error('Could not save to the library storage (' + r.status + ').');
  }
  async function frameOne(v, li) {
    const m = li && li.querySelector('.mu-m'); if (m) m.textContent = 'Making a still…';
    try {
      const g = await grab(await srcFor(v));
      const key = `vid/${v.slug}-${Date.now().toString(36)}.jpg`;
      await putPublic(key, g.blob, 'image/jpeg');
      const f = { id: v.id, poster: key, duration: Math.round(g.duration || 0) || null, width: g.width || null, height: g.height || null, plays: true };
      await vcall('save', f); Object.assign(v, f);
      if (m) m.textContent = 'Still saved ✓';
      return true;
    } catch (e) {
      if (e.noplay) { await vcall('save', { id: v.id, plays: false }).catch(() => {}); v.plays = false; }
      if (m) m.textContent = e.message;
      return false;
    }
  }
  async function frameAll() {
    if (busy) return; busy = true;
    const todo = V.filter((v) => v.status === 'published' && v.path && !v.poster && v.plays !== false);
    let ok = 0;
    for (let i = 0; i < todo.length; i++) { msg(`Making still frames… ${i + 1} of ${todo.length}. Keep this page open.`); if (await frameOne(todo[i])) ok++; }
    busy = false; draw(); msg(`${ok} still frame${ok === 1 ? '' : 's'} made.${ok < todo.length ? ` ${todo.length - ok} could not be read; they are marked.` : ''}`);
  }

  // ---------- review actions ----------
  async function onList(e) {
    const w = e.target.closest('[data-watch]');
    if (w) { e.preventDefault(); const li = w.closest('[data-v]'), v = V.find((x) => x.id === Number(li.dataset.v)), vid = li.querySelector('.vprev'); if (vid.classList.contains('hidden')) { vid.src = await srcFor(v); vid.classList.remove('hidden'); vid.play().catch(() => {}); } else { vid.pause(); vid.classList.add('hidden'); } return; }
    const b = e.target.closest('[data-do]'); if (!b) return;
    const li = b.closest('[data-v]'), v = V.find((x) => x.id === Number(li.dataset.v)), m = li.querySelector('.mu-m');
    if (b.dataset.do === 'frame') { b.disabled = true; await frameOne(v, li); b.disabled = false; return; }
    const f = { id: v.id };
    li.querySelectorAll('[data-f]').forEach((x) => { f[x.dataset.f] = x.dataset.f === 'year' || x.dataset.f === 'month' ? (x.value ? Number(x.value) : null) : x.value.trim(); });
    if (b.dataset.do !== 'save') f.status = b.dataset.do;
    if (f.status === 'published' && v.status === 'held' && !confirm('This video was held for a check. Have you watched it and is it fine to show on the website?')) return;
    m.textContent = f.status === 'published' && !v.path ? 'Copying to the public library… (large files take a minute)' : 'Saving…';
    try {
      await vcall('save', f);
      Object.assign(v, f);
      if (f.status === 'published') { const fresh = (await vcall('list', {})).items.find((x) => x.id === v.id); if (fresh) Object.assign(v, fresh); if (!v.poster) await frameOne(v, li); }
      m.textContent = 'Saved ✓'; setTimeout(draw, 700);
    } catch (err) { m.textContent = err.message; }
  }

  // ---------- add a new video from this computer ----------
  async function addVideo(e) {
    e.preventDefault();
    const file = $('va-file').files[0], title = $('va-title').value.trim();
    if (!file || !title) return msg('Choose the video file and give it a title.', true);
    if (file.size > 4.5e9) return msg('That file is too large. Ask for a shorter or compressed version (under 4 GB).', true);
    const base = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'video';
    const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [, 'mp4'])[1].toLowerCase().replace('m4v', 'mp4');
    const key = `vid/${base}-${Date.now().toString(36)}.${ext}`;
    const btn = $('va-go'); btn.disabled = true;
    try {
      msg('Making the still frame…');
      const url = URL.createObjectURL(file); let g = null;
      try { g = await grab(url); } catch (x) { if (x.noplay) throw new Error('This browser cannot play that file. Ask for an MP4 (H.264) version.'); }
      URL.revokeObjectURL(url);
      const { urls } = await L().call('r2-put', { keys: [key] });
      await new Promise((res, rej) => {
        const x = new XMLHttpRequest(); x.open('PUT', urls[0]); x.setRequestHeader('content-type', file.type || 'video/mp4'); x.setRequestHeader('cache-control', 'public, max-age=31536000');
        x.upload.onprogress = (ev) => { if (ev.lengthComputable) { $('va-bar').style.width = Math.round(ev.loaded / ev.total * 100) + '%'; msg(`Uploading… ${Math.round(ev.loaded / 1048576)} of ${Math.round(ev.total / 1048576)} MB. Keep this page open.`); } };
        x.onload = () => (x.status < 300 ? res() : rej(new Error('Upload failed (' + x.status + ').'))); x.onerror = () => rej(new Error('Upload failed. Check the connection and try again.')); x.send(file);
      });
      let poster = null;
      if (g) { poster = key.replace(/\.[a-z0-9]+$/, '.jpg'); await putPublic(poster, g.blob, 'image/jpeg'); }
      await vcall('save', { title, category: $('va-cat').value, year: Number($('va-year').value) || null, month: Number($('va-month').value) || null, speaker: $('va-speaker').value.trim() || null, description: $('va-desc').value.trim() || null, path: key, poster, duration: g ? Math.round(g.duration) : null, width: g ? g.width : null, height: g ? g.height : null, plays: true, status: 'draft', src_size: file.size });
      $('va-form').reset(); $('va-bar').style.width = '0';
      msg('Added ✓ It is waiting below. Check the details, then click Publish.');
      $('vid-show').value = 'waiting'; await load();
    } catch (err) { msg(err.message, true); }
    btn.disabled = false;
  }

  document.addEventListener('rcmlib:tab', (e) => { if (e.detail === 'vid') load(); });
  document.addEventListener('DOMContentLoaded', () => {
    $('vid-list').addEventListener('click', onList);
    $('vid-show').onchange = draw;
    $('vid-frames').onclick = frameAll;
    $('va-form').addEventListener('submit', addVideo);
    const y = $('va-year'); if (y && !y.value) y.value = new Date().getFullYear();
  });
})();

/* Heritage Library workshop: tidy the bound-volume covers. Each cover photo is straightened and trimmed in this
   browser (assets/tidy-cover.js), saved as a new file beside the original, and the volume is pointed at it.
   The original photos stay in storage untouched. */
(function () {
  const $ = (id) => document.getElementById(id);
  const L = () => window.RCMLib;
  const ARCH = 'https://archive.rcmanila.org';
  const pub = (p) => ARCH + '/' + String(p).split('/').map(encodeURIComponent).join('/');
  const isTidy = (p) => /\/cov\/tidy-/.test(p || '');
  let busy = false;

  async function putPublic(key, blob) {
    const { urls } = await L().call('r2-put', { keys: [key] });
    const r = await fetch(urls[0], { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000' }, body: blob });
    if (!r.ok) throw new Error('Could not save to the library storage (' + r.status + ').');
  }
  async function load(path) {
    const r = await fetch(pub(path), { mode: 'cors', cache: 'no-store' });
    if (!r.ok) throw new Error('Could not read the cover (' + r.status + ').');
    return createImageBitmap(await r.blob());
  }
  function fit(c, maxH) {
    const k = Math.min(1, maxH / c.height); if (k === 1) return c;
    const o = document.createElement('canvas'); o.width = Math.round(c.width * k); o.height = Math.round(c.height * k);
    const x = o.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, o.width, o.height); return o;
  }
  const toBlob = (c) => new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86));
  function thumb(src, label) {
    const f = document.createElement('figure'); f.style.cssText = 'margin:0;display:inline-flex;flex-direction:column;gap:4px;font-size:12px;color:#5b6b80';
    const c = document.createElement('canvas'); const h = 140, w = Math.round(src.width * h / src.height); c.width = w; c.height = h;
    c.getContext('2d').drawImage(src, 0, 0, w, h); c.style.cssText = 'height:140px;width:auto;background:#f0f;border-radius:3px';
    f.appendChild(c); const t = document.createElement('figcaption'); t.textContent = label; f.appendChild(t); return f;
  }

  async function run() {
    if (busy) return; busy = true; const btn = $('cov-tidy'), msg = $('cov-msg'), prev = $('cov-prev');
    btn.disabled = true; prev.innerHTML = '';
    try {
      const vols = (await L().call('vol-list')).volumes.filter((v) => v.status === 'published' && v.cover_path && !isTidy(v.cover_path));
      if (!vols.length) { msg.textContent = 'All volume covers are already tidy.'; return; }
      let done = 0, same = 0, failed = 0;
      for (let i = 0; i < vols.length; i++) {
        const v = vols[i]; msg.textContent = `Tidying covers… ${i + 1} of ${vols.length} (${v.acc}). Keep this page open.`;
        try {
          const img = await load(v.cover_path);
          const t = window.tidyPage(img);
          if (!t) same++;
          // A cover that is already clean is saved as-is under the tidy name, so it is not offered again.
          const src = t || (() => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); return c; })();
          const out = fit(src, 1800), key = `vol/${v.acc.toLowerCase()}/cov/tidy-${Date.now().toString(36)}.jpg`;
          await putPublic(key, await toBlob(out));
          await L().call('vol-save', { id: v.id, fields: { cover_path: key } });
          if (!t) continue;
          done++;
          const pair = document.createElement('div'); pair.style.cssText = 'display:inline-flex;gap:6px;margin:0 14px 12px 0;vertical-align:top';
          pair.appendChild(thumb(img, v.acc + ' before')); pair.appendChild(thumb(out, 'after')); prev.appendChild(pair);
        } catch (e) { if (e.auth) return L().show('login'); failed++; console.warn(v.acc, e); }
      }
      msg.textContent = `${done} cover${done === 1 ? '' : 's'} tidied${same ? `, ${same} already clean` : ''}${failed ? `, ${failed} could not be read (try again later)` : ''}. The originals are kept in storage.`;
      document.dispatchEvent(new CustomEvent('rcmlib:covers'));
    } catch (e) { if (e.auth) return L().show('login'); msg.textContent = e.message; }
    finally { busy = false; btn.disabled = false; }
  }

  // How many covers still need tidying (used by the Today dashboard and the button label).
  window.RCMCovers = {
    async count() { try { return (await L().call('vol-list')).volumes.filter((v) => v.status === 'published' && v.cover_path && !isTidy(v.cover_path)).length; } catch (e) { return 0; } },
    run,
  };
  document.addEventListener('click', (e) => { if (e.target.closest('#cov-tidy')) run(); });
})();

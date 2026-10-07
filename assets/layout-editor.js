// Full-screen layout editor for one Balita article: the article as it reads on the website, rearranged by drag and drop.
// - Drag photos or paragraphs up and down.
// - Drop a paragraph onto a photo to make it that photo's caption (award lists often come out of the PDF as text lines).
// - Drag a photo to "Not used" to leave it out, or back into the article.
// RCMLayout.open({ photos, body, imgUrl, onDone(photos, body) })
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CSS = `
.lx{position:fixed;inset:0;z-index:9999;background:#eef2f7;display:flex;flex-direction:column;font-family:var(--sans,'Open Sans',Arial,sans-serif)}
.lx-bar{display:flex;align-items:center;gap:14px;padding:12px 20px;background:#0f2f66;color:#fff;flex-wrap:wrap}
.lx-bar h2{margin:0;font-size:19px;color:#fff;flex:1;min-width:220px}
.lx-bar p{margin:0;font-size:14px;color:#cfdcf2;flex-basis:100%}
.lx-bar button{font:700 15px inherit;border-radius:8px;padding:10px 18px;cursor:pointer;border:2px solid #fff;background:transparent;color:#fff}
.lx-bar .lx-done{background:#f7a81b;border-color:#f7a81b;color:#0f2f66}
.lx-main{flex:1;display:grid;grid-template-columns:minmax(0,1fr) 300px;min-height:0}
.lx-col{overflow:auto;padding:28px 20px 120px}
.lx-art{max-width:760px;margin:0 auto;background:#fff;border-radius:14px;box-shadow:0 2px 14px rgba(15,47,102,.08);padding:28px 34px 40px}
.lx-art h1{font:700 30px/1.15 Georgia,serif;color:#17458f;margin:0 0 18px}
.lx-it{position:relative;border:2px solid transparent;border-radius:10px;margin:2px -12px;padding:6px 12px;cursor:grab;transition:background .1s}
.lx-it:hover{border-color:#d5deeb;background:#fafcff}
.lx-it.drag{opacity:.35}
.lx-it p{margin:0;font:17px/1.6 Georgia,serif;color:#222}
.lx-it.h p{font:700 20px/1.3 Georgia,serif;color:#17458f}
.lx-it.q p{font-style:italic;border-left:4px solid #f7a81b;padding-left:12px}
.lx-ph figure{margin:6px 0}
.lx-ph img{display:block;width:100%;max-height:260px;object-fit:contain;background:#f1f3f6;border-radius:8px;pointer-events:none}
.lx-ph textarea{width:100%;box-sizing:border-box;margin-top:8px;font:italic 15px/1.4 Georgia,serif;color:#333;border:1px dashed #b9c9df;border-radius:6px;padding:8px;resize:vertical;min-height:44px;background:#fff;cursor:text}
.lx-ph .lx-tag{position:absolute;top:14px;left:22px;background:#0f2f66;color:#fff;font:700 13px inherit;padding:3px 9px;border-radius:12px}
.lx-tools{position:absolute;top:12px;right:20px;display:flex;gap:6px}
.lx-tools button{font:600 13px inherit;background:#fff;border:1px solid #b9c9df;border-radius:6px;padding:5px 9px;cursor:pointer;color:#17458f}
.lx-top{border:2px dashed #b9c9df;border-radius:12px;padding:8px 12px 10px;margin:0 -12px 16px;background:#f7f9fc}
.lx-top>small{display:block;font:700 12px inherit;letter-spacing:.06em;text-transform:uppercase;color:#6b7787;margin:2px 0 4px}
.lx-line{height:0;border-top:4px solid #f7a81b;margin:-2px 0;border-radius:4px;position:relative}
.lx-line::before{content:'Drop here';position:absolute;left:50%;top:-14px;transform:translateX(-50%);background:#f7a81b;color:#0f2f66;font:700 12px inherit;padding:2px 10px;border-radius:10px}
.lx-it.capdrop{border-color:#2a8a4a;background:#eaf7ee}
.lx-it.capdrop::after{content:'Drop to make this the caption';position:absolute;inset:auto 12px 60px;margin:auto;width:max-content;background:#2a8a4a;color:#fff;font:700 15px inherit;padding:8px 14px;border-radius:8px;left:0;right:0}
.lx-side{border-left:1px solid #d5deeb;background:#f7f9fc;overflow:auto;padding:18px 16px 80px}
.lx-side h3{margin:0 0 4px;font-size:16px;color:#0f2f66}
.lx-side>p{margin:0 0 12px;font-size:13px;color:#566477}
.lx-tray{min-height:160px;border:2px dashed #c9d5e6;border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:8px}
.lx-tray.over{border-color:#f7a81b;background:#fff8e8}
.lx-tray .lx-it{margin:0;background:#fff;border-color:#d5deeb}
.lx-tray img{max-height:120px}
.lx-tray textarea{display:none}
.lx-empty{color:#8794a6;font-size:13px;text-align:center;padding:30px 6px}
.lx-help{margin-top:18px;font-size:13px;color:#566477;line-height:1.5}
.lx-help b{color:#0f2f66}
@media (max-width:900px){.lx-main{grid-template-columns:1fr}.lx-side{border-left:0;border-top:1px solid #d5deeb}}`;

  function open(opt) {
    if (!document.getElementById('lx-css')) { const st = document.createElement('style'); st.id = 'lx-css'; st.textContent = CSS; document.head.appendChild(st); }
    // State: top photo, the article (text blocks and photos in order), and photos not used.
    const P = opt.photos.map((p) => Object.assign({}, p));
    const byPath = new Map(P.map((p) => [p.path, p]));
    let top = (P.find((p) => p.include !== false) || {}).path || null;
    let items = (opt.body || []).filter((b) => b && (b.t === 'img' ? byPath.has(b.path) && b.path !== top : b.text)).map((b) => Object.assign({}, b));
    const inArt = () => new Set([top, ...items.filter((b) => b.t === 'img').map((b) => b.path)]);
    let tray = P.filter((p) => !inArt().has(p.path)).map((p) => p.path);
    // Photos that are included but not placed yet go to the end of the article, as the website shows them.
    tray.filter((path) => byPath.get(path).include !== false).forEach((path) => items.push({ t: 'img', path }));
    tray = tray.filter((path) => byPath.get(path).include === false);

    const box = document.createElement('div'); box.className = 'lx'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Arrange the article');
    box.innerHTML = `<div class="lx-bar"><h2>Arrange “${esc(opt.title || 'the article')}”</h2><button type="button" class="lx-cancel">Cancel</button><button type="button" class="lx-done">Done – save layout</button>
<p>Drag photos and paragraphs to where they belong. Drop a line of text onto a photo to make it that photo’s caption. Type in the box under a photo to change its caption.</p></div>
<div class="lx-main"><div class="lx-col"><div class="lx-art"></div></div><aside class="lx-side"><h3>Not used</h3><p>Drag a photo here to leave it out. Drag it back into the article to use it.</p><div class="lx-tray"></div>
<div class="lx-help"><b>Tips</b><br>• The photo at the very top leads the article and shows when it is shared.<br>• To swap the top photo, drag another photo onto the top box.<br>• Nothing changes on the website until you click <b>Done – save layout</b>.</div></aside></div>`;
    document.body.appendChild(box); document.body.style.overflow = 'hidden';
    const art = box.querySelector('.lx-art'), trayEl = box.querySelector('.lx-tray'), col = box.querySelector('.lx-col');

    const photoHtml = (path, where, i) => { const p = byPath.get(path) || {}; return `<figure><img src="${opt.imgUrl(path, 900)}" alt=""></figure>${where === 'tray' ? '' : `<textarea data-capfor="${esc(path)}" rows="2" placeholder="Caption (type here or drop a line of text on the photo)">${esc(p.caption || '')}</textarea>`}${where === 'art' ? `<div class="lx-tools"><button type="button" data-out="${i}">Not used</button></div>` : ''}`; };
    function draw() {
      const y = col.scrollTop;
      let h = `<h1>${esc(opt.title || '')}</h1>`;
      h += `<div class="lx-top" data-zone="top"><small>Top photo</small>${top ? `<div class="lx-it lx-ph" draggable="true" data-kind="top">${photoHtml(top, 'top')}</div>` : '<div class="lx-empty">Drag a photo here</div>'}</div>`;
      items.forEach((b, i) => {
        h += b.t === 'img' ? `<div class="lx-it lx-ph" draggable="true" data-kind="art" data-i="${i}">${photoHtml(b.path, 'art', i)}</div>`
          : `<div class="lx-it ${b.t === 'h' ? 'h' : b.t === 'q' ? 'q' : ''}" draggable="true" data-kind="art" data-i="${i}"><p>${esc(b.text)}</p></div>`;
      });
      art.innerHTML = h;
      trayEl.innerHTML = tray.length ? tray.map((path, i) => `<div class="lx-it lx-ph" draggable="true" data-kind="tray" data-i="${i}">${photoHtml(path, 'tray')}</div>`).join('') : '<div class="lx-empty">No photos left out</div>';
      col.scrollTop = y;
    }
    draw();

    art.addEventListener('input', (e) => { const t = e.target.closest('[data-capfor]'); if (t) byPath.get(t.getAttribute('data-capfor')).caption = t.value; });
    box.addEventListener('click', (e) => {
      const o = e.target.closest('[data-out]');
      if (o) { const [b] = items.splice(+o.getAttribute('data-out'), 1); tray.push(b.path); draw(); }
    });

    // ---------- drag and drop ----------
    let drag = null; // {kind, i}
    const line = document.createElement('div'); line.className = 'lx-line';
    const clear = () => { line.remove(); box.querySelectorAll('.capdrop').forEach((x) => x.classList.remove('capdrop')); trayEl.classList.remove('over'); box.querySelectorAll('.drag').forEach((x) => x.classList.remove('drag')); };
    const dragged = () => drag && (drag.kind === 'top' ? { t: 'img', path: top } : drag.kind === 'tray' ? { t: 'img', path: tray[drag.i] } : items[drag.i]);
    box.addEventListener('dragstart', (e) => {
      if (e.target.closest && e.target.closest('textarea')) { e.preventDefault(); return; }
      const it = e.target.closest && e.target.closest('.lx-it'); if (!it) return;
      drag = { kind: it.getAttribute('data-kind'), i: +it.getAttribute('data-i') };
      e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'x'); } catch (x) {}
      setTimeout(() => it.classList.add('drag'), 0);
    });
    box.addEventListener('dragend', () => { drag = null; clear(); });
    let target = null; // {type:'gap', at} | {type:'cap', i} | {type:'tray'} | {type:'top'}
    box.addEventListener('dragover', (e) => {
      if (!drag) return;
      const d = dragged(); if (!d) return;
      e.preventDefault();
      // keep scrolling while dragging near the top or bottom edge
      const r = col.getBoundingClientRect();
      if (e.clientY < r.top + 70) col.scrollTop -= 18; else if (e.clientY > r.bottom - 70) col.scrollTop += 18;
      clear(); target = null;
      if (e.target.closest('.lx-side')) { if (d.t === 'img') { trayEl.classList.add('over'); target = { type: 'tray' }; } return; }
      if (e.target.closest('[data-zone="top"]')) { if (d.t === 'img') { box.querySelector('[data-zone="top"]').classList.add('capdrop'); target = { type: 'top' }; } return; }
      const it = e.target.closest('.lx-art .lx-it[data-kind="art"]');
      if (!it) {
        // below the last item: append
        if (e.target.closest('.lx-art')) { art.appendChild(line); target = { type: 'gap', at: items.length }; }
        return;
      }
      const i = +it.getAttribute('data-i'); const b = items[i]; const rr = it.getBoundingClientRect();
      // A paragraph dropped on the middle of a photo becomes its caption.
      if (d.t !== 'img' && b.t === 'img' && e.clientY > rr.top + rr.height * 0.2 && e.clientY < rr.bottom - rr.height * 0.2) { it.classList.add('capdrop'); target = { type: 'cap', i }; return; }
      const after = e.clientY > rr.top + rr.height / 2;
      it.parentNode.insertBefore(line, after ? it.nextSibling : it);
      target = { type: 'gap', at: i + (after ? 1 : 0) };
    });
    box.addEventListener('drop', (e) => {
      if (!drag || !target) return; e.preventDefault();
      const d = dragged(); const src = drag; drag = null; clear();
      // take the item out of where it was
      const take = () => {
        if (src.kind === 'art') { items.splice(src.i, 1); return; }
        if (src.kind === 'tray') { tray.splice(src.i, 1); return; }
        if (src.kind === 'top') top = null;
      };
      if (target.type === 'cap') {
        const ph = byPath.get(items[target.i].path); const text = d.text.trim();
        ph.caption = ph.caption && ph.caption.trim() ? ph.caption.trim() + ' ' + text : text;
        items.splice(src.i, 1);
      } else if (target.type === 'tray') {
        take(); tray.push(d.path);
      } else if (target.type === 'top') {
        if (src.kind === 'top') return draw();
        const old = top; take();
        if (old) { const at = src.kind === 'art' ? Math.min(src.i, items.length) : 0; items.splice(at, 0, { t: 'img', path: old }); }
        top = d.path;
      } else {
        let at = target.at;
        if (src.kind === 'art' && src.i < at) at--;
        take(); items.splice(at, 0, d);
      }
      if (!top) { const first = items.findIndex((b) => b.t === 'img'); if (first >= 0) top = items.splice(first, 1)[0].path; }
      draw();
    });

    const close = () => { box.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    box.querySelector('.lx-cancel').addEventListener('click', close);
    box.querySelector('.lx-done').addEventListener('click', () => {
      const used = items.filter((b) => b.t === 'img').map((b) => b.path);
      const order = [top, ...used].filter(Boolean);
      const photos = [...order.map((path) => Object.assign(byPath.get(path), { include: true })), ...tray.map((path) => Object.assign(byPath.get(path), { include: false }))];
      // keep any photo the lists somehow missed, left out
      P.forEach((p) => { if (!photos.includes(p)) photos.push(Object.assign(p, { include: false })); });
      const body = items.map((b) => b.t === 'img' ? { t: 'img', path: b.path, text: '' } : { t: b.t || 'p', text: b.text });
      close(); opt.onDone(photos, body);
    });
  }
  window.RCMLayout = { open };
})();

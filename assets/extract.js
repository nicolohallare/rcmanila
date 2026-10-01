/* Reads a Balita PDF in the browser: page text, page thumbnails and the photos placed on each page.
   Photos are taken from the image files placed in the PDF, cut to the frame they are printed in, so they carry
   no page text, captions or headlines. If an image can't be read that way, it is cropped from a page render. */
(function () {
  const PDFJS_BASE = window.PDFJS_BASE || 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  let ready = null;

  function loadPdfJs() {
    if (ready) return ready;
    ready = (async () => {
      if (!window.pdfjsLib) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = PDFJS_BASE + 'pdf.min.js';
          s.onload = res; s.onerror = () => rej(new Error('Could not load the PDF reader.'));
          document.head.appendChild(s);
        });
      }
      try {
        const src = await (await fetch(PDFJS_BASE + 'pdf.worker.min.js')).text();
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      } catch (e) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js';
      }
      return window.pdfjsLib;
    })();
    return ready;
  }

  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
  ];
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  const inv = (m) => { const d = m[0] * m[3] - m[1] * m[2]; return d ? [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d] : null; };
  const boxOf = (m, x0, y0, x1, y1) => { const pts = [apply(m, x0, y0), apply(m, x1, y0), apply(m, x0, y1), apply(m, x1, y1)]; const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; };
  const meet = (a, b) => (!a ? b : !b ? a : { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });

  // Walk the drawing operations to find where each image is placed (in PDF units), and the frame it is
  // clipped to. Layout programs place the whole photo and hide the parts outside its frame with a clipping
  // path; without the clip, the box would take in the page text that sits over the hidden part.
  async function imagePlacements(page, OPS) {
    const ops = await page.getOperatorList();
    let ctm = [1, 0, 0, 1, 0, 0], clip = null, lastPath = null, pendingClip = null;
    const stack = [];
    const out = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], a = ops.argsArray[i];
      if (fn === OPS.save) stack.push([ctm, clip]);
      else if (fn === OPS.restore) { const t = stack.pop(); ctm = t ? t[0] : [1, 0, 0, 1, 0, 0]; clip = t ? t[1] : null; }
      else if (fn === OPS.transform) ctm = mul(ctm, a);
      else if (fn === OPS.paintFormXObjectBegin) {
        stack.push([ctm, clip]);
        if (a && a[0]) ctm = mul(ctm, a[0]);
        if (a && a[1] && a[1].length === 4) clip = meet(clip, boxOf(ctm, a[1][0], a[1][1], a[1][2], a[1][3]));   // form bounding box
      }
      else if (fn === OPS.paintFormXObjectEnd) { const t = stack.pop(); ctm = t ? t[0] : [1, 0, 0, 1, 0, 0]; clip = t ? t[1] : null; }
      else if (fn === OPS.constructPath) {
        const mm = a && a[2];
        lastPath = mm && mm.length === 4 && isFinite(mm[0]) ? boxOf(ctm, mm[0], mm[2], mm[1], mm[3]) : null;   // pdf.js gives [minX, maxX, minY, maxY]
      }
      else if (fn === OPS.clip || fn === OPS.eoClip) pendingClip = lastPath;
      else if (fn === OPS.endPath || fn === OPS.fill || fn === OPS.eoFill || fn === OPS.stroke || fn === OPS.fillStroke || fn === OPS.eoFillStroke || fn === OPS.closeStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke) {
        if (pendingClip) { clip = meet(clip, pendingClip); pendingClip = null; }
      }
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageXObjectRepeat || fn === OPS.paintJpegXObject) {
        const full = boxOf(ctm, 0, 0, 1, 1);
        const vis = meet(full, clip);
        let nw = 0, nh = 0, objId = null, inline = null;
        if (fn === OPS.paintImageXObject && a) { objId = a[0]; nw = a[1] || 0; nh = a[2] || 0; }
        else if (a && a[0] && a[0].width) { inline = a[0]; nw = a[0].width; nh = a[0].height; }
        const straight = Math.abs(ctm[1]) < 1e-6 && Math.abs(ctm[2]) < 1e-6;   // not rotated or skewed
        out.push({ x0: vis.x0, x1: vis.x1, y0: vis.y0, y1: vis.y1, full, nw, nh, objId, inline, ctm: straight ? ctm.slice() : null });
      }
    }
    return out;
  }

  // The photo's own pixels as placed in the PDF (without any text or graphics printed over it).
  function objGet(page, id) {
    const store = id.startsWith('g_') ? page.commonObjs : page.objs;
    try { return store.has(id) ? store.get(id) : null; } catch (e) { return null; }
  }
  function imageCanvas(img) {
    if (!img || !img.width || !img.height) return null;
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    if (img.bitmap) { g.drawImage(img.bitmap, 0, 0); return c; }
    if (!img.data) return null;
    const n = img.width * img.height, d = img.data, rgba = new Uint8ClampedArray(n * 4);
    if (d.length === n * 4) rgba.set(d);
    else if (d.length === n * 3) { for (let i = 0, j = 0; i < n; i++, j += 3) { rgba[i * 4] = d[j]; rgba[i * 4 + 1] = d[j + 1]; rgba[i * 4 + 2] = d[j + 2]; rgba[i * 4 + 3] = 255; } }
    else return null;   // 1-bit masks and other packed formats: use the page render instead
    const tmp = document.createElement('canvas'); tmp.width = img.width; tmp.height = img.height;
    tmp.getContext('2d').putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
    g.drawImage(tmp, 0, 0); return c;
  }
  // Which part of the image's pixels is visible inside its frame.
  function visiblePixels(c, cand) {
    const m = cand.ctm && inv(cand.ctm); if (!m) return null;
    const p0 = apply(m, cand.x0, cand.y0), p1 = apply(m, cand.x1, cand.y1);
    const u0 = Math.max(0, Math.min(p0[0], p1[0])), u1 = Math.min(1, Math.max(p0[0], p1[0]));
    const v0 = Math.max(0, Math.min(p0[1], p1[1])), v1 = Math.min(1, Math.max(p0[1], p1[1]));
    if (u1 - u0 < 0.02 || v1 - v0 < 0.02) return null;
    // PDF image space: the first pixel row is at v = 1, the last at v = 0.
    return { sx: u0 * c.width, sw: (u1 - u0) * c.width, sy: (1 - v1) * c.height, sh: (v1 - v0) * c.height, flipX: cand.ctm[0] < 0, flipY: cand.ctm[3] < 0 };
  }

  // Plain colour fills and gradients (design backgrounds) have almost no detail; real photos do.
  function hasDetail(c) {
    const w = c.width, h = c.height; if (w < 8 || h < 8) return false;
    const d = c.getContext('2d').getImageData(0, 0, w, h).data;
    let sum = 0, n = 0;
    for (let y = 1; y < h; y += 2) for (let x = 1; x < w; x += 2) {
      const i = (y * w + x) * 4, l = (y * w + x - 1) * 4, u = ((y - 1) * w + x) * 4;
      const g = d[i] + d[i + 1] + d[i + 2];
      sum += Math.abs(g - d[l] - d[l + 1] - d[l + 2]) + Math.abs(g - d[u] - d[u + 1] - d[u + 2]); n++;
    }
    return sum / n / 6 > 1.2;
  }

  function canvasToBlob(canvas, quality) {
    return new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', quality));
  }

  function scaledCopy(src, sx, sy, sw, sh, maxW) {
    const s = Math.min(1, maxW / sw);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw * s)); c.height = Math.max(1, Math.round(sh * s));
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c;
  }

  /* onProgress({stage:'page', n, total, thumbUrl, photos}) */
  async function extractPdf(file, onProgress, opts) {
    opts = opts || {};
    const pdfjsLib = await loadPdfJs();
    const OPS = pdfjsLib.OPS;
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
    const total = doc.numPages;
    const pages = [];
    for (let n = 1; n <= total; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const W = base.width, H = base.height, pageArea = W * H;

      const tc = await page.getTextContent();
      let text = '';
      for (const it of tc.items) { text += it.str; text += it.hasEOL ? '\n' : (it.str.endsWith(' ') ? '' : ' '); }
      text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

      // Candidate photos: real size on the page, not tiny icons and not full-page backgrounds.
      const raw = opts.pagesOnly ? [] : await imagePlacements(page, OPS);
      const seen = new Set();
      const cands = [];
      let oldK = 0;
      for (const r of raw) {
        // opts.recut: number the photos the way the earlier version of this reader did (by the photo's whole
        // placed area, before frames were taken into account), so new cuts can replace photos already saved.
        if (opts.recut) {
          const f = r.full, fx0 = Math.max(0, f.x0), fx1 = Math.min(W, f.x1), fy0 = Math.max(0, f.y0), fy1 = Math.min(H, f.y1);
          const fw = fx1 - fx0, fh = fy1 - fy0;
          if (fw <= 0 || fh <= 0 || (fw * fh) / pageArea < 0.02 || (fw * fh) / pageArea > 0.75 || fw < 60 || fh < 50) continue;
          const fkey = [fx0, fy0, fx1, fy1].map((v) => Math.round(v)).join(',');
          if (seen.has(fkey)) continue;
          seen.add(fkey); oldK++;
          const x0 = Math.max(0, r.x0), x1 = Math.min(W, r.x1), y0 = Math.max(0, r.y0), y1 = Math.min(H, r.y1);
          if (x1 - x0 < 30 || y1 - y0 < 30) continue;
          cands.push({ x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, nw: r.nw, nh: r.nh, objId: r.objId, inline: r.inline, ctm: r.ctm, oldId: 'p' + String(n).padStart(3, '0') + '-' + oldK });
          continue;
        }
        const x0 = Math.max(0, r.x0), x1 = Math.min(W, r.x1), y0 = Math.max(0, r.y0), y1 = Math.min(H, r.y1);
        const w = x1 - x0, h = y1 - y0;
        if (w <= 0 || h <= 0) continue;
        const frac = (w * h) / pageArea;
        if (frac < 0.02 || frac > 0.75) continue;
        if (w < 60 || h < 50) continue;
        const key = [x0, y0, x1, y1].map((v) => Math.round(v)).join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        cands.push({ x0, x1, y0, y1, w, h, nw: r.nw, nh: r.nh, objId: r.objId, inline: r.inline, ctm: r.ctm });
      }
      if (opts.recut && opts.only) { for (let i = cands.length - 1; i >= 0; i--) if (!opts.only.has(cands[i].oldId)) cands.splice(i, 1); }

      // Render once at a scale that gives photos up to ~1600px, then crop.
      let scale = opts.pagesOnly ? Math.min(3, 1100 / W) : 1.6;
      for (const c of cands) {
        const want = Math.min(c.nw || 2000, 2000) / c.w;
        scale = Math.max(scale, want);
      }
      scale = Math.min(scale, 6, 7000 / W);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

      const thumbCanvas = scaledCopy(canvas, 0, 0, canvas.width, canvas.height, 1100);
      const thumbBlob = await canvasToBlob(thumbCanvas, 0.74);

      const photos = [];
      let k = 0;
      for (const c of cands) {
        // Best: the photo's own pixels, cut to the frame it is shown in. Fallback: the page render.
        let big = null, small = null;
        try {
          const src = imageCanvas(c.inline || (c.objId && objGet(page, c.objId)));
          const v = src && visiblePixels(src, c);
          if (v && v.sw >= 120 && v.sh >= 90) {
            let from = src;
            if (v.flipX || v.flipY) {   // drawn mirrored on the page: mirror the pixels the same way
              from = document.createElement('canvas'); from.width = src.width; from.height = src.height;
              const g = from.getContext('2d'); g.translate(v.flipX ? src.width : 0, v.flipY ? src.height : 0); g.scale(v.flipX ? -1 : 1, v.flipY ? -1 : 1); g.drawImage(src, 0, 0);
              if (v.flipX) v.sx = src.width - v.sx - v.sw;
              if (v.flipY) v.sy = src.height - v.sy - v.sh;
            }
            big = scaledCopy(from, v.sx, v.sy, v.sw, v.sh, 2000);
            small = scaledCopy(from, v.sx, v.sy, v.sw, v.sh, 320);
            src.width = src.height = 0;
          }
        } catch (e) { big = null; }
        if (!big) {
          // PDF y grows upward; canvas y grows downward.
          const sx = c.x0 * scale, sw = c.w * scale, sy = (H - c.y1) * scale, sh = c.h * scale;
          big = scaledCopy(canvas, sx, sy, sw, sh, 2000);
          small = scaledCopy(canvas, sx, sy, sw, sh, 320);
        }
        if (!c.oldId && !hasDetail(small)) continue;
        k++;
        photos.push({
          id: c.oldId || 'p' + String(n).padStart(3, '0') + '-' + k,
          page: n,
          box: [c.x0 / W, (H - c.y1) / H, c.x1 / W, (H - c.y0) / H].map((v) => Math.round(v * 1000) / 1000),
          width: big.width, height: big.height,
          blob: await canvasToBlob(big, 0.86),
          preview: small.toDataURL('image/jpeg', 0.62)
        });
      }
      canvas.width = canvas.height = 0;

      const rec = { n, width: W, height: H, spread: W > H * 0.82 /* real two-page spreads measure 0.89+; single letter and A4 pages 0.71–0.77 */, text, thumbBlob, thumbUrl: URL.createObjectURL(thumbBlob), photos };
      pages.push(rec);
      page.cleanup();
      if (onProgress) onProgress({ stage: 'page', n, total, page: rec });
    }
    await doc.destroy();
    return pages;
  }

  // Cover image: Balita PDF pages are two-page spreads (back cover ad on the left, front cover on the right),
  // so the cover is the right half of page 1. A single portrait page is used whole.
  async function coverFrom(pageRec) {
    const img = await createImageBitmap(pageRec.thumbBlob);
    const half = pageRec.spread;
    const sx = half ? img.width / 2 : 0, sw = half ? img.width / 2 : img.width;
    const c = scaledCopy(img, sx, 0, sw, img.height, 900);
    return canvasToBlob(c, 0.82);
  }

  // Reads only the first two pages' text, for guessing the issue number and date before a batch import.
  async function peek(file) {
    const pdfjsLib = await loadPdfJs();
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    let text = '';
    for (let n = 1; n <= Math.min(2, doc.numPages); n++) { const tc = await (await doc.getPage(n)).getTextContent(); text += tc.items.map((i) => i.str).join(' ') + '\n'; }
    const pages = doc.numPages; await doc.destroy();
    return { text, pages };
  }

  window.BalitaExtract = { extractPdf, coverFrom, loadPdfJs, peek };
})();

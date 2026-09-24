/* Reads a Balita PDF in the browser: page text, page thumbnails and the photos placed on each page.
   Photos are cropped from a high-resolution render of the page, so they look exactly as printed. */
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

  // Walk the drawing operations to find where each image is placed (in PDF units).
  async function imagePlacements(page, OPS) {
    const ops = await page.getOperatorList();
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    const out = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], a = ops.argsArray[i];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = mul(ctm, a);
      else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (a && a[0]) ctm = mul(ctm, a[0]); }
      else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageXObjectRepeat || fn === OPS.paintJpegXObject) {
        const pts = [apply(ctm, 0, 0), apply(ctm, 1, 0), apply(ctm, 0, 1), apply(ctm, 1, 1)];
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        let nw = 0, nh = 0;
        if (fn === OPS.paintImageXObject && a) { nw = a[1] || 0; nh = a[2] || 0; }
        else if (a && a[0] && a[0].width) { nw = a[0].width; nh = a[0].height; }
        out.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), nw, nh });
      }
    }
    return out;
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
      for (const r of raw) {
        const x0 = Math.max(0, r.x0), x1 = Math.min(W, r.x1), y0 = Math.max(0, r.y0), y1 = Math.min(H, r.y1);
        const w = x1 - x0, h = y1 - y0;
        if (w <= 0 || h <= 0) continue;
        const frac = (w * h) / pageArea;
        if (frac < 0.02 || frac > 0.75) continue;
        if (w < 60 || h < 50) continue;
        const key = [x0, y0, x1, y1].map((v) => Math.round(v)).join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        cands.push({ x0, x1, y0, y1, w, h, nw: r.nw, nh: r.nh });
      }

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
        // PDF y grows upward; canvas y grows downward.
        const sx = c.x0 * scale, sw = c.w * scale, sy = (H - c.y1) * scale, sh = c.h * scale;
        const big = scaledCopy(canvas, sx, sy, sw, sh, 2000);
        const small = scaledCopy(canvas, sx, sy, sw, sh, 320);
        k++;
        photos.push({
          id: 'p' + String(n).padStart(3, '0') + '-' + k,
          page: n,
          box: [c.x0 / W, (H - c.y1) / H, c.x1 / W, (H - c.y0) / H].map((v) => Math.round(v * 1000) / 1000),
          width: big.width, height: big.height,
          blob: await canvasToBlob(big, 0.86),
          preview: small.toDataURL('image/jpeg', 0.62)
        });
      }
      canvas.width = canvas.height = 0;

      const rec = { n, width: W, height: H, spread: W > H * 0.7, text, thumbBlob, thumbUrl: URL.createObjectURL(thumbBlob), photos };
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

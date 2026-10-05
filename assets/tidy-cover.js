/* Straightens and trims a photographed or scanned page so no white or table background shows around it.
   Works on any image the page can read (same origin or CORS). Returns a canvas, or null when no clear page edge is found. */
(function () {
  function lum(d, i) { return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; }
  function analyse(src, W) {
    const s = W / src.width, H = Math.round(src.height * s);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data, g = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) g[i] = lum(d, i * 4);
    // Background = the bright surround; the page/cover is anything clearly darker than it.
    const edge = []; for (let xx = 0; xx < W; xx++) { edge.push(g[xx], g[(H - 1) * W + xx]); } for (let yy = 0; yy < H; yy++) { edge.push(g[yy * W], g[yy * W + W - 1]); }
    edge.sort((a, b) => a - b); const bg = edge[Math.floor(edge.length * 0.9)];
    return { g, W, H, s, bg };
  }
  function edges(a, thr) {
    const { g, W, H } = a, L = [], R = [];
    for (let y = Math.floor(H * 0.08); y < H * 0.92; y++) {
      let l = -1, r = -1;
      for (let x = 0; x < W - 3; x++) if (g[y * W + x] < thr && g[y * W + x + 1] < thr && g[y * W + x + 2] < thr) { l = x; break; }
      for (let x = W - 1; x > 2; x--) if (g[y * W + x] < thr && g[y * W + x - 1] < thr && g[y * W + x - 2] < thr) { r = x; break; }
      if (l >= 0 && r > l + W * 0.3) { L.push([y, l]); R.push([y, r]); }
    }
    return { L, R };
  }
  function slope(pts) {
    if (pts.length < 20) return null;
    // Robust: median of pairwise slopes between points far apart.
    const sl = [], n = pts.length, step = Math.max(1, Math.floor(n / 60));
    for (let i = 0; i < n; i += step) for (let j = i + Math.floor(n / 3); j < n; j += step) sl.push((pts[j][1] - pts[i][1]) / (pts[j][0] - pts[i][0]));
    sl.sort((a, b) => a - b); return sl.length ? sl[Math.floor(sl.length / 2)] : null;
  }
  function bbox(a, thr) {
    const { g, W, H } = a, col = new Float32Array(W), row = new Float32Array(H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y * W + x] < thr) { col[x]++; row[y]++; }
    let x0 = 0, x1 = W - 1, y0 = 0, y1 = H - 1;
    while (x0 < W / 3 && col[x0] < H * 0.6) x0++;
    while (x1 > W * 2 / 3 && col[x1] < H * 0.6) x1--;
    while (y0 < H / 3 && row[y0] < (x1 - x0) * 0.6) y0++;
    while (y1 > H * 2 / 3 && row[y1] < (x1 - x0) * 0.6) y1--;
    return { x0, x1, y0, y1 };
  }
  window.tidyPage = function (img, opts = {}) {
    const maxH = opts.maxHeight || 3200;
    const a = analyse(img, 320), thr = a.bg - (opts.contrast || 38);
    if (a.bg < 170) return null; // dark surround: nothing to trim
    const { L, R } = edges(a, thr), sL = slope(L), sR = slope(R);
    let ang = 0; if (sL != null && sR != null && Math.abs(sL - sR) < 0.02) ang = Math.atan((sL + sR) / 2); else if (sL != null && sR == null) ang = Math.atan(sL); else if (sR != null && sL == null) ang = Math.atan(sR);
    if (Math.abs(ang) > 0.14) ang = 0; // over 8°: not a simple tilt, leave it
    // Rotate the full image so the page stands straight, on a white ground.
    const k = Math.min(1, maxH / img.height), w = Math.round(img.width * k), h = Math.round(img.height * k);
    const r = document.createElement('canvas'); r.width = w; r.height = h; const rx = r.getContext('2d');
    rx.fillStyle = '#fff'; rx.fillRect(0, 0, w, h); rx.translate(w / 2, h / 2); rx.rotate(ang); rx.drawImage(img, -w / 2, -h / 2, w, h);
    const b = analyse(r, 320), bb = bbox(b, thr), f = w / 320;
    const pw = (bb.x1 - bb.x0) * f, ph = (bb.y1 - bb.y0) * f;
    if (pw < w * 0.35 || ph < h * 0.35) return null; // page edge not found reliably
    const inset = Math.round(Math.min(pw, ph) * (opts.inset || 0.012));
    const sx = Math.round(bb.x0 * f) + inset, sy = Math.round(bb.y0 * f) + inset, cw = Math.round(pw) - inset * 2, ch = Math.round(ph) - inset * 2;
    if (cw > w * 0.985 && ch > h * 0.985 && Math.abs(ang) < 0.003) return null; // already tight
    const o = document.createElement('canvas'); o.width = cw; o.height = ch; o.getContext('2d').drawImage(r, sx, sy, cw, ch, 0, 0, cw, ch);
    o.dataset.angle = (ang * 180 / Math.PI).toFixed(2); return o;
  };
})();

// An original abstract landscape painting, drawn in brushstrokes with a fixed seed so it renders the same every time:
// dusty sky and a low sun, mauve ranges, ochre hills, a pale salt lake catching the light, and red earth with sage scrub.
function paintSaltOchre(canvas) {
  const W = canvas.width, H = canvas.height, g = canvas.getContext("2d");
  let seed = 20261121;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rr = (a, b) => a + rnd() * (b - a);
  const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
  // Horizon lines with soft, uneven edges.
  const wave = (base, amp, f1, f2, ph, f3 = 0) => (x) => base + amp * (Math.sin(x / W * f1 + ph) * 0.55 + Math.sin(x / W * f2 + ph * 1.7) * 0.3 + (f3 ? Math.sin(x / W * f3 + ph * 2.3) * 0.15 : 0));
  const far = wave(H * 0.43, H * 0.05, 6, 15, 0.3, 31);
  const ranges = wave(H * 0.5, H * 0.055, 8, 19, 1.2, 37);
  const hills = wave(H * 0.6, H * 0.05, 4, 11, 2.4);
  const lakeTop = wave(H * 0.69, H * 0.012, 3, 9, 0.4);
  const lakeBot = wave(H * 0.8, H * 0.02, 4, 11, 3.1);
  const bands = [
    { top: () => 0, bot: far, c: [24, 52, 84], j: [5, 6, 3], len: [40, 120], w: [10, 26] },             // sky
    { top: far, bot: ranges, c: [250, 16, 74], j: [8, 5, 4], len: [26, 80], w: [6, 15] },               // far ranges, hazy
    { top: ranges, bot: hills, c: [256, 15, 58], j: [8, 5, 6], len: [24, 76], w: [6, 15] },             // nearer ranges
    { top: hills, bot: lakeTop, c: [33, 60, 54], j: [6, 10, 8], len: [20, 70], w: [6, 15] },            // ochre hills
    { top: lakeTop, bot: lakeBot, c: [20, 40, 90], j: [8, 12, 4], len: [40, 140], w: [4, 11] },         // salt lake
    { top: lakeBot, bot: () => H, c: [12, 52, 34], j: [6, 10, 7], len: [18, 60], w: [7, 18] },          // red earth
  ];
  // Underpaint each band.
  for (const b of bands) {
    g.fillStyle = hsl(b.c[0], b.c[1], b.c[2]);
    g.beginPath(); g.moveTo(0, b.top(0));
    for (let x = 0; x <= W; x += 8) g.lineTo(x, b.top(x));
    for (let x = W; x >= 0; x -= 8) g.lineTo(x, b.bot(x));
    g.closePath(); g.fill();
  }
  // Brushstrokes, mostly horizontal, coloured from their band with a little variation.
  g.lineCap = "round";
  const stroke = (x, y, len, w, ang, col) => {
    g.strokeStyle = col; g.lineWidth = w; g.beginPath();
    const dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2, bow = rr(-w, w);
    g.moveTo(x - dx, y - dy); g.quadraticCurveTo(x, y + bow, x + dx, y + dy); g.stroke();
  };
  for (let pass = 0; pass < 3; pass++) {
    for (const b of bands) {
      const n = 1700;
      for (let i = 0; i < n; i++) {
        const x = rr(-40, W + 40);
        const t = b.top(Math.max(0, Math.min(W, x))), bt = b.bot(Math.max(0, Math.min(W, x)));
        const y = rr(t - 4, bt + 4);
        const depth = (y - t) / Math.max(1, bt - t);
        let [h, s, l] = b.c;
        if (b === bands[0]) {                              // sky: warmer and lighter towards the horizon and the sun
          h = 30 - depth * 12; l = 79 + depth * 8;
          const ds = Math.hypot(x - W * 0.66, y - H * 0.3) / (H * 0.3);
          if (ds < 1) { h = 22; s = 70; l = 84 - ds * 4; }
        }
        if (b === bands[2]) l -= depth * 8;                // ranges darken at their feet
        if (b === bands[3]) { l += (0.5 - depth) * 14; if (rnd() < 0.12) { h = 18; s = 48; l = 40; } } // sunlit tops, shadowed gullies
        if (b === bands[5]) { if (rnd() < 0.22) { h = 92; s = 14; l = 50; } l -= depth * 6; } // sage scrub in the red earth
        stroke(x, y, rr(...b.len), rr(...b.w), rr(-0.12, 0.12), hsl(h + rr(-b.j[0], b.j[0]), s + rr(-b.j[1], b.j[1]), l + rr(-b.j[2], b.j[2]), rr(0.18, 0.42)));
      }
    }
  }
  // A low sun, built up from small dabs, and its reflection streaked across the salt lake.
  const sx = W * 0.66, sy = H * 0.3, sr = H * 0.085;
  for (let i = 0; i < 900; i++) {
    const a = rr(0, Math.PI * 2), d = Math.sqrt(rnd()) * sr;
    stroke(sx + Math.cos(a) * d, sy + Math.sin(a) * d, rr(10, 26), rr(6, 12), rr(-0.5, 0.5), hsl(rr(10, 20), rr(62, 74), rr(50, 58), rr(0.3, 0.6)));
  }
  for (let i = 0; i < 260; i++) {
    const y = rr(lakeTop(sx) + 6, lakeBot(sx) - 6);
    const spread = (y - lakeTop(sx)) * 0.9 + 30;
    stroke(sx + rr(-spread, spread) * 0.6, y, rr(20, 70), rr(2, 6), rr(-0.03, 0.03), hsl(rr(12, 24), rr(55, 70), rr(62, 74), rr(0.25, 0.5)));
  }
  // Paper grain.
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}

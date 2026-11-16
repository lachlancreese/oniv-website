// Shared painting helpers for the ready-made label designs (90 x 100 mm, drawn at 1063 x 1181 px).
// Every design uses a fixed seed, so it renders exactly the same each time.
function painter(canvas, seed) {
  const g = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  let s = seed;
  const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rr = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const hsl = (h, sat, l, a = 1) => `hsla(${h},${sat}%,${l}%,${a})`;

  // Paper: a base colour, a few soft tonal shifts, and a fine grain.
  function paper(base, grain = 0.05, blotch = 0.035) {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) {
      const x = rr(0, W), y = rr(0, H), r = rr(120, 420);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const light = rnd() < 0.5;
      grad.addColorStop(0, light ? `rgba(255,255,255,${blotch})` : `rgba(90,70,40,${blotch * 0.7})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    grainOver(grain);
  }
  function grainOver(amount) {
    const n = Math.round(W * H / 22);
    for (let i = 0; i < n; i++) {
      const dark = rnd() < 0.55;
      g.fillStyle = dark ? `rgba(60,45,30,${rr(0, amount)})` : `rgba(255,255,255,${rr(0, amount * 1.2)})`;
      g.fillRect(rr(0, W), rr(0, H), rr(0.6, 1.8), rr(0.6, 1.8));
    }
  }

  // An irregular closed blob, for watercolour washes and soft shapes.
  function blobPath(x, y, r, jitter = 0.12, n = 28, sx = 1, sy = 1) {
    const pts = [];
    const ph1 = rr(0, 6.3), ph2 = rr(0, 6.3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 + jitter * (Math.sin(a * 3 + ph1) * 0.5 + Math.sin(a * 5 + ph2) * 0.3 + rr(-0.4, 0.4));
      pts.push([x + Math.cos(a) * r * k * sx, y + Math.sin(a) * r * k * sy]);
    }
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = pts[i % n], q = pts[(i + 1) % n];
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      if (i === 0) g.moveTo(mx, my); else g.quadraticCurveTo(p[0], p[1], mx, my);
    }
    g.closePath();
  }
  // A watercolour wash: several faint layers with a slightly darker edge, like pigment drying.
  function wash(x, y, r, h, sat, l, alpha = 0.3, layers = 5, sx = 1, sy = 1) {
    for (let i = 0; i < layers; i++) {
      blobPath(x + rr(-r, r) * 0.06, y + rr(-r, r) * 0.06, r * rr(0.82, 1.04), 0.16, 30, sx, sy);
      g.fillStyle = hsl(h + rr(-4, 4), sat, l + rr(-3, 3), alpha / layers * 1.6);
      g.fill();
    }
    g.lineWidth = rr(1, 2.2);
    g.strokeStyle = hsl(h, sat, Math.max(0, l - 12), alpha * 0.35);
    g.stroke();
  }

  // A leaf: base at (x, y), pointing along `angle`. `bend` curves it like a sickle; `round` makes it broad.
  function leaf(x, y, angle, len, wid, bend, fill, edge, opts = {}) {
    const n = 22, top = [], bot = [], mid = [];
    const fat = opts.fat || 0.8;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const c = bend * len * t * t;
      const w = wid * Math.pow(Math.sin(Math.PI * Math.pow(t, fat)), 1.1);
      top.push([t * len, c - w]); bot.push([t * len, c + w]); mid.push([t * len, c]);
    }
    g.save(); g.translate(x, y); g.rotate(angle);
    g.beginPath();
    top.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    for (let i = bot.length - 1; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]);
    g.closePath();
    if (opts.gradient) {
      const gr = g.createLinearGradient(0, 0, len, 0);
      gr.addColorStop(0, opts.gradient[0]); gr.addColorStop(1, opts.gradient[1]);
      g.fillStyle = gr;
    } else g.fillStyle = fill;
    if (fill || opts.gradient) g.fill();
    if (edge) { g.strokeStyle = edge; g.lineWidth = opts.edgeWidth || 1.2; g.stroke(); }
    if (opts.vein) {
      g.beginPath(); mid.slice(0, n - 2).forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.strokeStyle = opts.vein; g.lineWidth = opts.veinWidth || 1.2; g.stroke();
    }
    g.restore();
  }

  // A small star flower (five petals), e.g. NSW Christmas bush.
  function starFlower(x, y, r, fill, centre, rot = 0, petals = 5) {
    for (let i = 0; i < petals; i++) {
      const a = rot + (i / petals) * Math.PI * 2;
      leaf(x, y, a, r, r * 0.34, 0, fill, null, { fat: 0.7 });
    }
    if (centre) { g.beginPath(); g.arc(x, y, r * 0.2, 0, Math.PI * 2); g.fillStyle = centre; g.fill(); }
  }

  // A wattle puffball: a soft golden sphere with a fuzzy edge.
  function puff(x, y, r, h = 46, sat = 88, l = 56) {
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    gr.addColorStop(0, hsl(h + 6, sat, l + 18)); gr.addColorStop(1, hsl(h - 4, sat, l - 8));
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
    for (let i = 0; i < 14; i++) {
      const a = rr(0, Math.PI * 2);
      g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, rr(0.8, 1.8), 0, Math.PI * 2);
      g.fillStyle = hsl(h, sat, l + rr(-5, 12), 0.8); g.fill();
    }
  }

  // A curved stem through a list of points.
  function stem(pts, width, colour) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const last = pts[pts.length - 1]; g.lineTo(last[0], last[1]);
    g.strokeStyle = colour; g.lineWidth = width; g.lineCap = "round"; g.stroke();
  }

  return { g, W, H, rnd, rr, pick, hsl, paper, grainOver, blobPath, wash, leaf, starFlower, puff, stem };
}

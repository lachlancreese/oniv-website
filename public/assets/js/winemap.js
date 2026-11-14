// Interactive wine-regions map on /wine: zoom by state, filter by style, choose a region to read about it.
(function () {
  var root = document.querySelector("[data-winemap]");
  if (!root) return;
  var svg = root.querySelector("svg");
  var views = JSON.parse(root.getAttribute("data-views"));
  var dots = Array.prototype.slice.call(root.querySelectorAll(".wm-dot"));
  var articles = Array.prototype.slice.call(root.querySelectorAll(".wm-region"));
  var zoomButtons = Array.prototype.slice.call(root.querySelectorAll("[data-zoom]"));
  var filter = root.querySelector("[data-filter]");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var parse = function (v) { return v.split(" ").map(Number); };
  var full = parse(views.ALL);
  var current = full.slice();
  var zoom = "ALL";
  var anim = null;

  dots.forEach(function (g) {
    var c = g.querySelector("circle");
    g._x = +c.getAttribute("cx");
    g._y = +c.getAttribute("cy");
    var hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    hit.setAttribute("class", "wm-hit");
    hit.setAttribute("cx", g._x);
    hit.setAttribute("cy", g._y);
    g.insertBefore(hit, c);
  });

  // Keep dots and labels the same size on screen at every zoom level.
  function draw(vb) {
    svg.setAttribute("viewBox", vb.join(" "));
    var px = vb[2] / (svg.clientWidth || 600);
    dots.forEach(function (g) {
      var on = g.getAttribute("aria-pressed") === "true";
      var r = (on ? 9 : 6) * px;
      var c = g.querySelector("circle:not(.wm-hit)");
      c.setAttribute("r", r);
      g.querySelector(".wm-hit").setAttribute("r", 15 * px);
      var t = g.querySelector("text");
      var side = t.getAttribute("data-side");
      t.setAttribute("font-size", (svg.clientWidth < 560 ? 11.5 : 13) * px);
      t.setAttribute("stroke-width", 4 * px);
      if (side === "top" || side === "bottom") {
        t.setAttribute("x", g._x);
        t.setAttribute("y", side === "top" ? g._y - r - 5 * px : g._y + r + 14 * px);
      } else {
        t.setAttribute("x", g._x + (side === "left" ? -1 : 1) * (r + 5 * px));
        t.setAttribute("y", g._y + 4.5 * px);
      }
    });
  }

  // Hide any label that would overlap another label or run off the map; the chosen region always keeps its label.
  function declutter() {
    var vb = current, placed = [];
    dots.forEach(function (g) { if (!g.classList.contains("is-dim")) placed.push(g.querySelector("circle:not(.wm-hit)").getBBox()); });
    var order = dots.slice().sort(function (a, b) {
      return (b.getAttribute("aria-pressed") === "true") - (a.getAttribute("aria-pressed") === "true");
    });
    order.forEach(function (g) {
      var t = g.querySelector("text");
      g.classList.remove("lbl-off");
      var shown = g.getAttribute("aria-pressed") === "true" || (zoom !== "ALL" && g.classList.contains("in-zoom") && !g.classList.contains("is-dim"));
      if (!shown) return;
      var b = t.getBBox();
      var chosen = g.getAttribute("aria-pressed") === "true";
      var out = b.x < vb[0] || b.y < vb[1] || b.x + b.width > vb[0] + vb[2] || b.y + b.height > vb[1] + vb[3];
      var hit = placed.some(function (p) { return b.x < p.x + p.width && b.x + b.width > p.x && b.y < p.y + p.height && b.y + b.height > p.y; });
      if (!chosen && (out || hit)) { g.classList.add("lbl-off"); return; }
      placed.push(b);
    });
  }

  function zoomTo(key) {
    zoom = key;
    root.classList.toggle("is-zoomed", key !== "ALL");
    zoomButtons.forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-zoom") === key)); });
    dots.forEach(function (g) { g.classList.toggle("in-zoom", g.getAttribute("data-state") === key); });
    var target = parse(views[key]);
    if (anim) cancelAnimationFrame(anim);
    if (reduce) { current = target; draw(current); declutter(); return; }
    var from = current.slice(), start = performance.now(), dur = 480;
    (function step(now) {
      var t = Math.min(1, (now - start) / dur);
      var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      current = from.map(function (v, i) { return v + (target[i] - v) * e; });
      draw(current);
      if (t < 1) anim = requestAnimationFrame(step); else declutter();
    })(start);
  }

  function select(id, opts) {
    var dot = null;
    dots.forEach(function (g) {
      var on = g.getAttribute("data-id") === id;
      g.setAttribute("aria-pressed", String(on));
      if (on) dot = g;
    });
    if (!dot) return;
    // Bring the chosen dot to the front so its label sits on top.
    dot.parentNode.appendChild(dot);
    articles.forEach(function (a) { a.hidden = a.getAttribute("data-id") !== id; });
    var state = dot.getAttribute("data-state");
    if (opts && opts.zoom && zoom !== state) zoomTo(state); else { draw(current); declutter(); }
  }

  dots.forEach(function (g) {
    g.addEventListener("click", function () { select(g.getAttribute("data-id"), { zoom: zoom === "ALL" }); });
    g.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(g.getAttribute("data-id"), { zoom: zoom === "ALL" }); }
    });
  });
  zoomButtons.forEach(function (b) { b.addEventListener("click", function () { zoomTo(b.getAttribute("data-zoom")); }); });
  filter.addEventListener("change", function () {
    var v = filter.value;
    dots.forEach(function (g) {
      var tags = " " + g.getAttribute("data-tags") + " ";
      g.classList.toggle("is-dim", v !== "all" && tags.indexOf(" " + v + " ") < 0);
    });
    declutter();
  });
  root.querySelectorAll(".wm-table a[data-id]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      select(a.getAttribute("data-id"), { zoom: true });
      root.querySelector(".wm-body").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
  });

  var fromHash = location.hash.indexOf("#region-") === 0 ? location.hash.slice(8) : null;
  select(fromHash || root.getAttribute("data-default"), { zoom: !!fromHash });
  window.addEventListener("resize", function () { draw(current); declutter(); });
})();

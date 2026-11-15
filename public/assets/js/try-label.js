// "See your logo on a bottle": finds a logo from a website (via /api/brand) or takes an uploaded one, builds a
// front label from it in the browser, and puts it on the 3D bottle in [data-try] (or shows it flat where 3D
// isn't running). "Send this for my free mockup" carries the logo and the preview to the enquiry form.
(function () {
  var root = document.querySelector("[data-try]");
  if (!root) return;
  var form = root.querySelector(".try-form");
  var stage = root.querySelector(".hero-stage");
  var flat = null;   // the label shown flat, where the 3D bottle isn't running (made when first needed)
  var status = root.querySelector(".try-status");
  var next = root.querySelector(".try-next");
  var siteInput = root.querySelector("#try-site");
  var fileInput = root.querySelector("#try-file");
  var lineInput = root.querySelector("#try-line");
  var nameInput = root.querySelector("#try-name");
  var msgInput = root.querySelector("#try-msg");
  // A back-label message to suit each set of front words; the visitor can change it.
  var MESSAGES = {
    "season's greetings": "Thank you for your support this year. Wishing you a joyful festive season and a wonderful year ahead.",
    "with our thanks": "Thank you for your partnership. We hope this bottle finds its way to a good table.",
    "client reserve": "A wine chosen for the people we're glad to work with. Here's to what we build next.",
  };
  var msgEdited = false, nameEdited = false;
  var wineSel = root.querySelector("#try-wine");
  var casesInput = root.querySelector("#try-cases");
  var dateInput = root.querySelector("#try-date");
  var priceEl = root.querySelector(".try-price");
  var styleBtns = root.querySelectorAll("[data-style]");
  var tabs = root.querySelectorAll("[data-tab]");
  var panels = root.querySelectorAll("[data-panel]");

  var W = 1024, H = 1138;                      // same proportions as the printed front label
  var state = { logo: null, kind: "logo", name: "", color: "", site: "", label: null, logoBlob: null, style: "classic" };

  // ---- Order size and starting price (from $288 a case incl. GST and the label; see /pricing) --------------
  function cases() { return Math.max(1, Math.min(500, Math.round(Number(casesInput.value) || 1))); }
  function money(n) { return "$" + n.toLocaleString("en-AU"); }
  function updatePrice() {
    var n = cases();
    priceEl.innerHTML = "<b>" + n + (n === 1 ? " case" : " cases") + " · " + n * 12 + " bottles, from " + money(n * 288) + "</b>" +
      " including GST and your labels. " + (n >= 2
        ? "Delivery is included to every capital city and the Gold Coast."
        : "Delivery is $35 to every capital city and the Gold Coast, or included from two cases.") +
      " Regional delivery is quoted. We confirm your price on our call.";
  }
  casesInput.addEventListener("input", updatePrice);
  updatePrice();

  // ---- Wine and bottle ---------------------------------------------------------------------------------
  function sparkling() { return wineSel.value === "Brut NV"; }
  function varietyText() { return sparkling() ? "BRUT NV" : wineSel.value.toUpperCase() + "  ·  2025"; }
  function setBottle() {
    if (stage.classList.contains("is-live")) stage.dispatchEvent(new CustomEvent("hero3d:bottle", { detail: { type: sparkling() ? "sparkling" : "still" } }));
  }
  wineSel.addEventListener("change", function () { setBottle(); if (state.logo) draw(); });

  styleBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      state.style = b.getAttribute("data-style");
      styleBtns.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      if (state.logo) draw();
    });
  });

  function say(text, isError) {
    status.textContent = text || "";
    status.classList.toggle("is-error", !!isError);
  }

  // Tabs: website or upload.
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (t) { t.setAttribute("aria-selected", String(t === tab)); });
      panels.forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== tab.getAttribute("data-tab"); });
      say("");
    });
  });
  function matchMessage() {
    // Picking other front words brings the matching back message, unless the visitor has written their own.
    var stock = MESSAGES[(lineInput.value || "").trim().toLowerCase()];
    if (stock && !msgEdited) msgInput.value = stock;
  }
  root.querySelectorAll("[data-line]").forEach(function (b) {
    b.addEventListener("click", function () { lineInput.value = b.getAttribute("data-line"); matchMessage(); if (state.logo) draw(); });
  });
  var lineTimer, backTimer;
  lineInput.addEventListener("input", function () { matchMessage(); clearTimeout(lineTimer); if (state.logo) lineTimer = setTimeout(draw, 250); });
  msgInput.addEventListener("input", function () {
    msgEdited = msgInput.value.trim() !== "";
    clearTimeout(backTimer); if (state.logo) backTimer = setTimeout(function () { drawBack(); show("back"); }, 300);
  });
  nameInput.addEventListener("input", function () {
    nameEdited = nameInput.value.trim() !== "";
    clearTimeout(backTimer); if (state.logo) backTimer = setTimeout(function () { drawBack(); show("back"); }, 300);
  });

  // ---- Getting the logo --------------------------------------------------------------------
  function loadImage(blob) {
    return new Promise(function (resolve, reject) {
      var go = function (b) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error("image")); };
        img.src = URL.createObjectURL(b);
      };
      if (!/svg/.test(blob.type)) return go(blob);
      // SVGs need a size of their own before they can be drawn; take it from the viewBox.
      blob.text().then(function (text) {
        var doc = new DOMParser().parseFromString(text, "image/svg+xml");
        var svg = doc.documentElement;
        if (!svg || svg.nodeName.toLowerCase() !== "svg") return reject(new Error("svg"));
        var vb = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
        var w = parseFloat(svg.getAttribute("width")), h = parseFloat(svg.getAttribute("height"));
        if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { w = 1200; h = 1200 * vb[3] / vb[2]; }
        if (!(w > 0 && h > 0)) { w = 1200; h = 600; }
        svg.setAttribute("width", String(w));
        svg.setAttribute("height", String(h));
        if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        go(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
      }, reject);
    });
  }

  function useLogo(blob, info) {
    return loadImage(blob).then(function (img) {
      state.logo = img;
      state.logoBlob = blob;
      state.kind = info.kind || "logo";
      state.name = info.name || "";
      state.color = info.color || "";
      state.site = info.site || "";
      if (state.name && !nameEdited) nameInput.value = state.name;
      draw();
      // On a phone the bottle sits below the form, so bring it into view.
      if (window.innerWidth < 960) stage.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var raw = siteInput.value.trim();
    if (!raw) { say("Type your website, like yourbusiness.com.au.", true); siteInput.focus(); return; }
    var button = form.querySelector('[type="submit"]');
    button.disabled = true;
    say("Finding your logo…");
    fetch("/api/brand?d=" + encodeURIComponent(raw))
      .then(function (res) {
        if (!res.ok) return res.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.error || "lookup"); });
        var info = {
          kind: res.headers.get("X-Logo-Kind") || "logo",
          name: decodeURIComponent(res.headers.get("X-Brand-Name") || ""),
          color: res.headers.get("X-Brand-Color") || "",
          site: raw,
        };
        return res.blob().then(function (blob) { return useLogo(blob, info); });
      })
      .then(function () {
        say(state.kind === "icon"
          ? "We found your icon, not your full logo, so here's a version with your name. Upload your logo for a closer preview."
          : "Here's your logo on the bottle. Not quite right? Upload your logo instead.");
      })
      .catch(function (err) {
        say(err && err.message && err.message.length > 12 ? err.message : "We couldn't find a logo on that website. Upload your logo instead.", true);
      })
      .finally(function () { button.disabled = false; });
  });

  fileInput.addEventListener("change", function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|svg\+xml|webp|gif)$/.test(file.type)) { say("Please choose a PNG, JPG or SVG file. You can send other formats with your enquiry.", true); return; }
    if (file.size > 10 * 1024 * 1024) { say("That file is over 10 MB. Please choose a smaller one.", true); return; }
    say("Building your label…");
    useLogo(file, { kind: "logo", site: "" })
      .then(function () { say("Here's your logo on the bottle."); })
      .catch(function () { say("We couldn't read that file. Please try a PNG, JPG or SVG.", true); });
  });

  // ---- Reading the logo's colours -----------------------------------------------------------
  function luminance(c) {
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function contrast(a, b) { var x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function hex(c) { return "#" + c.slice(0, 3).map(function (v) { return ("0" + Math.round(v).toString(16)).slice(-2); }).join(""); }
  function parseHex(s) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})/i.exec(s || "");
    if (!m) return null;
    var h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function saturation(c) { var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]); return mx ? (mx - mn) / mx : 0; }

  function analyse(img) {
    var n = 160, s = Math.min(1, n / Math.max(img.width, img.height));
    var w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    var g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    var d = g.getImageData(0, 0, w, h).data;
    var px = function (x, y) { var i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };

    // Does the logo bring its own solid background? Check the corners.
    var corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
    var opaque = corners.every(function (p) { return p[3] > 240; });
    var bg = null;
    if (opaque) {
      var a = corners[0];
      if (corners.every(function (p) { return Math.abs(p[0] - a[0]) + Math.abs(p[1] - a[1]) + Math.abs(p[2] - a[2]) < 40; })) bg = a;
    }
    var isBg = function (p) {
      if (p[3] < 40) return true;
      return bg && Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) < 48;
    };

    // The logo's own pixels: their bounds (to trim empty margins), brightness and strongest colour.
    var minX = w, minY = h, maxX = -1, maxY = -1, count = 0, lum = 0, white = 0, buckets = {};
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var p = px(x, y);
      if (isBg(p)) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      count++; lum += luminance(p);
      if (Math.min(p[0], p[1], p[2]) > 225) white++;
      if (saturation(p) > 0.3 && Math.max(p[0], p[1], p[2]) > 50) {
        var k = (p[0] >> 5) + "," + (p[1] >> 5) + "," + (p[2] >> 5);
        var b = buckets[k] || (buckets[k] = { n: 0, r: 0, g: 0, b: 0 });
        b.n++; b.r += p[0]; b.g += p[1]; b.b += p[2];
      }
    }
    var best = null;
    Object.keys(buckets).forEach(function (k) { if (!best || buckets[k].n > best.n) best = buckets[k]; });
    var brand = best && best.n > count * 0.04 ? [best.r / best.n, best.g / best.n, best.b / best.n] : null;
    var crop = maxX < 0 ? { x: 0, y: 0, w: img.width, h: img.height } : {
      x: Math.max(0, (minX - 1) / s), y: Math.max(0, (minY - 1) / s),
      w: Math.min(img.width, (maxX - minX + 3) / s), h: Math.min(img.height, (maxY - minY + 3) / s),
    };
    // A "light" logo is mostly white (made for dark backgrounds), so it needs a dark label.
    var light = !bg && count > 0 && (lum / count > 0.72 || white / count > 0.35);
    return { bg: bg, brand: brand, light: light, crop: crop };
  }

  // ---- Drawing the label ---------------------------------------------------------------------
  var CREAM = [246, 242, 234], INK = [28, 25, 23], NAVY = [30, 42, 56];

  function spaced(g, text, x, y, spacing) {
    // Letter-spaced capitals, centred on x.
    var widths = Array.prototype.map.call(text, function (ch) { return g.measureText(ch).width; });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) + spacing * (text.length - 1);
    var cx = x - total / 2;
    g.textAlign = "left";
    Array.prototype.forEach.call(text, function (ch, i) { g.fillText(ch, cx, y); cx += widths[i] + spacing; });
    g.textAlign = "center";
  }

  function fitText(g, text, font, size, min, maxW) {
    while (size > min) { g.font = font.replace("SIZE", size); if (g.measureText(text).width <= maxW) break; size -= 4; }
    g.font = font.replace("SIZE", size);
    return size;
  }

  var WHITE = [250, 248, 244], PAPER = [251, 250, 247];
  function draw() {
    var a = analyse(state.logo);
    var hint = parseHex(state.color);
    var style = state.style;
    var bg, text, accent, tint = null;                  // tint: draw the logo in one colour (a "reversed" logo)
    if (a.bg) {
      bg = a.bg;                                         // the logo's own background colour fills the label
    } else if (style === "bold") {
      bg = [a.brand, hint].filter(Boolean)[0] || NAVY;   // the whole label in the brand colour
      if (a.light && luminance(bg) > 0.45) bg = NAVY;
      tint = contrast(bg, INK) >= 4.5 ? INK : WHITE;     // the logo reversed out in one colour, so none of it gets lost
    } else if (style === "minimal") {
      bg = PAPER;
      if (a.light) tint = a.brand && contrast(a.brand, bg) >= 3 ? a.brand : INK;
    } else if (a.light) {
      // A white logo goes on a deep shade of its brand colour (or the site's own dark colour, or navy).
      var deep = a.brand ? a.brand.map(function (v) { return v * 0.32; }) : null;
      bg = [deep, hint].filter(function (c) { return c && luminance(c) < 0.06; })[0] || NAVY;
    } else {
      bg = CREAM;
    }
    text = contrast(bg, INK) >= 4.5 ? INK : WHITE;
    accent = style === "bold" ? text : [a.brand, hint].filter(function (c) { return c && contrast(c, bg) >= 2.2; })[0] || text;
    state.colors = { bg: bg, text: text, accent: accent };

    var c = document.createElement("canvas"); c.width = W; c.height = H;
    var g = c.getContext("2d");
    g.fillStyle = hex(bg); g.fillRect(0, 0, W, H);
    if (style === "classic") {
      // Double frame, as on our labels.
      g.strokeStyle = hex(accent); g.lineWidth = 3; g.strokeRect(34, 34, W - 68, H - 68);
      g.globalAlpha = 0.55; g.lineWidth = 1.5; g.strokeRect(48, 48, W - 96, H - 96); g.globalAlpha = 1;
    } else if (style === "bold") {
      g.strokeStyle = hex(text); g.globalAlpha = 0.45; g.lineWidth = 2; g.strokeRect(40, 40, W - 80, H - 80); g.globalAlpha = 1;
    }

    // The logo, trimmed of empty margins and fitted into the top of the label.
    var icon = state.kind === "icon";
    var minimal = style === "minimal";
    var boxW = icon ? 300 : minimal ? 540 : 640, boxH = icon ? 300 : minimal ? 300 : 360, top = minimal ? 190 : 150;
    var cr = a.crop, sc = Math.min(boxW / cr.w, boxH / cr.h);
    var dw = cr.w * sc, dh = cr.h * sc;
    var dy = top + (boxH - dh) / 2;
    var src = state.logo, sx = cr.x, sy = cr.y, sw = cr.w, sh = cr.h;
    if (tint && !icon) {
      var t = document.createElement("canvas"); t.width = Math.ceil(dw); t.height = Math.ceil(dh);
      var tg = t.getContext("2d");
      tg.drawImage(state.logo, cr.x, cr.y, cr.w, cr.h, 0, 0, t.width, t.height);
      tg.globalCompositeOperation = "source-in"; tg.fillStyle = hex(tint); tg.fillRect(0, 0, t.width, t.height);
      src = t; sx = 0; sy = 0; sw = t.width; sh = t.height;
    }
    if (icon) { g.save(); roundRect(g, (W - dw) / 2, dy, dw, dh, 28); g.clip(); }
    g.drawImage(src, sx, sy, sw, sh, (W - dw) / 2, dy, dw, dh);
    if (icon) g.restore();

    g.fillStyle = hex(text);
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    var y = top + boxH + 70;
    if (icon && state.name) {
      fitText(g, state.name.toUpperCase(), "600 SIZEpx 'DM Sans', Arial, sans-serif", 40, 24, 760);
      spaced(g, state.name.toUpperCase(), W / 2, y + 10, 10);
      y += 50;
    }
    var line = (lineInput.value || "").trim().slice(0, 40);
    if (minimal) {
      // Minimal: no frame or rule, the words in small spaced capitals.
      g.fillStyle = hex(text);
      if (line) {
        fitText(g, line.toUpperCase(), "600 SIZEpx 'DM Sans', Arial, sans-serif", 38, 22, 700);
        spaced(g, line.toUpperCase(), W / 2, y + 90, 9);
      }
      g.font = "400 24px 'DM Sans', Arial, sans-serif";
      g.globalAlpha = 0.7;
      spaced(g, varietyText(), W / 2, Math.max(y + 170, 900), 6);
      g.globalAlpha = 1;
    } else {
      g.fillStyle = hex(accent); g.fillRect(W / 2 - 50, y + 20, 100, 3);
      g.fillStyle = hex(text);
      if (line) {
        var size = fitText(g, line, "400 SIZEpx 'DM Serif Display', Georgia, serif", 96, 48, 800);
        g.fillText(line, W / 2, y + 60 + size * 0.95);
        y += 60 + size;
      }
      g.font = "600 26px 'DM Sans', Arial, sans-serif";
      g.globalAlpha = 0.8;
      spaced(g, varietyText(), W / 2, Math.max(y + 110, 930), 7);
      g.globalAlpha = 1;
    }

    state.label = c;
    drawBack();
    show("front");
    next.hidden = false;
    return c;
  }

  // The back label: the message, the sign-off, and the standard drinks / pregnancy warning panel.
  var panel = new Image();
  panel.src = stage.getAttribute("data-back");   // the default back label; its bottom strip is the panel
  function wrap(g, text, maxW) {
    var words = text.split(/\s+/), lines = [], line = "";
    words.forEach(function (w) {
      var t = line ? line + " " + w : w;
      if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else { line = t; }
    });
    if (line) lines.push(line);
    return lines;
  }
  function drawBack() {
    if (!state.colors) return;
    var col = state.colors;
    var c = document.createElement("canvas"); c.width = W; c.height = H;
    var g = c.getContext("2d");
    var PANEL = 168;                                      // height of the compliance panel at the bottom
    g.fillStyle = hex(col.bg); g.fillRect(0, 0, W, H);
    if (state.style !== "minimal") { g.strokeStyle = hex(col.accent); g.lineWidth = 2.5; g.strokeRect(34, 34, W - 68, H - 68 - PANEL); }
    g.textAlign = "center"; g.textBaseline = "alphabetic";

    var name = (nameInput.value || "").trim().slice(0, 50);
    var msg = (msgInput.value || "").trim().slice(0, 220);
    var y = 150;
    g.fillStyle = hex(col.accent);
    g.fillRect(W / 2 - 40, y - 10, 80, 3);
    y += 70;
    g.fillStyle = hex(col.text);
    // The message, as large as fits, centred between the rule and the sign-off.
    var area = H - PANEL - 160 - y, size = 64, lines;
    do { g.font = "400 " + size + "px 'DM Serif Display', Georgia, serif"; lines = wrap(g, msg, 740); size -= 2; }
    while (lines.length * size * 1.36 > area && size > 26);
    size += 2;
    var blockH = lines.length * size * 1.36;
    var top = y + Math.max(0, (area - blockH) / 2);
    lines.forEach(function (l, i) { g.fillText(l, W / 2, top + size + i * size * 1.36); });

    g.globalAlpha = 0.85;
    var sign = name ? "FROM EVERYONE AT " + name.toUpperCase() : "FROM ALL OF US";
    var fs = 24;
    do { g.font = "600 " + fs + "px 'DM Sans', Arial, sans-serif"; fs -= 2; }
    while (g.measureText(sign).width + sign.length * 6 > 820 && fs >= 14);
    spaced(g, sign, W / 2, H - PANEL - 90, 6);
    g.globalAlpha = 1;

    // The panel always prints dark on light, so it sits on its own light band.
    if (panel.complete && panel.naturalWidth) {
      var ph = panel.naturalHeight * PANEL / H;
      g.drawImage(panel, 0, panel.naturalHeight - ph, panel.naturalWidth, ph, 0, H - PANEL, W, PANEL);
    }
    state.back = c;
  }
  panel.onload = function () { if (state.colors) { drawBack(); } };

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // On the 3D bottle when it's running; otherwise as a flat label over the still image.
  function show(face) {
    if (!state.label) return;
    face = face === "back" ? "back" : "front";
    if (stage.classList.contains("is-live")) {
      if (flat) flat.hidden = true;
      stage.dispatchEvent(new CustomEvent("hero3d:label", { detail: { front: state.label, back: state.back, face: face } }));
    } else {
      if (!flat) {
        flat = document.createElement("img");
        flat.className = "try-flat";
        flat.alt = "Your label preview";
        stage.appendChild(flat);
      }
      flat.src = (face === "back" && state.back ? state.back : state.label).toDataURL("image/jpeg", 0.9);
      flat.hidden = false;
    }
  }
  stage.addEventListener("hero3d:ready", function () { setBottle(); show("front"); });

  // Fonts first, so the label's type is right the first time.
  if (document.fonts && document.fonts.load) {
    document.fonts.load("96px 'DM Serif Display'");
    document.fonts.load("600 26px 'DM Sans'");
  }

  // ---- Sending it with the enquiry -----------------------------------------------------------
  root.querySelector("[data-try-send]").addEventListener("click", function (e) {
    if (!state.label) return;
    e.preventDefault();
    var link = this;
    toPng(state.logo, 1600).then(function (logoUrl) {
      var data = {
        site: state.site,
        line: (lineInput.value || "").trim().slice(0, 40),
        name: (nameInput.value || "").trim().slice(0, 50) || state.name,
        message: (msgInput.value || "").trim().slice(0, 220),
        wine: wineSel.value,
        style: state.style,
        cases: cases(),
        date: dateInput.value || "",
        label: state.label.toDataURL("image/jpeg", 0.88),
        back: state.back ? state.back.toDataURL("image/jpeg", 0.85) : "",
        logo: logoUrl,
      };
      try { sessionStorage.setItem("onivPreview", JSON.stringify(data)); } catch (err) {
        try { delete data.logo; sessionStorage.setItem("onivPreview", JSON.stringify(data)); } catch (err2) { /* storage full or blocked */ }
      }
      location.href = link.getAttribute("href");
    });
  });

  function toPng(img, max) {
    var s = Math.min(1, max / Math.max(img.width, img.height));
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return Promise.resolve(c.toDataURL("image/png"));
  }
})();

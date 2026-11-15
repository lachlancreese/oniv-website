(function () {
  // Footer year
  document.querySelectorAll(".year").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  // Header: border once scrolled, and mobile menu
  var header = document.querySelector(".site-header");
  var menuBtn = document.querySelector(".menu-btn");
  var links = document.getElementById("nav-links");
  if (header) {
    var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 4); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }
  if (menuBtn && links) {
    var label = menuBtn.querySelector(".menu-label");
    var setOpen = function (open) {
      if (open) document.documentElement.style.setProperty("--header-bottom", header.getBoundingClientRect().bottom + "px");
      links.classList.toggle("is-open", open);
      document.body.classList.toggle("menu-open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
      if (label) label.textContent = open ? "Close" : "Menu";
    };
    menuBtn.addEventListener("click", function () { setOpen(menuBtn.getAttribute("aria-expanded") !== "true"); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && links.classList.contains("is-open")) { setOpen(false); menuBtn.focus(); } });
    window.addEventListener("resize", function () { if (window.innerWidth >= 1100) setOpen(false); });
  }

  // Enquiry form
  var form = document.getElementById("enquiry-form");
  if (!form) return;
  var statusEl = document.getElementById("form-status");
  var done = document.getElementById("form-done");
  var button = form.querySelector('button[type="submit"]');
  var MAX_BYTES = 10 * 1024 * 1024;

  // A label preview made with "Try it with your logo" (see try-label.js) travels with the enquiry.
  var preview = null;
  try { preview = JSON.parse(sessionStorage.getItem("onivPreview") || "null"); } catch (e) { preview = null; }
  var card = document.getElementById("preview-card");
  if (preview && preview.label && card) {
    var thumb = document.createElement("img");
    thumb.src = preview.label;
    thumb.alt = "Your label preview";
    thumb.width = 96;
    thumb.height = 107;
    card.insertBefore(thumb, card.firstChild);
    if (preview.site) document.getElementById("preview-text").textContent = "Made from " + preview.site + ". We'll send it with your logo, so we can start on your mockup.";
    if (preview.name && !form.elements.company.value) form.elements.company.value = preview.name;
    if (preview.cases) form.elements.cases.value = preview.cases;
    if (preview.date) form.elements.needed_by.value = preview.date;
    card.hidden = false;
    document.getElementById("preview-remove").addEventListener("click", function () {
      preview = null;
      card.hidden = true;
      try { sessionStorage.removeItem("onivPreview"); } catch (e) { /* ignore */ }
    });
  }
  function dataUrlToBlob(url) {
    var parts = url.split(","), type = (parts[0].match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
    var bin = atob(parts[1]), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: type });
  }

  function showError(message) {
    statusEl.textContent = message;
    statusEl.className = "form-status is-error";
    statusEl.hidden = false;
  }

  // Australian mobile, landline, 13/1300/1800, or an overseas number written with + and country code.
  function validPhone(raw) {
    var n = String(raw).replace(/[\s().-]/g, "");
    return /^(?:\+?610?|0)[23478]\d{8}$/.test(n) || /^1[38]00\d{6}$/.test(n) || /^13\d{4}$/.test(n) ||
      /^\+(?!61)[1-9]\d{7,14}$/.test(n);
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    statusEl.hidden = true;

    var name = form.elements.name.value.trim();
    var email = form.elements.email.value.trim();
    if (!name || !email || !form.elements.email.checkValidity()) {
      showError("Please add your name and a valid email so we can send your mockup.");
      (name ? form.elements.email : form.elements.name).focus();
      return;
    }
    if (!validPhone(form.elements.phone.value)) {
      showError("Please add a valid phone number, like 0412 345 678, so we can call you about your mockup.");
      form.elements.phone.focus();
      return;
    }
    var file = form.elements.logo.files && form.elements.logo.files[0];
    if (file && file.size > MAX_BYTES) {
      showError("That logo file is over 10 MB. Please attach a smaller file, or email it to alex@oniv.com.au.");
      form.elements.logo.focus();
      return;
    }
    var live = /(^|\.)oniv\.com\.au$|\.workers\.dev$|\.pages\.dev$|^localhost$|^127\.0\.0\.1$/.test(location.hostname);
    if (!live) {
      showError("This is a preview, so the form doesn't send yet. It will once the site is live on oniv.com.au.");
      return;
    }

    button.disabled = true;
    button.textContent = "Sending…";

    var body = new FormData(form);
    if (preview && preview.label) {
      body.append("preview", dataUrlToBlob(preview.label), "label-preview.jpg");
      body.append("preview_site", preview.site || "");
      body.append("preview_line", preview.line || "");
      body.append("preview_message", preview.message || "");
      body.append("preview_wine", preview.wine || "");
      body.append("preview_style", preview.style || "");
      if (preview.back) body.append("preview_back", dataUrlToBlob(preview.back), "back-label-preview.jpg");
      if (preview.bottle) body.append("preview_bottle", dataUrlToBlob(preview.bottle), "bottle-preview.jpg");
      if (preview.logo && !file) body.set("logo", dataUrlToBlob(preview.logo), "logo.png");
    }

    fetch(form.action, { method: "POST", body: body, headers: { Accept: "application/json" } })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok || !data.ok) throw new Error(data.error || "send failed");
        });
      })
      .then(function () {
        try { sessionStorage.removeItem("onivPreview"); } catch (e) { /* ignore */ }
        form.hidden = true;
        done.hidden = false;
        done.focus();
      })
      .catch(function () {
        showError("Sorry, that didn't send. Please call 0475 799 070 or email alex@oniv.com.au and we'll get your mockup started.");
      })
      .finally(function () {
        button.disabled = false;
        button.textContent = "Send me my mockup";
      });
  });
})();

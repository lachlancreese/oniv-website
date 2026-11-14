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

  function showError(message) {
    statusEl.textContent = message;
    statusEl.className = "form-status is-error";
    statusEl.hidden = false;
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

    fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok || !data.ok) throw new Error(data.error || "send failed");
        });
      })
      .then(function () {
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

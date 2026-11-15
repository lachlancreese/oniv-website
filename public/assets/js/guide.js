// The gift guide form: emails the guide (via /api/guide), then offers the download straight away.
(function () {
  var form = document.getElementById("guide-form");
  if (!form) return;
  var status = form.querySelector(".guide-status");
  var say = function (html, err) { status.innerHTML = html; status.classList.toggle("is-error", !!err); };
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = form.elements.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say("Please enter your email address.", true); form.elements.email.focus(); return; }
    var button = form.querySelector("button");
    button.disabled = true;
    say("Sending…");
    fetch("/api/guide", { method: "POST", body: new FormData(form) })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (j) { if (!res.ok || !j.ok) throw new Error(j.error || "send"); return j; }); })
      .then(function (j) {
        say("Sent to " + email.replace(/[<>&"]/g, "") + ". It's on its way. You can also <a href=\"" + j.download + "\" download>download it now</a>.");
        setTimeout(function () { button.disabled = false; }, 20000);
      })
      .catch(function (err) {
        say(err && err.message && err.message.length > 8 ? err.message.replace(/[<>&]/g, "") : "We couldn't send it just now. Please try again, or call 0475 799 070.", true);
        button.disabled = false;
      });
  });
})();

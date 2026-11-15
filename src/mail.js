// Shared email helpers for the enquiry and preview endpoints: sending through Resend, a simple per-visitor
// limit, and the customer-facing email layout.

export const PHONE = "0475 799 070";
export const SITE = "https://oniv.com.au";

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export const validEmail = (s) => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(s) && s.length <= 200;

// An uploaded file from a form, as a Resend attachment, if it's there and not too big.
export async function fileAttachment(form, key, filename, maxBytes, contentId) {
  const f = form.get(key);
  if (!f || typeof f !== "object" || !f.size || f.size > maxBytes) return null;
  const a = { filename, content: toBase64(await f.arrayBuffer()) };
  if (contentId) a.content_id = contentId;
  return a;
}

export async function sendEmail(env, payload) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) console.error("Resend", res.status, await res.text().catch(() => ""));
  return res.ok;
}

// Customer emails come from "Alex at ONIV" on the website's sending address, and replies go to Alex.
export function customerSender(env) {
  const address = (String(env.FROM_EMAIL).match(/<([^>]+)>/) || [null, env.FROM_EMAIL])[1].trim();
  return { from: `Alex at ONIV <${address}>`, reply_to: alexAddress(env) };
}
export const alexAddress = (env) => String(env.TO_EMAIL).split(",")[0].trim();
export const teamAddresses = (env) => String(env.TO_EMAIL).split(",").map((s) => s.trim()).filter(Boolean);

// At most `max` uses per `seconds` for one key (a visitor's IP or an email address), counted at each Cloudflare
// location. Not exact, but enough to stop the forms being used to send a flood of emails.
export async function overLimit(bucket, key, max, seconds) {
  if (typeof caches === "undefined" || !caches.default) return false;
  const slot = Math.floor(Date.now() / 1000 / seconds);
  const id = new Request(`${SITE}/__limit/${bucket}/${encodeURIComponent(key)}/${slot}`);
  const hit = await caches.default.match(id);
  const count = hit ? Number(await hit.text()) || 0 : 0;
  if (count >= max) return true;
  await caches.default.put(id, new Response(String(count + 1), { headers: { "Cache-Control": `max-age=${seconds}` } }));
  return false;
}

// The customer email layout: a short note, an optional picture (attached with content_id "bottle"), an optional
// button, more text after it, and Alex's sign-off. All text is plain (escaped here).
export function customerEmail({ heading, paragraphs, picture, button, after = [] }) {
  const p = (t) => `<p style="margin:0 0 16px;font:16px/1.55 Arial,Helvetica,sans-serif;color:#1C1917">${esc(t)}</p>`;
  const html = `<!doctype html><html><body style="margin:0;background:#F4F1EA">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EA"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:8px">
<tr><td style="padding:32px 32px 8px;font:700 26px Georgia,serif;color:#1C1917">oniv</td></tr>
<tr><td style="padding:8px 32px 0">
<h1 style="margin:0 0 20px;font:400 28px/1.2 Georgia,serif;color:#1C1917">${esc(heading)}</h1>
${paragraphs.map(p).join("\n")}
${picture ? `<img src="cid:bottle" width="536" alt="Your label preview on a bottle, front and back" style="display:block;width:100%;max-width:536px;height:auto;margin:8px 0 20px;border-radius:6px">` : ""}
${button ? `<p style="margin:8px 0 24px"><a href="${esc(button.href)}" style="display:inline-block;background:#1C1917;color:#FFFFFF;text-decoration:none;font:600 16px Arial,Helvetica,sans-serif;padding:14px 22px;border-radius:4px">${esc(button.text)}</a></p>` : ""}
${after.map(p).join("\n")}
<p style="margin:24px 0 32px;font:16px/1.5 Arial,Helvetica,sans-serif;color:#1C1917">Alex<br><span style="color:#4A4542;font-size:14px">ONIV's founder · <a href="tel:+61475799070" style="color:#4A4542">${PHONE}</a> · <a href="${SITE}" style="color:#4A4542">oniv.com.au</a></span></p>
</td></tr></table>
</td></tr></table></body></html>`;
  const text = [heading, "", ...paragraphs, ...(button ? ["", `${button.text}: ${button.href}`] : []), ...(after.length ? ["", ...after] : []), "", "Alex", `ONIV's founder · ${PHONE} · oniv.com.au`].join("\n");
  return { html, text };
}

// A simple two-column table of details, for the team's emails.
export function detailsTable(title, rows) {
  const html =
    `<h2 style="font-family:Georgia,serif">${esc(title)}</h2><table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">` +
    rows.map(([k, v]) => `<tr><td style="color:#4A4542;vertical-align:top"><b>${esc(k)}</b></td><td>${esc(v || "-").replace(/\n/g, "<br>")}</td></tr>`).join("") +
    `</table>`;
  const text = rows.map(([k, v]) => `${k}: ${v || "-"}`).join("\n");
  return { html, text };
}

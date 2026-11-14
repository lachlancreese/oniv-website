// POST /api/enquiry: emails each enquiry (called from src/worker.js)
// Emails each enquiry (with the logo attached) using Resend (https://resend.com).
//
// Set these in Cloudflare > Workers & Pages > oniv-website > Settings > Variables and secrets:
//   RESEND_API_KEY  your Resend API key (keep it secret)
//   TO_EMAIL        where enquiries go, comma-separated (e.g. alex@oniv.com.au,lachlan@oniv.com.au)
//   FROM_EMAIL      a sender on your verified Resend domain (e.g. ONIV website <enquiries@oniv.com.au>)

const MAX_BYTES = 10 * 1024 * 1024;

export async function handleEnquiry(request, env) {
  const wantsJson = (request.headers.get("Accept") || "").includes("application/json");
  const reply = (ok, status, error) =>
    wantsJson
      ? Response.json(ok ? { ok: true } : { ok: false, error }, { status })
      : ok
        ? Response.redirect(new URL("/thanks", request.url).toString(), 303)
        : new Response(error || "Something went wrong. Please call 0475 799 070.", { status });

  let form;
  try {
    form = await request.formData();
  } catch {
    return reply(false, 400, "Invalid form");
  }

  // Honeypot: bots fill hidden fields. Pretend it worked.
  if (String(form.get("website") || "").trim()) return reply(true, 200);

  const field = (key, max = 500) => String(form.get(key) || "").trim().slice(0, max);
  const data = {
    occasion: field("occasion", 80),
    cases: field("cases", 6),
    needed_by: field("needed_by", 20),
    name: field("name", 120),
    email: field("email", 200),
    phone: field("phone", 40),
    company: field("company", 160),
    message: field("message", 4000),
  };
  if (!data.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return reply(false, 422, "Name and a valid email are required");
  }

  const attachments = [];
  const logo = form.get("logo");
  if (logo && typeof logo === "object" && logo.size > 0) {
    if (logo.size > MAX_BYTES) return reply(false, 413, "Logo file is over 10 MB");
    attachments.push({ filename: logo.name || "logo", content: toBase64(await logo.arrayBuffer()) });
  }

  const rows = [
    ["What it's for", data.occasion],
    ["Cases", data.cases],
    ["Needed by", data.needed_by],
    ["Name", data.name],
    ["Email", data.email],
    ["Phone", data.phone],
    ["Business", data.company],
    ["Message", data.message],
    ["Logo", attachments.length ? attachments[0].filename + " (attached)" : "None"],
  ];
  const html =
    `<h2 style="font-family:Georgia,serif">New mockup enquiry</h2><table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">` +
    rows.map(([k, v]) => `<tr><td style="color:#4A4542;vertical-align:top"><b>${esc(k)}</b></td><td>${esc(v || "-").replace(/\n/g, "<br>")}</td></tr>`).join("") +
    `</table>`;
  const text = rows.map(([k, v]) => `${k}: ${v || "-"}`).join("\n");

  if (!env.RESEND_API_KEY || !env.TO_EMAIL || !env.FROM_EMAIL) {
    return reply(false, 500, "Email is not configured");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: env.TO_EMAIL.split(",").map((s) => s.trim()).filter(Boolean),
      reply_to: data.email,
      subject: `Mockup enquiry: ${data.name}${data.company ? " (" + data.company + ")" : ""}, ${data.cases || "?"} case(s)`,
      html,
      text,
      attachments,
    }),
  });
  if (!res.ok) return reply(false, 502, "Could not send");
  return reply(true, 200);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

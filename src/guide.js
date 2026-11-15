// POST /api/guide: emails the corporate Christmas wine gift guide (PDF) and tells the team (called from src/worker.js).

import { customerEmail, customerSender, detailsTable, overLimit, sendEmail, SITE, teamAddresses, toBase64, validEmail } from "./mail.js";

const GUIDE = { path: "/assets/guides/oniv-christmas-gift-guide.pdf", filename: "ONIV Christmas wine gift guide 2026.pdf" };

export async function handleGuide(request, env) {
  const reply = (ok, status, error, extra = {}) => Response.json(ok ? { ok: true, ...extra } : { ok: false, error }, { status });
  let form;
  try { form = await request.formData(); } catch { return reply(false, 400, "Invalid form"); }
  if (String(form.get("website") || "").trim()) return reply(true, 200, null, { download: GUIDE.path });   // honeypot
  const field = (key, max = 200) => String(form.get(key) || "").trim().slice(0, max);
  const email = field("email");
  if (!validEmail(email)) return reply(false, 422, "Please enter a valid email address.");
  const business = field("business", 120);
  const consent = field("consent", 5) === "yes";

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (await overLimit("guide-ip", ip, 6, 3600) || await overLimit("guide-to", email.toLowerCase(), 3, 86400)) {
    return reply(false, 429, "You've asked for it a few times already. Please try again later, or call 0475 799 070.");
  }
  if (!env.RESEND_API_KEY || !env.TO_EMAIL || !env.FROM_EMAIL) return reply(false, 500, "Email is not configured");

  const pdf = await env.ASSETS.fetch(new Request(new URL(GUIDE.path, request.url)));
  if (!pdf.ok) return reply(false, 500, "The guide isn't available just now. Please call 0475 799 070.");
  const attachment = { filename: GUIDE.filename, content: toBase64(await pdf.arrayBuffer()) };

  const mail = customerEmail({
    heading: "Your Christmas wine gift guide",
    paragraphs: [
      "Here's your copy of the corporate Christmas wine gift guide, attached as a PDF. It covers who to give to, what to spend, which wines to choose, what to write on the label and when to order.",
      "Want to see your own label? Type your website on our site and you'll see your logo on a bottle in seconds.",
    ],
    button: { text: "See your logo on a bottle", href: `${SITE}/corporate#try` },
    after: [
      "For delivery before Christmas, approve your label by 14 December (3 December for WA and NT). Your free mockup takes 1–2 business days, so just reply to this email or call me on 0475 799 070 when you're ready.",
    ],
  });
  const sent = await sendEmail(env, {
    ...customerSender(env),
    to: [email],
    subject: "Your Christmas wine gift guide from ONIV",
    html: mail.html,
    text: mail.text,
    attachments: [attachment],
  });
  if (!sent) return reply(false, 502, "We couldn't send the email just now. Please try again, or call 0475 799 070.");

  const team = detailsTable("Christmas gift guide requested", [
    ["Email", email],
    ["Business", business],
    ["OK to contact", consent ? "Yes, ticked the box to hear from Alex" : "No, only asked for the guide"],
  ]);
  await sendEmail(env, {
    from: env.FROM_EMAIL,
    to: teamAddresses(env),
    reply_to: email,
    subject: `Gift guide requested: ${email}${business ? " (" + business + ")" : ""}${consent ? ", OK to contact" : ""}`,
    html: team.html,
    text: team.text,
  });
  return reply(true, 200, null, { download: GUIDE.path });
}

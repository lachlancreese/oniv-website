// POST /api/preview: "Email me this preview" from the logo preview (called from src/worker.js).
// Emails the visitor a picture of their bottle (front and back, rendered on the bottle, not the flat artwork),
// and tells the team, with the label artwork and logo attached.

import { customerEmail, customerSender, detailsTable, fileAttachment, overLimit, sendEmail, SITE, teamAddresses, validEmail } from "./mail.js";

const MB = 1024 * 1024;

export async function handlePreview(request, env) {
  const reply = (ok, status, error) => Response.json(ok ? { ok: true } : { ok: false, error }, { status });
  let form;
  try { form = await request.formData(); } catch { return reply(false, 400, "Invalid form"); }

  if (String(form.get("website") || "").trim()) return reply(true, 200);            // honeypot
  const field = (key, max = 200) => String(form.get(key) || "").trim().slice(0, max);
  const email = field("email");
  if (!validEmail(email)) return reply(false, 422, "Please enter a valid email address.");
  const bottle = await fileAttachment(form, "bottle", "your-oniv-label-preview.jpg", 4 * MB, "bottle");
  if (!bottle) return reply(false, 422, "The preview picture is missing. Please try again.");

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (await overLimit("preview-ip", ip, 6, 3600) || await overLimit("preview-to", email.toLowerCase(), 3, 86400)) {
    return reply(false, 429, `You've sent a few already. Please try again later, or call Alex on 0475 799 070.`);
  }
  if (!env.RESEND_API_KEY || !env.TO_EMAIL || !env.FROM_EMAIL) return reply(false, 500, "Email is not configured");

  const d = {
    site: field("site"), name: field("name", 60), line: field("line", 60), message: field("message", 300),
    wine: field("wine", 40), style: field("style", 20), cases: field("cases", 6), date: field("date", 20),
    consent: field("consent", 5) === "yes",
  };
  const cases = Math.max(1, parseInt(d.cases, 10) || 0);
  const choice = [d.wine, d.style && d.style[0].toUpperCase() + d.style.slice(1) + " label",
    d.cases ? `${cases} ${cases === 1 ? "case" : "cases"} (from $${(cases * 288).toLocaleString("en-AU")} incl. GST)` : ""].filter(Boolean).join(" · ");

  const mail = customerEmail({
    heading: "Your label preview",
    paragraphs: [
      "Thanks for trying our label preview. Here's your bottle, front and back.",
      ...(choice ? [`You chose: ${choice}.`] : []),
    ],
    picture: true,
    button: { text: "Get your free mockup", href: `${SITE}/contact` },
    after: [
      "This is a quick preview. When you're ready, we'll design your real label for free and send you the mockup within 1–2 business days. Just reply to this email or call me on 0475 799 070.",
    ],
  });
  const sent = await sendEmail(env, {
    ...customerSender(env),
    to: [email],
    subject: "Your ONIV label preview",
    html: mail.html,
    text: mail.text,
    attachments: [bottle],
  });
  if (!sent) return reply(false, 502, "We couldn't send the email just now. Please try again, or call 0475 799 070.");

  // Tell the team, with everything needed to start a mockup.
  const extra = (await Promise.all([
    fileAttachment(form, "front", "front-label-artwork.jpg", 4 * MB),
    fileAttachment(form, "back", "back-label-artwork.jpg", 4 * MB),
    fileAttachment(form, "logo", "logo.png", 8 * MB),
  ])).filter(Boolean);
  const team = detailsTable("Label preview emailed", [
    ["Email", email],
    ["OK to contact", d.consent ? "Yes, ticked the box to hear from Alex" : "No, only asked for the preview"],
    ["Business", d.name],
    ["Website", d.site || "Uploaded a logo"],
    ["Front words", d.line],
    ["Back message", d.message],
    ["Wine", d.wine],
    ["Label style", d.style],
    ["Cases", d.cases],
    ["Needed by", d.date],
  ]);
  await sendEmail(env, {
    from: env.FROM_EMAIL,
    to: teamAddresses(env),
    reply_to: email,
    subject: `Preview emailed to ${email}${d.name ? " (" + d.name + ")" : ""}${d.consent ? ", OK to contact" : ""}`,
    html: team.html,
    text: team.text,
    attachments: [{ ...bottle, content_id: undefined, filename: "bottle-preview.jpg" }, ...extra],
  });
  return reply(true, 200);
}

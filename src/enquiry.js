// POST /api/enquiry: emails each enquiry to the team (with the logo and any label preview attached), then sends
// the customer an automatic reply (called from src/worker.js). Uses Resend (https://resend.com).
//
// Set these in Cloudflare > Workers & Pages > oniv-website > Settings > Variables and secrets:
//   RESEND_API_KEY  your Resend API key (keep it secret)
//   TO_EMAIL        where enquiries go, comma-separated (e.g. alex@oniv.com.au)
//   FROM_EMAIL      a sender on your verified Resend domain (e.g. ONIV website <enquiries@oniv.com.au>)

import { customerEmail, customerSender, detailsTable, esc, fileAttachment, overLimit, sendEmail, teamAddresses, toBase64 } from "./mail.js";

const MAX_BYTES = 10 * 1024 * 1024;

// Australian mobile, landline, 13/1300/1800, or an overseas number written with + and country code.
// Keep in step with validPhone() in public/assets/js/site.js.
export function validPhone(raw) {
  const n = String(raw).replace(/[\s().-]/g, "");
  return /^(?:\+?610?|0)[23478]\d{8}$/.test(n) || /^1[38]00\d{6}$/.test(n) || /^13\d{4}$/.test(n) ||
    /^\+(?!61)[1-9]\d{7,14}$/.test(n);
}

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
    preview_site: field("preview_site", 200),
    preview_kind: field("preview_kind", 10),
    preview_sub: field("preview_sub", 60),
    preview_line: field("preview_line", 60),
    preview_message: field("preview_message", 300),
    preview_wine: field("preview_wine", 40),
    preview_style: field("preview_style", 20),
  };
  if (!data.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return reply(false, 422, "Name and a valid email are required");
  }
  if (!validPhone(data.phone)) {
    return reply(false, 422, "A valid phone number is required");
  }

  const attachments = [];
  const logo = form.get("logo");
  if (logo && typeof logo === "object" && logo.size > 0) {
    if (logo.size > MAX_BYTES) return reply(false, 413, "Logo file is over 10 MB");
    attachments.push({ filename: logo.name || "logo", content: toBase64(await logo.arrayBuffer()) });
  }

  const preview = form.get("preview");
  if (preview && typeof preview === "object" && preview.size > 0 && preview.size <= MAX_BYTES) {
    attachments.push({ filename: "label-preview.jpg", content: toBase64(await preview.arrayBuffer()) });
  }
  const previewBack = form.get("preview_back");
  if (previewBack && typeof previewBack === "object" && previewBack.size > 0 && previewBack.size <= MAX_BYTES) {
    attachments.push({ filename: "back-label-preview.jpg", content: toBase64(await previewBack.arrayBuffer()) });
  }
  const logoNote = logo && typeof logo === "object" && logo.size > 0 ? (logo.name || "logo") + " (attached)" : "None";
  const art = data.preview_kind === "photo" ? "photo" : "logo";

  const rows = [
    ["What it's for", data.occasion],
    ["Cases", data.cases],
    ["Needed by", data.needed_by],
    ["Name", data.name],
    ["Email", data.email],
    ["Phone", data.phone],
    ["Business", data.company],
    ["Message", data.message],
    [art === "photo" ? "Photo" : "Logo", logoNote],
  ];
  if (preview && typeof preview === "object" && preview.size > 0) {
    rows.push(["Label preview", "Made on the website" + (data.preview_site ? " from " + data.preview_site : ` from an uploaded ${art}`) +
      (data.preview_line ? `, with "${data.preview_line}"` : "") + (data.preview_sub ? ` and "${data.preview_sub}"` : "") +
      " (front and back previews attached)"]);
    if (data.preview_wine) rows.push(["Wine chosen in preview", data.preview_wine]);
    if (data.preview_style) rows.push(["Label style", data.preview_style[0].toUpperCase() + data.preview_style.slice(1)]);
    if (data.preview_message) rows.push(["Back label message", data.preview_message]);
  }
  const { html, text } = detailsTable("New mockup enquiry", rows);

  if (!env.RESEND_API_KEY || !env.TO_EMAIL || !env.FROM_EMAIL) {
    return reply(false, 500, "Email is not configured");
  }
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (await overLimit("enquiry-ip", ip, 10, 3600)) {
    return reply(false, 429, "Too many enquiries from here just now. Please call 0475 799 070.");
  }

  const sent = await sendEmail(env, {
    from: env.FROM_EMAIL,
    to: teamAddresses(env),
    reply_to: data.email,
    subject: `Mockup enquiry: ${data.name}${data.company ? " (" + data.company + ")" : ""}, ${data.cases || "?"} case(s)`,
    html,
    text,
    attachments,
  });
  if (!sent) return reply(false, 502, "Could not send");

  // The automatic reply, so they know it arrived and what happens next. If it fails, the enquiry still went through.
  try {
    await sendEmail(env, autoReply(env, data, await fileAttachment(form, "preview_bottle", "your-oniv-label-preview.jpg", 4 * 1024 * 1024, "bottle")));
  } catch (err) {
    console.error("auto-reply", err);
  }
  return reply(true, 200);
}

export function autoReply(env, data, bottle) {
  const first = data.name.split(/\s+/)[0];
  const cases = parseInt(data.cases, 10);
  const when = data.needed_by ? new Date(data.needed_by + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "";
  const summary = [data.occasion, cases ? `${cases} ${cases === 1 ? "case" : "cases"}` : "", when && when !== "Invalid Date" ? `needed by ${when}` : ""].filter(Boolean).join(", ");
  const mail = customerEmail({
    heading: `Thanks, ${first}. We've got your enquiry.`,
    paragraphs: [
      "Thanks for getting in touch. I have your enquiry and will be in touch shortly to talk it through. Your free label mockup will be with you within 1–2 business days.",
      ...(summary ? [`Your enquiry: ${summary}.`] : []),
      ...(bottle ? ["Here's the preview you made on our website:"] : []),
    ],
    picture: !!bottle,
    after: ["If anything changes, just reply to this email or call me on 0475 799 070."],
  });
  return {
    ...customerSender(env),
    to: [data.email],
    subject: "We've got your enquiry",
    html: mail.html,
    text: mail.text,
    ...(bottle ? { attachments: [bottle] } : {}),
  };
}

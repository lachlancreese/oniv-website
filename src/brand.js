// GET /api/brand?d=example.com.au: finds a business's logo on its own website, for the "see your logo on a bottle"
// preview (called from src/worker.js). Returns the logo image itself, plus a few hints in headers:
//   X-Logo-Kind   "logo" (a full logo) or "icon" (a square app icon, used when no logo is found)
//   X-Brand-Name  the site's name, shown under an icon
//   X-Brand-Color the site's theme colour, if it declares one
// Nothing is stored beyond a one-day cache of the result.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const MAX_HTML = 1_500_000;
const MAX_IMAGE = 3 * 1024 * 1024;

// "https://www.Example.com.au/about?x=1" -> "example.com.au". Only ordinary public domain names are accepted.
export function cleanDomain(raw) {
  let s = String(raw || "").trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0].replace(/:\d+$/, "").replace(/\.$/, "");
  if (s.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(s)) return null;
  if (/(^|\.)(localhost|local|internal|onion)$/.test(s) || /^\d+\.\d+\.\d+\.\d+$/.test(s)) return null;
  return s;
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? "") : "";
};
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
const SKIP = /footer|partner|client|award|badge|sponsor|payment|visa|mastercard|app-?store|google-?play|social|facebook|instagram|linkedin|twitter|youtube|tiktok|flag|avatar|loader|spinner|pixel|tracking/i;

// Every likely logo on the page, best first.
export function findLogos(html, pageUrl) {
  const found = [];
  const add = (url, kind, score) => {
    if (!url || url.startsWith("data:") && !url.startsWith("data:image/svg")) return;
    try { found.push({ url: new URL(url, pageUrl).toString(), kind, score }); } catch { /* bad URL */ }
  };
  const headerEnd = (() => { const i = html.search(/<\/header>/i); return i > 0 ? i : Math.min(html.length, 40000); })();

  // 1. The logo declared for search engines (schema.org Organization), usually a clean, full-size file.
  for (const m of html.matchAll(/"logo"\s*:\s*(?:"([^"]+)"|\{[^}]*?"(?:url|contentUrl)"\s*:\s*"([^"]+)")/g)) {
    add((m[1] || m[2]).replace(/\\\//g, "/"), "logo", 90);
  }

  // 2. An <img> that calls itself a logo, preferring the header and SVG files.
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = attr(tag, "src") || attr(tag, "data-src") || (attr(tag, "srcset").split(/\s+/)[0] || "");
    const hint = [attr(tag, "class"), attr(tag, "id"), attr(tag, "alt"), src].join(" ");
    const before = html.slice(Math.max(0, m.index - 300), m.index);
    const logoish = /logo|brand/i.test(hint) || /class\s*=\s*["'][^"']*(logo|brand)[^"']*["']/i.test(before.slice(-200));
    if (!logoish || SKIP.test(hint)) continue;
    let score = 70;
    if (m.index < headerEnd) score += 15;
    if (/\.svg(\?|$)/i.test(src)) score += 8;
    if (/white|light|inverse|reverse|negative/i.test(hint)) score -= 12;
    add(src, "logo", score);
  }

  // 3. An inline <svg> logo, returned as a file of its own.
  for (const m of html.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi)) {
    if (m[0].length > 300_000) continue;
    const open = m[0].slice(0, m[0].indexOf(">") + 1);
    const before = html.slice(Math.max(0, m.index - 300), m.index);
    const head = [attr(open, "class"), attr(open, "id"), attr(open, "aria-label"), (m[0].match(/<title>([^<]*)<\/title>/i) || [])[1] || ""].join(" ");
    const logoish = /logo|brand/i.test(head) || /class\s*=\s*["'][^"']*(logo|brand)[^"']*["'][^<]*$/i.test(before) || /aria-label\s*=\s*["'][^"']*home[^"']*["'][^<]*$/i.test(before);
    if (!logoish || SKIP.test(head) || !/viewbox/i.test(open)) continue;
    let svg = m[0];
    if (!/xmlns=/.test(open)) svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    add("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg), "logo", m.index < headerEnd ? 80 : 60);
  }

  // 4. Fallbacks: an SVG favicon, then the app icon (square, usually 180 px).
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0], rel = attr(tag, "rel").toLowerCase(), href = attr(tag, "href");
    if (/(^|\s)icon(\s|$)/.test(rel) && (/svg/.test(attr(tag, "type")) || /\.svg(\?|$)/i.test(href))) add(href, "icon", 40);
    else if (rel.includes("apple-touch-icon")) add(href, "icon", 35);
    else if (/(^|\s)icon(\s|$)/.test(rel) && /(\d{3,})x\1/.test(attr(tag, "sizes"))) add(href, "icon", 30);
  }

  const seen = new Set();
  return found.sort((a, b) => b.score - a.score).filter((c) => !seen.has(c.url) && seen.add(c.url));
}

// The site's own name and theme colour, for the label.
export function siteHints(html, domain = "") {
  const meta = (key) => {
    for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
      if (new RegExp(`(property|name)\\s*=\\s*["']${key}["']`, "i").test(m[0])) return attr(m[0], "content");
    }
    return "";
  };
  let name = meta("og:site_name") || meta("application-name");
  if (!name) {
    const title = decode((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "");
    const parts = title.split(/\s+[|–—:·-]\s+/).map((s) => s.trim())
      .filter((s) => s && !/^(home|homepage|home page|welcome|official (web)?site)$/i.test(s));
    const label = domain.split(".")[0];
    const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    name = parts.find((s) => label && (squash(s).includes(label) || label.includes(squash(s)))) ||
      (parts.length ? parts.reduce((a, b) => (b.length < a.length ? b : a)) : "");
  }
  const color = meta("theme-color");
  return { name: name.slice(0, 60), color: /^#[0-9a-f]{3,8}$/i.test(color) ? color : "" };
}

async function fetchLimited(url, accept, max) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "en-AU,en;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(7000),
    cf: { cacheTtl: 3600 },
  });
  if (!res.ok || !res.body) return null;
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { reader.cancel(); if (accept.startsWith("text")) break; return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(Math.min(size, max));
  let o = 0;
  for (const c of chunks) { bytes.set(c.subarray(0, bytes.length - o), o); o += c.length; if (o >= bytes.length) break; }
  return { res, bytes };
}

function imageType(bytes, header) {
  const h = String(header || "").split(";")[0].trim().toLowerCase();
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) return "image/webp";
  const start = new TextDecoder().decode(b.subarray(0, 600)).toLowerCase();
  if (start.includes("<svg")) return "image/svg+xml";
  if (h === "image/x-icon" || h === "image/vnd.microsoft.icon") return null; // .ico files are too small to use
  return null;
}

const json = (status, body) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function handleBrand(request) {
  const url = new URL(request.url);
  const domain = cleanDomain(url.searchParams.get("d"));
  if (!domain) return json(400, { error: "Please enter a website, like yourbusiness.com.au" });

  const cacheKey = new Request(`https://oniv.com.au/api/brand?d=${domain}&v=1`);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let page = null;
  for (const base of [`https://${domain}/`, `https://www.${domain}/`]) {
    try { page = await fetchLimited(base, "text/html,application/xhtml+xml", MAX_HTML); } catch { page = null; }
    if (page) break;
  }
  if (!page) return json(404, { error: "We couldn't open that website. Check the address, or upload your logo instead." });

  const html = new TextDecoder().decode(page.bytes);
  const pageUrl = page.res.url || `https://${domain}/`;
  const hints = siteHints(html, domain);

  for (const cand of findLogos(html, pageUrl).slice(0, 6)) {
    let bytes, type;
    if (cand.url.startsWith("data:image/svg+xml")) {
      bytes = new TextEncoder().encode(decodeURIComponent(cand.url.slice(cand.url.indexOf(",") + 1)));
      type = "image/svg+xml";
    } else {
      let got = null;
      try { got = await fetchLimited(cand.url, "image/svg+xml,image/png,image/webp,image/*;q=0.8", MAX_IMAGE); } catch { got = null; }
      if (!got) continue;
      bytes = got.bytes;
      type = imageType(bytes, got.res.headers.get("Content-Type"));
    }
    if (!type || bytes.length < 200) continue;
    const response = new Response(bytes, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400",
        // An SVG from another site is only ever drawn as an image: never let it run as a page here.
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Logo-Kind": cand.kind,
        "X-Brand-Name": encodeURIComponent(hints.name),
        "X-Brand-Color": hints.color,
      },
    });
    await cache.put(cacheKey, response.clone());
    return response;
  }
  return json(404, { error: "We couldn't find a logo on that website. Upload your logo instead." });
}

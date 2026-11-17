// oniv.com.au on Cloudflare Workers.
// Pages and /api/* run through here first (see run_worker_first in wrangler.jsonc); /assets/* is served directly.
import { handleEnquiry } from "./enquiry.js";
import { handleBrand } from "./brand.js";
import { handlePreview } from "./preview.js";
import { handleGuide } from "./guide.js";

const HOST = "oniv.com.au";

// Old Elementor-era addresses, sent permanently to their new pages so links and search rankings carry over.
const MOVED = {
  "/home": "/",
  "/about-us": "/about",
  "/our-story": "/about",
  "/shop": "/pricing",
  "/products": "/pricing",
  "/price-list": "/pricing",
  "/prices": "/pricing",
  "/corporate-gifts": "/corporate",
  "/corporate-gifting": "/corporate",
  "/corporate-wine": "/corporate",
  "/business": "/corporate",
  "/weddings": "/wedding-wine",
  "/wedding": "/wedding-wine",
  "/bomboniere": "/wedding-wine",
  "/birthdays": "/21st-birthday-wine",
  "/21st": "/21st-birthday-wine",
  "/charity": "/charity-fundraising-wine",
  "/fundraising": "/charity-fundraising-wine",
  "/galleries": "/art-gallery-wine",
  "/christmas": "/christmas-wine-gifts",
  "/settlement": "/settlement-gifts",
  "/event": "/events",
  "/launches": "/events",
  "/personalised-wine": "/occasions",
  "/wines": "/wine",
  "/our-wines": "/wine",
  "/our-wine": "/wine",
  "/the-wine": "/wine",
  "/process": "/how-it-works",
  "/faqs": "/faq",
  "/contact-us": "/contact",
  "/enquire": "/contact",
  "/enquiry": "/contact",
  "/get-a-quote": "/contact",
  "/quote": "/contact",
  "/privacy-policy": "/privacy",
  "/terms-and-conditions": "/terms",
  "/terms-conditions": "/terms",
};

function redirect(url, status = 301) {
  return new Response(null, { status, headers: { Location: url, "Cache-Control": "public, max-age=3600" } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // One address for everything: https://oniv.com.au (www and plain http redirect here).
    if (url.hostname === "www." + HOST || (url.hostname === HOST && url.protocol === "http:")) {
      url.hostname = HOST;
      url.protocol = "https:";
      url.port = "";
      return redirect(url.toString());
    }

    if (url.pathname === "/api/enquiry") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
      }
      return handleEnquiry(request, env);
    }

    if (url.pathname === "/api/guide") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
      }
      return handleGuide(request, env);
    }

    if (url.pathname === "/api/preview") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
      }
      return handlePreview(request, env);
    }

    if (url.pathname === "/api/brand") {
      if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
      }
      return handleBrand(request);
    }

    if (request.method === "GET" || request.method === "HEAD") {
      // Tidy addresses: no trailing slash, no ".html", no "/index".
      let path = url.pathname;
      if (path.length > 1 && path.endsWith("/")) path = path.replace(/\/+$/, "");
      if (path.endsWith(".html")) path = path.slice(0, -5);
      if (path === "/index") path = "/";
      const moved = MOVED[path.toLowerCase()];
      if (moved) path = moved;
      if (path !== url.pathname) {
        url.pathname = path;
        return redirect(url.toString());
      }
    }

    return env.ASSETS.fetch(request);
  },
};

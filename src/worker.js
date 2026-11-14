// oniv.com.au on Cloudflare Workers.
// Static files in ./public are served directly; /api/* runs here first (see wrangler.jsonc).
import { handleEnquiry } from "./enquiry.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/enquiry") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
      }
      return handleEnquiry(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

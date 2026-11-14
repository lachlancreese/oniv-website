# oniv.com.au

Website for ONIV Pty Ltd, hosted on Cloudflare Workers (static assets plus a small Worker for the enquiry form). No build step.

## Files

| Path | What it is |
|---|---|
| `public/` | Everything the site serves: pages, CSS, JS, fonts, images, `_headers`, `robots.txt`, `sitemap.xml` |
| `public/index.html` | Homepage |
| `public/privacy.html`, `thanks.html`, `404.html` | Privacy policy, form thank-you page (no-JavaScript fallback), not-found page |
| `src/worker.js` | Sends `/api/enquiry` to the form handler; serves everything else from `public/` |
| `src/enquiry.js` | Emails each enquiry, with the logo attached, through Resend |
| `wrangler.jsonc` | Cloudflare config. The Worker name here must match the name in the Cloudflare dashboard |

## Deploy

Cloudflare builds from GitHub automatically: every push to `main` goes live.

- Cloudflare dashboard: Workers & Pages → `oniv-website` → connected to `lachlancreese/oniv-website`
- Build command: none. Deploy command: `npx wrangler deploy`

## Email for the enquiry form

Resend, free up to 3,000 emails a month:

1. Sign up at resend.com, add the domain `oniv.com.au`, and add the DNS records it gives you.
2. Create an API key.
3. In Cloudflare → Workers & Pages → `oniv-website` → Settings → Variables and secrets, add:
   - `RESEND_API_KEY` = the API key (type: Secret)
   - `TO_EMAIL` = `alex@oniv.com.au`
   - `FROM_EMAIL` = `ONIV website <enquiries@oniv.com.au>`
4. Redeploy, then send a test enquiry.

## Domain

`oniv.com.au` is registered with Squarespace Domains; email is Microsoft 365.
In Cloudflare, use "Add a domain" (DNS only, not Transfer), check every Microsoft 365 record was imported
(MX, autodiscover, SPF, DKIM, DMARC), then change the nameservers in Squarespace Domains to Cloudflare's.
Then add `oniv.com.au` and `www.oniv.com.au` as custom domains on the Worker.

## Photos

The photos are studio-style cut-outs of real client bottles, in `assets/img/` as WebP at two sizes each:
`hero-*`, `label-business-*`, `label-milestone-*`, `label-brand-*`.

Before going live, get written permission from each client whose label appears (SEIVA, Ben's family, Chocolate Blonde Salon).
To swap a photo, replace both sizes of the file with the same names, in portrait 4:5.

## Editing text

Text lives in `index.html`. Prices, delivery terms and dates appear in a few places: the hero, the pricing card and the FAQ. Search for `$24`, `$35` and `14 December` and change every match.

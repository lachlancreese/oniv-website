# oniv.com.au

Static website for ONIV Pty Ltd, hosted on Cloudflare Pages. No build step: the files in this folder are the site.

## Files

| Path | What it is |
|---|---|
| `index.html` | Homepage |
| `privacy.html`, `thanks.html`, `404.html` | Privacy policy, form thank-you page (for browsers without JavaScript), not-found page |
| `assets/css/site.css` | All styles (brand colours and fonts at the top) |
| `assets/js/site.js` | Enquiry form behaviour |
| `assets/fonts/` | DM Sans and DM Serif Display, self-hosted (SIL Open Font Licence) |
| `assets/img/` | Logo, favicon, social share image. Put photos here too |
| `functions/api/enquiry.js` | Cloudflare Pages Function that emails each enquiry, with the logo attached |
| `_headers`, `robots.txt`, `sitemap.xml` | Security and caching headers, search engine files |

## Go live

1. **GitHub:** create a private repository (e.g. `oniv-website`) and upload this folder's contents.
2. **Cloudflare:** Workers & Pages → Create → Pages → Connect to Git → pick the repository.
   Framework preset: None. Build command: leave empty. Build output directory: `/`.
3. **Email for the enquiry form** (Resend, free up to 3,000 emails a month):
   - Sign up at resend.com, add the domain `oniv.com.au`, and add the DNS records it gives you.
   - Create an API key.
   - In Cloudflare Pages → Settings → Variables and secrets, add:
     - `RESEND_API_KEY` = the API key (as a secret)
     - `TO_EMAIL` = where enquiries go, e.g. `alex@oniv.com.au,lachlan@oniv.com.au`
     - `FROM_EMAIL` = `ONIV website <enquiries@oniv.com.au>`
   - Redeploy, then send a test enquiry.
4. **Domain:** in Cloudflare Pages → Custom domains, add `oniv.com.au` and `www.oniv.com.au`.
   Moving DNS to Cloudflare is easiest. Before switching nameservers, copy every existing DNS record, especially MX, SPF (TXT) and DMARC, so email keeps working.
5. **Old site:** once the new site is live, cancel the old hosting.

## Photos

The photos are studio-style cut-outs of real client bottles, in `assets/img/` as WebP at two sizes each:
`hero-*`, `label-business-*`, `label-milestone-*`, `label-brand-*`.

Before going live, get written permission from each client whose label appears (SEIVA, Ben's family, Chocolate Blonde Salon).
To swap a photo, replace both sizes of the file with the same names, in portrait 4:5.

## Editing text

Text lives in `index.html`. Prices, delivery terms and dates appear in a few places: the hero, the pricing card and the FAQ. Search for `$24`, `$35` and `14 December` and change every match.

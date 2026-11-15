# oniv.com.au

Website for ONIV Pty Ltd, hosted on Cloudflare Workers (static assets plus a small Worker for the enquiry form).
Cloudflare runs no build step: the finished pages in `public/` are committed.

## Files

| Path | What it is |
|---|---|
| `pages/` | The text of each page. Edit these, not the HTML in `public/` |
| `build.py` | Wraps each page in the shared header, footer and mobile call bar, and writes `public/` and `sitemap.xml` |
| `public/` | Everything the site serves: built pages, CSS, JS, fonts, images, `_headers`, `robots.txt`, `sitemap.xml` |
| `src/worker.js` | Redirects www, http, `.html` and old Elementor addresses to the right page; sends `/api/enquiry` to the form handler; serves everything else from `public/` |
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
3. In Cloudflare → Workers & Pages → `oniv-website` → Settings → Variables and secrets, add
   `RESEND_API_KEY` = the API key, with **Secret** ticked.
   The recipient and sender addresses (`TO_EMAIL`, `FROM_EMAIL`) are set in `wrangler.jsonc`; change them there.
4. Redeploy, then send a test enquiry.

## Domain

`oniv.com.au` is registered with Squarespace Domains; email is Microsoft 365.
In Cloudflare, use "Add a domain" (DNS only, not Transfer), check every Microsoft 365 record was imported
(MX, autodiscover, SPF, DKIM, DMARC), then change the nameservers in Squarespace Domains to Cloudflare's.
Then add `oniv.com.au` and `www.oniv.com.au` as custom domains on the Worker.

## Photos

The photos are studio-style cut-outs of real client bottles, in `public/assets/img/` as WebP at two sizes each:
`hero-*`, `label-business-*`, `label-milestone-*`, `label-brand-*`.

Before going live, get written permission from each client whose label appears (SEIVA, Ben's family, Chocolate Blonde Salon).
To swap a photo, replace both sizes of the file with the same names, in portrait 4:5.

## Pages

| Page | File | Address |
|---|---|---|
| Home | `pages/index.html` | `/` |
| Corporate | `pages/corporate.html` | `/corporate` |
| Occasions | `pages/occasions.html` | `/occasions` |
| The wine | `pages/wine.html` | `/wine` |
| How it works | `pages/how-it-works.html` | `/how-it-works` |
| Pricing and delivery | `pages/pricing.html` | `/pricing` |
| FAQ | `pages/faq.html` | `/faq` |
| Enquiry form | `pages/contact.html` | `/contact` |
| Christmas wine gifts (seasonal; update dates each year) | `pages/christmas-wine-gifts.html` | `/christmas-wine-gifts` |
| Settlement gifts (agents, builders) | `pages/settlement-gifts.html` | `/settlement-gifts` |
| Wedding wine and bomboniere | `pages/wedding-wine.html` | `/wedding-wine` |
| 21st and milestone birthdays | `pages/21st-birthday-wine.html` | `/21st-birthday-wine` |
| Art galleries | `pages/art-gallery-wine.html` | `/art-gallery-wine` |
| Charity and fundraising | `pages/charity-fundraising-wine.html` | `/charity-fundraising-wine` |
| About | `pages/about.html` | `/about` |
| Terms and conditions | `pages/terms.html` | `/terms` |
| Privacy, thank-you, not found | `pages/privacy.html`, `thanks.html`, `404.html` | `/privacy`, `/thanks` |

## Editing text

1. Edit the page in `pages/`. The header menu (`NAV`), the footer's "Wine for" list (`WINE_FOR`), Christmas banner, phone number and email are in `build.py`.
2. Run `python3 build.py` (Python 3, no packages needed).
3. Commit both `pages/` and `public/`, then push.

To add a page, copy one in `pages/`, change the settings block at the top (title, description, address), and add it to `NAV` in `build.py` if it belongs in the menu.

Prices, delivery terms and dates appear on several pages. Search `pages/` and `build.py` for `$24`, `$288`, `$35` and `14 December` and change every match.

To preview locally: `npx wrangler dev`, then open http://localhost:8787.

## Search (SEO)

- Each page's title and description are in the settings block at the top of its file in `pages/`. Keep titles under about 60 characters and descriptions under about 155.
- `build.py` adds Google's structured data automatically: business and website details on the homepage, breadcrumbs on every page, questions and answers on the FAQ, and the product and price on Pricing. Change prices there too if they change.
- `sitemap.xml` is rebuilt with each page's last-changed date every time you run `build.py`.
- Old addresses that should redirect to a new page go in `MOVED` at the top of `src/worker.js`.

## Spinning bottles (page heroes)

The heroes on the homepage, Corporate, Occasions, 21st and Art gallery pages are 3D bottles (`public/assets/js/hero3d.js`, built from
`tools/hero3d/hero3d.js` with three.js). They spin slowly, turn further as the page scrolls, and can be dragged sideways.
They hold still for visitors who have reduced motion turned on, and show a still image (`hero-bottle-6-*`,
`hero-corporate-3-*`, `hero-occasions-4-*`, `hero-21st-2-*`, `hero-art-3-*`) on devices without graphics hardware.

Each hero is a `<div class="hero-stage" data-hero3d ...>` in the page file with:
- `data-front` / `data-back`: label images, about 1024 px wide at roughly 9 × 10 cm proportions
- `data-bottle`: `still` (Bordeaux bottle with a screwcap, the default) or `sparkling` (Champagne bottle; the cork
  rises as the page scrolls and pops with a spray of bubbles)
- `data-cap`: for still bottles, `black` (the default) or `gold`

The example labels (fictional names, captioned "Example label design") are HTML in `tools/labels/` (the gallery label's painting is drawn by `salt-ochre-art.js`); render them with
`python3 tools/labels/render.py`. After changing a bottle or label, re-render its still image with
`python3 tools/hero3d/poster.py /page-path new-name` (run `npx wrangler dev --port 8787` first), giving it a new name
so browsers fetch the new one, and update the page.

## "Try it with your logo" preview (Home and Corporate)

A shared section (`pages/partials/try.html`, added to a page with `<!--include:try-->`) lets a visitor type their
website or upload a logo and see it on a bottle straight away. `public/assets/js/try-label.js` builds the front label
in the browser (colours are read from the logo) and puts it on the 3D bottle, or shows it flat where 3D isn't running.
"Send this for my free mockup" carries the logo and the preview to the enquiry form, and both arrive attached to the
enquiry email.

"Email it to me" (under the preview) sends the visitor a picture of their bottle, front and back, rendered on
the bottle rather than the flat artwork (`/api/preview`, `src/preview.js`), and emails the team the artwork, logo and
their choices, noting whether they ticked the box to be contacted.

Every enquiry also gets an automatic reply from "Alex at ONIV" (replies go to Alex), with their bottle preview if they
made one (`autoReply()` in `src/enquiry.js`; shared email layout in `src/mail.js`). Both forms are limited per visitor
to stop them being used to send floods of email.

Website lookups go to `/api/brand?d=example.com.au` (`src/brand.js`), which reads the business's own homepage for its
logo (the logo declared for search engines, a logo image or SVG in the header, or failing that the site's app icon).
Results are cached for a day; nothing is stored. Some sites block automated visits, so the form always offers upload.

## Wine regions map (/wine)

The interactive map on The wine page is generated from `tools/winemap/regions.json` (region names, map position,
climate, what each region is known for, and a short description) and `tools/winemap/au-states.geojson`
(state outlines from Natural Earth, public domain). To change a region or add one:

1. Edit `tools/winemap/regions.json`. `label` sets where the name sits next to the dot: left, right, top or bottom.
2. In `tools/winemap`, run `npm install` once, then `npm run build`. This rewrites the map block in `pages/wine.html`.
3. Run `python3 build.py` in the site folder, then commit and push.

The map's behaviour (zooming to a state, the style filter, choosing a region) is in `public/assets/js/winemap.js`.

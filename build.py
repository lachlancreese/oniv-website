#!/usr/bin/env python3
"""Build the ONIV site: wraps each pages/*.html in the shared layout and writes public/.

Edit text in pages/, shared header/footer here, then run:  python3 build.py
Each page file starts with a comment block of settings:
    <!--
    title: Page title | ONIV
    description: One sentence for Google.
    path: /corporate
    nav: corporate          (which menu item to highlight; blank for none)
    bar: yes                (show the mobile call/mockup bar; "no" to hide)
    index: yes              (list in sitemap; "no" to hide from search)
    -->
"""
import hashlib
import html
import pathlib
import re

ROOT = pathlib.Path(__file__).parent
PAGES = ROOT / "pages"
OUT = ROOT / "public"
SITE = "https://oniv.com.au"
PHONE = "0475 799 070"
PHONE_TEL = "+61475799070"
EMAIL = "alex@oniv.com.au"

NAV = [
    ("corporate", "Corporate", "/corporate"),
    ("occasions", "Occasions", "/occasions"),
    ("wine", "The wine", "/wine"),
    ("how", "How it works", "/how-it-works"),
    ("pricing", "Pricing", "/pricing"),
    ("faq", "FAQ", "/faq"),
]

WARNING = ("Warning: Under the Liquor Control Reform Act 1998 it is an offence to supply alcohol to a person "
           "under the age of 18 years (Penalty exceeds $25,000) and for a person under the age of 18 years to "
           "purchase or receive liquor (Penalty exceeds $1,000).")


def asset(path):
    """Add a content hash so browsers fetch a fresh copy whenever the file changes."""
    digest = hashlib.sha256((OUT / path.lstrip("/")).read_bytes()).hexdigest()[:10]
    return f"{path}?v={digest}"


def head(meta, extra_head):
    title = html.escape(meta["title"])
    desc = html.escape(meta["description"])
    url = SITE + (meta["path"] if meta["path"] != "/" else "/")
    noindex = meta.get("index", "yes") == "no"
    robots = '\n<meta name="robots" content="noindex">' if noindex else ""
    canonical = "" if noindex else f'\n<link rel="canonical" href="{url}">'
    return f"""<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">{canonical}{robots}
<meta name="theme-color" content="#8A9E8C">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/img/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ONIV">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/assets/img/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" href="/assets/fonts/dm-serif-display-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/dm-sans-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{asset('/assets/css/site.css')}">{extra_head}
</head>"""


def header(active):
    links = []
    for key, label, href in NAV:
        cur = ' aria-current="page"' if key == active else ""
        links.append(f'<a href="{href}"{cur}>{label}</a>')
    nav_links = "\n        ".join(links)
    return f"""<body>
<a class="skip" href="#main">Skip to content</a>

<div class="announce on-dark">
  <div class="wrap">
    <span>Christmas orders: approve your label by 14 December for delivery before Christmas (WA and NT by 3 December).</span>
    <a href="/contact">Get your free mockup</a>
  </div>
</div>

<header class="site-header" id="top">
  <div class="wrap">
    <a class="brand" href="/" aria-label="ONIV home"><img src="/assets/img/oniv-logo-dark.svg" alt="ONIV" width="83" height="34"></a>
    <nav class="nav" aria-label="Main">
      <div class="nav-links" id="nav-links">
        {nav_links}
        <a class="nav-menu-cta btn" href="/contact">Get your free mockup</a>
      </div>
      <a class="btn nav-cta" href="/contact">Free mockup</a>
      <button class="menu-btn" type="button" aria-expanded="false" aria-controls="nav-links">
        <span class="menu-icon" aria-hidden="true"></span><span class="menu-label">Menu</span>
      </button>
    </nav>
  </div>
</header>
"""


def footer(show_bar):
    cols = "\n".join(f'          <li><a href="{href}">{label}</a></li>' for key, label, href in NAV)
    bar = f"""
<div class="action-bar" role="region" aria-label="Quick actions">
  <a class="action-call" href="tel:{PHONE_TEL}"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>Call</a>
  <a class="action-mockup btn" href="/contact">Get your free mockup</a>
</div>""" if show_bar else ""
    return f"""
<footer class="site-footer">
  <div class="wrap">
    <div class="footer-top">
      <div class="footer-brand">
        <img src="/assets/img/oniv-logo-light.svg" alt="ONIV" width="83" height="34">
        <p>Custom-label Australian wine, sold by the case. Printed and labelled in Melbourne.</p>
        <a class="btn" href="/contact">Get your free mockup</a>
      </div>
      <nav class="footer-cols" aria-label="Footer">
        <div>
          <h2>Explore</h2>
          <ul>
{cols}
          </ul>
        </div>
        <div>
          <h2>Contact</h2>
          <ul>
            <li><a href="tel:{PHONE_TEL}">{PHONE}</a></li>
            <li><a href="mailto:{EMAIL}">{EMAIL}</a></li>
            <li><a href="/contact">Enquiry form</a></li>
          </ul>
        </div>
      </nav>
    </div>
    <div class="footer-legal">
      <p>{WARNING}</p>
      <p>ONIV Pty Ltd · ACN 699 600 041 · ABN 99 699 600 041 · Liquor Licence (VIC) 36315128</p>
      <p><a href="/terms">Terms and conditions</a> · <a href="/privacy">Privacy policy</a> · © <span class="year">2026</span> ONIV Pty Ltd</p>
    </div>
  </div>
</footer>{bar}

<script src="{asset('/assets/js/site.js')}" defer></script>
</body>
</html>
"""


def parse(text):
    m = re.match(r"\s*<!--(.*?)-->\s*", text, re.S)
    meta = {}
    for line in m.group(1).strip().splitlines():
        k, _, v = line.partition(":")
        meta[k.strip()] = v.strip()
    body = text[m.end():]
    extra = ""
    hm = re.search(r"<!--head-->(.*?)<!--/head-->", body, re.S)
    if hm:
        extra = "\n" + hm.group(1).strip()
        body = body[:hm.start()] + body[hm.end():]
    return meta, body.strip(), extra


def build():
    urls = []
    for src in sorted(PAGES.glob("*.html")):
        meta, body, extra_head = parse(src.read_text())
        out = (head(meta, extra_head) + "\n" + header(meta.get("nav", "")) + '\n<main id="main">\n'
               + body + "\n</main>\n" + footer(meta.get("bar", "yes") != "no"))
        name = "index.html" if meta["path"] == "/" else meta["path"].strip("/") + ".html"
        (OUT / name).write_text(out)
        if meta.get("index", "yes") != "no":
            urls.append(meta["path"])
        print("built", name)
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sitemap += [f"  <url><loc>{SITE}{u}</loc></url>" for u in urls]
    sitemap.append("</urlset>")
    (OUT / "sitemap.xml").write_text("\n".join(sitemap) + "\n")


if __name__ == "__main__":
    build()

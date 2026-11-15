"""Render the still image shown before a page's 3D bottle loads.

Run the site locally first (npx wrangler dev --port 8787), then:
    python3 tools/hero3d/poster.py /21st-birthday-wine hero-21st
which writes public/assets/img/<name>-1000.webp and -600.webp from the bottle's front view.
Give the files a new name whenever the bottle changes, so browsers fetch the new one.
"""
import asyncio, io, pathlib, sys
from PIL import Image
from playwright.async_api import async_playwright

OUT = pathlib.Path(__file__).resolve().parents[2] / "public/assets/img"

async def main(path, name):
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        ctx = await b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2, reduced_motion="reduce")
        pg = await ctx.new_page()
        await pg.goto(f"http://127.0.0.1:8787{path}?3d", wait_until="networkidle")
        await pg.wait_for_selector(".hero-stage.is-live", timeout=30000)
        await pg.wait_for_timeout(800)
        png = await (await pg.query_selector(".hero-canvas")).screenshot()
        await b.close()
    im = Image.open(io.BytesIO(png)).convert("RGB")
    for w in (1000, 600):
        im.resize((w, round(w * 5 / 4)), Image.LANCZOS).save(OUT / f"{name}-{w}.webp", quality=84, method=6)
    print("wrote", name)

asyncio.run(main(sys.argv[1], sys.argv[2]))

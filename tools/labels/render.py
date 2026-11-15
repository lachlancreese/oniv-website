"""Render every *.html label in this folder to public/assets/img/labels/<name>.webp (1024 px wide)."""
import asyncio, io, pathlib, sys
from PIL import Image
from playwright.async_api import async_playwright
HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent.parent / "public/assets/img/labels"
async def main(names):
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1063, "height": 1181})
        for f in sorted(HERE.glob("*.html")):
            if names and f.stem not in names:
                continue
            await pg.goto(f.as_uri())
            await pg.evaluate("document.fonts.ready")
            await pg.wait_for_timeout(200)
            png = await pg.screenshot(clip={"x": 0, "y": 0, "width": 1063, "height": 1181})
            im = Image.open(io.BytesIO(png)).convert("RGB").resize((1024, 1138), Image.LANCZOS)
            im.save(OUT / f"{f.stem}.webp", quality=88, method=6)
            print("rendered", f.stem)
        await b.close()
asyncio.run(main(sys.argv[1:]))

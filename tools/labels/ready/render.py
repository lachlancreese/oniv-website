"""Render the ready-made label designs in this folder to PNGs for review.
python3 tools/labels/ready/render.py [out_dir] [names...]   (default out_dir: /tmp/ready)"""
import asyncio, io, pathlib, sys
from PIL import Image
from playwright.async_api import async_playwright
HERE = pathlib.Path(__file__).resolve().parent
async def main(out, names):
    out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1063, "height": 1181})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        for f in sorted(HERE.glob("*.html")):
            if names and f.stem not in names:
                continue
            await pg.goto(f.as_uri())
            await pg.evaluate("document.fonts.ready")
            await pg.wait_for_timeout(300)
            png = await pg.screenshot(clip={"x": 0, "y": 0, "width": 1063, "height": 1181})
            im = Image.open(io.BytesIO(png)).convert("RGB")
            im.save(out / f"{f.stem}.png")
            im.resize((1024, 1138), Image.LANCZOS).save(out / f"{f.stem}.webp", quality=88, method=6)
            print("rendered", f.stem, errs)
        await b.close()
args = sys.argv[1:]
out = pathlib.Path(args.pop(0)) if args and "/" in args[0] else pathlib.Path("/tmp/ready")
asyncio.run(main(out, args))

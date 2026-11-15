"""Render a guide to PDF: python3 tools/guides/render.py christmas-2026
Writes public/assets/guides/oniv-<name>-gift-guide.pdf (A4) from tools/guides/<name>.html."""
import asyncio, pathlib, sys
from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent.parent / "public" / "assets" / "guides"

async def main(name):
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page()
        await pg.goto((HERE / f"{name}.html").as_uri(), wait_until="networkidle")
        await pg.evaluate("document.fonts.ready")
        OUT.mkdir(parents=True, exist_ok=True)
        out = OUT / f"oniv-{name.split('-')[0]}-gift-guide.pdf"
        await pg.pdf(path=str(out), format="A4", print_background=True, prefer_css_page_size=True)
        print("wrote", out.relative_to(HERE.parent.parent))
        await b.close()

asyncio.run(main(sys.argv[1]))

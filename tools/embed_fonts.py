"""Embed Geist and Geist Mono in frontend/main.css (base64 @font-face, Latin subset).

    python tools/embed_fonts.py

Qollab only loads main.css: the page cannot fetch font files from the project, so the fonts travel
inside the stylesheet. This script downloads the variable fonts of the `geist` npm package (pinned),
subsets them to the characters the UI uses, keeps the license metadata (name table) and writes the
@font-face block between the FONTS:BEGIN / FONTS:END markers of main.css.

Geist: Copyright (c) 2023 Vercel, in collaboration with basement.studio. SIL Open Font License 1.1
(full text in docs/fonts/OFL-Geist.txt). Needs `pip install fonttools brotli` (development only).
"""

from __future__ import annotations

import base64
import io
import re
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

REPO = Path(__file__).resolve().parent.parent
CSS = REPO / "frontend" / "main.css"
VERSION = "1.3.1"
BASE = f"https://cdn.jsdelivr.net/npm/geist@{VERSION}/dist/fonts"
FUENTES = {
    "Geist": f"{BASE}/geist-sans/Geist-Variable.woff2",
    "Geist Mono": f"{BASE}/geist-mono/GeistMono-Variable.woff2",
}
# Basic Latin + Latin-1 + typographic punctuation, arrows, box drawing and geometric shapes used by the HUD
UNICODES = "U+0020-007E,U+00A0-00FF,U+2010-2027,U+2030-203A,U+2190-2199,U+2212,U+2500-257F,U+2580-259F,U+25A0-25FF"


def subconjunto(woff2: bytes) -> bytes:
    font = TTFont(io.BytesIO(woff2))
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]  # keep copyright and license records (OFL)
    opts.name_languages = ["*"]
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(UNICODES))
    sub.subset(font)
    out = io.BytesIO()
    font.flavor = "woff2"
    font.save(out)
    return out.getvalue()


def main():
    bloques = []
    for familia, url in FUENTES.items():
        with urllib.request.urlopen(url) as r:  # noqa: S310 (pinned jsDelivr URL)
            datos = subconjunto(r.read())
        b64 = base64.b64encode(datos).decode("ascii")
        bloques.append(
            f'@font-face {{ font-family: "{familia}"; font-style: normal; font-weight: 100 900; font-display: swap;\n'
            f'  src: url(data:font/woff2;base64,{b64}) format("woff2"); }}')
        print(f"{familia}: {len(datos) / 1024:.1f} KB")
    bloque = ("/* FONTS:BEGIN · generado por tools/embed_fonts.py · Geist © 2023 Vercel, in collaboration with "
              "basement.studio · SIL Open Font License 1.1 */\n" + "\n".join(bloques) + "\n/* FONTS:END */")
    css = CSS.read_text(encoding="utf-8")
    if "/* FONTS:BEGIN" in css:
        css = re.sub(r"/\* FONTS:BEGIN.*?/\* FONTS:END \*/", lambda _: bloque, css, flags=re.S)
    else:
        css = bloque + "\n\n" + css
    CSS.write_text(css, encoding="utf-8")
    print(f"→ {CSS} ({CSS.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()

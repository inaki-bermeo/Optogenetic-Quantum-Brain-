"""Assemble the flat folder that is uploaded to Qollab.

    python tools/build_qollab.py              → dist/qollab/
    python tools/build_qollab.py --out DIR

Qollab runs the page from one flat project: main.js imports `cerebro_q.api` by module name and
the Python core opens its data with literal relative paths ("data/neurons.json"). This repo keeps
frontend and backend apart, so this script copies

    frontend/*                 → <out>/          (index.html, main.js, main.css, js/)
    backend/cerebro_q/         → <out>/cerebro_q/
    backend/data/              → <out>/data/
    backend/requirements.txt   → <out>/requirements.txt

and checks Qollab's limits (at most 100 files, each at most 2 MB). Upload the contents of <out>
keeping its folders (see docs/development.md). Changes always go repo → Qollab.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FRONTEND = REPO / "frontend"
BACKEND = REPO / "backend"

MAX_FILES = 100
MAX_BYTES = 2 * 1024 * 1024
JUNK = {"__pycache__", ".ipynb_checkpoints", ".DS_Store"}

# (source, destination inside the build); a directory is copied whole
FUENTES = [
    (FRONTEND / "index.html", "index.html"),
    (FRONTEND / "main.js", "main.js"),
    (FRONTEND / "main.css", "main.css"),
    (FRONTEND / "js", "js"),
    (BACKEND / "cerebro_q", "cerebro_q"),
    (BACKEND / "data", "data"),
    (BACKEND / "requirements.txt", "requirements.txt"),
]


def _archivos(origen: Path):
    if origen.is_file():
        yield origen, Path()
        return
    for f in sorted(origen.rglob("*")):
        if f.is_file() and not JUNK.intersection(f.relative_to(origen).parts) and f.name not in JUNK:
            yield f, f.relative_to(origen)


def construir(destino: Path) -> list[Path]:
    """Build the flat Qollab project in `destino` (replaced if it exists). Returns the written files."""
    if destino.exists():
        shutil.rmtree(destino)
    escritos = []
    for origen, rel_dest in FUENTES:
        for f, rel in _archivos(origen):
            out = destino / rel_dest / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, out)
            escritos.append(out)
    problemas = [f"{f.relative_to(destino)}: {f.stat().st_size / 1e6:.2f} MB > 2 MB"
                 for f in escritos if f.stat().st_size > MAX_BYTES]
    if len(escritos) > MAX_FILES:
        problemas.append(f"{len(escritos)} files > {MAX_FILES}")
    if problemas:
        raise SystemExit("Qollab limits exceeded:\n  " + "\n  ".join(problemas))
    return escritos


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=REPO / "dist" / "qollab")
    a = ap.parse_args()
    escritos = construir(a.out)
    total = sum(f.stat().st_size for f in escritos)
    for f in escritos:
        print(f"  {f.relative_to(a.out)}  ({f.stat().st_size / 1024:.0f} KB)")
    print(f"{len(escritos)} files, {total / 1e6:.2f} MB → {a.out}")


if __name__ == "__main__":
    main()

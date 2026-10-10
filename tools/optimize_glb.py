"""Shrink the worm body (backend/data/gusano.glb) for the browser, without changing its shape.

    python tools/optimize_glb.py                       # rewrites backend/data/gusano.glb in place
    python tools/optimize_glb.py IN.glb --out OUT.glb

The page reads the body through Python (base64) and recomputes the normals itself
(frontend/js/escena.js, _loadBody), so the file does not need them. This script:
  * drops every NORMAL attribute;
  * stores indices as 16-bit when a mesh has fewer than 65 536 vertices;
  * repacks the binary buffer with only what is left.
Positions are copied byte for byte. Run it again after re-exporting the body from Blender.
"""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parent.parent
GLB = REPO / "backend" / "data" / "gusano.glb"
U16, U32 = 5123, 5125
ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER = 34962, 34963


def leer(path: Path) -> tuple[dict, bytes]:
    b = path.read_bytes()
    magic, _version, _total = struct.unpack("<4sII", b[:12])
    assert magic == b"glTF", "not a binary glTF file"
    n_json, t_json = struct.unpack("<II", b[12:20])
    assert t_json == 0x4E4F534A
    gltf = json.loads(b[20:20 + n_json])
    o = 20 + n_json
    n_bin, _t_bin = struct.unpack("<II", b[o:o + 8])
    return gltf, b[o + 8:o + 8 + n_bin]


def escribir(path: Path, gltf: dict, binario: bytes) -> None:
    j = json.dumps(gltf, separators=(",", ":")).encode()
    j += b" " * (-len(j) % 4)
    binario += b"\0" * (-len(binario) % 4)
    total = 12 + 8 + len(j) + 8 + len(binario)
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<II", len(j), 0x4E4F534A) + j
                     + struct.pack("<II", len(binario), 0x004E4942) + binario)


def optimizar(gltf: dict, binario: bytes) -> tuple[dict, bytes]:
    acc, vistas = gltf["accessors"], gltf["bufferViews"]

    def datos(i: int) -> bytes:
        a, v = acc[i], vistas[acc[i]["bufferView"]]
        assert "byteStride" not in v and "sparse" not in a, "interleaved/sparse data not supported"
        tam = {5126: 4, U32: 4, U16: 2, 5121: 1}[a["componentType"]] * {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
        o = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        return binario[o:o + tam * a["count"]]

    nuevos_acc, nuevas_vistas, buf = [], [], bytearray()

    def agregar(a: dict, contenido: bytes, target: int) -> int:
        buf.extend(b"\0" * (-len(buf) % 4))
        nuevas_vistas.append({"buffer": 0, "byteOffset": len(buf), "byteLength": len(contenido), "target": target})
        buf.extend(contenido)
        nuevos_acc.append({**{k: v for k, v in a.items() if k != "byteOffset"}, "bufferView": len(nuevas_vistas) - 1})
        return len(nuevos_acc) - 1

    for malla in gltf["meshes"]:
        for prim in malla["primitives"]:
            prim["attributes"].pop("NORMAL", None)
            n_vert = acc[prim["attributes"]["POSITION"]]["count"]
            prim["attributes"] = {k: agregar(acc[i], datos(i), ARRAY_BUFFER) for k, i in prim["attributes"].items()}
            if "indices" in prim:
                a = dict(acc[prim["indices"]])
                idx = datos(prim["indices"])
                if a["componentType"] == U32 and n_vert < 65536:
                    idx = np.frombuffer(idx, dtype="<u4").astype("<u2").tobytes()
                    a["componentType"] = U16
                prim["indices"] = agregar(a, idx, ELEMENT_ARRAY_BUFFER)
    gltf["accessors"], gltf["bufferViews"] = nuevos_acc, nuevas_vistas
    gltf["buffers"] = [{"byteLength": len(buf) + (-len(buf) % 4)}]
    return gltf, bytes(buf)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("entrada", nargs="?", type=Path, default=GLB)
    ap.add_argument("--out", type=Path)
    a = ap.parse_args()
    salida = a.out or a.entrada
    antes = a.entrada.stat().st_size
    escribir(salida, *optimizar(*leer(a.entrada)))
    print(f"{a.entrada.name}: {antes / 1024:.0f} KB → {salida.stat().st_size / 1024:.0f} KB ({salida})")


if __name__ == "__main__":
    main()

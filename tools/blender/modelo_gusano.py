"""Genera backend/data/gusano.glb en Blender: C. elegans hermafrodita adulto, anatómico y coherente con los datos.

    "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" --background --factory-startup \\
        --python tools/blender/modelo_gusano.py -- --neurons backend/data/neurons.json --out backend/data/gusano.glb \\
        [--blend escena_gusano.blend] [--preview carpeta/]
    python tools/optimize_glb.py            # después: sin normales e índices de 16 bits

Desde WSL, pasar las rutas con `wslpath -w` (ver docs/3d-model.md).

Todo sale de la misma línea media que la nube de somas (OpenWorm), así que los 302 somas quedan
dentro del cuerpo y la app puede doblar cuerpo, órganos y neuronas con una sola cinemática.
Objetos (la app los reconoce por nombre, ver frontend/js/escena.js `_loadBody`):

    Cuerpo           cutícula: 6 labios alrededor de la boca, alas laterales, vulva, ano, poro excretor, cola
    Faringe          cavidad bucal → procorpus → metacorpus → istmo → bulbo terminal
    Faringe_grinder  el triturador de tres lóbulos dentro del bulbo terminal
    Anillo           anillo nervioso alrededor del istmo (neuropilo de la cabeza)
    Intestino        9 anillos de células (int1–int9) desde el bulbo terminal hasta el ano
    Gonada           dos brazos en U (ventral desde la vulva, giro dorsal) con ovocitos que crecen
    Huevos           embriones en el útero, alrededor de la vulva

Proporciones estilizadas a partir de WormAtlas / WormBook (Altun & Hall, "Hermaphrodite anatomy").
Coordenadas: datos en µm (x izquierda–derecha, y anteroposterior con la cabeza en y < 0, z dorsoventral con
ventral = −z); en Blender 1 unidad = 100 µm con X = x, Y = y, Z = z. El exportador glTF con +Y arriba da
(x, z, −y)·0.01, lo que espera la app.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np

UM = 0.01  # µm → unidades de Blender

# posiciones a lo largo del cuerpo (s = 0 nariz, 1 punta de la cola)
S_FARINGE = (0.008, 0.165)  # la faringe ocupa ~15 % del largo
S_VULVA = 0.5
S_ANO = 0.885
S_PORO = 0.15


# --------------------------------------------------------------------------- línea media
def _smooth(a: np.ndarray, sigma: float) -> np.ndarray:
    k = int(3 * sigma) + 1
    x = np.arange(-k, k + 1)
    w = np.exp(-0.5 * (x / sigma) ** 2)
    w /= w.sum()
    pad = np.pad(a, [(k, k)] + [(0, 0)] * (a.ndim - 1), mode="edge")
    if a.ndim == 1:
        return np.convolve(pad, w, mode="valid")
    return np.stack([np.convolve(pad[:, j], w, mode="valid") for j in range(a.shape[1])], axis=1)


def linea_media(pos: np.ndarray, n: int, nariz: float = 14.0, cola: float = 48.0):
    """Línea media suavizada a lo largo de y (como la versión anterior del modelo) y el radio de los somas."""
    y0, y1 = pos[:, 1].min() - nariz, pos[:, 1].max() + cola
    ys = np.linspace(y0, y1, n)
    cx, cz, rd = np.zeros(n), np.zeros(n), np.zeros(n)
    for i, y in enumerate(ys):
        w = 30.0
        cerca = pos[np.abs(pos[:, 1] - y) < w]
        while len(cerca) < 6 and w < 200:
            w *= 1.5
            cerca = pos[np.abs(pos[:, 1] - y) < w]
        cx[i], cz[i] = np.median(cerca[:, 0]), np.median(cerca[:, 2])
        d = np.hypot(cerca[:, 0] - cx[i], cerca[:, 2] - cz[i])
        rd[i] = np.percentile(d, 95) if len(d) else 0.0
    C = np.stack([_smooth(cx, 6), ys, _smooth(cz, 6)], axis=1)
    return ys, C, _smooth(rd, 5)


def marcos(C: np.ndarray, arriba: np.ndarray | None = None):
    """Tangente T, normal N (dorsal, +z proyectado) y binormal B (lateral) a lo largo de una curva."""
    T = np.gradient(C, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    up = np.tile([0.0, 0.0, 1.0], (len(C), 1)) if arriba is None else arriba
    N = up - np.sum(T * up, axis=1, keepdims=True) * T
    N /= np.linalg.norm(N, axis=1, keepdims=True)
    return T, N, np.cross(T, N)


class Cuerpo:
    """La línea media del cuerpo y sus marcos, para ubicar cada órgano por (s, desplazamiento local)."""

    def __init__(self, pos: np.ndarray, n: int = 220):
        self.ys, self.C, self.rd = linea_media(pos, n)
        self.L = float(self.ys[-1] - self.ys[0])
        self.s = (self.ys - self.ys[0]) / self.L
        self.T, self.N, self.B = marcos(self.C)
        mid = (self.s > 0.25) & (self.s < 0.75)
        self.Rmax = max(float(np.median(self.rd[mid])) * 1.15 + 6.0, 18.0)
        perfil = perfil_radio(self.s)
        R = self.Rmax * perfil
        R = np.maximum(R, np.minimum(self.rd * 1.08 + 4.0, self.Rmax * 1.25) * (perfil > 0.3))  # contener los somas
        self.R = _smooth(R, 2)

    def en(self, s, campo):
        s = np.clip(np.asarray(s, float), 0, 1)
        if campo.ndim == 1:
            return np.interp(s, self.s, campo)
        return np.stack([np.interp(s, self.s, campo[:, j]) for j in range(campo.shape[1])], axis=-1)

    def punto(self, s, dn=0.0, db=0.0, dt=0.0):
        """Punto a la altura s, desplazado dn·R hacia dorsal, db·R hacia el costado y dt (µm) a lo largo."""
        s = np.asarray(s, float)
        R = self.en(s, self.R)[..., None]
        T, N, B = (self.en(s, A) for A in (self.T, self.N, self.B))
        return self.en(s, self.C) + R * (np.asarray(dn)[..., None] * N + np.asarray(db)[..., None] * B) + np.asarray(dt)[..., None] * T


def perfil_radio(s: np.ndarray) -> np.ndarray:
    """Radio relativo: nariz redondeada, cuerpo parejo, cola que se afina en un látigo después del ano."""
    nariz = np.sqrt(np.clip(s / 0.05, 0, 1)) * (0.62 + 0.38 * np.clip(s / 0.12, 0, 1))
    cuerpo = np.clip((1 - s) / 0.24, 0, 1) ** 0.9
    cola = np.where(s > S_ANO, ((1 - s) / (1 - S_ANO)) ** 1.15, 1.0)  # cola post-anal: látigo fino
    return np.minimum(nariz, 0.14 + 0.86 * cuerpo) * np.clip(cola, 0.02, 1)


# --------------------------------------------------------------------------- mallas
def tubo(C: np.ndarray, R: np.ndarray, seg: int, arriba: np.ndarray | None = None, tapas: bool = True):
    """Tubo a lo largo de C. R puede ser (m,) o (m, seg) para modular el radio con el ángulo."""
    T, N, B = marcos(C, arriba)
    a = np.linspace(0, 2 * np.pi, seg, endpoint=False)
    R = np.broadcast_to(R[:, None] if R.ndim == 1 else R, (len(C), seg))
    V = C[:, None, :] + R[..., None] * (np.cos(a)[None, :, None] * N[:, None, :] + np.sin(a)[None, :, None] * B[:, None, :])
    V = V.reshape(-1, 3)
    m = len(C)
    i = np.arange(m - 1)[:, None] * seg
    k = np.arange(seg)[None, :]
    a0, b0 = i + k, i + (k + 1) % seg
    F = np.concatenate([np.stack([a0, a0 + seg, b0], -1).reshape(-1, 3), np.stack([b0, a0 + seg, b0 + seg], -1).reshape(-1, 3)])
    if tapas:
        i0 = len(V)
        V = np.vstack([V, C[0], C[-1]])
        kk = np.arange(seg)
        F = np.vstack([F, np.stack([np.full(seg, i0), (kk + 1) % seg, kk], 1),
                       np.stack([np.full(seg, i0 + 1), (m - 1) * seg + kk, (m - 1) * seg + (kk + 1) % seg], 1)])
    return V, F


def elipsoide(c, T, N, B, r, seg: int = 14, anillos: int = 10):
    """Elipsoide centrado en c con semiejes r = (a lo largo de T, de N, de B)."""
    u = np.linspace(0, np.pi, anillos + 1)[1:-1]
    v = np.linspace(0, 2 * np.pi, seg, endpoint=False)
    U, W = np.meshgrid(u, v, indexing="ij")
    P = (np.cos(U)[..., None] * r[0] * T + (np.sin(U) * np.cos(W))[..., None] * r[1] * N
         + (np.sin(U) * np.sin(W))[..., None] * r[2] * B).reshape(-1, 3) + c
    V = np.vstack([c - r[0] * T, P, c + r[0] * T])
    F = []
    n = len(u)
    for k in range(seg):
        F.append([0, 1 + (k + 1) % seg, 1 + k])
    for i in range(n - 1):
        for k in range(seg):
            a, b = 1 + i * seg + k, 1 + i * seg + (k + 1) % seg
            F += [[a, b, a + seg], [b, b + seg, a + seg]]
    last = len(V) - 1
    for k in range(seg):
        F.append([last, 1 + (n - 1) * seg + k, 1 + (n - 1) * seg + (k + 1) % seg])
    return V, np.array(F)


def toro(c, T, N, B, R, r, seg: int = 56, lados: int = 10):
    a = np.linspace(0, 2 * np.pi, seg, endpoint=False)
    b = np.linspace(0, 2 * np.pi, lados, endpoint=False)
    A, Bb = np.meshgrid(a, b, indexing="ij")
    eje = np.cos(A)[..., None] * N + np.sin(A)[..., None] * B
    V = (c + (R + r * np.cos(Bb))[..., None] * eje + (r * np.sin(Bb))[..., None] * T).reshape(-1, 3)
    i = np.arange(seg)[:, None]
    k = np.arange(lados)[None, :]
    p = lambda ii, kk: (ii % seg) * lados + kk % lados  # noqa: E731
    F = np.concatenate([np.stack([p(i, k), p(i + 1, k), p(i, k + 1)], -1).reshape(-1, 3),
                        np.stack([p(i + 1, k), p(i + 1, k + 1), p(i, k + 1)], -1).reshape(-1, 3)])
    return V, F


def unir(piezas):
    V, F, n = [], [], 0
    for v, f in piezas:
        V.append(v)
        F.append(f + n)
        n += len(v)
    return np.vstack(V), np.vstack(F)


def gauss(x, sigma):
    return np.exp(-0.5 * (x / sigma) ** 2)


def dang(a, b):
    """Diferencia angular en (−π, π]."""
    return (a - b + np.pi) % (2 * np.pi) - np.pi


# --------------------------------------------------------------------------- órganos
def malla_cuerpo(w: Cuerpo, seg: int = 60):
    s = w.s[:, None]
    a = np.linspace(0, 2 * np.pi, seg, endpoint=False)[None, :]  # 0 = dorsal, π = ventral, ±π/2 = costados
    R = np.repeat(w.R[:, None], seg, axis=1)
    labios = np.clip(1 - s / 0.03, 0, 1) ** 1.5
    R = R * (1 + 0.13 * labios * np.cos(6 * a))  # 6 labios alrededor de la boca
    alas = np.clip((s - 0.12) / 0.04, 0, 1) * np.clip((0.86 - s) / 0.04, 0, 1)
    R = R + 1.6 * alas * (gauss(dang(a, np.pi / 2), 0.07) + gauss(dang(a, -np.pi / 2), 0.07))  # alas laterales
    ventral = gauss(dang(a, np.pi), 0.32)
    R = R + 5.0 * gauss(s - S_VULVA, 0.011) * ventral  # labios de la vulva
    R = R - 4.0 * gauss(s - S_VULVA, 0.0035) * gauss(dang(a, np.pi), 0.12)  # su hendidura
    R = R - 3.0 * gauss(s - S_ANO, 0.006) * gauss(dang(a, np.pi), 0.25)  # ano
    R = R - 1.8 * gauss(s - S_PORO, 0.004) * gauss(dang(a, np.pi), 0.15)  # poro excretor
    R = np.maximum(R, 0.3)
    # la boca: el primer anillo se abre y la tapa queda hundida (abertura bucal)
    V, F = tubo(w.C, R, seg, arriba=w.N, tapas=True)
    V[-2] = w.C[0] + 2.5 * w.T[0]
    return V, F


def perfil_faringe(u):
    """Radio relativo (al cuerpo local) a lo largo de la faringe: u = 0 boca, 1 unión con el intestino."""
    bulbo = lambda c, sd: gauss(u - c, sd)  # noqa: E731
    r = 0.13 + 0.10 * np.clip((u - 0.06) / 0.08, 0, 1)  # cavidad bucal angosta → procorpus
    r = r + 0.22 * bulbo(0.45, 0.065)  # metacorpus (bulbo medio)
    r = r - 0.09 * bulbo(0.66, 0.06)  # istmo
    r = r + 0.31 * bulbo(0.87, 0.065)  # bulbo terminal
    return r * np.clip(u / 0.03, 0.35, 1) * np.clip((1 - u) / 0.035, 0.25, 1)


def malla_faringe(w: Cuerpo, n: int = 110, seg: int = 32):
    s = np.linspace(*S_FARINGE, n)
    u = (s - s[0]) / (s[-1] - s[0])
    C = w.en(s, w.C)
    return tubo(C, w.en(s, w.R) * perfil_faringe(u), seg, arriba=w.en(s, w.N))


def malla_grinder(w: Cuerpo):
    u = 0.87
    s = S_FARINGE[0] + u * (S_FARINGE[1] - S_FARINGE[0])
    c = w.en(s, w.C)
    T, N, B = (w.en(s, A) for A in (w.T, w.N, w.B))
    rb = float(w.en(s, w.R) * perfil_faringe(np.array([u]))[0])
    piezas = []
    for k in range(3):  # triturador triradiado: tres placas a 120°
        ang = 2 * np.pi * k / 3
        d = np.cos(ang) * N + np.sin(ang) * B
        piezas.append(elipsoide(c + 0.2 * rb * d, T, d, np.cross(T, d), np.array([0.34 * rb, 0.17 * rb, 0.07 * rb]), 12, 8))
    return unir(piezas)


def malla_anillo(w: Cuerpo):
    s = S_FARINGE[0] + 0.62 * (S_FARINGE[1] - S_FARINGE[0])  # alrededor del istmo
    c = w.en(s, w.C)
    T, N, B = (w.en(s, A) for A in (w.T, w.N, w.B))
    R = float(w.en(s, w.R))
    return toro(c, T, N, B, 0.62 * R, 0.13 * R)


def malla_intestino(w: Cuerpo, n: int = 150, seg: int = 24):
    s0, s1 = S_FARINGE[1] + 0.008, S_ANO - 0.01
    s = np.linspace(s0, s1, n)
    u = (s - s0) / (s1 - s0)
    # 9 anillos de células (int1–int9): constricciones suaves entre anillos; int1 (4 células) algo más ancho
    bordes = np.linspace(0, 1, 10)[1:-1]
    constr = sum(gauss(u - b, 0.012) for b in bordes)
    r = 0.4 * (1 - 0.16 * constr) * (1 + 0.12 * gauss(u - 0.05, 0.04))
    r = r * np.clip(u / 0.04, 0.4, 1) * np.clip((1 - u) / 0.05, 0.3, 1)
    # el intestino real gira ~180° a lo largo del cuerpo: el centro describe una hélice suave
    giro = np.pi * u
    C = w.punto(s, dn=0.06 * np.cos(giro), db=0.10 * np.sin(giro))
    return tubo(C, w.en(s, w.R) * r, seg, arriba=w.en(s, w.N))


def brazo_gonada(w: Cuerpo, sentido: int, n: int = 90, seg: int = 14):
    """Un brazo en U: sale ventral de la vulva, gira hacia dorsal y vuelve; `sentido` −1 anterior, +1 posterior."""
    giro_s = S_VULVA + sentido * 0.19  # dónde está la curva
    punta_s = S_VULVA + sentido * 0.05  # extremo distal (dorsal)
    t = np.linspace(0, 1, n)
    # tramo ventral (proximal, con ovocitos) → curva → tramo dorsal (distal, angosto)
    f1, f2 = 0.55, 0.72
    s = np.where(t < f1, S_VULVA + (giro_s - S_VULVA) * (t / f1),
                 np.where(t < f2, giro_s, giro_s + (punta_s - giro_s) * ((t - f2) / (1 - f2))))
    ang = np.where(t < f1, np.pi, np.where(t < f2, np.pi * (1 - (t - f1) / (f2 - f1)), 0.0))  # π ventral → 0 dorsal
    dn, db = 0.5 * np.cos(ang), 0.22 + 0.0 * t
    s = s + sentido * 0.012 * np.sin(np.clip((t - f1) / (f2 - f1), 0, 1) * np.pi)  # la curva se abre un poco
    C = w.punto(_smooth(s, 2), dn=_smooth(dn, 2), db=db)
    r = w.en(s, w.R) * np.where(t < f1, 0.2 + 0.06 * (1 - t / f1), 0.13)
    V, F = tubo(C, r, seg, arriba=w.en(s, w.N))
    piezas = [(V, F)]
    # ovocitos en el tramo proximal: crecen hacia la espermateca (cerca de la vulva)
    for k in range(7):
        tk = 0.08 + 0.06 * k
        sk = S_VULVA + (giro_s - S_VULVA) * (tk / f1)
        T, N, B = (w.en(sk, A) for A in (w.T, w.N, w.B))
        tam = float(w.en(sk, w.R)) * (0.24 - 0.018 * k)
        piezas.append(elipsoide(w.punto(sk, dn=-0.5, db=0.22), T, N, B, np.array([1.2 * tam, tam, tam]), 12, 8))
    return unir(piezas)


def malla_gonada(w: Cuerpo):
    return unir([brazo_gonada(w, -1), brazo_gonada(w, +1)])


def malla_huevos(w: Cuerpo):
    """Embriones en el útero: dos filas a los costados de la vulva, alineados con el cuerpo (~45 × 27 µm)."""
    piezas = []
    for k, ds in enumerate((-0.072, -0.044, -0.016, 0.016, 0.044, 0.072)):
        s = S_VULVA + ds
        T, N, B = (w.en(s, A) for A in (w.T, w.N, w.B))
        giro = 0.12 * (-1) ** k  # apenas inclinados, como en el útero real
        Tg = np.cos(giro) * T + np.sin(giro) * N
        Ng = np.cross(B, Tg)
        lado = 0.32 if k % 2 else -0.32
        piezas.append(elipsoide(w.punto(s, dn=-0.18, db=lado), Tg, Ng, B, np.array([22.0, 13.0, 13.0]), 14, 10))
    return unir(piezas)


# --------------------------------------------------------------------------- Blender
def objeto(nombre: str, V: np.ndarray, F: np.ndarray):
    me = bpy.data.meshes.new(nombre)
    me.from_pydata((V * UM).tolist(), [], F.astype(int).tolist())
    me.validate(clean_customdata=False)
    ob = bpy.data.objects.new(nombre, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def somas_dentro(w: Cuerpo, pos: np.ndarray) -> int:
    """Somas a menos del radio local (±1 µm) de la línea media del cuerpo."""
    dentro = 0
    for p in pos:
        i = int(np.argmin(np.linalg.norm(w.C - p, axis=1)))
        d = p - w.C[i]
        d = d - np.dot(d, w.T[i]) * w.T[i]
        dentro += np.linalg.norm(d) <= w.R[i] + 1.0
    return dentro


def vistas(objs, carpeta: Path, w: Cuerpo):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "OBJECT"
    sc.display.shading.show_xray = True
    sc.display.shading.xray_alpha = 0.35
    sc.render.resolution_x, sc.render.resolution_y = 1800, 700
    sc.render.film_transparent = False
    colores = {"Cuerpo": (0.25, 0.5, 1, 1), "Faringe": (0.6, 0.9, 1, 1), "Faringe_grinder": (1, 1, 1, 1),
               "Anillo": (0.7, 0.55, 1, 1), "Intestino": (0.25, 0.85, 0.7, 1), "Gonada": (1, 0.7, 0.3, 1),
               "Huevos": (0.6, 1, 0.85, 1)}
    for o in objs:
        o.color = colores.get(o.name, (1, 1, 1, 1))
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type = "ORTHO"
    centro = w.C.mean(axis=0) * UM
    tomas = {
        "lateral": (centro + np.array([12, 0, 0]), (math.pi / 2, 0, math.pi / 2), w.L * UM * 1.08),
        "ventral": (centro + np.array([0, 0, -12]), (math.pi, 0, 0), w.L * UM * 1.08),
        "cabeza": (w.C[int(0.07 * len(w.C))] * UM + np.array([4, 0, 0]), (math.pi / 2, 0, math.pi / 2), w.L * UM * 0.24),
        "vulva": (w.punto(S_VULVA) * UM + np.array([4, 0, 0]), (math.pi / 2, 0, math.pi / 2), w.L * UM * 0.3),
    }
    for nombre, (loc, rot, escala) in tomas.items():
        cam.location, cam.rotation_euler, cam.data.ortho_scale = tuple(loc), rot, escala
        sc.render.filepath = str(carpeta / f"modelo_{nombre}.png")
        bpy.ops.render.render(write_still=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    opt = {k.lstrip("-"): v for k, v in zip(args[::2], args[1::2])}
    neuronas = json.load(open(opt.get("neurons", "backend/data/neurons.json"), encoding="utf-8"))
    pos = np.array([[d["x"], d["y"], d["z"]] for d in neuronas], float)
    w = Cuerpo(pos)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    piezas = {
        "Cuerpo": malla_cuerpo(w),
        "Faringe": malla_faringe(w),
        "Faringe_grinder": malla_grinder(w),
        "Anillo": malla_anillo(w),
        "Intestino": malla_intestino(w),
        "Gonada": malla_gonada(w),
        "Huevos": malla_huevos(w),
    }
    objs = [objeto(n, *vf) for n, vf in piezas.items()]
    cuerpo = objs[0]
    vulva = w.punto(S_VULVA, dn=-1.0)
    ano = w.punto(S_ANO, dn=-1.0)
    cuerpo["largo_um"] = round(w.L, 1)
    cuerpo["radio_max_um"] = round(w.Rmax, 1)
    cuerpo["vulva_um"] = [round(float(v), 2) for v in vulva]
    cuerpo["ano_um"] = [round(float(v), 2) for v in ano]
    dentro = somas_dentro(w, pos)
    vertices = sum(len(v) for v, _ in piezas.values())
    print(f"modelo: L = {w.L:.0f} µm, Rmax = {w.Rmax:.1f} µm, {vertices} vértices, somas dentro {dentro}/{len(pos)}")

    if "blend" in opt:
        bpy.ops.wm.save_as_mainfile(filepath=opt["blend"])
    if "out" in opt:
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = cuerpo
        bpy.ops.export_scene.gltf(filepath=opt["out"], export_format="GLB", use_selection=True, export_yup=True,
                                  export_apply=True, export_normals=False, export_materials="NONE", export_extras=True)
        print(f"glb: {opt['out']}")
    if "preview" in opt:
        carpeta = Path(opt["preview"])
        carpeta.mkdir(parents=True, exist_ok=True)
        vistas(objs, carpeta, w)


if __name__ == "__main__":
    main()

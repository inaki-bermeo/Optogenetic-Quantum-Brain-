"""Measurement vs. coherence in the spike cascade (offline analysis; not uploaded to Qollab).

    python tools/zeno_analysis.py                 # τ table for AVM (the one on the project page)
    python tools/zeno_analysis.py --centro ALML --taus 2 4 8

Reproduces the numbers quoted in the docs (docs/cascade.md §2):
  * cascade statistics: share of steps where the spike stays on the centre, and distinct neurons
    visited, over many simulated cascades (exact walk in each 10-neuron window, no shot noise);
  * `comparacion`: survival at the origin and mean distance for the coherent walk, the walk measured
    every τ, the 10-qubit window cascade and a classical random walk.
"""

from __future__ import annotations

import argparse
import os
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "backend"))
os.chdir(REPO / "backend")  # the core opens "data/..." relative to backend/ (the project root in Qollab)

from cerebro_q import cascada, fisica  # noqa: E402


@lru_cache(maxsize=1)
def diagonalizacion():
    return np.linalg.eigh(fisica.acoplamientos()[0])


@lru_cache(maxsize=None)
def _salto(centro: int, tau: float, gamma: float):
    """(ventana, P(spike en cada neurona de la ventana)) tras un paso de duración τ desde `centro`."""
    w, _, Js = cascada.preparar_paso(centro)
    p = fisica.probabilidades_walk(np.linalg.eigh(Js), 0, np.array([tau]), np.pi, gamma)[0]
    return w, p / p.sum()


@lru_cache(maxsize=1)
def distancias() -> np.ndarray:
    """Distance in synapses between every pair of neurons (BFS on the graph)."""
    J, _, _ = fisica.acoplamientos()
    n = len(J)
    vecinos = [np.nonzero(J[i])[0] for i in range(n)]
    D = np.full((n, n), np.inf)
    for s in range(n):
        D[s, s] = 0
        frente = [s]
        while frente:
            nuevo = []
            for u in frente:
                for v in vecinos[u]:
                    if D[s, v] == np.inf:
                        D[s, v] = D[s, u] + 1
                        nuevo.append(v)
            frente = nuevo
    return D


def estadisticas_cascada(centro: int, tau: float, pasos: int = 20, cascadas: int = 200, gamma: float = 1.0,
                         semilla: int = 7) -> dict:
    """Share of steps where the spike stays on the centre and median of distinct neurons visited."""
    rng = np.random.default_rng(semilla)
    quietos, distintas = 0, []
    for _ in range(cascadas):
        c, visitadas = centro, {centro}
        for _ in range(pasos):
            w, p = _salto(c, tau, gamma)
            nuevo = w[int(rng.choice(len(w), p=p))]
            quietos += nuevo == c
            c = nuevo
            visitadas.add(c)
        distintas.append(len(visitadas))
    return {"se_queda": quietos / (cascadas * pasos), "distintas_mediana": float(np.median(distintas))}


def comparacion(centro: int, tau: float, pasos: int, gamma: float = 1.0, trayectorias: int = 300,
                semilla: int = 7) -> dict:
    """Survival at the origin and mean distance to it (in synapses) at t = kτ, for:
      coherente : quantum walk without measurement (exact, full network);
      medido    : walk measured every τ on the full network = exact Markov chain with
                  T_ij = |[e^{-iγJτ}]_ij|^2 (the infinite-window limit);
      ventanas  : the 10-qubit cascade (numpy, `trayectorias` runs);
      clasico   : classical random walk dp/dt = -γ L p.
    """
    J, _, _ = fisica.acoplamientos()
    lam, V = diagonalizacion()
    D = distancias()
    d = np.where(np.isfinite(D[centro]), D[centro], 0.0)
    tiempos = tau * np.arange(pasos + 1)

    coh = fisica.probabilidades_walk((lam, V), centro, tiempos, np.pi, gamma)
    U = (V * np.exp(-1j * gamma * lam * tau)) @ V.T
    T = np.abs(U) ** 2  # T[k, j] = P(j → k) in one measured step
    med = [np.eye(len(J))[centro]]
    for _ in range(pasos):
        med.append(T @ med[-1])
    med = np.array(med)
    L = np.diag(J.sum(1)) - J
    mu, W = np.linalg.eigh(L)
    cla = np.array([(W * np.exp(-gamma * mu * t)) @ W[centro] for t in tiempos])

    rng = np.random.default_rng(semilla)
    ocupacion = np.zeros((pasos + 1, len(J)))
    for _ in range(trayectorias):
        c = centro
        ocupacion[0, c] += 1
        for k in range(1, pasos + 1):
            w, p = _salto(c, tau, gamma)
            c = w[int(rng.choice(len(w), p=p))]
            ocupacion[k, c] += 1
    ven = ocupacion / trayectorias

    def resumen(P):
        P = P / np.maximum(P.sum(axis=1, keepdims=True), 1e-15)
        return {"origen": P[:, centro], "distancia": P @ d}

    return {"tiempos": tiempos, "tau": tau, "curvas": {
        "coherente": resumen(coh), "medido": resumen(med), "ventanas": resumen(ven), "clasico": resumen(cla)}}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--centro", default="AVM")
    ap.add_argument("--taus", type=float, nargs="+", default=[3, 5, 8])
    a = ap.parse_args()
    c = fisica.indice(a.centro)
    print(f"Cascades from {a.centro}: 200 cascades × 20 steps (exact walk in each window)")
    print("τ     stays on centre   distinct neurons visited (median)")
    for tau in a.taus:
        e = estadisticas_cascada(c, tau)
        print(f"{tau:<5g} {e['se_queda']:>8.0%}          {e['distintas_mediana']:g}")


if __name__ == "__main__":
    main()

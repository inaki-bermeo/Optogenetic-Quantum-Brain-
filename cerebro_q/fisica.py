"""Física exacta (docs/theory.md §2–§4).

    J = W / λ_max(W),   W_ij = 1 si hay al menos una sinapsis (química en cualquier sentido o gap), 0 si no
    (pesos binarios: decisión del equipo; todas las conexiones pesan lo mismo)
    H = γ Σ_{i<j} J_ij (X_i X_j + Y_i Y_j)/2        (modelo XY)
    Sector de una excitación:  H = γ J   ⇒  quantum walk
    Láser RX(θ) en la neurona j:  P_k(t) = sin²(θ/2) |[e^{-iγJt}]_kj|²
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np

from . import datos


@lru_cache(maxsize=1)
def acoplamientos() -> tuple[np.ndarray, list[str], float]:
    """(J normalizada, nombres, λ_max(W))."""
    nombres = [d["name"] for d in datos.neuronas()]
    W = (datos.conteo_sinapsis() > 0).astype(float)  # binario: todas las sinapsis pesan igual
    np.fill_diagonal(W, 0.0)
    escala = float(np.max(np.abs(np.linalg.eigvalsh(W))))
    return W / escala, nombres, escala


@lru_cache(maxsize=1)
def _indices() -> dict[str, int]:
    return {n: i for i, n in enumerate(acoplamientos()[1])}


def indice(nombre: str) -> int:
    nombre = datos.normalizar_nombre(nombre)
    try:
        return _indices()[nombre]
    except KeyError:
        raise ValueError(f"Unknown neuron: {nombre}") from None


def probabilidades_walk(eig, fuente: int, tiempos: np.ndarray, theta: float, gamma: float) -> np.ndarray:
    """P_k(t) para todas las neuronas, a partir de eig = np.linalg.eigh(J). Forma (T, N)."""
    lam, V = eig
    fases = np.exp(-1j * gamma * np.outer(tiempos, lam))
    amp = (fases * V[fuente, :]) @ V.T
    return np.sin(theta / 2) ** 2 * np.abs(amp) ** 2

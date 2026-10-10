"""Exact references for the tests (only used here, never shipped to Qollab).

`distribucion_exacta` evolves the full 2^n Hilbert space of a small circuit, independently of the
walk formula and of the Trotter circuit, so the tests can check both against it.
"""

from __future__ import annotations

import numpy as np

from cerebro_q import fisica


def sub_J(nombres: list[str]) -> np.ndarray:
    J, _, _ = fisica.acoplamientos()
    idx = [fisica.indice(n) for n in nombres]
    return J[np.ix_(idx, idx)].copy()


def hamiltoniano_xy(J: np.ndarray, gamma: float) -> np.ndarray:
    """H = γ Σ_{i<j} J_ij (σ⁺_i σ⁻_j + σ⁻_i σ⁺_j) as a dense 2^n × 2^n matrix (qubit 0 = LSB)."""
    n = len(J)
    base = np.arange(1 << n)
    H = np.zeros((1 << n, 1 << n))
    for i in range(n):
        for j in range(i + 1, n):
            if J[i, j] == 0:
                continue
            distinto = ((base >> i) & 1) != ((base >> j) & 1)
            src = base[distinto]
            H[src ^ ((1 << i) | (1 << j)), src] += gamma * J[i, j]
    return H


def distribucion_exacta(J: np.ndarray, fuente: int, theta: float, t: float, gamma: float) -> np.ndarray:
    """|⟨x| e^{-iHt} RX(θ)_fuente |0…0⟩|² over the 2^n basis states."""
    n = len(J)
    psi = np.zeros(1 << n, dtype=complex)
    psi[0] = np.cos(theta / 2)
    psi[1 << fuente] = -1j * np.sin(theta / 2)
    lam, V = np.linalg.eigh(hamiltoniano_xy(J, gamma))
    return np.abs(V @ (np.exp(-1j * lam * t) * (V.conj().T @ psi))) ** 2


def tvd(p, q) -> float:
    return 0.5 * float(np.abs(np.asarray(p) - np.asarray(q)).sum())

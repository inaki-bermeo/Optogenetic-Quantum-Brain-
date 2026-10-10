"""Post-selección por simetría (docs/theory.md §5 y §8).

El hamiltoniano XY conserva el número de excitaciones: con un láser ningún disparo ideal
tiene más de un bit en 1. Los que sí los tienen son errores y se descartan.
"""

from __future__ import annotations

import numpy as np


def marginales(probs: np.ndarray, n: int) -> list[float]:
    """P(bit q = 1) para cada qubit (qubit 0 = bit menos significativo, igual que Qiskit)."""
    idx = np.arange(1 << n)
    return [float(probs[((idx >> q) & 1) == 1].sum()) for q in range(n)]


def contar_spikes(conteos: dict) -> tuple[dict[int, int], int, int]:
    """Conteos de Qiskit ('0101': 37, …; el qubit 0 es el carácter de la derecha) →
    (shots con exactamente un 1 por qubit, shots sin ningún 1, total de shots).

    Los shots con dos o más excitaciones son errores: se descartan (post-selección).
    """
    validos: dict[int, int] = {}
    vacios = total = 0
    for clave, v in conteos.items():
        x, v = int(str(clave).replace(" ", ""), 2), int(v)
        total += v
        unos = x.bit_count()
        if unos == 1:
            q = x.bit_length() - 1
            validos[q] = validos.get(q, 0) + v
        elif unos == 0:
            vacios += v
    return validos, vacios, total

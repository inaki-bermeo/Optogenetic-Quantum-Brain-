"""Circuitos del walk: lista de operaciones → Qiskit, más un simulador numpy de control.

Operaciones (todas compuertas estándar de Qiskit):
    ("rx",  q,    θ)   láser optogenético            RX(θ)  = exp(-iθX/2)
    ("rxx", a, b, α)   mitad XX de un salto           RXX(α) = exp(-iα XX/2)
    ("ryy", a, b, α)   mitad YY de un salto           RYY(α) = exp(-iα YY/2)

Un salto de excitación entre las neuronas a y b durante δt es
    exp(-i γ J_ab δt (XX+YY)/2) = RXX(α)·RYY(α),   α = γ J_ab δt   (XX y YY conmutan).

En IonQ Forte cada RXX/RYY se compila a una compuerta ZZ nativa más rotaciones de un
qubit (la conectividad es total: no hay SWAPs). En los simuladores con ruido de IBM
el transpilador agrega SWAPs por la topología de vecinos cercanos.
"""

from __future__ import annotations

import numpy as np


def aristas(J: np.ndarray) -> list[tuple[int, int, float]]:
    n = len(J)
    return [(i, j, float(J[i, j])) for i in range(n) for j in range(i + 1, n) if J[i, j] > 0]


def _fusionar(saltos: list[tuple[int, int, float]]) -> list[tuple[int, int, float]]:
    """Fusiona saltos consecutivos sobre el mismo par (las mitades de Strang en el borde de cada paso)."""
    out: list[tuple[int, int, float]] = []
    for a, b, ang in saltos:
        if out and {out[-1][0], out[-1][1]} == {a, b}:
            pa, pb, pang = out.pop()
            out.append((pa, pb, pang + ang))
        else:
            out.append((a, b, ang))
    return out


def saltos_trotter(J: np.ndarray, t: float, pasos: int, gamma: float = 1.0) -> list[tuple[int, int, float]]:
    """Saltos (a, b, α) de la fórmula de Trotter–Suzuki de 2º orden (Strang)."""
    E = aristas(J)
    if t == 0 or not E:
        return []
    mitad = t / pasos / 2
    saltos = []
    for _ in range(pasos):
        saltos += [(i, j, gamma * w * mitad) for i, j, w in E]
        saltos += [(i, j, gamma * w * mitad) for i, j, w in reversed(E)]
    return _fusionar(saltos)


def operaciones(n: int, fuentes: list[int], theta: float, saltos) -> list[tuple]:
    ops: list[tuple] = [("rx", q, theta) for q in fuentes]
    for a, b, alfa in saltos:
        ops += [("rxx", a, b, alfa), ("ryy", a, b, alfa)]
    return ops


def contar_ops(qc) -> dict[str, int]:
    """count_ops() de un QuantumCircuit como dict JSON ({} si el objeto no lo permite)."""
    try:
        return {str(k): int(v) for k, v in qc.count_ops().items()}
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# Qiskit
# ---------------------------------------------------------------------------
def a_qiskit(ops: list[tuple], n: int, nombre: str = "walk", medir: bool = True):
    from qiskit import QuantumCircuit

    qc = QuantumCircuit(n, n if medir else 0, name=nombre)
    for op in ops:
        if op[0] == "rx":
            qc.rx(op[2], op[1])
        elif op[0] == "rxx":
            qc.rxx(op[3], op[1], op[2])
        elif op[0] == "ryy":
            qc.ryy(op[3], op[1], op[2])
    if medir:
        qc.measure(list(range(n)), list(range(n)))
    return qc


# ---------------------------------------------------------------------------
# Simulador numpy de control (mismas convenciones que Qiskit: qubit 0 = bit menos significativo)
# ---------------------------------------------------------------------------
_I = np.eye(2, dtype=complex)
_X = np.array([[0, 1], [1, 0]], dtype=complex)
_Y = np.array([[0, -1j], [1j, 0]], dtype=complex)
_XX = np.kron(_X, _X)
_YY = np.kron(_Y, _Y)


def _matriz(op) -> np.ndarray:
    if op[0] == "rx":
        a = op[2] / 2
        return np.cos(a) * _I - 1j * np.sin(a) * _X
    a = op[3] / 2
    return np.cos(a) * np.eye(4) - 1j * np.sin(a) * (_XX if op[0] == "rxx" else _YY)


def _aplicar_1q(psi, U, q):
    t = psi.reshape(-1, 2, 1 << q)
    return np.einsum("ij,ajb->aib", U, t).reshape(-1)


def _aplicar_2q(psi, n, U, a, b):
    hi, lo = (a, b) if a > b else (b, a)
    t = psi.reshape(1 << (n - 1 - hi), 2, 1 << (hi - 1 - lo), 2, 1 << lo)
    U4 = U.reshape(2, 2, 2, 2)
    out = np.einsum("xyuv,AuMvL->AxMyL", U4, t) if a > b else np.einsum("xyuv,AvMuL->AyMxL", U4, t)
    return out.reshape(-1)


def probabilidades_ideales(ops: list[tuple], n: int) -> np.ndarray:
    psi = np.zeros(1 << n, dtype=complex)
    psi[0] = 1.0
    for op in ops:
        U = _matriz(op)
        psi = _aplicar_1q(psi, U, op[1]) if op[0] == "rx" else _aplicar_2q(psi, n, U, op[1], op[2])
    return np.abs(psi) ** 2

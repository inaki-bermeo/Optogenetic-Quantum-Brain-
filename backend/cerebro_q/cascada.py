"""Cascada cuántica de spikes: quantum walk por ventanas (docs/cascade.md).

Cada paso:
    1. ventana = neurona central + sus 9 vecinas con más sinapsis (10 qubits);
    2. circuito Qiskit: X (o RX(θ) en el primer paso) en el centro y evolución XY durante τ,
       e^{-iτH},  H = γ Σ J_ij (X_i X_j + Y_i Y_j)/2  restringido a la ventana;
    3. un job en el backend elegido, medición de los 10 qubits;
    4. el spike = la neurona en 1 de un shot válido (exactamente un 1) elegido al azar;
       esa neurona es el centro del paso siguiente.

Al medir, el estado colapsa: la interferencia vive dentro de cada paso, no entre pasos.
La comparación coherente / medido / clásico está en tools/zeno_analysis.py.
"""

from __future__ import annotations

import random
from functools import lru_cache

import numpy as np

from . import analisis, circuitos, datos, fisica

TAMANO_VENTANA = 10


# ---------------------------------------------------------------------------
# Ventana
# ---------------------------------------------------------------------------
@lru_cache(maxsize=512)
def _ventana(centro: int, k: int) -> tuple[int, ...]:
    J, _, _ = fisica.acoplamientos()
    cnt = datos.conteo_sinapsis()
    vecinas = [int(j) for j in np.nonzero(J[centro])[0]]
    vecinas.sort(key=lambda j: (-cnt[centro, j], j))
    elegidas = vecinas[: k - 1]
    if len(elegidas) < k - 1:  # completar con neuronas a distancia 2
        candidatas: dict[int, float] = {}
        for v in elegidas:
            for j in np.nonzero(J[v])[0]:
                j = int(j)
                if j != centro and j not in elegidas:
                    candidatas[j] = candidatas.get(j, 0.0) + cnt[v, j]
        extra = sorted(candidatas, key=lambda j: (-candidatas[j], j))
        elegidas += extra[: k - 1 - len(elegidas)]
    return (int(centro), *elegidas)


def ventana(centro: int, k: int = TAMANO_VENTANA) -> list[int]:
    """[centro] + vecinas directas ordenadas por número de sinapsis; si faltan, a 2 sinapsis.

    Con pesos binarios todas las conexiones valen lo mismo en J, así que el orden usa el
    número de sinapsis de los datos (desempate por índice, para que sea determinista).
    """
    return list(_ventana(int(centro), k))


def preparar_paso(centro: int) -> tuple[list[int], list[str], np.ndarray]:
    """(índices de la ventana, nombres, J restringida a la ventana)."""
    J, nombres_red, _ = fisica.acoplamientos()
    w = ventana(centro)
    return w, [nombres_red[i] for i in w], J[np.ix_(w, w)]


# ---------------------------------------------------------------------------
# Circuito de un paso
# ---------------------------------------------------------------------------
def operaciones_paso(Js: np.ndarray, theta: float, tau: float, gamma: float, pasos: int) -> list[tuple]:
    """Lista de operaciones (control numpy): láser en el qubit 0 + Trotter-Suzuki de 2º orden."""
    return circuitos.operaciones(len(Js), [0], theta, circuitos.saltos_trotter(Js, tau, pasos, gamma))


def circuito_paso(Js: np.ndarray, theta: float, tau: float, gamma: float, pasos: int, nombre: str = "paso"):
    """Circuito Qiskit del paso. Usa PauliEvolutionGate + SuzukiTrotter (simulación hamiltoniana
    nativa de Qiskit); si esa API no existe (pruebas sin Qiskit real), usa RXX/RYY equivalentes.

    Devuelve (circuito, "pauli_evolution" | "rxx_ryy").
    """
    n = len(Js)
    try:
        from qiskit import QuantumCircuit
        from qiskit.circuit.library import PauliEvolutionGate
        from qiskit.quantum_info import SparsePauliOp
        from qiskit.synthesis import SuzukiTrotter
    except ImportError:
        ops = operaciones_paso(Js, theta, tau, gamma, pasos)
        return circuitos.a_qiskit(ops, n, nombre=nombre, medir=True), "rxx_ryy"

    terminos = []
    for a, b, w in circuitos.aristas(Js):
        c = gamma * w / 2.0  # H = γ Σ J (XX + YY)/2
        terminos += [("XX", [a, b], c), ("YY", [a, b], c)]
    qc = QuantumCircuit(n, n, name=nombre)
    if abs(theta - np.pi) < 1e-12:
        qc.x(0)  # spike medido: la neurona central está excitada con certeza
    else:
        qc.rx(theta, 0)
    if terminos and tau > 0:
        H = SparsePauliOp.from_sparse_list(terminos, num_qubits=n)
        evol = PauliEvolutionGate(H, time=tau, synthesis=SuzukiTrotter(order=2, reps=pasos),
                                  label=rf"$e^{{-i\tau H_{{XY}}}}$  τ={tau:g}")
        qc.append(evol, range(n))
    qc.measure(range(n), range(n))
    return qc, "pauli_evolution"


@lru_cache(maxsize=64)
def circuito_de(centro: int, theta: float, tau: float, gamma: float, pasos: int):
    """(circuito, método, ventana, nombres, Js) de un paso. Cacheado: el spike suele repetir centro,
    y el panel 2 pide el mismo circuito que acaba de correr. No modificar el circuito devuelto."""
    w, nombres, Js = preparar_paso(centro)
    qc, metodo = circuito_paso(Js, theta, tau, gamma, max(pasos, 1), nombre=f"paso-{nombres[0]}")
    return qc, metodo, w, nombres, Js


@lru_cache(maxsize=64)
def _transpilado(backend, centro: int, theta: float, tau: float, gamma: float, pasos: int):
    qc = circuito_de(centro, theta, tau, gamma, pasos)[0]
    try:
        from qiskit import transpile

        return transpile(qc, backend, optimization_level=1)
    except Exception:  # sin transpile (imitación local): se envía tal cual
        return qc


def ejecutar_paso(backend, centro: int, theta: float, tau: float, gamma: float, shots: int,
                  pasos: int = 1, semilla: int | None = None) -> dict:
    """Un paso de la cascada: UN job en el backend. Devuelve todo lo que dibuja la página."""
    qc, _, w, nombres, Js = circuito_de(centro, theta, tau, gamma, pasos)
    try:
        enviar = _transpilado(backend, centro, theta, tau, gamma, pasos)
    except TypeError:  # backend no hasheable: sin caché
        enviar = _transpilado.__wrapped__(backend, centro, theta, tau, gamma, pasos)
    n = len(w)
    conteos = backend.run(enviar, shots=int(shots)).result().get_counts()
    if isinstance(conteos, list):
        conteos = conteos[0]

    # Shots válidos = como mucho una excitación (la dinámica no crea excitaciones: los demás son
    # errores y se descartan, post-selección). Con una excitación, el bit en 1 es el spike; sin
    # excitación ("vacío") la neurona no disparó: pasa si θ < π en el primer paso, o por ruido.
    validos, vacios, total = analisis.contar_spikes(conteos)
    total_validos = sum(validos.values())
    total = total or 1

    spike, motivo_fin = None, None
    if total_validos + vacios:
        r = random.Random(semilla).randrange(total_validos + vacios)  # un shot post-seleccionado al azar
        for q in sorted(validos):
            r -= validos[q]
            if r < 0:
                spike = q
                break
        if spike is None:
            motivo_fin = "vacio"
    else:
        motivo_fin = "sin_shots_validos"

    # Teoría para comparar: walk exacto en la ventana aislada (normalizado a "hubo spike")
    teoria = fisica.probabilidades_walk(np.linalg.eigh(Js), 0, np.array([tau]), theta, gamma)[0]
    return {
        "centro": nombres[0],
        "ventana": nombres,
        "ventana_indices": w,
        "medida": [validos.get(q, 0) / max(total_validos, 1) for q in range(n)],  # P(spike en q | hubo spike)
        "teoria_ventana": teoria / max(teoria.sum(), 1e-12),
        "fraccion_valida": (total_validos + vacios) / total,
        "fraccion_vacio": vacios / total,
        "motivo_fin": motivo_fin,
        "spike": nombres[spike] if spike is not None else None,
        "spike_indice": int(w[spike]) if spike is not None else None,
        "shots": int(total),
        "ops_escritas": circuitos.contar_ops(qc),
        "ops_transpilado": circuitos.contar_ops(enviar),
        "conteos": {str(k): int(v) for k, v in conteos.items()},
    }

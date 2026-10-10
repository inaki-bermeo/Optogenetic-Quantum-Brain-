"""Funciones que llama main.js (con .callPromising). Todas devuelven texto JSON.

Devolver JSON evita depender de la conversión de proxies de Pyodide (dict → Map):
en JavaScript basta con JSON.parse(resultado).
"""

from __future__ import annotations

import json
import math

import numpy as np

from . import analisis, cascada, circuitos, datos, fisica, visual


def _json(obj) -> str:
    def limpiar(o):
        if isinstance(o, dict):
            return {str(k): limpiar(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [limpiar(v) for v in o]
        if isinstance(o, np.ndarray):
            return limpiar(o.tolist())
        if isinstance(o, (np.floating, float)):
            v = float(o)
            return None if math.isnan(v) or math.isinf(v) else round(v, 6)
        if isinstance(o, np.integer):
            return int(o)
        return o

    return json.dumps(limpiar(obj), ensure_ascii=False, separators=(",", ":"))


def _paso(p: dict) -> tuple[int, float, float, float, int]:
    """(centro, θ, τ, γ, pasos de Trotter) de los parámetros de un paso de la cascada."""
    return (fisica.indice(p.get("centro", "AVM")), float(p.get("theta", math.pi)), float(p.get("tau", 8.0)),
            float(p.get("gamma", 1.0)), max(int(p.get("pasos_trotter", 1)), 1))


def _nombre_backend(backend) -> str:
    nombre = getattr(backend, "name", None)
    if callable(nombre):
        nombre = nombre()
    return str(nombre or backend)


# ---------------------------------------------------------------------------
# Arranque
# ---------------------------------------------------------------------------
def conectoma_json(max_aristas: int = 1200) -> str:
    """Neuronas y las `max_aristas` conexiones con más sinapsis (para dibujar)."""
    J, _, escala = fisica.acoplamientos()
    grado = (J > 0).sum(axis=1)
    iu, ju = np.triu_indices(len(J), 1)
    w = J[iu, ju]
    conectadas = np.nonzero(w > 0)[0]
    # J es binaria (todas las conexiones pesan igual): se dibujan las de más sinapsis reales
    sinapsis = datos.conteo_sinapsis()[iu[conectadas], ju[conectadas]]
    orden = conectadas[np.argsort(-sinapsis, kind="stable")[: int(max_aristas)]]
    return _json({
        "neurons": [{"name": d["name"], "x": d["x"], "y": d["y"], "z": d["z"], "type": d["type"],
                     "neurotransmitters": d.get("neurotransmitters", []), "degree": int(g)}
                    for d, g in zip(datos.neuronas(), grado)],
        "edges": [[int(iu[k]), int(ju[k]), float(w[k])] for k in orden],
        "spectral_scale": escala,
    })


def cuerpo_glb() -> str:
    """Modelo 3D en base64 ("" si falta: la página dibuja entonces un cuerpo procedural)."""
    try:
        return datos.cuerpo_glb_base64()
    except OSError:
        return ""


def backend_json(backend) -> str:
    """Nombre del backend elegido en Qollab y si es de IonQ (un solo job por ejecución)."""
    nombre = _nombre_backend(backend)
    origen = f"{nombre} {type(backend).__module__} {type(backend).__name__}".lower()
    ionq = "ionq" in origen
    try:
        qubits = int(getattr(backend, "num_qubits", 0) or 0)
    except Exception:
        qubits = 0
    return _json({"nombre": nombre, "ionq": ionq, "hardware": ionq and "qpu" in nombre.lower(),
                  "qubits": qubits})


# ---------------------------------------------------------------------------
# Cascada cuántica de spikes (quantum walk por ventanas)
# ---------------------------------------------------------------------------
def paso_json(backend, params_json: str) -> str:
    """Un paso de la cascada = UN circuito de 10 qubits en UN job del backend elegido."""
    p = json.loads(params_json or "{}")
    centro, theta, tau, gamma, pasos = _paso(p)
    out = cascada.ejecutar_paso(backend, centro, theta=theta, tau=tau, gamma=gamma,
                                shots=int(p.get("shots", 200)), pasos=pasos, semilla=p.get("semilla"))
    out["backend"] = _nombre_backend(backend)
    return _json(out)


# ---------------------------------------------------------------------------
# Circuito de un paso como lista de instrucciones (para dibujarlo al instante en JS)
# ---------------------------------------------------------------------------
def _num(x):
    try:
        return float(x)
    except Exception:
        return None


def _instrucciones(qc) -> list[dict]:
    """Instrucciones del QuantumCircuit: nombre, qubits, parámetros y etiqueta.

    Con Qiskit real se leen de `qc.data` (CircuitInstruction); la imitación local guarda tuplas.
    """
    out = []
    for ins in qc.data:
        if isinstance(ins, tuple):  # imitación local: ("rx", q, θ) o ("rxx", a, b, α)
            qs = list(ins[1:2]) if ins[0] == "rx" else list(ins[1:3])
            out.append({"n": ins[0], "q": [int(q) for q in qs], "p": [_num(ins[-1])], "l": None})
            continue
        op = ins.operation
        try:
            qs = [qc.find_bit(q).index for q in ins.qubits]
        except Exception:
            qs = [qc.qubits.index(q) for q in ins.qubits]
        out.append({"n": op.name, "q": qs, "p": [_num(x) for x in getattr(op, "params", [])],
                    "l": getattr(op, "label", None)})
    if getattr(qc, "medido", False) and not any(i["n"] == "measure" for i in out):
        out += [{"n": "measure", "q": [q], "p": [], "l": None} for q in range(qc.num_qubits)]
    return out


def _resumen(instr: list[dict]) -> dict:
    ops: dict[str, int] = {}
    nivel = [0] * 64
    for i in instr:
        ops[i["n"]] = ops.get(i["n"], 0) + 1
        if i["n"] == "barrier":
            continue
        d = max(nivel[q] for q in i["q"]) + 1
        for q in i["q"]:
            nivel[q] = d
    return {"ops": ops, "profundidad": max(nivel)}


def _expandir(qc):
    """La síntesis de PauliEvolutionGate → RXX / RYY (hasta 3 niveles de decompose)."""
    for _ in range(3):
        if not any(getattr(i.operation, "name", "") == "PauliEvolution" for i in qc.data):
            break
        qc = qc.decompose(gates_to_decompose=["PauliEvolution"])
    return qc


def circuito_json(params_json: str) -> str:
    """El circuito Qiskit de un paso de la cascada, SIN ejecutarlo y sin matplotlib (rápido).

    Devuelve las dos vistas: "compacta" (la PauliEvolutionGate como una caja) y "completa"
    (su síntesis Suzuki-Trotter en compuertas RXX/RYY), más la distribución ideal del circuito.
    """
    centro, theta, tau, gamma, pasos = _paso(json.loads(params_json or "{}"))
    qc, metodo, w, nombres, Js = cascada.circuito_de(centro, theta, tau, gamma, pasos)
    n = len(w)
    if metodo == "pauli_evolution":
        compacta = _instrucciones(qc)
        completa = _instrucciones(_expandir(qc))
    else:  # sin PauliEvolutionGate (imitación local): la caja compacta se arma aquí
        completa = _instrucciones(qc)
        compacta = [completa[0], {"n": "PauliEvolution", "q": list(range(n)), "p": [tau], "l": None}] + \
            [i for i in completa if i["n"] == "measure"]
    ideal = circuitos.probabilidades_ideales(cascada.operaciones_paso(Js, theta, tau, gamma, pasos), n)
    return _json({
        "centro": nombres[0], "neuronas": nombres, "ventana_indices": w, "metodo": metodo,
        "theta": theta, "tau": tau, "gamma": gamma, "pasos_trotter": pasos,
        "compacta": {"instrucciones": compacta, **_resumen(compacta)},
        "completa": {"instrucciones": completa, **_resumen(completa)},
        "ideal_marginales": analisis.marginales(ideal, n),
        "ideal_vacio": float(ideal[0]),
    })


# ---------------------------------------------------------------------------
# Figuras de Qiskit (matplotlib)
# ---------------------------------------------------------------------------
def precargar_figuras() -> str:
    """Carga matplotlib y la visualización de Qiskit por adelantado (la 1ª figura tarda ~30 s)."""
    try:
        visual._matplotlib()
        from qiskit.visualization import plot_histogram  # noqa: F401
        return _json({"ok": True})
    except Exception as e:  # sin matplotlib: la página sigue con el dibujo instantáneo
        return _json({"ok": False, "error": str(e)})


def figuras_json(params_json: str) -> str:
    """Un paso de la cascada dibujado con draw("mpl") + histograma (conteos medidos o distribución ideal).

    vista "compacta" (PauliEvolutionGate como una caja) o "expandida" (la síntesis de Suzuki-Trotter
    en RXX/RYY); "conteos" (opcional) son los conteos que devolvió el backend.
    """
    p = json.loads(params_json or "{}")
    centro, theta, tau, gamma, pasos = _paso(p)
    qc, _, _, nombres, _ = cascada.circuito_de(centro, theta, tau, gamma, pasos)
    dibujo = qc.decompose(gates_to_decompose=["PauliEvolution"]) if p.get("vista") == "expandida" else qc
    out = {
        "neuronas": nombres,
        "ops": circuitos.contar_ops(dibujo),
        "profundidad": int(dibujo.depth()),
        "circuito_svg": visual.circuito(dibujo, nombres),
    }
    conteos = p.get("conteos") or None
    if conteos:
        out["histograma_svg"] = visual.histograma(conteos, nombres, "Counts measured on the backend")
        out["histograma_tipo"] = "medido"
    else:
        out["histograma_svg"] = visual.distribucion_ideal(qc, nombres, "Ideal distribution (Statevector)")
        out["histograma_tipo"] = "ideal"
    return _json(out)

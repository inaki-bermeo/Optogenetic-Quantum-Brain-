"""Pruebas del núcleo Python (con Qiskit real si está instalado; si no, con la imitación de tools/qollab_shim/).

    python -m unittest discover -s tests/backend      (desde la raíz del repo)
"""

import json
import math
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BACKEND = REPO / "backend"
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(REPO / "tools"))
try:
    import qiskit  # noqa: F401
    REAL = not getattr(qiskit, "SIMULADO", False)
except ImportError:
    sys.path.insert(0, str(REPO / "tools" / "qollab_shim" / "qiskit_simulado"))
    REAL = False

import os

os.chdir(BACKEND)  # las rutas de datos ("data/...") son relativas a backend/, igual que a la raíz en Qollab

import numpy as np

from cerebro_q import analisis, api, cascada, circuitos, fisica

sys.path.insert(0, str(Path(__file__).resolve().parent))
import referencia  # noqa: E402


def backend_de_prueba():
    if REAL:
        from qiskit.providers.basic_provider import BasicSimulator
        return BasicSimulator()
    from qiskit import BackendSimulado
    return BackendSimulado()


TOQUE = ["AVM", "ALML", "AVDL", "AVAL", "PVCL", "PLML"]  # 6 neuronas del reflejo de toque


class TestFisica(unittest.TestCase):
    def test_normalizacion(self):
        J, nombres, _ = fisica.acoplamientos()
        self.assertEqual(len(nombres), 302)
        self.assertTrue(np.allclose(J, J.T))
        self.assertAlmostEqual(np.max(np.abs(np.linalg.eigvalsh(J))), 1.0, places=9)

    def test_walk_conserva_norma(self):
        J, _, _ = fisica.acoplamientos()
        P = fisica.probabilidades_walk(np.linalg.eigh(J), fisica.indice("AVM"), np.linspace(0, 40, 9), 1.2, 1.0)
        self.assertTrue(np.allclose(P.sum(axis=1), math.sin(0.6) ** 2, atol=1e-9))

    def test_xy_igual_a_walk(self):
        """Sector de una excitación del modelo XY (espacio completo 2^6) = quantum walk γJ."""
        J = referencia.sub_J(TOQUE)
        exacta = referencia.distribucion_exacta(J, 0, 2.0, 17.0, 1.0)
        walk = fisica.probabilidades_walk(np.linalg.eigh(J), 0, np.array([17.0]), 2.0, 1.0)[0]
        self.assertTrue(np.allclose(analisis.marginales(exacta, 6), walk, atol=1e-9))
        self.assertAlmostEqual(exacta[0], math.cos(1.0) ** 2, places=9)  # P(vacío) = cos²(θ/2)


class TestCircuitos(unittest.TestCase):
    def test_trotter_converge(self):
        J = referencia.sub_J(TOQUE)
        exacta = referencia.distribucion_exacta(J, 0, math.pi, 20.0, 1.0)
        errs = [referencia.tvd(exacta, circuitos.probabilidades_ideales(
            circuitos.operaciones(6, [0], math.pi, circuitos.saltos_trotter(J, 20.0, r)), 6)) for r in (2, 8)]
        self.assertLess(errs[1], errs[0])
        self.assertLess(errs[1], 0.02)

    def test_orden_de_bits_qiskit(self):
        # '010' en Qiskit = qubit 1 en 1; '011' tiene dos excitaciones (se descarta); '000' = vacío
        validos, vacios, total = analisis.contar_spikes({"010": 7, "0 1 1": 2, "000": 1})
        self.assertEqual((validos, vacios, total), ({1: 7}, 1, 10))
        p = np.zeros(8)
        p[2] = 1.0
        self.assertEqual(analisis.marginales(p, 3), [0.0, 1.0, 0.0])


class TestApiQollab(unittest.TestCase):
    def test_conectoma(self):
        c = json.loads(api.conectoma_json(1200))
        self.assertEqual(len(c["neurons"]), 302)
        self.assertEqual(len(c["edges"]), 1200)
        # se dibujan las conexiones con más sinapsis reales
        from cerebro_q import datos
        cnt = datos.conteo_sinapsis()
        dibujadas = [cnt[a, b] for a, b, _ in c["edges"]]
        self.assertGreaterEqual(min(dibujadas), np.sort(cnt[np.triu_indices(302, 1)])[::-1][1199])

    def test_cuerpo_glb(self):
        import base64
        self.assertEqual(base64.b64decode(api.cuerpo_glb())[:4], b"glTF")

    def test_backend_info(self):
        info = json.loads(api.backend_json(backend_de_prueba()))
        self.assertFalse(info["ionq"])

        class FalsoIonQ:
            name = "ionq_qpu.forte-1"
        info = json.loads(api.backend_json(FalsoIonQ()))
        self.assertTrue(info["ionq"] and info["hardware"])


class TestCascada(unittest.TestCase):
    """Quantum walk por ventanas (docs/cascade.md)."""

    def test_ventana(self):
        J, nombres, _ = fisica.acoplamientos()
        for nombre in ("AVM", "ASHL", "DA1"):
            c = fisica.indice(nombre)
            w = cascada.ventana(c)
            self.assertEqual(len(w), 10)
            self.assertEqual(w[0], c)
            self.assertEqual(len(set(w)), 10)
            self.assertEqual(w, cascada.ventana(c))  # determinista
            vecinas = set(np.nonzero(J[c])[0])
            for j in w[1:]:  # vecina directa, o a distancia 2 si faltan
                self.assertTrue(j in vecinas or any(J[v, j] > 0 for v in w[1:] if v in vecinas))

    def test_ventana_avm(self):
        """La ventana de AVM documentada en docs/cascade.md (orden por número de sinapsis)."""
        nombres = fisica.acoplamientos()[1]
        self.assertEqual([nombres[i] for i in cascada.ventana(fisica.indice("AVM"))],
                         ["AVM", "ALMR", "AVDL", "PVCR", "ALML", "PVR", "AVBL", "PVCL", "AVBR", "BDUR"])

    def test_circuito_paso_igual_a_teoria(self):
        _, _, Js = cascada.preparar_paso(fisica.indice("AVM"))
        exacta = referencia.distribucion_exacta(Js, 0, math.pi, 5.0, 1.0)
        ops = cascada.operaciones_paso(Js, math.pi, 5.0, 1.0, 2)
        self.assertLess(referencia.tvd(exacta, circuitos.probabilidades_ideales(ops, 10)), 0.01)
        qc, metodo = cascada.circuito_paso(Js, math.pi, 5.0, 1.0, 2)
        if REAL:  # Qiskit real: PauliEvolutionGate + SuzukiTrotter debe dar lo mismo
            from qiskit.quantum_info import Statevector
            self.assertEqual(metodo, "pauli_evolution")
            sv = Statevector.from_instruction(qc.remove_final_measurements(inplace=False))
            self.assertLess(referencia.tvd(exacta, sv.probabilities()), 0.01)

    def test_paso_en_backend(self):
        r = json.loads(api.paso_json(backend_de_prueba(), json.dumps(
            {"centro": "AVM", "tau": 5, "shots": 400, "pasos_trotter": 2, "semilla": 3})))
        self.assertEqual(r["centro"], "AVM")
        self.assertEqual(len(r["ventana"]), 10)
        self.assertIn(r["spike"], r["ventana"])
        self.assertAlmostEqual(sum(r["medida"]), 1.0, places=6)
        self.assertAlmostEqual(r["fraccion_valida"], 1.0, places=6)  # backend ideal
        self.assertLess(referencia.tvd(r["medida"], r["teoria_ventana"]), 0.15)

    def test_paso_sin_disparo(self):
        r = json.loads(api.paso_json(backend_de_prueba(), json.dumps(
            {"centro": "AVM", "tau": 5, "theta": 0.0, "shots": 50, "semilla": 1})))
        self.assertIsNone(r["spike"])
        self.assertEqual(r["motivo_fin"], "vacio")


class TestZeno(unittest.TestCase):
    """tools/zeno_analysis.py: los números de la tabla τ del Project Card."""

    def test_comparacion(self):
        import zeno_analysis
        cur = zeno_analysis.comparacion(fisica.indice("AVM"), tau=2, pasos=10, trayectorias=50)["curvas"]
        for k in ("coherente", "medido", "ventanas", "clasico"):
            self.assertEqual(len(cur[k]["origen"]), 11)
            self.assertAlmostEqual(cur[k]["origen"][0], 1.0, places=6)
        # Efecto Zeno: medido cada τ = 2 se queda más en el origen que el walk coherente
        self.assertGreater(cur["medido"]["origen"][5], cur["coherente"]["origen"][5])

    def test_tabla_tau(self):
        import zeno_analysis
        c = fisica.indice("AVM")
        quieto = [zeno_analysis.estadisticas_cascada(c, tau)["se_queda"] for tau in (3, 5, 8)]
        self.assertEqual([round(100 * q) for q in quieto], [93, 81, 60])


class TestCircuitoInstantaneo(unittest.TestCase):
    """circuito_json: el circuito del paso, sin ejecutarlo, para dibujarlo al instante en JS."""

    def test_vistas_y_ideal(self):
        p = {"centro": "AVM", "theta": math.pi / 2, "tau": 8, "pasos_trotter": 2}
        c = json.loads(api.circuito_json(json.dumps(p)))
        self.assertEqual(len(c["neuronas"]), cascada.TAMANO_VENTANA)
        self.assertEqual(c["neuronas"], [fisica.acoplamientos()[1][i] for i in cascada.ventana(fisica.indice("AVM"))])
        self.assertIn("PauliEvolution", c["compacta"]["ops"])
        self.assertIn("rxx", c["completa"]["ops"])
        self.assertNotIn("PauliEvolution", c["completa"]["ops"])
        self.assertEqual(c["completa"]["ops"]["measure"], 10)
        for i in c["completa"]["instrucciones"]:
            self.assertTrue(all(0 <= q < 10 for q in i["q"]))
        # el láser θ = π/2 deja la mitad de los shots sin excitación
        self.assertAlmostEqual(c["ideal_vacio"], 0.5, places=4)
        self.assertAlmostEqual(sum(c["ideal_marginales"]) + c["ideal_vacio"], 1.0, places=4)

    def test_mismo_circuito_que_el_paso(self):
        p = {"centro": "ALML", "tau": 5, "pasos_trotter": 1}
        c = json.loads(api.circuito_json(json.dumps(p)))
        r = json.loads(api.paso_json(backend_de_prueba(), json.dumps({**p, "shots": 50, "semilla": 1})))
        self.assertEqual(c["neuronas"], r["ventana"])
        self.assertEqual(c["compacta"]["ops"].get("measure"), r["ops_escritas"].get("measure"))


@unittest.skipUnless(REAL, "las figuras usan Qiskit real (draw('mpl'), plot_histogram)")
class TestFiguras(unittest.TestCase):
    SVG = "data:image/svg+xml;base64,"

    def test_paso_ideal(self):
        f = json.loads(api.figuras_json(json.dumps({"centro": "AVM", "tau": 5, "pasos_trotter": 1})))
        self.assertTrue(f["circuito_svg"].startswith(self.SVG))
        self.assertTrue(f["histograma_svg"].startswith(self.SVG))
        self.assertEqual(f["histograma_tipo"], "ideal")

    def test_paso_con_conteos(self):
        p = {"centro": "AVM", "tau": 5, "shots": 100, "pasos_trotter": 1, "semilla": 2}
        r = json.loads(api.paso_json(backend_de_prueba(), json.dumps(p)))
        self.assertEqual(sum(r["conteos"].values()), 100)
        for vista, nombre in (("compacta", "PauliEvolution"), ("expandida", "rxx")):
            f = json.loads(api.figuras_json(json.dumps({**p, "vista": vista, "conteos": r["conteos"]})))
            self.assertIn(nombre, f["ops"])
            self.assertEqual(f["histograma_tipo"], "medido")
            self.assertEqual(f["neuronas"], r["ventana"])

    def test_etiquetas_de_estado(self):
        from cerebro_q import visual
        self.assertEqual(visual.etiqueta_estado("000", ["A", "B", "C"]), "∅ (none)")
        self.assertEqual(visual.etiqueta_estado("101", ["A", "B", "C"]), "A+C")  # qubit 0 = derecha


class TestReglasQollab(unittest.TestCase):
    """Lo que exige el runtime de Qollab para un proyecto JS / Qiskit, sobre la carpeta que se sube
    (la arma tools/build_qollab.py)."""

    @classmethod
    def setUpClass(cls):
        import tempfile

        import build_qollab
        cls._tmp = tempfile.TemporaryDirectory()
        cls.RAIZ = Path(cls._tmp.name) / "qollab"
        cls._archivos = build_qollab.construir(cls.RAIZ)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def archivos(self):
        return self._archivos

    def test_limites(self):
        fs = self.archivos()
        self.assertLessEqual(len(fs), 100)
        for f in fs:
            self.assertLessEqual(f.stat().st_size, 2 * 1024 * 1024, f.name)

    def test_index_solo_cuerpo(self):
        import re
        html = (self.RAIZ / "index.html").read_text(encoding="utf-8").lower()
        # El workspace de Qollab guarda index.html con este envoltorio (sólo main.css y main.js);
        # fuera de él, nada de <script>, <link> ni <style> propios.
        envoltorio = re.match(r'\s*<head>\s*<link rel="stylesheet" href="main.css">\s*'
                              r'<script type="module" src="main.js"></script>\s*</head>\s*<body>', html)
        if envoltorio:
            html = html[envoltorio.end():].replace("</body>", "")
        for etiqueta in ("script", "html", "head", "body", "link", "style"):
            self.assertNotRegex(html, rf"<{etiqueta}[\s>]")
        self.assertIn("this effort is supported by qollab &amp; ionq.", html)

    def test_imports_de_js(self):
        import re
        for f in [self.RAIZ / "main.js", *(self.RAIZ / "js").glob("*.js")]:
            for spec in re.findall(r"from\s+[\"']([^\"']+)[\"']", f.read_text(encoding="utf-8")):
                ok = spec.startswith("./") or spec.startswith("../") or spec in ("three", "cerebro_q.api") \
                    or spec.startswith("three/addons/")
                self.assertTrue(ok, f"{f.name}: import no permitido en Qollab: {spec}")
            self.assertNotIn("localStorage", f.read_text(encoding="utf-8"), f.name)

    def test_rutas_literales_y_sin_secretos(self):
        from cerebro_q import datos
        for ruta in (datos.RUTA_NEURONAS, datos.RUTA_SINAPSIS, datos.RUTA_CUERPO):
            self.assertTrue((self.RAIZ / ruta).is_file(), ruta)
            self.assertIn(f'"{ruta}"', (self.RAIZ / "cerebro_q" / "datos.py").read_text(encoding="utf-8"))
        for f in self.archivos():
            if f.suffix in (".py", ".js", ".html", ".css", ".txt"):
                texto = f.read_text(encoding="utf-8")
                self.assertNotRegex(texto, r"(?i)(api[_-]?key|apikey)\s*[:=]\s*[\"'][A-Za-z0-9]{16,}", f.name)


if __name__ == "__main__":
    unittest.main()

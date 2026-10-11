// Puente con el núcleo Python (cerebro_q/api.py), que corre en Pyodide dentro de Qollab.
//
// Reglas de Qollab que se respetan aquí:
//   * las funciones Python se llaman con .callPromising (en backends de IonQ una llamada
//     directa falla con "XHR is not supported");
//   * cada función devuelve texto JSON, así no dependemos de cómo Pyodide convierte dict/list.
import * as api from "cerebro_q.api";

const texto = (r) => {
  if (typeof r === "string") return r;
  try { return r.toString(); } finally { r?.destroy?.(); }
};

/** Deja que el navegador pinte (p. ej. "Calculando…") antes de un cálculo largo en Python. */
export const respirar = () => new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));

// Las llamadas a Python van de a una (Pyodide no corre dos funciones a la vez). Hay dos colas:
// las llamadas rápidas (jobs de la cascada, el circuito de un paso) siempre pasan antes que las
// lentas que esperan (matplotlib: precarga y figuras, decenas de segundos), así cambiar de paso en
// el inspector no espera a que termine un dibujo. Lo que ya está corriendo no se interrumpe.
const colas = { alta: [], baja: [] };
let ocupado = false;
function enCola(tarea, { lenta = false } = {}) {
  return new Promise((ok, mal) => {
    colas[lenta ? "baja" : "alta"].push({ tarea, ok, mal });
    atender();
  });
}
async function atender() {
  if (ocupado) return;
  const t = colas.alta.shift() ?? colas.baja.shift();
  if (!t) return;
  ocupado = true;
  try { t.ok(await t.tarea()); } catch (e) { t.mal(e); } finally { ocupado = false; atender(); }
}

const LENTAS = new Set(["figuras_json", "precargar_figuras"]);
async function llamar(nombre, ...args) {
  const fn = api[nombre];
  if (!fn) throw new Error(`cerebro_q.api.${nombre} does not exist`);
  return enCola(async () => JSON.parse(texto(await fn.callPromising(...args))), { lenta: LENTAS.has(nombre) });
}

export const py = {
  conectoma: (maxAristas = 1200) => llamar("conectoma_json", maxAristas),
  backendInfo: (backend) => llamar("backend_json", backend),
  /** Un paso de la cascada: un circuito de 10 qubits en UN job del backend. */
  paso: (backend, params) => llamar("paso_json", backend, JSON.stringify(params)),
  /** Circuito con draw("mpl") e histograma de Qiskit, como data URI SVG. */
  figuras: (params) => llamar("figuras_json", JSON.stringify(params)),
  /** El circuito de un paso (instrucciones de Qiskit), sin ejecutarlo ni usar matplotlib. */
  circuito: (params) => llamar("circuito_json", JSON.stringify(params)),
  /** Carga matplotlib en segundo plano para que la figura draw("mpl") aparezca antes. */
  precargarFiguras: () => llamar("precargar_figuras"),
  /** Bytes del cuerpo 3D (data/gusano.glb): Python lo lee y lo entrega en base64. */
  async cuerpo() {
    const b64 = await enCola(async () => texto(await api.cuerpo_glb.callPromising()));
    if (!b64) return null;
    // Decodificación nativa si el navegador la tiene (Uint8Array.fromBase64); si no, atob.
    if (typeof Uint8Array.fromBase64 === "function") return Uint8Array.fromBase64(b64).buffer;
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
  },
};

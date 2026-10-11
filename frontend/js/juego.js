// Capa de juego: carga del láser, estadísticas de la sesión y logros que enseñan la física.
//
// Nada de esto cambia la física: la carga ES la dosis θ del láser (RX(θ)), el contador de neuronas
// son las que realmente dispararon y cada logro explica en una línea lo que acaba de pasar.
// Todo vive en memoria: Qollab no ofrece almacenamiento local del navegador.

const CARGA_MS = 1200; // de θ = 0 a θ = π
const TOQUE_MS = 280; // una pulsación más corta que esto es un "toque": dispara con la dosis del menú

/** Probabilidad de que el láser haga disparar la neurona: sin²(θ/2). */
export const probDisparo = (theta) => Math.sin(theta / 2) ** 2;

export const LOGROS = {
  primera: { t: "First light", d: "Your laser applied RX(θ) to a real neuron's qubit." },
  salto: { t: "Quantum leap", d: "The measurement collapsed the wave onto another neuron: the spike jumped." },
  zeno: { t: "Zeno trap", d: "4 measurements in a row on the same neuron: measuring often freezes the walk." },
  fallo: { t: "Misfire", d: "No neuron fired. With θ < π that happens with probability cos²(θ/2)." },
  lejos: { t: "Long range", d: "The spike reached a neuron two synapses away from where it was." },
  ionq: { t: "Ion trap", d: "A circuit ran on IonQ: trapped ions, all-to-all connectivity." },
  racha: { t: "Chain reaction", d: "3 jumps in a row: the wave kept leaving its centre." },
  coleccion: { t: "Collector", d: "25 different neurons fired. The worm has 302." },
};

export class Juego {
  constructor() {
    this.descubiertas = new Set();
    this.logros = new Set();
    this.saltos = 0;
    this.racha = 0;
    this.quieto = 0;
    this.on = { logro: () => {}, stats: () => {} };
  }

  /** Empieza una cascada desde `fuente` (cuenta como descubierta sólo si dispara). */
  inicio() {
    this.racha = 0;
    this.quieto = 0;
    this._emitir("stats");
    return this._logro("primera");
  }

  /**
   * Registra un paso medido. `r` es el resultado de paso_json; `ctx` = {theta, ionq}.
   * Devuelve los logros nuevos (también se emiten por on.logro).
   */
  paso(r, ctx = {}) {
    const nuevos = [];
    const add = (k) => { const l = this._logro(k); if (l) nuevos.push(l); };
    if (r.spike) {
      if (r.k === 1) this.descubiertas.add(r.centro);
      this.descubiertas.add(r.spike);
    }
    if (r.salto) {
      this.saltos++;
      this.racha++;
      this.quieto = 0;
      add("salto");
      if (r.spike_vecina === false) add("lejos");
      if (this.racha >= 3) add("racha");
    } else if (r.spike) {
      this.racha = 0;
      this.quieto++;
      if (this.quieto >= 4) add("zeno");
    } else {
      this.racha = 0;
      if (r.motivo_fin === "vacio" && (ctx.theta ?? Math.PI) < Math.PI - 1e-6) add("fallo");
    }
    if (ctx.ionq) add("ionq");
    if (this.descubiertas.size >= 25) add("coleccion");
    this._emitir("stats");
    return nuevos;
  }

  stats() {
    return { saltos: this.saltos, racha: this.racha, neuronas: this.descubiertas.size };
  }

  _logro(k) {
    if (this.logros.has(k)) return null;
    this.logros.add(k);
    const l = { clave: k, ...LOGROS[k] };
    this.on.logro(l);
    return l;
  }

  _emitir(ev) { this.on[ev]?.(this.stats()); }
}

/**
 * Carga del láser con "mantener presionado": θ sube de 0 a π en CARGA_MS (rápido al principio).
 * Un toque corto (< TOQUE_MS) no carga: dispara con la dosis elegida en el menú.
 * cb = { nivel(theta), soltar(theta, cargado) }.
 */
export class Carga {
  constructor(cb) {
    this.cb = cb;
    this.t0 = 0;
    this.activa = false;
    this._raf = 0;
  }

  empezar() {
    if (this.activa) return;
    this.activa = true;
    this.t0 = performance.now();
    const paso = () => {
      if (!this.activa) return;
      this.cb.nivel(this.theta(), this.cargando());
      this._raf = requestAnimationFrame(paso);
    };
    this._raf = requestAnimationFrame(paso);
  }

  /** θ actual de la carga: sube rápido al principio y frena cerca de π (curva ease-out). */
  theta() {
    const u = Math.min(1, Math.max(0, (performance.now() - this.t0) / CARGA_MS));
    return Math.PI * (1 - (1 - u) ** 2);
  }

  cargando() { return performance.now() - this.t0 >= TOQUE_MS; }

  soltar() {
    if (!this.activa) return;
    this.activa = false;
    cancelAnimationFrame(this._raf);
    const cargado = this.cargando();
    // una carga a fondo se toma como π exacto (RX(π) = X: el láser siempre dispara)
    const th = this.theta();
    this.cb.soltar(th > Math.PI - 0.02 ? Math.PI : Math.max(th, 0.1), cargado);
  }

  cancelar() {
    this.activa = false;
    cancelAnimationFrame(this._raf);
  }
}

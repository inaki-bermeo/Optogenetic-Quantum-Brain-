// Capa de juego: carga del láser, estadísticas de la sesión y logros que enseñan la física.
//
// Nada de esto cambia la física: la carga ES la dosis θ del láser (RX(θ)), el contador de neuronas
// son las que realmente dispararon y cada logro explica en una línea lo que acaba de pasar.
// Todo vive en memoria: Qollab no ofrece almacenamiento local del navegador.

const CARGA_MS = 1200; // de θ = 0 a θ = π
const TOQUE_MS = 280; // una pulsación más corta que esto es un "toque": dispara con la dosis del menú

/** Probabilidad de que el láser haga disparar la neurona: sin²(θ/2). */
export const probDisparo = (theta) => Math.sin(theta / 2) ** 2;

const LOGROS = {
  primera: { t: "First light", d: "Your laser applied RX(θ) to a real neuron's qubit." },
  salto: { t: "Quantum leap", d: "The measurement collapsed the wave onto another neuron: the spike jumped." },
  zeno: { t: "Zeno trap", d: "4 measurements in a row on the same neuron: measuring often freezes the walk." },
  fallo: { t: "Misfire", d: "No neuron fired. With θ < π that happens with probability cos²(θ/2)." },
  lejos: { t: "Long range", d: "The spike reached a neuron two synapses away from where it was." },
  ionq: { t: "Ion trap", d: "A circuit ran on IonQ: trapped ions, all-to-all connectivity." },
  racha: { t: "Chain reaction", d: "3 jumps in a row: the wave kept leaving its centre." },
  coleccion: { t: "Collector", d: "25 different neurons fired. The worm has 302." },
  // conducta del gusano (js/conducta.js): cada logro es un hecho de la biología real
  reflejo: { t: "Reflex", d: "A touch neuron fired and the worm reacted: the touch reflex mapped by Chalfie et al. in 1985." },
  escape: { t: "Escape artist", d: "ASH sensed danger: the worm backed up, then made an omega turn to head away." },
  huevo: { t: "First egg", d: "An egg-laying neuron (HSN or VC) fired, and the vulva pushed out an egg." },
  tira: { t: "Tug of war", d: "Forward and backward command neurons both fired: their commands cancel, like the real circuits." },
  olfato: { t: "Follow your nose", d: "A chemosensory neuron (AWA, AWC or ASE) fired: the worm smelled the bacteria and turned towards them." },
  comida: { t: "First meal", d: "C. elegans eats bacteria: the pharynx pumps them in and the grinder crushes them." },
};

export class Juego {
  constructor() {
    this.descubiertas = new Set();
    this.logros = new Set();
    this.saltos = 0;
    this.racha = 0;
    this.quieto = 0;
    this.mandos = new Set(); // sentidos de las neuronas de mando que dispararon en esta cascada
    this.on = { logro: () => {} };
  }

  /** Empieza una cascada desde `fuente` (cuenta como descubierta sólo si dispara). */
  inicio() {
    this.racha = 0;
    this.quieto = 0;
    this.mandos.clear();
    this._logro("primera");
  }

  /**
   * Registra un paso medido. `r` es el resultado de paso_json; `ctx` = {theta, ionq}.
   * Los logros nuevos se avisan por on.logro.
   */
  paso(r, ctx = {}) {
    if (r.spike) {
      if (r.k === 1) this.descubiertas.add(r.centro);
      this.descubiertas.add(r.spike);
    }
    if (r.salto) {
      this.saltos++;
      this.racha++;
      this.quieto = 0;
      this._logro("salto");
      if (r.spike_vecina === false) this._logro("lejos");
      if (this.racha >= 3) this._logro("racha");
    } else if (r.spike) {
      this.racha = 0;
      this.quieto++;
      if (this.quieto >= 4) this._logro("zeno");
    } else {
      this.racha = 0;
      if (r.motivo_fin === "vacio" && (ctx.theta ?? Math.PI) < Math.PI - 1e-6) this._logro("fallo");
    }
    if (ctx.ionq) this._logro("ionq");
    if (this.descubiertas.size >= 25) this._logro("coleccion");
  }

  /** Registra la conducta que actuó el gusano (evento de Motor.aplicar). */
  conducta(ev) {
    if (!ev) return;
    if (/^(ALM[LR]|AVM|PLM[LR])$/.test(ev.nombre)) this._logro("reflejo");
    if (ev.programa === "escape") this._logro("escape");
    if (ev.programa === "puesta") this._logro("huevo");
    if (ev.programa === "olfato") this._logro("olfato");
    if (ev.entrada.clase === "command interneuron") this.mandos.add(Math.sign(ev.entrada.empuje));
    if (this.mandos.size === 2) this._logro("tira");
  }

  /** El gusano alcanzó una bacteria y se la comió. */
  comer() {
    this.comidas = (this.comidas ?? 0) + 1;
    this._logro("comida");
  }

  stats() {
    return { saltos: this.saltos, racha: this.racha, neuronas: this.descubiertas.size };
  }

  _logro(k) {
    if (this.logros.has(k)) return;
    this.logros.add(k);
    this.on.logro({ clave: k, ...LOGROS[k] });
  }
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
      // con la carga llena ya no cambia nada: el bucle se detiene hasta soltar
      if (performance.now() - this.t0 < CARGA_MS) this._raf = requestAnimationFrame(paso);
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

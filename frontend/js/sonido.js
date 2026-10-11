// Sonido de la cascada, sintetizado en vivo con Web Audio (sin archivos .wav).
//
// Basado en el motor DSP del equipo (prototipo: git show 0c3e4e5:backend/audio_dsp.py), sincronizado con lo que mide
// cada circuito:
//   * láser:          barrido descendente 2500 → 100 Hz con decaimiento rápido (el "piu");
//   * superposición:  un oscilador levemente desafinado por neurona de la ventana, con trémolo,
//                     volumen ∝ √p (más fuerte la neurona más probable);
//   * colapso:        todos los osciladores se deslizan hacia la nota de la neurona medida y los
//                     demás se apagan; la neurona que dispara suena como una campana. Cada neurona
//                     tiene su propia nota (escala pentatónica), así la cascada es una melodía;
//   * vacío:          si no disparó ninguna neurona, un golpe grave descendente;
//   * fondo:          acorde A2 + E3 que "respira" (LFO de 0.2 Hz) mientras corre la cascada;
//   * música:         ambiente "submarino" generativo, constante y muy suave: acordes lentos de la misma
//                     escala (La mayor pentatónica) apagados por un filtro que se mueve como el agua,
//                     un oleaje de ruido grave, burbujas lejanas de vez en cuando y reverberación.
//                     Baja de volumen durante la medición para no tapar los sonidos importantes;
//   * piano (intro):  sobre el ambiente, un piano toca frases lentas con notas del acorde que suena
//                     (y de la misma escala), sólo mientras dura la intro; se desvanece al empezar el juego.
//   * modo intro:     la intro empieza intensa: la música entra en ~1 s, más fuerte y más abierta (el filtro
//                     "bajo el agua" casi no actúa), el piano abre con un arpegio y el título llega con un
//                     golpe (boom grave + brillo). Al empezar el juego todo baja a la versión sutil y sumergida.
// Los navegadores sólo permiten audio después de un gesto del usuario: el contexto se crea con el
// primer gesto (PRESS START en la intro, o el primer clic/tecla).

import { T_COLAPSO, T_SUPERPOSICION } from "./util.js";

const PENTA = [0, 2, 4, 7, 9]; // semitonos de la escala pentatónica

/** Nota (Hz) de una neurona: 10 notas pentatónicas a partir de A3 (220 Hz). */
export function notaNeurona(indice) {
  const n = ((indice % 10) + 10) % 10;
  return 220 * 2 ** ((12 * Math.floor(n / 5) + PENTA[n % 5]) / 12);
}

export class Sonido {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.fondo = null;
    this.musica = { on: false, vol: 0.5, duck: false, oculto: false, timers: [], voces: [], nodos: null, acorde: 0,
      piano: null, intenso: false };
  }

  /** Crea (o reanuda) el contexto de audio. Llamar dentro de un gesto del usuario. */
  activar() {
    if (!this.on) return false;
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return false;
      // "playback": búferes más grandes, menos trabajo del hilo de audio (no hace falta latencia mínima)
      try { this.ctx = new AC({ latencyHint: "playback" }); } catch { this.ctx = new AC(); }
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(comp).connect(this.ctx.destination);
      this.ctx.addEventListener("statechange", () => { if (this.ctx.state === "running") this._desbloqueado = true; });
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return true;
  }

  /** ¿El motor de audio está sonando? (antes del primer gesto el navegador lo deja suspendido) */
  get sonando() { return !!(this.ctx && this.ctx.state === "running"); }

  /**
   * Intenta que la música suene apenas abre la página. Si el navegador todavía no lo permite (no hubo
   * gesto), el contexto queda suspendido: la música ya está programada y empieza sola con el primer
   * clic o tecla (PRESS START incluido), porque activar() lo reanuda.
   */
  musicaTemprana({ piano = false, intenso = false } = {}) {
    if (!this.on || !this.activar()) return;
    if (intenso && !this.musica.intenso) {
      this.musica.intenso = true;
      // si la música ya sonaba (p. ej. al repetir la intro), sube y se abre
      const N = this.musica.nodos;
      if (N) { this._aplicarNivel(0.3); N.filtro.frequency.setTargetAtTime(1700, this.ctx.currentTime, 0.3); }
    }
    this.musicaOn();
    if (piano) this.pianoOn();
  }

  /**
   * Golpe del título: boom grave que cae, un soplo de ruido y un acorde brillante que queda sonando.
   * Sólo si el audio ya suena (si no, el "start" de PRESS START cumple ese papel).
   */
  tituloGolpe() {
    if (!this.sonando || !this.on) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.02;
    const rev = this.musica.nodos?.rev;
    const boom = this._osc("sine", 70, t0);
    boom.frequency.exponentialRampToValueAtTime(34, t0 + 1.4);
    const gb = this._env(t0, 0.55, 0.012, 0.45, t0 + 2.5);
    boom.connect(gb).connect(this.master);
    boom.start(t0); boom.stop(t0 + 2.6);
    // soplo: ruido filtrado que se abre
    const n = Math.floor(ctx.sampleRate * 1.6);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const ruido = ctx.createBufferSource();
    ruido.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "lowpass";
    bp.frequency.setValueAtTime(400, t0);
    bp.frequency.exponentialRampToValueAtTime(5000, t0 + 0.5);
    const gr = this._env(t0, 0.16, 0.02, 0.35, t0 + 1.6);
    ruido.connect(bp).connect(gr).connect(this.master);
    if (rev) gr.connect(rev);
    ruido.start(t0);
    // acorde brillante (La mayor alto) que se queda en la reverberación
    [880, 1108.73, 1318.51, 1760].forEach((f, i) => {
      const o = this._osc("triangle", f, t0 + 0.03 * i);
      const g = this._env(t0 + 0.03 * i, 0.05 / (1 + i * 0.3), 0.02, 1.1, t0 + 4.5);
      o.connect(g).connect(this.master);
      if (rev) g.connect(rev);
      o.start(t0 + 0.03 * i); o.stop(t0 + 4.6);
    });
  }

  /** Sale del modo intro: la música baja a su nivel sutil y vuelve a sonar "bajo el agua". */
  musicaIntroFin() {
    const M = this.musica;
    if (!M.intenso) return;
    M.intenso = false;
    this._aplicarNivel(3);
    const N = M.nodos;
    if (N && this.ctx) N.filtro.frequency.setTargetAtTime(640, this.ctx.currentTime, 1.5);
  }

  setOn(v) {
    this.on = v;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(v ? 0.7 : 0, t, 0.05);
    if (!v) {
      this.pararFondo();
      this.musicaOff();
      // sin sonido no hace falta que el motor de audio siga calculando: se suspende tras el fundido
      setTimeout(() => { if (!this.on && this.ctx.state === "running") this.ctx.suspend(); }, 400);
    }
  }

  /**
   * ¿Se pueden programar efectos? Con el contexto suspendido sólo si ya hubo un gesto (se reanuda enseguida):
   * así los efectos de antes del primer clic (los "tick" de la consola de arranque) no quedan encolados
   * para sonar todos juntos al desbloquear el audio.
   */
  get listo() {
    if (!(this.on && this.ctx && this.ctx.state !== "closed")) return false;
    return this.ctx.state === "running" || this._desbloqueado || !!navigator.userActivation?.hasBeenActive;
  }

  _osc(tipo, f, t0) {
    const o = this.ctx.createOscillator();
    o.type = tipo;
    o.frequency.setValueAtTime(f, t0);
    return o;
  }

  _env(t0, pico, ataque, caida, fin) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(pico, t0 + ataque);
    g.gain.setTargetAtTime(0.0001, t0 + ataque, caida);
    g.gain.setValueAtTime(0, fin);
    return g;
  }

  /** El pulso optogenético: barrido 2500 → 100 Hz, intensidad ∝ sin²(θ/2). */
  laser(intensidad = 1) {
    if (!this.listo) return;
    const t0 = this.ctx.currentTime + 0.01, dur = 0.3;
    const o = this._osc("sine", 2500, t0);
    o.frequency.exponentialRampToValueAtTime(100, t0 + 0.25);
    const g = this._env(t0, 0.45 * (0.35 + 0.65 * intensidad), 0.008, 0.07, t0 + dur + 0.2);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.25);
  }

  /**
   * Superposición y colapso de un paso.
   * probs: probabilidad de cada neurona de la ventana · hot: índice (en la ventana) de la medida o -1
   * nota: Hz de la neurona medida · t1: duración de la superposición · t2: duración del colapso.
   */
  medicion(probs, hot, nota, t1 = T_SUPERPOSICION, t2 = T_COLAPSO) {
    if (!this.listo) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.02, tc = t0 + t1, tf = tc + t2;
    const tot = probs.reduce((a, b) => a + Math.max(0, b), 0) || 1;
    const pmax = Math.max(...probs.map((p) => p / tot), 1e-9);
    const bus = ctx.createGain();
    bus.gain.value = 0.5 / Math.sqrt(probs.length);
    bus.connect(this.master);
    probs.forEach((p, i) => {
      const a = Math.sqrt(Math.max(0, p) / tot / pmax); // 0..1
      const f0 = 220 + (Math.random() * 30 - 15); // desafinado ±15 Hz, como en audio_dsp.py
      const o = this._osc("sine", f0, t0);
      // trémolo propio de cada neurona (2–6 Hz): modula una ganancia base 0.7 ± 0.3, antes de la envolvente
      const trem = this._osc("sine", 2 + 4 * Math.random(), t0);
      const tg = ctx.createGain();
      tg.gain.value = 0.3;
      const tremolo = ctx.createGain();
      tremolo.gain.value = 0.7;
      const g = ctx.createGain();
      const amp = 0.15 + 0.85 * a;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(amp, t0 + Math.min(0.35, t1 * 0.5));
      g.gain.setValueAtTime(amp, tc);
      if (i === hot) {
        o.frequency.setValueAtTime(f0, tc);
        o.frequency.exponentialRampToValueAtTime(nota, tc + t2 * 0.8);
        g.gain.linearRampToValueAtTime(1.2, tf - 0.05);
        g.gain.linearRampToValueAtTime(0.0001, tf + 0.15);
      } else {
        g.gain.exponentialRampToValueAtTime(0.0001, tc + t2 * 0.7);
      }
      trem.connect(tg).connect(tremolo.gain);
      o.connect(tremolo).connect(g).connect(bus);
      o.start(t0); trem.start(t0);
      o.stop(tf + 0.25); trem.stop(tf + 0.25);
    });
  }

  /** La neurona medida dispara: campana en su nota (fundamental + 2º y 3er armónico). */
  disparo(nota, salto = true) {
    if (!this.listo) return;
    const t0 = this.ctx.currentTime + 0.01;
    const k = salto ? 1 : 0.6;
    [[1, 0.5, 1.1], [2, 0.18, 0.6], [3, 0.08, 0.35]].forEach(([h, a, d]) => {
      const o = this._osc("sine", nota * h, t0);
      const g = this._env(t0, a * k, 0.006, d / 3, t0 + d * 3);
      o.connect(g).connect(this.master);
      o.start(t0);
      o.stop(t0 + d * 3 + 0.05);
    });
  }

  // ---------------------------------------------------------------- interfaz (estilo videojuego)
  /** Sonidos cortos de interfaz: tick (consola), select, confirm, start (whoosh del título), back. */
  ui(tipo = "select") {
    if (!this.listo) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.005;
    const tono = (f, f1, dur, pico, forma = "square") => {
      const o = this._osc(forma, f, t0);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      const g = this._env(t0, pico, 0.004, dur / 3, t0 + dur + 0.05);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 3200;
      o.connect(lp).connect(g).connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.08);
    };
    if (tipo === "tick") tono(1800, null, 0.025, 0.035);
    else if (tipo === "select") tono(660, 990, 0.07, 0.07);
    else if (tipo === "confirm") { tono(523, 1046, 0.12, 0.08); }
    else if (tipo === "back") tono(700, 350, 0.09, 0.06);
    else if (tipo === "start") {
      // whoosh: ruido filtrado que sube + acorde brillante
      const n = Math.floor(ctx.sampleRate * 0.9);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass"; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(300, t0);
      bp.frequency.exponentialRampToValueAtTime(4200, t0 + 0.7);
      const g = this._env(t0, 0.18, 0.15, 0.25, t0 + 1);
      src.connect(bp).connect(g).connect(this.master);
      src.start(t0);
      [440, 554.4, 659.3].forEach((f, i) => tono(f, f * 2, 0.5 + i * 0.05, 0.05, "triangle"));
    }
  }

  /** Riser de carga del láser: empieza al presionar; `nivel` (0..1) sube el tono; `cargaFin` lo corta. */
  cargaInicio() {
    if (!this.listo || this._carga) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = this._osc("sawtooth", 110, t0);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 600; lp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.1);
    o.connect(lp).connect(g).connect(this.master);
    o.start(t0);
    this._carga = { o, lp, g };
  }

  cargaNivel(v) {
    const C = this._carga;
    if (!C) return;
    const t = this.ctx.currentTime;
    C.o.frequency.setTargetAtTime(110 + 330 * v, t, 0.03);
    C.lp.frequency.setTargetAtTime(600 + 3600 * v, t, 0.03);
  }

  cargaFin() {
    const C = this._carga;
    if (!C) return;
    this._carga = null;
    const t = this.ctx.currentTime;
    C.g.gain.cancelScheduledValues(t);
    C.g.gain.setTargetAtTime(0.0001, t, 0.03);
    C.o.stop(t + 0.2);
  }

  /** Logro desbloqueado: arpegio corto y brillante. */
  logro() {
    if (!this.listo) return;
    const t0 = this.ctx.currentTime + 0.02;
    [784, 988, 1175, 1568].forEach((f, i) => {
      const t = t0 + i * 0.07;
      const o = this._osc("triangle", f, t);
      const g = this._env(t, 0.08, 0.005, 0.12, t + 0.5);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.55);
    });
  }

  /**
   * Conducta del gusano (js/conducta.js): un gesto corto y suave por programa, por debajo del colapso.
   * reversa/escape: glissando que baja · avance: que sube · omega: barrido lento · bombeo: 6 chasquidos
   * a 4 Hz (el ritmo de la faringe) · puesta: "pop" cuando sale el huevo · quietud: tono que se apaga ·
   * flexión, cabeza y relajación: un golpe sordo.
   */
  conducta(programa) {
    if (!this.listo) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.02;
    const bus = ctx.createGain();
    bus.gain.value = 0.55;
    bus.connect(this.master);
    const glide = (f0, f1, dur, pico, tipo = "sine", d = 0) => {
      const t = t0 + d;
      const o = this._osc(tipo, f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = this._env(t, pico, 0.05, dur / 3, t + dur + 0.3);
      o.connect(g).connect(bus);
      o.start(t); o.stop(t + dur + 0.35);
    };
    const golpe = (d, f, pico, dur = 0.18) => {
      const t = t0 + d;
      const o = this._osc("sine", f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.5, t + dur);
      const g = this._env(t, pico, 0.004, dur / 4, t + dur + 0.1);
      o.connect(g).connect(bus);
      o.start(t); o.stop(t + dur + 0.15);
    };
    switch (programa) {
      case "reversa": glide(520, 170, 0.7, 0.1, "triangle"); break;
      case "escape": glide(520, 170, 0.7, 0.1, "triangle"); glide(140, 420, 1.2, 0.08, "triangle", 1.3); break;
      case "avance": glide(170, 520, 0.7, 0.1, "triangle"); break;
      case "tendencia": glide(300, 340, 0.5, 0.05); break;
      case "omega": glide(140, 420, 1.4, 0.09, "triangle"); break;
      case "bombeo": for (let i = 0; i < 6; i++) golpe(i * 0.25, 1100, 0.05, 0.04); break;
      case "puesta": golpe(0.45, 700, 0.12, 0.1); golpe(0.5, 1400, 0.05, 0.06); break;
      case "quietud": glide(220, 110, 1.3, 0.07); break;
      case "olfato": glide(500, 820, 0.18, 0.05); glide(560, 900, 0.18, 0.05, "sine", 0.22); break; // dos "olfateos"
      default: golpe(0, 190, 0.12); // flexión, cabeza, relajación
    }
  }

  /** El gusano se traga una bacteria: un "plop" grave y la faringe bombeando (clics rápidos). */
  comer() {
    if (!this.listo) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.02;
    const o = this._osc("sine", 320, t0);
    o.frequency.exponentialRampToValueAtTime(90, t0 + 0.16);
    const g = this._env(t0, 0.22, 0.006, 0.06, t0 + 0.3);
    o.connect(g).connect(this.master);
    o.start(t0); o.stop(t0 + 0.32);
    for (let i = 0; i < 6; i++) {
      const t = t0 + 0.25 + i * 0.22;
      const c = this._osc("sine", 1200 - i * 40, t);
      const gc = this._env(t, 0.045, 0.003, 0.012, t + 0.06);
      c.connect(gc).connect(this.master);
      c.start(t); c.stop(t + 0.07);
    }
  }

  /** No disparó ninguna neurona: golpe grave que cae. */
  vacio() {
    if (!this.listo) return;
    const t0 = this.ctx.currentTime + 0.01;
    const o = this._osc("triangle", 160, t0);
    o.frequency.exponentialRampToValueAtTime(45, t0 + 0.5);
    const g = this._env(t0, 0.5, 0.01, 0.15, t0 + 0.9);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.95);
  }

  /** Acorde de fondo que "respira" (A2 + E3, LFO 0.2 Hz), mientras corre la cascada. */
  fondoOn() {
    if (!this.listo || this.fondo) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.02;
    const salida = ctx.createGain();
    salida.gain.setValueAtTime(0.0001, t0);
    salida.gain.exponentialRampToValueAtTime(0.07, t0 + 1.5);
    salida.connect(this.master);
    const resp = ctx.createGain();
    resp.gain.value = 0.5;
    resp.connect(salida);
    const lfo = this._osc("sine", 0.2, t0);
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg).connect(resp.gain);
    const oscs = [110, 164.8].map((f) => {
      const o = this._osc("sine", f, t0);
      o.connect(resp);
      o.start(t0);
      return o;
    });
    lfo.start(t0);
    this.fondo = { salida, oscs: [...oscs, lfo] };
  }

  pararFondo() {
    const F = this.fondo;
    if (!F || !this.ctx) return;
    this.fondo = null;
    const t = this.ctx.currentTime;
    F.salida.gain.cancelScheduledValues(t);
    F.salida.gain.setTargetAtTime(0.0001, t, 0.5);
    F.oscs.forEach((o) => o.stop(t + 3));
  }

  // ---------------------------------------------------------------- música de fondo (submarina)
  /**
   * Respuesta al impulso para la reverberación: ruido con caída exponencial (sala grande y húmeda).
   * Mono y de 2 s: la convolución corre todo el tiempo que suena la música, y su costo crece con el largo
   * y los canales del impulso (antes 4.5 s estéreo, ~4.5 veces más trabajo).
   */
  _reverb(seg = 2) {
    const ctx = this.ctx;
    if (!this._bufReverb) { // se calcula una sola vez
      const n = Math.floor(ctx.sampleRate * seg);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
      this._bufReverb = buf;
    }
    const conv = ctx.createConvolver();
    conv.buffer = this._bufReverb;
    return conv;
  }

  /** Ruido marrón (grave, como agua en movimiento), en un buffer que se repite. */
  _ruidoMarron(seg = 6) {
    const ctx = this.ctx;
    if (!this._bufRuido) { // se calcula una sola vez
      const n = Math.floor(ctx.sampleRate * seg);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
      this._bufRuido = buf;
    }
    const src = ctx.createBufferSource();
    src.buffer = this._bufRuido;
    src.loop = true;
    return src;
  }

  /** Enciende el ambiente submarino (después de un gesto del usuario). */
  musicaOn() {
    const M = this.musica;
    // la música sí se programa con el contexto suspendido (empieza sola al desbloquearse el audio)
    if (!this.on || !this.ctx || this.ctx.state === "closed" || M.on || M.vol <= 0) return;
    M.on = true;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05;
    // cadena: voces → filtro "bajo el agua" (con vaivén) → seco + reverb → volumen → master
    const salida = ctx.createGain();
    salida.gain.setValueAtTime(0.0001, t0);
    // en el juego entra muy de a poco; en la intro, en ~1 s y fuerte
    salida.gain.exponentialRampToValueAtTime(this._musicaNivel(), t0 + (M.intenso ? 1.0 : 6));
    // sin graves inaudibles en parlantes de notebook (sólo gastan volumen)
    const corte = ctx.createBiquadFilter();
    corte.type = "highpass";
    corte.frequency.value = 55;
    salida.connect(corte).connect(this.master);
    const filtro = ctx.createBiquadFilter();
    filtro.type = "lowpass";
    filtro.frequency.value = M.intenso ? 1700 : 640; // intro: casi sin filtro, más presente
    filtro.Q.value = 0.7;
    const vaiven = this._osc("sine", 0.045, t0); // el filtro se abre y cierra cada ~22 s, como una corriente
    const vg = ctx.createGain();
    vg.gain.value = 220;
    vaiven.connect(vg).connect(filtro.frequency);
    vaiven.start(t0);
    const rev = this._reverb();
    const seco = ctx.createGain(); seco.gain.value = 0.55;
    const humedo = ctx.createGain(); humedo.gain.value = 0.9;
    filtro.connect(seco).connect(salida);
    filtro.connect(rev).connect(humedo).connect(salida);
    // oleaje: ruido grave que sube y baja lentamente
    const ola = this._ruidoMarron();
    const olaF = ctx.createBiquadFilter();
    olaF.type = "bandpass"; olaF.frequency.value = 220; olaF.Q.value = 0.6;
    const olaG = ctx.createGain(); olaG.gain.value = 0.045;
    const olaLfo = this._osc("sine", 0.075, t0);
    const olaLg = ctx.createGain(); olaLg.gain.value = 0.035;
    olaLfo.connect(olaLg).connect(olaG.gain);
    ola.connect(olaF).connect(olaG).connect(rev);
    olaG.connect(salida);
    ola.start(t0); olaLfo.start(t0);
    M.nodos = { salida, filtro, rev, fuentes: [vaiven, ola, olaLfo] };
    this._siguienteAcorde();
    this._burbujas();
  }

  musicaOff() {
    const M = this.musica;
    if (!M.on) return;
    this.pianoOff(0.3);
    M.on = false;
    M.proximo = 0;
    M.timers.forEach(clearTimeout);
    M.timers = [];
    const N = M.nodos, t = this.ctx.currentTime;
    if (N) {
      N.salida.gain.cancelScheduledValues(t);
      N.salida.gain.setTargetAtTime(0.0001, t, 0.6);
      N.fuentes.forEach((o) => o.stop(t + 3));
    }
    M.voces.forEach((v) => v.forEach((o) => o.stop(t + 3)));
    M.voces = [];
    M.nodos = null;
  }

  /** Volumen de la música (0..1, el control del menú de ajustes). */
  setMusicaVol(v) {
    this.musica.vol = v;
    if (v <= 0) this.musicaOff(); // en 0 se apaga del todo (no sólo se baja)
    else if (!this.musica.on && this.ctx) this.musicaOn();
    this._aplicarNivel();
  }

  /** Durante la medición la música baja (≈ 30 %) para que se oigan el láser, el colapso y los disparos. */
  musicaDuck(on) {
    this.musica.duck = on;
    this._aplicarNivel();
  }

  /** Con la pestaña oculta el audio se suspende (y se dejan de programar acordes); vuelve al regresar. */
  musicaOculta(v) {
    const M = this.musica;
    M.oculto = v;
    if (!this.ctx) return;
    if (v) {
      M.timers.forEach(clearTimeout);
      M.timers = [];
      this.ctx.suspend();
    } else if (this.on) {
      this.ctx.resume();
      if (M.on && !M.timers.length) { this._siguienteAcorde(); this._burbujas(); if (M.piano) this._frasePiano(); }
    }
    this._aplicarNivel();
  }

  _musicaNivel() {
    const M = this.musica;
    return Math.max(0.0001, 1.8 * Math.pow(M.vol, 1.6) * (M.duck ? 0.25 : 1) * (M.oculto ? 0 : 1) * (M.intenso ? 1.8 : 1));
  }

  _aplicarNivel(tau = null) {
    const N = this.musica.nodos;
    if (!N || !this.ctx) return;
    const t = this.ctx.currentTime;
    N.salida.gain.cancelScheduledValues(t);
    N.salida.gain.setTargetAtTime(this._musicaNivel(), t, tau ?? (this.musica.duck ? 0.4 : 1.5));
  }

  /** Acordes lentos (A – F#m – D – E), apagados y con voces levemente desafinadas; cambian cada ~14 s. */
  _siguienteAcorde() {
    const M = this.musica;
    if (!M.on) return;
    // Se programa con el reloj de audio, no con el del navegador: si el audio está suspendido (todavía sin
    // gesto, o pestaña oculta) ese reloj se detiene y el acorde siguiente espera; así nunca se apilan.
    const ahora = this.ctx.currentTime;
    if (M.proximo && ahora < M.proximo - 0.25) {
      M.timers.push(setTimeout(() => this._siguienteAcorde(), Math.max(250, (M.proximo - ahora) * 1000)));
      return;
    }
    const ACORDES = [
      [110.0, 164.81, 220.0, 277.18], // La
      [92.5, 138.59, 185.0, 220.0], // Fa# menor
      [73.42, 110.0, 146.83, 185.0], // Re
      [82.41, 123.47, 164.81, 207.65], // Mi
    ];
    const ctx = this.ctx, t0 = Math.max(ctx.currentTime + 0.05, M.proximo || 0), dur = 14;
    const fade = M.proximo ? 6 : M.intenso ? 1.2 : 6; // el primer acorde de la intro entra rápido
    M.proximo = t0 + dur;
    const notas = ACORDES[M.acorde % ACORDES.length];
    M.acorde++;
    const voz = [];
    notas.forEach((f, i) => {
      for (const det of [-6, 5]) {
        const o = this._osc(i === 0 ? "triangle" : "sawtooth", f, t0);
        o.detune.value = det + (Math.random() * 4 - 2);
        const g = ctx.createGain();
        const nivel = (i === 0 ? 0.09 : 0.045) / (1 + i * 0.15);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(nivel, t0 + fade);
        g.gain.setValueAtTime(nivel, t0 + dur);
        g.gain.linearRampToValueAtTime(0.0001, t0 + dur + fade);
        o.connect(g).connect(M.nodos.filtro);
        o.start(t0);
        o.stop(t0 + dur + fade + 0.1);
        voz.push(o);
      }
    });
    M.voces.push(voz);
    if (M.voces.length > 3) M.voces.shift();
    M.timers.push(setTimeout(() => this._siguienteAcorde(), (M.proximo - ctx.currentTime) * 1000));
  }

  /** Burbujas lejanas: de vez en cuando, un "blup" agudo y muy suave que sube de tono. */
  _burbujas() {
    const M = this.musica;
    if (!M.on) return;
    if (!this.sonando) { M.timers.push(setTimeout(() => this._burbujas(), 1000)); return; }
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const t = t0 + k * (0.08 + Math.random() * 0.15);
      const f = 500 + Math.random() * 700;
      const o = this._osc("sine", f, t);
      o.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.022, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      g.connect(M.nodos.rev); // lejanas: casi sólo reverberación
      o.connect(g);
      const seco = ctx.createGain();
      seco.gain.value = 0.25;
      g.connect(seco).connect(M.nodos.salida);
      o.start(t);
      o.stop(t + 0.12);
    }
    M.timers.push(setTimeout(() => this._burbujas(), 5000 + Math.random() * 9000));
  }

  // ------------------------------------------------------------------ piano de la intro
  /** Piano suave sobre el ambiente (sólo en la intro). Necesita la música encendida. */
  pianoOn() {
    const M = this.musica;
    if (!M.on || !M.nodos || M.piano) return;
    const ctx = this.ctx;
    // el piano no pasa por el filtro "bajo el agua": suena claro pero lejos (bastante reverberación)
    const bus = ctx.createGain();
    bus.gain.value = 0.0001;
    bus.gain.setTargetAtTime(M.intenso ? 1.35 : 1, ctx.currentTime, M.intenso ? 0.15 : 1.2);
    const tono = ctx.createBiquadFilter();
    tono.type = "lowpass";
    tono.frequency.value = 2600;
    const seco = ctx.createGain(); seco.gain.value = 0.45;
    const humedo = ctx.createGain(); humedo.gain.value = 0.8;
    bus.connect(tono);
    tono.connect(seco).connect(M.nodos.salida);
    tono.connect(humedo).connect(M.nodos.rev);
    M.piano = { bus, paso: 0, abrir: M.intenso };
    // en la intro el piano abre casi de inmediato con un arpegio; si no, entra al poco rato
    M.timers.push(setTimeout(() => this._frasePiano(), M.intenso ? 250 : 900));
  }

  /** Apaga el piano con un fundido (las notas que suenan terminan solas). */
  pianoOff(fundido = 2.5) {
    const M = this.musica;
    const P = M.piano;
    if (!P) return;
    M.piano = null;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    P.bus.gain.cancelScheduledValues(t);
    P.bus.gain.setTargetAtTime(0.0001, t, fundido / 3);
  }

  /** Una nota de piano: parciales levemente inarmónicos, ataque de martillo y caída más rápida en los agudos. */
  _notaPiano(f, t, vel) {
    const ctx = this.ctx, P = this.musica.piano;
    const tau = 1.5 * Math.sqrt(440 / f); // duración de la caída (s)
    [[1, 1], [2.003, 0.42], [3.009, 0.17], [4.02, 0.07]].forEach(([h, a], k) => {
      const o = this._osc("sine", f * h, t);
      const g = ctx.createGain();
      const pico = 0.2 * vel * a;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(pico, t + 0.005);
      g.gain.setTargetAtTime(0.0001, t + 0.005, tau / (1 + 0.7 * k));
      o.connect(g).connect(P.bus);
      o.start(t);
      o.stop(t + 6 * tau);
    });
  }

  /** Frases lentas de 3 a 5 notas con tonos del acorde actual (dos octavas arriba) y de la escala. */
  _frasePiano() {
    const M = this.musica, P = M.piano;
    if (!M.on || !P) return;
    if (!this.sonando) { M.timers.push(setTimeout(() => this._frasePiano(), 600)); return; }
    const ACORDES = [
      [440.0, 554.37, 659.25, 880.0], // La
      [369.99, 440.0, 554.37, 739.99], // Fa# menor
      [293.66, 369.99, 440.0, 587.33], // Re
      [329.63, 415.3, 493.88, 659.25], // Mi
    ];
    const ESCALA = [440.0, 493.88, 554.37, 659.25, 739.99, 880.0]; // La mayor pentatónica
    const acorde = ACORDES[(M.acorde + 3) % 4]; // el acorde que está sonando (_siguienteAcorde ya avanzó)
    const ctx = this.ctx;
    let t = ctx.currentTime + 0.05;
    if (P.abrir) {
      // apertura: arpegio ascendente de La mayor con el bajo en octavas, más fuerte que el resto
      P.abrir = false;
      this._notaPiano(110, t, 0.9);
      this._notaPiano(220, t, 0.7);
      [440, 554.37, 659.25, 880, 1108.73].forEach((f, k) => this._notaPiano(f, t + 0.16 * k, 0.95 - 0.08 * k));
      M.timers.push(setTimeout(() => this._frasePiano(), 3200));
      return;
    }
    const n = 3 + Math.floor(Math.random() * 3);
    const subir = P.paso++ % 2 === 0; // alterna frases que suben y que bajan
    const notas = [...acorde].sort((a, b) => (subir ? a - b : b - a));
    for (let k = 0; k < n; k++) {
      let f = notas[k % notas.length];
      if (k === n - 1 && Math.random() < 0.4) f = ESCALA[Math.floor(Math.random() * ESCALA.length)]; // nota de paso
      const vel = 0.55 + 0.35 * Math.random() - 0.08 * k;
      this._notaPiano(f, t, vel);
      if (k === 0 && Math.random() < 0.5) this._notaPiano(f / 2, t, vel * 0.6); // a veces, la octava grave
      t += 0.55 + Math.random() * 0.6;
    }
    const descanso = 2.2 + Math.random() * 2.8; // silencio entre frases
    M.timers.push(setTimeout(() => this._frasePiano(), (t - ctx.currentTime + descanso) * 1000));
  }
}

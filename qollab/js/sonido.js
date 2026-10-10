// Sonido de la cascada, sintetizado en vivo con Web Audio (sin archivos .wav).
//
// Basado en el motor DSP del equipo (backend/audio_dsp.py), pero sincronizado con lo que mide
// cada circuito:
//   * láser:          barrido descendente 2500 → 100 Hz con decaimiento rápido (el "piu");
//   * superposición:  un oscilador levemente desafinado por neurona de la ventana, con trémolo,
//                     volumen ∝ √p (más fuerte la neurona más probable);
//   * colapso:        todos los osciladores se deslizan hacia la nota de la neurona medida y los
//                     demás se apagan; la neurona que dispara suena como una campana. Cada neurona
//                     tiene su propia nota (escala pentatónica), así la cascada es una melodía;
//   * vacío:          si no disparó ninguna neurona, un golpe grave descendente;
//   * fondo:          acorde A2 + E3 que "respira" (LFO de 0.2 Hz) mientras corre la cascada.
// Los navegadores sólo permiten audio después de un gesto del usuario: el contexto se crea al
// presionar Fire laser.

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
  }

  /** Crea (o reanuda) el contexto de audio. Llamar dentro de un gesto del usuario. */
  activar() {
    if (!this.on) return false;
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return true;
  }

  setOn(v) {
    this.on = v;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(v ? 0.7 : 0, t, 0.05);
    if (!v) this.pararFondo();
  }

  get listo() { return !!(this.on && this.ctx && this.ctx.state !== "closed"); }

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
  medicion(probs, hot, nota, t1 = 0.9, t2 = 0.75) {
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
}

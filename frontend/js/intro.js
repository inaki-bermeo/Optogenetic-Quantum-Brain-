// Intro en fases, como el arranque de un videojuego:
//   1. arranque: líneas de consola que aparecen a medida que init() realmente termina cada etapa;
//   2. título sobre el gusano 3D en vivo (órbita lenta) y PRESS START (desbloquea el audio si hacía falta);
// La música (ambiente submarino + piano suave) se programa desde el arranque: suena apenas el navegador lo
// permite, y el piano se desvanece al terminar la intro.
//   3. dos escenas de contexto (qué es la optogenética y el Nobel de Medicina 2026), con el gusano en
//      órbita lenta, y tres sobre la escena real: luz (láser en AVM) → superposición (su ventana de
//      10 qubits, con las probabilidades ideales del circuito real) → colapso (una neurona dispara);
//   4. el HUD entra desde los bordes y el foco va al botón de disparo.
// Esc o "Skip intro" saltan en cualquier momento. Con prefers-reduced-motion no hay animaciones
// ni vuelos de cámara: sólo el texto.

import { REDUCED, sleep, T_COLAPSO } from "./util.js";

// `accion` es el método que mueve la escena real en cada una (_orbita, _luz, _superposicion, _colapso)
const ESCENAS = [
  { titulo: "Optogenetics", accion: "orbita",
    texto: "Optogenetics gives chosen neurons a light-sensitive protein from algae, <b>channelrhodopsin</b>. " +
      "A flash of blue light opens it and the neuron fires, so scientists can switch brain circuits on and off " +
      "and watch what the animal does." },
  { titulo: "Nobel Prize 2026", accion: "orbita",
    texto: "The 2026 Nobel Prize in Physiology or Medicine went to <b>Georg Nagel</b>, <b>Peter Hegemann</b> and " +
      "<b>Karl Deisseroth</b> for light-gated ion channels and optogenetics. In 2005 Nagel's team used it to make " +
      "<b><i>C. elegans</i></b> move with light: the same worm you see here." },
  { titulo: "Light", accion: "luz",
    texto: "Now make the light quantum. A pulse hits neuron <b>AVM</b>, and that pulse is a quantum gate, " +
      "<b>RX(θ)</b>, that rotates the neuron's qubit from rest towards active." },
  // auto: si la persona no sigue, la escena pasa sola tras esos ms (no con prefers-reduced-motion)
  { titulo: "Superposition", accion: "superposicion", auto: 8000,
    texto: "The excitation spreads as a wave over AVM and its 9 most connected neighbours. Inside the " +
      "<b>10-qubit circuit</b> it is in all of them at once." },
  { titulo: "Collapse", accion: "colapso",
    texto: "Measuring the circuit picks <span class=\"a\">one neuron</span>. It fires, and becomes the centre of the " +
      "next circuit. Every jump you will see is a real measurement." },
];

export class Intro {
  /**
   * opts = { scene, sound, app, demo: async () => ({fuente, ventana_indices, ideal_marginales}),
   *          alTerminar: () => void }
   */
  constructor(opts) {
    this.o = opts;
    this.el = document.getElementById("intro");
    // una marca por escena (el número de escenas lo decide la tabla, no el HTML)
    document.querySelector("#intro-brief .brief-pips").innerHTML = ESCENAS.map(() => "<i></i>").join("");
    this.fase = "boot";
    this.escena = -1;
    this.listo = false;
    this.terminada = false;
    this._turno = 0;
    this._bloquear(true);
    this.o.scene.setPaused(true);
    this._bind();
    // música desde el arranque: suena altiro si el navegador lo permite (p. ej. tras el clic en Run de
    // Qollab); si no, queda lista y empieza con el primer clic o tecla
    this.o.sound.musicaTemprana({ piano: true, intenso: true });
  }

  _bind() {
    const $ = (id) => document.getElementById(id);
    $("intro-start").addEventListener("click", () => this.empezar());
    $("intro-next").addEventListener("click", () => this.siguiente());
    $("intro-skip").addEventListener("click", () => this.terminar());
    this.el.addEventListener("keydown", (e) => {
      // stopPropagation: este Esc es de la intro (si no, el HUD lo tomaría para abrir el menú)
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this.terminar(); }
    });
    // PRESS START también con Enter/Espacio desde cualquier parte de la pantalla de título
    this._teclaTitulo = (e) => {
      if (this.fase === "titulo" && (e.key === "Enter" || e.key === " ") && e.target.id !== "intro-skip") {
        e.preventDefault();
        this.empezar();
      }
    };
    document.addEventListener("keydown", this._teclaTitulo);
  }

  /** Una línea de la consola de arranque. `ok` marca la etapa como completa. */
  log(html, { ok = true, err = false } = {}) {
    const li = document.createElement("li");
    li.innerHTML = html;
    if (ok && !err) li.classList.add("ok");
    if (err) li.classList.add("err");
    document.getElementById("boot-log").appendChild(li);
    if (!REDUCED) this.o.sound.ui?.("tick");
  }

  /** init() terminó: pasa al título (o queda en la consola si hubo error). */
  async preparado({ error = false } = {}) {
    if (error || this.terminada) return;
    this.listo = true;
    await sleep(REDUCED ? 0 : 700);
    this._fase("titulo");
    if (this.terminada) return; // "Skip" pedido mientras cargaba
    const t = document.getElementById("intro-title");
    if (!t.querySelector(".ch")) {
      // letra por letra (el texto completo queda para lectores de pantalla en aria-label)
      t.setAttribute("aria-label", t.textContent);
      let i = 0;
      t.innerHTML = t.textContent.split(" ").map((w) =>
        `<span aria-hidden="true" style="white-space:nowrap">${[...w].map((c) => `<span class="ch" style="--i:${i++}">${c}</span>`).join("")}</span>`)
        .join(" ");
    }
    if (!REDUCED) setTimeout(() => t.classList.add("glitch"), 700);
    this.o.scene.setPaused(false);
    if (!REDUCED) this.o.scene.setCinematic(true);
    this.o.sound.musicaTemprana({ piano: true, intenso: true }); // al repetir la intro, el piano vuelve
    this.o.sound.tituloGolpe(); // el título llega con un golpe (si el audio ya suena)
    const b = document.getElementById("intro-start");
    b.innerHTML = "<span>Press start</span>";
    b.focus();
  }

  /** PRESS START: desbloquea el audio y empieza las escenas. */
  empezar() {
    if (this.fase !== "titulo") return;
    const s = this.o.sound;
    if (s.on && s.activar()) { s.ui?.("start"); s.musicaOn(); }
    this._fase("brief"); // el gusano sigue en órbita lenta durante las escenas de contexto
    this.siguiente();
  }

  async siguiente() {
    if (this.terminada) return;
    this.escena++;
    if (this.escena >= ESCENAS.length) { this.terminar(); return; }
    const e = ESCENAS[this.escena];
    const turno = ++this._turno;
    const $ = (id) => document.getElementById(id);
    const box = $("intro-brief");
    box.classList.remove("anim");
    void box.offsetWidth; // reinicia la animación de entrada del texto
    box.classList.add("anim");
    $("brief-num").textContent = String(this.escena + 1).padStart(2, "0");
    $("brief-title").textContent = e.titulo;
    $("brief-text").innerHTML = e.texto;
    box.querySelectorAll(".brief-pips i").forEach((p, i) => p.classList.toggle("on", i <= this.escena));
    $("intro-next").textContent = this.escena === ESCENAS.length - 1 ? "Your turn ▸" : "Next ▸";
    $("intro-next").focus();
    this.o.sound.ui?.("select");
    if (e.auto && !REDUCED) setTimeout(() => { if (turno === this._turno) this.siguiente(); }, e.auto);
    try {
      await this[`_${e.accion}`](turno);
    } catch (err) {
      console.log(`intro: ${err.message}`);
    }
  }

  // --- contexto (optogenética, Nobel): el gusano real en órbita lenta; se precarga el circuito de AVM
  async _orbita() {
    this._demo ??= this.o.demo();
    if (!REDUCED) this.o.scene.setCinematic(true);
  }

  // --- el láser
  async _luz() {
    const { scene, sound } = this.o;
    scene.setCinematic(false);
    this._demo ??= this.o.demo(); // el circuito real de AVM (ya en caché por prefetchPreview)
    const d = await this._demo;
    if (!REDUCED) await scene.flyTo(d.fuente, { dur: 1400, dist: 10 });
    scene.fireLaser(d.fuente, 1);
    sound.laser(1);
  }

  // --- superposición (larga: el colapso llega con la escena siguiente)
  async _superposicion() {
    const d = await this._demo;
    const { scene } = this.o;
    scene.setHighlight(d.ventana_indices);
    // la superposición late hasta que la persona sigue; si no sigue, se pasa sola al colapso (8 s)
    if (!REDUCED) {
      this._promColapso = scene.collapse(d.ventana_indices, d.ideal_marginales, this._sortear(d), { superposition: 600, collapse: T_COLAPSO });
    }
  }

  // --- colapso (una neurona sorteada con las probabilidades ideales del circuito)
  async _colapso(turno) {
    const d = await this._demo;
    const { scene, sound } = this.o;
    const spike = this._spike ?? this._sortear(d);
    const i = d.ventana_indices.indexOf(spike);
    sound.medicion(d.ideal_marginales, i, this.o.nota(spike), 0.2, T_COLAPSO);
    if (REDUCED) return;
    scene.collapseNow();
    this.o.barrido?.();
    await this._promColapso;
    if (turno !== this._turno) return;
    sound.disparo(this.o.nota(spike), true);
    this.o.mostrarSpike?.(spike);
  }

  _sortear(d) {
    if (this._spike != null) return this._spike;
    const p = d.ideal_marginales, tot = p.reduce((a, b) => a + b, 0) || 1;
    let r = Math.random() * tot;
    for (let k = 0; k < p.length; k++) { r -= p[k]; if (r <= 0) return (this._spike = d.ventana_indices[k]); }
    return (this._spike = d.ventana_indices[0]);
  }

  /** Fin de la intro (Esc, Skip o la última escena): el HUD entra y el foco va al disparo. */
  terminar() {
    if (this.terminada) return;
    if (!this.listo) { // todavía cargando: se salta en cuanto termine el arranque
      this._saltarAlCargar = true;
      document.getElementById("intro-skip").textContent = "Skipping when loaded…";
      return;
    }
    this.terminada = true;
    this._turno++;
    document.removeEventListener("keydown", this._teclaTitulo);
    const s = this.o.sound;
    if (s.on && s.activar()) { s.ui?.("confirm"); s.musicaOn(); }
    s.pianoOff(); // el piano es de la intro: se desvanece y queda el ambiente submarino
    s.musicaIntroFin(); // y la música baja a su versión sutil, "bajo el agua"
    this.o.scene.setCinematic(false);
    this.el.classList.add("fin");
    this._bloquear(false);
    if (!REDUCED) {
      this.o.app.classList.remove("entrando");
      void this.o.app.offsetWidth;
      this.o.app.classList.add("entrando");
    }
    setTimeout(() => { this.el.hidden = true; }, REDUCED ? 0 : 850);
    this.o.alTerminar();
  }

  /** Repetir la intro desde el título (menú de ajustes). */
  repetir() {
    Object.assign(this, { fase: "boot", escena: -1, terminada: false, _spike: null, _demo: null, _turno: this._turno + 1 });
    this.el.hidden = false;
    this.el.classList.remove("fin");
    this._bloquear(true);
    document.getElementById("intro-skip").textContent = "Skip intro";
    document.getElementById("intro-skip").insertAdjacentHTML("beforeend", " <kbd>Esc</kbd>");
    document.addEventListener("keydown", this._teclaTitulo);
    this.preparado();
  }

  /** Mientras dura la intro, el HUD queda oculto e inerte (no se le puede dar el foco). */
  _bloquear(on) {
    this.o.app.inert = on;
    this.o.app.classList.toggle("en-intro", on);
    document.querySelector(".skip-link").inert = on;
  }

  _fase(f) {
    this.fase = f;
    this.el.dataset.fase = f;
    if (f === "titulo" && this._saltarAlCargar) this.terminar();
  }
}

# Frontend internals

`frontend/` is plain HTML, CSS and ES modules, with no build step and no framework. The only library is `three` (0.186.1), which Qollab provides by name. Everything else is written in this repo. For the big picture and the Qollab rules, read [architecture.md](architecture.md) first.

```
index.html   markup: intro dialog, HUD (top bar, mission log, scanner, control deck), settings menu, circuit inspector
main.css     design tokens, Geist fonts (base64), HUD, intro, responsive and reduced-motion rules
main.js      the controller: state, the cascade loop, HUD rendering, inspector, input wiring, startup
js/
  escena.js   WormScene (three.js)            js/intro.js    Intro (boot → title → 3 beats)
  conducta.js behaviour table + Motor         js/juego.js    Juego (stats, achievements) + Carga (hold to charge)
  sonido.js   Sonido (Web Audio)              js/python.js   py.* bridge to cerebro_q.api, with a call queue
  graficos.js SVG bar chart + data table      js/util.js     REDUCED, COARSE, EASE, sleep, timings, escribiendo
```

## main.js: state

Four plain objects hold all page state. No other module reads them; the other modules get what they need as arguments.

| Object | Fields |
| --- | --- |
| `state` | `neurons` (from `conectoma_json`), `index` (name → global index), `source` (target neuron, default `"AVM"`), `backend` (from `backend_json`), `jobsSent` |
| `cascade` | `running`, `stop`, `armed` (hardware needs a confirming second click), `centers` (spike chain), `steps` (one `paso_json` result per step, plus `params`, `k`, `shots`, `salto`, `conducta`), `conductas` |
| `ui` | `inspector` (overlay open), `intro` (intro still showing) |
| `circ` | Inspector caches: `cache` (circuit JSON per params, LRU of 8), `fig` (matplotlib SVGs, LRU), `turno` / `figTurno` (request tokens, so stale responses are ignored), `mpl` / `mplListo` (matplotlib preload) |
| `hud` | The last values written to the HUD (`stats`, `dose`), so per-frame updates touch the DOM only when something changed; plus the preview debounce timer |

The module instances are `scene` (WormScene), `sound` (Sonido), `juego` (Juego) and `intro` (Intro).

## main.js: the cascade loop, `fire(thetaCarga)`

`fire` is the heart of the page. It runs only when there is no cascade running, the backend exists, IonQ hasn't used its one job, and (on hardware) the second confirming click has happened.

1. **Setup**
   - Unlock audio, then `cascade.running = true` and `scene.ocupada = true` (no idle rest during the cascade).
   - Reset the HUD and call `juego.inicio()` ("First light").
   - Call `scene.fireLaser` and `sound.laser`, and switch swimming off so the neurons sit at their real positions while measured.
2. **For each step `k` up to the steps setting** (1 on IonQ):
   - `await respirar()`, then `await py.paso(BACKEND, {centro, theta: k === 1 ? θ : π, tau, gamma, pasos_trotter, shots})`. This is one Qiskit job. Only the first step uses the laser dose; later centres start fully excited.
   - Annotate the result `r` with `salto` (jump) and `conducta` (the behaviour-table entry, looked up once). Push it to `cascade.steps`, then call `renderCascadePanel` (the scanner).
   - **Measurement animation**, unless the inspector is open or motion is reduced:
     - the superposition narration;
     - `sound.medicion`;
     - the sweep (`barrido`), timed to start with the collapse;
     - `await scene.collapse(r.ventana_indices, r.teoria_ventana, r.spike_indice)`.
   - Bell (`sound.disparo`) or thud (`sound.vacio`). Then `applyCascadeScene(r)`: rings, the trail, the measured neuron lit and the label.
   - **Behaviour.** `Motor.aplicar` produces an event `ev` if the spike has a known behaviour and is not the same neuron as last time. Then:
     - the mission log text;
     - the "Worm behaviour" box;
     - `juego.paso` (achievements);
     - the stats.
   - If there is no spike, stop (`motivo_fin`). Otherwise the spike becomes the next centre. Then either `await actuar(ev)`, which flies the camera in for local behaviours (`ACERCAR`) and resolves when the worm starts returning to rest, or a short pause.
3. **`finally`**
   - `ocupada = false`.
   - `setDrive` (the worm keeps swimming backward for a few seconds if the command neurons pushed it that way); swimming resumes 2.5 s later.
   - The IonQ lock, the summary, the narration and the screen-reader announcement.

`stopCascade` only sets `cascade.stop`, which the loop checks before each step.

## main.js: other responsibilities

| Function(s) | What |
| --- | --- |
| `selectSource`, `showSourceOnly`, `neuronCard` | Change the target neuron (typed, or picked on the worm) and show it |
| `setDose`, `bindCarga` | Dose meter (θ/π fill, sin²(θ/2) text) and hold-to-charge input (`Carga`): pointer on the button, or Space anywhere. A short tap or Enter fires at the menu dose |
| `renderStats`, `mostrarLogro` | Top stats bar, and the achievement banners (`juego.on.logro`) |
| `narrate*` | Mission log text (also announced via `#sr-status` for screen readers) |
| `renderCascadePanel`, `drawMiniCircuit`, `renderConducta` | Scanner: chips, step circuit summary, theory vs measured bars plus table, behaviour box |
| `setInspector`, `renderCircuitPanel`, `drawCircuit`, `renderCounts`, `pedirMpl`, `precargarMpl` | Circuit inspector. The JS-drawn circuit appears instantly from `circuito_json`. matplotlib (`figuras_json`) is requested only if the inspector stays open for 1 s, with a `vigente()` check |
| `prefetchPreview`, `cargarCircuito` | Pre-builds the next shot's circuit (300 ms debounce, LRU cache), so the inspector and the intro open instantly |
| `openHelp` / `closeHelp`, `setLab` | "?" help popovers (texts in `HELP`) and the settings menu |
| `bindUI` | All input wiring: keys (C = inspector, Esc = help → inspector → menu), sliders, sound, quality, scene callbacks (`pick`, `hover`, `key`, `quality`) |
| `avisarActividad` | `pointerdown` / `keydown` / `wheel` anywhere → `scene.marcarActividad()` (ends idle rest) |
| `init`, `demoIntro`, `alTerminarIntro` | Startup: creates the Intro, loads the connectome → body → backend (each stage logged on the boot console), then `intro.preparado()`. When the intro ends, the HUD gets focus on Fire |

## WormScene (`js/escena.js`)

**Public API** (what `main.js` and `intro.js` use):

| Group | Methods |
| --- | --- |
| Data | `setData(neurons, edges, glbBytes)`, `dataToScene(x, y, z)` |
| Loop | `setPaused(v)`, `requestRender()`, `marcarActividad()`, `ocupada` (property), `setQuality(q)`, `quality` |
| Neurons | `setActivity(values)` (0..1 per neuron), `setHighlight(indices)` (rings), `setTrail(indices)`, `setLabel(index, text)` (lock-on reticle), `setEdgesVisible(v)` |
| Effects | `fireLaser(index, intensity)`, `collapse(ventana, probs, spikeIdx, {superposition, collapse})` → Promise, `collapseNow()`, `cancelCollapse()` |
| Behaviour | `actuar(ev, index)` → Promise (resolves when the return to rest starts), `puedeActuar`, `setDrive(d)`, `centroOmega()`, `vulva()` |
| Food | `acercarComida(empuje)` (a forward push brings the food bacterium closer, a backward one moves it away; `actuar` calls it, and `main.js` calls it directly when nothing is animated), `comida` (state: distance to the mouth, smell glow, eating). The decorative bacteria are one `InstancedMesh` animated in its own shader (tumbling, Brownian drift, flow along x as the worm "moves"); they do not use `wormDeform` |
| Swim | `setSwim(on)`, `setSwimEnabled(v)`, `deform(p)` (JS copy of the shader deformation) |
| Camera | `flyTo(index, {dur, dist})`, `flyToPoint(p, …)`, `flyHome()`, `guardarVista()` / `volverVista(v)`, `resetView()`, `setCinematic(on)`, `setAutoRotate(v)`, `arrastrando` |
| Events | `on("pick" \| "hover" \| "key" \| "quality" \| "comer", fn)`; `comer` fires when the worm swallows the food |

**Render loop states.**
- *Paused:* `setPaused(true)`, or the canvas is off-screen (IntersectionObserver), or the tab is hidden. There is no animation loop, and in-flight collapse, behaviour and laser promises resolve at once so the cascade never hangs.
- *Asleep:* about 0.5 s with nothing moving removes the loop (`_loopFn = null`). `requestRender()` and input call `_wake()`.
- *Running:*
  - continuous animation (camera tween, damping after a drag, laser, collapse) renders every frame;
  - ambient motion (swimming, auto-rotate, behaviours) renders at 30 fps (`SWIM_FRAME`);
  - otherwise a frame is drawn only when `_dirty` is set.
- *Idle rest (`_reposo`):* after `REPOSO_MS` (20 s) without `marcarActividad()` and with `ocupada` false, ambient motion stops, so the loop falls asleep.

**Quality.**
- `QUALITY.alta/media/baja`: pixel ratio, bloom, bloom scale, `maxPx` render cap, and `nadoLibre: false` on Low.
- Auto starts on Medium. `_adaptQuality` samples only consecutive frames of continuous animation:
  - it drops a level below 28 fps;
  - it moves up to High once at 50 fps or more.
- The container's `data-calidad` lets CSS hide grain and vignette outside High.

**Drawing.**
- Neurons are one `InstancedMesh`; synapses are one `LineSegments`. Colours come from a 256-entry LUT.
- Each synapse is a polyline inside the body (`_ruta`, `_construirSinapsis`): it steps along the body axis every `PASO_RUTA` scene units, interpolates the distance to the midline and, in its middle stretch, runs in a nerve cord against the body wall (ventral by default, dorsal only when both neurons sit dorsally; each synapse at its own depth between `CORDON_R − CORDON_GROSOR` and `CORDON_R` of the radius), so it never covers the pharynx, intestine or gonad and never goes past `RADIO_RUTA`. The curvature shader bends it with the worm. `edgeOff[k]`…`edgeOff[k+1]` are synapse k's vertices; `edgeAt[k]` dims long ones (they share the cord, and additive blending would saturate). They are straight until the body loads. The cascade trail uses the same route.
- `_pintar(values, neurons?, synapses?)` repaints everything, or only a subset (the collapse repaints only the 10 window neurons and their synapses each frame).
- Every material that moves with the worm goes through `_sw(mat)` (or `_bodyMaterial`), which injects `SWIM_GLSL` / `wormDeform`. Motion is **curvature kinematics**: `_writeMotion` builds κ(s) from the eased `motion` values, `_integrarCurva` integrates the midline (constant length, anchored at mid-body) into a 64-sample table, and `_subirCurva` uploads it as the `uCurva` DataTexture. Shared uniforms in `swimU`: `uCurva`, `uCurvaX`, `uSwimT` (pump timing), `uBrillo`.
- **Posture memory** (`_postura`, `_recordarFlexion`, `_relajarPostura`, `_kPostura`, `_decaerPostura`): each `flexion` splits its bend into a passing gesture (`1 − POSTURA_K`) and a bump that stays in the posture (`POSTURA_K`). Remembered bumps add up in `_writeMotion` (capped at `POSTURA_MAX`), `relajar` (GABA) erases the posture around its neuron, and everything fades with `POSTURA_TAU`. `_animateSwim` keeps running while any bump is left.
- `deform(p)` reads the same table in JS for picking, labels and camera flights, so the two cannot drift apart.
- Organs from the `.glb` are mapped by name (`ORGANOS`) to their own `_bodyMaterial` (`MATERIAL_ORGANO`); `vulva()` reads the model's `vulva_um` extra.
- The body (`_bodyMaterial`) is a custom fluorescence shader: Fresnel rim, cuticle rings, grain, pharynx pumping.

**Effects are pooled.**
- The laser, collapse (halos that grow on demand, particles, flash, ring), trail and egg are built once in `_initFx`. They are warmed with `renderer.compileAsync` and reused by toggling one group per effect.
- Never create or dispose materials per step: that makes three.js recompile shaders, which causes a visible stutter.

**Picking** projects the 302 neurons to screen space: 14 px radius with a mouse, 28 px with a finger. There is no raycasting. Touch devices get `touch-action: pan-y` (one finger scrolls the page) and two-finger orbit.

## The other modules

- **`js/intro.js` (`Intro`)**:
  - `log(html)` adds a boot console line, called by `init()` as each stage really finishes;
  - `preparado()` shows the title, with the scene in cinematic orbit;
  - the constructor and `preparado()` call `sound.musicaTemprana({ piano: true })`: the ambience and the intro piano are scheduled at boot, so they play at once if the browser already allows audio, and otherwise from the first gesture;
  - the music starts in an intense intro mode (`intenso`: louder, filter open, piano opening arpeggio) and `preparado()` plays `tituloGolpe()` (boom + bright chord) when the title appears, if audio already runs;
  - `empezar()` (PRESS START) unlocks audio if it was still suspended;
  - `siguiente()` walks the `ESCENAS` table (each entry has a title, its text, the scene method in `accion`, and can have `auto` ms to advance by itself; not with reduced motion). The beat number and the progress pips come from the table. Two context beats (*Optogenetics*, *Nobel Prize 2026*) keep the worm in a slow orbit (`_orbita`, which also prefetches the AVM circuit); then `_luz`, `_superposicion` and `_colapso` drive the real scene: fly to AVM and fire, a 10-qubit superposition from the real `circuito_json` probabilities, then collapse to a neuron sampled from them;
  - `terminar()` (Esc / Skip / last beat) fades the piano out (`pianoOff`), returns the music to its subtle underwater mix (`musicaIntroFin`), unlocks the HUD (`_bloquear(false)`), plays the HUD slide-in (`.app.entrando`) and calls `alTerminar`;
  - `repetir()` replays from the menu.
- **`js/juego.js`**:
  - `Juego` keeps `descubiertas` (neurons that fired), `saltos`, `racha` and `logros`.
  - `paso(r, ctx)` and `conducta(ev)` unlock achievements from fields already in the step result. Each achievement in `LOGROS` has a title and a one-line physics explanation.
  - `Carga` is the hold-to-charge controller: θ = π·(1 − (1 − u)²) over 1.2 s; a press under 280 ms counts as a tap. Its rAF loop stops once it is full.
- **`js/conducta.js`**: the neuron → behaviour table (`conductaDe(name)`) and `Motor` (forward/backward drive, decays between steps). See [behaviour.md](behaviour.md).
- **`js/sonido.js` (`Sonido`)**:
  - everything is synthesised, with no audio files: laser chirp, superposition tones that glide into the measured neuron's pentatonic note (`notaNeurona`), bell, thud, per-behaviour cues, UI sounds, charge riser, achievement chime;
  - a generative underwater ambience (`musicaOn` / `musicaDuck` / `setMusicaVol`), plus a soft piano for the intro (`pianoOn` / `pianoOff`) that plays slow phrases from the current chord;
  - the chords are scheduled on the audio clock (`musica.proximo`), so music scheduled while the context is still suspended never piles up.
  - The context is created at boot (`musicaTemprana`) and starts running on the first user gesture if the browser kept it suspended; it is suspended while the tab is hidden or the sound is off.
- **`js/python.js` (`py`)**: one call at a time, with two queues. Quick calls (steps, circuits, startup) always go before pending slow ones (`figuras_json`, `precargar_figuras`). A call can carry `vigente()`, and it is skipped (rejected with `error.cancelado`) if that returns false when its turn comes.
- **`js/graficos.js`**: `groupedBars` (accessible SVG bars), `dataTable` (the table behind each chart), `esc` (HTML escaping), `SERIES_COLORS` (cyan theory, orange measured).
- **`js/util.js`**: `REDUCED`, `COARSE`, `EASE`, `sleep`, `T_SUPERPOSICION` / `T_COLAPSO` (collapse timings shared by the scene, the sound and the sweep), `escribiendo()`.

## DOM contract (`index.html` ↔ `main.js`)

`main.js` finds elements by id. Renaming an id breaks the page silently, so search for `$("id")` before changing markup.

| Area | Ids |
| --- | --- |
| Intro | `intro` (`data-fase`: boot / titulo / brief), `boot-log`, `intro-title`, `intro-start`, `intro-brief`, `brief-num`, `brief-title`, `brief-text`, `intro-next`, `intro-skip` |
| Stage | `app`, `stage`, `viewport` (scene container, `data-calidad`), `scene` (canvas), `sweep`, `tooltip`, `achievements`, `toast` |
| Top bar | `st-step`, `st-jumps`, `st-streak`, `st-neurons`, `backend-pill`, `sound-btn`, `sound-icon`, `lab-btn` |
| Mission log | `narration`, `narr-kicker`, `narr-text`, `chain-n`, `casc-log` |
| Scanner | `casc-card`, `casc-chips`, `casc-conducta`, `mini-circ`, `mini-circ-cap`, `mini-circ-svg`, `casc-bars`, `casc-legend`, `casc-table`, `inspect-btn` |
| Control deck | `hud-deck` (holds `--dose` and the `charging` class), `neuron-input`, `neuron-list`, `neuron-card`, `theta-val`, `dose-meter`, `pfire`, `tau`, `tau-val`, `fire-btn`, `fire-label`, `casc-stop`, `casc-estado`, `scene-help` |
| Settings menu | `lab`, `lab-close`, `theta`, `theta-val2`, `gamma`, `gamma-val`, `casc-pasos`, `casc-shots`, `music-vol`, `music-vol-val`, `show-edges`, `swim`, `autorotate`, `quality`, `replay-intro` |
| Inspector | `inspector`, `inspector-close`, `circ-title`, `circ-sub`, `circ-step`, `circ-vista` (radios `name="circ-vista"`), `circ-chips`, `circ-names`, `circ-scroll`, `circ-svg`, `circ-hint`, `counts-sub`, `counts`, `fig-estado`, `fig-box-c`, `fig-circ`, `fig-circ-cap`, `fig-box-h`, `fig-hist`, `fig-hist-cap` |
| Accessibility | `help-pop`, `help-text`, `sr-status` (live region for announcements) |

## CSS (`main.css`)

- **The first block is generated.** It is the Geist / Geist Mono base64 `@font-face` between `FONTS:BEGIN` and `FONTS:END`. Regenerate it with `tools/embed_fonts.py` and never edit it by hand.
- **Tokens** (`:root`):
  - `--void`: background.
  - Colours by meaning: `--q` cyan (quantum, superposition, theory), `--spike` orange (measured, spike, laser), `--warn` yellow (hardware), `--bio` teal (the worm's behaviour), `--ok`, `--bad`.
  - Text: `--text`, `--dim`, `--faint`. All text is at least 5.5:1 on the background.
  - `--ease`, `--chamfer`, `--stage-h`.
- **Building blocks:**
  - `.hud-panel` (cyan corner brackets);
  - `.btn-hud` / `.icon-hud`;
  - `.fire-btn` (chamfered, fills with `--dose` while charging);
  - `.lbl` (mono uppercase label);
  - `.chip`.
- **Layout.** Above 980 px, the HUD panels are absolute overlays on the full-bleed 3D view. At 980 px and below, the stage becomes a column with the order viewport, deck, log, scanner. Breakpoints:
  - 1200 px;
  - 980 px;
  - 560 px;
  - portrait phones;
  - landscape phones (height 500 px or less);
  - `(pointer: coarse)`: 44 px targets and 16 px inputs.
- **Motion.**
  - Only `transform` and `opacity`, with `--ease`.
  - JS-driven one-shots use `Element.animate`.
  - `prefers-reduced-motion` turns off every animation, the glitch and the sweep.
- **The intro** hides the HUD with `.app.en-intro`. Its phases are `#intro[data-fase=…]`.

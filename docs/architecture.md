# Architecture

The app is one web page that runs entirely in the browser inside Qollab. There is no server.

- **Frontend** (`frontend/`): HTML, CSS and ES modules. three.js draws the worm, plain SVG draws the charts, and the Web Audio API makes the sound.
- **Backend** (`backend/cerebro_q/`): a Python package that runs in **Pyodide** in the same page. It builds and runs Qiskit circuits on the `backend` object that the viewer picks when they press **Run** in Qollab.

`tools/build_qollab.py` flattens both into the folder that is uploaded to Qollab (see [development.md](development.md)).

## Runtime rules (Qollab)

| Rule | Consequence in the code |
| --- | --- |
| Python runs in Pyodide; JS imports it by module name | `frontend/js/python.js` does `import * as api from "cerebro_q.api"` and calls `fn.callPromising(...)`. Every Python function returns a JSON string. |
| Pyodide runs one call at a time | `python.js` queues calls (`enCola`), so a background matplotlib load never interleaves with a job. |
| Qollab creates `backend` before `main.js` runs | `main.js` reads the global `backend` and passes it to `paso_json` and `backend_json`. |
| IonQ accepts **one job per Run** | The cascade runs a single step on IonQ, then the button locks. Real hardware needs a confirming second click. |
| JS cannot read project files | Python reads `data/*` (literal paths in `cerebro_q/datos.py`) and hands JS the 3D body as base64. |
| `three` 0.186.1 is importable by name | `escena.js` imports `three` and `three/addons/...`. No vendored copy. |
| At most 100 files, each ≤ 2 MB; `index.html` is pasted into `<body>` | Checked by `build_qollab.py` and `TestReglasQollab`. |
| No `localStorage` | Preferences live in memory. |

## Module map

```
frontend/
  index.html        intro (boot / title / briefing), HUD over the 3D stage (stats bar, mission log, scanner, control
                    deck), settings menu (Esc), circuit inspector (C)
  main.js           page state and UI: the cascade loop (fire), hold-to-charge wiring, HUD stats and achievements,
                    narration, charts, circuit inspector, help, keyboard, sound wiring
  main.css          the HUD design system (tokens, Geist fonts embedded as base64, panels, intro); the only CSS Qollab loads
  js/intro.js       Intro: boot console fed by init(), title + PRESS START, three beats on the real AVM circuit, skip/replay
  js/juego.js       game layer: Carga (hold to charge θ), Juego (stats, achievements that each explain one physics fact)
  js/escena.js      WormScene: three.js scene, worm body shader + swim wave, neurons (InstancedMesh), synapses
                    (LineSegments), laser, collapse animation, picking, render-on-demand loop
  js/graficos.js    groupedBars + dataTable (accessible SVG bar chart with its data table), esc()
  js/python.js      the Pyodide bridge (py.conectoma, py.paso, py.circuito, py.figuras, ...)
  js/sonido.js      Sonido: laser chirp, superposition tones, collapse, per-neuron pentatonic note, ambient music,
                    UI sounds (tick, select, confirm, start whoosh), charge riser, achievement chime
backend/
  cerebro_q/api.py        the 7 functions JS calls (all return JSON text)
  cerebro_q/datos.py      loads neurons.json, the Cook 2019 edge list and gusano.glb; synapse counts
  cerebro_q/fisica.py     J = W/λmax, neuron index, exact walk probabilities P_k(t)
  cerebro_q/circuitos.py  Trotter hops, op list → Qiskit, numpy statevector simulator, count_ops helper
  cerebro_q/cascada.py    10-neuron window, the step circuit (PauliEvolutionGate + SuzukiTrotter), cached
                          build/transpile, ejecutar_paso (one job, post-selection, random valid shot)
  cerebro_q/analisis.py   marginals and spike counting (symmetry post-selection)
  cerebro_q/visual.py     Qiskit figures: draw("mpl"), plot_histogram, plot_distribution (lazy matplotlib)
  data/                   neurons.json, connectome_cook2019.csv, gusano.glb
tests/backend/            unit tests + referencia.py (exact 2^n reference, test-only)
tests/e2e/smoke_test.py   Playwright smoke test against tools/dev_server.py
tools/                    build_qollab.py, dev_server.py + qollab_shim/, optimize_glb.py, zeno_analysis.py
```

The physics behind each module is in [theory.md](theory.md) (Spanish). The cascade design is in [cascade.md](cascade.md).

## Python API called by the page

| JS (`py.*`) | Python (`cerebro_q.api`) | Returns |
| --- | --- | --- |
| `conectoma()` | `conectoma_json(1200)` | 302 neurons (name, position, type, neurotransmitters, degree) and the 1,200 connections with the most real synapses |
| `cuerpo()` | `cuerpo_glb()` | `gusano.glb` as base64 (decoded with `Uint8Array.fromBase64` when available) |
| `backendInfo(backend)` | `backend_json` | backend name, whether it is IonQ, whether it is hardware |
| `paso(backend, p)` | `paso_json` | one cascade step: window, counts, measured vs. theory, spike, valid/empty fractions, gate counts |
| `circuito(p)` | `circuito_json` | the step circuit without running it: compact and expanded instruction lists, ideal distribution |
| `figuras(p)` | `figuras_json` | `draw("mpl")` circuit and histogram as SVG data URIs |
| `precargarFiguras()` | `precargar_figuras` | loads matplotlib (≈30 s the first time); called when the inspector is first opened |

`python.js` runs one Python call at a time with two queues. Quick calls (steps, circuits, startup) always go before
pending slow ones (`figuras_json`, `precargar_figuras`), so the inspector never waits behind a matplotlib drawing that
hasn't started yet.

## Keyboard

Space (hold) charges, Enter fires, C toggles the inspector, Esc skips the intro or closes help, the inspector and the menu (with nothing open it opens the menu). On the worm: R resets the view, +/− zoom, ↑/↓ rotate.

## One cascade step

```mermaid
sequenceDiagram
  participant UI as main.js (fire)
  participant Py as cerebro_q (Pyodide)
  participant B as backend (Qollab)
  participant S as escena.js / sonido.js
  UI->>Py: paso_json(backend, {centro, θ, τ, γ, pasos_trotter, shots})
  Py->>Py: ventana(centro) → 10 neurons; circuito_de (cached)
  Py->>Py: transpile(optimization_level=1) (cached per backend)
  Py->>B: backend.run(circuit, shots) — ONE job
  B-->>Py: counts
  Py->>Py: contar_spikes → valid shots; pick one at random → spike
  Py-->>UI: JSON (window, measured, theory, spike, …)
  UI->>S: superposition → collapse animation + sound
  UI->>UI: charts, spike chain, narration; next centre = spike
```

The laser angle θ applies only to the first step. Later steps start with the neuron that fired fully excited (θ = π).

## Design system (sci-fi lab HUD)

- **One colour per meaning.** `--q` cyan is quantum: superposition, theory bars and the window rings. `--spike` orange is measured: the spike, the laser charge, measured bars and the trail. `--warn` yellow is real hardware (credits). Neuron types keep teal, violet and amber.
- **Type.** Geist for display text (uppercase, tight tracking) and Geist Mono for the HUD (labels, tabular numbers). Both are OFL and embedded by `tools/embed_fonts.py`.
- **Shapes.** Thin hairline panels with cyan corner brackets, and a chamfered fire button. No rounded cards and no glass blur.
- **Motion.** Only `transform` and `opacity`, with one easing `cubic-bezier(.2,.8,.2,1)`. Pieces:
  - the HUD slides in after the intro;
  - stats bump when they change;
  - achievements drop in;
  - a one-shot scanline sweep plays on each collapse.

  `prefers-reduced-motion` disables all of it.
- **Texture.** A static SVG grain and a vignette over the canvas. They are not animated.

## Game layer

- **Hold to charge.** The charge is the laser dose θ, rising from 0 to π with an ease-out. The meter shows the fire chance sin²(θ/2), and that θ goes into the first circuit's `RX(θ)`. A tap or Enter uses the dose set in the menu.
- **Stats.** Steps, jumps, the current streak, and the neurons that actually fired (out of 302).
- **Achievements.** Triggered from fields already in each step result (`salto`, `spike`, `motivo_fin`, `spike_vecina`). Each one states the physics it illustrates. Nothing is scored that the physics doesn't say.

## Performance design

- **The render loop runs only when the canvas can be seen.** It stops during the boot console, while the inspector is open, when the canvas is scrolled off-screen (IntersectionObserver) and when the tab is hidden. Otherwise a frame is drawn only when something changed. The idle swim wave is capped at 30 fps.
- **One draw call each** for the 302 neurons (`InstancedMesh`) and the synapses (`LineSegments`). Colours come from a precomputed lookup table. The swim runs in the vertex shader. Picking projects 302 points; there is no raycasting.
- **Python caches** the connectome, J, the windows, and each step circuit plus its transpiled version.
- **matplotlib is loaded only if the inspector is opened.** The JS-drawn circuit appears instantly in the meantime.
- **Audio** is suspended while the tab is hidden or the sound is off.
- **The body file** is 316 KB: no normals (the page recomputes them) and 16-bit indices (`tools/optimize_glb.py`).

## Conventions

| Topic | Convention |
| --- | --- |
| Qubit order | Qubit q = bit q of the index (q0 = least significant); in Qiskit count strings, qubit 0 is the rightmost character. Qubit i is neuron i of the window, and the window centre is qubit 0. |
| Time | Units of 1/γ with ‖J‖ = 1 |
| Language | Code comments and identifiers in Spanish; user-facing text in English |
| 3D frames | See [3d-model.md](3d-model.md) |

## Data provenance

The neurons and synapses are the real ones.

- **Connectome:** Cook, S. J. et al. (2019). *Whole-animal connectomes of both* Caenorhabditis elegans *sexes.* Nature 571, 63–71. https://doi.org/10.1038/s41586-019-1352-7. It was reconstructed from serial-section electron micrographs, with every chemical synapse and gap junction traced. The data is published at https://wormwiring.org.
- **It builds on** White, J. G. et al. (1986), *The structure of the nervous system of the nematode* C. elegans, Phil. Trans. R. Soc. B 314, 1–340. https://doi.org/10.1098/rstb.1986.0056
- **Edge list:** OpenWorm c302, `herm_full_edgelist.csv`, at https://github.com/openworm/c302. It is filtered to the 302 neurons, with names normalized (`DA01` → `DA1`). That leaves 3,604 chemical and 2,155 electrical entries in `backend/data/connectome_cook2019.csv`.
- **Soma positions and neuron types:** OpenWorm CElegansNeuroML, at https://github.com/openworm/CElegansNeuroML, and c302's `owmeta_cache.json`.
- **In the app:** the footer links to the Nature paper and to c302. The **?** next to "Neuron to illuminate" explains the data.

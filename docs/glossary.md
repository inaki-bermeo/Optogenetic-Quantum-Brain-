# Glossary: Spanish identifiers in the code

The code (comments, identifiers, JSON keys from Python) is in Spanish, and everything the user reads is in English. This table maps the names you will meet to what they mean.

## Physics and the cascade

| Name | Where | Meaning |
| --- | --- | --- |
| `conectoma` | `api.conectoma_json`, `py.conectoma()` | The connectome: 302 neurons and the synapses drawn |
| `acoplamientos` | `fisica.acoplamientos()` | Couplings: J (normalised adjacency), the neuron names, λ_max |
| `sinapsis`, `conteo_sinapsis` | `datos.py` | Synapse list, and synapse count per pair of neurons (used to order neighbours) |
| `fuente` | intro demo, docs | Source neuron, the one the laser hits |
| `centro` | `paso_json`, `fire()` | The centre of the current window: the neuron that fired last |
| `ventana`, `ventana_indices` | `paso_json`, `circuito_json` | The window: the centre plus its 9 most connected neighbours (10 qubits), as names and as global indices |
| `paso`, `pasos` | `paso_json`, `#casc-pasos` | One cascade step (one circuit, one job), or the number of steps per laser shot |
| `pasos_trotter` | step params | Second-order Trotter–Suzuki slices per step: 1 if τ ≤ 4.5, 2 if τ ≤ 9, 3 above |
| `tau` (τ), `theta` (θ), `gamma` (γ) | step params | Time between measurements; laser dose (`RX(θ)`); coupling strength |
| `conteos` | `paso_json` | Qiskit counts: bit string → number of shots (qubit 0 is the rightmost character) |
| `medida` | `paso_json` | Measured probability that each window neuron is the spike, given that there was a spike |
| `teoria_ventana` | `paso_json` | The exact walk in the isolated window, normalised; the "Theory" bars |
| `fraccion_valida`, `fraccion_vacio` | `paso_json` | Share of shots that pass post-selection (0 or 1 excitation), and share with no excitation |
| `spike`, `spike_indice` | `paso_json` | The neuron that came out as 1 in the randomly chosen valid shot: name and global index |
| `spike_vecina` | `paso_json` | Whether the spike landed on a direct neighbour of the centre (`false` means 2 synapses away) |
| `salto` | `fire()` (JS only) | "Jump": the spike is a different neuron from the centre |
| `motivo_fin` | `paso_json` | Why the cascade stops: `"vacio"` (no neuron fired) or `"sin_shots_validos"` (post-selection left nothing) |
| `vacio` | sound, docs | An empty shot: no excitation measured |
| `ops_escritas`, `ops_transpilado` | `paso_json` | Gate counts as written, and after `transpile` for the backend |
| `compacta`, `completa` | `circuito_json` | Circuit views: `PauliEvolutionGate` as one box, or its expansion into RXX/RYY gates |
| `instrucciones` | `circuito_json` | List of `{n: gate name, q: qubits, p: params, l: label}` |
| `ideal_marginales`, `ideal_vacio` | `circuito_json` | Ideal (statevector) P(each qubit = 1) and P(all 0) of the exact circuit |
| `figuras` | `figuras_json` | Qiskit's own `draw("mpl")` figure and the histogram, as SVG data URIs |
| `walk`, `probabilidades_walk` | `fisica.py` | Exact continuous-time quantum walk P_k(t) |
| `referencia` | `tests/backend/referencia.py` | Exact 2^n reference used only by the tests |

## Frontend

| Name | Where | Meaning |
| --- | --- | --- |
| `escena`, `WormScene` | `js/escena.js` | The three.js scene |
| `cuerpo`, `faringe`, `grinder`, `anillo`, `intestino`, `gonada`, `huevos` | `escena.js`, `gusano.glb` | Body and organ meshes (pharynx, its grinder, nerve ring, intestine, gonad, uterine eggs) |
| `nado`, `swim` | `escena.js` | The crawling wave (a curvature wave along the body) |
| `curva`, `kappa`, `uCurva` | `escena.js` | Curvature kinematics: κ(s) along the body, the integrated midline table and its texture |
| `actuar`, `conducta`, `programa` | `escena.js`, `js/conducta.js` | Act out a behaviour; the behaviour table entry; its motion program (`reversa`, `avance`, `omega`, …). See [behaviour.md](behaviour.md) |
| `bacterias`, `comida`, `acercarComida`, `comer`, `olfato`, `giro`, `flujo` | `escena.js`, `conducta.js` | The neon bacteria; the food bacterium; bring it closer by a push; the swallow event; the chemotaxis behaviour (AWA, AWC, ASE); the head turn towards the food; the background flow that stands for the worm's own movement |
| `Motor`, `empuje`, `setDrive` | `conducta.js`, `escena.js` | Forward/backward drive that the command neurons accumulate during a cascade |
| `colapso`, `collapse` | `escena.js` | The superposition → measurement animation of one step |
| `barrido` | `main.js` | The one-shot scanline sweep that plays with each collapse |
| `reposo`, `marcarActividad`, `ocupada` | `escena.js` | Idle rest (ambient motion stops after 20 s without input); the call that ends it; "a cascade is running, never rest" |
| `pintar` (`_pintar`) | `escena.js` | Write neuron colours/sizes and synapse colours (all of them, or only a subset) |
| `calidad` (`alta`/`media`/`baja`) | `escena.js` `QUALITY`, `data-calidad` | Graphics quality: High / Medium / Low |
| `Carga`, `cargando` | `js/juego.js` | Hold-to-charge controller for the laser dose θ |
| `Juego`, `logro(s)`, `racha`, `descubiertas` | `js/juego.js` | Game layer: achievements, streak, neurons discovered |
| `Intro`, `ESCENAS`, `accion` (`_orbita`, `_luz`, `_superposicion`, `_colapso`), `preparado`, `terminar` | `js/intro.js` | The phased intro: boot → title → five beats (optogenetics, Nobel 2026, light, superposition, collapse) → HUD |
| `Sonido`, `medicion`, `disparo`, `musica` | `js/sonido.js` | Web Audio engine: the measurement sound, the fired neuron's bell, the ambient music |
| `enCola`, `vigente` | `js/python.js` | The Pyodide call queue; the "is this call still wanted?" check for slow (matplotlib) calls |
| `respirar` | `js/python.js` | Yield one frame before a long Python call, so the UI can paint |
| `REDUCED`, `COARSE`, `escribiendo` | `js/util.js` | `prefers-reduced-motion`; touch as the main pointer; "the focus is in a text field" |
| `narrate`, `narración` | `main.js` | The mission log text over the worm |
| `inspector` | `main.js` | The circuit inspector overlay (key C) |
| `lab` | `index.html` `#lab` | The settings menu (Esc), historically "Lab settings" |

## Tools

| Name | Meaning |
| --- | --- |
| `build_qollab.py` / `construir` | Builds `dist/qollab/`, the flat folder to upload |
| `dev_server.py`, `FUNCIONES` | The local Qollab imitation, and the Python functions it exposes to JS |
| `qollab_shim/puente_api.js` | The bridge that imitates `cerebro_q.api` over HTTP |
| `qiskit_simulado` | The numpy imitation of Qiskit, used when real Qiskit is not installed |
| `zeno_analysis.py` | Reproduces the τ table and the coherent / measured / window / classical comparison |

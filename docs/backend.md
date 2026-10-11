# Backend internals (`backend/cerebro_q`)

A small Python package that runs **in the browser** under Pyodide (inside Qollab), or in the local harness (`tools/dev_server.py`). It loads the real connectome, builds each cascade step as a Qiskit circuit, runs it on the backend the viewer picked, and returns JSON text to the page. The physics behind it is in [theory.md](theory.md) (Spanish); the cascade design is in [cascade.md](cascade.md).

## Rules for this package

- **Only what the page calls.** `api.py` exposes exactly the 7 functions below. Offline analysis lives in `tools/` (`zeno_analysis.py`), and test-only references in `tests/backend/referencia.py`.
- **Every API function returns a JSON string** (`api._json`): numpy values are converted, floats rounded to 6 digits, NaN and ∞ become `null`. JS does `JSON.parse`, so it never depends on Pyodide's proxy conversion.
- **Data paths are literal strings** (`"data/neurons.json"` in `datos.py`). Qollab only ships project files whose paths appear literally in the code. Paths are relative to the project root in Qollab, which is `backend/` locally (the harness and the tests `chdir` there).
- **Heavy imports stay lazy.** Importing `api` loads only numpy. Qiskit is imported inside functions, and matplotlib only in `visual.py` when a figure is requested.
- **Qiskit may be missing** (the numpy imitation in `tools/qollab_shim/qiskit_simulado`). `circuito_paso` then falls back to explicit RXX/RYY gates, and `_instrucciones` reads the imitation's tuples.
- **New API function?** Also add it to `FUNCIONES` in `tools/dev_server.py` and to `tools/qollab_shim/puente_api.js`, and give it a wrapper in `frontend/js/python.js`.

## API contract (`api.py`)

| Python | JS (`py.*`) | Input | Output (JSON) |
| --- | --- | --- | --- |
| `conectoma_json(max_aristas=1200)` | `conectoma()` | — | `{neurons: [{name, x, y, z, type, neurotransmitters, degree}], edges: [[i, j, J_ij]], spectral_scale}`. The 1,200 drawn edges are the pairs with the most real synapses; `type` ∈ sensory / interneuron / motor / unknown; positions in µm |
| `cuerpo_glb()` | `cuerpo()` | — | base64 of `data/gusano.glb` (`""` if missing). JS decodes it to an `ArrayBuffer` |
| `backend_json(backend)` | `backendInfo(backend)` | the Qollab `backend` object | `{nombre, ionq, hardware, qubits}` |
| `paso_json(backend, params)` | `paso(backend, params)` | `{centro, theta, tau, gamma, pasos_trotter, shots, semilla?}` | One cascade step; see the table below. **One job** on the backend |
| `circuito_json(params)` | `circuito(params)` | `{centro, theta, tau, gamma, pasos_trotter}` | The same step circuit **without running it**: `{centro, neuronas, ventana_indices, metodo, theta, tau, gamma, pasos_trotter, compacta: {instrucciones, ops, profundidad}, completa: {…}, ideal_marginales, ideal_vacio}` |
| `figuras_json(params)` | `figuras(params, {vigente})` | the circuit params plus `vista` (`"compacta"` or `"expandida"`) and optional `conteos` | `{neuronas, ops, profundidad, circuito_svg, histograma_svg, histograma_tipo}` (SVG data URIs; `"medido"` with counts, `"ideal"` without) |
| `precargar_figuras()` | `precargarFiguras({vigente})` | — | `{ok}` or `{ok: false, error}`; loads matplotlib (about 30 s the first time in Pyodide) |

`instrucciones` items look like `{n: "rxx", q: [0, 3], p: [0.0153], l: null}`, in circuit order. The page draws them itself, so the inspector appears instantly.

### `paso_json` result

| Field | Meaning |
| --- | --- |
| `centro` | Name of the window centre (the neuron that fired last) |
| `ventana`, `ventana_indices` | The 10 neuron names and their global indices. Order = qubit order; qubit 0 is the centre |
| `conteos` | Raw Qiskit counts `{bitstring: shots}` (qubit 0 is the rightmost bit) |
| `medida` | Measured P(spike on each window neuron \| one spike), from the valid shots |
| `teoria_ventana` | Exact walk in the isolated window at τ, normalised: the "Theory" bars |
| `fraccion_valida` | Share of shots with at most one excitation (symmetry post-selection) |
| `fraccion_vacio` | Share of shots with no excitation |
| `spike`, `spike_indice` | The neuron at 1 in **one valid shot chosen at random** (seeded by `semilla` if given), or `null` |
| `spike_vecina` | Whether the spike is a direct neighbour of the centre (`false` means the window was filled at distance 2) |
| `motivo_fin` | `null`, `"vacio"` (the chosen shot had no excitation) or `"sin_shots_validos"` |
| `shots`, `ops_escritas`, `ops_transpilado`, `backend` | Shot count, gate counts before and after `transpile`, backend name |

## Modules

| Module | Role | Key functions |
| --- | --- | --- |
| `datos.py` | Load the data | `neuronas()` (positions and type), `sinapsis()` (Cook 2019 edge list), `conteo_sinapsis()` (symmetric synapse-count matrix), `cuerpo_glb_base64()`, `normalizar_nombre("DA01") → "DA1"` |
| `fisica.py` | Exact physics | `acoplamientos()` → (J = binary W / λ_max, names, λ_max); `indice(name)`; `probabilidades_walk(eigh(J), source, times, θ, γ)` = sin²(θ/2)·\|[e^{−iγJt}]_kj\|² |
| `cascada.py` | The cascade step | `ventana(centre)` (centre plus 9 neighbours ordered by synapse count, filled at distance 2 if needed); `circuito_paso` (`RX(θ)` or `X` on qubit 0, then `PauliEvolutionGate` + `SuzukiTrotter(order=2)`, then measure all); `circuito_de` / `_transpilado` (LRU caches); `ejecutar_paso` (one job, post-selection, random valid shot) |
| `circuitos.py` | Circuit helpers | `saltos_trotter` (Strang hops, merging consecutive halves); `operaciones` / `a_qiskit` (op list ↔ Qiskit RX/RXX/RYY); `probabilidades_ideales` (numpy statevector, same bit order as Qiskit); `contar_ops` |
| `analisis.py` | Post-selection | `contar_spikes(conteos)` → (valid shots per qubit, empty shots, total); `marginales` |
| `visual.py` | Qiskit figures (lazy matplotlib) | `circuito` (`draw("mpl")`, one named wire per neuron), `histograma` (`plot_histogram`), `distribucion_ideal` (`plot_distribution` of the statevector), `etiqueta_estado` |

## Caching (performance)

- `lru_cache` holds the data, J, the name index, the windows (512), each built step circuit (`circuito_de`, 64 entries) and its transpiled version per backend (`_transpilado`, 64).
- Repeated centres (common with short τ) therefore cost no rebuild or transpile. `circuito_json` and `figuras_json` reuse the circuit that just ran.
- Do not mutate a circuit returned by `circuito_de`. `decompose()` and `transpile()` return new objects.

## Conventions

- **Qubit order.** Qubit q is bit q of the basis-state index; Qiskit count strings put qubit 0 on the right. Qubit i is window neuron i, and qubit 0 is the centre.
- **Units.** Time is in units of 1/γ, with ‖J‖ = 1 (spectral normalisation). θ is in radians: θ = π means the laser always fires.
- **Binary weights** (a team decision): J only says "connected or not". Synapse counts are used only to *order* the neighbours of a window.

## Tests (`tests/backend/test_cerebro_q.py`)

`python -m unittest discover -s tests/backend` (24 tests). They run with real Qiskit if it is installed; otherwise with the imitation, and the figure tests are skipped.

| Class | Covers |
| --- | --- |
| `TestFisica` | J symmetric with ‖J‖ = 1; walk conserves norm; single-excitation XY = walk (against the exact 2^n reference) |
| `TestCircuitos` | Trotter converges; Qiskit bit order and spike counting |
| `TestApiQollab` | `conectoma_json` (edges with the most synapses), `cuerpo_glb`, `backend_json` |
| `TestCascada` | Window construction (and AVM's exact window), circuit vs theory, one step on a backend, empty shot |
| `TestZeno` | The τ table on the card (93 / 81 / 60 %) and the Zeno comparison (`tools/zeno_analysis.py`) |
| `TestCircuitoInstantaneo` | `circuito_json` views, and that it matches the circuit that runs |
| `TestFiguras` | matplotlib figures (real Qiskit only) |
| `TestReglasQollab` | Builds `dist/qollab` and checks Qollab's rules: file limits, `index.html` shape, allowed JS imports, literal data paths, no API keys |

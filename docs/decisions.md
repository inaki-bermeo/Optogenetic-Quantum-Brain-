# Decisions log

The important decisions behind the project, with the reason for each and where it lives. Read this before "fixing" something that looks odd: it is usually deliberate. Newest first within each section. PR numbers refer to `github.com/inaki-bermeo/Optogenetic-Quantum-Brain-`.

## Product and physics

| Decision | Why | Where |
| --- | --- | --- |
| **The worm acts out the measured neuron's real behaviour** (130 of 302 neurons). Neurons with no established motor effect do nothing | Every row is backed by lesion or optogenetics literature; the quantum cascade stays labelled as the model, the behaviour as real biology | `js/conducta.js`, [behaviour.md](behaviour.md) (PR #4) |
| **Game layer without fake physics.** Hold-to-charge *is* the dose θ; stats count real spikes; each achievement explains one physics fact | The game must teach, not misrepresent | `js/juego.js` (PR #3) |
| **Spike cascade on 10-neuron windows**: each jump is the measurement of a real 10-qubit circuit (the centre plus its 9 most-connected neighbours) | Makes the visible animation come from quantum measurement rather than a classical calculation. 302 qubits are impossible, and 10 fit any simulator and IonQ | `cascada.py`, [cascade.md](cascade.md) |
| **τ = 8 by default** (slider 2–12) | Below about 3 the spike barely moves (quantum Zeno effect); much higher and each step is just an isolated 10-neuron circuit | [cascade.md](cascade.md) §2.2 |
| **The laser dose θ applies only to the first step**; later centres start fully excited | The laser hits one neuron once; later steps begin from a measured spike | `fire()` in `main.js` |
| **The next centre is one valid shot drawn at random**, not the most likely neuron | Faithful to measurement: every run differs (`semilla` makes it reproducible in tests) | `ejecutar_paso` |
| **Symmetry post-selection**: shots with 2+ excitations are discarded | The XY Hamiltonian conserves the excitation number, so those shots are hardware errors | `analisis.contar_spikes` |
| **Binary synapse weights** (connected or not) | Team decision. Counts are kept only to order a window's neighbours | `fisica.acoplamientos`, `datos.conteo_sinapsis` |
| **Honest about quantum advantage**: with one laser the problem is classically simulable | Stated on the card and in theory.md; several lasers is where it gets hard | `PROJECT_CARD.md`, [theory.md](theory.md) |
| **One IonQ job per Run**: on IonQ the cascade runs one step, then locks. Hardware needs a confirming second click | Qollab's rule; hardware costs credits | `fire()`, `renderBackendInfo()` |

## Platform and repository

| Decision | Why | Where |
| --- | --- | --- |
| **Source tree plus a flat Qollab build.** `frontend/` and `backend/` in the repo; `tools/build_qollab.py` builds `dist/qollab/` | Qollab needs a flat project (`cerebro_q.api` imported by name, literal `data/` paths). The repo should still look like a normal full-stack project | (PR #2) |
| **Repo → Qollab, never the other way** | A workspace sync once overwrote newer docs and code with older ones (commit `a7ccf54`) | [development.md](development.md) |
| **No server, no extra JS libraries, fonts embedded as base64** | Qollab only loads `main.css` and named imports (`three`, `cerebro_q.api`); JS can't fetch project files | `tools/embed_fonts.py` |
| **Every Python API function returns JSON text** | Avoids depending on how Pyodide converts dicts and lists | `api._json`, `js/python.js` |
| **The backend contains only what the page calls**; analysis lives in `tools/`, references in `tests/` | Smaller download, and a clear contract | (PR #2) |
| **English UI, Spanish code** | The audience is international; the team writes code in Spanish. [glossary.md](glossary.md) bridges the two | — |
| **Theory docs stay in Spanish** (`theory.md`, `cascade.md`, `3d-model.md`) | Written by the team; English summaries live on the card and in architecture.md | — |

## Design and UX

| Decision | Why | Where |
| --- | --- | --- |
| **Sci-fi lab HUD**, one colour per meaning (cyan quantum, orange measured, yellow hardware, teal biology) | User's direction (references: basement.studio, Paisanos). The colour alone tells you what kind of thing you're looking at | `main.css`, [architecture.md](architecture.md) (PR #3) |
| **Phased intro**: a boot console fed by real loading stages, then the title, then three beats on the real AVM circuit | Feels like a game, and teaches the three ideas (light, superposition, collapse) using real data | `js/intro.js` (PR #3) |
| **Accessibility is a requirement**: keyboard-only paths, the intro as a modal dialog, live regions, a table behind every chart, reduced motion, contrast of at least 5.5:1 | Hackathon rule and basic quality | everywhere; checked by the e2e smoke test |
| **On phones, the control deck sits right under the 3D view**; one finger scrolls the page, two fingers orbit | The worm is long and horizontal; the Fire button must be reachable without scrolling past everything | `main.css` (≤ 980 px), `escena.js` (PR #5) |

## Performance (PR #2, #5)

| Decision | Why |
| --- | --- |
| **Render on demand.** The loop stops after ~0.5 s with nothing moving, stops entirely while the canvas can't be seen, and rests after 20 s without input | Weak laptops and battery: an idle page draws nothing |
| **Ambient motion at 30 fps; Auto quality starts on Medium; render pixels capped per level; grain and vignette only on High** | The canvas is full-bleed, so fill rate dominates on integrated GPUs |
| **Auto quality measures only full-rate animation frames** | The 30 fps cap would otherwise make every GPU look fast and wrongly upgrade weak ones (a bug found by `/simplify`) |
| **Effects are pooled and their shaders compiled up front** | Creating and disposing materials per step made three.js recompile shaders, a stutter on every step |
| **The next step doesn't wait for decoration**: a behaviour releases the cascade when the worm starts returning to rest | Cut a 6-step cascade from about 47 s to about 22–29 s |
| **Quick Python calls go before slow matplotlib calls, which carry `vigente()`** | Pyodide runs one call at a time; a 30 s matplotlib load must never block a laser shot |
| **The 3D body file has no normals and uses 16-bit indices** (`tools/optimize_glb.py`) | 631 KB → 316 KB, same geometry; the page recomputes normals anyway |

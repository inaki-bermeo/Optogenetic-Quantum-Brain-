# Docs index (start here)

Optogenetic Quantum Brain is a single web page that runs inside **Qollab**. A "laser" fires a real *C. elegans* neuron. Every jump of the resulting spike is the measurement of a real 10-qubit **Qiskit** circuit, and the 3D worm acts out the behaviour of each neuron that fires.

- The page is HTML/CSS/ES modules in `frontend/`.
- The physics and circuits are a Python package, `backend/cerebro_q`, which runs in the browser through **Pyodide**.
- `tools/build_qollab.py` flattens both into the folder uploaded to Qollab.

## Reading order for a new agent

1. **[architecture.md](architecture.md)**: Qollab runtime rules, module map, the Python API, one cascade step, design system, performance design, data provenance.
2. **[glossary.md](glossary.md)**: Spanish identifiers in the code (`centro`, `ventana`, `paso`, `conteos`, `reposo`, …) and their meaning. The code is in Spanish; user-facing text is in English.
3. **[development.md](development.md)**: set up, run locally, test, and publish to Qollab.
4. Then read the doc for the area you are changing (below).

## By area

| You are changing… | Read |
| --- | --- |
| Anything in `frontend/` (page flow, HUD, intro, game layer, sound, 3D scene) | [frontend.md](frontend.md) |
| `backend/cerebro_q` or the JSON the page receives | [backend.md](backend.md) |
| The spike cascade (window of 10 neurons, τ, Zeno effect) | [cascade.md](cascade.md) (Spanish) |
| What the worm does when a neuron fires; the swim/behaviour shader | [behaviour.md](behaviour.md) |
| The physics: J, XY Hamiltonian, laser, Trotter, IonQ compilation, post-selection | [theory.md](theory.md) (Spanish), [theory_tex/](theory_tex/) |
| The 3D body mesh and coordinate frames | [3d-model.md](3d-model.md) (Spanish) |
| A common change (add an achievement, a Python function, a HUD control, a behaviour…) | [recipes.md](recipes.md) |
| Why something is the way it is | [decisions.md](decisions.md) |
| The public project page | [`PROJECT_CARD.md`](../PROJECT_CARD.md) and [`README.md`](../README.md), always kept in sync |

## Non-negotiables

- **Qollab constraints.** No server. JS cannot read project files. Python is imported by module name. There is one IonQ job per Run. At most 100 files, each 2 MB or less. `index.html` is pasted into `<body>`. See [architecture.md](architecture.md).
- **The repo is the source of truth.** Changes flow repo → Qollab with `python tools/build_qollab.py`, never the other way.
- **Physics stays honest.**
  - The game layer (charge, stats, achievements) never changes the physics.
  - Every number on the card or in the docs must be reproducible: `tools/zeno_analysis.py` and `tests/backend`.
- **Accessibility is a requirement**, not polish:
  - keyboard-only paths;
  - `prefers-reduced-motion`;
  - screen-reader announcements;
  - a data table behind every chart;
  - contrast of at least 4.5:1.
- **Before a PR**, run `python -m unittest discover -s tests/backend` and `python tests/e2e/smoke_test.py` (with `tools/dev_server.py` running). Never commit `.venv/`, `__pycache__/`, `.ipynb_checkpoints/` or `dist/`.

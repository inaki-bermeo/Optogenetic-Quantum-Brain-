# CLAUDE.md

Optogenetic Quantum Brain: a Qollab web page where a quantum laser fires a real C. elegans neuron and every jump of the
spike cascade is a 10-qubit Qiskit circuit; the 3D worm acts out the behaviour of each neuron that fires.
`frontend/` holds the page and `backend/` the Python core (Pyodide). `tools/build_qollab.py` flattens both into the
folder uploaded to Qollab. Code identifiers and comments are in Spanish; everything users read is in English.

## Always loaded

@docs/README.md
@docs/architecture.md
@docs/glossary.md
@docs/development.md

## Read when relevant

- [docs/frontend.md](docs/frontend.md): main.js state and the cascade loop, the WormScene API and render-loop states,
  intro / game / sound / Python-bridge modules, the DOM-id contract, the CSS system.
- [docs/backend.md](docs/backend.md): the 7 API functions and their JSON fields, modules, caching, conventions, tests.
- [docs/recipes.md](docs/recipes.md): step-by-step for common changes (Python function, achievement, behaviour,
  HUD control, colours/fonts, 3D body, cascade numbers, publishing).
- [docs/decisions.md](docs/decisions.md): why things are the way they are (product, physics, platform, design,
  performance). Read before "fixing" something that looks odd.
- [docs/cascade.md](docs/cascade.md) (Spanish): the 10-neuron window cascade, τ and the Zeno data.
- [docs/behaviour.md](docs/behaviour.md): neuron → behaviour table (with references) and the shader motions.
- [docs/theory.md](docs/theory.md) (Spanish) and [docs/theory_tex/](docs/theory_tex/): the full physics.
- [docs/3d-model.md](docs/3d-model.md) (Spanish): coordinate frames of the body mesh.
- [docs/worm-model.md](docs/worm-model.md): the anatomical Blender worm (organs, `tools/blender/modelo_gusano.py`) and
  the curvature kinematics that bends body and organs together.
- [README.md](README.md): the public project page (Qollab shows it as the project write-up).
- [RUNNING.md](RUNNING.md): the page only runs inside Qollab (or the local harness).

## Rules

- Commit to a branch and open a PR; never commit `.venv/`, `__pycache__/`, `.ipynb_checkpoints/` or `dist/`.
- Other Claude sessions may share this checkout: check `git branch --show-current` and `git status` before committing,
  and stage only your own paths.
- Changes flow repo → Qollab (`tools/build_qollab.py`), never the other way.
- Keep `backend/cerebro_q` limited to what the page calls. New Python functions for JS also go in
  `tools/dev_server.py` (`FUNCIONES`) and `tools/qollab_shim/puente_api.js` (see docs/recipes.md).
- The game layer never changes the physics; numbers on the card come from `tools/zeno_analysis.py` or tests.
- Accessibility is required: keyboard paths, reduced motion, live regions, a table behind every chart, contrast ≥ 4.5:1.
- When app behaviour changes, update `README.md` (the project page), plus the matching doc above.
- Run `python -m unittest discover -s tests/backend` and the e2e smoke test before opening a PR.

# CLAUDE.md

Optogenetic Quantum Brain: a Qollab web page where a quantum laser fires a real C. elegans neuron and every jump of the
spike cascade is a 10-qubit Qiskit circuit. `frontend/` holds the page and `backend/` the Python core (Pyodide).
`tools/build_qollab.py` flattens both into the folder uploaded to Qollab.

## Always loaded

@docs/architecture.md
@docs/development.md
@docs/cascade.md

## Read when relevant

- [PROJECT_CARD.md](PROJECT_CARD.md): the public project page. It explains the app and the physics for judges and users.
  [README.md](README.md) mirrors it and adds the repository layout.
- [docs/theory.md](docs/theory.md) (Spanish): the full physics. Connectome → J, the XY model, the laser as a Rabi
  rotation, Trotter, compilation on IonQ, post-selection, tests per claim, references.
- [docs/3d-model.md](docs/3d-model.md) (Spanish): coordinate frames shared by the data, three.js, glTF and Blender.
- [docs/behaviour.md](docs/behaviour.md): neuron → behaviour table (with references), how the worm acts after each step,
  the shader motions and the accuracy caveats. Read it before changing `frontend/js/conducta.js` or the swim shader.
- [docs/theory_tex/](docs/theory_tex/) (Spanish): LaTeX notes with figures (`.tex` sources and compiled PDFs).
- [RUNNING.md](RUNNING.md): the page only runs inside Qollab (or the local harness).

## Rules

- Commit to a branch and open a PR; never commit `.venv/`, `__pycache__/`, `.ipynb_checkpoints/` or `dist/`.
- Changes flow repo → Qollab (`tools/build_qollab.py`), never the other way.
- Keep `backend/cerebro_q` limited to what the page calls. New Python functions for JS also go in
  `tools/dev_server.py` (`FUNCIONES`) and `tools/qollab_shim/puente_api.js`.
- When app behavior changes, update `PROJECT_CARD.md` and `README.md` together, plus the matching doc above.
- Run `python -m unittest discover -s tests/backend` and the e2e smoke test before opening a PR.

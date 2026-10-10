# CLAUDE.md

Index of the project docs. Read the file that matches your task before changing code.

## Start here

- [PROJECT_CARD.md](PROJECT_CARD.md): what the app does, panel by panel, and the physics explained step by step. This is the text published on the Qollab project page.
- [README.md](README.md): the same card, plus the repository layout.
- [RUNNING.md](RUNNING.md): the page only runs inside Qollab (Pyodide, Qiskit, the `backend` object).

## By area

| Working on | Read |
| --- | --- |
| Page structure and panels | Header comment of [main.js](main.js), [index.html](index.html) |
| Python core API called from JS | [cerebro_q/api.py](cerebro_q/api.py) (module docstrings in `cerebro_q/*.py`) |
| Spike cascade (10-qubit windows, τ, Zeno) | [cerebro_q/cascada.py](cerebro_q/cascada.py) docstring; design notes in the archived `docs/PLAN_WALK_VENTANAS.md` (below) |
| 3D worm, sound | Header comments of [js/escena.js](js/escena.js), [js/sonido.js](js/sonido.js) |
| Local harness and smoke test | [dev/servidor.py](dev/servidor.py), [dev/prueba_navegador.py](dev/prueba_navegador.py) |
| Tests | [tests/test_cerebro_q.py](tests/test_cerebro_q.py) (`python -m unittest discover -s tests`) |
| Dependencies | [requirements.txt](requirements.txt) |
| Card screenshots | [docs/card/](docs/card/) |

## Archived docs (in git history, commit `0c3e4e5`)

The theory and design docs were removed from the tree when the repo was synced with the Qollab workspace. Read them with `git show 0c3e4e5:<path>`. They are in Spanish.

| Path | Content |
| --- | --- |
| `docs/TEORIA.md` | Full physics: connectome → J, XY model, laser as Rabi rotation, Trotter, IonQ compilation, error budget, references |
| `docs/PLAN_WALK_VENTANAS.md` | Spike cascade design: window choice, τ trade-off, Zeno data |
| `docs/ENTREGA.md` | Hackathon submission checklist and Qollab runtime constraints |
| `docs/MODELO_3D.md` | Coordinate frames of the 3D worm |
| `docs/teoria_tex/` | LaTeX theory notes and figures |
| `qollab/README.md` | Upload steps and accessibility notes (partly outdated) |

## Notes for agents

- Keep the repo flat: it mirrors the Qollab workspace (at most 100 files, each 2 MB or less).
- When app behavior changes, update [PROJECT_CARD.md](PROJECT_CARD.md) and [README.md](README.md) together.

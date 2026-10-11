# Development

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt playwright
.venv/bin/playwright install chromium        # only for the browser smoke test
```

`backend/requirements.txt` is the same file Qollab installs: `qiskit[visualization]` (which brings matplotlib) and numpy.

## Run the page locally

```bash
.venv/bin/python tools/dev_server.py          # http://127.0.0.1:8765
#   ?backend=ionq   imitates IonQ's remote simulator (one job per Run)
#   ?backend=qpu    imitates IonQ hardware (confirming second click)
```

The harness imitates Qollab:

- it pastes `frontend/index.html` into `<body>`;
- it maps `three` to three.js 0.186.1 (Qollab's version, from jsDelivr) and `cerebro_q.api` to `tools/qollab_shim/puente_api.js`, which calls `backend/cerebro_q/api.py` over HTTP;
- it creates a `backend`: Qiskit's `BasicSimulator`, or the numpy imitation in `tools/qollab_shim/qiskit_simulado/` if Qiskit isn't installed;
- it refuses JS requests for `data/` and `cerebro_q/`, like Qollab does.

It serves the source tree directly. Reload the page after editing JS; restart the server after editing Python. When you add a Python function for JS, add it to `FUNCIONES` in `tools/dev_server.py` and to `tools/qollab_shim/puente_api.js`.

## Tests

```bash
.venv/bin/python -m unittest discover -s tests/backend        # physics, circuits, cascade, Zeno table, Qollab rules
.venv/bin/python tests/e2e/smoke_test.py --salida /tmp/shots  # with the dev server running; saves screenshots
```

- The unit tests run with real Qiskit when it is installed. Otherwise they use the imitation, and the figure tests are skipped.
- `TestReglasQollab` builds the upload folder in a temp dir and checks it: file limits, the `index.html` shape, allowed JS imports, literal data paths and no API keys.
- The smoke test walks the intro by keyboard and skips it with Esc. It fires a charged shot and checks the achievement, opens the inspector with C, and checks the IonQ one-job lock, the QPU confirmation and a reduced-motion run.

## Publish to Qollab

The repo is the source of truth. Changes go **repo → Qollab**, never the other way.

1. `.venv/bin/python tools/build_qollab.py`. This writes `dist/qollab/` (flat, about 20 files) and fails if Qollab's limits are exceeded.
2. In the Qollab project (type **HTML/JS**), upload the contents of `dist/qollab/` keeping its folders (`js/`, `cerebro_q/`, `data/`).
3. Press **Run** with **Built-in simulator** and check the page.
4. Paste `PROJECT_CARD.md` into the project page.

Never upload `tools/`, `tests/`, `docs/` or `.venv/`.

## Other tools

| Command | What it does |
| --- | --- |
| `python tools/zeno_analysis.py [--centro AVM --taus 3 5 8]` | Reproduces the τ table (how often the spike stays put, and distinct neurons visited) and the coherent / measured / window / classical comparison |
| `python tools/optimize_glb.py [IN.glb --out OUT.glb]` | Drops normals and uses 16-bit indices in the body mesh (run after a Blender export) |
| `python tools/embed_fonts.py` | Re-embeds Geist / Geist Mono (subset, base64) between the `FONTS:BEGIN/END` markers of `frontend/main.css`; needs `pip install fonttools brotli` |

## Conventions

- Comments and identifiers are in Spanish; user-facing text is in English.
- Keep the backend free of anything the page doesn't call. Offline analysis goes in `tools/`, test-only references in `tests/`.
- When app behavior changes, update `PROJECT_CARD.md` and `README.md` together, plus the matching doc in `docs/`.
- Never commit `.venv/`, `__pycache__/`, `.ipynb_checkpoints/` or `dist/` (all in `.gitignore`).

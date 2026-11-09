# Proposals (not implemented yet)

These are features we have discussed but not built. Each one keeps the project's rules:
- the physics stays honest;
- the game layer never changes the physics;
- everything runs in the browser inside Qollab (no server, one IonQ job per Run, ≤ 100 files of ≤ 2 MB each);
- accessibility is required.

"Missions" (goal-based levels) were considered and **rejected**: the app should look like a game, not be one.

| Proposal | Status | Doc |
| --- | --- | --- |
| Real IonQ hardware replays | Needs answers from the team (QPU access, rules) | [ionq-replays.md](ionq-replays.md) |
| n lasers (several excitations at once) | Designed, ready to plan | [n-lasers.md](n-lasers.md) |
| Quantum vs classical walk, side by side | Idea; the classical walk already exists in `tools/zeno_analysis.py` | below |
| Stimulus mode (touch head or tail, noxious drop, smell food) | Idea | below |
| Ablation ("laser-kill" a neuron) | Idea | below |
| Shareable cascade card (PNG or URL) | Idea | below |
| English / Spanish toggle | Idea | below |
| Explanation level ("Curious" / "Physicist") | Idea | below |

## Smaller ideas

### Quantum vs classical walk, side by side
- **What:** from the same source, show the quantum walk (cyan) next to a classical random walk (grey) on the same
  connectome, plus a small chart of how far each one has spread over time.
- **Why:** it answers "why quantum?" in seconds. This is the project's central claim: interference makes the walk
  spread differently from diffusion.
- **How:**
  - `tools/zeno_analysis.py` `comparacion()` already computes the classical walk dp/dt = −γ L p next to the coherent
    and measured walks.
  - Move a light version into `backend/cerebro_q`, as one new API function that returns both probability curves for a
    window. Following `docs/recipes.md`, it also goes in `tools/dev_server.py` (`FUNCIONES`) and
    `tools/qollab_shim/puente_api.js`.
  - Draw the grey walk as a second activity layer on the worm.
- **Cost:** moderate.

### Stimulus mode
- **What:** buttons such as "touch the head", "touch the tail", "drop of something noxious" and "smell food" fire the
  real sensory neurons for that stimulus: ALM/AVM, PLM, ASH, AWA/AWC.
- **Why:** an intuitive entry point for non-experts. It is accurate, because these are the stimuli used in the
  papers behind the behaviour table (`docs/behaviour.md`).
- **How:** a small stimulus → source-neuron map in JS that sets the target and fires. With n lasers, a stimulus could
  fire the left/right pair at once.
- **Cost:** low.

### Ablation
- **What:** "laser-kill" a neuron. It is removed from the network, the cascade reroutes, and its behaviours disappear.
- **Why:** this is exactly the experiment of Chalfie 1985 and Gray 2005, so it's educational and true to the science.
- **How:**
  - Python: drop the neuron's row and column from J before choosing windows (`cascada._ventana`, `fisica.acoplamientos`),
    keyed by a set of ablated neurons sent with each step.
  - UI: a dimmed, crossed-out neuron.
- **Cost:** low to moderate. The window cache must be keyed by the ablated set.

### Shareable cascade card
- **What:** export a PNG of the spike chain, the behaviours and the achievements, or a URL with the cascade parameters
  encoded in it.
- **Why:** something visitors can post. It needs no storage.
- **Cost:** low.

### English / Spanish toggle
- **What:** a language switch for all user-facing text. The team and several docs are already in Spanish.
- **Cost:** moderate. User-facing strings are spread across `main.js`, `intro.js`, `juego.js`, `conducta.js` and
  `index.html`.

### Explanation level
- **What:** a "Curious" / "Physicist" switch for the narration and the `?` help texts: the same app, simpler or more
  technical words.
- **Cost:** moderate. Every narration string needs two versions.

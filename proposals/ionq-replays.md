# Proposal: real IonQ hardware replays

**Status:** not implemented. Needs answers from the team before planning (see the end of this doc).

## The problem

The most impressive version of this app runs on a real trapped-ion quantum computer. In practice, almost no visitor
will see that:
- Qollab allows **one IonQ job per Run**, so a cascade on IonQ is a single step.
- Real hardware (QPU) jobs **queue**, often for minutes or longer, and use credits.
- On a QPU, the app asks for a confirming second click.

So most people only ever see the simulator.

## The idea

Record a handful of cascades **once** on a real IonQ QPU and ship the results with the app as small JSON files. Add a
clearly labelled mode:

> **Replay a real IonQ run**, recorded on IonQ Forte, 2026-10-12, job `abc123…`

In this mode the cascade plays from the recorded counts instead of calling the backend. The visitor sees exactly what
the hardware returned, step by step, with the same animations, behaviours and inspector.

## What it shows

Per step, three columns side by side:

| | Source |
| --- | --- |
| **Theory** | The exact noise-free probabilities (already computed: `teoria_ventana`) |
| **Simulator** | The simulator counts for the same circuit (already available) |
| **QPU** | The recorded hardware counts |

Plus two simple noise measures:
- **Valid-shot fraction**: the share of shots that pass symmetry post-selection, i.e. at most one excitation. On a
  perfect machine it is 100 %, so the gap is hardware noise anyone can understand. It's already computed per step:
  `fraccion_valida` in `paso_json`.
- **Distance to theory**: the total-variation distance between the QPU and theory distributions.

## Honesty rules

- Every replay is labelled with the device, the date and the job id, and never presented as live.
- The recorded files are untouched hardware output. The same post-selection code as live runs is applied at replay
  time.
- The card explains how the replays were recorded.

## How it would work

1. **Recording**, outside the app, once:
   - A script under `tools/` runs a few cascades on the QPU with fixed parameters (source, θ, τ, γ, shots).
     - It can run from Qollab, one job per Run, saving each step's output.
     - Or it can run through the IonQ API directly; the old prototype had an IonQ REST client in git history.
   - It saves, per step: the parameters, the transpiled circuit summary, the raw counts, the backend name, the job id
     and the timestamp.
2. **Files:**
   - `backend/data/replays/<id>.json`, a few KB each.
   - Mind the Qollab budget of ≤ 100 files: either ship a few, or pack them all into one `replays.json`.
3. **Python:** a new API function, `replay_json(id)`, returns the recorded steps run through the existing
   `analisis.contar_spikes` post-selection. Following `docs/recipes.md`, it also goes in `tools/dev_server.py`
   (`FUNCIONES`) and `tools/qollab_shim/puente_api.js`.
4. **UI:**
   - A "Replay a real IonQ run" entry in the settings menu (or a card in the HUD) lists the recordings.
   - Playing one runs the normal cascade loop, fed from the replay instead of `py.paso`.
   - A permanent "RECORDED · IonQ Forte · <date>" badge stays on screen while it plays.
5. **Inspector:** the theory / simulator / QPU bars and the two noise measures.

## Cost

Moderate: one recording script, one API function, a replay path in the cascade loop, the inspector columns and the
docs. Most pieces already exist: post-selection, theory, inspector and counts.

## Questions for the team

1. Do we have **QPU access or credits**, and on which device (Aria or Forte)?
2. Do the hackathon rules allow **recorded hardware runs** in the app if they are clearly labelled?
3. **How many** cascades should we ship, and which sources and parameters? A good start would be AVM (touch → reversal)
   and ASHL (escape), each 5–8 steps.

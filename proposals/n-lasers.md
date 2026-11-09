# Proposal: n lasers (several excitations at once)

**Status:** not implemented. Designed and ready to plan.

## The idea

Today the laser fires **one** neuron. Each cascade step is a 10-qubit circuit with one excitation: `X` or `RX(θ)` on
qubit 0, the window centre (`cascada.circuito_paso`). Measuring collapses the walk onto one neuron.

With **n lasers** (n = 2 or 3), the user targets several neurons at once. The circuit starts with several excitations
that walk through the network together. Each measurement can then show several neurons firing at the same time.

## Why it's worth doing: genuinely new quantum physics

- **The physics carries over cleanly.**
  - The XY Hamiltonian H = γ Σ J_ij (X_i X_j + Y_i Y_j)/2 **conserves the number of excitations**. With n lasers,
    each applying RX(θ), the state is a superposition of sectors with k = 0…n excitations (binomial weights), and
    each sector evolves on its own.
  - The circuit after the lasers is **identical**: the same `PauliEvolutionGate` / Trotter RXX·RYY gates, the same
    depth. Only the first layer changes, from one `rx` to n `rx`.
  - Error mitigation generalises. Post-selection keeps shots with **at most n** bits set (exactly n at θ = π) instead
    of at most one. Shots with more than n excitations are impossible on a perfect machine, so they're still
    discarded as noise.
  - The exact 10-qubit theory costs the same: a 2¹⁰ statevector.
- **What's new: interference between walkers.**
  - Excitations are **hard-core**: two can't sit on the same neuron, because a qubit is 0 or 1. When the sources are
    close, the walkers interfere.
  - That shows up in **pair correlations**, C_ij = ⟨n_i n_j⟩ − ⟨n_i⟩⟨n_j⟩, which say whether two neurons fire together
    more or less often than chance. It's the same family of effect as Hong-Ou-Mandel interference in optics.
  - It can be measured directly from the shots on IonQ, and it's something the one-laser version can't show.

## Constraints

- **Qubit budget.** The window stays 10 qubits, and it must hold all n centres plus their neighbours. Realistic: n ≤ 3,
  for example 2 sources with 4 neighbours each, or 3 with 2–3 each.
- **Distance.** If the sources are far apart, the excitations don't meet within τ and the result is just independent
  walks. Either restrict targets to overlapping neighbourhoods, or allow any targets and say in the narration that
  they didn't interact.
- **IonQ.** Still one job per step, so nothing changes for the one-job-per-Run rule.

## What changes

| Part | Change |
| --- | --- |
| `backend/cerebro_q/cascada.py` | `ventana` for several centres: the union of their best-connected neighbours, budgeted to 10 qubits and cached by the set of centres. `circuito_paso` applies `rx(θ)` (or `x`) to every centre qubit. `ejecutar_paso` picks one valid shot as today, but it can now contain k ≤ n spikes. |
| `backend/cerebro_q/analisis.py` | `contar_spikes` post-selects by Hamming weight ≤ n and returns the multi-spike shots. New: the pair-correlation matrix C_ij over the valid shots. |
| `backend/cerebro_q/fisica.py` | Exact theory for n excitations (statevector in the window) for the scanner bars and the pair correlations. |
| `backend/cerebro_q/api.py` | `paso_json` takes a list of centres and returns `spikes` (a list), the marginals and `pares` (C_ij). Following `docs/recipes.md`, it also goes in `tools/dev_server.py` and `tools/qollab_shim/puente_api.js`. |
| `frontend/main.js` | Multi-target selection (shift-click on the worm, or a second target field). The cascade loop carries a set of centres. The spike chain becomes several chains, one colour per excitation (a "braid"). |
| `frontend/js/escena.js` | One trail per excitation. The collapse animation flies particles to several measured neurons. |
| Scanner and inspector | Bars for per-neuron marginals (which add up to the number of excitations), plus a small **"fired together"** heatmap of C_ij. |
| Behaviour (`js/conducta.js`) | Simultaneous spikes add up in the `Motor` drive, so AVA + AVB cancel **live** (a true "Tug of war"), and local motions at different places can play together. Combining behaviours is a simplification, and the docs must say so. |
| Docs | `theory.md` (n-excitation sectors, generalised post-selection, pair correlations), `cascade.md`, `behaviour.md`, the card. |

## Open design questions

1. **Cascade rule.** After measuring k spikes, do all k become the next centres? That's the most faithful choice, but
   the excitation count can only fall (lost to θ < π or post-selection). Or do we keep n constant by re-firing?
   Recommendation: all k, and the cascade ends when k = 0.
2. **Targeting.** Shift-click on the worm plus a "+ add laser" button in the deck. The hold-to-charge dose applies to
   all lasers.
3. **Far-apart sources.** Allow them, and narrate "these walkers never met"? Or only offer nearby targets?
   Recommendation: allow them and narrate it; it teaches the point.

## Cost

Moderate to high. Most of the work is in the Python window selection and post-selection, and in the UI (multi-target,
braid, heatmap). The circuit, the backend handling and the IonQ path stay the same.

## Verification ideas

- n = 1 must reproduce today's results exactly (regression in `tests/backend`).
- For two excitations on a small graph, the exact pair correlations from the statevector must match the
  post-selected simulator counts within shot noise.
- Excitation number is conserved: no ideal shot has more than n bits set.

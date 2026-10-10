# Optogenetic Quantum Brain

**A quantum laser on the real *C. elegans* connectome: a 302-neuron quantum walk, and a spike cascade in which every jump is a 10-qubit Qiskit circuit.**

This effort is supported by Qollab & IonQ.

- **Demo video (2–3 min):** [add the public link]
- **Repository (MIT):** https://github.com/inaki-bermeo/Optogenetic-Quantum-Brain-

---

## What it does

In optogenetics, a pulse of light makes a chosen neuron fire, and researchers watch the activity travel through the brain. This project translates that experiment into qubits:

| Optogenetics | This project |
| --- | --- |
| Neuron at rest / active | Qubit in \|0⟩ / \|1⟩ |
| Light pulse with dose θ | RX(θ) rotation on the illuminated neuron |
| Activity travels along synapses | Quantum walk under the XY Hamiltonian on the real connectome |
| Calcium imaging | Z-basis measurement: 1 = *spike* |

The page has two panels, a live "What you're seeing" narration over the 3D worm, "?" help next to every technical term, and the advanced settings in a **Lab settings** drawer:

1. **Laser & measure.** Pick any of the 302 neurons, set the light dose θ and press **Fire laser**. Every step of what follows is a real Qiskit circuit run on the selected backend (**one job per step**): 10 qubits for the neuron that fired and its 9 neighbours with the most synapses, the laser as RX(θ), the XY quantum walk e^(−iτH) built with `PauliEvolutionGate` + `SuzukiTrotter`, and a measurement of all 10 qubits. The neuron that comes out as 1 in a random shot fires the next step, so the spike jumps across the worm and leaves a trail. Each measurement is animated in 3D: the window neurons pulse together in superposition, then collapse onto the measured neuron. The worm itself looks like a fluorescence micrograph: a translucent body with cuticle annuli, the pharynx and the intestine inside, and a slow swimming wave that pauses while each circuit is measured. It is also heard: the laser is a falling chirp, the superposition is ten detuned tones (one per neuron, louder when more likely) that glide into the note of the measured neuron, and every neuron has its own pentatonic note, so each cascade plays its own melody. Underneath, a generative underwater ambience (slow muffled chords in the same key, a low swell and distant bubbles) plays softly and drops while each circuit is measured (sound on/off in the top bar, music volume in Lab settings).
2. **The Qiskit circuit.** The exact `QuantumCircuit` of any step (or of the next laser shot, before it runs) appears instantly, gate by gate: the laser, every RXX·RYY hop of the Trotter decomposition, and the measurements, with the bit string that the cascade picked. Next to it are the counts returned by the backend and Qiskit's own `draw("mpl")` figure with `plot_histogram`, which loads in the background.


## What problem it explores

Hamiltonian simulation is one of the most natural applications of a quantum computer, but it is hard to *see*. Here you can see it:

- the laser is a rotation, every synapse is an XY coupling, and propagation is interference;
- inside each circuit the excitation is in a superposition over the 10 neurons, and some neighbours stay dark because paths cancel each other out;
- every measurement collapses that superposition onto one neuron, and measuring too often freezes propagation (the **quantum Zeno effect**: compare τ = 2 with τ = 8).

It also shows the real steps needed to take the physics to hardware: Trotterization and its error, transpilation to the backend, and error mitigation through conservation of the excitation number.

## How to run it

1. Press **Run** and pick a backend. With the **Built-in simulator** everything is immediate and free.
2. **Laser & measure:** pick a neuron (click it on the worm or type its name) and press **Fire laser**. Try τ = 8 (the spike travels) and τ = 2 (it barely moves: quantum Zeno effect). Lower θ to see the laser sometimes fail to fire.
3. **The Qiskit circuit:** choose any step to see its full circuit, switch between *All gates* and *Compact (e^(−iτH))*, and compare with the measured counts.
4. **IonQ:** on *IonQ Forte 1 (Remote simulator)*, which is free, each Run allows one job, so the laser runs one circuit (one step). For another job, press Stop and Run.

The page is keyboard accessible (panel tabs with the arrow keys; with focus on the worm: Enter fires the laser, R resets the view; Esc closes help and settings), announces results to screen readers, has a data table behind every chart, and respects *prefers-reduced-motion*.

## How it works (theory summary)

- **Connectome → matrix J.** The chemical and electrical synapses from Cook et al. (2019) are symmetrized with binary weights (connected or not) and normalized by the largest eigenvalue, so that ‖J‖ = 1.
- **XY Hamiltonian.** H = γ Σ J_ij (X_i X_j + Y_i Y_j)/2 conserves the number of excitations. In the single-excitation sector it is exactly γJ: the continuous-time quantum walk of Farhi and Gutmann.
- **Central result.** For a laser θ on neuron j: P_k(t) = sin²(θ/2) · |[e^(−iγJt)]_kj|². The page uses it as the theory that each measured circuit is compared with.
- **Circuit.** Each hop e^(−iα(XX+YY)/2) = RXX(α)·RYY(α). The walk is approximated with second-order Trotter–Suzuki (error O(t³/r²)).
- **Mitigation.** With one laser, no ideal measurement has more than one neuron at 1: those shots are discarded (symmetry post-selection).

With a single laser the problem is classically simulable: the hardware does not speed it up; it demonstrates the physics and measures how much noise and approximation degrade it. The classically hard regime appears with several simultaneous lasers (hard-core bosons), and the Trotter circuit already supports it.

## How to replicate and extend it

All the code is in this project and in the repository. `qollab/tests` contains 26 automated tests that check, among other things:

- single-excitation XY = walk;
- Trotter convergence and Givens exactness;
- `PauliEvolutionGate` against the theory;
- post-selection, one job per run, the circuit shown on the page and the Qiskit figures.

The harness `qollab/dev/servidor.py` reproduces the Qollab environment on a local computer. The full theory is in `docs/TEORIA.md` and `docs/teoria_tex/` (in Spanish).

Ideas to extend it: several simultaneous lasers, directed synapses (chiral or stochastic quantum walks), inhibitory synapses with negative sign, other connectomes (*Drosophila*), or measuring in the X basis to reveal coherence.

## Prior work and credits

[To complete with the team: what existed before the hackathon build window and what was added during it. The rules require this on the project page.]

- **Data:** connectome from Cook et al., *Nature* 571, 63 (2019), via OpenWorm c302. Neuron positions: OpenWorm CElegansNeuroML. Touch reflex: Chalfie et al. (1985). Optogenetics in *C. elegans*: Nagel et al. (2005).
- **Sound:** synthesised live with the Web Audio API, adapted from the team's DSP engine (`backend/audio_dsp.py`).
- **Libraries:** Qiskit, NumPy, SciPy, matplotlib and three.js.

**Themes:** Quantum Unlocked · Quantum Playground. **License:** MIT.

This effort is supported by Qollab & IonQ.

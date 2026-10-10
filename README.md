# Optogenetic Quantum Brain

**Shine a quantum laser on a real worm brain, and watch every spike jump across it as the outcome of a 10-qubit Qiskit circuit.**

This effort is supported by Qollab & IonQ.

🎬 **Demo video (2–3 min):** [add the public link] · 💻 **Code (MIT):** https://github.com/JoaquinQu/Cerebro-Cu-ntico-Optogenetico · 📖 **Full theory (Spanish):** [TEORIA.md](https://github.com/inaki-bermeo/Optogenetic-Quantum-Brain-/blob/0c3e4e5/docs/TEORIA.md)

![The 3D C. elegans worm: ten neurons glow in superposition around the neuron hit by the laser, just before the measurement collapses them onto one.](https://raw.githubusercontent.com/inaki-bermeo/Optogenetic-Quantum-Brain-/main/docs/card/hero.png)

---

## In 30 seconds

- **What it is.** An interactive 3D model of the nervous system of the worm *C. elegans*: all 302 neurons, wired with its real synapses. You fire a "laser" at one neuron and watch the excitation travel.
- **What is quantum about it.** Every jump of the spike is decided by a real Qiskit circuit: 10 qubits (the neuron that fired and its 9 most connected neighbours), the laser as an `RX(θ)` gate, the quantum walk as a Trotterized `PauliEvolutionGate`, then a measurement. It runs on whichever backend you pick when you press **Run**, including IonQ.
- **What you learn.** Superposition (the excitation is spread over 10 neurons at once), interference (some neighbours stay dark because paths cancel), collapse (the measurement picks one neuron) and the **quantum Zeno effect** (measure too often and the spike freezes).
- **What is new.** A quantum walk on a real connectome, a spike cascade driven by measurements, a gate-by-gate view of every circuit that ran, and sound that follows the physics.

## Try it in one minute

1. Press **Run** and choose **Built-in simulator** (free and instant).
2. In **Laser & measure**, keep the default neuron **AVM** (a touch-sensing neuron) and press **Fire laser**. The spike starts hopping along the worm and leaves a trail.
3. Open **Lab settings** and compare **τ = 8** (the spike travels) with **τ = 2** (it barely moves: the Zeno effect). Lower **θ** and the laser sometimes fails to fire.
4. Switch to the **The Qiskit circuit** tab to see the exact circuit of any step, gate by gate, next to the counts the backend returned.
5. *Optional:* press **Stop**, then **Run** with **IonQ Forte 1 (Remote simulator)**, also free. IonQ allows one job per Run, so the laser runs one circuit.

---

## What you're seeing

### Panel 1 · Laser & measure

![Panel 1: the worm with the measured window lit, the spike chain and the bar chart of theory versus measured probabilities.](https://raw.githubusercontent.com/inaki-bermeo/Optogenetic-Quantum-Brain-/main/docs/card/panel1.png)

- **One circuit per step.** Each step builds a 10-qubit circuit around the neuron that just fired, runs it as one job, and measures all 10 qubits.
- **The next neuron.** One shot is picked at random. The neuron that came out as 1 fires the next step, so the spike jumps from circuit to circuit across the worm.
- **On the worm.** The 10 neurons of the window pulse together while they are in superposition, then collapse onto the measured one. A trail marks the neurons that fired before.
- **The worm itself** looks like a fluorescence micrograph: a translucent body with cuticle rings, the pharynx and the intestine inside, and a slow swimming wave that pauses while each circuit is measured.
- **Results.** Bars compare the theory with what the circuit measured. The spike chain lists every step, and every chart has a data table behind it.
- **Sound** (toggle in the top bar):
  - the laser is a falling chirp;
  - the superposition is ten slightly detuned tones, one per neuron, louder when that neuron is more likely;
  - at the collapse they glide into the note of the measured neuron. Each neuron has its own note on a pentatonic scale, so every cascade plays its own melody;
  - a soft, generative underwater ambience plays underneath and dips during each measurement (volume in Lab settings).

### Panel 2 · The Qiskit circuit

![Panel 2: the full circuit of one step drawn gate by gate, with the counts returned by the backend.](https://raw.githubusercontent.com/inaki-bermeo/Optogenetic-Quantum-Brain-/main/docs/card/panel2.png)

- The exact `QuantumCircuit` of any step, or of the next laser shot before it runs, drawn instantly.
- **All gates** shows the laser, every `RXX`·`RYY` hop of the Trotter decomposition and the measurements. **Compact** shows the same evolution as one `e^(−iτH)` block.
- The counts returned by the backend, and the shot the cascade picked at random.
- Qiskit's own `draw("mpl")` figure and `plot_histogram` load in the background.

---

## The idea: optogenetics → qubits

In optogenetics, neuroscientists make chosen neurons sensitive to light. A pulse of light makes one fire, and they watch the activity travel through the brain. This project translates that experiment into qubits:

| Optogenetics | This project |
| --- | --- |
| Neuron at rest / active | Qubit in \|0⟩ / \|1⟩ |
| Light pulse with dose θ | `RX(θ)` rotation on the illuminated neuron |
| Activity travels along synapses | Quantum walk under the XY Hamiltonian on the real connectome |
| Calcium imaging | Z-basis measurement: 1 = *spike* |

This is an analogy built on the real wiring diagram. We do **not** claim that real neurons are quantum.

---

## How it works, step by step

Each step shows the equation, what it means in plain words, and what every symbol stands for.

### 1. The connectome becomes a matrix J

```
W_ij = 1 if neurons i and j share at least one synapse, 0 otherwise
J    = W / λ_max(W)
```

**In plain words.** We write down who is connected to whom. Every connection counts the same (binary weights), and a connection goes both ways because a Hamiltonian has to be symmetric. Dividing by the largest eigenvalue scales the matrix so its strength is 1. Then time is measured in natural units, 1/γ.

**Where:** *i, j* are neurons (302 in total); *λ_max* is the largest eigenvalue of *W* (about 32.8). Data: chemical and electrical synapses from Cook et al., *Nature* 2019.

### 2. The laser is a rotation

```
RX(θ)|0⟩ = cos(θ/2)|0⟩ − i·sin(θ/2)|1⟩      →      P(fire) = sin²(θ/2)
```

**In plain words.** The light pulse rotates the qubit of the illuminated neuron from "rest" towards "active". A full dose (θ = π) always fires it. Half the dose (θ = π/2) fires it in half of the shots. If it does not fire, the measurement finds no excitation and the cascade stops.

**Where:** *θ* is the light dose (the **θ** slider). In a real experiment it is the light intensity times the pulse length. The laser dose applies to the first circuit; in later steps the neuron that fired starts fully excited.

### 3. The synapses are an XY Hamiltonian

```
H = γ · Σ_(i<j) J_ij · (X_i X_j + Y_i Y_j) / 2
  = γ · Σ_(i<j) J_ij · (σ⁺_i σ⁻_j + σ⁻_i σ⁺_j)
```

**In plain words.** Each synapse can pass the excitation from one neuron to the other: σ⁻ takes it away from one neuron and σ⁺ puts it on the other. The excitation is never created or destroyed, only moved. That conservation law is what makes the error mitigation in step 7 possible.

**Where:** *X, Y* are Pauli gates on each qubit; *σ⁺, σ⁻* raise and lower a qubit; *γ* is the strength of every synapse (**Coupling γ** in Lab settings; doubling it makes everything twice as fast).

### 4. The quantum walk and the central result

```
P_k(t) = sin²(θ/2) · | [e^(−iγJt)]_kj |²
```

**In plain words.** After the laser hits neuron *j*, the excitation spreads as a wave through the connectome: a **continuous-time quantum walk** (Farhi & Gutmann, 1998). The wave reaches neuron *k* along every possible path at once. Each path carries an amplitude, a number with a phase, and the amplitudes add up. Where they reinforce, the neuron lights up; where they cancel, it stays dark even if it is right next door. The probability is the squared size of the total amplitude, scaled by the chance that the laser fired at all.

**Where:** *P_k(t)* is the probability that neuron *k* is the one active at time *t*; *e^(−iγJt)* is the evolution operator; its entry *[ ]_kj* is the amplitude to go from *j* to *k*. The page uses this formula as the theory that every measured circuit is compared with.

### 5. From the Hamiltonian to a circuit

```
hop(α) = e^(−iα(XX+YY)/2) = RXX(α) · RYY(α)
e^(−iτH) ≈ second-order Trotter–Suzuki product of hops, error O(τ³/r²)
```

**In plain words.** A quantum computer cannot apply *e^(−iτH)* in one go. We cut the time τ into *r* small slices and apply one small "hop" per synapse in each slice. That is the Trotter–Suzuki approximation: more slices means smaller error but more gates, and every gate adds hardware noise. The page uses Qiskit's own `PauliEvolutionGate` with `SuzukiTrotter(order=2)`, with 1 slice for τ ≤ 4.5, 2 for τ ≤ 9 and 3 above.

**Where:** *α* = γ·J_ij·(τ/r) is the angle of one hop; *RXX, RYY* are standard two-qubit Qiskit gates. On IonQ hardware each hop compiles to two native ZZ gates, and the all-to-all connectivity of trapped ions means no extra SWAP gates are needed.

### 6. Measurement and the spike cascade

```
window = the neuron that fired + its 9 neighbours with the most synapses   (10 qubits)
one step = RX(θ) → e^(−iτH_window) → measure   ·   next neuron = the 1 in a random shot
```

**In plain words.** The full worm has 302 neurons, too many for one circuit, so each step simulates a 10-neuron window around the neuron that just fired. Measuring **collapses** the wave onto one neuron, which becomes the next center. The interference happens *inside* each step; the measurement erases it between steps. Each jump is quantum, but the chain of jumps behaves like a classical random walk: the quantum-to-classical transition, live.

**The quantum Zeno effect.** In a short time τ, the chance of leaving the center grows like (γJτ)², so measuring very often keeps resetting the wave before it can move. Simulated cascades from AVM show it clearly:

| τ (time between measurements) | Steps where the spike stays put | Different neurons visited in 20 steps |
| --- | --- | --- |
| 3 | 92 % | 2 |
| 5 | 81 % | 4 |
| 8 | 60 % | 8 |

**Honest limit.** A window is cut off from the other ~290 neurons, so with a long τ each step is the walk on an isolated 10-neuron circuit rather than on the whole worm.

### 7. Error mitigation by symmetry

**In plain words.** One laser means at most one excitation, and step 3 says the count is conserved. A noise-free shot can therefore never show two neurons at 1. Noisy shots that break this rule are discarded and the rest are renormalized. This is called **symmetry post-selection**, and IonQ recommends it in its best-practices guide. The page shows how many shots were valid in each step.

---

## What problem it explores

**Hamiltonian simulation** is one of the most natural uses of a quantum computer, but it is hard to *see*. Here every piece is visible and audible:

- the laser is a rotation, every synapse is an XY coupling, and propagation is interference;
- the measurement is a collapse you can watch and hear;
- the Zeno effect turns an abstract idea into a slider.

It also walks through the real steps needed to take the physics to hardware: Trotterization and its error, transpilation for the backend, and error mitigation through a conservation law.

**Honest about quantum advantage.** With a single laser the problem is classically simulable, which is how the page computes the theory for all 302 neurons. The hardware does not speed it up; it demonstrates the physics and shows how noise degrades it. The classically hard regime appears with several simultaneous lasers (interacting "hard-core bosons"), and the Trotter circuit already supports that case.

## Backends

| Backend (chosen when you press Run) | Cost | What happens |
| --- | --- | --- |
| Built-in simulator | Free | Every step runs instantly; the cascade can run for many steps |
| IonQ Forte 1 (Remote simulator) | Free | IonQ accepts **one job per Run**: the laser runs one circuit. Press Stop and Run for another |
| IonQ Forte 1 (Quantum computer) | Credits | Same as above, on real trapped-ion hardware. The button asks for a second click to confirm |

## Accessibility

- Every control has a label, and a **?** next to each technical term explains it in plain words.
- A live narration over the worm and screen-reader announcements describe each step.
- Every chart has a data table behind it.
- The page respects *prefers-reduced-motion*.

| Key | Where | Action |
| --- | --- | --- |
| ← / → · Home / End | Panel tabs | Switch panels |
| Enter | Worm, or the neuron name field | Fire the laser |
| R | Worm | Reset the view |
| + / − | Worm | Zoom |
| ↑ / ↓ | Worm | Rotate the view |
| Esc | Anywhere | Close help and Lab settings |

## Replicate and extend

- **Code and data:** everything is in this project and in the public repository (MIT).
- **Tests:** `tests/` has 24 automated tests. They check, among other things:
  - that the single-excitation XY dynamics equals the walk;
  - Trotter convergence and exactness of the Givens construction;
  - `PauliEvolutionGate` against the theory;
  - post-selection and the one-job-per-Run rule;
  - the Qiskit figures.
- **Run it locally:** `dev/servidor.py` reproduces the Qollab environment on your computer.
- **Theory:** [TEORIA.md](https://github.com/inaki-bermeo/Optogenetic-Quantum-Brain-/blob/0c3e4e5/docs/TEORIA.md) and the LaTeX notes in [docs/teoria_tex/](https://github.com/inaki-bermeo/Optogenetic-Quantum-Brain-/tree/0c3e4e5/docs/teoria_tex) (in Spanish, archived in the repository history).

**Ideas to extend it:**

- several simultaneous lasers;
- directed synapses (chiral or stochastic quantum walks);
- inhibitory synapses with a negative sign;
- other connectomes, such as the *Drosophila* larva;
- measuring in the X basis to reveal coherence.

## Prior work and credits

> **[Team: confirm before publishing.]** Draft based on the repository README and commit history.

- **Built before the build window** (7–9 Oct 2026, with AI assistance from Claude by Anthropic):
  - a local Python prototype: connectome → XY Hamiltonian, exact walk, Trotter/Givens circuits, IonQ native compilation, a noisy simulator and an IonQ REST client;
  - a three.js viewer, a 3D worm model and the theory documents.
- **Built during the window** (9–11 Oct 2026):
  - this Qollab project: the Qiskit/Pyodide core;
  - the measurement-driven spike cascade on 10-qubit windows;
  - the two-panel interface with the gate-by-gate circuit view;
  - the microscope-style worm, live sound and music;
  - accessibility.
- **Data:**
  - connectome from Cook et al., *Nature* 571, 63 (2019), via OpenWorm c302;
  - neuron positions from OpenWorm CElegansNeuroML;
  - touch reflex circuit from Chalfie et al. (1985);
  - optogenetics in *C. elegans*: Nagel et al. (2005).
- **Sound:** synthesised live with the Web Audio API, adapted from the team's own DSP engine.
- **Libraries:** Qiskit, NumPy, SciPy, matplotlib and three.js.

---

## Repository layout

This repository mirrors the Qollab workspace. The page only runs inside Qollab, which provides Pyodide, Qiskit and the `backend` object (see `RUNNING.md`); `dev/` reproduces that environment locally.

```
index.html, main.js, main.css   the page (three.js scene, panels, Web Audio)
js/                             escena.js (3D worm), graficos.js (SVG charts), python.js (Pyodide bridge), sonido.js (sound)
cerebro_q/                      Python core: data, physics, Qiskit circuits, spike cascade, analysis, mpl figures, api
data/                           connectome (Cook 2019), neuron positions (OpenWorm), gusano.glb
tests/                          unit tests (python -m unittest discover -s tests)
dev/                            local harness: servidor.py (http://127.0.0.1:8765) and a Playwright smoke test
docs/card/                      screenshots used by this page
```

---

**Themes:** Quantum Unlocked · Quantum Playground  ·  **License:** MIT

This effort is supported by Qollab & IonQ.

# Optogenetic Quantum Brain

**Shine a quantum laser on a real worm brain, and watch every spike jump across it as the outcome of a 10-qubit Qiskit circuit.**

This effort is supported by Qollab & IonQ.

🎬 **Demo video (2–3 min):** [add the public link] · 💻 **Code (MIT):** https://github.com/JoaquinQu/Cerebro-Cu-ntico-Optogenetico · 📖 **Full theory (Spanish):** [docs/theory.md](https://github.com/inaki-bermeo/Optogenetic-Quantum-Brain-/blob/main/docs/theory.md)

![The 3D C. elegans worm: ten neurons glow in superposition around the neuron hit by the laser, just before the measurement collapses them onto one.](https://raw.githubusercontent.com/inaki-bermeo/Optogenetic-Quantum-Brain-/main/docs/card/hero.png)

---

## In 30 seconds

- **What it is.** An interactive 3D model of the nervous system of the worm *C. elegans*: all 302 neurons, wired with its real synapses. You fire a "laser" at one neuron and watch the excitation travel.
- **What is quantum about it.** Every jump of the spike is decided by a real Qiskit circuit: 10 qubits (the neuron that fired and its 9 most connected neighbours), the laser as an `RX(θ)` gate, the quantum walk as a Trotterized `PauliEvolutionGate`, then a measurement. It runs on whichever backend you pick when you press **Run**, including IonQ.
- **What you learn.** Superposition (the excitation is spread over 10 neurons at once), interference (some neighbours stay dark because paths cancel), collapse (the measurement picks one neuron) and the **quantum Zeno effect** (measure too often and the spike freezes).
- **What is new.** A quantum walk on a real connectome, a spike cascade driven by measurements, a gate-by-gate view of every circuit that ran, and sound that follows the physics.

## Try it in one minute

1. Press **Run** and choose **Built-in simulator** (free and instant), then press the start button on the intro screen.
2. In **Laser & measure**, keep the default neuron **AVM** (a touch-sensing neuron) and press **Fire laser**. The spike starts hopping along the worm and leaves a trail.
3. Move the **τ** slider (time between measurements) and compare **τ = 8** (the spike travels) with **τ = 2** (it barely moves: the Zeno effect). Lower **θ** and the laser sometimes fails to fire. Steps and shots per circuit are in **Lab settings**.
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
- Qiskit's own `draw("mpl")` figure and `plot_histogram` (matplotlib loads the first time you open this panel, about 30 s).

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

## Where the wiring comes from

The neurons and synapses are the real ones, not a toy network. Every neuron name in the app is an identified cell of the worm, every line drawn is a synapse that was seen under the microscope, and every position is where that cell body sits in the animal.

- **The map.** Cook, S. J. et al. (2019). *Whole-animal connectomes of both* Caenorhabditis elegans *sexes.* Nature 571, 63–71. https://doi.org/10.1038/s41586-019-1352-7. The authors reconstructed the whole nervous system from serial-section **electron micrographs**: thousands of ultra-thin slices of the worm, imaged one by one, with every chemical synapse and gap junction traced and counted. The data is published at https://wormwiring.org.
- **The original map** it builds on: White, J. G. et al. (1986). *The structure of the nervous system of the nematode* C. elegans. Phil. Trans. R. Soc. B 314, 1–340. https://doi.org/10.1098/rstb.1986.0056. This was the first complete wiring diagram of any animal.
- **The file we load.** The machine-readable edge list from OpenWorm's c302 project (`herm_full_edgelist.csv`): https://github.com/openworm/c302.
- **The 3D positions.** Cell-body coordinates from OpenWorm's CElegansNeuroML: https://github.com/openworm/CElegansNeuroML.

**How the project uses it.**
- We keep the 302 neurons of the adult hermaphrodite and normalize their names (e.g. `DA01` → `DA1`).
- That leaves 3,604 chemical-synapse entries and 2,155 electrical (gap-junction) entries, stored in `data/connectome_cook2019.csv`.
- Two neurons count as connected if they share at least one synapse of either kind (step 1 below).
- Only two neurons, CANL and CANR, end up with no connections, because the dataset has none for them.

---

## How it works, step by step

Each step shows the equation, what it means in plain words, and what every symbol stands for.

### 1. The connectome becomes a matrix J

$$
W_{ij} = \begin{cases} 1 & \text{if neurons } i \text{ and } j \text{ share at least one synapse} \\ 0 & \text{otherwise} \end{cases}
\qquad
J = \frac{W}{\lambda_{\max}(W)}
$$

**In plain words.** We write down who is connected to whom. Every connection counts the same (binary weights), and a connection goes both ways because a Hamiltonian has to be symmetric. Dividing by the largest eigenvalue scales the matrix so its strength is 1. Then time is measured in natural units, 1/γ.

**Where:** $i, j$ are neurons (302 in total); $\lambda_{\max}$ is the largest eigenvalue of $W$ (about 32.8). Data: the chemical and electrical synapses described in *Where the wiring comes from*.

### 2. The laser is a rotation

$$
R_X(\theta)\,|0\rangle = \cos\tfrac{\theta}{2}\,|0\rangle - i\,\sin\tfrac{\theta}{2}\,|1\rangle
\qquad\Longrightarrow\qquad
P(\text{fire}) = \sin^2\tfrac{\theta}{2}
$$

**In plain words.** The light pulse rotates the qubit of the illuminated neuron from "rest" towards "active". A full dose (θ = π) always fires it. Half the dose (θ = π/2) fires it in half of the shots. If it does not fire, the measurement finds no excitation and the cascade stops.

**Where:** $\theta$ is the light dose (the **θ** slider). In a real experiment it is the light intensity times the pulse length. The laser dose applies to the first circuit; in later steps the neuron that fired starts fully excited.

### 3. The synapses are an XY Hamiltonian

$$
H = \gamma \sum_{i<j} J_{ij}\,\frac{X_i X_j + Y_i Y_j}{2}
  = \gamma \sum_{i<j} J_{ij}\left(\sigma^+_i \sigma^-_j + \sigma^-_i \sigma^+_j\right)
$$

**In plain words.** Each synapse can pass the excitation from one neuron to the other: σ⁻ takes it away from one neuron and σ⁺ puts it on the other. The excitation is never created or destroyed, only moved. That conservation law is what makes the error mitigation in step 7 possible.

**Where:** $X, Y$ are Pauli gates on each qubit; $\sigma^+, \sigma^-$ raise and lower a qubit; $\gamma$ is the strength of every synapse (**Coupling γ** in Lab settings; doubling it makes everything twice as fast).

### 4. The quantum walk and the central result

$$
P_k(t) = \sin^2\tfrac{\theta}{2}\;\Big|\big[e^{-i\gamma J t}\big]_{kj}\Big|^2
$$

**In plain words.** After the laser hits neuron *j*, the excitation spreads as a wave through the connectome: a **continuous-time quantum walk** (Farhi & Gutmann, 1998). The wave reaches neuron *k* along every possible path at once. Each path carries an amplitude, a number with a phase, and the amplitudes add up. Where they reinforce, the neuron lights up; where they cancel, it stays dark even if it is right next door. The probability is the squared size of the total amplitude, scaled by the chance that the laser fired at all.

**Where:** $P_k(t)$ is the probability that neuron $k$ is the one active at time $t$; $e^{-i\gamma J t}$ is the evolution operator; its entry $[\,\cdot\,]_{kj}$ is the amplitude to go from $j$ to $k$. The page uses this formula as the theory that every measured circuit is compared with.

### 5. From the Hamiltonian to a circuit

$$
\mathrm{hop}(\alpha) = e^{-i\alpha (XX+YY)/2} = R_{XX}(\alpha)\,R_{YY}(\alpha),
\qquad
e^{-i\tau H} \approx \Big(\prod_{\text{synapses}} \mathrm{hop}\big(\tfrac{\alpha}{2}\big) \prod_{\text{reversed}} \mathrm{hop}\big(\tfrac{\alpha}{2}\big)\Big)^{r},
\quad \text{error } O\!\left(\tfrac{\tau^3}{r^2}\right)
$$

**In plain words.** A quantum computer cannot apply *e^(−iτH)* in one go. We cut the time τ into *r* small slices and apply one small "hop" per synapse in each slice. That is the Trotter–Suzuki approximation: more slices means smaller error but more gates, and every gate adds hardware noise. The page uses Qiskit's own `PauliEvolutionGate` with `SuzukiTrotter(order=2)`, with 1 slice for τ ≤ 4.5, 2 for τ ≤ 9 and 3 above.

**Where:** $\alpha = \gamma J_{ij}\,\tau / r$ is the angle of one hop; $R_{XX}, R_{YY}$ are standard two-qubit Qiskit gates; $r$ is the number of Trotter slices. On IonQ hardware each hop compiles to two native ZZ gates, and the all-to-all connectivity of trapped ions means no extra SWAP gates are needed.

### 6. Measurement and the spike cascade

$$
|\psi_{\text{step}}\rangle = e^{-i\tau H_{\text{window}}}\,R_X(\theta)_{\text{centre}}\,|0\rangle^{\otimes 10}
\qquad\longrightarrow\qquad \text{measure all 10 qubits} \;\longrightarrow\; \text{next centre} = \text{the neuron at } 1
$$

The window is the neuron that fired plus its 9 neighbours with the most synapses (10 qubits).

**In plain words.** The full worm has 302 neurons, too many for one circuit, so each step simulates a 10-neuron window around the neuron that just fired. Measuring **collapses** the wave onto one neuron, which becomes the next center. The interference happens *inside* each step; the measurement erases it between steps. Each jump is quantum, but the chain of jumps behaves like a classical random walk: the quantum-to-classical transition, live.

**The quantum Zeno effect.** In a short time $\tau$, the chance of leaving the center grows like $(\gamma J \tau)^2$, so measuring very often keeps resetting the wave before it can move. Simulated cascades from AVM (200 cascades of 20 steps, exact walk in each window; reproduce with `tools/zeno_analysis.py`) show it clearly:

| τ (time between measurements) | Steps where the spike stays put | Different neurons visited in 20 steps |
| --- | --- | --- |
| 3 | 93 % | 2 |
| 5 | 81 % | 5 |
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

**Honest about quantum advantage.** With a single laser the problem is classically simulable: the exact walk on all 302 neurons takes milliseconds on a laptop. The hardware does not speed it up; it demonstrates the physics and shows how noise degrades it. The classically hard regime appears with several simultaneous lasers (interacting "hard-core bosons"), and the Trotter circuit already supports that case.

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
- **Tests:** `tests/backend/` has 24 automated tests, plus a browser smoke test in `tests/e2e/`. They check, among other things:
  - that the single-excitation XY dynamics equals the walk;
  - Trotter convergence;
  - `PauliEvolutionGate` against the theory;
  - post-selection and the one-job-per-step rule;
  - the τ table above (quantum Zeno effect);
  - the Qiskit figures and Qollab's file rules.
- **Run it locally:** `tools/dev_server.py` reproduces the Qollab environment on your computer (see `docs/development.md`).
- **Theory:** [docs/theory.md](https://github.com/inaki-bermeo/Optogenetic-Quantum-Brain-/blob/main/docs/theory.md) and the LaTeX notes in [docs/theory_tex/](https://github.com/inaki-bermeo/Optogenetic-Quantum-Brain-/tree/main/docs/theory_tex) (in Spanish); the cascade design in [docs/cascade.md](https://github.com/inaki-bermeo/Optogenetic-Quantum-Brain-/blob/main/docs/cascade.md).

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

The page runs inside Qollab (Pyodide + Qiskit + the `backend` object, see `RUNNING.md`). The repo keeps frontend and backend apart; `tools/build_qollab.py` flattens them into the folder that is uploaded.

```
frontend/      the page: index.html, main.js, main.css, js/ (3D scene, charts, Pyodide bridge, sound)
backend/       cerebro_q/ (Python core run in the browser), data/ (connectome, neuron positions, 3D body), requirements.txt
tests/         backend/ unit tests, e2e/ browser smoke test
tools/         build_qollab.py, dev_server.py (local Qollab harness), optimize_glb.py, zeno_analysis.py
docs/          architecture, development, cascade design, theory (Spanish), 3D model, LaTeX notes, card screenshots
```

Quick start: `python tools/dev_server.py` → http://127.0.0.1:8765, and `python -m unittest discover -s tests/backend`. Details in [docs/development.md](docs/development.md).

---

**Themes:** Quantum Unlocked · Quantum Playground  ·  **License:** MIT

This effort is supported by Qollab & IonQ.

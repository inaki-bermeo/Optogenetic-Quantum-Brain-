**License:** [MIT](https://opensource.org/license/MIT) · **Powered by:** [Qiskit](https://www.ibm.com/quantum/qiskit) · **Hardware:** [IonQ](https://ionq.com/)

**This effort is supported by Qollab & IonQ.**

**Repository:** [https://github.com/inaki-bermeo/Optogenetic-Quantum-Brain-](https://github.com/inaki-bermeo/Optogenetic-Quantum-Brain-)  
**Full theory (Spanish):** [docs/theory.md](https://github.com/inaki-bermeo/Optogenetic-Quantum-Brain-/blob/main/docs/theory.md)

![](https://raw.githubusercontent.com/inaki-bermeo/Optogenetic-Quantum-Brain-/main/docs/card/demo.gif)

---

## The Team

* **Joaquín Molina** – Qiskit Core & Backend Integration
* **Herbert Díaz** – Quantum Simulation & Scientific Logic
* **Julian Stiefkens** – Physics Engine & Connectome Data
* **Iñaki Bermeo** – UX/UI, 3D Visualization & Audio Engine

---

## Summary & Core Concept

Optogenetics is a technique that makes living neurons sensitive to light by giving them light-gated proteins, so researchers can switch individual cells on or off with a pulse of light and study how the activity spreads. Inspired by the 2026 Nobel Prize in Medicine, awarded to Georg Nagel, Peter Hegemann and Karl Deisseroth, this project brings that idea into quantum computing.

We take the real connectome of *C. elegans*, made of 302 neurons, and fire a "quantum laser" at any neuron. The laser is an `RX(θ)` gate, and the excitation spreads to the neuron's neighbours as a quantum walk. Each step of the spike is decided by a 10-qubit quantum circuit written in Qiskit: the neuron that fired and its 9 most connected neighbours, one qubit each. A measurement then collapses the circuit onto a single neuron, which fires the next step. The result is a model of how a spike could travel through a real neural network, with every step run on a quantum backend.

| Concept | In *C. elegans* | In our model | In the Qiskit circuit |
| :--- | :--- | :--- | :--- |
| **Neuron** | One of the 302 identified neuron cells | A neuron is *active* when it holds the excitation | One qubit: $\vert{}0\rangle$ = at rest, $\vert{}1\rangle$ = active. A circuit has 10 qubits: the neuron that fired and its 9 most connected neighbours |
| **Light pulse** | A light dose opens the light-gated channels, so the neuron is more or less likely to fire | You hold the fire button to charge the dose $\theta$. The chance that the neuron fires is $\sin^2(\theta/2)$ | An $R_X(\theta)$ gate on the target qubit: $\cos(\theta/2)\vert{}0\rangle - i\sin(\theta/2)\vert{}1\rangle$ |
| **Wiring** | Synapses seen under the electron microscope (Cook et al., 2019) | Two neurons are connected if they share at least one synapse; every connection weighs the same | The coupling matrix $J$, normalised so its largest eigenvalue is 1 |
| **Spreading of the signal** | The activity travels from neuron to neuron through the synapses | The excitation is never created or destroyed: it hops between connected neurons as a wave, and the paths add up or cancel (interference) | Evolution under the XY Hamiltonian for a time $\tau$, built as `PauliEvolutionGate` with a Suzuki–Trotter decomposition into $R_{XX}$ and $R_{YY}$ gates |
| **Reading the result** | Calcium imaging shows which neurons are active, without disturbing them | The measurement picks one neuron: the one that spikes and starts the next step. Measuring too often freezes the spike (quantum Zeno effect) | Z-basis measurement of the 10 qubits; the qubit read as $1$ is the spike. Shots with more than one $1$ are errors and are discarded (post-selection) |

---

## Features

* **The real worm brain.** All 302 neurons of *C. elegans* at their real 3D positions, wired with the synapses traced by electron microscopy (Cook et al., 2019).
* **A quantum laser.** An $R_X(\theta)$ gate on the neuron you pick. Hold to charge the dose, or set it with the mouse; the meter shows the fire chance $\sin^2(\theta/2)$.
* **A spike cascade of real circuits.** Every jump is a 10-qubit Qiskit circuit (`PauliEvolutionGate` + `SuzukiTrotter`), sent as one job to the backend you chose on **Run**: the built-in simulator, IonQ Forte 1's simulator or the IonQ QPU.
* **Error mitigation you can see.** Symmetry post-selection discards shots with two or more neurons at 1, and each step shows the share of valid shots.
* **Theory vs. measurement.** Every step compares the exact walk with the counts returned by the backend, with a data table behind every chart.
* **Circuit inspector (C).** The exact circuit of any step, gate by gate (compact or with every $R_{XX}$ and $R_{YY}$), plus Qiskit's own `draw("mpl")` and `plot_histogram`.
* **A worm that acts.** An anatomical 3D worm (pharynx, intestine, gonad, eggs) acts out the real behaviour of each neuron that fires: 136 of the 302 neurons, each with references. It also smells, approaches and eats a food bacterium.
* **Sound.** Each neuron has its own note, so every cascade plays its own melody, over an underwater ambience.
* **A guided intro.** Optogenetics and the 2026 Nobel Prize, then the real circuit of the touch neuron AVM: light, superposition, collapse.
* **Accessible.** Keyboard-only play, screen-reader announcements, data tables and `prefers-reduced-motion`.

---

## Interactive Visualization Platform (The Lab HUD)

The simulation functions as both an educational platform and a scientific sandbox, featuring a custom **HUD** that provides real-time telemetry of the quantum state and biological reactions:

* **The Mission Log (Left):** Narrates the spike chain as the cascade progresses. Each time a neuron fires, it describes what the real worm does when that class of neuron is switched on (based on lesion and optogenetic experiments).
* **The Scanner (Right):** Summarizes the 10-qubit circuit of the current step: the laser $R_X(\theta)$ and the Trotterized evolution $e^{-i\tau H}$. It also shows the share of valid shots (those with at most one excitation) and compares the theoretical probabilities with the counts returned by the backend you chose. Press **C** to open the circuit inspector and see every $R_{XX}$ and $R_{YY}$ gate.
* **The Control Deck (Bottom):** Sets the target neuron, the laser dose ($\theta$) and the time between measurements ($\tau$).
* **Biological Environment:** The 3D worm moves according to the neurons that fire, while neon bacteria float still around it. One of them is food: when a smell or taste neuron (AWA, AWC, ASE) is measured, the food glows and the head turns towards it. Forward-motion neurons move the worm closer to the food and backward ones move it away; during one laser shot these moves add up, and when the cascade ends the worm returns to where it started. A strong forward command (AVB, PVC) reaches the food and the worm eats it.

![](https://raw.githubusercontent.com/inaki-bermeo/Optogenetic-Quantum-Brain-/main/docs/card/panel1.jpg)

---

## Architecture Overview

There is no server: the whole app runs in the viewer's browser inside Qollab. The JavaScript front end draws the worm, the HUD and the sound. The physics is a Python package, `cerebro_q`, that runs in the same page through **Pyodide**: it builds every Qiskit circuit and sends it to the `backend` object that Qollab creates when you press **Run**.

![Architecture: the JavaScript front end (main.js, escena.js, conducta.js, sonido.js) talks through the Pyodide bridge python.js to the Python core cerebro_q (api, datos, fisica, cascada, visual), which sends one job per cascade step to the backend chosen on Run: the built-in simulator, IonQ Forte 1's simulator or the IonQ QPU.](https://raw.githubusercontent.com/inaki-bermeo/Optogenetic-Quantum-Brain-/main/docs/card/architecture.png)

| Part | Files | What it does |
| :--- | :--- | :--- |
| Page and HUD | `frontend/index.html`, `main.js`, `main.css` | The cascade loop, the HUD, the charts and the circuit inspector |
| 3D scene | `frontend/js/escena.js` | three.js: the anatomical worm, 302 neurons (one draw call), synapses, laser, collapse, bacteria; the body bends with curvature kinematics in the vertex shader |
| Behaviour | `frontend/js/conducta.js` | Neuron class → real behaviour, with references; a forward/backward motor drive |
| Sound, intro, game | `frontend/js/sonido.js`, `intro.js`, `juego.js` | Web Audio synthesis, the guided intro, achievements |
| Python bridge | `frontend/js/python.js` | Calls `cerebro_q.api` one at a time; quick calls go before slow matplotlib ones |
| Python core | `backend/cerebro_q/` | `datos` (connectome, body), `fisica` ($J$, exact walk), `circuitos`, `cascada` (window, circuit, job, post-selection), `analisis`, `visual` (Qiskit figures) |
| Data | `backend/data/` | `neurons.json`, `connectome_cook2019.csv`, `gusano.glb` |

## Data Flow: one cascade step

1. You pick a neuron and charge the laser; `main.js` calls `py.paso(backend, params)`.
2. `cascada.py` takes the **window**: the neuron that fired and its 9 neighbours with the most synapses (10 qubits).
3. It builds the circuit: $R_X(\theta)$ on qubit 0, then $e^{-i\tau H}$ as a `PauliEvolutionGate` with `SuzukiTrotter(order=2)` (1 slice for $\tau \le 4.5$, 2 for $\tau \le 9$, 3 above), then a measurement of all 10 qubits. Built and transpiled circuits are cached.
4. `transpile(optimization_level=1)` for the chosen backend, then **one** `backend.run(circuit, shots)`.
5. Post-selection keeps the shots with at most one 1; one valid shot is picked at random. The neuron at 1 is the **spike**. If no neuron fired, the cascade stops.
6. The page plays the superposition and the collapse, compares theory with the measured counts, and the worm acts out the spike's behaviour.
7. The spike becomes the centre of the next circuit, which starts fully excited ($\theta = \pi$). IonQ accepts one job per Run, so on IonQ the cascade runs a single step.

## Python API (called from JavaScript)

Every function returns JSON text, so the page only needs `JSON.parse`.

| Function | Returns |
| :--- | :--- |
| `conectoma_json(max_aristas)` | The 302 neurons (name, position, type, neurotransmitters, degree) and the 1,200 connections with the most synapses, to draw |
| `cuerpo_glb()` | The 3D body as base64 |
| `backend_json(backend)` | Backend name, whether it is IonQ and whether it is real hardware |
| `paso_json(backend, params)` | One cascade step: window, counts, measured vs. theory, valid and empty fractions, spike, gate counts before and after `transpile` |
| `circuito_json(params)` | The step circuit without running it: compact and expanded gate lists and the ideal distribution, for the instant drawing |
| `figuras_json(params)` | Qiskit's `draw("mpl")` and `plot_histogram` as SVG |
| `precargar_figuras()` | Loads matplotlib in the background the first time the inspector opens |

Example parameters of one step:

```json
{ "centro": "AVM", "theta": 3.1416, "tau": 8, "gamma": 1, "pasos_trotter": 2, "shots": 200 }
```

---

## Theoretical Framework & Mathematical Formulation

The physical mapping from biology to quantum computing turns the connectivity graph of the neurons into a continuous-time quantum walk. It is built with Qiskit and runs on a simulator or on IonQ hardware.


**0. Random walks on graphs: classical and quantum**

Let $G = (V, E)$ be an undirected graph with $N = |V|$ vertices and symmetric adjacency matrix $A \in \lbrace 0,1 \rbrace^{N \times N}$, where $A_{uv} = 1$ if and only if $\lbrace u, v \rbrace \in E$ and $A_{vv} = 0$. Let $d_v = \sum_u A_{vu}$ be the degree of $v$, $D = \text{diag}(d_v)$, and $L = D - A$ the graph Laplacian.

*Classical walk.* A continuous-time random walk that jumps along every edge at rate $\gamma$ has a probability vector $p(t) \in \mathbb{R}^N$ that obeys

$$
\frac{d p}{d t} = -\gamma L\, p
\quad\Longrightarrow\quad
p(t) = e^{-\gamma L t}\, p(0)
$$

The off-diagonal entries of $-L$ are nonnegative and its columns sum to zero, so $e^{-\gamma L t}$ is a stochastic matrix and $p(t)$ remains a probability distribution. On a connected graph, $p(t)$ converges to the uniform distribution $(1/N, \dots, 1/N)$ as $t \to \infty$, so the walk forgets where it started. On a graph with several connected components, it converges to the uniform distribution on the component of the starting vertex.

*Quantum walk.* The probabilities are replaced by complex amplitudes. The state is a unit vector $|\psi(t)\rangle \in \mathbb{C}^N$ in the orthonormal basis $\lbrace |v\rangle \rbrace_{v \in V}$, and it obeys the Schrödinger equation for a Hermitian matrix $H$:

$$
i\,\frac{d}{d t}|\psi(t)\rangle = H\,|\psi(t)\rangle
\quad\Longrightarrow\quad
|\psi(t)\rangle = e^{-iHt}\,|\psi(0)\rangle
$$

Since $H = H^\dagger$, the operator $e^{-iHt}$ is unitary and preserves the norm. The classical propagator $e^{-\gamma L t}$ cannot play this role because it is not unitary. Following Farhi and Gutmann (1998), the walk is defined by a Hermitian Hamiltonian matrix $H$ that couples only adjacent vertices: $H_{uv} \neq 0$ with $u \neq v$ only if $\lbrace u, v \rbrace \in E$. We take $H = \gamma J$ with $J = A / \lambda_{\max}(A)$, as in Section 1. On an irregular graph, such as the connectome, using $L$ instead would add the non-constant diagonal $D$ and give a different walk. If the walk starts at vertex $j$, the Born rule gives the probability of finding it at vertex $k$:

$$
P_{j \to k}(t) = \left|\langle k|\, e^{-iHt} \,|j\rangle\right|^2,
\qquad
\sum_{k \in V} P_{j \to k}(t) = 1
$$

Writing $H = \sum_\mu \lambda_\mu |\phi_\mu\rangle\langle\phi_\mu|$ in its eigenbasis, the amplitude is $\langle k|e^{-iHt}|j\rangle = \sum_\mu e^{-i\lambda_\mu t} \langle k|\phi_\mu\rangle\langle\phi_\mu|j\rangle$. It is a sum of phases, and their relative phases produce constructive and destructive interference. Replacing $H$ by $-H$ conjugates the amplitude and leaves every probability unchanged.

Three differences with the classical walk follow directly.

**(i) No stationary distribution.** $P_{j \to k}(t)$ is an almost periodic function of $t$ and in general does not converge. Only its time average does:

$$
\lim_{T \to \infty} \frac{1}{T} \int_0^T P_{j \to k}(t)\, dt
= \sum_{\lambda} \left|\langle k|\,\Pi_\lambda\,|j\rangle\right|^2
$$

where the sum runs over the distinct eigenvalues $\lambda$ of $H$ and $\Pi_\lambda$ is the orthogonal projector onto the corresponding eigenspace.

**(ii) Ballistic instead of diffusive spreading.** On the infinite line $\mathbb{Z}$ with $H = \gamma A$, the amplitudes are given by Bessel functions of the first kind, and the mean squared displacement grows as $t^2$. The classical walk on the same line only grows as $t$:

$$
\langle k|e^{-i\gamma A t}|j\rangle = (-i)^{k-j}\, \mathcal{J}_{k-j}(2\gamma t),
\qquad
\sum_{k}(k-j)^2\, P_{j \to k}(t) = 2\gamma^2 t^2
\quad\text{versus}\quad 2\gamma t
$$

**(iii) Randomness comes only from measurement.** The evolution $e^{-iHt}$ is deterministic and reversible, so the name "quantum random walk" is historical. A random outcome appears only when the state is measured, and the measurement collapses it onto one vertex.

The walk of this project is this model on the connectome ($N = 302$), and on windows of 10 vertices in the circuits. Section 2 shows that the XY Hamiltonian restricted to one excitation is exactly $H = \gamma J$, with the basis vector $|v\rangle$ standing for one excitation on neuron $v$.



**1. Symmetrization and spectral normalization ($J$)**

Chemical synapses are directional, but the evolution $e^{-iHt}$ is unitary only if $H$ is Hermitian, so the coupling matrix must be symmetric. From the connectome data (Cook et al., 2019), let $c_{i\to j}$ be the number of chemical synapses from $i$ to $j$ and $g_{ij}$ the number of gap junctions. Two neurons are connected if they share at least one synapse of either kind, and every connection counts the same (binary weights). Here $\mathbb{1} [ \cdot ]$ is 1 when the condition holds and 0 otherwise:

$$
W_{ij} = \mathbb{1} \left[\, c_{i\to j} + c_{j\to i} + \max(g_{ij}, g_{ji}) > 0 \,\right]
$$

The synapse direction and the number of synapses per connection are lost in this step. To measure time in natural $1/\gamma$ units, the matrix is divided by its largest eigenvalue ($\lambda_{\max}(W) \approx 32.8$), so that $\lVert J \rVert_2 = 1$:

$$
J = \frac{W}{\lambda_{\max}(W)}
$$

**2. The XY Hamiltonian and conservation of the excitation**

Synaptic propagation is governed by an XY Hamiltonian:

$$
H = \gamma \sum_{i \lt j} J_{ij}\,\frac{X_i X_j + Y_i Y_j}{2}
$$

This Hamiltonian commutes with the total number operator, $[\hat{N}, H] = 0$, so the number of excitations never changes. The laser acts on one qubit, so the state contains at most one excitation and stays in the sectors with 0 and 1 excitations. In the one-excitation sector $H = \gamma J$, which is exactly the continuous-time quantum walk of Farhi and Gutmann (1998) on the connectome graph.

**3. The optogenetic laser as a Rabi rotation**

A light pulse with Rabi frequency $\Omega$ and duration $t_p$ acts as an $R_X(\theta)$ gate on the illuminated qubit, with dose $\theta = \Omega t_p$. We treat the pulse as instantaneous, because it is short compared with the hopping time $1/\gamma$:

$$
R_X(\theta)\,|0\rangle = \cos\frac{\theta}{2}\,|0\rangle - i\,\sin\frac{\theta}{2}\,|1\rangle
$$

so the neuron fires with probability $\sin^2(\theta/2)$. Evolving this state under $H$, the probability that the excitation is on neuron $k$ at time $t$, after the laser hit neuron $j$, is the exact result that every measured circuit is compared with:

$$
P_k(t) = \sin^2\frac{\theta}{2}\;\Big|\big[e^{-i\gamma J t}\big]_{kj}\Big|^2
$$

In a cascade step $J$ is the $10 \times 10$ block of the window (the neuron that fired and its 9 most connected neighbours). In later steps the neuron that fired starts fully excited ($\theta = \pi$).

**4. Circuit synthesis with Trotter–Suzuki and IonQ compilation**

The evolution is approximated for gate-based hardware with a second-order (Strang) splitting. The $XX$ and $YY$ terms of one synapse commute, so each hop is exactly:

$$
\mathrm{hop}(\alpha) = e^{-i\alpha (X_i X_j + Y_i Y_j)/2} = R_{XX}(\alpha)\,R_{YY}(\alpha)
$$

With $r$ Trotter slices the error is bounded by $O(t^3/r^2)$. It comes from the commutators between synapses that share a neuron, $\sum \lVert [h_a, h_b] \rVert$, and in practice the bound is loose. Qiskit builds the circuit with `PauliEvolutionGate` and `SuzukiTrotter(order=2)`. On IonQ each $R_{XX}$ or $R_{YY}$ is compiled to a native $ZZ$-type entangling gate plus single-qubit rotations, so one hop costs two $ZZ$ gates. The trapped ions have all-to-all connectivity, so no SWAP gates are needed.

**5. Symmetry post-selection**

One laser means at most one excitation, and $H$ conserves it. A noise-free shot therefore never has two neurons at 1. Any bitstring with Hamming weight $\ge 2$ is a hardware error, and we discard it and renormalize the rest:

$$
\rho \;\longrightarrow\; \frac{\Pi_{\le 1}\,\rho\,\Pi_{\le 1}}{\text{Tr}\left(\Pi_{\le 1}\,\rho\right)}
$$

where $\Pi_{\le 1}$ projects onto the bitstrings with at most one 1. The page shows the share of valid shots of each step. In an earlier prototype that simulated Forte-like noise on a 6-neuron circuit, this step lowered the total variation distance (TVD) to the ideal distribution from 0.17 to 0.05.

---

## Results: the quantum Zeno effect

In a short time $\tau$ the chance of leaving the centre grows like $(\gamma J \tau)^2$, so measuring very often keeps resetting the wave before it can move. Simulated cascades from AVM (200 cascades of 20 steps, the exact walk in each window) show it clearly. Reproduce them with `python tools/zeno_analysis.py`; a unit test checks these numbers.

| $\tau$ (time between measurements) | Steps where the spike stays put | Different neurons visited in 20 steps (median) |
| :---: | :---: | :---: |
| 3 | 93 % | 2 |
| 5 | 81 % | 5 |
| 8 | 60 % | 8 |

**Honest limit.** A window is cut off from the other ~290 neurons, so with a long $\tau$ each step is the walk on an isolated 10-neuron circuit rather than on the whole worm.

---

## Scientific Exploration & Educational Impact

Hamiltonian simulation is theoretically profound but notoriously difficult to visualize. This project makes abstract quantum mechanics tangible:

* **Interference:** Users can observe "dark regions" in the worm where quantum paths perfectly cancel each other out.
* **The Quantum Zeno Effect:** By adjusting the measurement interval ($\tau$), the simulation demonstrates that measuring a quantum system too frequently effectively freezes its evolution, hindering the wave's propagation.
* **Hardware Realities:** The tool exposes the real steps required to run physics on a QPU, including transpilation depth overhead and the necessity of algorithmic error mitigation.

---

## Running the Simulation

1. **Select Backend:** Press **Run** and select a target. The built-in simulator executes immediately. On *IonQ Forte 1 (Remote Simulator)*, the system respects API quotas by running a single cascade step per execution.
2. **Charge the Laser:** Select a source neuron on the 3D model, hold the fire button (or **Space**) to charge the laser dose ($\theta$), or click and drag the dose meter. Release to fire: the 10 neurons of the window glow in superposition, then the measurement collapses them onto one.
3. **Analyze the Cascade:** Watch the measurement collapse in real-time. Compare $\tau = 8$ (free propagation) with $\tau = 2$ (Zeno effect restriction). 
4. **Inspect the Circuits:** Press **C** to open the circuit inspector for a gate-by-gate breakdown of the exact circuit that ran, alongside the backend's measured counts.

*(Note: The interface is fully keyboard-navigable, screen-reader compatible, provides raw data tables for every chart, and respects standard `prefers-reduced-motion` settings).*

---

## Testing and Development

* **Unit tests** (`tests/backend/`, 24 tests): the one-excitation XY dynamics equals the exact walk; Trotter convergence; Qiskit's bit order; the step circuit against the theory; a step on a backend and a shot with no spike; the instant circuit view is the same circuit that runs; the Zeno table above; the Qiskit figures; and Qollab's rules for the upload (file limits, the shape of `index.html`, allowed imports, no API keys).
* **Browser smoke test** (`tests/e2e/smoke_test.py`, Playwright): walks the intro by keyboard, fires a charged shot, opens the inspector, checks the IonQ one-job lock and the QPU confirmation, a reduced-motion run and a phone run with touch.
* **Run it locally:** `python tools/dev_server.py` imitates Qollab at `http://127.0.0.1:8765` (`?backend=ionq` or `?backend=qpu` imitate IonQ). `python tools/build_qollab.py` builds the folder uploaded to Qollab and checks its limits (at most 100 files, 2 MB each). Details in [docs/development.md](https://github.com/inaki-bermeo/Optogenetic-Quantum-Brain-/blob/main/docs/development.md).
* **Safety:** the real IonQ QPU only runs after a confirming second click, and no API key lives in the code.

---

## Future Horizons

While a single-excitation quantum walk can be simulated efficiently on classical hardware, this platform's underlying Trotterized architecture natively supports the classically intractable regime of multiple simultaneous lasers (hard-core bosons). Future expansions could incorporate directed synapses for chiral quantum walks, inhibitory connections (utilizing negative $J_{ij}$ weights), and full X-basis measurements to actively reveal off-diagonal coherence terms.

---

## Data Sources & Literature

* **Connectome:** Cook et al., *Nature* 571, 63 (2019), via OpenWorm c302.
* **Neuron Positions:** OpenWorm CElegansNeuroML.
* **Touch Reflex Circuit:** Chalfie et al. (1985).
* **Optogenetics Application:** Nagel et al. (2005).
* **Continuous-Time Quantum Walk:** Farhi & Gutmann, *Phys. Rev. A* 58, 915 (1998).
* **Neuron → behaviour table:** lesion and optogenetics studies (Chalfie 1985, Gray 2005, Haspel 2010, Leifer 2011, Stirman 2011 and others), listed in [docs/behaviour.md](https://github.com/inaki-bermeo/Optogenetic-Quantum-Brain-/blob/main/docs/behaviour.md).

**Technology Stack**

* Qiskit, NumPy, SciPy, Matplotlib, Three.js, Web Audio API.

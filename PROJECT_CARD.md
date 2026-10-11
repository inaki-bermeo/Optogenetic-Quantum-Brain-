# Optogenetic Quantum Brain

> **A quantum laser on the real *C. elegans* connectome: a 302-neuron quantum walk, and a spike cascade in which every jump is a 10-qubit Qiskit circuit.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Powered by Qiskit](https://img.shields.io/badge/Powered_by-Qiskit-6133BD.svg)](https://qiskit.org/)
[![Hardware: IonQ](https://img.shields.io/badge/Hardware-IonQ-000000.svg)](https://ionq.com/)

**Supported by Qollab & IonQ**

**Repository:** [https://github.com/inaki-bermeo/Optogenetic-Quantum-Brain-](https://github.com/inaki-bermeo/Optogenetic-Quantum-Brain-)  
**Full theory (Spanish):** [docs/theory.md](https://github.com/inaki-bermeo/Optogenetic-Quantum-Brain-/blob/main/docs/theory.md)

![Optogenetic Quantum Brain Demo](https://raw.githubusercontent.com/inaki-bermeo/Optogenetic-Quantum-Brain-/main/docs/card/demo.gif)

---

## The Team

* **Joaquín Molina** – Qiskit Core & Backend Integration
* **Herbert Díaz** – Quantum Simulation & Scientific Logic
* **Julian Stiefkens** – Physics Engine & Connectome Data
* **Iñaki Bermeo** – UX/UI, 3D Visualization & Audio Engine

---

## Summary & Core Concept

Optogenetics is a technique that makes living neurons sensitive to light by giving them light-gated proteins, so researchers can switch individual cells on or off with a pulse of light and study how the activity spreads. Inspired by the 2026 Nobel Prize in Medicine, awarded to Georg Nagel, Peter Hegemann and Karl Deisseroth, this project brings that idea into quantum computing.

We take the real connectome of *C. elegans* consisting on 302 neurons and fire a "quantum laser" at any neuron. The laser is an `RX(θ)` gate, and the excitation spreads to the neuron's neighbours as a quantum walk. Each step of the spike is decided by a 10-qubit quantum circuit written in Qiskit: the neuron that fired and its 9 most connected neighbours, one qubit each. A measurement then collapses the circuit onto a single neuron, which fires the next step. The result is a model of how a spike could travel through a real neural network, with every step run on a quantum backend.

| Concept | At the *C. elegans* | In our model | In the Qiskit circuit |
| :--- | :--- | :--- | :--- |
| **Neuron** | One of the 302 identified neuron cells | A neuron is *active* when it holds the excitation | One qubit: $\vert{}0\rangle$ = at rest, $\vert{}1\rangle$ = active. A circuit has 10 qubits: the neuron that fired and its 9 most connected neighbours |
| **Light pulse** | A light dose opens the light-gated channels, so the neuron is more or less likely to fire | You hold the fire button to charge the dose $\theta$. The chance that the neuron fires is $\sin^2(\theta/2)$ | An $R_X(\theta)$ gate on the target qubit: $\cos(\theta/2)\vert{}0\rangle - i\sin(\theta/2)\vert{}1\rangle$ |
| **Wiring** | Synapses seen under the electron microscope (Cook et al., 2019) | Two neurons are connected if they share at least one synapse; every connection weighs the same | The coupling matrix $J$, normalised so its largest eigenvalue is 1 |
| **Spreading of the signal** | The activity travels from neuron to neuron through the synapses | The excitation is never created or destroyed: it hops between connected neurons as a wave, and the paths add up or cancel (interference) | Evolution under the XY Hamiltonian for a time $\tau$, built as `PauliEvolutionGate` with a Suzuki–Trotter decomposition into $R_{XX}$ and $R_{YY}$ gates |
| **Reading the result** | Calcium imaging shows which neurons are active, without disturbing them | The measurement picks one neuron: the one that spikes and starts the next step. Measuring too often freezes the spike (quantum Zeno effect) | Z-basis measurement of the 10 qubits; the qubit read as $1$ is the spike. Shots with more than one $1$ are errors and are discarded (post-selection) |

---

## Interactive Visualization Platform (The Lab HUD)

The simulation functions as both an educational platform and a scientific sandbox, featuring a custom **HUD** that provides real-time telemetry of the quantum state and biological reactions:

* **The Mission Log (Left):** Narrates the spike chain as the cascade progresses. Each time a neuron fires, it describes what the real worm does when that class of neuron is switched on (based on lesion and optogenetic experiments).
* **The Scanner (Right):** Summarizes the 10-qubit circuit of the current step: the laser $R_X(\theta)$ and the Trotterized evolution $e^{-i\tau H}$. It also shows the share of valid shots (those with at most one excitation) and compares the theoretical probabilities with the counts returned by the backend you chose. Press **C** to open the circuit inspector and see every $R_{XX}$ and $R_{YY}$ gate.
* **The Control Deck (Bottom):** Sets the target neuron, the laser dose ($\theta$) and the time between measurements ($\tau$).
* **Biological Environment:** The 3D worm moves according to the neurons that fire, while neon bacteria drift around it. One of them is food: when a smell or taste neuron (AWA, AWC, ASE) is measured, the food glows and the head turns towards it, and forward-motion neurons bring it closer.

![The Lab HUD and Circuit Scanner](https://raw.githubusercontent.com/inaki-bermeo/Optogenetic-Quantum-Brain-/main/docs/card/panel1.jpg)

---

## Theoretical Framework & Mathematical Formulation

The physical mapping from biology to quantum computing relies on implementing the connectivty graph of the neurons to a random quantum walk, processed natively through Qiskit and ready to be implemented at the hardware level.

**1. Symmetrization & Spectral Normalization ($J$)**
Chemical synapses are directional, but pure state unitary quantum evolution requires a Hermitian Hamiltonian. We symmetrize the real connectome data (Cook et al., 2019) by applying a logarithmic dampening to heavy-tailed synapse counts:

$$W_{ij} = \log\left(1 + c_{i\rightarrow j} + c_{j\rightarrow i} + \max(g_{ij}, g_{ji})\right)$$

To define time in natural $1/\gamma$ units, the matrix is normalized by its largest eigenvalue, ensuring $\Vert{}J\Vert{}_2 = 1$:

$$J = \frac{W}{\lambda_{\max}(W)}$$

**2. The XY Hamiltonian & Excitation Conservation**
Synaptic propagation is governed by an XY (hard-core boson) Hamiltonian:

$$H = \gamma \sum_{i<j} J_{ij} \frac{X_i X_j + Y_i Y_j}{2} = \gamma \sum_{i<j} J_{ij}(\sigma_i^+ \sigma_j^- + \sigma_i^- \sigma_j^+)$$

Crucially, this Hamiltonian commutes with the total number operator $[\hat{N}, H] = 0$. Since the system begins with a single excitation, dynamics are perfectly bounded within the single-excitation sector, exactly mirroring the Farhi and Gutmann continuous-time quantum walk (CTQW).

**3. Optogenetic Laser as a Rabi Rotation**
A light pulse of intensity and duration $\theta = \Omega \tau$ operates as an $R_X(\theta)$ gate on the illuminated qubit. Assuming a short pulse approximation:

$$R_X(\theta)\vert{}0\rangle = \cos\left(\frac{\theta}{2}\right)\vert{}0\rangle - i \sin\left(\frac{\theta}{2}\right)\vert{}1\rangle$$

By applying unitary evolution to this state, the analytical probability of finding the excitation at any neuron $k$ at time $t$ becomes our central exact result:

$$P_k(t) = \sin^2\left(\frac{\theta}{2}\right) \left\vert{} \langle k \vert{} e^{-i\gamma J t} \vert{} j \rangle \right\vert{}^2$$

**4. Circuit Synthesis via Trotter-Suzuki & IonQ Native Compilation**
Continuous evolution is approximated for gate-based quantum hardware using a second-order Strang splitting (Trotter-Suzuki). Each synapse jump is decomposed as:

$$\text{hop}(\alpha) = e^{-i\alpha(X_i X_j + Y_i Y_j)/2} = R_{XX}(\alpha) \cdot R_{YY}(\alpha)$$

The Trotter operator error scales strictly as $\mathcal{O}(t^3 / r^2)$ driven by the commutators of adjacent synapses $\sum \Vert{}[h_a, h_b]\Vert{}$. During execution on IonQ backends, these gates natively compile to trapped-ion $ZZ(\theta)$ interactions, requiring zero SWAP overhead due to the hardware's all-to-all connectivity.

**5. Stratified Noise Modeling & Symmetry Post-Selection**
To rapidly simulate noisy QPU dynamics, we implement a **Stratified Monte Carlo** estimator that separates the error-free trajectory $P_0$ from the noise combinations. 
To mitigate physical errors, we apply **symmetry post-selection**: since the laser generates a maximum of 1 excitation, any bitstring measured with Hamming weight $\ge 2$ (multiple neurons firing) is an unphysical noise artifact. These shots are dynamically projected out $\left(\Pi_{\le 1} \rho \Pi_{\le 1}\right)$, drastically lowering the hardware's Total Variation Distance (TVD) from the ideal distribution.

---

## Scientific Exploration & Educational Impact

Hamiltonian simulation is theoretically profound but notoriously difficult to visualize. This project makes abstract quantum mechanics tangible:
* **Interference:** Users can observe "dark regions" in the worm where quantum paths perfectly cancel each other out.
* **The Quantum Zeno Effect:** By adjusting the measurement interval ($\tau$), the simulation demonstrates that measuring a quantum system too frequently effectively freezes its evolution, hindering the wave's propagation.
* **Hardware Realities:** The tool exposes the real steps required to run physics on a QPU, including transpilation depth overhead and the necessity of algorithmic error mitigation.

---

## Running the Simulation

1. **Select Backend:** Press **Run** and select a target. The built-in simulator executes immediately. On *IonQ Forte 1 (Remote Simulator)*, the system respects API quotas by running a single cascade step per execution.
2. **Charge the Laser:** Select a source neuron on the 3D model, hold the fire button to adjust the laser dose ($\theta$), and release to view the exact state vector amplitudes.
3. **Analyze the Cascade:** Watch the measurement collapse in real-time. Compare $\tau = 8$ (free propagation) with $\tau = 2$ (Zeno effect restriction). 
4. **Inspect the Circuits:** Press **C** to open the circuit inspector for a gate-by-gate breakdown of the exact circuit that ran, alongside the backend's measured counts.

*(Note: The interface is fully keyboard-navigable, screen-reader compatible, provides raw data tables for every chart, and respects standard `prefers-reduced-motion` settings).*

---

## Future Horizons

While a single-excitation quantum walk can be simulated efficiently on classical hardware, this platform's underlying Trotterized architecture natively supports the classically intractable regime of multiple simultaneous lasers (hard-core bosons). Future expansions could incorporate directed synapses for chiral quantum walks, inhibitory connections (utilizing negative $J_{ij}$ weights), and full X-basis measurements to actively reveal off-diagonal coherence terms.

---

## Prior Work & Acknowledgements

**Hackathon Transparency Declaration**
* **Built before the build window (7–9 Oct 2026):** A local Python prototype (connectome → XY Hamiltonian, exact walk, Trotter/Givens circuits, IonQ native compilation, noisy simulator), a three.js viewer, a 3D worm model, and theory documents.
* **Built during the window (9–11 Oct 2026):** This Qollab project (Qiskit/Pyodide core), the measurement-driven spike cascade on 10-qubit windows, the HUD interface, the microscope-style worm, live sound and music, neon bacteria food logic, and accessibility features.

**Data Sources & Literature**
* **Connectome:** Cook et al., *Nature* 571, 63 (2019), via OpenWorm c302.
* **Neuron Positions:** OpenWorm CElegansNeuroML.
* **Touch Reflex Circuit:** Chalfie et al. (1985).
* **Optogenetics Application:** Nagel et al. (2005).

**Technology Stack**
* Qiskit, NumPy, SciPy, Matplotlib, Three.js, Web Audio API.

**Project Details**
* **Themes:** Quantum Unlocked · Quantum Playground.
* **License:** MIT.

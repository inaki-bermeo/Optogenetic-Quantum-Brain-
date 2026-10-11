# Optogenetic Quantum Brain

> **A quantum laser on the real *C. elegans* connectome: a 302-neuron quantum walk, and a spike cascade in which every jump is a 10-qubit Qiskit circuit.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Powered by Qiskit](https://img.shields.io/badge/Powered_by-Qiskit-6133BD.svg)](https://qiskit.org/)
[![Hardware: IonQ](https://img.shields.io/badge/Hardware-IonQ-000000.svg)](https://ionq.com/)

**This effort is supported by Qollab & IonQ.**

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

## Executive Summary & Core Concept

In biological optogenetics, researchers illuminate a specific neuron with a laser to force it to fire, allowing them to observe the resulting activity as it propagates through the brain's network. This project translates that precise biological experiment into the realm of quantum computing.

By mapping the 302 neurons of the *C. elegans* connectome directly to qubits, we allow users to interactively visualize and simulate quantum interference, state superposition, and the quantum Zeno effect propagating through a biological neural network in real-time.

| Biological Optogenetics | Quantum Hardware Translation |
| :--- | :--- |
| **Neuron state** (rest / active) | **Qubit state** ($\vert{}0\rangle$ / $\vert{}1\rangle$) |
| **Light pulse** (dose $\theta$) | **$R_X(\theta)$ rotation** on the target qubit |
| **Synaptic propagation** | **Quantum walk** under the XY Hamiltonian |
| **Calcium imaging observation** | **Z-basis measurement** (State $1$ = *spike*) |

---

## Interactive Visualization Platform (The Lab HUD)

The simulation functions as both an educational platform and a scientific sandbox, featuring a custom **Heads-Up Display (HUD)** that provides real-time telemetry of the quantum state and biological reactions:

* **The Mission Log (Left):** Narrates the spike chain dynamically. As the cascade progresses, it details the exact biological behavior triggered in the worm (e.g., *egg laying, local muscle relaxation*).
* **The Scanner (Right):** Isolates the exact 10-qubit circuit for the current step. It displays the Trotterized gates ($R_{XX}, R_{YY}$), valid measurement percentages, and compares the theoretical probability with real backend results.
* **The Control Deck (Bottom):** Allows granular control over the laser dose ($\theta$) and the measurement interval ($\tau$) to physically test the Quantum Zeno effect.
* **Biological Environment:** The 3D model reacts physically to the neural cascade, navigating through an environment populated by neon bacteria (representing *E. coli* food sources) based on sensory neuron activation.

![The Lab HUD and Circuit Scanner](https://raw.githubusercontent.com/inaki-bermeo/Optogenetic-Quantum-Brain-/main/docs/card/panel1.jpg)

---

## Theoretical Framework & Mathematical Formulation

The physical mapping from biology to quantum mechanics relies on strict mathematical equivalencies, processed natively through Qiskit and rigorously modeled down to the hardware level.

**1. Symmetrization & Spectral Normalization ($J$)**
Chemical synapses are directional, but unitary quantum evolution requires a Hermitian Hamiltonian. We symmetrize the real connectome data (Cook et al., 2019) with binary weights: two neurons are connected if they share at least one chemical synapse (in either direction) or gap junction, and every connection counts the same:

$$W_{ij} = W_{ji} = \begin{cases} 1 & \text{if } c_{i\rightarrow j} + c_{j\rightarrow i} + g_{ij} > 0 \\ 0 & \text{otherwise} \end{cases}$$

To define time in natural $1/\gamma$ units, the matrix is normalized by its largest eigenvalue (spectral radius $\rho(W)$), ensuring $\Vert{}J\Vert{}_2 = 1$:

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

**5. Hardware Noise & Symmetry Post-Selection**
Noise comes from the backend itself: the IonQ Forte 1 remote simulator applies its hardware noise model, and the quantum computer adds real trapped-ion noise. 
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
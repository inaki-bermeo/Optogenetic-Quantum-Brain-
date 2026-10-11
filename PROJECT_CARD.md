\# Optogenetic Quantum Brain



> \*\*A quantum laser on the real \*C. elegans\* connectome: a 302-neuron quantum walk, and a spike cascade in which every jump is a 10-qubit Qiskit circuit.\*\*



\[!\[License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

\[!\[Powered by Qiskit](https://img.shields.io/badge/Powered\_by-Qiskit-6133BD.svg)](https://qiskit.org/)

\[!\[Hardware: IonQ](https://img.shields.io/badge/Hardware-IonQ-000000.svg)](https://ionq.com/)



\*\*Supported by Qollab \& IonQ\*\*



\*\*Demo video (2–3 min):\*\* \[Add your public link here]  

\*\*Repository:\*\* \[https://github.com/JoaquinQu/Cerebro-Cu-ntico-Optogenetico](https://github.com/JoaquinQu/Cerebro-Cu-ntico-Optogenetico)



\---



\## Executive Summary \& Core Concept



In biological optogenetics, researchers illuminate a specific neuron with a laser to force it to fire, allowing them to observe the resulting activity as it propagates through the brain's network. This project translates that precise biological experiment into the realm of quantum computing.



By mapping the 302 neurons of the \*C. elegans\* connectome directly to qubits, we allow users to interactively visualize and simulate quantum interference, state superposition, and the quantum Zeno effect propagating through a biological neural network in real-time.



| Biological Optogenetics | Quantum Hardware Translation |

| :--- | :--- |

| \*\*Neuron state\*\* (rest / active) | \*\*Qubit state\*\* ($\\vert{}0\\rangle$ / $\\vert{}1\\rangle$) |

| \*\*Light pulse\*\* (dose $\\theta$) | \*\*$R\_X(\\theta)$ rotation\*\* on the target qubit |

| \*\*Synaptic propagation\*\* | \*\*Quantum walk\*\* under the XY Hamiltonian |

| \*\*Calcium imaging observation\*\* | \*\*Z-basis measurement\*\* (State $1$ = \*spike\*) |



\---



\## Interactive Visualization Platform



The simulation functions as both an educational platform and a scientific sandbox, structured into three progressive chapters. It features a live "What you are seeing" narrative overlaid on a 3D structural model of the worm, contextual definitions for technical terms, and a dedicated \*\*Lab settings\*\* interface for granular control.



\### 1. Light: The Continuous Wave

Users select any of the 302 neurons and fire the simulated laser. Because a single laser acting on the 302-qubit XY model reduces exactly to a quantum walk with 302 amplitudes, this chapter is computed with perfect precision via NumPy. It serves as the theoretical baseline, demonstrating how excitation spreads purely as probability waves before measurement collapses the state.



\### 2. Measure: The Quantum Spike Cascade

Each step in the cascade is a dynamic 10-qubit circuit comprising the firing neuron and its 9 most heavily connected neighbors. 

\* The XY evolution is constructed using `PauliEvolutionGate` and `SuzukiTrotter`, executing on the selected backend while respecting strict one-job-per-step API limits.

\* The measurement process collapses the wave. The neuron that measures as $1$ in a randomly selected valid shot triggers the subsequent step, creating a branching spike cascade across the worm.

\* Visual and auditory feedback trace the jump, while a real-time circuit diagram dynamically displays the active gates and measured bits.



\### 3. Inside the Circuit: Hardware Implementation

This chapter isolates a touch-reflex microcircuit (6 to 10 qubits) for deep technical analysis. It compares the exact theoretical progression against an IonQ Forte-like noise model. Users can analyze Trotterization errors, backend transpilation effects, and the impact of symmetry post-selection to mitigate physical hardware errors.



\---



\## Theoretical Framework \& Mathematical Formulation



The physical mapping from biology to quantum mechanics relies on strict mathematical equivalencies, processed natively through Qiskit.



\*\*1. The Connectome Matrix ($J$)\*\*

The chemical and electrical synapses derived from Cook et al. (2019) are symmetrized using binary weights (connected or disconnected). The matrix is then normalized by its largest eigenvalue to ensure $\\Vert{}J\\Vert{} = 1$.



\*\*2. The XY Hamiltonian\*\*

Propagation is governed by a Hamiltonian that strictly conserves the number of excitations. 



$$H = \\frac{\\gamma}{2} \\sum\_{i,j} J\_{ij} (X\_i X\_j + Y\_i Y\_j)$$



In the single-excitation sector, this reduces precisely to $\\gamma J$, functioning as the continuous-time quantum walk described by Farhi and Gutmann.



\*\*3. State Evolution \& Probability\*\*

For a laser applied to neuron $j$ with an intensity dose $\\theta$, the probability of finding the excitation at neuron $k$ at time $t$ is dictated by the unitary evolution:



$$P\_k(t) = \\sin^2\\left(\\frac{\\theta}{2}\\right) \\left\\vert{} \\langle k \\vert{} e^{-i\\gamma J t} \\vert{} j \\rangle \\right\\vert{}^2$$



\*\*4. Trotterization \& Circuit Synthesis\*\*

To implement continuous evolution on discrete gate-based hardware, the quantum walk is approximated using a second-order Trotter–Suzuki decomposition, yielding an error scaling of $\\mathcal{O}(t^3 / r^2)$. Each synaptic connection is decomposed into physical hardware instructions:



$$e^{-i\\alpha(X X + Y Y)/2} = R\_{XX}(\\alpha) \\cdot R\_{YY}(\\alpha)$$



\*\*5. Error Mitigation via Post-Selection\*\*

Since a single laser initializes exactly one excitation, any hardware measurement returning multiple $1$s is demonstrably an error. These unphysical shots are automatically discarded using symmetry post-selection, significantly improving the Total Variation Distance (TVD) of the hardware output.



\---



\## Scientific Exploration \& Educational Impact



Hamiltonian simulation is theoretically profound but notoriously difficult to visualize. This project makes abstract quantum mechanics tangible:

\* \*\*Interference:\*\* Users can observe "dark regions" in the worm where quantum paths perfectly cancel each other out.

\* \*\*The Quantum Zeno Effect:\*\* By adjusting the measurement interval ($\\tau$), the simulation demonstrates that measuring a quantum system too frequently effectively freezes its evolution, hindering the wave's propagation.

\* \*\*Hardware Realities:\*\* The tool exposes the real steps required to run physics on a QPU, including transpilation depth overhead and the necessity of algorithmic error mitigation.



\---



\## Running the Simulation



1\. \*\*Select Backend:\*\* Press \*\*Run\*\* and select a target. The built-in simulator executes immediately. On \*IonQ Forte 1 (Remote Simulator)\*, the system respects API quotas by running a single cascade step per execution.

2\. \*\*Execute Chapter 1:\*\* Select a source neuron on the 3D model, adjust the laser dose ($\\theta$), and press \*\*Fire laser\*\* to view the exact state vector amplitudes.

3\. \*\*Execute Chapter 2:\*\* Press \*\*Start cascade\*\* to observe the measurement collapse. Compare $\\tau = 8$ (free propagation) with $\\tau = 2$ (Zeno effect restriction). Use the \*\*Compute comparison\*\* tool to analytically contrast the coherent walk, the measured walk, the 10-qubit cascade, and a classical random walk counterpart.

4\. \*\*Execute Chapter 3:\*\* Select a specific microcircuit configuration and press \*\*Run circuit\*\* to execute a unified job across 4 time intervals, instantly comparing raw hardware results against post-selected TVD curves.



\*(Note: The interface is fully keyboard-navigable, screen-reader compatible, provides raw data tables for every chart, and respects standard `prefers-reduced-motion` settings).\*



\---



\## Future Horizons



While a single-excitation quantum walk can be simulated efficiently on classical hardware, this platform's underlying Trotterized architecture natively supports the classically intractable regime of multiple simultaneous lasers (hard-core bosons). Future expansions could incorporate directed synapses for chiral quantum walks, inhibitory connections (utilizing negative $J\_{ij}$ weights), and full X-basis measurements to actively reveal off-diagonal coherence terms.



\---



\## Prior Work \& Acknowledgements



\*\*Hackathon Transparency Declaration\*\*

\[Specify precisely what was conceptualized prior to the event, and what was developed, coded, and integrated during the hackathon build window to ensure compliance with judging criteria. e.g., "The core XY Hamiltonian theory was conceptualized prior to the event. The entire 3D interactive interface, Qiskit Trotterization integration, IonQ API connection, and DSP audio engine were built entirely during the 48-hour hackathon window."]



\*\*Data Sources \& Literature\*\*

\* \*\*Connectome:\*\* Cook et al., \*Nature\* 571, 63 (2019), via OpenWorm c302.

\* \*\*Neuron Positions:\*\* OpenWorm CElegansNeuroML.

\* \*\*Touch Reflex Circuit:\*\* Chalfie et al. (1985).

\* \*\*Optogenetics Application:\*\* Nagel et al. (2005).



\*\*Technology Stack\*\*

\* Qiskit, NumPy, SciPy, Matplotlib, Three.js.



\*\*Project Details\*\*

\* \*\*Hackathon Themes:\*\* Quantum Unlocked, Quantum Playground.

\* \*\*License:\*\* MIT.


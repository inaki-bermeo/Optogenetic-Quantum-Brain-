# Theory: from the connectome to a quantum circuit

This document explains the physics and the technical decisions behind `backend/cerebro_q/` (the Python core that runs in the browser). Each section names the module that implements it and the test that verifies it (`tests/backend/test_cerebro_q.py`).

> **Origin.** Restored from the prototype (`git show 0c3e4e5:docs/TEORIA.md`) and adjusted to the current app. The sections that described code that is no longer in this repo were removed: the custom compiler to IonQ native gates, the REST client, the prototype's error budget and its experiment script. Today Qiskit transpiles the circuit and, on IonQ, the IonQ server compiles it to native gates (§6.3). The design of the window cascade is in [`cascade.md`](cascade.md).

**Summary in one sentence.** Each *C. elegans* neuron is a qubit; a light pulse (the optogenetic laser) rotates it with an $R_X(\theta)$ gate; the worm's real synapses define an XY hopping Hamiltonian whose dynamics, in the one-excitation sector, are exactly a *quantum walk* on the connectome; measuring a qubit in $|1\rangle$ is a "spike" of that neuron. In the app, each step of the cascade simulates a window of 10 neurons (the one that fired and its 9 neighbours with the most synapses) with a 10-qubit Qiskit circuit that runs on the backend chosen in Qollab, **IonQ Forte** included.

---

## Contents

1. [What this model is and is not](#1-what-this-model-is-and-is-not)
2. [Data: from the connectome to a Hermitian matrix](#2-data-from-the-connectome-to-a-hermitian-matrix)
3. [XY Hamiltonian and quantum walk](#3-xy-hamiltonian-and-quantum-walk)
4. [The optogenetic laser as a Rabi rotation](#4-the-optogenetic-laser-as-a-rabi-rotation)
5. [Measurement: the spike and the conservation law](#5-measurement-the-spike-and-the-conservation-law)
6. [From the Hamiltonian to the circuit](#6-from-the-hamiltonian-to-the-circuit)
7. [Choosing the cascade parameters](#7-choosing-the-cascade-parameters)
8. [Error mitigation](#8-error-mitigation)
9. [Numerical verification implemented](#9-numerical-verification-implemented)
10. [Possible extensions](#10-possible-extensions)
11. [References](#11-references)

---

## 1. What this model is and is not

**It is** a coherent quantum dynamics defined on the real synapse network of *C. elegans*, excited by a local pulse that imitates optogenetic stimulation. It uses the structure of the connectome as the "track" along which a quantum excitation travels, and it lets us compare exact theory, noisy simulation and real hardware.

**It is not** a biophysical model of neurons. Real neurons are dissipative, classical systems at this scale (membrane potentials, ion channels, milliseconds); we do not claim that the brain is quantum. The analogy is structural:

| Real optogenetics | This model |
|---|---|
| Blue light (~470 nm) opens channelrhodopsin-2 | A control pulse rotates the qubit: $R_X(\theta)$ |
| Pulse intensity × duration | Rabi angle $\theta = \Omega\tau$ |
| Firing probability depends on the light dose | $P(\text{fire}) = \sin^2(\theta/2)$ |
| Activity travels along the synapses | The excitation hops along the couplings $J_{ij}$ |
| Calcium imaging / electrophysiology | $Z$-basis measurement: $\vert 1\rangle$ = spike |

**Honesty about quantum advantage.** With a single laser, the dynamics live in the one-excitation sector (dimension $n$), which can be simulated classically in polynomial time: that is how we solve all 302 neurons. The hardware does not "win" here; it demonstrates the physics. With $k$ simultaneous lasers, the sector has dimension $\binom{n}{k}$ and the exclusion (a qubit cannot hold two excitations) introduces an effective interaction (hard-core bosons). There, classical simulation grows combinatorially and Trotter evolution on hardware is the natural path (§10).

---

## 2. Data: from the connectome to a Hermitian matrix

*Modules:* `cerebro_q/datos.py`, `cerebro_q/fisica.py` · *Data:* `backend/data/` · *Test:* `TestFisica.test_normalizacion`

**Sources.**

- Chemical synapses and gap junctions of the adult hermaphrodite: **Cook et al., *Nature* 2019**, distributed by OpenWorm (`c302/data/herm_full_edgelist.csv`). After filtering to the 302 neurons of the nervous system and normalizing names (`DA01` → `DA1`), there remain 3,604 directed chemical connections and 2,155 electrical entries.
- 3D position of the soma and classification (sensory / interneuron / motor) from **OpenWorm CElegansNeuroML**: 302 neurons, anteroposterior axis from −312 to 410 µm.
- Only CANL and CANR remain isolated, because they have no synapses in the dataset.

**Symmetrization and binary weights.** A Hamiltonian must be Hermitian, so $J$ has to be symmetric. The project uses **binary weights** (a team decision): two neurons are connected if they share at least one chemical synapse, in either direction, or a gap junction, and all connections weigh the same:

```math
W_{ij} = \mathbb{1}\left[\, c_{i\to j} + c_{j\to i} + g_{ij} + g_{ji} > 0 \,\right]
```

where $\mathbb{1}[\cdot]$ is 1 when the condition holds and 0 otherwise, $c_{i\to j}$ counts chemical synapses and $g_{ij}$ gap junctions. $W$ is the adjacency matrix of the connectome, and the propagation depends only on who is connected to whom. Earlier prototypes also tried weights $\log(1+n_{ij})$ and raw counts; the current backend implements binary weights only. **Limitations:** the direction of the chemical synapse (§10) and the number of synapses of each connection are lost.

**Spectral normalization.**

```math
J = \frac{W}{\lambda_{\max}(W)}, \qquad \lVert J \rVert_2 = 1
```

With this, time is measured in units of $1/\gamma$. With binary weights, $\lambda_{\max}(W) \approx 32.8$ and every connection has $J_{ij} \approx 0.0305$. Each window of the cascade uses **the same global scale**: $J_{\text{sub}} = J[S,S]$. Its Hamiltonian is therefore literally the restriction of the full network's. By restricting, the window is treated as **isolated**: its couplings to the other ~292 neurons are ignored. That is why its dynamics do not match those of the same neurons inside the full network; how much escapes in the real network as a function of τ is in [`cascade.md`](cascade.md) §2.2.

---

## 3. XY Hamiltonian and quantum walk

*Module:* `cerebro_q/fisica.py` · *Test:* `TestFisica`

We assign one qubit to each neuron ($|0\rangle$ at rest, $|1\rangle$ excited) and define

```math
H = \gamma \sum_{i \lt j} J_{ij}\,\frac{X_i X_j + Y_i Y_j}{2}
  = \gamma \sum_{i \lt j} J_{ij}\,(\sigma_i^{+}\sigma_j^{-} + \sigma_i^{-}\sigma_j^{+})
```

This is the XY model, or hard-core boson model, on the connectome graph: each term moves an excitation from $j$ to $i$ with amplitude $\gamma J_{ij}$.

**Property 1: conservation.** $[H, \hat N] = 0$ with $\hat N = \sum_k \tfrac{1}{2}(1 - Z_k)$. Each term $\sigma^+_i\sigma^-_j$ destroys one excitation and creates another.

**Property 2: the vacuum is stationary.** $H |0\cdots0\rangle = 0$.

**Property 3: equivalence with the quantum walk.** Let $|e_k\rangle$ be the state with only neuron $k$ excited. Then

```math
\sigma_i^{+}\sigma_j^{-}\,|e_k\rangle = \delta_{jk}\,|e_i\rangle
```

and therefore

```math
H\,|e_k\rangle = \gamma \sum_i J_{ik}\,|e_i\rangle
\quad\Longrightarrow\quad
H\big|_{\text{1 excitation}} = \gamma J
```

The evolution in that sector is the **continuous-time quantum walk** (Farhi & Gutmann 1998) with Hamiltonian $\gamma J$:

```math
\langle e_k | e^{-iHt} | e_j \rangle = \big[ e^{-i\gamma J t} \big]_{kj}
```

**Exact computation on 302 neurons.** $J$ is real and symmetric, so $J = V \Lambda V^{\top}$. It is diagonalized once and, for any $t$,

```math
\big[ e^{-i\gamma J t} \big]_{kj} = \sum_m V_{km}\, e^{-i\gamma \lambda_m t}\, V_{jm}
```

which costs $O(N^2)$ per frame. That is how it is computed in milliseconds (`fisica.probabilidades_walk`).

**What you see.** The walk shows interference: some neurons light up and go dark, and some regions stay dark because the amplitudes of different paths cancel. On a chain it would advance ballistically (spread $\propto t$), but the connectome is a small-world graph: what distinguishes the walk is that it never settles and remembers its origin. By $t = 60$ it is spread over an "effective participation" $1/\sum_k q_k^2 \approx 130$ neurons, against $\approx 285$ for classical diffusion (details in `docs/theory_tex/`).

---

## 4. The optogenetic laser as a Rabi rotation

*Modules:* `cerebro_q/cascada.circuito_paso`, `cerebro_q/circuitos.operaciones`

In channelrhodopsin, a resonant light pulse of Rabi frequency $\Omega$ and duration $\tau$ rotates a two-level system by an angle $\theta = \Omega\tau$. On a qubit, the same control is

```math
R_X(\theta) = e^{-i\theta X/2}, \qquad
R_X(\theta)|0\rangle = \cos\tfrac{\theta}{2}\,|0\rangle - i\sin\tfrac{\theta}{2}\,|1\rangle
```

Illuminating neuron $j$ of the resting network gives

```math
|\psi(0)\rangle = \cos\tfrac{\theta}{2}\,|0\cdots0\rangle - i\sin\tfrac{\theta}{2}\,|e_j\rangle
```

By properties 2 and 3 of §3, the vacuum does not evolve and the excited component performs the quantum walk:

```math
|\psi(t)\rangle = \cos\tfrac{\theta}{2}\,|0\cdots0\rangle - i\sin\tfrac{\theta}{2} \sum_k \big[ e^{-i\gamma J t} \big]_{kj}\,|e_k\rangle
```

**Central result (firing probability of neuron $k$):**

```math
\boxed{\, P_k(t) = \sin^2\!\tfrac{\theta}{2}\;\Big|\big[ e^{-i\gamma J t} \big]_{kj}\Big|^2 \,}
```

The laser intensity only scales the global amplitude: with $\theta = \pi$ the firing is certain, and with $\theta = \pi/2$ it happens half of the time. The *pattern* of propagation is set by the connectome. `test_xy_igual_a_walk` checks this formula and $P(\text{vacuum}) = \cos^2(\theta/2)$ against the exact evolution in the full Hilbert space (`tests/backend/referencia.py`).

**Several lasers.** $\bigotimes_{s \in S} R_X(\theta)_s$ creates a superposition of sectors with $0, \dots, |S|$ excitations (binomial weights). For $|S| \ge 2$ the dynamics no longer reduces to $J$: the hard-core exclusion prevents two excitations from occupying the same neuron. The tests' exact reference solves it in the full space for small circuits.

---

## 5. Measurement: the spike and the conservation law

Each qubit is measured in the $Z$ basis. A shot returns a bit string, which is an activation pattern of the window: bit $k$ equal to 1 means that neuron $k$ fired. The population $P_k = \Pr[b_k = 1]$ is the marginal.

Since $\hat N$ is conserved, with $k$ lasers **no ideal shot can have more than $k$ bits equal to 1**. That rule is the basis of the mitigation by post-selection (§8).

---

## 6. From the Hamiltonian to the circuit

*Modules:* `cerebro_q/circuitos.py`, `cerebro_q/cascada.py` · *Tests:* `TestCircuitos`, `TestCascada`

### 6.1 Why IonQ

- **All-to-all connectivity.** Any pair of ions can be entangled directly. A connectome is an irregular, non-planar graph, so on a nearest-neighbour chip each synapse would need chains of SWAPs. On IonQ each synapse is a direct gate, with no routing overhead.
- **Parameterized entangling gate.** Forte exposes $ZZ(\theta)$ with the angle as a parameter, which fits the small hops $\gamma J_{ij}\delta t$ of a Trotter formula (§6.2).
- **Quality.** Forte has 36 qubits, a 1-qubit fidelity of 99.98 % and a 2-qubit fidelity of 99.6 % (ionq.com/quantum-systems/compare).

### 6.2 Trotter–Suzuki evolution

We write $H = \sum_e h_e$, with one term per synapse, $h_e = \gamma J_e (XX+YY)/2$. Each term is exponentiated exactly with the hop gate

```math
\mathrm{hop}(\alpha) \equiv e^{-i\alpha (XX+YY)/2}, \qquad e^{-ih_e\delta} = \mathrm{hop}(\gamma J_e \delta)
```

**First order:** $U_1(\delta) = \prod_e e^{-ih_e\delta}$. **Second order (Strang):** $U_2(\delta) = \prod_e e^{-ih_e\delta/2}\prod_{e \text{(reversed)}} e^{-ih_e\delta/2}$. With $r$ steps and $\delta = t/r$:

```math
\bigl\lVert e^{-iHt} - U_1(t/r)^r \bigr\rVert \le \frac{t^2}{2r} \sum_{a<b} \bigl\lVert [h_a, h_b] \bigr\rVert,
\qquad
\bigl\lVert e^{-iHt} - U_2(t/r)^r \bigr\rVert = O\!\left(\frac{t^3}{r^2}\right)
```

(Childs et al. 2021). Consecutive halves on the same pair merge exactly, because a term commutes with itself. So $r$ second-order steps cost $(2|E|-2) r + 1$ hops and not $2|E|r$; in `toque-6` ($|E| = 8$, $r = 2$) that is 29 hops, that is, 58 ZZ gates. The commutator bound is loose: in `toque-6`, at $t = 30$ with $r = 2$, the first-order bound is 7, while the actual second-order error in distribution is TVD = 0.09. `test_trotter_converge` checks that the error drops as $r$ grows. In the app the circuit uses Qiskit's `PauliEvolutionGate` with `SuzukiTrotter(order=2)`, which implements exactly this formula (`test_circuito_paso_igual_a_teoria` compares it with the theory). The `toque-6` examples come from the prototype's microcircuit.

Because it uses the real Hamiltonian, this mode is a **genuine Hamiltonian simulation** (Lloyd 1996) and it generalizes as is to several lasers.

### 6.3 On IonQ: native gates

The page transpiles each circuit with `transpile(qc, backend, optimization_level=1)`, which is what `qiskit-ionq` recommends. On IonQ backends the `RXX`/`RYY` gates are left as they are and the IonQ server compiles them to its native two-qubit gate:

```math
e^{-i\beta XX} = (V \otimes V)\, ZZ\!\left(\tfrac{\beta}{\pi}\right) (V^\dagger \otimes V^\dagger), \qquad V = \mathrm{GPi2}(\tfrac14) = R_Y(\tfrac{\pi}{2})
```

and the same for $YY$ with $W = \mathrm{GPi2}(0) = R_X(\tfrac{\pi}{2})$, where $ZZ(\theta) = e^{-i\pi\theta Z \otimes Z}$ (phases in turns; docs.ionq.com, *Getting started with native gates*). Each synapse per Trotter step therefore costs **2 ZZ gates**, with no SWAPs thanks to the all-to-all connectivity. On noisy simulators with nearest-neighbour topology, the transpiler adds SWAPs: the page shows the two-qubit gates after transpiling.

Qollab allows **one IonQ job per run**: the cascade therefore runs a single step on IonQ (each step depends on the previous one) and the button is then locked.

---

## 7. Choosing the cascade parameters

*Code:* `frontend/main.js` (`trotterReps`) · *Analysis:* `tools/zeno_analysis.py`

- **Trotter steps per window:** 1 if $\tau \le 4.5$, 2 if $\tau \le 9$ and 3 above. With that, the TVD against the exact evolution of the window stays below about 0.025.
- **Cost:** a window has between 25 (median) and 38 (maximum) edges, because the neighbours are also connected to each other. One Strang step ($r = 1$) is about 98 two-qubit gates, and the estimated fidelity on Forte is $0.996^{98} \approx 0.67$.
- **Default τ = 8:** the compromise between the window representing the network and the spike actually moving (Zeno effect, see [`cascade.md`](cascade.md) §2.2).

---

## 8. Error mitigation

1. **Symmetry post-selection** (Bonet-Monroig et al. 2018; McArdle et al. 2019). Shots with more excitations than lasers are discarded and the rest is renormalized (`analisis.contar_spikes`). In the prototype, with Forte-like noise on `toque-6`, the TVD against the theory dropped from 0.17 to 0.05 after post-selecting. This is exactly the procedure IonQ recommends as *symmetry-based post-selection* in its best-practices guide.
2. **IonQ debiasing.** The server can generate symmetric variants of the circuit and aggregate them; it is an option of the IonQ API (`settings.error_mitigation`).
3. **Cross-validation.** Each step compares the window's theory (exact walk) with what the backend measured; panel 2 also shows the circuit's ideal distribution (Statevector).

---

## 9. Numerical verification implemented

`python -m unittest discover -s tests/backend` (from the repo root):

| Claim of the theory | Test |
|---|---|
| $J$ symmetric, $\lVert J \rVert_2 = 1$, 302 neurons | `TestFisica.test_normalizacion` |
| The walk preserves the norm $\sin^2(\theta/2)$ | `TestFisica.test_walk_conserva_norma` |
| One-excitation sector of XY = quantum walk $\gamma J$; $P(\text{vacuum}) = \cos^2(\theta/2)$ | `TestFisica.test_xy_igual_a_walk` |
| Trotter converges to the exact evolution | `TestCircuitos.test_trotter_converge` |
| Qiskit's bit convention and post-selection of one spike | `TestCircuitos.test_orden_de_bits_qiskit` |
| `PauliEvolutionGate` + `SuzukiTrotter` = the window's theory | `TestCascada.test_circuito_paso_igual_a_teoria` |
| One step = one job; the spike comes from a valid shot | `TestCascada.test_paso_en_backend`, `test_paso_sin_disparo` |
| Zeno effect and the τ table of the Project Card | `TestZeno` |
| Qollab rules (≤ 100 files, literal paths, no keys) | `TestReglasQollab` |

---

## 10. Possible extensions

- **Directed synapses.** A Hamiltonian cannot be asymmetric. The options are a quantum stochastic walk, which interpolates with the classical one through a Lindblad equation (Whitfield et al. 2010), or complex phases $J_{ij}e^{i\varphi_{ij}}$ that break time-reversal symmetry (*chiral quantum walks*, Zimborás et al. 2013).
- **Inhibition.** GABAergic synapses could carry a negative sign in $J_{ij}$. The circuit does not change, because the compilation already admits negative angles.
- **Several lasers on hardware.** This is the many-body regime, classically expensive, where quantum simulation makes real sense.
- **Dissipation.** A controlled *amplitude damping* would model the neuron's return to rest.

---

## 11. References

1. E. Farhi, S. Gutmann, *Quantum computation and decision trees*, Phys. Rev. A **58**, 915 (1998).
2. A. M. Childs, *Universal computation by quantum walk*, Phys. Rev. Lett. **102**, 180501 (2009).
3. O. Mülken, A. Blumen, *Continuous-time quantum walks: Models for coherent transport on complex networks*, Phys. Rep. **502**, 37 (2011).
4. S. J. Cook et al., *Whole-animal connectomes of both Caenorhabditis elegans sexes*, Nature **571**, 63 (2019).
5. J. G. White et al., *The structure of the nervous system of the nematode C. elegans*, Phil. Trans. R. Soc. B **314**, 1 (1986).
6. M. Chalfie et al., *The neural circuit for touch sensitivity in Caenorhabditis elegans*, J. Neurosci. **5**, 956 (1985).
7. G. Nagel et al., *Light activation of channelrhodopsin-2 in excitable cells of Caenorhabditis elegans triggers rapid behavioral responses*, Curr. Biol. **15**, 2279 (2005).
8. E. S. Boyden et al., *Millisecond-timescale, genetically targeted optical control of neural activity*, Nat. Neurosci. **8**, 1263 (2005).
9. S. Lloyd, *Universal quantum simulators*, Science **273**, 1073 (1996).
10. A. M. Childs, Y. Su, M. C. Tran, N. Wiebe, S. Zhu, *Theory of Trotter error with commutator scaling*, Phys. Rev. X **11**, 011020 (2021).
11. A. Sørensen, K. Mølmer, *Quantum computation with ions in thermal motion*, Phys. Rev. Lett. **82**, 1971 (1999).
12. I. D. Kivlichan et al., *Quantum simulation of electronic structure with linear depth and connectivity*, Phys. Rev. Lett. **120**, 110501 (2018).
13. Z. Jiang et al., *Quantum algorithms to simulate many-body physics of correlated fermions*, Phys. Rev. Applied **9**, 044036 (2018).
14. X. Bonet-Monroig, R. Sagastizabal, M. Singh, T. E. O'Brien, *Low-cost error mitigation by symmetry verification*, Phys. Rev. A **98**, 062339 (2018).
15. S. McArdle, X. Yuan, S. Benjamin, *Error-mitigated digital quantum simulation*, Phys. Rev. Lett. **122**, 180501 (2019).
16. S. Bose, *Quantum communication through an unmodulated spin chain*, Phys. Rev. Lett. **91**, 207901 (2003).
17. J. D. Whitfield, C. A. Rodríguez-Rosario, A. Aspuru-Guzik, *Quantum stochastic walks*, Phys. Rev. A **81**, 022323 (2010).
18. Z. Zimborás et al., *Quantum transport enhancement by time-reversal symmetry breaking*, Sci. Rep. **3**, 2361 (2013).
19. IonQ, *Getting started with native gates*: https://docs.ionq.com/guides/getting-started-with-native-gates
20. IonQ, *API v0.4 — Create job*: https://docs.ionq.com/api-reference/v0.4/jobs/create-job
21. IonQ, *Best practices for using IonQ hardware*: https://ionq.com/docs/best-practices-for-using-ionq-hardware
22. IonQ, *Compare quantum systems*: https://www.ionq.com/quantum-systems/compare
23. OpenWorm: https://github.com/openworm/c302 and https://github.com/openworm/CElegansNeuroML

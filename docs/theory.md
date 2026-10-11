# Teoría: del conectoma a un circuito cuántico

Este documento explica la física y las decisiones técnicas detrás de `backend/cerebro_q/` (el núcleo Python que corre en el navegador). Cada sección indica el módulo que la implementa y el test que la verifica (`tests/backend/test_cerebro_q.py`).

> **Origen.** Restaurado del prototipo (`git show 0c3e4e5:docs/TEORIA.md`) y ajustado a la app actual. Se quitaron las secciones que describían código que ya no está en el repo: el compilador propio a compuertas nativas de IonQ, el cliente REST, el presupuesto de errores del prototipo y su script de experimentos. Hoy Qiskit transpila el circuito y, en IonQ, su servidor lo compila a compuertas nativas (§6.3). El diseño de la cascada por ventanas está en [`cascade.md`](cascade.md).

**Resumen en una frase.** Cada neurona de *C. elegans* es un qubit; un pulso de luz (láser optogenético) la rota con una compuerta $R_X(\theta)$; las sinapsis reales del gusano definen un hamiltoniano de saltos tipo XY cuya dinámica, en el sector de una excitación, es exactamente un *quantum walk* sobre el conectoma; medir un qubit en $|1\rangle$ equivale a un "spike" de esa neurona. En la app, cada paso de la cascada simula una ventana de 10 neuronas (la que disparó y sus 9 vecinas con más sinapsis) con un circuito de Qiskit de 10 qubits, que corre en el backend elegido en Qollab, incluido **IonQ Forte**.

---

## Índice

1. [Qué es y qué no es este modelo](#1-qué-es-y-qué-no-es-este-modelo)
2. [Datos: del conectoma a una matriz hermítica](#2-datos-del-conectoma-a-una-matriz-hermítica)
3. [Hamiltoniano XY y quantum walk](#3-hamiltoniano-xy-y-quantum-walk)
4. [El láser optogenético como rotación de Rabi](#4-el-láser-optogenético-como-rotación-de-rabi)
5. [Medición: el spike y la ley de conservación](#5-medición-el-spike-y-la-ley-de-conservación)
6. [Del hamiltoniano al circuito](#6-del-hamiltoniano-al-circuito)
7. [Elección de parámetros en la cascada](#7-elección-de-parámetros-en-la-cascada)
8. [Mitigación de errores](#8-mitigación-de-errores)
9. [Verificación numérica implementada](#9-verificación-numérica-implementada)
10. [Extensiones posibles](#10-extensiones-posibles)
11. [Referencias](#11-referencias)

---

## 1. Qué es y qué no es este modelo

**Es** una dinámica cuántica coherente definida sobre la red de sinapsis real de *C. elegans*, excitada por un pulso local que imita la estimulación optogenética. Usa la estructura del conectoma como "pista" por la que viaja una excitación cuántica, y permite comparar teoría exacta, simulación con ruido y hardware real.

**No es** un modelo biofísico de neuronas. Las neuronas reales son sistemas disipativos y clásicos a esta escala (potenciales de membrana, canales iónicos, ~ms); aquí no se afirma que el cerebro sea cuántico. La analogía es estructural:

| Optogenética real | Este modelo |
|---|---|
| Luz azul (~470 nm) abre la channelrhodopsina-2 | Pulso de control rota el qubit: $R_X(\theta)$ |
| Intensidad × duración del pulso | Ángulo de Rabi $\theta = \Omega\,\tau$ |
| Probabilidad de disparo según la dosis de luz | $P(\text{disparo}) = \sin^2(\theta/2)$ |
| La actividad viaja por las sinapsis | La excitación salta por los acoplamientos $J_{ij}$ |
| Registro de calcio / electrofisiología | Medición en base $Z$: $|1\rangle$ = spike |

**Honestidad sobre la ventaja cuántica.** Con un solo láser, la dinámica vive en el sector de una excitación (dimensión $n$), que es clásicamente simulable en tiempo polinomial: así resolvemos las 302 neuronas. El hardware no "gana" aquí; demuestra la física. Con $k$ láseres simultáneos, el sector tiene dimensión $\binom{n}{k}$ y la exclusión (un qubit no admite dos excitaciones) introduce interacción efectiva (bosones de núcleo duro). Ahí la simulación clásica crece combinatoriamente y la evolución de Trotter en hardware es el camino natural (§10).

---

## 2. Datos: del conectoma a una matriz hermítica

*Módulos:* `cerebro_q/datos.py`, `cerebro_q/fisica.py` · *Datos:* `backend/data/` · *Test:* `TestFisica.test_normalizacion`

**Fuentes.**

- Sinapsis químicas y uniones gap del hermafrodita adulto: **Cook et al., *Nature* 2019**, distribuidas por OpenWorm (`c302/data/herm_full_edgelist.csv`). Tras filtrar a las 302 neuronas del sistema nervioso y normalizar nombres (`DA01` → `DA1`), quedan 3 604 conexiones químicas dirigidas y 2 155 entradas eléctricas.
- Posición 3D del soma y clasificación (sensorial / interneurona / motora) de **OpenWorm CElegansNeuroML**: 302 neuronas, eje anteroposterior de −312 a 410 µm.
- Sólo CANL/CANR quedan aisladas, porque no tienen sinapsis en el conjunto de datos.

**Simetrización y pesos binarios.** Un hamiltoniano debe ser hermítico, así que $J$ tiene que ser simétrica. El proyecto usa **pesos binarios** (decisión del equipo): dos neuronas están conectadas si tienen al menos una sinapsis química, en cualquier sentido, o un contacto gap, y todas las conexiones pesan lo mismo:

$$
W_{ij} = \begin{cases} 1 & \text{si } c_{i\to j} + c_{j\to i} + g_{ij} + g_{ji} > 0 \\ 0 & \text{si no} \end{cases}
$$

$W$ es la matriz de adyacencia del conectoma, y la propagación depende solo de quién está conectado con quién. El backend conserva las opciones `log` ($\log(1+n_{ij})$, que pesa por número de sinapsis) y `count`. **Limitaciones:** se pierden la dirección de la sinapsis química (§10) y el número de sinapsis de cada conexión.

**Normalización espectral.**

$$
J = \frac{W}{\lambda_{\max}(W)},\qquad \|J\|_2 = 1 .
$$

Con esto el tiempo queda en unidades de $1/\gamma$. Con pesos binarios, $\lambda_{\max}(W) \approx 32.8$ y toda conexión vale $J_{ij} \approx 0.0305$. Cada ventana de la cascada usa **la misma escala global**: $J_{\text{sub}} = J[S,S]$. Así su hamiltoniano es literalmente la restricción del de la red completa. Al restringir, la ventana se trata como **aislada**: se ignoran sus acoplamientos con las otras ~292 neuronas. Por eso su dinámica no coincide con la de esas mismas neuronas dentro de la red completa; cuánto se escapa en la red real según τ está en [`cascade.md`](cascade.md) §2.2.

---

## 3. Hamiltoniano XY y quantum walk

*Módulo:* `cerebro_q/fisica.py` · *Test:* `TestFisica`

Asignamos un qubit a cada neurona ($|0\rangle$ en reposo, $|1\rangle$ excitada) y definimos

$$
H \;=\; \gamma \sum_{i<j} J_{ij}\,\frac{X_iX_j + Y_iY_j}{2}
\;=\; \gamma \sum_{i<j} J_{ij}\left(\sigma_i^{+}\sigma_j^{-} + \sigma_i^{-}\sigma_j^{+}\right).
$$

Es el modelo XY, o de bosones de núcleo duro, sobre el grafo del conectoma: cada término mueve una excitación de $j$ a $i$ con amplitud $\gamma J_{ij}$.

**Propiedad 1: conservación.** $[H, \hat N] = 0$ con $\hat N = \sum_k \tfrac{1}{2}(1 - Z_k)$. Cada término $\sigma^+_i\sigma^-_j$ destruye una excitación y crea otra.

**Propiedad 2: el vacío es estacionario.** $H\,|0\cdots0\rangle = 0$.

**Propiedad 3: equivalencia con el quantum walk.** Sea $|e_k\rangle$ el estado con sólo la neurona $k$ excitada. Entonces $\sigma^+_i\sigma^-_j |e_k\rangle = \delta_{jk}|e_i\rangle$, y por lo tanto

$$
H\,|e_k\rangle = \gamma\sum_i J_{ik}\,|e_i\rangle
\quad\Longrightarrow\quad
H\big|_{\text{1 excitación}} = \gamma J .
$$

La evolución en ese sector es el **quantum walk de tiempo continuo** (Farhi & Gutmann 1998) con hamiltoniano $\gamma J$:

$$
\langle e_k | e^{-iHt} | e_j\rangle = \big[e^{-i\gamma J t}\big]_{kj}.
$$

**Cálculo exacto en 302 neuronas.** $J$ es real y simétrica, con $J = V\Lambda V^{\top}$. Se diagonaliza una vez y, para cualquier $t$,

$$
\big[e^{-i\gamma Jt}\big]_{kj} = \sum_m V_{km}\,e^{-i\gamma\lambda_m t}\,V_{jm},
$$

lo que cuesta $O(N^2)$ por fotograma. Así se calcula en milisegundos (`fisica.probabilidades_walk`).

**Qué se ve.** El walk presenta interferencia: hay neuronas que se encienden y se apagan, y zonas que quedan oscuras porque las amplitudes de distintos caminos se cancelan. En una cadena avanzaría de forma balística (dispersión $\propto t$), pero el conectoma es un grafo de mundo pequeño: lo que distingue al walk es que nunca se estabiliza y recuerda su origen. Hacia $t = 60$ está repartido en una "participación efectiva" $1/\sum_k q_k^2 \approx 130$ neuronas, contra $\approx 285$ de la difusión clásica (detalles en `docs/teoria_tex/`).

---

## 4. El láser optogenético como rotación de Rabi

*Módulos:* `cerebro_q/cascada.circuito_paso`, `cerebro_q/circuitos.operaciones`

En la channelrhodopsina, un pulso de luz resonante de frecuencia de Rabi $\Omega$ y duración $\tau$ rota un sistema de dos niveles en un ángulo $\theta = \Omega\tau$. En un qubit, el mismo control es

$$
R_X(\theta) = e^{-i\theta X/2},\qquad
R_X(\theta)|0\rangle = \cos\tfrac{\theta}{2}|0\rangle - i\sin\tfrac{\theta}{2}|1\rangle .
$$

Al iluminar la neurona $j$ de la red en reposo:

$$
|\psi(0)\rangle = \cos\tfrac{\theta}{2}\,|0\cdots0\rangle - i\sin\tfrac{\theta}{2}\,|e_j\rangle .
$$

Por las propiedades 2 y 3 de §3, el vacío no evoluciona y la componente excitada hace el quantum walk:

$$
|\psi(t)\rangle = \cos\tfrac{\theta}{2}\,|0\cdots0\rangle - i\sin\tfrac{\theta}{2}\sum_k \big[e^{-i\gamma Jt}\big]_{kj}|e_k\rangle .
$$

**Resultado central (probabilidad de disparo de la neurona $k$):**

$$
\boxed{\,P_k(t) = \sin^2\!\tfrac{\theta}{2}\;\Big|\big[e^{-i\gamma Jt}\big]_{kj}\Big|^2\,}
$$

La intensidad del láser sólo escala la amplitud global: con $\theta = \pi$ el disparo es seguro, y con $\theta=\pi/2$ ocurre la mitad de las veces. El *patrón* de propagación lo fija el conectoma. `test_xy_igual_a_walk` verifica esta fórmula y $P(\text{vacío}) = \cos^2(\theta/2)$ contra la evolución exacta en el espacio de Hilbert completo (`tests/backend/referencia.py`).

**Varios láseres.** $\bigotimes_{s\in S}R_X(\theta)_s$ crea una superposición de sectores con $0,\dots,|S|$ excitaciones (pesos binomiales). Para $|S|\ge2$ la dinámica ya no se reduce a $J$: la exclusión de núcleo duro impide que dos excitaciones ocupen la misma neurona. La referencia exacta de los tests la resuelve en el espacio completo para circuitos chicos.

---

## 5. Medición: el spike y la ley de conservación

Se mide cada qubit en la base $Z$. Un disparo (*shot*) devuelve una cadena de bits, que es un patrón de activación de la ventana: el bit $k$ en 1 significa que la neurona $k$ disparó. La población $P_k = \Pr[b_k = 1]$ es la marginal.

Como $\hat N$ se conserva, con $k$ láseres **ningún disparo ideal puede tener más de $k$ bits en 1**. Esa regla es la base de la mitigación por post-selección (§8).

---

## 6. Del hamiltoniano al circuito

*Módulos:* `cerebro_q/circuitos.py`, `cerebro_q/cascada.py` · *Tests:* `TestCircuitos`, `TestCascada`

### 6.1 Por qué IonQ

- **Conectividad total (all-to-all).** Cualquier par de iones puede entrelazarse directamente. Un conectoma es un grafo irregular y no planar, así que en un chip de vecinos cercanos cada sinapsis requeriría cadenas de SWAP. En IonQ cada sinapsis es una compuerta directa, sin sobrecosto de ruteo.
- **Compuerta de entrelazamiento parametrizada.** Forte expone $ZZ(\theta)$ con el ángulo como parámetro, lo que encaja con los saltos pequeños $\gamma J_{ij}\delta t$ de una fórmula de Trotter (§6.3).
- **Calidad.** Forte tiene 36 qubits, fidelidad de 1 qubit de 99,98 % y de 2 qubits de 99,6 % (ionq.com/quantum-systems/compare).

### 6.2 Evolución por Trotter–Suzuki

Escribimos $H = \sum_{e} h_e$, con un término por sinapsis, $h_e = \gamma J_e\,(XX+YY)/2$. Cada término se exponencia exactamente con la compuerta de salto

$$
\mathrm{hop}(\alpha) \equiv e^{-i\alpha (XX+YY)/2},\qquad e^{-ih_e\delta} = \mathrm{hop}(\gamma J_e\delta).
$$

**1er orden:** $U_1(\delta) = \prod_e e^{-ih_e\delta}$. **2º orden (Strang):** $U_2(\delta) = \prod_e e^{-ih_e\delta/2}\prod_{e\,\text{(reverso)}} e^{-ih_e\delta/2}$. Con $r$ pasos y $\delta=t/r$:

$$
\big\|e^{-iHt} - U_1(t/r)^r\big\| \le \frac{t^2}{2r}\sum_{a<b}\big\|[h_a,h_b]\big\|,
\qquad
\big\|e^{-iHt} - U_2(t/r)^r\big\| = O\!\left(\frac{t^3}{r^2}\right)
$$

(Childs et al. 2021). Las mitades consecutivas sobre el mismo par se fusionan exactamente, porque un término conmuta consigo mismo. Así, $r$ pasos de 2º orden cuestan $(2|E|-2)\,r + 1$ saltos y no $2|E|r$; en `toque-6` ($|E|=8$, $r=2$) son 29 saltos, o sea 58 ZZ. La cota de conmutadores es holgada: en `toque-6`, a $t=30$ con $r=2$, la cota de 1er orden vale 7, mientras que el error real de 2º orden en distribución es TVD = 0,09. `test_trotter_converge` comprueba que el error baja al aumentar $r$. En la app el circuito usa `PauliEvolutionGate` con `SuzukiTrotter(order=2)` de Qiskit, que implementa exactamente esta fórmula (`test_circuito_paso_igual_a_teoria` lo compara con la teoría). Los ejemplos con `toque-6` son del microcircuito del prototipo.

Al usar el hamiltoniano real, este modo es una **simulación hamiltoniana genuina** (Lloyd 1996) y se generaliza tal cual a varios láseres.

### 6.3 En IonQ: compuertas nativas

La página transpila cada circuito con `transpile(qc, backend, optimization_level=1)`, lo que recomienda `qiskit-ionq`. En los backends de IonQ las `RXX`/`RYY` quedan tal cual y el servidor de IonQ las compila a su compuerta nativa de dos qubits:

$$
e^{-i\beta XX} = (V\!\otimes\! V)\,ZZ\!\left(\tfrac{\beta}{\pi}\right)(V^\dagger\!\otimes\! V^\dagger),\quad V=\mathrm{GPi2}(\tfrac14)=R_Y(\tfrac{\pi}{2}),
$$

y lo mismo para $YY$ con $W=\mathrm{GPi2}(0)=R_X(\tfrac{\pi}{2})$, donde $ZZ(\theta)=e^{-i\pi\theta\,Z\otimes Z}$ (fases en vueltas; docs.ionq.com, *Getting started with native gates*). Cada sinapsis por paso de Trotter cuesta entonces **2 compuertas ZZ**, sin SWAPs gracias a la conectividad total. En los simuladores con ruido de topología de vecinos cercanos, el transpilador agrega SWAPs: la página muestra las compuertas de 2 qubits después de transpilar.

Qollab permite **un job de IonQ por ejecución**: la cascada corre entonces un solo paso en IonQ (cada paso depende del anterior) y el botón queda bloqueado.

---

## 7. Elección de parámetros en la cascada

*Código:* `frontend/main.js` (`trotterReps`) · *Análisis:* `tools/zeno_analysis.py`

- **Pasos de Trotter por ventana:** 1 si $\tau \le 4{,}5$, 2 si $\tau \le 9$ y 3 por encima. Con eso la TVD frente a la evolución exacta de la ventana queda bajo ~0,025.
- **Costo:** una ventana tiene entre 25 (mediana) y 38 (máximo) aristas, porque las vecinas también están conectadas entre sí. Un paso de Strang ($r = 1$) son ~98 compuertas de dos qubits, y la fidelidad estimada en Forte es $0{,}996^{98} \approx 0{,}67$.
- **τ por defecto = 8:** el compromiso entre que la ventana represente a la red y que el spike se mueva (efecto Zeno, ver [`cascade.md`](cascade.md) §2.2).

---

## 8. Mitigación de errores

1. **Post-selección por simetría** (Bonet-Monroig et al. 2018; McArdle et al. 2019). Se descartan los disparos con más excitaciones que láseres y se renormaliza (`analisis.contar_spikes`). En el prototipo, con ruido tipo Forte en `toque-6`, la TVD respecto de la teoría bajaba de 0,17 a 0,05 tras post-seleccionar. Este procedimiento es exactamente el que IonQ recomienda como *symmetry-based post-selection* en su guía de buenas prácticas.
2. **Debiasing de IonQ.** El servidor puede generar variantes simétricas del circuito y agregarlas; es una opción de la API de IonQ (`settings.error_mitigation`).
3. **Validación cruzada.** Cada paso compara la teoría de la ventana (walk exacto) con lo medido en el backend; el panel 2 muestra además la distribución ideal del circuito (Statevector).

---

## 9. Verificación numérica implementada

`python -m unittest discover -s tests/backend` (desde la raíz del repo):

| Afirmación de la teoría | Test |
|---|---|
| $J$ simétrica, $\|J\|_2 = 1$, 302 neuronas | `TestFisica.test_normalizacion` |
| El walk conserva la norma $\sin^2(\theta/2)$ | `TestFisica.test_walk_conserva_norma` |
| Sector de 1 excitación de XY = quantum walk $\gamma J$; $P(\text{vacío}) = \cos^2(\theta/2)$ | `TestFisica.test_xy_igual_a_walk` |
| Trotter converge a la evolución exacta | `TestCircuitos.test_trotter_converge` |
| Convención de bits de Qiskit y post-selección de un spike | `TestCircuitos.test_orden_de_bits_qiskit` |
| `PauliEvolutionGate` + `SuzukiTrotter` = teoría de la ventana | `TestCascada.test_circuito_paso_igual_a_teoria` |
| Un paso = un job; el spike sale de un shot válido | `TestCascada.test_paso_en_backend`, `test_paso_sin_disparo` |
| Efecto Zeno y la tabla τ del Project Card | `TestZeno` |
| Reglas de Qollab (≤ 100 archivos, rutas literales, sin claves) | `TestReglasQollab` |

---

## 10. Extensiones posibles

- **Sinapsis dirigidas.** Un hamiltoniano no puede ser asimétrico. Las opciones son una caminata cuántica estocástica, que interpola con la clásica mediante una ecuación de Lindblad (Whitfield et al. 2010), o fases complejas $J_{ij}e^{i\varphi_{ij}}$ que rompen la simetría de inversión temporal (*chiral quantum walks*, Zimborás et al. 2013).
- **Inhibición.** Las sinapsis GABAérgicas podrían llevar un signo negativo en $J_{ij}$. El circuito no cambia, porque la compilación ya admite ángulos negativos.
- **Varios láseres en hardware.** Es el régimen de muchos cuerpos, clásicamente costoso, donde la simulación cuántica tiene sentido real.
- **Disipación.** Un *amplitude damping* controlado modelaría el retorno al reposo de la neurona.

---

## 11. Referencias

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
23. OpenWorm: https://github.com/openworm/c302 y https://github.com/openworm/CElegansNeuroML

# Cascada de spikes: quantum walk por ventanas

**Idea.** Después de que el láser excita una neurona, se arma un circuito cuántico con esa neurona y sus 9 vecinas (10 qubits). Se deja evolucionar el walk un tiempo τ y se mide. La neurona que "disparó" pasa a ser el nuevo centro, y se repite. Cada salto que se ve en el gusano 3D sale de medir un circuito de Qiskit, no de numpy.

**Por qué.** Así lo más visible de la página, el spike que salta por el gusano 3D, lo decide la medición de circuitos cuánticos reales.

*Código:* `backend/cerebro_q/cascada.py` (núcleo), `frontend/main.js` (`fire`, el bucle de la cascada) · *Análisis:* `tools/zeno_analysis.py` · *Tests:* `TestCascada`, `TestZeno`. Las cifras usan pesos binarios (la decisión del equipo). Diseño original: `git show 0c3e4e5:docs/PLAN_WALK_VENTANAS.md`.

---

## 1. Cómo funciona un paso

1. **Centro** c: la neurona excitada (al inicio, la del láser).
2. **Ventana**: c + 9 vecinas → 10 qubits. Los acoplamientos dentro de la ventana son los mismos de J, restringidos a esas 10 neuronas.
3. **Circuito**: `RX(θ)` en c, luego la evolución XY durante τ con `PauliEvolutionGate` + `SuzukiTrotter` (Qiskit nativo), y medición de los 10 qubits.
4. **Ejecutar** con `backend.run` y S shots (por ejemplo 200).
5. **Elegir el siguiente centro**: se toma un shot al azar entre los válidos (exactamente un 1). La neurona en 1 es el spike y pasa a ser el nuevo centro. Los S shots se muestran como distribución en la ventana.
6. Repetir K pasos (por ejemplo 15–30).

En el gusano 3D se ven los 10 qubits de la ventana encendidos según los shots, y el spike que salta al siguiente centro. Queda un rastro de los centros anteriores.

## 2. Decisiones de diseño (con datos)

### 2.1 Qué vecinas entran en la ventana

Con pesos binarios todas las conexiones valen lo mismo, así que "las 9 más fuertes" no está definido. Propuesta:

- **Vecinas directas de c, ordenadas por número de sinapsis** (el dato sigue en `connectome_cook2019.csv` aunque J sea binaria). Para AVM la ventana queda: AVM, ALMR, AVDL, PVCR, ALML, PVR, AVBL, PVCL, AVBR, BDUR (ALML y PVR empatan con 14 sinapsis; el empate se decide por índice).
- Si c tiene menos de 9 vecinas (le pasa al 6 % de las neuronas), se completa con neuronas a 2 sinapsis.

Dato importante: el grado mediano del conectoma es ~20 y el máximo 99. La ventana de 10 casi nunca contiene a todas las vecinas.

### 2.2 El tiempo por paso τ: la decisión más importante

Una ventana de 10 neuronas está **aislada** del resto: en la red real, la excitación también se escaparía hacia las otras vecinas. El escape crece con τ. Esta es la mediana sobre todas las neuronas, con el walk exacto de la red completa:

| τ (unidades de 1/γ) | Probabilidad de que la excitación siga dentro de la ventana | Probabilidad de que siga en el centro |
| --- | --- | --- |
| 2 | 0.96 | 0.93 |
| 3 | 0.91 | 0.86 |
| 5 | 0.77 | 0.67 |
| 10 (AVM) | 0.29 | 0.19 |

Aquí aparece una tensión real:

- **τ chico (2–3)** → la ventana representa bien a la red, pero en ~90 % de los pasos la medición devuelve el mismo centro. Medir tan seguido "congela" el walk: es el **efecto Zeno cuántico**. Se necesitan muchos pasos para ver movimiento.
- **τ grande (≥ 8)** → la excitación sí se mueve, pero cada paso ya no es la red real: es el walk sobre un microcircuito aislado de 10 neuronas. Es un modelo válido si se dice así, pero no se puede presentar como el walk del gusano completo.

Simulando la cascada completa desde AVM (200 cascadas de 20 pasos, walk exacto en cada ventana; `python tools/zeno_analysis.py`, semilla fija):

| τ | Pasos en que el spike se queda en el centro | Neuronas distintas visitadas en 20 pasos (mediana) |
| --- | --- | --- |
| 3 | 93 % | 2 |
| 5 | 81 % | 5 |
| 8 | 60 % | 8 |

**Decisión:** τ como deslizador (2–12), con 8 por defecto para que la cascada se mueva, presentando cada paso como "el walk en el microcircuito local". Al bajar τ se ve en vivo el congelamiento por medición (Zeno). La animación pasa más rápido por los pasos en que el centro no cambia.

### 2.3 Qué se pierde al medir (y por qué es lo mejor de la idea)

Al medir, el estado colapsa: la interferencia existe **dentro** de cada paso, pero no se arrastra de un paso al siguiente. La cadena de spikes es, en conjunto, una caminata **aleatoria clásica**, cuyos saltos los decide un walk cuántico.

Esto no es un defecto si se presenta bien: es la transición cuántico → clásico por medición, el tema *Quantum Unlocked*. `tools/zeno_analysis.py` (`comparacion`) compara cuatro curvas para el mismo láser y el mismo τ (distancia media al origen y probabilidad de seguir en el origen); la página ya no las muestra:

1. **coherente**: el walk sin medir (exacto, red completa);
2. **medido cada τ**: el walk medido cada τ en la red completa. Es exactamente una cadena de Markov clásica con probabilidades de salto T_ij = |[e^(−iγJτ)]_ij|², el límite de ventana infinita;
3. **cascada**: lo que hacen los circuitos de 10 qubits (simulado con numpy para la comparación);
4. **clásica**: una caminata aleatoria común, dp/dt = −γLp.

Lo que muestran los números (AVM, distancia media al origen en t = 24):

| τ | coherente | medido cada τ | cascada (10 qubits) | clásica |
| --- | --- | --- | --- | --- |
| 2 | 1.87 | 0.90 | 0.36 | 2.12 |
| 4 | 1.87 | 1.38 | 0.64 | 2.12 |
| 8 | 1.87 | 1.74 | 0.98 | 2.12 |

- Medir convierte el walk en un proceso clásico (sin interferencia entre pasos), pero **no** en la caminata clásica común: con τ chico la medición frena la propagación (**efecto Zeno**). La probabilidad de saltar en un paso es ≈ (γJτ)², así que el ritmo efectivo cae como τ.
- La cascada de 10 qubits se propaga más lento que el walk medido en la red completa, porque la ventana no deja que la excitación se escape a las otras vecinas. Esa diferencia es el costo de cortar la red en ventanas, y conviene decirlo.

### 2.4 Costo del circuito

Dentro de una ventana hay entre 25 (mediana) y 38 (máximo) aristas, porque las vecinas también están conectadas entre sí. Un paso de Strang (r = 1) son ~98 compuertas de dos qubits (p90: 122):

- **Simulador del navegador** (hasta 24 qubits): 10 qubits y ~100 compuertas es trivial.
- **Hardware IonQ**: una fidelidad estimada de 0.996^98 ≈ 0.67 es viable, pero solo para el **primer paso**: IonQ acepta **un job por ejecución** y aquí cada paso depende del anterior. En los simuladores locales no hay límite, y ahí corren los jurados.

### 2.5 Shots sin spike o con dos spikes

Con ruido aparecen shots con 0 o con 2+ excitaciones. Se aplica la misma post-selección de siempre: solo cuentan los shots con exactamente un 1 (con θ = π el estado ideal no tiene vacío). Si un paso no deja ningún shot válido, la cadena termina y se muestra "la señal se perdió".

---

## 3. Implementación en la página

- **Python** (`backend/cerebro_q/cascada.py`):
  - `ventana(c)`: vecinas por número de sinapsis, completadas a distancia 2;
  - `circuito_paso`: `RX(θ)` (o `X` si θ = π) en el centro + `PauliEvolutionGate` con `SuzukiTrotter(order=2)`; si esa API no existe (imitación local), RXX/RYY equivalentes;
  - `circuito_de` / `_transpilado`: el circuito y su versión transpilada quedan en caché por (centro, θ, τ, γ, pasos[, backend]), así un centro repetido no se reconstruye ni se vuelve a transpilar;
  - `ejecutar_paso`: un job por paso, post-selección (`analisis.contar_spikes`), spike de un shot válido al azar; si el shot es vacío, la neurona no disparó.
- **API** (`cerebro_q/api.py`): `paso_json` (un paso en el backend), `circuito_json` (el circuito sin ejecutarlo, para el panel 2) y `figuras_json` (`draw("mpl")` + histograma).
- **Página** (`frontend/main.js`, panel 1 *Laser & measure*):
  - el láser θ sólo actúa en el primer paso; después la neurona que disparó empieza excitada (θ = π);
  - pasos de Trotter: 1 si τ ≤ 4,5, 2 si τ ≤ 9 y 3 por encima;
  - por paso: superposición y colapso animados en 3D y con sonido, chips (qubits, compuertas 2q tras transpilar, shots válidos, vacíos, spike), barras de teoría vs. medido con su tabla, y la lista "Spike chain";
  - panel 2 *The Qiskit circuit*: el circuito de cualquier paso compuerta por compuerta, los conteos y la figura de Qiskit (matplotlib se carga al abrir el panel).
- **IonQ:** un solo paso (un job por Run); el botón se bloquea después. En hardware, pide confirmación con un segundo clic.

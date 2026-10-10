// This JS code can't be run outside of Qollab environment (needs Pyodide and other components
// for proper Qiskit integration into JS code). If any Qiskit features / packages are used, it
// fill fail as soon as those are imported (or "backend" variable is used)

// Optogenetic Quantum Brain · Qollab page (JS / Qiskit)
//
// Panel 1 · Laser & measure: the laser RX(θ) excites a neuron and every step of the spike cascade is a
//   10-qubit Qiskit circuit (the neuron that fired + its 9 most connected neighbours) run on the selected
//   `backend`. Measuring collapses the walk onto one neuron, which fires the next step.
// Panel 2 · The Qiskit circuit: the exact QuantumCircuit of each step, drawn instantly from its
//   instructions (every RXX/RYY gate), its measured counts, and Qiskit's own draw("mpl") figure.
//
// This effort is supported by Qollab & IonQ.
import { QUALITY, WormScene } from "./js/escena.js";
import { dataTable, groupedBars, SERIES_COLORS } from "./js/graficos.js";
import { py, respirar } from "./js/python.js";
import { notaNeurona, Sonido } from "./js/sonido.js";

const $ = (id) => document.getElementById(id);
const TYPE_ES = { sensory: "sensory", interneuron: "interneuron", motor: "motor", unknown: "—" };
const REDUCED = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
// Qollab crea `backend` antes de correr main.js (no se elige ni se escribe en el código).
const BACKEND = typeof backend !== "undefined" ? backend : null; // eslint-disable-line no-undef

const state = { neurons: [], index: new Map(), source: "AVM", backend: null, jobsSent: 0 };
const cascade = { running: false, stop: false, armed: false, centers: [], steps: [] };
const ui = { chapter: 1, narr: null };
const circ = { cache: new Map(), follow: true, turno: 0, fig: new Map(), figTurno: 0, mplListo: false, mpl: null };
const DOS_QUBITS = new Set(["rxx", "ryy", "rzz", "rzx", "cx", "cz", "ecr", "ms", "zz", "swap", "iswap", "xx_plus_yy"]);
const SOUND_ON = '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>';
const SOUND_OFF = '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/>';
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

const HELP = {
  theta: "θ is the light dose. The laser is an RX(θ) gate on the neuron's qubit: θ = π always fires it, " +
    "θ = π/2 fires it in half of the shots. If it does not fire, the measurement finds no excitation and the cascade stops.",
  tau: "τ is how long the excitation evolves as a wave, e^(−iτH), before the circuit measures it. Each measurement " +
    "collapses the wave onto one neuron. Measure too often (small τ) and the wave never gets to move: the quantum Zeno effect.",
  gamma: "γ is the strength of every synapse in the Hamiltonian H = γ Σ J_ij (XX + YY)/2. " +
    "Doubling γ makes everything happen twice as fast.",
  shots: "A shot is one run of the circuit followed by one measurement. Quantum results are random, so the circuit " +
    "is repeated many times and we count how often each neuron came out as 1. The cascade then picks one shot at random.",
};

const scene = new WormScene($("scene"), { quality: "auto" });
const sound = new Sonido();

// ------------------------------------------------------------------ utilidades
function toast(msg, isErr = false) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("err", isErr);
  t.classList.add("show");
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove("show"), isErr ? 7000 : 3500);
}
function announce(msg) {
  const s = $("sr-status");
  s.textContent = "";
  setTimeout(() => { s.textContent = msg; }, 30);
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtTheta = (th) => (Math.abs(th - Math.PI) < 0.01 ? "π" : `${(th / Math.PI).toFixed(2)}π`);
const pct = (v) => `${(100 * v).toFixed(1)}%`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Pasos de Trotter por ventana: con τ ≤ 4.5 basta 1 (TVD ≈ 0.02); con τ = 8 hacen falta 2.
const trotterReps = (tau) => Math.max(1, Math.ceil(tau / 4.5));
const dosQubits = (ops) => Object.entries(ops || {}).reduce((a, [k, v]) => a + (DOS_QUBITS.has(k.toLowerCase()) ? v : 0), 0);
// El deslizador llega a 3.14: se toma como π exacto (RX(π) = X, el láser siempre dispara).
const thetaVal = () => { const t = parseFloat($("theta").value); return Math.abs(t - Math.PI) < 0.006 ? Math.PI : t; };
const physics = () => ({
  theta: thetaVal(),
  tau: parseFloat($("tau").value),
  gamma: parseFloat($("gamma").value),
});

function neuronCard(name) {
  const i = state.index.get(name);
  if (i == null) { $("neuron-card").textContent = "Neuron not found"; return; }
  const d = state.neurons[i];
  const nt = d.neurotransmitters?.length ? d.neurotransmitters.join(", ") : "—";
  $("neuron-card").innerHTML =
    `<b>${esc(d.name)}</b><span class="tag ${d.type}">${TYPE_ES[d.type]}</span><br>` +
    `${d.degree} connections · neurotransmitter: ${esc(nt)}<br>` +
    `anteroposterior position: ${d.y.toFixed(0)} µm`;
}

// ------------------------------------------------------------------ narración sobre el gusano
function narrate(kicker, html, tone = "") {
  ui.narr = { kicker, html, tone };
  $("narr-kicker").textContent = kicker;
  $("narr-text").innerHTML = html;
  $("narration").className = `narration ${tone}`;
}

function narrateReady() {
  narrate("Start here", `Pick a neuron (click it on the worm or type its name) and press <b>Fire laser</b>. ` +
    `Each step runs a <span class="q">10-qubit circuit</span> on <b>${esc(state.backend?.nombre ?? "the backend")}</b>: ` +
    `the wave spreads for a time τ and then the circuit <span class="a">measures</span> it.`);
}

// ------------------------------------------------------------------ paneles
const TABS = [1, 2].map((n) => $(`tab-${n}`));

function setChapter(n, { focusTab = false } = {}) {
  const prev = ui.chapter;
  ui.chapter = n;
  TABS.forEach((t, i) => {
    const on = i + 1 === n;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
  });
  $("chap-1").hidden = n !== 1;
  $("chap-2").hidden = n !== 2;
  if (focusTab) TABS[n - 1].focus();
  closeHelp();
  if (prev !== n && n === 2) renderCircuitPanel();
  if (prev !== n && n === 1) scene.requestRender();
}

// ------------------------------------------------------------------ fuente del láser
function fireLabel() {
  if (cascade.running) return;
  $("fire-label").textContent = cascade.armed ? "Confirm: 1 step on hardware (uses credits)" : `Fire laser at ${state.source}`;
}

function showSourceOnly() {
  const vals = new Float32Array(state.neurons.length);
  const i = state.index.get(state.source);
  vals[i] = 1;
  scene.setHighlight([]);
  scene.setTrail(null);
  scene.setActivity(vals);
  scene.setLabel(i, `⚡ ${state.source}`);
}

function selectSource(name) {
  if (cascade.running) { toast("Stop the cascade first to pick another neuron."); return false; }
  if (!state.index.has(name)) { toast(`There is no neuron "${name}"`, true); return false; }
  state.source = name;
  cascade.armed = false;
  $("neuron-input").value = name;
  neuronCard(name);
  fireLabel();
  showSourceOnly();
  $("mini-circ").hidden = true;
  narrate("Ready", `The laser will hit <b>${esc(name)}</b>. Press <b>Fire laser</b>: the first circuit puts RX(θ) on its qubit.`);
  announce(`Source neuron: ${name}.`);
  prefetchPreview();
  return true;
}

// ------------------------------------------------------------------ ayuda "?" y ajustes
function openHelp(btn) {
  const pop = $("help-pop");
  if (!pop.hidden && openHelp._btn === btn) { closeHelp(); return; }
  closeHelp();
  const text = HELP[btn.dataset.help] ?? "";
  $("help-text").textContent = text;
  pop.hidden = false;
  const app = $("app").getBoundingClientRect(), r = btn.getBoundingClientRect();
  const w = pop.offsetWidth;
  pop.style.left = `${Math.max(8, Math.min(app.width - w - 8, r.left - app.left - w / 2 + 8))}px`;
  pop.style.top = `${r.bottom - app.top + 8}px`;
  btn.setAttribute("aria-expanded", "true");
  openHelp._btn = btn;
  announce(text);
}
function closeHelp({ refocus = false } = {}) {
  const pop = $("help-pop");
  if (pop.hidden) return;
  pop.hidden = true;
  const b = openHelp._btn;
  openHelp._btn = null;
  if (b) { b.setAttribute("aria-expanded", "false"); if (refocus) b.focus(); }
}

function setLab(open) {
  $("lab").hidden = !open;
  $("lab-btn").setAttribute("aria-expanded", String(open));
  (open ? $("lab-close") : $("lab-btn")).focus();
}

// ------------------------------------------------------------------ 1 · láser + cascada cuántica
function stopCascade() {
  if (cascade.running) cascade.stop = true;
}

async function fire() {
  if (cascade.running) return;
  const typed = $("neuron-input").value.trim().toUpperCase();
  if (typed !== state.source && !selectSource(typed)) return;
  if (!BACKEND || !state.backend) { toast("No backend: press Run on Qollab and pick one.", true); return; }
  const ionq = state.backend.ionq;
  if (ionq && state.jobsSent >= 1) {
    toast("IonQ accepts one job per run: press Stop and then Run to send another one.", true);
    return;
  }
  if (state.backend.hardware && !cascade.armed) {
    cascade.armed = true;
    fireLabel();
    announce("Press the button again to confirm sending to hardware.");
    return;
  }
  cascade.armed = false;
  sound.activar(); // dentro del clic: los navegadores sólo permiten audio tras un gesto
  sound.musicaOn();
  sound.musicaDuck(true); // la música baja durante la medición
  const total = ionq ? 1 : clamp(parseInt($("casc-pasos").value, 10) || 12, 1, 60);
  const shots = clamp(parseInt($("casc-shots").value, 10) || 200, 20, 2000);
  const { theta, tau, gamma } = physics();
  closeHelp();
  Object.assign(cascade, { running: true, stop: false, centers: [state.source], steps: [] });
  circ.follow = true;
  $("fire-btn").disabled = true;
  $("fire-label").textContent = "Running circuits…";
  $("casc-stop").disabled = false;
  $("casc-log").innerHTML = "";
  let centro = state.source;
  const idx0 = state.index.get(centro);
  showSourceOnly();
  scene.fireLaser(idx0, Math.sin(theta / 2) ** 2);
  sound.laser(Math.sin(theta / 2) ** 2);
  scene.setSwim(false); // durante la medición las neuronas quedan en su posición real
  sound.fondoOn();
  narrate("Step 1 · laser", `The laser applies <b>RX(${fmtTheta(theta)})</b> to the qubit of <b>${esc(centro)}</b>. ` +
    `Sending its 10-qubit circuit to <b>${esc(state.backend.nombre)}</b>…`);
  if (ionq) toast("IonQ accepts one job per run: only the first step will run.");
  let fin = "completa";
  try {
    for (let k = 1; k <= total; k++) {
      if (cascade.stop) { fin = "detenida"; break; }
      $("casc-estado").textContent = `Step ${k} of ${total}: 10-qubit circuit on ${state.backend.nombre}…`;
      await respirar();
      const params = { centro, theta: k === 1 ? theta : Math.PI, tau, gamma, pasos_trotter: trotterReps(tau) };
      const r = await py.paso(BACKEND, { ...params, shots });
      Object.assign(r, { params, k, shots });
      state.jobsSent++;
      cascade.steps.push(r);
      r.salto = !!(r.spike && r.spike !== centro);
      if (r.salto) cascade.centers.push(r.spike);
      renderCascadePanel(r, k, total);
      if (ui.chapter === 2) renderCircuitPanel();
      const hot = r.spike ? r.ventana.indexOf(r.spike) : -1;
      const nota = r.spike_indice != null ? notaNeurona(r.spike_indice) : 0;
      if (ui.chapter === 1 && !REDUCED) {
        narrateSuperposition(r);
        sound.medicion(r.teoria_ventana, hot, nota);
        await scene.collapse(r.ventana_indices, r.teoria_ventana, r.spike_indice);
      }
      if (r.spike) sound.disparo(nota, r.salto); else sound.vacio();
      applyCascadeScene(r);
      narrateMeasurement(r);
      if (!r.spike) {
        fin = r.motivo_fin === "vacio" ? "vacio" : "perdida";
        break;
      }
      centro = r.spike;
      if (!REDUCED) await sleep(r.salto ? 600 : 250);
    }
  } catch (e) {
    fin = "error";
    toast(`The step failed: ${e.message}`, true);
  } finally {
    cascade.running = false;
    sound.pararFondo();
    setTimeout(() => { if (!cascade.running) { scene.setSwim(true); sound.musicaDuck(false); } }, 2500);
    $("casc-stop").disabled = true;
    const bloqueado = state.backend.ionq && state.jobsSent >= 1;
    $("fire-btn").disabled = bloqueado;
    fireLabel();
    const n = cascade.steps.length, saltos = cascade.centers.length - 1;
    const motivo = { completa: "", detenida: " (stopped)", error: " (error)",
      vacio: ": the neuron did not fire (shot with no excitation)", perdida: ": no valid shot left" }[fin];
    const msg = `Cascade${motivo}. ${n} circuits run, ${saltos} jumps: ${cascade.centers.join(" → ")}.`;
    $("casc-estado").textContent = msg + (bloqueado ? " For another job on IonQ, press Stop and Run." : "");
    announce(msg);
    if (n && fin !== "vacio") {
      narrate("Cascade finished", `<b>${n}</b> circuits, <b>${saltos}</b> jumps: ` +
        `<span class="a">${cascade.centers.map(esc).join(" → ")}</span>. ` +
        (saltos <= 1 && tau <= 4
          ? "With such a short τ, measuring keeps pinning the spike in place: the quantum Zeno effect. Try τ = 8."
          : "Each jump was decided by measuring a real circuit. Open <b>The Qiskit circuit</b> to see every gate."),
      "collapse");
    }
    if (ui.chapter === 2) renderCircuitPanel();
    precargarMpl();
  }
}

/** Escena tras la medida: la neurona medida brilla; el resto de la ventana queda tenue y con anillo. */
function applyCascadeScene(r) {
  const N = state.neurons.length;
  const vals = new Float32Array(N);
  const max = Math.max(...r.medida, 1e-9);
  r.ventana_indices.forEach((g, i) => { vals[g] = 0.05 + 0.3 * (r.medida[i] / max); });
  if (r.spike_indice != null) vals[r.spike_indice] = 1;
  scene.setActivity(vals);
  scene.setHighlight(r.ventana_indices);
  scene.setTrail(cascade.centers.map((nm) => state.index.get(nm)));
  const lab = r.spike_indice ?? r.ventana_indices[0];
  scene.setLabel(lab, r.spike ? `⚡ ${r.spike}` : `∅ ${r.centro}`);
}

function narrateSuperposition(r) {
  const s = r.teoria_ventana.reduce((a, b) => a + b, 0) || 1;
  const top = r.teoria_ventana.map((v, i) => [v / s, i]).sort((a, b) => b[0] - a[0]).slice(0, 3)
    .map(([v, i]) => `${esc(r.ventana[i])} ${pct(v)}`).join(", ");
  narrate(`Step ${r.k} · superposition`, `Inside the circuit, the excitation is in <span class="q">all 10 neurons at once</span> ` +
    `(${top}…). Measuring will pick one.`);
}

function narrateMeasurement(r) {
  const i = r.spike ? r.ventana.indexOf(r.spike) : -1;
  const share = i >= 0 ? pct(r.medida[i] / Math.max(1e-9, r.medida.reduce((a, b) => a + b, 0))) : "";
  let html;
  if (!r.spike) {
    html = r.motivo_fin === "vacio"
      ? `Measured: <b>no neuron fired</b>. The laser did not excite ${esc(r.centro)} in this shot ` +
        "(that happens with probability cos²(θ/2)). The cascade stops."
      : "Measured: no valid shot was left after post-selection. The cascade stops.";
  } else if (r.salto) {
    html = `Measured! The wave <span class="a">collapsed onto ${esc(r.spike)}</span>, which came out as 1 in ${share} of the ` +
      `${r.shots} shots. ${esc(r.spike)} fires and starts step ${r.k + 1}.`;
  } else {
    html = `It collapsed back onto <b>${esc(r.spike)}</b> itself (${share} of the shots). ` +
      ((r.params?.tau ?? 8) <= 4
        ? "With a short τ this is likely: measuring often freezes the walk (Zeno effect)."
        : "The wave had not fully left yet, so staying put was the most likely outcome. It tries again.");
  }
  narrate(`Step ${r.k} · measured`, html, "collapse");
}

function renderCascadePanel(r, k, total) {
  const twoq = dosQubits(r.ops_transpilado) || dosQubits(r.ops_escritas);
  $("casc-chips").innerHTML = [
    `<span class="chip">step <b>${k}/${total}</b></span>`,
    `<span class="chip">qubits <b>${r.ventana.length}</b></span>`,
    twoq ? `<span class="chip" title="Two-qubit gates after transpiling for the backend">2q gates <b>${twoq}</b></span>` : "",
    `<span class="chip" title="Shots with at most one excitation (post-selection)">valid <b>${pct(r.fraccion_valida)}</b></span>`,
    r.fraccion_vacio > 0 ? `<span class="chip warn" title="Shots with no excitation: the neuron did not fire">empty <b>${pct(r.fraccion_vacio)}</b></span>` : "",
    `<span class="chip ${r.salto ? "good" : ""}">spike <b>${esc(r.spike ?? "—")}</b></span>`,
  ].join("");
  const series = [
    { key: "exact", name: "Theory", values: r.teoria_ventana },
    { key: "backend", name: `Measured (${r.backend})`, values: r.medida },
  ];
  groupedBars($("casc-bars"), r.ventana, series, { highlight: [0] });
  $("casc-legend").innerHTML = series.map((s) => `<span><i style="background:${SERIES_COLORS[s.key]}"></i>${esc(s.name)}</span>`).join("");
  dataTable($("casc-table"), r.ventana, series, `Window centred on ${r.centro}, step ${k}`);
  drawMiniCircuit(r);
  const li = document.createElement("li");
  li.innerHTML = r.salto
    ? `<b>${esc(r.centro)}</b> <span class="salto">→ ${esc(r.spike)}</span> · valid ${pct(r.fraccion_valida)}`
    : r.spike
      ? `<b>${esc(r.centro)}</b> stays (the spike came out on the centre)`
      : `<b>${esc(r.centro)}</b> · no spike`;
  $("casc-log").appendChild(li);
  $("casc-log").scrollTop = $("casc-log").scrollHeight;
  if (r.salto) announce(`Step ${k}: ${r.spike} fires.`);
}

/** Resumen del circuito sobre el gusano (sin matplotlib): RX → e^{−iτH} → medidas → bits. */
function drawMiniCircuit(r) {
  const names = r.ventana, n = names.length;
  const hot = r.spike ? names.indexOf(r.spike) : -1;
  const dy = 16, y0 = 12, H = y0 + dy * (n - 1) + 14, W = 280;
  const x = { wire0: 46, rx: 54, u0: 96, u1: 162, m: 176, bit: 214, end: 204 };
  const gate1 = r.k === 1 ? "RX(θ)" : "X";
  const reps = r.params?.pasos_trotter ?? 1;
  let g = "";
  names.forEach((nm, i) => {
    const y = y0 + i * dy, h = i === hot ? " hot" : "";
    g += `<text x="${x.wire0 - 4}" y="${y + 3}" text-anchor="end" class="${h.trim()}">${esc(nm)}</text>`;
    g += `<line class="w${h}" x1="${x.wire0}" y1="${y}" x2="${x.end}" y2="${y}"/>`;
    g += `<rect class="meter${h}" x="${x.m}" y="${y - 6}" width="18" height="12" rx="2"/>` +
      `<path d="M${x.m + 3} ${y + 3} Q${x.m + 9} ${y - 5} ${x.m + 15} ${y + 3}" fill="none" class="w${h}"/>`;
    g += `<text x="${x.bit}" y="${y + 3}" class="${h.trim()}">${i === hot ? "1 ← fires" : "0"}</text>`;
  });
  g += `<rect class="gate" x="${x.rx}" y="${y0 - 7}" width="34" height="14" rx="3"/>` +
    `<text class="gate-t" x="${x.rx + 17}" y="${y0 + 3}" text-anchor="middle">${gate1}</text>`;
  g += `<rect class="gate-u" x="${x.u0}" y="${y0 - 8}" width="${x.u1 - x.u0}" height="${H - y0 - 4}" rx="5"/>` +
    `<text class="gate-t big" x="${(x.u0 + x.u1) / 2}" y="${H / 2 - 4}" text-anchor="middle">e<tspan dy="-6" font-size="9">−iτH</tspan></text>` +
    `<text x="${(x.u0 + x.u1) / 2}" y="${H / 2 + 12}" text-anchor="middle">τ = ${r.params?.tau ?? ""}</text>` +
    `<text x="${(x.u0 + x.u1) / 2}" y="${H / 2 + 23}" text-anchor="middle">${reps} Trotter</text>`;
  const desc = `Circuit of step ${r.k}: ${n} qubits (${names.join(", ")}). ${gate1} on ${names[0]}, then the XY evolution ` +
    `e^(−iτH) with ${reps} Trotter step${reps > 1 ? "s" : ""}, then all qubits are measured. ` +
    (hot >= 0 ? `Chosen shot: ${names[hot]} = 1, all others 0.` : "Chosen shot: all 0, no neuron fired.");
  $("mini-circ-svg").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(desc)}">${g}</svg>`;
  $("mini-circ-cap").textContent = `· step ${r.k} · ${r.shots} shots`;
  $("mini-circ").hidden = false;
}

// ------------------------------------------------------------------ 2 · el circuito de Qiskit
const previewParams = () => {
  const { theta, tau, gamma } = physics();
  return { centro: state.source, theta, tau, gamma, pasos_trotter: trotterReps(tau) };
};
const vista = () => document.querySelector('input[name="circ-vista"]:checked').value;

async function cargarCircuito(p) {
  const clave = JSON.stringify(p);
  if (!circ.cache.has(clave)) circ.cache.set(clave, py.circuito(p).catch((e) => { circ.cache.delete(clave); throw e; }));
  return circ.cache.get(clave);
}

/** El circuito del próximo disparo se calcula de antemano: el panel 2 aparece al instante. */
function prefetchPreview() {
  if (!cascade.running) cargarCircuito(previewParams()).catch(() => {});
}

function fillStepSelect() {
  const sel = $("circ-step");
  const prev = sel.value;
  const opts = cascade.steps.map((r, i) =>
    `<option value="${i}">Step ${i + 1} · ${esc(r.centro)}${r.salto ? ` → ${esc(r.spike)}` : r.spike ? " (stays)" : " · no spike"}</option>`);
  if (!cascade.running) opts.push(`<option value="preview">Next laser shot · ${esc(state.source)} (not run yet)</option>`);
  sel.innerHTML = opts.join("");
  const ultimo = cascade.steps.length ? String(cascade.steps.length - 1) : "preview";
  sel.value = circ.follow || ![...sel.options].some((o) => o.value === prev) ? ultimo : prev;
}

async function renderCircuitPanel() {
  fillStepSelect();
  const sel = $("circ-step").value;
  const r = sel === "preview" ? null : cascade.steps[parseInt(sel, 10)];
  const p = r ? r.params : previewParams();
  const turno = ++circ.turno;
  $("circ-hint").textContent = "Building the circuit with Qiskit…";
  let c;
  try {
    c = await cargarCircuito(p);
  } catch (e) {
    $("circ-hint").textContent = `Could not build the circuit: ${e.message}`;
    return;
  }
  if (turno !== circ.turno) return;
  const v = vista();
  const view = c[v];
  const hot = r && r.spike ? c.neuronas.indexOf(r.spike) : -1;
  const be = state.backend?.nombre ?? "the backend";
  $("circ-title").textContent = r
    ? `Step ${r.k}: the circuit fired from ${r.centro}`
    : `Next laser shot: the circuit from ${c.centro} (not run yet)`;
  $("circ-sub").innerHTML = `The exact <code>QuantumCircuit</code> ${r ? "that ran on" : "that will be sent to"} <b>${esc(be)}</b> · ` +
    `${c.neuronas.length} qubits, one per neuron · θ = ${fmtTheta(c.theta)} · τ = ${c.tau} · γ = ${c.gamma} · ` +
    `${c.pasos_trotter} second-order Trotter step${c.pasos_trotter > 1 ? "s" : ""}.`;
  const hops = (view.ops.rxx ?? 0) + (view.ops.ryy ?? 0);
  $("circ-chips").innerHTML = [
    `<span class="chip">qubits <b>${c.neuronas.length}</b></span>`,
    view.ops.PauliEvolution ? `<span class="chip">PauliEvolutionGate <b>${view.ops.PauliEvolution}</b></span>` : "",
    hops ? `<span class="chip" title="Each synapse in the window is a RXX·RYY pair per Trotter half-step">RXX <b>${view.ops.rxx ?? 0}</b> · RYY <b>${view.ops.ryy ?? 0}</b></span>` : "",
    `<span class="chip">depth <b>${view.profundidad}</b></span>`,
    r ? `<span class="chip" title="Two-qubit gates after transpiling for ${esc(be)}">2q after transpiling <b>${dosQubits(r.ops_transpilado) || "—"}</b></span>` : "",
    `<span class="chip">measurements <b>${view.ops.measure ?? 0}</b></span>`,
  ].join("");
  drawCircuit(c, view.instrucciones, { hot, ran: !!r, compact: v === "compacta" });
  $("circ-hint").textContent = v === "completa"
    ? "Every gate, left to right: the laser, then the quantum walk as RXX·RYY hops (one pair per synapse, in Trotter steps), then the measurement of all 10 qubits. Scroll sideways; hover a gate to see its angle."
    : "Compact view: the whole walk e^(−iτH) is one PauliEvolutionGate. Switch to “All gates” to see its RXX·RYY decomposition.";
  renderCounts(c, r);
  pedirMpl(r, p);
}

const PI_FRAC = [[1, "π"], [0.5, "π/2"], [0.25, "π/4"], [0.75, "3π/4"]];
function fmtAngle(a) {
  if (a == null) return "";
  for (const [f, s] of PI_FRAC) if (Math.abs(Math.abs(a) - f * Math.PI) < 1e-6) return (a < 0 ? "−" : "") + s;
  return a.toFixed(3);
}

/** Dibuja el QuantumCircuit (lista de instrucciones de Qiskit) como SVG, columna por columna. */
function drawCircuit(c, instrs, { hot = -1, ran = false, compact = false } = {}) {
  const names = c.neuronas, n = names.length;
  const rowH = 30, top = 22, H = top + rowH * (n - 1) + 22;
  const yq = (q) => top + q * rowH;
  const width = (ins) => (ins.n === "PauliEvolution" ? 136 : ins.q.length >= 2 ? 26 : ins.n === "measure" ? 30 : 36);
  // empaquetado: cada compuerta va en la primera columna libre en todos los cables que cruza
  const level = new Array(n).fill(0);
  const cols = [];
  for (const ins of instrs) {
    if (ins.n === "barrier" || !ins.q.length) continue;
    const lo = Math.min(...ins.q), hi = Math.max(...ins.q);
    let col = 0;
    for (let q = lo; q <= hi; q++) col = Math.max(col, level[q]);
    (cols[col] ??= { w: 0, items: [] }).items.push(ins);
    cols[col].w = Math.max(cols[col].w, width(ins));
    for (let q = lo; q <= hi; q++) level[q] = col + 1;
  }
  let x = 18;
  const xs = cols.map((cl) => { const x0 = x; x += (cl?.w ?? 20) + 8; return x0; });
  const W = x + (ran ? 60 : 24);
  let g = "";
  for (let q = 0; q < n; q++) {
    g += `<line class="wire${q === hot ? " hot" : ""}" x1="0" y1="${yq(q)}" x2="${W - (ran ? 44 : 8)}" y2="${yq(q)}"/>`;
  }
  const wireNames = (qs) => qs.map((q) => names[q]).join(", ");
  cols.forEach((cl, k) => {
    if (!cl) return;
    const cx = xs[k] + cl.w / 2;
    for (const ins of cl.items) {
      const ang = ins.p?.[0];
      if (ins.n === "PauliEvolution") {
        const w = width(ins), y0 = yq(Math.min(...ins.q)) - 13, y1 = yq(Math.max(...ins.q)) + 13;
        g += `<g class="gate"><title>PauliEvolutionGate: e^(−iτH) on all ${ins.q.length} qubits, τ = ${fmtAngle(ang)}</title>` +
          `<rect class="ubox" x="${cx - w / 2}" y="${y0}" width="${w}" height="${y1 - y0}" rx="8"/>` +
          `<text class="ut" x="${cx}" y="${(y0 + y1) / 2 - 4}" text-anchor="middle">e<tspan dy="-9" font-size="12">−iτH</tspan></text>` +
          `<text class="us" x="${cx}" y="${(y0 + y1) / 2 + 18}" text-anchor="middle">τ = ${c.tau} · ${c.pasos_trotter} Trotter</text></g>`;
      } else if (ins.n === "measure") {
        const q = ins.q[0], y = yq(q), h = q === hot ? " hot" : "";
        g += `<g class="gate"><title>Measure ${names[q]}</title><rect class="meter${h}" x="${cx - 12}" y="${y - 10}" width="24" height="20" rx="3"/>` +
          `<path class="arc${h}" d="M${cx - 8} ${y + 5} Q${cx} ${y - 8} ${cx + 8} ${y + 5}"/>` +
          `<line class="arc${h}" x1="${cx}" y1="${y + 5}" x2="${cx + 6}" y2="${y - 6}"/></g>`;
      } else if (ins.q.length >= 2) {
        const [a, b] = ins.q, lab = ins.n.length === 3 && ins.n[0] === "r" ? ins.n.slice(1).toUpperCase() : ins.n.toUpperCase();
        const ya = yq(Math.min(a, b)), yb = yq(Math.max(a, b));
        g += `<g class="gate"><title>${ins.n.toUpperCase()}(${fmtAngle(ang)}) on ${wireNames(ins.q)}</title>` +
          `<line class="hop" x1="${cx}" y1="${ya}" x2="${cx}" y2="${yb}"/>` +
          ins.q.map((q) => `<rect class="hopbox" x="${cx - 11}" y="${yq(q) - 8}" width="22" height="16" rx="3"/>` +
            `<text class="hopt" x="${cx}" y="${yq(q) + 3}" text-anchor="middle">${esc(lab.slice(0, 3))}</text>`).join("") + `</g>`;
      } else {
        const q = ins.q[0], y = yq(q);
        const lab = ins.n === "rx" ? "RX" : ins.n.toUpperCase().slice(0, 3);
        g += `<g class="gate"><title>${ins.n.toUpperCase()}${ang != null ? `(${fmtAngle(ang)})` : ""} on ${names[q]}${q === 0 ? " · the laser" : ""}</title>` +
          `<rect class="g1" x="${cx - 15}" y="${y - 11}" width="30" height="22" rx="4"/>` +
          `<text class="g1t" x="${cx}" y="${y + 4}" text-anchor="middle">${lab}</text>` +
          (ang != null && ins.n !== "x" ? `<text x="${cx}" y="${y + 23}" text-anchor="middle">${fmtAngle(ang)}</text>` : "") + `</g>`;
      }
    }
  });
  if (ran) {
    for (let q = 0; q < n; q++) {
      const h = q === hot ? " hot" : "";
      g += `<text class="bit${h}" x="${W - 38}" y="${yq(q) + 4}">${q === hot ? "1" : "0"}</text>`;
    }
    g += `<text x="${W - 50}" y="12">shot</text>`;
  }
  const desc = `${compact ? "Compact" : "Full"} Qiskit circuit on ${n} qubits (${names.join(", ")}): ` +
    Object.entries(instrs.reduce((a, i) => ((a[i.n] = (a[i.n] ?? 0) + 1), a), {})).map(([k, v]) => `${v} ${k}`).join(", ") +
    (ran ? `. The shot chosen by the cascade has ${hot >= 0 ? `${names[hot]} = 1` : "no excitation"}.` : ".");
  $("circ-svg").innerHTML = `<svg class="qc" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(desc)}">${g}</svg>`;
  $("circ-names").innerHTML = `<svg class="qc" width="76" height="${H}" viewBox="0 0 76 ${H}" aria-hidden="true">` +
    names.map((nm, q) => `<text class="name${q === hot ? " hot" : ""}" x="66" y="${yq(q) + 4}" text-anchor="end">${esc(nm)}</text>`).join("") +
    `<text x="66" y="12" text-anchor="end">|0⟩ →</text></svg>`;
  $("circ-scroll").scrollLeft = 0;
}

/** Resultados: los conteos del backend agrupados por neurona (o la distribución ideal si aún no corre). */
function renderCounts(c, r) {
  const names = c.neuronas;
  let rows;
  if (r) {
    const g = new Map();
    for (const [bits, v] of Object.entries(r.conteos)) {
      const b = bits.replace(/ /g, "");
      const ones = [...b].reverse().map((ch, q) => (ch === "1" ? q : -1)).filter((q) => q >= 0);
      const key = ones.length === 0 ? "∅ none fired" : ones.length === 1 ? names[ones[0]] : "2+ fired (noise)";
      g.set(key, (g.get(key) ?? 0) + v);
    }
    const tot = [...g.values()].reduce((a, b) => a + b, 0) || 1;
    rows = [...g.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v, p: v / tot,
      cls: k.startsWith("2+") ? "noise" : "", hot: k === r.spike, txt: `${v}` }));
    $("counts-sub").innerHTML = `${tot} shots measured on <b>${esc(r.backend)}</b>. The cascade picked one valid shot at random: ` +
      (r.spike ? `<b>${esc(r.spike)} = 1</b>, so ${esc(r.spike)} fires next.` : "no neuron fired, so the cascade stopped.");
  } else {
    rows = names.map((nm, q) => ({ k: nm, p: c.ideal_marginales[q], cls: "ideal", txt: pct(c.ideal_marginales[q]) }));
    if (c.ideal_vacio > 1e-4) rows.push({ k: "∅ none fired", p: c.ideal_vacio, cls: "ideal", txt: pct(c.ideal_vacio) });
    rows.sort((a, b) => b.p - a.p);
    $("counts-sub").textContent = "Not run yet: these are the ideal probabilities of this exact circuit. Fire the laser to measure it on the backend.";
  }
  const max = Math.max(...rows.map((x) => x.p), 1e-9);
  $("counts").innerHTML = rows.map((x) =>
    `<li class="${x.hot ? "hot" : ""}"><span>${esc(x.k)}</span><span class="bar ${x.cls}" style="width:${(100 * x.p) / max}%"></span>` +
    `<span class="v">${x.txt}${r ? ` · ${pct(x.p)}` : ""}</span></li>`).join("");
}

// --- la figura oficial de Qiskit (matplotlib), en segundo plano
function precargarMpl() {
  circ.mpl ??= py.precargarFiguras()
    .then((r) => { circ.mplListo = !!r.ok; return r; })
    .catch((e) => ({ ok: false, error: e.message }));
  return circ.mpl;
}

async function pedirMpl(r, p) {
  const v = vista();
  const params = { tipo: "paso", ...p, vista: v === "completa" ? "expandida" : "compacta", conteos: r?.conteos ?? null };
  const clave = JSON.stringify(params);
  const turno = ++circ.figTurno;
  if (cascade.running) {
    $("fig-estado").textContent = "Qiskit's matplotlib drawing appears here when the cascade stops (it would slow the jobs down).";
    return;
  }
  const f0 = circ.fig.get(clave);
  if (!f0) {
    $("fig-estado").textContent = circ.mplListo
      ? `Drawing with Qiskit…${v === "completa" ? " (hundreds of gates: a few seconds)" : ""}`
      : "Loading matplotlib inside the browser (only the first time, about 30 s). The circuit above is already the same one.";
  }
  try {
    $("fig-box-c").hidden = $("fig-box-h").hidden = !f0;
    const pre = await precargarMpl();
    if (!pre.ok) throw new Error(pre.error || "matplotlib is not installed");
    const f = f0 ?? await py.figuras(params);
    circ.fig.set(clave, f);
    circ.mplListo = true;
    if (turno !== circ.figTurno || ui.chapter !== 2) return;
    const ops = Object.entries(f.ops).map(([k, val]) => `${k}: ${val}`).join(", ");
    const medido = f.histograma_tipo === "medido";
    $("fig-circ").src = f.circuito_svg;
    $("fig-circ").alt = `Qiskit draw("mpl") of the ${f.neuronas.length}-qubit circuit (${f.neuronas.join(", ")}). Gates: ${ops}. Depth ${f.profundidad}.`;
    $("fig-circ-cap").textContent = `QuantumCircuit.draw("mpl") · ${ops} · depth ${f.profundidad}`;
    $("fig-hist").src = f.histograma_svg;
    $("fig-hist").alt = medido
      ? "Qiskit plot_histogram of the counts measured on the backend, grouped by the neuron that fired."
      : "Qiskit plot_distribution of the ideal Statevector, grouped by excited neuron.";
    $("fig-hist-cap").textContent = medido
      ? "plot_histogram of the counts returned by the backend · ∅ = no neuron fired."
      : "plot_distribution of the ideal Statevector · not run on a backend yet.";
    $("fig-box-c").hidden = $("fig-box-h").hidden = false;
    $("fig-estado").textContent = "";
  } catch (e) {
    if (turno === circ.figTurno) $("fig-estado").textContent = `Qiskit's drawing is not available here (${e.message}). The circuit above is complete.`;
  }
}

// ------------------------------------------------------------------ backend
function renderBackendInfo() {
  const b = state.backend;
  const pill = $("backend-pill");
  if (!b) {
    pill.textContent = "no backend";
    pill.className = "pill err";
    $("fire-btn").disabled = true;
    $("casc-estado").textContent = "No backend: press Run on Qollab and pick one.";
    return;
  }
  pill.textContent = `backend: ${b.nombre}`;
  pill.className = `pill ${b.hardware ? "warn" : "ok"}`;
  pill.title = b.hardware
    ? "Real IonQ hardware: each job uses credits. Try the Forte remote simulator first (free)."
    : b.ionq ? "IonQ remote simulator with its noise model (free). IonQ accepts one job per run, so the cascade runs one step."
      : "Local simulator (free, no job limit).";
  $("casc-estado").textContent = b.ionq
    ? `${b.nombre}: IonQ accepts one job per run, so the laser runs one circuit (one step).`
    : `Ready on ${b.nombre}. Nothing has run yet.`;
}

// ------------------------------------------------------------------ eventos
function bindUI() {
  $("fire-btn").addEventListener("click", fire);
  $("casc-stop").addEventListener("click", stopCascade);
  $("neuron-input").addEventListener("change", () => {
    const nm = $("neuron-input").value.trim().toUpperCase();
    if (state.index.has(nm)) selectSource(nm); else neuronCard(nm);
  });
  $("neuron-input").addEventListener("keydown", (e) => { if (e.key === "Enter") fire(); });
  $("theta").addEventListener("input", () => {
    const th = thetaVal();
    $("theta-val").textContent = fmtTheta(th);
    $("pfire").textContent = (Math.sin(th / 2) ** 2).toFixed(2);
    $("theta").setAttribute("aria-valuetext", `θ = ${fmtTheta(th)}, fire probability ${(Math.sin(th / 2) ** 2).toFixed(2)}`);
  });
  $("tau").addEventListener("input", () => {
    $("tau-val").textContent = $("tau").value;
    $("tau").setAttribute("aria-valuetext", `τ = ${$("tau").value}`);
  });
  $("gamma").addEventListener("input", () => { $("gamma-val").textContent = parseFloat($("gamma").value).toFixed(1); });
  for (const id of ["theta", "tau", "gamma"]) $(id).addEventListener("change", prefetchPreview);
  $("show-edges").addEventListener("change", () => scene.setEdgesVisible($("show-edges").checked));
  $("quality").addEventListener("change", () => scene.setQuality($("quality").value));
  scene.on("quality", (q, auto) => {
    $("quality").querySelector('option[value="auto"]').textContent = `Auto (${QUALITY[q].label.toLowerCase()})`;
    if (auto) toast(`Graphics quality set to "${QUALITY[q].label}" to keep it smooth`);
  });
  $("autorotate").addEventListener("change", () => scene.setAutoRotate($("autorotate").checked));
  $("swim").addEventListener("change", () => scene.setSwimEnabled($("swim").checked));
  if (REDUCED) { $("swim").checked = false; $("swim").disabled = true; }

  // sonido
  $("sound-btn").addEventListener("click", () => {
    const on = !sound.on;
    sound.setOn(on);
    if (on && sound.activar()) sound.musicaOn();
    $("sound-btn").setAttribute("aria-pressed", String(on));
    $("sound-label").textContent = on ? "Sound on" : "Sound off";
    $("sound-icon").innerHTML = on ? SOUND_ON : SOUND_OFF;
    announce(on ? "Sound on" : "Sound off");
  });

  // música de fondo: empieza con el primer gesto en la página (regla de los navegadores)
  const empezarMusica = () => {
    if (sound.on && sound.activar()) sound.musicaOn();
    document.removeEventListener("pointerdown", empezarMusica);
    document.removeEventListener("keydown", empezarMusica);
  };
  document.addEventListener("pointerdown", empezarMusica);
  document.addEventListener("keydown", empezarMusica);
  document.addEventListener("visibilitychange", () => sound.musicaOculta(document.hidden));
  $("music-vol").addEventListener("input", () => {
    const v = parseInt($("music-vol").value, 10);
    sound.setMusicaVol(v / 100);
    $("music-vol-val").textContent = v ? `${v}%` : "off";
    $("music-vol").setAttribute("aria-valuetext", v ? `${v} percent` : "off");
  });

  // panel 2
  $("circ-step").addEventListener("change", () => {
    circ.follow = $("circ-step").value === String(cascade.steps.length - 1) || $("circ-step").value === "preview";
    const r = cascade.steps[parseInt($("circ-step").value, 10)];
    if (r) applyCascadeScene(r);
    renderCircuitPanel();
  });
  document.querySelectorAll('input[name="circ-vista"]').forEach((r) => r.addEventListener("change", renderCircuitPanel));

  // pestañas (flechas, Inicio y Fin)
  TABS.forEach((t, i) => {
    t.addEventListener("click", () => setChapter(i + 1));
    t.addEventListener("keydown", (e) => {
      const n = { ArrowRight: i + 2, ArrowLeft: i, Home: 1, End: 2 }[e.key];
      if (n === undefined) return;
      e.preventDefault();
      setChapter(((n - 1 + 2) % 2) + 1, { focusTab: true });
    });
  });
  document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => {
    setChapter(parseInt(b.dataset.goto, 10), { focusTab: true });
  }));
  // ayuda
  document.querySelectorAll("button.help").forEach((b) => {
    b.setAttribute("aria-expanded", "false");
    b.setAttribute("aria-controls", "help-pop");
    b.addEventListener("click", (e) => { e.stopPropagation(); openHelp(b); });
  });
  document.addEventListener("click", (e) => { if (!e.target.closest("#help-pop")) closeHelp(); });
  document.querySelector(".side").addEventListener("scroll", () => closeHelp(), { passive: true });
  // ajustes de laboratorio
  $("lab-btn").addEventListener("click", () => setLab($("lab").hidden));
  $("lab-close").addEventListener("click", () => setLab(false));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("help-pop").hidden) { closeHelp({ refocus: true }); e.preventDefault(); return; }
    if (!$("lab").hidden) { setLab(false); e.preventDefault(); }
  });

  scene.on("key", (e) => {
    if (e.key === "Enter") { fire(); return true; }
    return false;
  });
  scene.on("pick", (i) => selectSource(state.neurons[i].name));
  const tip = $("tooltip");
  scene.on("hover", (i, px) => {
    if (i < 0 || !px) { tip.classList.remove("show"); return; }
    const d = state.neurons[i];
    tip.innerHTML = `<b>${d.name}</b> <span class="tag ${d.type}">${TYPE_ES[d.type]}</span><br>${d.degree} connections` +
      `<br><span style="color:var(--faint)">click: aim the laser here</span>`;
    tip.style.left = `${px[0] + 14}px`;
    tip.style.top = `${px[1] + 14}px`;
    tip.classList.add("show");
  });
}

// ------------------------------------------------------------------ arranque
async function init() {
  bindUI();
  const loaderText = $("loader-text");
  try {
    loaderText.textContent = "Reading the Cook et al. (2019) connectome in Python…";
    await respirar();
    const con = await py.conectoma();
    state.neurons = con.neurons;
    con.neurons.forEach((d, i) => state.index.set(d.name, i));
    $("neuron-list").innerHTML = con.neurons.map((d) => `<option value="${d.name}">${TYPE_ES[d.type]}</option>`).join("");
    loaderText.textContent = "Loading the 3D body…";
    let glb = null;
    try { glb = await py.cuerpo(); } catch (e) { console.log(`No .glb body: ${e.message}`); }
    scene.setData(con.neurons, con.edges, glb);
    if (BACKEND) {
      try { state.backend = await py.backendInfo(BACKEND); } catch (e) { console.log(`backend: ${e.message}`); }
    }
    renderBackendInfo();
    $("loader").classList.add("hide");
    neuronCard(state.source);
    fireLabel();
    showSourceOnly();
    narrateReady();
    prefetchPreview();
    console.log(`Optogenetic Quantum Brain ready · ${con.neurons.length} neurons · ${con.edges.length} synapses drawn` +
      (state.backend ? ` · backend ${state.backend.nombre}` : ""));
  } catch (e) {
    loaderText.textContent = `Could not start the Python core (${e.message}).`;
    $("backend-pill").textContent = "error";
    $("backend-pill").className = "pill err";
    console.log(`Startup error: ${e.stack || e.message}`);
  }
}

await init();

// La página sigue siendo interactiva (láser, circuitos, jobs) hasta que se presione Stop:
// se mantiene viva la ejecución para que Python siga disponible.
await new Promise(() => {});

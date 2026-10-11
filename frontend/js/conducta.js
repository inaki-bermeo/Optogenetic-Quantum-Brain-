// Conducta: qué hace el gusano real cuando se activa cada clase de neurona.
//
// Cada fila resume experimentos de ablación u optogenética (referencias en docs/behaviour.md).
// Sólo se incluyen clases con un efecto motor establecido; el resto devuelve null y el gusano
// no se mueve, a propósito. La cascada cuántica es el modelo; esta tabla es biología real.
//
// Motor: un único impulso con signo d ∈ [−1, 1] (−1 atrás, +1 adelante). Que AVA y AVB sumen con
// signos opuestos reproduce, de forma cualitativa, la inhibición mutua entre los dos circuitos.

const REF = {
  chalfie: "Chalfie et al. 1985",
  zheng: "Zheng et al. 1999",
  stirman: "Stirman et al. 2011",
  leifer: "Leifer et al. 2011",
  kaplan: "Kaplan & Horvitz 1993",
  hilliard: "Hilliard et al. 2005",
  gray: "Gray, Hill & Bargmann 2005",
  haspel: "Haspel, O'Donovan & Hart 2010",
  mcintire: "McIntire et al. 1993",
  liewald: "Liewald et al. 2008",
  avery: "Avery & Horvitz 1989",
  raizen: "Raizen et al. 1995",
  sawin: "Sawin, Ranganathan & Horvitz 2000",
  desai: "Desai et al. 1988",
  schafer: "Schafer 2005",
  turek: "Turek et al. 2013, 2016",
  gordus: "Gordus et al. 2015",
  li: "Li et al. 2014",
};

/** Programas: reversa, avance, escape (reversa + giro omega), omega, cabeza, flexion, relajar, bombeo, puesta, quietud, tendencia. */
export const CONDUCTAS = [
  { patron: /^AV[ADE][LR]$/, programa: "reversa", clase: "command interneuron", empuje: -0.8,
    texto: "backward (reversal)", ref: [REF.chalfie, REF.zheng] },
  { patron: /^(AVB|PVC)[LR]$/, programa: "avance", clase: "command interneuron", empuje: 0.8,
    texto: "forward", ref: [REF.chalfie, REF.zheng] },
  { patron: /^(ALM[LR]|AVM)$/, programa: "reversa", clase: "head touch receptor", empuje: -0.6,
    texto: "backs away (head touch)", ref: [REF.chalfie, REF.stirman, REF.leifer] },
  { patron: /^PLM[LR]$/, programa: "avance", clase: "tail touch receptor", empuje: 0.6,
    texto: "speeds forward (tail touch)", ref: [REF.chalfie, REF.stirman, REF.leifer] },
  { patron: /^ASH[LR]$/, programa: "escape", clase: "nociceptor", empuje: -0.8,
    texto: "escape: reversal, then omega turn", ref: [REF.kaplan, REF.hilliard] },
  { patron: /^(RIV[LR]|SMDV[LR])$/, programa: "omega", clase: "turn neuron", empuje: 0, lado: -1,
    texto: "deep ventral (omega) turn", ref: [REF.gray] },
  { patron: /^(SMDD[LR]|RMD[DV]?[LR]?|SMB[DV][LR]|RME[DVLR])$/, programa: "cabeza", clase: "head motor neuron", empuje: 0,
    texto: "head bend", ref: [REF.gray] },
  { patron: /^(DA|VA|AS)\d+$/, programa: "flexion", clase: "A-type motor neuron", empuje: -0.15,
    texto: "local body bend (backward circuit)", ref: [REF.haspel, REF.chalfie] },
  { patron: /^(DB|VB)\d+$/, programa: "flexion", clase: "B-type motor neuron", empuje: 0.15,
    texto: "local body bend (forward circuit)", ref: [REF.haspel, REF.chalfie] },
  { patron: /^(DD|VD)\d+$/, programa: "relajar", clase: "GABA motor neuron", empuje: 0,
    texto: "local muscle relaxation", ref: [REF.mcintire, REF.liewald] },
  { patron: /^(MC[LR]|M[234][LR]?)$/, programa: "bombeo", clase: "pharyngeal motor neuron", empuje: 0,
    texto: "pharynx pumping", ref: [REF.avery, REF.raizen] },
  { patron: /^NSM[LR]$/, programa: "bombeo", clase: "food-sensing neuron (serotonin)", empuje: 0, escala: 0.5,
    texto: "slows down and pumps", ref: [REF.sawin] },
  { patron: /^(HSN[LR]|VC\d)$/, programa: "puesta", clase: "egg-laying neuron", empuje: 0,
    texto: "egg laying", ref: [REF.desai, REF.schafer] },
  { patron: /^RIS$/, programa: "quietud", clase: "sleep neuron", empuje: 0, escala: 0,
    texto: "stops moving (sleep-like quiescence)", ref: [REF.turek] },
  { patron: /^AIB[LR]$/, programa: "tendencia", clase: "navigation interneuron", empuje: -0.3,
    texto: "tendency to reverse", ref: [REF.gray, REF.gordus] },
  { patron: /^AIY[LR]$/, programa: "tendencia", clase: "navigation interneuron", empuje: 0.3,
    texto: "tendency to keep going forward", ref: [REF.gray, REF.li] },
  { patron: /^AIZ[LR]$/, programa: "cabeza", clase: "navigation interneuron", empuje: 0,
    texto: "tendency to turn", ref: [REF.gray] },
];

export function conductaDe(nombre) {
  if (!nombre) return null;
  return CONDUCTAS.find((c) => c.patron.test(nombre)) ?? null;
}

/** Lado de la flexión: músculos dorsales (+1) para D* y AS, ventrales (−1) para V*. */
function ladoDe(nombre, entrada) {
  if (entrada.lado) return entrada.lado;
  if (/^(D[ABD]|AS)\d+$/.test(nombre) || /^SMDD/.test(nombre)) return 1;
  if (/^V[ABD]\d+$/.test(nombre)) return -1;
  return 0;
}

export class Motor {
  constructor() { this.d = 0; this.ultima = null; }

  /** Suma el empuje de la neurona y devuelve el evento a animar (o null si no tiene conducta conocida). */
  aplicar(nombre) {
    const entrada = conductaDe(nombre);
    if (!entrada) return null;
    if (entrada.escala != null) this.d *= entrada.escala;
    this.d = Math.max(-1, Math.min(1, this.d + entrada.empuje));
    return { nombre, programa: entrada.programa, entrada, d: this.d, lado: ladoDe(nombre, entrada) };
  }

  /** Entre pasos el impulso se apaga (las neuronas de mando no quedan activas para siempre). */
  decaer() { this.d *= 0.6; }
}

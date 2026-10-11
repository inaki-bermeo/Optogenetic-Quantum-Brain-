// Escena 3D: gusano C. elegans con sus 302 neuronas en posiciones reales.
//
// El lienzo ocupa todo el escenario del HUD (con el HUD encima), el cuerpo .glb llega desde
// Python como bytes (JS no puede leer archivos del proyecto en Qollab), respeta
// prefers-reduced-motion y se maneja con teclado.
//
// Rendimiento (pensado para notebooks con gráficos integrados):
//   * render bajo demanda: sólo se dibuja cuando algo cambia (cámara, animación, láser);
//   * el bucle se detiene del todo mientras el lienzo no se ve (inspector, fuera de pantalla,
//     pantalla de inicio) y el nado solo se dibuja a 30 cuadros por segundo;
//   * calidad alta / media / baja, con ajuste automático si los FPS caen;
//   * bloom a media resolución en "media" y desactivado en "baja";
//   * selección de neuronas en espacio de pantalla (sin raycasting por cuadro);
//   * colores por tabla precalculada y buffers tipados para neuronas y sinapsis.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { COARSE, REDUCED, T_COLAPSO, T_SUPERPOSICION } from "./util.js";

const TYPE_COLOR = {
  sensory: new THREE.Color("#2dd4bf"),
  interneuron: new THREE.Color("#a78bfa"),
  motor: new THREE.Color("#f59e0b"),
  unknown: new THREE.Color("#94a3b8"),
};
const STOPS = [
  [0.0, new THREE.Color("#13204a")],
  [0.35, new THREE.Color("#1e6bff")],
  [0.7, new THREE.Color("#38e1ff")],
  [1.0, new THREE.Color("#ffffff")],
];
function colormap(v, out = new THREE.Color()) {
  v = Math.min(1, Math.max(0, v));
  for (let i = 1; i < STOPS.length; i++) {
    if (v <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1];
      const [b, cb] = STOPS[i];
      return out.copy(ca).lerp(cb, (v - a) / (b - a));
    }
  }
  return out.copy(STOPS[STOPS.length - 1][1]);
}
// Tabla de 256 colores precalculada (evita interpolar por neurona y por cuadro)
const LUT = (() => {
  const t = new Float32Array(256 * 3), c = new THREE.Color();
  for (let i = 0; i < 256; i++) { colormap(i / 255, c); t.set([c.r, c.g, c.b], i * 3); }
  return t;
})();
const lutIndex = (v) => 3 * Math.max(0, Math.min(255, Math.round(v * 255)));

const Y_UP = new THREE.Vector3(0, 1, 0);
const LASER_DESDE = new THREE.Vector3(-0.6, 4.5, 1.2); // de dónde baja el haz, relativo a la neurona
const PARTICULAS_POR_NEURONA = 17; // en el colapso: de 3 (improbable) a 17 (la más probable)
const RASTRO_MAX = 128; // centros que dibuja el rastro de la cascada

const S_AP = 0.02; // µm → unidades de escena (eje anteroposterior)
const S_TR = 0.028; // ejes transversales (×1.4 respecto del real, para leer mejor el volumen)
const GLTF_SCALE = 0.01; // 1 unidad glTF = 100 µm  (ver docs/3d-model.md)
const SWIM_FRAME = 1 / 30; // el nado, si es lo único que se mueve, se dibuja a 30 cuadros por segundo

// Movimiento: cinemática de curvatura, como la producen los músculos del gusano real.
// Cada movimiento es un perfil de curvatura κ(s) a lo largo del cuerpo (s = 0 cabeza, 1 cola): la onda del
// reptar κ = A·sin(2πs/λ − φ) (φ creciente: la onda va de la cabeza a la cola, avance; decreciente: reversa),
// la flexión o relajación local, la oscilación de la cabeza y el giro omega (curvatura ventral uniforme).
// En JS se integra la línea media con el largo del cuerpo constante (anclada a mitad del cuerpo) y cada
// sección gira rígida con su tangente: órganos, somas y sinapsis se doblan con el cuerpo a cualquier amplitud.
// La tabla (CURVA_N muestras a lo largo de x) va en una textura: fila 0 = (C.x, C.y, C₀.x, C₀.y) deformada y
// en reposo, fila 1 = (cos Δ, sin Δ) del giro de cada sección. Y es el eje dorsoventral: ventral = −Y.
// deform() en JS repite exactamente esta cuenta (picking, etiquetas, cámara).
const CURVA_N = 64;
const SWIM_GLSL = /* glsl */`
  uniform float uSwimT; uniform sampler2D uCurva; uniform vec2 uCurvaX;
  void wormCurva(float x, out vec2 C, out vec2 C0, out vec2 R){
    float u = clamp((x - uCurvaX.x) / (uCurvaX.y - uCurvaX.x), 0.0, 1.0) * ${CURVA_N - 1}.0;
    int i = int(min(floor(u), ${CURVA_N - 2}.0));
    float f = u - float(i);
    vec4 m = mix(texelFetch(uCurva, ivec2(i, 0), 0), texelFetch(uCurva, ivec2(i + 1, 0), 0), f);
    R = normalize(mix(texelFetch(uCurva, ivec2(i, 1), 0).xy, texelFetch(uCurva, ivec2(i + 1, 1), 0).xy, f));
    C = m.xy; C0 = m.zw;
  }
  vec3 wormDeform(vec3 p){
    vec2 C, C0, R; wormCurva(p.x, C, C0, R);
    vec2 o = p.xy - C0;
    return vec3(C + vec2(R.x * o.x - R.y * o.y, R.y * o.x + R.x * o.y), p.z);
  }
  // la normal gira con la sección (exacto: el mismo giro que la posición)
  vec3 wormNormal(vec3 p, vec3 n){
    vec2 C, C0, R; wormCurva(p.x, C, C0, R);
    return normalize(vec3(R.x * n.x - R.y * n.y, R.y * n.x + R.x * n.y, n.z));
  }
`;
const PROJECT_SWIM = /* glsl */`
  vec4 mvPosition = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    mvPosition = batchingMatrix * mvPosition;
  #endif
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  vec4 swimW = modelMatrix * mvPosition;
  swimW.xyz = wormDeform( swimW.xyz );
  mvPosition = viewMatrix * swimW;
  gl_Position = projectionMatrix * mvPosition;
`;

const SWIM_W = (2 * Math.PI) / 3.2; // un ciclo cada 3.2 s: lento y suave
const LAMBDA = 0.65; // longitud de onda del reptar, en largos del cuerpo (gusano real en agar: ~0.6–0.7)
const KAPPA_NADO = 2.2; // curvatura máxima del nado tranquilo, en rad por largo del cuerpo (κ·L); reversa ≈ 6.6
const K_FLEX = 6; // flexión local: flex = 0.8 → ≈ 0.75 rad de giro total en la zona del músculo
const K_CABEZA = 14; // oscilación de la cabeza (κ·L en la punta por unidad de "cabeza")
// Valores de reposo de la conducta: dir/freq de la onda, amplitud relativa (× KAPPA_NADO), cabeza, flexión
// local, relajación local, giro omega (curvatura total en rad, ventral < 0), bombeo de la faringe y brillo.
const MOTION_REPOSO = { dir: 1, freq: 1, amp: 1, cabeza: 0, flex: 0, relaja: 0, bend: 0, bombeo: 0, brillo: 1, giro: 0 };
const MOTION_TAU = { dir: 0.35, freq: 0.3, amp: 0.25, cabeza: 0.25, flex: 0.25, relaja: 0.3, bend: 0.45, bombeo: 0.15, brillo: 0.4, giro: 0.35 };
const K_GIRO = 9; // la cabeza se orienta hacia la comida (κ·L en la punta por unidad de "giro")

// Bacterias: el alimento del gusano (E. coli en las placas del laboratorio). Se dibujan como bastones de neón
// verde, como las E. coli marcadas con GFP bajo el microscopio, y algunas magenta (mCherry); no a escala
// (una E. coli mide ~2 µm: en la escena sería invisible). Una de ellas es la comida con la que el gusano
// interactúa; el resto decora y deriva. El gusano está anclado: cuando avanza, son las bacterias las que
// pasan hacia la cola (el fondo "fluye"), y la comida se acerca a la boca.
const N_BACTERIAS = 240;
const COMIDA_DIST = [2.6, 3.6]; // a cuánto aparece la comida delante de la boca (unidades de escena)
const COMIDA_EMPUJE = 1.4; // cuánto se acerca por unidad de empuje de una neurona (js/conducta.js)
const COMIDA_NADO = 0.08; // cuánto se acerca por segundo mientras el gusano repta hacia adelante
const BACT_GLSL_FRAG = /* glsl */`
  uniform float uK;
  varying vec3 vColor; varying float vBrillo; varying vec3 vN; varying vec3 vV;
  void main(){
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
    vec3 c = vColor * (0.35 + 1.4 * fres) * vBrillo;
    gl_FragColor = vec4(c * uK, 1.0);
  }`;

// maxPx: tope de píxeles internos del lienzo (el lienzo ocupa toda la pantalla; en monitores grandes
// se baja la resolución interna en vez de dibujar millones de píxeles con bloom).
// Órganos que puede traer el .glb, reconocidos por nombre (el triturador antes que la faringe: su nombre la incluye)
const ORGANOS = [
  ["grinder", /grinder|triturador/], ["faringe", /faringe|pharynx/], ["anillo", /anillo|nerve.?ring/],
  ["intestino", /intestin/], ["gonada", /gonad/], ["huevos", /huevo|egg|embri/], ["cuerpo", /cuerpo|body/],
];
// Aspecto de cada órgano (microscopio de fluorescencia, paleta del HUD)
const MATERIAL_ORGANO = {
  grinder: { color: "#bfefff", rim: "#ffffff", strength: 0.55, fill: 0.3, pump: true },
  anillo: { color: "#a78bfa", rim: "#d9ccff", strength: 0.4, fill: 0.22 }, // neuropilo: violeta de las interneuronas
  intestino: { color: "#3fd1b0", rim: "#9cf5dc", strength: 0.3, fill: 0.2, grain: 0.5 },
  // gónada y huevos se superponen con el intestino y las dos capas del cuerpo (mezcla aditiva): más tenues
  gonada: { color: "#f5a65b", rim: "#ffd9a8", strength: 0.2, fill: 0.12, grain: 0.25 },
  huevos: { color: "#3fd1b0", rim: "#d8fff4", strength: 0.2, fill: 0.12, grain: 0.35 },
};

export const QUALITY = {
  alta: { label: "High", pixelRatio: () => Math.min(window.devicePixelRatio, 1.75), bloom: true, bloomScale: 1, maxPx: 2.1e6 },
  media: { label: "Medium", pixelRatio: () => 1, bloom: true, bloomScale: 0.5, maxPx: 1.2e6 },
  baja: { label: "Low", pixelRatio: () => Math.min(window.devicePixelRatio, 1) * 0.85, bloom: false, bloomScale: 0, maxPx: 0.8e6,
    nadoLibre: false }, // en "baja" el gusano no nada en reposo (las conductas sí se animan)
};
const REPOSO_MS = 20000; // sin interacción ni cascada, el movimiento de ambiente (nado, órbita) se detiene

export class WormScene {
  constructor(canvas, { quality = "auto" } = {}) {
    this.canvas = canvas;
    this.container = canvas.parentElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#04060c");
    this.scene.fog = new THREE.FogExp2("#04060c", 0.025);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
    this.camera.position.set(-1.2, 6.0, 23.5);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 40;
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.addEventListener("change", () => this.requestRender());
    // pantallas táctiles: OrbitControls pone touch-action: none (bloquea el desplazamiento de la página);
    // con pan-y un dedo vertical desplaza la página y uno horizontal o dos dedos mueven la cámara
    if (COARSE) {
      canvas.style.touchAction = "pan-y"; // tiene que ser inline: OrbitControls escribe "none" inline
      this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
    }
    // si la persona arrastra la cámara, manda ella: se corta cualquier vuelo y no hay acercamientos
    this.arrastrando = false;
    this.controls.addEventListener("start", () => { this.arrastrando = true; this._tween?.resolve(); this._tween = null; });
    this.controls.addEventListener("end", () => { this.arrastrando = false; });

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.45, 0.28);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this._last = performance.now();
    this.pointer = null;
    this.hovered = -1;
    this.callbacks = { pick: () => {}, hover: () => {}, quality: () => {}, key: () => {}, comer: () => {} };
    this.comida = null; // la bacteria con la que interactúa el gusano (ver _initBacterias)
    this.edgeVisible = true;
    this.laser = null;
    this.highlight = new Set();
    this._tmpMat = new THREE.Matrix4();
    this._tmpVec = new THREE.Vector3();
    this._tmpVec2 = new THREE.Vector3();
    this._dirty = true;
    this._perf = { frames: 0, time: 0, probada: false, previo: false };

    // "auto" empieza en media y sube a alta sólo si el equipo la sostiene (ver _adaptQuality)
    this.autoQuality = quality === "auto";
    this.quality = this.autoQuality ? "media" : quality;

    this.reducedMotion = REDUCED;
    // uniforms compartidos por todos los materiales que ondulan
    this._curva = this._nuevaCurva();
    this.swimU = {
      uSwimT: { value: 0 }, uBrillo: { value: 1 },
      uCurva: { value: this._curva.tex }, uCurvaX: { value: new THREE.Vector2(0, 1) },
    };
    this._fase = 0; // fase de la onda del reptar
    this._flexS = 0.5; this._flexW = 0.09; this._relajaS = 0.5; // dónde actúan la flexión y la relajación
    this.swim = { enabled: !REDUCED, target: REDUCED ? 0 : 1, level: 0, rampa: 0.9 };
    // conducta en curso (ver actuar): cada valor se acerca suavemente a su objetivo
    this.motion = { ...MOTION_REPOSO };
    this.motionT = { ...MOTION_REPOSO };
    this._pumpU = { value: 0 }; // sólo la faringe la usa
    this._actuar = null;
    this._driveT = 0;
    this.glbBytes = null;
    this._paused = false; // lo decide main.js (inspector abierto, pantalla de inicio)
    this._onScreen = true; // IntersectionObserver
    this._running = false;
    this._loopFn = null; // el bucle instalado; null = detenido (pausa, o nada se mueve: ver _tick)
    this._quietos = 0;
    this.ocupada = false; // main.js lo pone mientras corre una cascada: no hay reposo
    this._reposo = false;
    this._ultimaEntrada = performance.now();
    this._sinceSwim = 0;
    this._addStars();
    this._bindEvents();
    this._resize();
    this._updateLoop();
  }

  /** main.js pausa la escena mientras no se ve (inspector abierto, pantalla de inicio). */
  setPaused(v) { this._paused = v; this._updateLoop(); }

  _updateLoop() {
    const run = !this._paused && this._onScreen && !document.hidden;
    if (run === this._running) return;
    this._running = run;
    if (run) {
      this._dirty = true;
      this._wake();
    } else {
      this.renderer.setAnimationLoop((this._loopFn = null));
      // las animaciones en curso terminan ya: la cascada espera la promesa del colapso
      this._endCollapse();
      this._endActuar();
      this._removeLaser();
      if (this._tween) { const T = this._tween; this._animateTween(T.dur); }
    }
  }

  on(name, fn) { this.callbacks[name] = fn; }
  requestRender() { this._dirty = true; this._wake(); }

  /** Rearranca el bucle de animación si estaba detenido (sin dibujar nada todavía). */
  _wake() {
    if (!this._running || this._loopFn) return;
    this._quietos = 0;
    this._last = performance.now();
    this.renderer.setAnimationLoop((this._loopFn = () => this._tick()));
  }

  /** Hubo interacción (main.js la avisa desde cualquier parte de la página): sale del reposo. */
  marcarActividad() {
    this._ultimaEntrada = performance.now();
    if (this._reposo) { this._reposo = false; this.requestRender(); }
  }

  setQuality(q, { auto = false } = {}) {
    if (q === "auto") { this.autoQuality = true; q = this.quality; } else if (!auto) { this.autoQuality = false; }
    this.quality = q;
    this._resize();
    this.callbacks.quality(q, this.autoQuality);
    this.requestRender();
  }

  setAutoRotate(v) { this.controls.autoRotate = v; this.requestRender(); }

  // ------------------------------------------------------------------ datos
  setData(neurons, edges, glbBytes = null) {
    this.glbBytes = glbBytes;
    this.neurons = neurons;
    const n = neurons.length;
    const c = [0, 0, 0];
    neurons.forEach((d) => { c[0] += d.x; c[2] += d.z; });
    c[0] /= n; c[2] /= n;
    const ys = neurons.map((d) => d.y);
    c[1] = (Math.min(...ys) + Math.max(...ys)) / 2; // centro del cuerpo (no de la cabeza)
    this.center = c;
    this.positions = neurons.map((d) => this.dataToScene(d.x, d.y, d.z));
    this.baseColors = neurons.map((d) => TYPE_COLOR[d.type] ?? TYPE_COLOR.unknown);

    // Neuronas (una sola llamada de dibujo)
    const mat = this._sw(new THREE.MeshBasicMaterial({ toneMapped: false }));
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 14, 10), mat, n);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.scene.add(this.mesh);

    // Sinapsis (buffers tipados; peso normalizado para el brillo base)
    const m = edges.length;
    this.edgeA = new Int32Array(m);
    this.edgeB = new Int32Array(m);
    this.edgeW = new Float32Array(m);
    const wmax = Math.max(...edges.map((e) => e[2]), 1e-9);
    const ep = new Float32Array(m * 6);
    edges.forEach(([i, j, w], k) => {
      this.edgeA[k] = i; this.edgeB[k] = j; this.edgeW[k] = w / wmax;
      const a = this.positions[i], b = this.positions[j];
      ep.set([a.x, a.y, a.z, b.x, b.y, b.z], k * 6);
    });
    // índices para las actualizaciones parciales (sólo la ventana medida cambia durante el colapso)
    this._aristasDe = Array.from({ length: n }, () => []);
    for (let k = 0; k < m; k++) { this._aristasDe[this.edgeA[k]].push(k); this._aristasDe[this.edgeB[k]].push(k); }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute("position", new THREE.BufferAttribute(ep, 3));
    eg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(m * 6), 3));
    this.edgeLines = new THREE.LineSegments(eg, this._sw(new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    })));
    this.scene.add(this.edgeLines);

    this.ringGroup = new THREE.Group();
    this.scene.add(this.ringGroup);
    this._buildLabel();
    this._initFx();
    this._loadBody();
    this.setActivity(null);
  }

  dataToScene(x, y, z) {
    const c = this.center;
    return new THREE.Vector3((y - c[1]) * S_AP, (z - c[2]) * S_TR, (x - c[0]) * S_TR);
  }

  // ------------------------------------------------------------- cuerpo 3D
  /**
   * Material del cuerpo con aspecto de microscopio de fluorescencia (aditivo, translúcido):
   * borde brillante (Fresnel), relleno suave con luz desde arriba, anillos de la cutícula a lo
   * largo del eje anteroposterior y un grano fino (opcional, para el intestino). Ondula con el nado.
   */
  _bodyMaterial({ color, rim, strength = 1, fill = 0.18, annuli = 0, grain = 0, side = THREE.DoubleSide, pump = null } = {}) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side,
      uniforms: {
        uColor: { value: new THREE.Color(color) }, uRim: { value: new THREE.Color(rim) },
        uK: { value: strength }, uFill: { value: fill }, uAnn: { value: annuli }, uGrain: { value: grain },
        uPump: pump ?? { value: 0 },
        ...this.swimU,
      },
      vertexShader: /* glsl */`
        ${SWIM_GLSL}
        uniform float uPump;
        varying vec3 vN; varying vec3 vV; varying vec3 vW;
        void main(){
          vec3 n0 = normalize(mat3(modelMatrix) * normal);
          vec4 w = modelMatrix * vec4(position, 1.0);
          w.xyz += n0 * uPump; // bombeo: la faringe se ensancha y se contrae
          vec3 n = wormNormal(w.xyz, n0);
          w.xyz = wormDeform(w.xyz);
          vW = w.xyz;
          vec4 mv = viewMatrix * w;
          vN = normalize(mat3(viewMatrix) * n); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform vec3 uRim; uniform float uK; uniform float uFill; uniform float uAnn; uniform float uGrain;
        uniform float uBrillo;
        varying vec3 vN; varying vec3 vV; varying vec3 vW;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        void main(){
          vec3 N = normalize(vN), V = normalize(vV);
          float ndv = abs(dot(N, V));
          float fres = pow(1.0 - ndv, 2.4);
          // luz suave desde arriba-adelante: da volumen al tubo
          float lit = 0.45 + 0.55 * max(dot(N, normalize(vec3(-0.25, 0.85, 0.45))), 0.0);
          // anillos de la cutícula (se desvanecen cuando son más finos que un píxel)
          float f = vW.x * uAnn;
          float aa = clamp(1.0 - 1.6 * fwidth(f), 0.0, 1.0);
          float ann = mix(1.0, 0.8 + 0.2 * smoothstep(0.15, 0.85, 0.5 + 0.5 * cos(6.2831853 * f)), aa * step(0.001, uAnn));
          float g = uGrain > 0.0 ? mix(1.0, 0.55 + 0.9 * hash(floor(vW * 14.0)), uGrain) : 1.0;
          vec3 c = uColor * uFill * lit * g + uRim * fres * (0.55 + 0.45 * lit);
          c *= ann;
          gl_FragColor = vec4(c * uK * uBrillo, 1.0);
        }`,
    });
  }

  async _loadBody() {
    // 1) Modelo anatómico (data/gusano.glb, que Python lee y entrega como bytes)
    try {
      if (!this.glbBytes) throw new Error("no .glb model");
      const gltf = await new GLTFLoader().parseAsync(this.glbBytes, "");
      this.glbBytes = null; // ya parseado: no hace falta guardar los bytes
      const group = new THREE.Group();
      const organos = {};
      let cuerpo = null, faringe = null;
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((obj) => {
        const vulva = obj.userData?.vulva_um; // extras del modelo de Blender (tools/blender/modelo_gusano.py)
        if (Array.isArray(vulva)) this._vulvaDatos = vulva;
        if (!obj.isMesh) return;
        const geo = obj.geometry.clone();
        geo.applyMatrix4(obj.matrixWorld);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          // glTF (X, Y, Z) = (x, z, −y)·0.01  →  datos (µm)  →  escena
          const v = this.dataToScene(p.getX(i) / GLTF_SCALE, -p.getZ(i) / GLTF_SCALE, p.getY(i) / GLTF_SCALE);
          p.setXYZ(i, v.x, v.y, v.z);
        }
        geo.deleteAttribute("normal");
        geo.computeVertexNormals();
        const name = `${obj.name} ${obj.material?.name ?? ""}`.toLowerCase();
        const rol = ORGANOS.find(([, re]) => re.test(name))?.[0];
        if (rol === "faringe") faringe = geo;
        else if (rol && rol !== "cuerpo") organos[rol] ??= geo;
        else if (!cuerpo) cuerpo = geo;
      });
      if (!cuerpo) throw new Error("empty glb");
      this._buildAnatomy(group, cuerpo, faringe, organos);
      this.body = group;
      this.scene.add(group);
    } catch (err) {
      // 2) Respaldo: cuerpo aproximado generado aquí mismo
      console.info("Using procedural body:", err?.message ?? err);
      const group = new THREE.Group();
      this._buildAnatomy(group, this._proceduralBodyGeometry(), null);
      this.body = group;
      this.scene.add(group);
    }
    this.requestRender();
  }

  /**
   * Cuerpo (dos capas: pared interna tenue + cutícula con anillos), faringe e intestino, más los órganos
   * del modelo de Blender si vienen en el .glb (triturador, anillo nervioso, gónada, huevos en el útero).
   * Un .glb viejo (sólo cuerpo y faringe) sigue funcionando: el intestino se arma aquí.
   */
  _buildAnatomy(group, cuerpo, faringe, organos = {}) {
    cuerpo.computeBoundingBox();
    const bb = cuerpo.boundingBox;
    this.bodyBox = bb;
    const linea = this._centerline(cuerpo, 64);
    this._linea = linea; // también ubica la vulva (puesta de huevos)
    this._initCurva(linea, bb.min.x, bb.max.x); // reposo de la cinemática: la misma línea media que el cuerpo
    // pared interna (caras traseras) y cutícula (caras delanteras)
    group.add(new THREE.Mesh(cuerpo, this._bodyMaterial({ color: "#1d5fe0", rim: "#4fc3ff", strength: 0.4, fill: 0.14,
      side: THREE.BackSide })));
    group.add(new THREE.Mesh(cuerpo, this._bodyMaterial({ color: "#2a74ff", rim: "#9eeeff", strength: 0.8, fill: 0.08,
      annuli: 1 / 0.16, side: THREE.FrontSide })));
    if (faringe) {
      group.add(new THREE.Mesh(faringe, this._bodyMaterial({ color: "#7fd6ff", rim: "#d8f6ff", strength: 0.45, fill: 0.22,
        pump: this._pumpU })));
      faringe.computeBoundingBox();
    }
    for (const [rol, geo] of Object.entries(organos)) {
      const m = MATERIAL_ORGANO[rol];
      if (m) group.add(new THREE.Mesh(geo, this._bodyMaterial({ ...m, pump: m.pump ? this._pumpU : null })));
    }
    // intestino: tubo a lo largo de la línea media, desde el bulbo posterior de la faringe hasta cerca de la cola
    if (linea && !organos.intestino) {
      const head = bb.min.x, tail = bb.max.x, L = tail - head;
      const x0 = faringe ? faringe.boundingBox.max.x + 0.02 * L : head + 0.2 * L;
      const x1 = head + 0.9 * L;
      const n = 56, centers = [], radii = [];
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n;
        const [cy, cz, r] = linea(x);
        const u = i / n;
        const taper = Math.min(1, u / 0.08) * Math.min(1, (1 - u) / 0.12);
        // el intestino real se tuerce ligeramente (20 células en pares): pequeño zigzag
        const tw = 0.08 * r * Math.sin(u * Math.PI * 9);
        centers.push(new THREE.Vector3(x, cy + tw, cz - 0.6 * tw));
        radii.push(Math.max(0.02, 0.4 * r * (0.25 + 0.75 * taper)));
      }
      group.add(new THREE.Mesh(this._tube(centers, radii, 20), this._bodyMaterial({ color: "#3fd1b0", rim: "#9cf5dc",
        strength: 0.3, fill: 0.2, grain: 0.5 })));
    }
    this._initBacterias();
  }

  /** Línea media del cuerpo: para cada x, centro (y, z) y radio medio de la sección. */
  _centerline(geo, bins) {
    const p = geo.attributes.position;
    const bb = geo.boundingBox;
    const x0 = bb.min.x, dx = (bb.max.x - bb.min.x) / bins;
    const acc = Array.from({ length: bins }, () => [0, 0, 0, []]);
    for (let i = 0; i < p.count; i++) {
      const b = Math.min(bins - 1, Math.floor((p.getX(i) - x0) / dx));
      acc[b][0] += p.getY(i); acc[b][1] += p.getZ(i); acc[b][2]++; acc[b][3].push(i);
    }
    const prof = acc.map(([sy, sz, c, idx]) => {
      if (!c) return null;
      const cy = sy / c, cz = sz / c;
      let r = 0;
      for (const i of idx) r += Math.hypot(p.getY(i) - cy, p.getZ(i) - cz);
      return [cy, cz, r / c];
    });
    // rellenar huecos con el vecino más cercano
    for (let i = 0; i < bins; i++) if (!prof[i]) prof[i] = prof[i - 1] ?? prof.find(Boolean);
    if (!prof[0]) return null;
    return (x) => {
      const f = Math.max(0, Math.min(bins - 1.001, (x - x0) / dx - 0.5));
      const i = Math.floor(f), a = f - i, A = prof[i], B = prof[Math.min(bins - 1, i + 1)];
      return [A[0] + (B[0] - A[0]) * a, A[1] + (B[1] - A[1]) * a, A[2] + (B[2] - A[2]) * a];
    };
  }

  /** Tubo de radio variable a lo largo de una línea de centros (paralelo al eje x). */
  _tube(centers, radii, seg = 24) {
    const pos = [], idx = [];
    centers.forEach((c, b) => {
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        pos.push(c.x, c.y + radii[b] * Math.cos(a), c.z + radii[b] * Math.sin(a));
      }
    });
    for (let b = 0; b < centers.length - 1; b++) {
      for (let k = 0; k < seg; k++) {
        const i0 = b * (seg + 1) + k, i1 = i0 + seg + 1;
        idx.push(i0, i1, i0 + 1, i1, i1 + 1, i0 + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingBox();
    return g;
  }

  _proceduralBodyGeometry() {
    const xs = this.positions.map((p) => p.x);
    const x0 = Math.min(...xs) - 0.35, x1 = Math.max(...xs) + 0.45;
    const bins = 48;
    const centers = [], radii = [];
    for (let b = 0; b <= bins; b++) {
      const x = x0 + ((x1 - x0) * b) / bins;
      const near = this.positions.filter((p) => Math.abs(p.x - x) < 0.6);
      let cy = 0, cz = 0;
      if (near.length) { near.forEach((p) => { cy += p.y; cz += p.z; }); cy /= near.length; cz /= near.length; }
      let r = 0.18;
      near.forEach((p) => { r = Math.max(r, Math.hypot(p.y - cy, p.z - cz)); });
      centers.push([x, cy, cz]);
      radii.push(r);
    }
    const smooth = (arr, k) => arr.map((_, i) => {
      let s = 0, c = 0;
      for (let d = -k; d <= k; d++) { const j = i + d; if (j >= 0 && j < arr.length) { s += arr[j]; c++; } }
      return s / c;
    });
    const ys = smooth(centers.map((c) => c[1]), 3), zs = smooth(centers.map((c) => c[2]), 3);
    const rs = smooth(radii, 4).map((r, i) => (r * 1.12 + 0.12) * Math.pow(Math.sin((Math.PI * i) / bins), 0.45) + 0.02);
    return this._tube(centers.map((c, i) => new THREE.Vector3(c[0], ys[i], zs[i])), rs, 40);
  }

  // ------------------------------------------------------------------ nado
  /** Tabla de la cinemática (CPU) y su textura (GPU); empieza como identidad (C = C₀, sin giro). */
  _nuevaCurva() {
    const N = CURVA_N, f = () => new Float32Array(N);
    const K = { x0: 0, x1: 1, L: 1, c0x: f(), c0y: f(), cx: f(), cy: f(), cos: f().fill(1), sin: f(), s: f(),
      ds: new Float32Array(N - 1), phi0: new Float32Array(N - 1), smid: new Float32Array(N - 1),
      ang: f(), datos: new Float32Array(N * 2 * 4), identidad: true };
    K.tex = new THREE.DataTexture(K.datos, N, 2, THREE.RGBAFormat, THREE.FloatType);
    this._subirCurva(K);
    return K;
  }

  /** Reposo: la línea media del cuerpo (plano XY) muestreada a lo largo de x, con su largo y sus ángulos. */
  _initCurva(linea, x0, x1) {
    const K = this._curva, N = CURVA_N;
    K.x0 = x0; K.x1 = Math.max(x0 + 1e-3, x1);
    for (let i = 0; i < N; i++) {
      const x = K.x0 + ((K.x1 - K.x0) * i) / (N - 1);
      K.c0x[i] = x;
      K.c0y[i] = linea ? linea(x)[0] : 0;
    }
    let L = 0;
    for (let j = 0; j < N - 1; j++) {
      const dx = K.c0x[j + 1] - K.c0x[j], dy = K.c0y[j + 1] - K.c0y[j];
      K.ds[j] = Math.hypot(dx, dy);
      K.phi0[j] = Math.atan2(dy, dx);
      K.s[j] = L;
      L += K.ds[j];
    }
    K.s[N - 1] = L;
    K.L = L;
    for (let i = 0; i < N; i++) K.s[i] /= L;
    for (let j = 0; j < N - 1; j++) K.smid[j] = (K.s[j] + K.s[j + 1]) / 2;
    this.swimU.uCurvaX.value.set(K.x0, K.x1);
    this._integrarCurva(null);
  }

  /** Posición a lo largo del cuerpo (0 cabeza, 1 cola) de un punto de la escena, según su x. */
  _sDeX(x) {
    const K = this._curva, u = Math.min(1, Math.max(0, (x - K.x0) / (K.x1 - K.x0))) * (CURVA_N - 1);
    const i = Math.min(Math.floor(u), CURVA_N - 2), f = u - i;
    return K.s[i] + (K.s[i + 1] - K.s[i]) * f;
  }

  /**
   * Integra la línea media a partir de la curvatura de cada tramo (`kappa(s)`, en rad por largo del cuerpo;
   * null = reposo). Anclada a mitad del cuerpo: el gusano no se desplaza ni gira al moverse.
   */
  _integrarCurva(kappa) {
    const K = this._curva, N = CURVA_N, m = N >> 1;
    if (!kappa) {
      if (K.identidad) return;
      K.cx.set(K.c0x); K.cy.set(K.c0y); K.cos.fill(1); K.sin.fill(0); K.ang.fill(0);
      K.identidad = true;
      this._subirCurva(K);
      return;
    }
    const ang = K.ang;
    ang[m] = 0;
    for (let i = m + 1; i < N; i++) ang[i] = ang[i - 1] + kappa(K.smid[i - 1]) * (K.ds[i - 1] / K.L);
    for (let i = m - 1; i >= 0; i--) ang[i] = ang[i + 1] - kappa(K.smid[i]) * (K.ds[i] / K.L);
    K.cx[m] = K.c0x[m]; K.cy[m] = K.c0y[m];
    for (let i = m + 1; i < N; i++) {
      const a = K.phi0[i - 1] + 0.5 * (ang[i - 1] + ang[i]);
      K.cx[i] = K.cx[i - 1] + K.ds[i - 1] * Math.cos(a);
      K.cy[i] = K.cy[i - 1] + K.ds[i - 1] * Math.sin(a);
    }
    for (let i = m - 1; i >= 0; i--) {
      const a = K.phi0[i] + 0.5 * (ang[i] + ang[i + 1]);
      K.cx[i] = K.cx[i + 1] - K.ds[i] * Math.cos(a);
      K.cy[i] = K.cy[i + 1] - K.ds[i] * Math.sin(a);
    }
    for (let i = 0; i < N; i++) { K.cos[i] = Math.cos(ang[i]); K.sin[i] = Math.sin(ang[i]); }
    K.identidad = false;
    this._subirCurva(K);
  }

  _subirCurva(K) {
    const N = CURVA_N, d = K.datos;
    for (let i = 0; i < N; i++) {
      d.set([K.cx[i], K.cy[i], K.c0x[i], K.c0y[i]], i * 4);
      d.set([K.cos[i], K.sin[i], 0, 0], (N + i) * 4);
    }
    K.tex.needsUpdate = true;
  }

  /** main.js la apaga durante la medición (las neuronas quedan en su lugar real) y la vuelve a encender. */
  setSwim(on) { this.swim.target = on && this.swim.enabled ? 1 : 0; this.requestRender(); }
  setSwimEnabled(v) { this.swim.enabled = v && !this.reducedMotion; this.setSwim(v); }

  /** Deforma p (escena) igual que wormDeform del shader: para picking, etiquetas y cámara. Modifica p y lo devuelve. */
  deform(p) {
    const K = this._curva;
    if (K.identidad) return p;
    const u = Math.min(1, Math.max(0, (p.x - K.x0) / (K.x1 - K.x0))) * (CURVA_N - 1);
    const i = Math.min(Math.floor(u), CURVA_N - 2), f = u - i;
    const L = (A) => A[i] + (A[i + 1] - A[i]) * f;
    let rc = L(K.cos), rs = L(K.sin);
    const n = Math.hypot(rc, rs) || 1;
    rc /= n; rs /= n;
    const ox = p.x - L(K.c0x), oy = p.y - L(K.c0y);
    p.x = L(K.cx) + rc * ox - rs * oy;
    p.y = L(K.cy) + rs * ox + rc * oy;
    return p;
  }

  _animateSwim(dt) {
    const S = this.swim, U = this.swimU, M = this.motion, T = this.motionT;
    if (this._actuar) this._actuar.update(dt);
    let moving = false;
    const rapido = this._actuar?.vuelta ? 3 : 1; // la vuelta al reposo es más corta que la conducta
    for (const k in M) {
      const d = T[k] - M[k];
      if (d === 0) continue;
      moving = true;
      M[k] = Math.abs(d) < 0.01 ? T[k] : M[k] + d * Math.min(1, (rapido * dt) / MOTION_TAU[k]);
    }
    // el nado libre se detiene en reposo y en calidad "baja"; una conducta en curso siempre se anima
    const libre = !this._reposo && QUALITY[this.quality].nadoLibre !== false;
    const objetivo = this._actuar || libre ? S.target : 0;
    const quieto = !this._actuar && !moving && objetivo === 0 && S.level === 0 && this._enReposo();
    if (quieto) return false;
    S.level += Math.sign(objetivo - S.level) * Math.min(Math.abs(objetivo - S.level), dt / S.rampa);
    const e = S.level * S.level * (3 - 2 * S.level);
    U.uSwimT.value += dt;
    this._fase += M.dir * M.freq * SWIM_W * dt * e;
    // reptar mueve al gusano: hacia adelante la comida se acerca, en reversa se aleja (y el fondo fluye)
    if (this.comida?.estado === "nadando") this.comida.objetivo -= COMIDA_NADO * M.dir * M.freq * dt * e;
    if (this._driveT > 0 && S.level > 0) {
      this._driveT -= dt;
      if (this._driveT <= 0) Object.assign(T, { dir: 1, freq: 1 }); // vuelve al avance, lo normal del gusano
    }
    this._writeMotion(e);
    return true;
  }

  _writeMotion(e) {
    const U = this.swimU, M = this.motion;
    const aw = KAPPA_NADO * e * M.amp, t = U.uSwimT.value, fase = this._fase;
    const fs = this._flexS, fw = this._flexW, rs = this._relajaS;
    if (aw === 0 && M.cabeza === 0 && M.flex === 0 && M.bend === 0 && M.giro === 0) this._integrarCurva(null);
    else this._integrarCurva((s) => {
      let k = aw * Math.sin((2 * Math.PI * s) / LAMBDA - fase);
      if (M.relaja) { const g = (s - rs) / 0.12; k *= 1 - M.relaja * Math.exp(-g * g); }
      if (M.cabeza) { const h = Math.max(0, 1 - s / 0.22); k += M.cabeza * K_CABEZA * h * h * Math.sin(t * 5); }
      if (M.flex) { const g = (s - fs) / fw; k += M.flex * K_FLEX * Math.exp(-g * g); }
      if (M.giro) { const h = Math.max(0, 1 - s / 0.3); k += M.giro * K_GIRO * h * h; } // la cabeza hacia la comida
      return k + M.bend; // el giro omega: curvatura uniforme (total M.bend rad a lo largo del cuerpo)
    });
    U.uBrillo.value = M.brillo;
    // bombeo de la faringe: ~4 por segundo (el gusano real llega a ~250 por minuto)
    this._pumpU.value = 0.035 * M.bombeo * (0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * U.uSwimT.value));
  }

  _enReposo() {
    const M = this.motion;
    return M.amp === 1 && M.cabeza === 0 && M.flex === 0 && M.relaja === 0 && M.bend === 0 && M.bombeo === 0 && M.brillo === 1 &&
      M.giro === 0;
  }

  // -------------------------------------------------------------- conducta
  /**
   * El gusano actúa la conducta de una neurona (evento de js/conducta.js, Motor.aplicar).
   * `indice` ubica la flexión local a lo largo del cuerpo. Devuelve una promesa que se resuelve cuando
   * empieza la vuelta al reposo; inmediata si no hay movimiento (prefers-reduced-motion, nado
   * desactivado o lienzo oculto).
   */
  /** ¿Se puede animar una conducta ahora? (no con prefers-reduced-motion, nado apagado o lienzo oculto) */
  get puedeActuar() { return !this.reducedMotion && this.swim.enabled && this._running && !!this.positions; }

  actuar(ev, indice = -1, { dur = 1.6 } = {}) {
    this._endActuar();
    if (!ev || !this.puedeActuar) return Promise.resolve();
    const T = this.motionT;
    const s = indice >= 0 ? this._sDeX(this.positions[indice].x) : 0.5;
    const atras = ev.d < -0.25;
    Object.assign(T, MOTION_REPOSO, { dir: atras ? -1 : 1, amp: 0 });
    const omega = { amp: 0.35, freq: 1, bend: -1.6 * Math.PI };
    switch (ev.programa) {
      case "reversa": Object.assign(T, { dir: -1, freq: 1.8, amp: 3 }); break;
      case "avance": Object.assign(T, { dir: 1, freq: 1.8, amp: 2.6 }); break;
      case "tendencia": Object.assign(T, { freq: 1.2, amp: 1.6 }); break;
      case "escape": Object.assign(T, { dir: -1, freq: 1.8, amp: 3 }); dur *= 1.6; break;
      case "omega": Object.assign(T, omega, { bend: Math.sign(ev.lado || -1) * 1.6 * Math.PI }); dur *= 1.25; break;
      case "cabeza": T.cabeza = 0.8; break;
      case "flexion": T.flex = 0.8 * (ev.lado || 1); this._flexS = s; this._flexW = 0.09; break;
      case "relajar": Object.assign(T, { amp: 2, relaja: 1 }); this._relajaS = s; break;
      case "bombeo": T.bombeo = 1; break;
      case "puesta": T.flex = -0.25; this._flexS = this._sDeX(this.vulva().x); this._flexW = 0.05; this._ponerHuevo(); break;
      case "quietud": T.brillo = 0.55; break;
      case "olfato": Object.assign(T, { freq: 1.2, amp: 1.4, giro: 0.9 * this._ladoComida() }); this._olor(); break;
      default: break;
    }
    this.acercarComida(ev.entrada?.empuje ?? 0);
    this.swim.rampa = 0.4;
    this.swim.target = 1;
    this.requestRender();
    return new Promise((resolve) => {
      const A = { t: 0, dur, ev, resolve, vuelta: false, giro: false };
      A.update = (dt) => {
        A.t += dt;
        if (ev.programa === "escape" && !A.giro && A.t > 0.55 * A.dur) { A.giro = true; Object.assign(T, omega); }
        if (this._huevo) {
          const u = Math.min(1, Math.max(0, (A.t - 0.4) / (A.dur - 0.4)));
          this._huevo.position.y = this._huevo.userData.y0 - 0.9 * u;
          this._huevo.material.uniforms.uK.value = 0.9 * Math.sin(Math.PI * u);
        }
        if (!A.vuelta && A.t >= A.dur) {
          A.vuelta = true;
          Object.assign(T, MOTION_REPOSO, { dir: T.dir });
          this.swim.target = 0;
          // la cascada sigue ya: el colapso siguiente ondula con el mismo shader que el cuerpo, así que
          // no hace falta esperar a que la vuelta al reposo termine del todo
          A.resolve();
        }
        if (A.vuelta && this.swim.level === 0 && this._enReposo()) this._endActuar();
      };
      this._actuar = A;
    });
  }

  /** Termina la conducta en curso ya mismo: todo vuelve al reposo y se resuelve la promesa. */
  _endActuar() {
    const A = this._actuar;
    if (!A) return;
    this._actuar = null;
    Object.assign(this.motion, MOTION_REPOSO, { dir: this.motion.dir });
    Object.assign(this.motionT, MOTION_REPOSO, { dir: this.motion.dir });
    Object.assign(this.swim, { level: 0, target: 0, rampa: 0.9 });
    this._writeMotion(0);
    this._quitarHuevo();
    this.requestRender();
    A.resolve();
  }

  /** Tras la cascada, el nado libre sigue el impulso final: si quedó hacia atrás, retrocede unos segundos. */
  setDrive(d) {
    if (this._actuar) return;
    const atras = d < -0.3;
    Object.assign(this.motionT, { dir: atras ? -1 : 1, freq: atras ? 1.4 : 1 });
    this._driveT = atras ? 4 : 0;
  }

  /** Centro del lazo del giro omega (la curva ventral de actuar), para encuadrarlo entero. */
  centroOmega() {
    // curvatura uniforme −1.6π a lo largo de L: círculo de radio L/1.6π, del lado ventral de la mitad del cuerpo
    const K = this._curva, m = CURVA_N >> 1, R = K.L / (1.6 * Math.PI), a = K.phi0[m];
    return new THREE.Vector3(K.c0x[m] + R * Math.sin(a), K.c0y[m] - R * Math.cos(a), 0);
  }

  /** La vulva: cara ventral del cuerpo, a mitad del largo (en reposo). */
  vulva() {
    if (this._vulvaDatos && this.center) return this.dataToScene(...this._vulvaDatos);
    const K = this._curva, x = (K.x0 + K.x1) / 2;
    let cy = 0, cz = 0, r = 0.8;
    if (this._linea) [cy, cz, r] = this._linea(x);
    else if (this.bodyBox) { cy = (this.bodyBox.min.y + this.bodyBox.max.y) / 2; r = (this.bodyBox.max.y - this.bodyBox.min.y) / 2; }
    return new THREE.Vector3(x, cy - 0.85 * r, cz);
  }

  /** Un huevo sale por la vulva. */
  _ponerHuevo() {
    const egg = this._huevoFx;
    if (!egg) return;
    egg.position.copy(this.vulva());
    egg.userData.y0 = egg.position.y;
    egg.material.uniforms.uK.value = 0;
    egg.visible = true;
    this._huevo = egg;
  }

  _quitarHuevo() {
    if (!this._huevo) return;
    this._huevo.visible = false;
    this._huevo = null;
  }


  // -------------------------------------------------------------- bacterias
  /** Bacterias de decoración (un InstancedMesh, animado en el shader) y la bacteria comida. */
  _initBacterias() {
    if (this._bact || !this.bodyBox) return;
    const K = this._curva, bb = this.bodyBox;
    const x0 = K.x0 - 9, x1 = K.x1 + 7; // caja donde derivan (envuelve en x: el fondo fluye sin fin)
    const geo = new THREE.CapsuleGeometry(0.045, 0.13, 3, 8);
    geo.rotateZ(Math.PI / 2); // bastón a lo largo de x
    const n = N_BACTERIAS;
    const color = new Float32Array(n * 3), fase = new Float32Array(n);
    const verde = [new THREE.Color("#39ff7a"), new THREE.Color("#7dff5c"), new THREE.Color("#2bffb0")];
    const magenta = new THREE.Color("#ff3df0");
    const mesh = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uT: this.swimU.uSwimT, uFlujo: { value: 0 }, uCaja: { value: new THREE.Vector2(x0, x1) }, uK: { value: 0.55 } },
      vertexShader: /* glsl */`
        uniform float uT; uniform float uFlujo; uniform vec2 uCaja;
        attribute vec3 aColor; attribute float aFase;
        varying vec3 vColor; varying float vBrillo; varying vec3 vN; varying vec3 vV;
        mat3 rotar(vec3 e){
          float a = e.x, b = e.y, c = e.z;
          mat3 rx = mat3(1., 0., 0., 0., cos(a), sin(a), 0., -sin(a), cos(a));
          mat3 ry = mat3(cos(b), 0., -sin(b), 0., 1., 0., sin(b), 0., cos(b));
          mat3 rz = mat3(cos(c), sin(c), 0., -sin(c), cos(c), 0., 0., 0., 1.);
          return rz * ry * rx;
        }
        void main(){
          // cada bacteria gira despacio sobre sí misma (tumbling) y deriva con un vaivén browniano suave
          vec3 e = vec3(aFase * 6.2832, aFase * 13.7, aFase * 29.1) + uT * vec3(0.21, 0.33, 0.17) * (0.5 + fract(aFase * 7.3));
          mat3 r = rotar(e);
          vec3 centro = (modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.)).xyz;
          centro += vec3(uFlujo + 0.25 * sin(uT * 0.31 + aFase * 10.0), 0.16 * sin(uT * 0.23 + aFase * 17.0),
                         0.16 * cos(uT * 0.19 + aFase * 13.0));
          centro.x = uCaja.x + mod(centro.x - uCaja.x, uCaja.y - uCaja.x);
          float esc = length(instanceMatrix[0].xyz);
          vec4 w = vec4(centro + r * (position * esc), 1.0);
          vec4 mv = viewMatrix * w;
          vN = normalize(mat3(viewMatrix) * (r * normal)); vV = normalize(-mv.xyz);
          vColor = aColor;
          vBrillo = 0.65 + 0.35 * sin(uT * 1.1 + aFase * 40.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: BACT_GLSL_FRAG,
    }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      // fuera del cuerpo: se descartan los puntos que caen dentro del gusano
      let tries = 0;
      do {
        v.set(x0 + Math.random() * (x1 - x0), -4 + Math.random() * 8, -6 + Math.random() * 9);
        tries++;
      } while (tries < 10 && v.x > bb.min.x - 0.3 && v.x < bb.max.x + 0.3 && Math.abs(v.y) < 1.2 && Math.abs(v.z) < 1.2);
      const k = 0.7 + Math.random() * 0.7;
      m.compose(v, q, sc.set(k, k, k));
      mesh.setMatrixAt(i, m);
      (Math.random() < 0.18 ? magenta : verde[i % 3]).toArray(color, i * 3);
      fase[i] = Math.random();
    }
    geo.setAttribute("aColor", new THREE.InstancedBufferAttribute(color, 3));
    geo.setAttribute("aFase", new THREE.InstancedBufferAttribute(fase, 1));
    mesh.frustumCulled = false; // se mueven en el shader
    this.scene.add(mesh);
    this._bact = mesh;

    // la comida: una bacteria más grande y brillante, con un halo que late (más cuando el gusano la "huele")
    const g = new THREE.Group();
    const cuerpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.2, 4, 12).rotateZ(Math.PI / 2), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uK: { value: 1 }, uColor: { value: new THREE.Color("#b6ff3d").multiplyScalar(1.6) } },
      vertexShader: /* glsl */`
        uniform vec3 uColor;
        varying vec3 vColor; varying float vBrillo; varying vec3 vN; varying vec3 vV;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          vColor = uColor; vBrillo = 1.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: BACT_GLSL_FRAG,
    }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), new THREE.MeshBasicMaterial({
      color: new THREE.Color("#7dff5c"), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false }));
    const ola = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.34, 48), new THREE.MeshBasicMaterial({
      color: new THREE.Color("#b6ff3d"), transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    g.add(cuerpo, halo, ola);
    this.scene.add(g);
    this._comidaFx = { g, cuerpo, halo, ola };
    // la boca: punta de la cabeza (en reposo); deform() la mueve con el cuerpo
    const [cy, cz] = this._linea ? this._linea(K.x0 + 0.02) : [0, 0];
    this._boca0 = new THREE.Vector3(K.x0, cy, cz);
    this._nuevaComida(true);
  }

  /** Aparece una bacteria comida nueva delante de la boca (a la izquierda: la cabeza mira hacia −x). */
  _nuevaComida(primera = false) {
    const [a, b] = COMIDA_DIST;
    const d = primera ? b : a + Math.random() * (b - a);
    this.comida = {
      estado: "nadando", dist: d, objetivo: d, t: 0, olor: 0, aparecer: 0,
      y: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.9), z: -0.6 + Math.random() * 1.2,
      giro: Math.random() * Math.PI,
    };
    this._flujoPrev = d;
    this.requestRender();
  }

  /** Lado de la comida respecto de la boca (+1 arriba, −1 abajo): hacia dónde gira la cabeza al olerla. */
  _ladoComida() { return this.comida && this.comida.y < 0 ? -1 : 1; }

  /** Una neurona química "olió" la comida: el halo late y una onda va de la bacteria hacia la cabeza. */
  _olor() { if (this.comida) { this.comida.olor = 1; this.requestRender(); } }

  /** Empuje de una neurona (js/conducta.js): hacia adelante la comida se acerca; hacia atrás, se aleja. */
  acercarComida(empuje) {
    const C = this.comida;
    if (!C || C.estado !== "nadando" || !empuje) return;
    C.objetivo = Math.min(COMIDA_DIST[1] + 1.5, C.objetivo - COMIDA_EMPUJE * empuje);
    if (this.reducedMotion) C.dist = C.objetivo;
    this.requestRender();
  }

  /** Mueve la comida (y el fondo de bacterias), la come al llegar a la boca y hace aparecer otra. */
  _animateComida(dt) {
    const C = this.comida, F = this._comidaFx;
    if (!C || !F) return false;
    let mueve = false;
    // la distancia sigue a su objetivo (suave); el fondo fluye lo mismo que se acercó la comida
    const dd = C.objetivo - C.dist;
    if (Math.abs(dd) > 1e-4) {
      C.dist += dd * Math.min(1, dt * 1.6);
      if (Math.abs(dd) > 0.02) mueve = true; // el acercamiento lento del reptar va al ritmo del nado (30 fps)
    }
    this._bact.material.uniforms.uFlujo.value += this._flujoPrev - C.dist;
    this._flujoPrev = C.dist;
    if (C.olor > 0) { C.olor = Math.max(0, C.olor - dt / 1.6); mueve = true; }
    if (C.aparecer < 1) { C.aparecer = Math.min(1, C.aparecer + dt / 0.8); mueve = true; }
    C.t += dt;
    // posición: delante de la boca; el desvío lateral se cierra al acercarse (la cabeza la alcanza)
    const boca = this.deform(this._tmpVec2.copy(this._boca0));
    const lat = Math.min(1, Math.max(0, C.dist) / 1.6);
    const pos = F.g.position.set(boca.x - Math.max(0, C.dist), boca.y + C.y * lat, boca.z + C.z * lat);
    if (C.estado === "nadando" && C.dist <= 0.12) {
      C.estado = "comiendo";
      C.t = 0;
      this.callbacks.comer();
      // la faringe bombea mientras traga (si no hay otra conducta en curso)
      if (!this._actuar) { this.motionT.bombeo = 1; this.swim.target = 1; setTimeout(() => { if (!this._actuar) this.motionT.bombeo = 0; }, 1600); }
    }
    let k = C.aparecer;
    if (C.estado === "comiendo") {
      const u = Math.min(1, C.t / 0.7);
      pos.lerp(boca, u);
      k *= 1 - u;
      mueve = true;
      if (C.t > 1.8) this._nuevaComida();
    }
    const late = 0.5 + 0.5 * Math.sin(C.t * 2.4);
    F.cuerpo.rotation.set(0, 0, C.giro + 0.25 * Math.sin(C.t * 0.6));
    F.cuerpo.material.uniforms.uK.value = k * (0.9 + 0.3 * late + 0.8 * C.olor);
    F.cuerpo.scale.setScalar(Math.max(0.05, k));
    F.halo.material.opacity = k * (0.08 + 0.06 * late + 0.25 * C.olor);
    F.halo.scale.setScalar(0.8 + 0.4 * late + 1.4 * C.olor);
    // onda del olor: un anillo que se abre desde la bacteria (lo que "huele" la neurona química)
    F.ola.material.opacity = 0.6 * C.olor * k;
    F.ola.scale.setScalar(1 + 6 * (1 - C.olor));
    F.ola.lookAt(this.camera.position);
    return mueve;
  }

  /** Aplica la onda del nado a un material estándar de three.js (neuronas, sinapsis, anillos, láser…). */
  _sw(mat) {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.swimU);
      sh.vertexShader = SWIM_GLSL + sh.vertexShader.replace("#include <project_vertex>", PROJECT_SWIM);
    };
    mat.customProgramCacheKey = () => "swim";
    return mat;
  }

  /** Material de brillo (aditivo, sin tone mapping) que ondula con el nado. */
  _glow(color, opacity, extra = {}) {
    return this._sw(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, ...extra }));
  }

  // --------------------------------------------------------------- resaltes
  /** Anillos sobre las neuronas `indices` (la ventana medida); también las agranda un poco. */
  setHighlight(indices) {
    const antes = [...this.highlight];
    this.highlight = new Set(indices);
    this.ringGroup.clear();
    // geometría y material compartidos por todos los anillos (se crean una sola vez)
    this._ringGeo ??= new THREE.RingGeometry(0.13, 0.16, 32);
    this._ringMat ??= this._sw(new THREE.MeshBasicMaterial({ color: "#3df0ff", transparent: true, opacity: 0.7,
      side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
    for (const i of indices) {
      const m = new THREE.Mesh(this._ringGeo, this._ringMat);
      m.position.copy(this.positions[i]);
      this.ringGroup.add(m);
    }
    // sólo cambian de tamaño las que entran o salen del resaltado
    const cambian = [...antes, ...indices];
    if (this.activity !== undefined && cambian.length) this._pintar(this.activity, cambian, this._aristasDeVentana(cambian));
    this.requestRender();
  }

  /** Rastro de la cascada: línea que une los centros sucesivos (índices de neuronas). */
  setTrail(indices) {
    if (!this.trail) return;
    const n = indices ? Math.min(indices.length, RASTRO_MAX) : 0;
    const pos = this.trail.geometry.attributes.position;
    // si la cadena es más larga que el lugar reservado se muestran los últimos RASTRO_MAX centros
    const desde = indices ? indices.length - n : 0;
    for (let k = 0; k < n; k++) { const p = this.positions[indices[desde + k]]; pos.setXYZ(k, p.x, p.y, p.z); }
    pos.needsUpdate = true;
    this.trail.geometry.setDrawRange(0, n);
    this.trail.geometry.computeBoundingSphere();
    this._rastroN = n;
    this.trail.visible = n >= 2;
    this.requestRender();
  }

  _buildLabel() {
    this.labelEl = document.createElement("div");
    this.labelEl.className = "neuron-label"; // el estilo (retícula incluida) está en main.css
    this.labelEl.setAttribute("aria-hidden", "true");
    this.container.appendChild(this.labelEl);
    this.labelIndex = -1;
  }

  setLabel(index, text) { this.labelIndex = index; this.labelEl.textContent = text ?? ""; this.requestRender(); }

  // ---------------------------------------------------------------- actividad
  /** Brillo de cada neurona (0..1): reescribe todas las neuronas y sinapsis. */
  setActivity(values) {
    this._pintar(values, null, null);
  }

  /** Sinapsis que tocan alguna de estas neuronas (sin repetir). */
  _aristasDeVentana(neuronas) {
    const vistas = new Set();
    for (const i of neuronas) for (const k of this._aristasDe[i]) vistas.add(k);
    return [...vistas];
  }

  /**
   * Escribe colores y tamaños. Con `neuronas` (y `aristas`) sólo esas: el colapso cambia 10 neuronas
   * por cuadro y no hace falta reescribir las 302 ni todas las sinapsis.
   */
  _pintar(values, neuronas, aristas) {
    this.activity = values;
    const col = this.mesh.instanceColor.array;
    const M = this._tmpMat.elements;
    const n = neuronas ? neuronas.length : this.neurons.length;
    for (let j = 0; j < n; j++) {
      const i = neuronas ? neuronas[j] : j;
      const v = values ? values[i] : 0;
      const base = this.baseColors[i];
      let r, g, b, s;
      if (v > 0.015) {
        const li = lutIndex(v);
        const boost = 0.45 + 1.7 * v;
        const mix = Math.max(0, 0.25 - v);
        r = LUT[li] * boost * (1 - mix) + base.r * mix;
        g = LUT[li + 1] * boost * (1 - mix) + base.g * mix;
        b = LUT[li + 2] * boost * (1 - mix) + base.b * mix;
        s = 1 + 2.4 * Math.sqrt(v);
      } else {
        r = base.r * 0.33; g = base.g * 0.33; b = base.b * 0.33; s = 1;
      }
      if (this.highlight.has(i)) s *= 1.15;
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
      const p = this.positions[i];
      this._tmpMat.identity();
      M[0] = s; M[5] = s; M[10] = s; M[12] = p.x; M[13] = p.y; M[14] = p.z;
      this.mesh.setMatrixAt(i, this._tmpMat);
    }
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;

    if (this.edgeVisible) this._updateEdges(values, aristas);
    this.requestRender();
  }

  _updateEdges(values, aristas = null) {
    const ec = this.edgeLines.geometry.attributes.color.array;
    const A = this.edgeA, B = this.edgeB, W = this.edgeW;
    const n = aristas ? aristas.length : A.length;
    for (let j = 0; j < n; j++) {
      const k = aristas ? aristas[j] : j;
      const act = values ? Math.sqrt(values[A[k]] * values[B[k]]) : 0;
      const base = 0.25 + 0.75 * W[k];
      const li = lutIndex(0.45 + 0.55 * act);
      const k2 = act * base * 0.55;
      const r = 0.025 * base + LUT[li] * k2, g = 0.04 * base + LUT[li + 1] * k2, b = 0.09 * base + LUT[li + 2] * k2;
      const o = k * 6;
      ec[o] = r; ec[o + 1] = g; ec[o + 2] = b; ec[o + 3] = r; ec[o + 4] = g; ec[o + 5] = b;
    }
    this.edgeLines.geometry.attributes.color.needsUpdate = true;
  }

  setEdgesVisible(v) {
    this.edgeVisible = v;
    if (this.edgeLines) {
      this.edgeLines.visible = v;
      if (v) this._updateEdges(this.activity);
    }
    this.requestRender();
  }

  // ------------------------------------------------------------- efectos reutilizables
  /**
   * Láser, colapso, rastro y huevo se crean UNA vez y se reutilizan (visibilidad, opacidad, escala).
   * Crear y destruir sus materiales en cada paso hacía que three.js liberara y recompilara sus shaders:
   * un tirón por paso. _initFx los compila por adelantado (renderer.compile) mientras carga la página.
   */
  _initFx() {
    const dosCaras = { side: THREE.DoubleSide };
    const grupo = () => { const g = new THREE.Group(); g.visible = false; this.scene.add(g); return g; };
    const mesh = (g, geo, color, op, extra) => { const m = new THREE.Mesh(geo, this._glow(color, op, extra)); g.add(m); return m; };
    // láser: cilindros de altura 1 (se escalan al largo del haz), destello y onda
    const cil = (r) => new THREE.CylinderGeometry(r, r * 0.6, 1, 12, 1, true);
    const gl = grupo();
    this._laserFx = {
      grupo: gl,
      glow: mesh(gl, cil(0.07), new THREE.Color("#4da3ff").multiplyScalar(1.6), 0),
      core: mesh(gl, cil(0.014), new THREE.Color("#e8f4ff").multiplyScalar(2), 0),
      flash: mesh(gl, new THREE.SphereGeometry(0.3, 16, 12), new THREE.Color("#7cc4ff").multiplyScalar(3), 0),
      ring: mesh(gl, new THREE.RingGeometry(0.2, 0.24, 48), new THREE.Color("#4da3ff").multiplyScalar(2.5), 0, dosCaras),
    };
    // colapso: halos (crecen si una ventana trae más neuronas), partículas, destello y anillo
    const gc = grupo();
    const pts = new THREE.Points(new THREE.BufferGeometry(), this._sw(new THREE.PointsMaterial({
      color: new THREE.Color("#ffb08a").multiplyScalar(1.6), size: 0.11, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
    pts.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PARTICULAS_POR_NEURONA * 10 * 3), 3));
    gc.add(pts);
    const haloGeo = new THREE.SphereGeometry(0.22, 18, 12);
    this._collapseFx = {
      grupo: gc, pts, halos: [],
      halo: (i) => (this._collapseFx.halos[i] ??= mesh(gc, haloGeo, new THREE.Color("#38e1ff").multiplyScalar(1.3), 0)),
      flash: mesh(gc, new THREE.SphereGeometry(0.3, 18, 12), new THREE.Color("#ff6a2b").multiplyScalar(2.6), 0),
      ring: mesh(gc, new THREE.RingGeometry(0.24, 0.29, 48), new THREE.Color("#ff6a2b").multiplyScalar(2.2), 0, dosCaras),
    };
    this._collapseFx.halo(0); // uno basta para compilar su shader; el resto comparte el programa
    // rastro: una línea con lugar para RASTRO_MAX centros (drawRange muestra los usados)
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RASTRO_MAX * 3), 3));
    this.trail = new THREE.Line(tg, this._sw(new THREE.LineBasicMaterial({ color: new THREE.Color("#ff6a2b").multiplyScalar(1.5),
      transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false })));
    this.trail.visible = false;
    this.scene.add(this.trail);
    // huevo (conducta "puesta"): mismo aspecto de microscopio que el cuerpo; uK hace el fundido
    this._huevoFx = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16),
      this._bodyMaterial({ color: "#3fd1b0", rim: "#d8fff4", strength: 0, fill: 0.35, grain: 0.35 }));
    this._huevoFx.scale.set(0.45, 0.3, 0.3); // ~55 × 35 µm, como un huevo real
    this._huevoFx.visible = false;
    this.scene.add(this._huevoFx);
    // compilar los shaders por adelantado y sin bloquear la página (compileAsync); mientras tanto los
    // efectos quedan "visibles" con opacidad 0, y al terminar se ocultan los que no estén en uso
    const efectos = [gl, gc, this.trail, this._huevoFx];
    efectos.forEach((o) => { o.visible = true; });
    const ocultar = () => {
      gl.visible = !!this.laser;
      gc.visible = !!this._collapse;
      this.trail.visible = this._rastroN >= 2;
      this._huevoFx.visible = !!this._huevo;
      this.requestRender();
    };
    if (this.renderer.compileAsync) this.renderer.compileAsync(this.scene, this.camera).then(ocultar, ocultar);
    else ocultar();
  }

  // ------------------------------------------------------------------- láser
  fireLaser(index, intensity = 1) {
    this._removeLaser();
    if (!this._running || !this._laserFx) return; // no se ve: no hay nada que animar
    const L = this._laserFx, target = this.positions[index];
    const from = this._tmpVec.copy(target).add(LASER_DESDE);
    const dir = this._tmpVec2.copy(target).sub(from);
    const len = dir.length();
    const medio = from.addScaledVector(dir, 0.5);
    dir.normalize();
    for (const m of [L.glow, L.core]) {
      m.position.copy(medio);
      m.quaternion.setFromUnitVectors(Y_UP, dir);
      m.scale.set(1, len, 1);
    }
    L.flash.position.copy(target);
    L.ring.position.copy(target);
    for (const m of L.grupo.children) m.material.opacity = 0;
    L.grupo.visible = true;
    this.laser = { t: 0, intensity };
    this.requestRender();
  }

  _animateLaser(dt) {
    const L = this.laser;
    if (!L) return false;
    const F = this._laserFx;
    L.t += dt;
    const on = Math.min(1, L.t / 0.15) * Math.max(0, 1 - Math.max(0, L.t - 0.9) / 0.6);
    const k = 0.35 + 0.65 * L.intensity;
    const flicker = this.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(L.t * 40);
    F.glow.material.opacity = 0.35 * on * k * flicker;
    F.core.material.opacity = 0.95 * on * k;
    F.flash.material.opacity = 0.8 * on * k;
    F.flash.scale.setScalar(0.6 + 0.4 * Math.sin(Math.min(L.t, 1.2) * 6));
    F.ring.scale.setScalar(1 + L.t * 5);
    F.ring.material.opacity = Math.max(0, 0.9 - L.t * 0.7);
    F.ring.lookAt(this.camera.position);
    if (L.t > 1.6) this._removeLaser();
    return true;
  }

  _removeLaser() {
    if (!this.laser) return;
    this.laser = null;
    this._laserFx.grupo.visible = false;
    this.requestRender();
  }

  // ---------------------------------------------------------- medición (colapso)
  /**
   * Animación de la medida de un paso de la cascada.
   *  fase 1 (superposición): las neuronas de la ventana laten juntas, con halos ∝ √p;
   *  fase 2 (colapso): partículas viajan desde cada neurona hasta la que salió en 1, los demás
   *  halos se apagan y la elegida destella. Si no hubo spike (vacío), todo se desvanece.
   * Devuelve una promesa que se resuelve al terminar (inmediata con prefers-reduced-motion).
   */
  collapse(ventana, probs, spikeIdx, { superposition = T_SUPERPOSICION, collapse = T_COLAPSO } = {}) {
    this._endCollapse();
    if (this.reducedMotion || !this._running || !this.positions || !ventana?.length || !this._collapseFx) {
      return Promise.resolve();
    }
    const F = this._collapseFx, nv = ventana.length;
    const tot = probs.reduce((a, b) => a + Math.max(0, b), 0) || 1;
    const peso = ventana.map((_, i) => Math.sqrt(Math.max(0, probs[i]) / tot)); // √p
    const pmax = Math.max(...peso, 1e-9);
    const rel = peso.map((w) => 0.35 + 0.65 * w / pmax); // brillo relativo de cada neurona
    F.halos.forEach((h) => { h.visible = false; });
    const halos = ventana.map((g, i) => {
      const h = F.halo(i);
      h.position.copy(this.positions[g]);
      h.userData = { r: 0.35 + 1.25 * peso[i] / pmax, ph: i * 0.7 };
      h.material.opacity = 0;
      h.visible = true;
      return h;
    });
    // partículas: más cuanto más probable era cada neurona
    const starts = [];
    ventana.forEach((g, i) => {
      const n = Math.round(3 + (PARTICULAS_POR_NEURONA - 3) * (peso[i] / pmax) ** 2);
      for (let k = 0; k < n; k++) {
        const j = new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3);
        starts.push({ from: this.positions[g].clone().add(j), delay: Math.random() * 0.25 });
      }
    });
    let pp = F.pts.geometry.attributes.position;
    if (starts.length > pp.count) { // ventana más grande que lo previsto: el búfer crece una vez
      pp = new THREE.BufferAttribute(new Float32Array(starts.length * 3), 3);
      F.pts.geometry.setAttribute("position", pp);
    }
    F.pts.geometry.setDrawRange(0, starts.length);
    F.pts.material.opacity = 0;
    // destello final sobre la neurona medida
    const target = spikeIdx != null ? this.positions[spikeIdx] : null;
    for (const m of [F.pts, F.flash, F.ring]) {
      m.visible = !!target;
      m.material.opacity = 0;
      if (m !== F.pts) { m.scale.setScalar(1); if (target) m.position.copy(target); }
    }
    F.grupo.visible = true;

    // sólo cambian las neuronas de la ventana: el resto queda atenuado una vez y no se reescribe
    const N = this.neurons.length;
    const vals = new Float32Array(N);
    if (this.activity) for (let i = 0; i < N; i++) vals[i] = 0.35 * this.activity[i];
    this.setActivity(vals);
    const aristas = this._aristasDeVentana(ventana); // se calcula una vez, no en cada cuadro
    return new Promise((resolve) => {
      this._collapse = {
        t: 0, T1: superposition, resolve,
        update: (dt) => {
          const C = this._collapse;
          C.t += dt;
          const T1 = C.T1, t = C.t, T2 = T1 + collapse, TAIL = 0.45;
          if (t >= T2) {
            // cola: la actividad ya la decide main.js; sólo se apaga el destello
            if (!C.done) { C.done = true; F.pts.visible = false; for (const h of halos) h.visible = false; resolve(); }
            const v = Math.min(1, (t - T2) / TAIL);
            F.flash.material.opacity = 0.9 * (1 - v);
            F.ring.material.opacity = 0.9 * (1 - v);
            F.ring.scale.setScalar(3.5 + 2 * v);
            F.ring.lookAt(this.camera.position);
            if (v >= 1) { this._endCollapse(); return false; }
            return true;
          }
          if (t < T1) {
            // fase 1: superposición (todas a la vez, latiendo)
            const a = Math.min(1, t / 0.25);
            for (let i = 0; i < nv; i++) {
              const beat = 0.75 + 0.25 * Math.sin(t * 9 + halos[i].userData.ph);
              vals[ventana[i]] = Math.min(1, rel[i] * beat * a);
              halos[i].scale.setScalar(halos[i].userData.r * (0.85 + 0.2 * beat));
              halos[i].material.opacity = 0.45 * a * rel[i];
            }
          } else {
            // fase 2: colapso
            const u = Math.min(1, (t - T1) / collapse);
            const fade = 1 - u;
            for (let i = 0; i < nv; i++) {
              const own = ventana[i] === spikeIdx;
              vals[ventana[i]] = own ? Math.min(1, 0.6 + 0.4 * u) : Math.max(0.04, rel[i] * fade * fade);
              halos[i].material.opacity = own ? 0.45 * fade : 0.45 * fade * fade * rel[i];
            }
            if (target) {
              F.pts.material.opacity = Math.min(1, 3 * u) * (u < 0.85 ? 1 : (1 - u) / 0.15);
              for (let k = 0; k < starts.length; k++) {
                const s = starts[k];
                const v = Math.max(0, Math.min(1, (u - s.delay) / (1 - s.delay)));
                const e = v * v * (3 - 2 * v);
                pp.setXYZ(k, s.from.x + (target.x - s.from.x) * e,
                  s.from.y + (target.y - s.from.y) * e + Math.sin(Math.PI * e) * 0.25,
                  s.from.z + (target.z - s.from.z) * e);
              }
              pp.needsUpdate = true;
              const f = Math.max(0, (u - 0.6) / 0.4);
              F.flash.material.opacity = 0.9 * f;
              F.flash.scale.setScalar(0.5 + 0.9 * f);
              F.ring.material.opacity = 0.9 * f;
              F.ring.scale.setScalar(1 + 2.5 * f);
              F.ring.lookAt(this.camera.position);
            }
          }
          this._pintar(vals, ventana, aristas);
          return true;
        },
      };
    });
  }

  _endCollapse() {
    const C = this._collapse;
    if (!C) return;
    this._collapse = null;
    this._collapseFx.grupo.visible = false;
    this.requestRender();
    C.resolve();
  }

  resetView() {
    this._tween = null;
    this.camera.position.set(-1.2, 6.0, 23.5);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.requestRender();
  }

  /** Superposición en curso → pasar ya al colapso (la intro decide cuándo medir). */
  collapseNow() {
    const C = this._collapse;
    if (C && C.t < C.T1) C.t = C.T1;
  }

  /** Corta la animación de medida en curso (su promesa se resuelve). */
  cancelCollapse() { this._endCollapse(); }

  /** Vuelo de cámara (con aceleración) hasta mirar la neurona `index` desde `dist` unidades. */
  flyTo(index, opts) { return this.flyToPoint(this.deform(this.positions[index].clone()), opts); }

  /** Vuelo de cámara hasta mirar el punto `p` (escena) desde `dist` unidades, sin cambiar de lado. */
  flyToPoint(p, { dur = 1200, dist = 6 } = {}) {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    return this._volar(p.clone().addScaledVector(dir, dist).add(new THREE.Vector3(0, dist * 0.18, 0)), p, dur);
  }

  /** Vista actual de la cámara, para volver a ella después de un acercamiento. */
  guardarVista() { return { pos: this.camera.position.clone(), target: this.controls.target.clone() }; }

  volverVista(v, dur = 600) { return v ? this._volar(v.pos, v.target, dur) : Promise.resolve(); }

  /** Vuelve a la vista general. */
  flyHome(dur = 1200) { return this._volar(new THREE.Vector3(-1.2, 6.0, 23.5), new THREE.Vector3(0, 0, 0), dur); }

  _volar(pos, target, dur) {
    if (this.reducedMotion || !this._running) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      this.requestRender();
      return Promise.resolve();
    }
    this._wake();
    return new Promise((resolve) => {
      this._tween?.resolve();
      this._tween = { t: 0, dur: dur / 1000, resolve, p0: this.camera.position.clone(), p1: pos,
        q0: this.controls.target.clone(), q1: target };
    });
  }

  _animateTween(dt) {
    const T = this._tween;
    if (!T) return false;
    T.t += dt;
    const u = Math.min(1, T.t / T.dur), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    this.camera.position.lerpVectors(T.p0, T.p1, e);
    this.controls.target.lerpVectors(T.q0, T.q1, e);
    if (u >= 1) { this._tween = null; T.resolve(); }
    return true;
  }

  /** Modo cine para la pantalla de título: órbita lenta alrededor del gusano. */
  setCinematic(on) {
    if (on) { this._autoRotPrev ??= this.controls.autoRotate; this.controls.autoRotateSpeed = 0.55; }
    this.controls.autoRotate = on ? !this.reducedMotion : (this._autoRotPrev ?? false);
    if (!on) { this.controls.autoRotateSpeed = 0.35; this._autoRotPrev = null; }
    this.requestRender();
  }

  _dolly(f) {
    const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(f);
    const d = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, off.length()));
    this.camera.position.copy(this.controls.target).add(off.setLength(d));
    this.requestRender();
  }

  _orbit(angle) {
    const off = this.camera.position.clone().sub(this.controls.target);
    off.applyAxisAngle(Y_UP, angle);
    this.camera.position.copy(this.controls.target).add(off);
    this.requestRender();
  }

  // ---------------------------------------------------------------- interno
  _addStars() {
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 30 + Math.random() * 60, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: "#5d74b8", size: 0.12, transparent: true,
      opacity: 0.55, depthWrite: false })));
  }

  _bindEvents() {
    if (typeof ResizeObserver === "function") new ResizeObserver(() => this._resize()).observe(this.container);
    else window.addEventListener("resize", () => this._resize());
    if (typeof IntersectionObserver === "function") {
      new IntersectionObserver(([e]) => { this._onScreen = e.isIntersecting; this._updateLoop(); }).observe(this.canvas);
    }
    // el lienzo llena su contenedor: offsetX/Y ya son coordenadas locales (sin getBoundingClientRect)
    const local = (e) => [e.offsetX, e.offsetY];
    this.canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return; // en pantallas táctiles no hay "hover"
      this.pointer = local(e);
      this._pointerMoved = true;
      this.marcarActividad();
      this._wake();
    });
    this.canvas.addEventListener("pointerleave", () => { this.pointer = null; this._pointerMoved = true; this._wake(); });
    let down = null;
    this.canvas.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
    this.canvas.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const [x, y] = local(e);
      const idx = this._pick(x, y, e.pointerType === "mouse" ? 14 : 28); // con el dedo, más margen
      if (idx >= 0) this.callbacks.pick(idx);
    });
    document.addEventListener("visibilitychange", () => this._updateLoop());
    // Teclado (con el foco en el lienzo): el resto lo decide main.js
    this.canvas.addEventListener("keydown", (e) => {
      if (e.key === "r" || e.key === "R") { this.resetView(); e.preventDefault(); return; }
      if (e.key === "+" || e.key === "=") { this._dolly(0.85); e.preventDefault(); return; }
      if (e.key === "-") { this._dolly(1.18); e.preventDefault(); return; }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") { this._orbit(e.key === "ArrowUp" ? -0.12 : 0.12); e.preventDefault(); return; }
      if (this.callbacks.key(e)) e.preventDefault();
    });
  }

  /** Neurona más cercana al puntero en pantalla (≤ radio px). O(302), sin raycasting. */
  _pick(px, py, radio = 14) {
    if (!this.positions) return -1;
    const w = this._w, h = this._h, r2 = radio * radio;
    let best = -1, bestD = r2, bestZ = Infinity;
    for (let i = 0; i < this.positions.length; i++) {
      const p = this._tmpVec.copy(this.positions[i]);
      this.deform(p);
      p.project(this.camera);
      if (p.z > 1) continue;
      const dx = (p.x * 0.5 + 0.5) * w - px, dy = (-p.y * 0.5 + 0.5) * h - py;
      const d = dx * dx + dy * dy;
      if (d < bestD || (d < r2 && Math.abs(d - bestD) < 4 && p.z < bestZ)) { best = i; bestD = d; bestZ = p.z; }
    }
    return best;
  }

  _resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this._w = w; this._h = h; // tamaño en CSS px, cacheado: leerlo en cada cuadro fuerza un reflow
    const Q = QUALITY[this.quality];
    this.container.dataset.calidad = this.quality; // el CSS quita grano y viñeta fuera de "alta"
    const pr = Math.min(Q.pixelRatio(), Math.sqrt(Q.maxPx / (w * h)));
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    if (Q.bloom) this.bloom.setSize(Math.round(w * pr * Q.bloomScale), Math.round(h * pr * Q.bloomScale));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  /**
   * Mide los FPS sólo entre dos cuadros seguidos de animación continua (el nado y la órbita se
   * dibujan a 30 fps a propósito y no dicen nada del equipo). Las muestras se acumulan entre pasos.
   */
  _adaptQuality(dt, continuo) {
    const P = this._perf;
    const valida = continuo && P.previo && dt < 0.5;
    P.previo = continuo;
    if (!this.autoQuality || !valida) return;
    P.frames++;
    P.time += dt;
    if (P.time > 2.0) {
      const fps = P.frames / P.time;
      P.frames = 0; P.time = 0;
      const order = ["alta", "media", "baja"];
      const i = order.indexOf(this.quality);
      if (fps < 28 && i < 2) this.setQuality(order[i + 1], { auto: true });
      // una sola prueba hacia arriba: si "media" va holgada, se pasa a "alta"
      else if (!P.probada && this.quality === "media" && fps >= 50) this.setQuality("alta", { auto: true });
      P.probada = true;
    }
  }

  _tick() {
    const now = performance.now();
    const rawDt = (now - this._last) / 1000;
    this._last = now;
    const dt = Math.min(0.1, rawDt);
    if (!this._reposo && !this.ocupada && now - this._ultimaEntrada > REPOSO_MS) this._reposo = true;
    // "continuo": animación a cuadro completo (vuelo, amortiguación, láser, colapso); el movimiento de
    // ambiente (órbita automática, nado) se dibuja a 30 cuadros por segundo y se detiene en reposo
    let continuo = false;
    const orbita = this.controls.autoRotate && !this.arrastrando && !this._tween;
    if (this._animateTween(dt)) continuo = true;
    if (!orbita && this.controls.update()) continuo = true; // amortiguación tras arrastrar
    if (this._animateLaser(dt)) continuo = true;
    if (this._collapse && this._collapse.update(dt)) continuo = true;
    if (this._animateComida(dt)) continuo = true;
    let active = continuo;
    this._sinceSwim += dt;
    if (this._sinceSwim >= SWIM_FRAME || active || this._dirty) {
      if (orbita && !this._reposo && this.controls.update(this._sinceSwim)) active = true;
      if (this._animateSwim(this._sinceSwim)) active = true;
      this._sinceSwim = 0;
    }

    if (this._pointerMoved) {
      this._pointerMoved = false;
      const idx = this.pointer ? this._pick(this.pointer[0], this.pointer[1]) : -1;
      if (idx !== this.hovered) {
        this.hovered = idx;
        this.canvas.style.cursor = idx >= 0 ? "pointer" : "grab";
      }
      this.callbacks.hover(idx, this.pointer);
    }

    if (!(active || this._dirty)) {
      // nada cambió: no se dibuja; tras ~0.5 s quieto el bucle se detiene del todo (requestRender y la
      // entrada del usuario lo despiertan)
      this._perf.previo = false;
      if (++this._quietos > 30 && !this._pointerMoved) this.renderer.setAnimationLoop((this._loopFn = null));
      return;
    }
    this._quietos = 0;
    this._dirty = false;
    if (this.ringGroup) this.ringGroup.children.forEach((m) => m.quaternion.copy(this.camera.quaternion));
    if (this.labelIndex >= 0 && this.positions) {
      const p = this._tmpVec.copy(this.positions[this.labelIndex]);
      this.deform(p);
      p.project(this.camera);
      const show = p.z < 1;
      if (show !== this._labelShown) { this._labelShown = show; this.labelEl.style.display = show ? "block" : "none"; }
      const x = (p.x * 0.5 + 0.5) * this._w, y = (-p.y * 0.5 + 0.5) * this._h;
      this.labelEl.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -160%)`;
    }
    if (QUALITY[this.quality].bloom) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    this._adaptQuality(rawDt, continuo);
  }
}

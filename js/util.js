// Utilidades compartidas por la página (main.js, js/escena.js, js/intro.js, js/sonido.js).

/** La persona pidió menos movimiento: sin animaciones de intro, vuelos de cámara ni colapsos animados. */
export const REDUCED = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Duración (s) de cada medida: superposición y colapso. La animación 3D (escena.collapse), el sonido
// (sonido.medicion) y el barrido de escaneo (main.js) usan los mismos tiempos.
export const T_SUPERPOSICION = 0.9;
export const T_COLAPSO = 0.75;

/** ¿El foco está en un campo de texto? (las teclas del HUD no deben dispararse mientras se escribe) */
export const escribiendo = (el = document.activeElement) =>
  !!el && (el.matches("input:not([type=range]):not([type=checkbox]):not([type=radio]), select, textarea") || el.isContentEditable);

/** Pantalla táctil como puntero principal (teléfonos, tabletas). */
export const COARSE = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

/** La curva de aceleración del HUD (la misma que --ease en main.css). */
export const EASE = "cubic-bezier(.2, .8, .2, 1)";

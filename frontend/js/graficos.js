// Gráficos SVG livianos (sin dependencias): barras agrupadas y tablas accesibles.
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

export const SERIES_COLORS = {
  exact: "#ffffff",
  backend: "#ffb347",
};

/** Escapa texto para insertarlo en HTML. */
export const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Tabla accesible con los mismos datos de las barras (alternativa textual al gráfico). */
export function dataTable(container, labels, series, caption) {
  container.innerHTML =
    `<table><caption class="sr-only">${esc(caption)}</caption><thead><tr><th scope="col">Neuron</th>` +
    series.map((s) => `<th scope="col">${esc(s.name)}</th>`).join("") + "</tr></thead><tbody>" +
    labels.map((lab, i) => `<tr><th scope="row">${esc(lab)}</th>` +
      series.map((s) => `<td>${(s.values[i] ?? 0).toFixed(3)}</td>`).join("") + "</tr>").join("") +
    "</tbody></table>";
}

/** Barras agrupadas: labels = neuronas, series = [{key, name, values}] */
export function groupedBars(container, labels, series, { height = 170, max = null, highlight = [] } = {}) {
  container.innerHTML = "";
  const many = labels.length > 8;
  const W = 330, padL = 28, padT = 8, padB = many ? 44 : 30, H = height + (many ? 14 : 0);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
    "aria-label": `Bar chart: fire probability per neuron (${series.map((s) => s.name).join(", ")}). The data is in the table.` }, container);
  const ymax = max ?? Math.max(0.05, ...series.flatMap((s) => s.values)) * 1.1;
  const plotW = W - padL - 4, plotH = H - padB - padT;
  const g = el("g", { class: "axis" }, svg);
  [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
    const y = padT + plotH * (1 - f);
    el("line", { x1: padL, x2: W - 4, y1: y, y2: y, "stroke-dasharray": f === 0 ? "" : "2 3" }, g);
    const t = el("text", { x: padL - 5, y: y + 3, "text-anchor": "end" }, g);
    t.textContent = (ymax * f).toFixed(2);
  });
  const groupW = plotW / labels.length;
  const barW = Math.min(9, (groupW - 6) / series.length);
  labels.forEach((lab, i) => {
    const x0 = padL + groupW * i + (groupW - barW * series.length) / 2;
    series.forEach((s, k) => {
      const v = s.values[i] ?? 0;
      const h = (plotH * v) / ymax;
      const r = el("rect", {
        x: x0 + k * barW, y: padT + plotH - h, width: barW - 1.2, height: Math.max(0, h), rx: 1.5,
        fill: SERIES_COLORS[s.key] ?? "#888", opacity: s.key === "exact" ? 0.92 : 0.88,
      }, svg);
      const tt = el("title", {}, r);
      tt.textContent = `${lab} · ${s.name}: ${v.toFixed(3)}`;
    });
    const lx = padL + groupW * (i + 0.5), ly = many ? H - padB + 12 : H - 12;
    const t = el("text", many
      ? { x: lx, y: ly, "text-anchor": "end", transform: `rotate(-50 ${lx} ${ly})` }
      : { x: lx, y: ly, "text-anchor": "middle" }, svg);
    t.textContent = lab;
    t.setAttribute("fill", highlight.includes(i) ? "#ffd166" : "#8c97b5");
    t.setAttribute("font-size", "9.5");
  });
}

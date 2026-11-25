/**
 * Single-series column charts in plain SVG: thin bars (<=24px) with 4px rounded tops
 * anchored to one baseline, a 2px gap between bars, one recessive hairline, selective
 * labels (max + today), and a per-bar hover/tap tooltip. A hidden table carries the data.
 */
import { h } from "./ui";

export interface Point { day: string; value: number; tip: string }

const H = 132, PAD_T = 20, PAD_B = 22, PAD_L = 0;

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!;
}

const shortDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function columnChart(opts: { title: string; headline: string; sub: string; points: Point[]; format: (v: number) => string }): HTMLElement {
  const { points } = opts;
  const n = points.length;
  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  const tip = h("div", { class: "chart-tip", role: "status", hidden: true });
  const wrap = h("div", { class: "chart-wrap" });
  let lastW = 0;
  const draw = (W: number) => {
  wrap.replaceChildren();
  const slot = (W - PAD_L) / n;
  const bw = Math.min(24, slot - 2);
  const plotH = H - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH;

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", String(W));
  svg.setAttribute("class", "chart-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${opts.title}, last ${n} days. ${opts.sub}`);
  const el = (tag: string, attrs: Record<string, string | number>) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    svg.appendChild(e);
    return e;
  };
  // Recessive hairlines: top of scale and baseline.
  el("line", { x1: 0, x2: W, y1: y(max), y2: y(max), class: "grid" });
  el("line", { x1: 0, x2: W, y1: y(0), y2: y(0), class: "axis" });
  const maxLabel = el("text", { x: W, y: y(max) - 5, class: "tick", "text-anchor": "end" });
  maxLabel.textContent = opts.format(max);

  points.forEach((p, i) => {
    const cx = PAD_L + slot * i + slot / 2;
    const x = cx - bw / 2;
    if (p.value > 0) {
      const top = y(p.value), r = Math.min(4, (y(0) - top) / 2, bw / 2), base = y(0);
      el("path", {
        class: "bar" + (i === n - 1 ? " today" : ""),
        d: `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${base} Z`,
      });
    } else {
      el("rect", { class: "bar-zero", x, y: y(0) - 2, width: bw, height: 2, rx: 1 });
    }
    // Hit target: the whole slot, taller than the mark.
    const hit = el("rect", { class: "hit", x: PAD_L + slot * i, y: 0, width: slot, height: H, tabindex: 0 });
    const show = () => {
      tip.hidden = false;
      tip.textContent = `${shortDate(p.day)} · ${p.tip}`;
      const box = svg.getBoundingClientRect();
      const px = (cx / W) * box.width;
      tip.style.left = `${Math.min(Math.max(px, 60), box.width - 60)}px`;
      svg.querySelectorAll(".bar.hover").forEach((b) => b.classList.remove("hover"));
      hit.previousElementSibling?.classList.add("hover");
    };
    const hide = () => { tip.hidden = true; svg.querySelectorAll(".hover").forEach((b) => b.classList.remove("hover")); };
    hit.addEventListener("pointerenter", show);
    hit.addEventListener("pointerdown", show);
    hit.addEventListener("focus", show);
    hit.addEventListener("pointerleave", hide);
    hit.addEventListener("blur", hide);
  });
  // X labels: first and today only.
  const first = el("text", { x: PAD_L + slot / 2, y: H - 4, class: "tick", "text-anchor": "start" });
  first.textContent = shortDate(points[0].day);
  const last = el("text", { x: W, y: H - 4, class: "tick", "text-anchor": "end" });
  last.textContent = "Today";
  svg.setAttribute("height", String(H));
  wrap.append(svg, tip);
  };
  new ResizeObserver(() => { const w = Math.round(wrap.clientWidth); if (w && w !== lastW) { lastW = w; draw(w); } }).observe(wrap);
  draw(320);

  const table = h("table", { class: "sr-only" },
    h("caption", {}, opts.title),
    h("tr", {}, h("th", {}, "Day"), h("th", {}, "Value")),
    ...points.map((p) => h("tr", {}, h("td", {}, p.day), h("td", {}, p.tip))));

  return h("section", { class: "tile chart-tile" },
    h("p", { class: "eyebrow" }, opts.title),
    h("p", { class: "chart-head" }, opts.headline),
    h("p", { class: "muted small chart-sub" }, opts.sub),
    wrap,
    table);
}

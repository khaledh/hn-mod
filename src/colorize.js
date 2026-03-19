// Points and comment count colorization
//
// Uses a log10 curve (power-4) to interpolate from HN's default gray to
// dark teal, with increasing font weight for higher values.

const MAX_LOG = Math.log10(5000);

// Gray (#828282) → dark teal (#007777)
const BASE = { r: 130, g: 130, b: 130 };
const TARGET = { r: 0, g: 119, b: 119 };

/** Compute intensity 0..1 from a count using log10 power-4 curve */
export function intensity(value) {
  if (value <= 0) return 0;
  return Math.pow(Math.min(Math.log10(value) / MAX_LOG, 1), 4);
}

/** Apply color and weight based on intensity */
function applyStyle(el, t) {
  const r = Math.round(BASE.r + (TARGET.r - BASE.r) * t);
  const g = Math.round(BASE.g + (TARGET.g - BASE.g) * t);
  const b = Math.round(BASE.b + (TARGET.b - BASE.b) * t);
  el.style.color = `rgb(${r}, ${g}, ${b})`;
  el.style.fontWeight = Math.round(400 + 500 * t);
}

/** Colorize all point scores and comment count links on the page */
export function colorizePoints() {
  // Point scores
  for (const el of document.querySelectorAll('span.score')) {
    const points = parseInt(el.textContent);
    const t = intensity(points);
    if (t > 0) applyStyle(el, t);
  }

  // Comment counts
  for (const el of document.querySelectorAll('td.subtext > span > a')) {
    const match = el.textContent.match(/(\d+)\s*comment/);
    if (!match) continue;
    const t = intensity(parseInt(match[1]));
    if (t > 0) applyStyle(el, t);
  }
}

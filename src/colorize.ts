// Points and comment count colorization
//
// Uses a log10 curve (power-4) to interpolate from HN's default gray to
// dark teal, with increasing font weight for higher values.

const MAX_LOG = Math.log10(5000);

// Gray (#828282) → dark teal (#007777)
const BASE = { r: 130, g: 130, b: 130 };
const TARGET = { r: 0, g: 119, b: 119 };

export interface IntensityStyle {
  color: string;
  fontWeight: string;
}

/** Compute intensity 0..1 from a count using log10 power-4 curve */
export function intensity(value: number): number {
  if (value <= 0) return 0;
  return Math.pow(Math.min(Math.log10(value) / MAX_LOG, 1), 4);
}

/** Compute color and weight style for a given count value */
export function intensityStyle(value: number): IntensityStyle | null {
  const t = intensity(value);
  if (t <= 0) return null;
  const r = Math.round(BASE.r + (TARGET.r - BASE.r) * t);
  const g = Math.round(BASE.g + (TARGET.g - BASE.g) * t);
  const b = Math.round(BASE.b + (TARGET.b - BASE.b) * t);
  return { color: `rgb(${r}, ${g}, ${b})`, fontWeight: String(Math.round(400 + 500 * t)) };
}

/** Apply an intensity style to an element's color and font-weight */
function applyIntensityStyle(el: HTMLElement, style: IntensityStyle | null): void {
  if (!style) return;
  el.style.color = style.color;
  el.style.fontWeight = style.fontWeight;
}

/** Colorize all point scores and comment count links on the page */
export function colorizePoints(): void {
  for (const el of document.querySelectorAll<HTMLElement>('span.score')) {
    applyIntensityStyle(el, intensityStyle(parseInt(el.textContent || '')));
  }

  for (const el of document.querySelectorAll<HTMLElement>('td.subtext > span > a')) {
    const match = el.textContent?.match(/(\d+)\s*comment/);
    if (!match) continue;
    applyIntensityStyle(el, intensityStyle(parseInt(match[1])));
  }
}

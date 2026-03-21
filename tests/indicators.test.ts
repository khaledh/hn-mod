import { describe, it, expect } from 'vitest';
import { decay } from '../src/indicators.ts';

const FADE_SEC = 30 * 60;

describe('decay', () => {
  it('returns 1 at age 0', () => {
    expect(decay(0)).toBeCloseTo(1, 5);
  });

  it('returns 0 at or beyond fade duration', () => {
    expect(decay(FADE_SEC)).toBe(0);
    expect(decay(FADE_SEC + 1)).toBe(0);
  });

  it('decreases monotonically', () => {
    const ages = [0, 60, 300, 600, 900, 1200, 1500, 1800];
    for (let i = 1; i < ages.length; i++) {
      expect(decay(ages[i])).toBeLessThan(decay(ages[i - 1]));
    }
  });

  it('decays faster initially (exponential shape)', () => {
    const earlyDrop = decay(0) - decay(300); // first 5 min
    const lateDrop = decay(1200) - decay(1500); // 20-25 min
    expect(earlyDrop).toBeGreaterThan(lateDrop);
  });
});

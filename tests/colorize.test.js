import { describe, it, expect } from 'vitest';
import { intensity } from '../src/colorize.js';

describe('intensity', () => {
  it('returns 0 for zero or negative values', () => {
    expect(intensity(0)).toBe(0);
    expect(intensity(-5)).toBe(0);
  });

  it('returns a small value for low counts', () => {
    const t = intensity(10);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(0.05);
  });

  it('returns close to 1 for very high counts', () => {
    expect(intensity(5000)).toBeCloseTo(1, 5);
  });

  it('increases monotonically', () => {
    const values = [1, 10, 50, 100, 500, 1000, 5000];
    for (let i = 1; i < values.length; i++) {
      expect(intensity(values[i])).toBeGreaterThan(intensity(values[i - 1]));
    }
  });
});

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { buildIndicatorCell } from '../src/indicators.ts';
import { FADE_SEC } from '../src/storage.ts';

const nowSec = Math.floor(Date.now() / 1000);

describe('buildIndicatorCell', () => {
  it('returns empty td for null entryId', () => {
    const td = buildIndicatorCell(null, {}, {}, nowSec);
    expect(td.className).toBe('hn-mod-indicator-cell');
    expect(td.querySelector('.hn-mod-dot')).toBeNull();
  });

  it('shows full-opacity dot for never-seen story', () => {
    const td = buildIndicatorCell('100', {}, {}, nowSec);
    const dot = td.querySelector<HTMLElement>('.hn-mod-dot');
    expect(dot).not.toBeNull();
    expect(parseFloat(dot!.style.opacity)).toBe(1);
  });

  it('shows fading dot for recently-seen story', () => {
    const fiveMinAgo = nowSec - 300;
    const td = buildIndicatorCell('100', {}, { '100': fiveMinAgo }, nowSec);
    const dot = td.querySelector<HTMLElement>('.hn-mod-dot');
    expect(dot).not.toBeNull();
    const opacity = parseFloat(dot!.style.opacity);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
  });

  it('shows zero-opacity dot for fully-seen story', () => {
    const td = buildIndicatorCell('100', {}, { '100': true }, nowSec);
    const dot = td.querySelector<HTMLElement>('.hn-mod-dot');
    expect(parseFloat(dot!.style.opacity)).toBe(0);
  });

  it('shows upward trend arrow with green color', () => {
    const diffs = { '100': { d: 3, t: nowSec } };
    const td = buildIndicatorCell('100', diffs, { '100': true }, nowSec);
    const marker = td.querySelector<HTMLElement>('.hn-mod-dot')?.previousElementSibling as HTMLElement;
    expect(marker).not.toBeNull();
    expect(marker.style.color).toBe('rgb(34, 139, 34)');
    expect(marker.textContent).toContain('3');
  });

  it('shows downward trend arrow with gray color', () => {
    const diffs = { '100': { d: -2, t: nowSec } };
    const td = buildIndicatorCell('100', diffs, { '100': true }, nowSec);
    const marker = td.querySelector<HTMLElement>('.hn-mod-dot')?.previousElementSibling as HTMLElement;
    expect(marker).not.toBeNull();
    expect(marker.style.color).toBe('rgb(153, 153, 153)');
    expect(marker.textContent).toContain('2');
  });

  it('shows no arrow when diff entry is fully faded', () => {
    const oldTime = nowSec - FADE_SEC - 1;
    const diffs = { '100': { d: 3, t: oldTime } };
    const td = buildIndicatorCell('100', diffs, { '100': true }, nowSec);
    // Only the dot should be present (no marker sibling before it)
    const children = [...td.children];
    expect(children.length).toBe(1);
    expect(children[0].classList.contains('hn-mod-dot')).toBe(true);
  });

  it('dot has has-arrow class when arrow is present', () => {
    const diffs = { '100': { d: 1, t: nowSec } };
    const td = buildIndicatorCell('100', diffs, { '100': true }, nowSec);
    const dot = td.querySelector('.hn-mod-dot');
    expect(dot!.classList.contains('has-arrow')).toBe(true);
  });

  it('dot does NOT have has-arrow class when no arrow', () => {
    const td = buildIndicatorCell('100', {}, { '100': true }, nowSec);
    const dot = td.querySelector('.hn-mod-dot');
    expect(dot!.classList.contains('has-arrow')).toBe(false);
  });
});

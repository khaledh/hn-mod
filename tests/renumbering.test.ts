/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { renumberStories } from '../src/indicators.ts';
import { buildStoryTable, buildUnseenPanel, cleanup } from './helpers/dom-fixtures.ts';

afterEach(() => cleanup());

/** Read rank texts from a table's story rows */
function readRanks(table: HTMLTableElement): string[] {
  return [...table.querySelectorAll('tr.athing span.rank')].map((el) => el.textContent || '');
}

describe('renumberStories', () => {
  it('renumbers stories sequentially from page 1 start rank', () => {
    const table = buildStoryTable([
      { id: '1', rank: 1 },
      { id: '2', rank: 3 }, // gap from hide
      { id: '3', rank: 4 },
      { id: '4', rank: 5 },
    ]);

    renumberStories(table, 1);

    expect(readRanks(table)).toEqual(['1.', '2.', '3.', '4.']);
  });

  it('renumbers correctly on page 2 (starts at rank 31)', () => {
    const table = buildStoryTable([
      { id: '1', rank: 31 },
      { id: '2', rank: 33 }, // gap
      { id: '3', rank: 34 },
    ]);

    renumberStories(table, 2);

    expect(readRanks(table)).toEqual(['31.', '32.', '33.']);
  });

  it('renumbers correctly on page 3 (starts at rank 61)', () => {
    const table = buildStoryTable([
      { id: '1', rank: 62 },
      { id: '2', rank: 65 },
    ]);

    renumberStories(table, 3);

    expect(readRanks(table)).toEqual(['61.', '62.']);
  });

  it('does NOT renumber stories inside .hn-mod-unseen panel', () => {
    const table = buildStoryTable([
      { id: '1', rank: 1 },
      { id: '2', rank: 3 },
    ]);

    // Insert panel INSIDE the story table's parent to simulate the real DOM
    // where the panel and table share a parent container
    const panel = buildUnseenPanel([
      { id: '99', rank: 42 },
      { id: '98', rank: 67 },
    ]);
    // Move panel inside the same parent as the table
    table.parentNode!.insertBefore(panel, table);

    renumberStories(table, 1);

    expect(readRanks(table)).toEqual(['1.', '2.']);

    // Panel ranks should be unchanged
    const panelRanks = [...panel.querySelectorAll('tr.athing span.rank')].map(
      (el) => el.textContent || '',
    );
    expect(panelRanks).toEqual(['42.', '67.']);
  });

  it('handles empty table', () => {
    const table = buildStoryTable([]);
    renumberStories(table, 1);
    expect(readRanks(table)).toEqual([]);
  });
});

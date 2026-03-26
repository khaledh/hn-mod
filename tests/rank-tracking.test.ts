/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeRankDiffs, handleHideRankAdjustments } from '../src/indicators.ts';
import { FADE_SEC, type PageRanks, type RankDiffMap } from '../src/storage.ts';
import {
  buildStoryTable,
  setLocation,
  mockChrome,
  cleanup,
} from './helpers/dom-fixtures.ts';

beforeEach(() => {
  mockChrome();
  setLocation('/');
});
afterEach(() => cleanup());

describe('computeRankDiffs', () => {
  it('detects upward rank movement', () => {
    buildStoryTable([{ id: '100', rank: 3 }]);
    const prev: PageRanks = { '100': 5 };
    const diffs: RankDiffMap = {};

    computeRankDiffs(prev, diffs);

    expect(diffs['100']).toBeDefined();
    expect(diffs['100'].d).toBe(2); // moved up 2
  });

  it('detects downward rank movement', () => {
    buildStoryTable([{ id: '100', rank: 5 }]);
    const prev: PageRanks = { '100': 3 };
    const diffs: RankDiffMap = {};

    computeRankDiffs(prev, diffs);

    expect(diffs['100'].d).toBe(-2);
  });

  it('does not create diff entry when rank is unchanged', () => {
    buildStoryTable([{ id: '100', rank: 3 }]);
    const prev: PageRanks = { '100': 3 };
    const diffs: RankDiffMap = {};

    computeRankDiffs(prev, diffs);

    expect(diffs['100']).toBeUndefined();
  });

  it('does not overwrite existing diff when diff value is the same', () => {
    buildStoryTable([{ id: '100', rank: 3 }]);
    const prev: PageRanks = { '100': 5 };
    const recentTimestamp = Math.floor(Date.now() / 1000) - 60; // 1 min ago (within fade)
    const diffs: RankDiffMap = { '100': { d: 2, t: recentTimestamp } };

    computeRankDiffs(prev, diffs);

    expect(diffs['100'].t).toBe(recentTimestamp); // timestamp unchanged
  });

  it('overwrites existing diff when diff value changes', () => {
    buildStoryTable([{ id: '100', rank: 1 }]);
    const prev: PageRanks = { '100': 5 };
    const diffs: RankDiffMap = { '100': { d: 2, t: 1000 } };

    computeRankDiffs(prev, diffs);

    expect(diffs['100'].d).toBe(4); // new diff
    expect(diffs['100'].t).toBeGreaterThan(1000); // new timestamp
  });

  it('removes fully faded entries', () => {
    buildStoryTable([{ id: '100', rank: 1 }]);
    const nowSec = Math.floor(Date.now() / 1000);
    const prev: PageRanks = { '100': 1 };
    const diffs: RankDiffMap = { '200': { d: 1, t: nowSec - FADE_SEC - 1 } };

    computeRankDiffs(prev, diffs);

    expect(diffs['200']).toBeUndefined();
  });

  it('updates previousPageRanks with current DOM values', () => {
    buildStoryTable([
      { id: '100', rank: 1 },
      { id: '500', rank: 10 },
    ]);
    const prev: PageRanks = { '100': 1 };
    const diffs: RankDiffMap = {};

    computeRankDiffs(prev, diffs);

    expect(prev['500']).toBe(10);
  });
});

describe('handleHideRankAdjustments', () => {
  it('decrements ranks of stories below the removed story', () => {
    buildStoryTable([
      { id: 'A', rank: 1 },
      { id: 'C', rank: 3 },
    ]);
    const prev: PageRanks = { A: 1, B: 2, C: 3 };
    const hiddenIds = new Set<string>();

    handleHideRankAdjustments(['B'], prev, hiddenIds, false);

    expect(prev['A']).toBe(1);
    expect(prev['C']).toBe(2); // decremented
    expect(prev['B']).toBeUndefined(); // deleted
  });

  it('does NOT overwrite adjusted ranks with stale DOM values', () => {
    // DOM still shows old rank 3 for story C (HN doesn't renumber client-side)
    buildStoryTable([
      { id: 'A', rank: 1 },
      { id: 'C', rank: 3 },
    ]);
    const prev: PageRanks = { A: 1, B: 2, C: 3 };
    const hiddenIds = new Set<string>();

    handleHideRankAdjustments(['B'], prev, hiddenIds, false);

    // After adjustment, C should be 2, NOT overwritten to 3 by DOM
    expect(prev['C']).toBe(2);
  });

  it('adds ranks for newly appeared replacement stories', () => {
    buildStoryTable([
      { id: 'A', rank: 1 },
      { id: 'C', rank: 3 },
      { id: 'D', rank: 4 }, // replacement story not in prev
    ]);
    const prev: PageRanks = { A: 1, B: 2, C: 3 };
    const hiddenIds = new Set<string>();

    handleHideRankAdjustments(['B'], prev, hiddenIds, false);

    expect(prev['D']).toBe(4); // newly added
  });

  it('handles multiple simultaneous removals', () => {
    buildStoryTable([
      { id: 'A', rank: 1 },
      { id: 'D', rank: 4 },
      { id: 'E', rank: 5 },
    ]);
    const prev: PageRanks = { A: 1, B: 2, C: 3, D: 4, E: 5 };
    const hiddenIds = new Set<string>();

    handleHideRankAdjustments(['B', 'C'], prev, hiddenIds, false);

    expect(prev['A']).toBe(1);
    expect(prev['D']).toBe(2); // was 4, decremented twice
    expect(prev['E']).toBe(3); // was 5, decremented twice
    expect(prev['B']).toBeUndefined();
    expect(prev['C']).toBeUndefined();
  });

  it('tracks hidden IDs when suppressHiddenTracking is false', () => {
    buildStoryTable([{ id: 'A', rank: 1 }]);
    const prev: PageRanks = { A: 1, B: 2 };
    const hiddenIds = new Set<string>();

    handleHideRankAdjustments(['B'], prev, hiddenIds, false);

    expect(hiddenIds.has('B')).toBe(true);
    expect(chrome.storage.sync.set).toHaveBeenCalled();
  });

  it('skips hidden tracking when suppressHiddenTracking is true', () => {
    buildStoryTable([{ id: 'A', rank: 1 }]);
    const prev: PageRanks = { A: 1, B: 2 };
    const hiddenIds = new Set<string>();

    handleHideRankAdjustments(['B'], prev, hiddenIds, true);

    expect(hiddenIds.has('B')).toBe(false);
  });
});

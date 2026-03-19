import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  expandSeenStories, compactSeenStories,
  expandRankDiffs, compactRankDiffs,
  capArray, capMap, pruneOldEntries,
} from '../src/storage.js';

describe('seenStories compact format', () => {
  it('expands grouped timestamps to flat map', () => {
    const compact = { '1000': ['a', 'b'], '2000': ['c'] };
    expect(expandSeenStories(compact)).toEqual({ a: 1000, b: 1000, c: 2000 });
  });

  it('compacts flat map to grouped timestamps', () => {
    const flat = { a: 1000, b: 1000, c: 2000 };
    const result = compactSeenStories(flat);
    expect(result['1000']).toEqual(expect.arrayContaining(['a', 'b']));
    expect(result['2000']).toEqual(['c']);
  });

  it('roundtrips correctly', () => {
    const original = { x: 100, y: 100, z: 200 };
    expect(expandSeenStories(compactSeenStories(original))).toEqual(original);
  });

  it('handles empty input', () => {
    expect(expandSeenStories({})).toEqual({});
    expect(compactSeenStories({})).toEqual({});
  });
});

describe('rankDiffChangedAt compact format', () => {
  it('expands grouped diff,timestamp keys to flat map', () => {
    const compact = { '3,1000': ['a', 'b'], '-1,2000': ['c'] };
    expect(expandRankDiffs(compact)).toEqual({
      a: { d: 3, t: 1000 },
      b: { d: 3, t: 1000 },
      c: { d: -1, t: 2000 },
    });
  });

  it('compacts flat map to grouped keys', () => {
    const flat = { a: { d: 3, t: 1000 }, b: { d: 3, t: 1000 } };
    const result = compactRankDiffs(flat);
    expect(result['3,1000']).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('roundtrips correctly', () => {
    const original = { x: { d: 5, t: 100 }, y: { d: -2, t: 200 } };
    expect(expandRankDiffs(compactRankDiffs(original))).toEqual(original);
  });
});

describe('capArray', () => {
  it('trims oldest entries when over limit', () => {
    const arr = [1, 2, 3, 4, 5];
    capArray(arr, 3);
    expect(arr).toEqual([3, 4, 5]);
  });

  it('does nothing when under limit', () => {
    const arr = [1, 2];
    capArray(arr, 5);
    expect(arr).toEqual([1, 2]);
  });
});

describe('capMap', () => {
  it('keeps entries with highest values', () => {
    const map = { a: 1, b: 5, c: 3, d: 2 };
    capMap(map, 2, v => v);
    expect(Object.keys(map).sort()).toEqual(['b', 'c']);
  });
});

describe('pruneOldEntries', () => {
  it('removes entries older than 72 hours', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const seen = { old: nowSec - 300000, recent: nowSec - 100 };
    const ranks = { old: 1, recent: 2, other: 3 };

    pruneOldEntries(seen, ranks);

    expect(seen).toEqual({ recent: nowSec - 100 });
    expect(ranks).toEqual({ recent: 2, other: 3 });
  });
});

import { describe, it, expect } from 'vitest';
import {
  loadSeenStories,
  expandRankDiffs,
  compactRankDiffs,
  capArray,
  capMap,
} from '../src/storage.js';

describe('loadSeenStories', () => {
  it('loads chunked seenIds as true values', () => {
    const result = loadSeenStories({ seenIds_0: [111, 222], seenIds_1: [333] });
    expect(result).toEqual({ 111: true, 222: true, 333: true });
  });

  it('loads recentlySeen with timestamps', () => {
    const result = loadSeenStories({ recentlySeen: { 5000: ['aaa', 'bbb'] } });
    expect(result).toEqual({ aaa: 5000, bbb: 5000 });
  });

  it('recent timestamps overwrite seenIds entries', () => {
    const result = loadSeenStories({ seenIds_0: [111], recentlySeen: { 5000: ['111'] } });
    expect(result).toEqual({ 111: 5000 });
  });

  it('migrates legacy single seenIds key', () => {
    const result = loadSeenStories({ seenIds: [111, 222] });
    expect(result).toEqual({ 111: true, 222: true });
  });

  it('migrates legacy seenStories compact format', () => {
    const result = loadSeenStories({ seenStories: { 1000: ['aaa'] } });
    expect(result).toEqual({ aaa: 1000 });
  });

  it('handles empty input', () => {
    expect(loadSeenStories({})).toEqual({});
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
    capMap(map, 2, (v) => v);
    expect(Object.keys(map).sort()).toEqual(['b', 'c']);
  });
});

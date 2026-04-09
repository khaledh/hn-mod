import { describe, it, expect } from 'vitest';
import {
  loadSeenStories,
  expandRankDiffs,
  compactRankDiffs,
  capArray,
  capMap,
  splitArray,
  splitRecord,
  chunkKey,
  loadChunked,
  chunkedFields,
  allChunkKeys,
} from '../src/storage.ts';

describe('loadSeenStories', () => {
  it('loads chunked seenIds (new scheme: bare key + _1)', () => {
    const result = loadSeenStories({ seenIds: [111, 222], seenIds_1: [333] });
    expect(result).toEqual({ 111: true, 222: true, 333: true });
  });

  it('loads recentlySeen with timestamps', () => {
    const result = loadSeenStories({ recentlySeen: { 5000: ['aaa', 'bbb'] } });
    expect(result).toEqual({ aaa: 5000, bbb: 5000 });
  });

  it('recent timestamps overwrite seenIds entries', () => {
    const result = loadSeenStories({ seenIds: [111], recentlySeen: { 5000: ['111'] } });
    expect(result).toEqual({ 111: 5000 });
  });

  it('migrates legacy seenIds_0 chunk key', () => {
    const result = loadSeenStories({ seenIds_0: [111, 222] });
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
    const map: Record<string, number> = { a: 1, b: 5, c: 3, d: 2 };
    capMap(map, 2, (v) => v);
    expect(Object.keys(map).sort()).toEqual(['b', 'c']);
  });
});

// --- Auto-chunking tests ---

describe('chunkKey', () => {
  it('returns bare name for index 0', () => {
    expect(chunkKey('hiddenIds', 0)).toBe('hiddenIds');
  });

  it('appends _N for index > 0', () => {
    expect(chunkKey('hiddenIds', 1)).toBe('hiddenIds_1');
    expect(chunkKey('seenIds', 3)).toBe('seenIds_3');
  });
});

describe('splitArray', () => {
  it('returns single chunk when data fits', () => {
    const arr = [1, 2, 3];
    const chunks = splitArray(arr, 1000);
    expect(chunks).toEqual([[1, 2, 3]]);
  });

  it('splits when data exceeds budget', () => {
    // Each 8-digit number takes ~9 bytes in JSON array: "12345678,"
    const arr = Array.from({ length: 100 }, (_, i) => 10000000 + i);
    const chunks = splitArray(arr, 500);
    expect(chunks.length).toBeGreaterThan(1);
    // All elements are preserved
    expect(chunks.flat()).toEqual(arr);
    // Each chunk fits within budget
    for (const chunk of chunks) {
      expect(JSON.stringify(chunk).length).toBeLessThanOrEqual(500);
    }
  });

  it('handles empty array', () => {
    expect(splitArray([], 100)).toEqual([[]]);
  });

  it('handles single large element', () => {
    const arr = ['a'.repeat(100)];
    const chunks = splitArray(arr, 200);
    expect(chunks).toEqual([arr]);
  });
});

describe('splitRecord', () => {
  it('returns single chunk when data fits', () => {
    const obj = { a: 1, b: 2 };
    const chunks = splitRecord(obj, 1000);
    expect(chunks).toEqual([{ a: 1, b: 2 }]);
  });

  it('splits when data exceeds budget', () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 50; i++) obj[`key${i}`] = i;
    const chunks = splitRecord(obj, 200);
    expect(chunks.length).toBeGreaterThan(1);
    // All entries preserved
    const merged = Object.assign({}, ...chunks);
    expect(merged).toEqual(obj);
    // Each chunk fits within budget
    for (const chunk of chunks) {
      expect(JSON.stringify(chunk).length).toBeLessThanOrEqual(200);
    }
  });

  it('handles empty record', () => {
    expect(splitRecord({}, 100)).toEqual([{}]);
  });
});

describe('loadChunked', () => {
  it('loads hiddenIds from single chunk (bare key)', () => {
    const items = { hiddenIds: [111, 222, 333] };
    const result = loadChunked(chunkedFields.hiddenIds, items);
    expect(result).toEqual(new Set(['111', '222', '333']));
  });

  it('loads hiddenIds from multiple chunks', () => {
    const items = { hiddenIds: [111, 222], hiddenIds_1: [333, 444] };
    const result = loadChunked(chunkedFields.hiddenIds, items);
    expect(result).toEqual(new Set(['111', '222', '333', '444']));
  });

  it('loads previousPageRanks from multiple chunks', () => {
    const items = { previousPageRanks: { a: 1, b: 2 }, previousPageRanks_1: { c: 3 } };
    const result = loadChunked(chunkedFields.previousPageRanks, items);
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('loads rankDiffChangedAt with compact format expansion', () => {
    const items = {
      rankDiffChangedAt: { '5,1000': ['a'] },
      rankDiffChangedAt_1: { '-2,2000': ['b'] },
    };
    const result = loadChunked(chunkedFields.rankDiffChangedAt, items);
    expect(result).toEqual({
      a: { d: 5, t: 1000 },
      b: { d: -2, t: 2000 },
    });
  });

  it('handles missing chunks gracefully', () => {
    const result = loadChunked(chunkedFields.hiddenIds, {});
    expect(result).toEqual(new Set());
  });
});

describe('allChunkKeys', () => {
  it('includes bare and suffixed keys for all chunked fields', () => {
    const keys = allChunkKeys();
    expect(keys).toContain('hiddenIds');
    expect(keys).toContain('hiddenIds_1');
    expect(keys).toContain('previousPageRanks');
    expect(keys).toContain('previousPageRanks_1');
    expect(keys).toContain('previousPageRanks_2');
    expect(keys).toContain('rankDiffChangedAt');
    expect(keys).toContain('rankDiffChangedAt_1');
    expect(keys).toContain('seenIds');
    expect(keys).toContain('seenIds_1');
    expect(keys).toContain('seenIds_2');
    expect(keys).toContain('seenIds_3');
  });
});

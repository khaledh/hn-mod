// Chrome sync storage helpers with auto-chunking for the 8KB per-item limit.
//
// Any storage key whose serialized value may exceed ~8KB is declared as a
// ChunkedField.  The abstraction transparently splits values across multiple
// storage keys (e.g. hiddenIds, hiddenIds_1, hiddenIds_2) and reassembles
// them on load.  Chunk 0 always uses the bare key name so existing data
// requires no migration.

export const MAX_RANK_DIFF_ENTRIES = 500;
export const MAX_TRACKED_STORIES = 1167;
export const MAX_DIM_STATE_ENTRIES = 700;
export const PRUNE_AGE_SEC = 7 * 24 * 60 * 60; // 7 days
export const FADE_SEC = 30 * 60; // 30 minutes

// --- Shared types ---

export type SeenStories = Record<string, number | true>;

export interface RankDiffEntry {
  d: number;
  t: number;
}
export type RankDiffMap = Record<string, RankDiffEntry>;
export type PageRanks = Record<string, number>;

export interface DimmingConfig {
  ciKeywords: string[];
  csKeywords: string[];
  domains: string[];
  dimmedEntries: string[];
  undimmedEntries: string[];
}

/** Bump this when the storage format changes to trigger a one-time migration */
export const STORAGE_VERSION = 3;

export interface StorageItems {
  storageVersion: number;
  ciKeywords: string[];
  csKeywords: string[];
  domains: string[];
  dimmedEntries: string[];
  undimmedEntries: string[];
  recentlySeen: Record<string, string[]>;
  showUnseen: boolean;
  seenIds: number[] | null; // legacy
  seenStories: Record<string, string[]> | null; // legacy
  seenIds_0: number[]; // legacy chunk key (migrated to bare "seenIds")
  [key: string]: unknown;
}

// --- Auto-chunking abstraction ---

/** Byte budget per chunk — leaves headroom below the 8,192-byte per-item limit */
const CHUNK_BUDGET = 7000;

/** Descriptor for a storage field that may be split across multiple keys */
interface ChunkedField<TMemory, TChunk> {
  key: string;
  maxChunks: number;
  emptyChunk: TChunk;
  toStorage: (value: TMemory) => TChunk;
  fromStorage: (chunks: TChunk[]) => TMemory;
  split: (value: TChunk, budget: number) => TChunk[];
}

type ChunkedFieldMemory<F extends ChunkedField<any, any>> =
  F extends ChunkedField<infer TMemory, any> ? TMemory : never;
type ChunkedFieldChunk<F extends ChunkedField<any, any>> =
  F extends ChunkedField<any, infer TChunk> ? TChunk : never;

/** Storage key for chunk `i` of a field: bare name for 0, name_N for N>0 */
export function chunkKey(base: string, i: number): string {
  return i === 0 ? base : `${base}_${i}`;
}

/**
 * Split an array into sub-arrays that each serialize within `budget` bytes.
 * Uses binary search on slice length for efficiency.
 */
export function splitArray<T>(arr: T[], budget: number): T[][] {
  if (arr.length === 0) return [[]];
  const result: T[][] = [];
  let start = 0;
  while (start < arr.length) {
    let lo = 1;
    let hi = arr.length - start;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (JSON.stringify(arr.slice(start, start + mid)).length <= budget) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    result.push(arr.slice(start, start + lo));
    start += lo;
  }
  return result;
}

/**
 * Split a record into sub-records that each serialize within `budget` bytes.
 * Entries are accumulated until the next would exceed the budget.
 */
export function splitRecord<V>(obj: Record<string, V>, budget: number): Record<string, V>[] {
  const entries = Object.entries(obj);
  if (entries.length === 0) return [{}];
  const result: Record<string, V>[] = [];
  let current: Record<string, V> = {};
  let currentSize = 2; // "{}" base
  for (const [k, v] of entries) {
    const entrySize = JSON.stringify(k).length + 1 + JSON.stringify(v).length + 1;
    if (currentSize + entrySize > budget && Object.keys(current).length > 0) {
      result.push(current);
      current = {};
      currentSize = 2;
    }
    current[k] = v;
    currentSize += entrySize;
  }
  if (Object.keys(current).length > 0) result.push(current);
  return result;
}

/** Write a chunked field to storage, cleaning up stale chunk keys */
function saveChunked<F extends ChunkedField<any, any>>(
  field: F,
  value: ChunkedFieldMemory<F>,
): void {
  const serialized = field.toStorage(value);
  const chunks = field.split(serialized, CHUNK_BUDGET);
  if (chunks.length > field.maxChunks) chunks.length = field.maxChunks;

  const data: Record<string, ChunkedFieldChunk<F>> = {};
  const removeKeys: string[] = [];
  for (let i = 0; i < field.maxChunks; i++) {
    const key = chunkKey(field.key, i);
    if (i < chunks.length) {
      data[key] = chunks[i];
    } else {
      removeKeys.push(key);
    }
  }
  chrome.storage.sync.set(data);
  if (removeKeys.length > 0) chrome.storage.sync.remove(removeKeys);
}

/** Read a chunked field from the items returned by chrome.storage.sync.get */
export function loadChunked<F extends ChunkedField<any, any>>(
  field: F,
  items: Record<string, unknown>,
): ChunkedFieldMemory<F> {
  const chunks: ChunkedFieldChunk<F>[] = [];
  for (let i = 0; i < field.maxChunks; i++) {
    const val = items[chunkKey(field.key, i)] as ChunkedFieldChunk<F> | undefined;
    if (val !== undefined && val !== null) chunks.push(val);
  }
  return field.fromStorage(chunks);
}

/** Generate defaults entries for all chunked field keys */
function chunkedDefaults(): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const field of Object.values(chunkedFields)) {
    for (let i = 0; i < field.maxChunks; i++) {
      defaults[chunkKey(field.key, i)] = field.emptyChunk;
    }
  }
  return defaults;
}

// --- Field descriptors ---

export const chunkedFields = {
  hiddenIds: {
    key: 'hiddenIds',
    maxChunks: 2,
    emptyChunk: [] as number[],
    toStorage: (ids: Set<string>): number[] => {
      const arr = [...ids].map(Number);
      if (arr.length > MAX_TRACKED_STORIES) arr.splice(0, arr.length - MAX_TRACKED_STORIES);
      return arr;
    },
    fromStorage: (chunks: number[][]): Set<string> =>
      new Set(chunks.flat().map(String)),
    split: splitArray,
  },
  dismissedIds: {
    key: 'dismissedIds',
    maxChunks: 2,
    emptyChunk: [] as number[],
    toStorage: (ids: Set<string>): number[] => {
      const arr = [...ids].map(Number);
      if (arr.length > MAX_TRACKED_STORIES) arr.splice(0, arr.length - MAX_TRACKED_STORIES);
      return arr;
    },
    fromStorage: (chunks: number[][]): Set<string> =>
      new Set(chunks.flat().map(String)),
    split: splitArray,
  },
  previousPageRanks: {
    key: 'previousPageRanks',
    maxChunks: 3,
    emptyChunk: {} as PageRanks,
    toStorage: (v: PageRanks): PageRanks => v,
    fromStorage: (chunks: PageRanks[]): PageRanks => Object.assign({}, ...chunks),
    split: splitRecord,
  },
  rankDiffChangedAt: {
    key: 'rankDiffChangedAt',
    maxChunks: 2,
    emptyChunk: {} as Record<string, string[]>,
    toStorage: (v: RankDiffMap): Record<string, string[]> => compactRankDiffs(v),
    fromStorage: (chunks: Record<string, string[]>[]): RankDiffMap =>
      expandRankDiffs(Object.assign({}, ...chunks)),
    split: splitRecord,
  },
  seenIds: {
    key: 'seenIds',
    maxChunks: 4,
    emptyChunk: [] as number[],
    toStorage: (seenStories: SeenStories): number[] => {
      const ids = Object.keys(seenStories).map(Number);
      if (ids.length > MAX_TRACKED_STORIES) ids.splice(0, ids.length - MAX_TRACKED_STORIES);
      return ids;
    },
    fromStorage: (chunks: number[][]): SeenStories => {
      const map: SeenStories = {};
      for (const id of chunks.flat()) map[String(id)] = true;
      return map;
    },
    split: splitArray,
  },
} as const;

// --- Compact format: rankDiffChangedAt ---
// Storage:  { "diff,timestamp": [id, ...], ... }
// In-memory: { id: { d: diff, t: timestamp }, ... }

export function expandRankDiffs(compact: Record<string, string[]>): RankDiffMap {
  const flat: RankDiffMap = {};
  for (const [key, ids] of Object.entries(compact)) {
    const [d, t] = key.split(',').map(Number);
    for (const id of ids) flat[id] = { d, t };
  }
  return flat;
}

export function compactRankDiffs(flat: RankDiffMap): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const [id, { d, t }] of Object.entries(flat)) {
    const key = `${d},${t}`;
    (grouped[key] ??= []).push(id);
  }
  return grouped;
}

// --- Seen stories ---
// Storage: seenIds (chunked number arrays) + recentlySeen (timestamp → IDs)
// In-memory: { id: timestamp | true, ... }

/** Load seen data from chunked storage keys into a single in-memory map */
export function loadSeenStories(items: Partial<StorageItems>): SeenStories {
  const map = loadChunked(chunkedFields.seenIds, items as Record<string, unknown>);
  // Migrate from legacy seenIds_0 chunk key (old scheme used _0 for first chunk)
  const legacyChunk0 = items.seenIds_0;
  if (legacyChunk0) {
    for (const id of legacyChunk0) map[String(id)] = true;
  }
  // Migrate from legacy single-key format (seenIds)
  if (items.seenIds) {
    for (const id of items.seenIds) map[String(id)] = true;
  }
  // Migrate from legacy compact format (seenStories: { timestamp: [id, ...] })
  if (items.seenStories) {
    for (const [ts, ids] of Object.entries(items.seenStories)) {
      const t = parseInt(ts);
      for (const id of ids) map[id] = t;
    }
  }
  // Recent entries overwrite with actual timestamps (for fade calculation)
  const recentlySeen = items.recentlySeen || {};
  for (const [ts, ids] of Object.entries(recentlySeen)) {
    const t = parseInt(ts);
    for (const id of ids) map[id] = t;
  }
  return map;
}

// --- Persistence ---

export function saveSeenStories(seenStories: SeenStories): void {
  const nowSec = Math.floor(Date.now() / 1000);
  const ids: number[] = [];
  const recent: Record<string, string[]> = {};

  for (const [id, val] of Object.entries(seenStories)) {
    ids.push(Number(id));
    if (typeof val === 'number' && nowSec - val < FADE_SEC) {
      const key = String(val);
      (recent[key] ??= []).push(id);
    }
  }

  if (ids.length > MAX_TRACKED_STORIES) ids.splice(0, ids.length - MAX_TRACKED_STORIES);

  const chunks = splitArray(ids, CHUNK_BUDGET);
  if (chunks.length > chunkedFields.seenIds.maxChunks) {
    chunks.length = chunkedFields.seenIds.maxChunks;
  }

  const data: Record<string, unknown> = { recentlySeen: recent };
  const removeKeys: string[] = [];
  for (let i = 0; i < chunkedFields.seenIds.maxChunks; i++) {
    const key = chunkKey('seenIds', i);
    if (i < chunks.length) {
      data[key] = chunks[i];
    } else {
      removeKeys.push(key);
    }
  }

  chrome.storage.sync.set(data);
  if (removeKeys.length > 0) chrome.storage.sync.remove(removeKeys);
}

export function saveRankDiffs(rankDiffChangedAt: RankDiffMap): void {
  saveChunked(chunkedFields.rankDiffChangedAt, rankDiffChangedAt);
}

export function savePageRanks(previousPageRanks: PageRanks): void {
  saveChunked(chunkedFields.previousPageRanks, previousPageRanks);
}

export function saveDimState(dimmedEntries: string[], undimmedEntries: string[]): void {
  chrome.storage.sync.set({ dimmedEntries, undimmedEntries });
}

export function saveDismissedIds(dismissedIds: Set<string>): void {
  saveChunked(chunkedFields.dismissedIds, dismissedIds);
}

export function saveHiddenIds(hiddenIds: Set<string>): void {
  saveChunked(chunkedFields.hiddenIds, hiddenIds);
}

// --- Maintenance ---

/** Trim an array to the last `max` entries (queue semantics: oldest removed first) */
export function capArray<T>(arr: T[], max = MAX_RANK_DIFF_ENTRIES): void {
  if (arr.length > max) arr.splice(0, arr.length - max);
}

/** Trim a map to `max` entries, keeping those with the highest sort values */
export function capMap<T>(map: Record<string, T>, max: number, valueFn: (v: T) => number): void {
  const entries = Object.entries(map);
  if (entries.length <= max) return;
  entries.sort((a, b) => valueFn(a[1]) - valueFn(b[1]));
  for (const [id] of entries.slice(0, entries.length - max)) {
    delete map[id];
  }
}

/** Remove previousPageRanks entries older than PRUNE_AGE_SEC (based on seenStories timestamps) */
export function pruneOldRanks(seenStories: SeenStories, previousPageRanks: PageRanks): void {
  const nowSec = Math.floor(Date.now() / 1000);
  for (const id of Object.keys(previousPageRanks)) {
    const seenAt = seenStories[id];
    if (seenAt === undefined || (typeof seenAt === 'number' && nowSec - seenAt > PRUNE_AGE_SEC)) {
      delete previousPageRanks[id];
    }
  }
}

/**
 * Remove entries from a set of story IDs that are older than PRUNE_AGE_SEC.
 * Uses seenStories timestamps to determine age. IDs not in seenStories are
 * kept (they may have been hidden/dismissed before being marked as seen).
 */
export function pruneOldIds(ids: Set<string>, seenStories: SeenStories): void {
  const nowSec = Math.floor(Date.now() / 1000);
  for (const id of ids) {
    const seenAt = seenStories[id];
    if (typeof seenAt === 'number' && nowSec - seenAt > PRUNE_AGE_SEC) {
      ids.delete(id);
    }
  }
}

/** Build the defaults object for chrome.storage.sync.get */
function storageDefaults(): Record<string, unknown> {
  return {
    storageVersion: 0,
    // Simple (non-chunked) keys
    ciKeywords: [],
    csKeywords: [],
    domains: [],
    dimmedEntries: [],
    undimmedEntries: [],
    recentlySeen: {},
    showUnseen: true,
    seenIds: null, // legacy single-key format
    seenStories: null, // legacy compact format
    seenIds_0: [], // legacy chunk key (old scheme)
    // Chunked keys
    ...chunkedDefaults(),
  };
}

/** Collect all chunk key names for reset/cleanup */
export function allChunkKeys(): string[] {
  const keys: string[] = [];
  for (const field of Object.values(chunkedFields)) {
    for (let i = 0; i < field.maxChunks; i++) {
      keys.push(chunkKey(field.key, i));
    }
  }
  return keys;
}

/**
 * One-time migration: re-save all data in the chunked format and clean up
 * legacy keys.  Called when storageVersion < STORAGE_VERSION.
 */
export function migrateStorage(
  items: StorageItems,
  seenStories: SeenStories,
  hiddenIds: Set<string>,
  dismissedIds: Set<string>,
  previousPageRanks: PageRanks,
  rankDiffChangedAt: RankDiffMap,
): void {
  // Re-save everything using the chunked format
  saveSeenStories(seenStories);
  saveHiddenIds(hiddenIds);
  saveDismissedIds(dismissedIds);
  savePageRanks(previousPageRanks);
  saveRankDiffs(rankDiffChangedAt);

  // Remove legacy keys
  const legacyKeys: string[] = [];
  if (items.seenStories) legacyKeys.push('seenStories');
  if (items.seenIds) legacyKeys.push('seenIds');
  if (items.seenIds_0) legacyKeys.push('seenIds_0');
  if (legacyKeys.length > 0) chrome.storage.sync.remove(legacyKeys);

  // Stamp the version
  chrome.storage.sync.set({ storageVersion: STORAGE_VERSION });
}

/** Load all extension data from sync storage */
export function loadAll(callback: (items: StorageItems) => void): void {
  chrome.storage.sync.get(storageDefaults(), (items) => callback(items as unknown as StorageItems));
}

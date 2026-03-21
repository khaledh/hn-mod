// Chrome sync storage helpers with compact format conversion

export const MAX_ENTRIES = 500;
export const SEEN_CHUNKS = 3;
export const CHUNK_SIZE = 800;
export const MAX_SEEN_IDS = SEEN_CHUNKS * CHUNK_SIZE; // 2400
export const PRUNE_AGE_SEC = 72 * 60 * 60; // 72 hours

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

export interface StorageItems {
  ciKeywords: string[];
  csKeywords: string[];
  domains: string[];
  dimmedEntries: string[];
  undimmedEntries: string[];
  previousPageRanks: PageRanks;
  rankDiffChangedAt: Record<string, string[]>;
  recentlySeen: Record<string, string[]>;
  hiddenIds: number[];
  showUnseen: boolean;
  seenIds: number[] | null;
  seenStories: Record<string, string[]> | null;
  [key: `seenIds_${number}`]: number[];
}

// --- Seen stories ---
// Storage: split across multiple keys to stay under 8KB per-item limit:
//   seenIds_0, seenIds_1, ...: flat number arrays (~800 IDs each)
//   recentlySeen: { timestamp: [id, ...], ... } — compact map (only stories still fading)
// In-memory: { id: timestamp | true, ... }
//   timestamp = still fading (within 30 min), true = seen and fully faded

/** Seen chunk key names */
export function seenChunkKey(i: number): `seenIds_${number}` {
  return `seenIds_${i}`;
}

/** Load seen data from chunked storage keys into a single in-memory map */
export function loadSeenStories(items: Partial<StorageItems>): SeenStories {
  const map: SeenStories = {};
  // Merge all chunks
  for (let i = 0; i < SEEN_CHUNKS; i++) {
    const chunk = items[seenChunkKey(i)] || [];
    for (const id of chunk) map[String(id)] = true;
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

/** Save seen data, splitting IDs across chunked keys + recentlySeen */
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

  // Cap IDs array (FIFO: remove oldest from front)
  if (ids.length > MAX_SEEN_IDS) ids.splice(0, ids.length - MAX_SEEN_IDS);

  // Split into chunks
  const data: Record<string, string[] | Record<string, string[]> | number[]> = {
    recentlySeen: recent,
  };
  for (let i = 0; i < SEEN_CHUNKS; i++) {
    data[seenChunkKey(i)] = ids.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
  }

  chrome.storage.sync.set(data);
}

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

// --- Persistence ---

export function saveRankDiffs(rankDiffChangedAt: RankDiffMap): void {
  chrome.storage.sync.set({ rankDiffChangedAt: compactRankDiffs(rankDiffChangedAt) });
}

export function savePageRanks(previousPageRanks: PageRanks): void {
  chrome.storage.sync.set({ previousPageRanks });
}

export function saveDimState(dimmedEntries: string[], undimmedEntries: string[]): void {
  chrome.storage.sync.set({ dimmedEntries, undimmedEntries });
}

export function saveHiddenIds(hiddenIds: Set<string>): void {
  const arr = [...hiddenIds].map(Number);
  if (arr.length > MAX_SEEN_IDS) arr.splice(0, arr.length - MAX_SEEN_IDS);
  chrome.storage.sync.set({ hiddenIds: arr });
}

// --- Maintenance ---

/** Trim an array to the last `max` entries (queue semantics: oldest removed first) */
export function capArray<T>(arr: T[], max = MAX_ENTRIES): void {
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
    // Prune if never seen, or if seen with a timestamp older than prune window
    if (seenAt === undefined || (typeof seenAt === 'number' && nowSec - seenAt > PRUNE_AGE_SEC)) {
      delete previousPageRanks[id];
    }
  }
}

/** Build the defaults object for chrome.storage.sync.get */
function storageDefaults(): Partial<StorageItems> {
  const defaults: Partial<StorageItems> = {
    ciKeywords: [],
    csKeywords: [],
    domains: [],
    dimmedEntries: [],
    undimmedEntries: [],
    previousPageRanks: {},
    rankDiffChangedAt: {},
    recentlySeen: {},
    hiddenIds: [],
    showUnseen: true,
    seenIds: null, // legacy single-key format
    seenStories: null, // legacy compact format
  };
  for (let i = 0; i < SEEN_CHUNKS; i++) {
    defaults[seenChunkKey(i)] = [];
  }
  return defaults;
}

/** Load all extension data from sync storage */
export function loadAll(callback: (items: StorageItems) => void): void {
  // chrome.storage.sync.get returns { [key: string]: unknown }; we know the shape from defaults
  chrome.storage.sync.get(storageDefaults(), (items) => callback(items as unknown as StorageItems));
}

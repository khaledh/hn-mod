// Chrome sync storage helpers with compact format conversion

export const MAX_ENTRIES = 500;
export const PRUNE_AGE_SEC = 72 * 60 * 60; // 72 hours

// --- Compact format: seenStories ---
// Storage:  { timestamp: [id, ...], ... }  (groups IDs sharing a timestamp)
// In-memory: { id: timestamp, ... }        (flat map for fast lookup)

export function expandSeenStories(compact) {
  const flat = {};
  for (const [ts, ids] of Object.entries(compact)) {
    const t = parseInt(ts);
    for (const id of ids) flat[id] = t;
  }
  return flat;
}

export function compactSeenStories(flat) {
  const grouped = {};
  for (const [id, ts] of Object.entries(flat)) {
    const key = String(ts);
    (grouped[key] ??= []).push(id);
  }
  return grouped;
}

// --- Compact format: rankDiffChangedAt ---
// Storage:  { "diff,timestamp": [id, ...], ... }
// In-memory: { id: { d: diff, t: timestamp }, ... }

export function expandRankDiffs(compact) {
  const flat = {};
  for (const [key, ids] of Object.entries(compact)) {
    const [d, t] = key.split(',').map(Number);
    for (const id of ids) flat[id] = { d, t };
  }
  return flat;
}

export function compactRankDiffs(flat) {
  const grouped = {};
  for (const [id, { d, t }] of Object.entries(flat)) {
    const key = `${d},${t}`;
    (grouped[key] ??= []).push(id);
  }
  return grouped;
}

// --- Persistence ---

export function saveSeenStories(seenStories) {
  chrome.storage.sync.set({ seenStories: compactSeenStories(seenStories) });
}

export function saveRankDiffs(rankDiffChangedAt) {
  chrome.storage.sync.set({ rankDiffChangedAt: compactRankDiffs(rankDiffChangedAt) });
}

export function savePageRanks(previousPageRanks) {
  chrome.storage.sync.set({ previousPageRanks });
}

export function saveDimState(dimmedEntries, undimmedEntries) {
  chrome.storage.sync.set({ dimmedEntries, undimmedEntries });
}

// --- Maintenance ---

/** Trim an array to the last `max` entries (queue semantics: oldest removed first) */
export function capArray(arr, max = MAX_ENTRIES) {
  if (arr.length > max) arr.splice(0, arr.length - max);
}

/** Trim a map to `max` entries, keeping those with the highest sort values */
export function capMap(map, max, valueFn) {
  const entries = Object.entries(map);
  if (entries.length <= max) return;
  entries.sort((a, b) => valueFn(a[1]) - valueFn(b[1]));
  for (const [id] of entries.slice(0, entries.length - max)) {
    delete map[id];
  }
}

/** Remove entries older than PRUNE_AGE_SEC from seenStories and previousPageRanks */
export function pruneOldEntries(seenStories, previousPageRanks) {
  const nowSec = Math.floor(Date.now() / 1000);
  for (const id of Object.keys(seenStories)) {
    if (nowSec - seenStories[id] > PRUNE_AGE_SEC) {
      delete seenStories[id];
      delete previousPageRanks[id];
    }
  }
}

/** Load all extension data from sync storage */
export function loadAll(callback) {
  chrome.storage.sync.get(
    {
      ciKeywords: [], csKeywords: [], domains: [],
      dimmedEntries: [], undimmedEntries: [],
      previousPageRanks: {}, rankDiffChangedAt: {}, seenStories: {},
    },
    callback,
  );
}

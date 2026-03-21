// Chrome sync storage helpers with compact format conversion

export const MAX_ENTRIES = 500;
export const MAX_SEEN_IDS = 900;
export const PRUNE_AGE_SEC = 72 * 60 * 60; // 72 hours

const FADE_SEC = 30 * 60; // 30 minutes

// --- Seen stories ---
// Storage: two keys for efficiency:
//   seenIds:      [47372072, ...]              — flat number array (all seen IDs, no timestamps)
//   recentlySeen: { timestamp: [id, ...], ... } — compact map (only stories still fading)
// In-memory: { id: timestamp | true, ... }
//   timestamp = still fading (within 30 min), true = seen and fully faded

/** Load seen data from both storage keys into a single in-memory map */
export function loadSeenStories(seenIds, recentlySeen) {
  const map = {};
  for (const id of seenIds) map[String(id)] = true;
  // Recent entries overwrite with actual timestamps (for fade calculation)
  for (const [ts, ids] of Object.entries(recentlySeen)) {
    const t = parseInt(ts);
    for (const id of ids) map[id] = t;
  }
  return map;
}

/** Save seen data, splitting into seenIds (all) + recentlySeen (fading only) */
export function saveSeenStories(seenStories) {
  const nowSec = Math.floor(Date.now() / 1000);
  const ids = [];
  const recent = {};

  for (const [id, val] of Object.entries(seenStories)) {
    ids.push(Number(id));
    if (typeof val === 'number' && nowSec - val < FADE_SEC) {
      const key = String(val);
      (recent[key] ??= []).push(id);
    }
  }

  // Cap IDs array (FIFO: remove oldest from front)
  if (ids.length > MAX_SEEN_IDS) ids.splice(0, ids.length - MAX_SEEN_IDS);

  chrome.storage.sync.set({ seenIds: ids, recentlySeen: recent });
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

export function saveRankDiffs(rankDiffChangedAt) {
  chrome.storage.sync.set({ rankDiffChangedAt: compactRankDiffs(rankDiffChangedAt) });
}

export function savePageRanks(previousPageRanks) {
  chrome.storage.sync.set({ previousPageRanks });
}

export function saveDimState(dimmedEntries, undimmedEntries) {
  chrome.storage.sync.set({ dimmedEntries, undimmedEntries });
}

export function saveHiddenIds(hiddenIds) {
  const arr = [...hiddenIds].map(Number);
  if (arr.length > MAX_SEEN_IDS) arr.splice(0, arr.length - MAX_SEEN_IDS);
  chrome.storage.sync.set({ hiddenIds: arr });
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

/** Remove previousPageRanks entries older than PRUNE_AGE_SEC (based on seenStories timestamps) */
export function pruneOldRanks(seenStories, previousPageRanks) {
  const nowSec = Math.floor(Date.now() / 1000);
  for (const id of Object.keys(previousPageRanks)) {
    const seenAt = seenStories[id];
    // Prune if never seen, or if seen with a timestamp older than prune window
    if (seenAt === undefined || (typeof seenAt === 'number' && nowSec - seenAt > PRUNE_AGE_SEC)) {
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
      previousPageRanks: {}, rankDiffChangedAt: {},
      seenIds: [], recentlySeen: {}, hiddenIds: [],
      seenStories: null, // legacy key for migration
    },
    callback,
  );
}

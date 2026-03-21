// Chrome sync storage helpers with compact format conversion

export const MAX_ENTRIES = 500;
export const SEEN_CHUNKS = 3;
export const CHUNK_SIZE = 800;
export const MAX_SEEN_IDS = SEEN_CHUNKS * CHUNK_SIZE; // 2400
export const PRUNE_AGE_SEC = 72 * 60 * 60; // 72 hours

const FADE_SEC = 30 * 60; // 30 minutes

// --- Seen stories ---
// Storage: split across multiple keys to stay under 8KB per-item limit:
//   seenIds_0, seenIds_1, ...: flat number arrays (~800 IDs each)
//   recentlySeen: { timestamp: [id, ...], ... } — compact map (only stories still fading)
// In-memory: { id: timestamp | true, ... }
//   timestamp = still fading (within 30 min), true = seen and fully faded

/** Seen chunk key names */
export function seenChunkKey(i) { return `seenIds_${i}`; }

/** Load seen data from chunked storage keys into a single in-memory map */
export function loadSeenStories(items) {
  const map = {};
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

  // Split into chunks
  const data = { recentlySeen: recent };
  for (let i = 0; i < SEEN_CHUNKS; i++) {
    data[seenChunkKey(i)] = ids.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
  }

  // Remove legacy single key if present
  chrome.storage.sync.remove('seenIds');
  chrome.storage.sync.set(data);
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

/** Merge story IDs from the current /hidden page into the local set,
 *  and listen for un-hide clicks to remove IDs from storage. */
export function syncHiddenIdsFromPage(hiddenIds) {
  let changed = false;
  for (const row of document.querySelectorAll('tr.athing')) {
    const id = row.getAttribute('id');
    if (id && !hiddenIds.has(id)) {
      hiddenIds.add(id);
      changed = true;
    }
  }
  if (changed) saveHiddenIds(hiddenIds);

  // Catch un-hide clicks before page navigates/reloads
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href*="hide?"]');
    if (!link) return;
    const match = link.href.match(/id=(\d+)/);
    if (match && hiddenIds.has(match[1])) {
      hiddenIds.delete(match[1]);
      saveHiddenIds(hiddenIds);
    }
  });
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
  const defaults = {
    ciKeywords: [], csKeywords: [], domains: [],
    dimmedEntries: [], undimmedEntries: [],
    previousPageRanks: {}, rankDiffChangedAt: {},
    recentlySeen: {}, hiddenIds: [], showUnseen: true,
    seenIds: null,      // legacy single-key format
    seenStories: null,  // legacy compact format
  };
  // Add chunk keys
  for (let i = 0; i < SEEN_CHUNKS; i++) {
    defaults[seenChunkKey(i)] = [];
  }
  chrome.storage.sync.get(defaults, callback);
}

// HN Mod — entry point
//
// Loads persisted state from chrome.storage.sync, then initializes
// each feature module: dimming, colorization, and new/trending indicators.

import {
  loadAll, loadSeenStories, expandRankDiffs,
  capArray, pruneOldRanks,
} from './storage.js';
import { adjustTitlesAndPersistDimming } from './dimming.js';
import { colorizePoints } from './colorize.js';
import { markNewAndTrendingStories, observeNewRows } from './indicators.js';
import { showUnseenStories } from './unseen.js';

loadAll((items) => {
  let seenStories;

  if (items.seenStories) {
    // Migrate from legacy compact format: { timestamp: [id, ...] }
    seenStories = {};
    for (const [ts, ids] of Object.entries(items.seenStories)) {
      const t = parseInt(ts);
      for (const id of ids) seenStories[id] = t;
    }
    chrome.storage.sync.remove('seenStories');
  } else {
    seenStories = loadSeenStories(items.seenIds, items.recentlySeen);
  }

  const rankDiffChangedAt = expandRankDiffs(items.rankDiffChangedAt);
  const hiddenIds = new Set(items.hiddenIds.map(String));

  capArray(items.dimmedEntries);
  capArray(items.undimmedEntries);
  pruneOldRanks(seenStories, items.previousPageRanks);

  adjustTitlesAndPersistDimming({
    ciKeywords: items.ciKeywords,
    csKeywords: items.csKeywords,
    domains: items.domains,
    dimmedEntries: items.dimmedEntries,
    undimmedEntries: items.undimmedEntries,
  });

  colorizePoints();

  markNewAndTrendingStories(items.previousPageRanks, rankDiffChangedAt, seenStories);
  observeNewRows(items.previousPageRanks, rankDiffChangedAt, seenStories, hiddenIds);
  showUnseenStories(seenStories, hiddenIds);
});

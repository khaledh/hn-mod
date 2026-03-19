// HN Mod — entry point
//
// Loads persisted state from chrome.storage.sync, then initializes
// each feature module: dimming, colorization, and new/trending indicators.

import {
  loadAll, expandSeenStories, expandRankDiffs,
  capArray, pruneOldEntries,
} from './storage.js';
import { adjustTitlesAndPersistDimming } from './dimming.js';
import { colorizePoints } from './colorize.js';
import { markNewAndTrendingStories, observeNewRows } from './indicators.js';

loadAll((items) => {
  const seenStories = expandSeenStories(items.seenStories);
  const rankDiffChangedAt = expandRankDiffs(items.rankDiffChangedAt);

  capArray(items.dimmedEntries);
  capArray(items.undimmedEntries);
  pruneOldEntries(seenStories, items.previousPageRanks);

  adjustTitlesAndPersistDimming({
    ciKeywords: items.ciKeywords,
    csKeywords: items.csKeywords,
    domains: items.domains,
    dimmedEntries: items.dimmedEntries,
    undimmedEntries: items.undimmedEntries,
  });

  colorizePoints();

  markNewAndTrendingStories(items.previousPageRanks, rankDiffChangedAt, seenStories);
  observeNewRows(items.previousPageRanks, rankDiffChangedAt, seenStories);
});

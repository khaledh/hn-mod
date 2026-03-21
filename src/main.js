// HN Mod — entry point
//
// Loads persisted state from chrome.storage.sync, then initializes
// each feature module: dimming, colorization, and new/trending indicators.

import {
  loadAll, loadSeenStories, expandRankDiffs,
  capArray, pruneOldRanks, syncHiddenIdsFromPage, saveHiddenIds,
} from './storage.js';
import { isHiddenPage } from './page.js';
import { adjustTitlesAndPersistDimming } from './dimming.js';
import { colorizePoints } from './colorize.js';
import { markNewAndTrendingStories, observeNewRows, addSeenLinks } from './indicators.js';
import { showUnseenStories } from './unseen.js';

loadAll((items) => {
  // Handles all formats: chunked (seenIds_0..N), legacy single (seenIds), legacy compact (seenStories)
  const seenStories = loadSeenStories(items);

  // Clean up legacy keys
  if (items.seenStories) chrome.storage.sync.remove('seenStories');
  if (items.seenIds) chrome.storage.sync.remove('seenIds');

  const rankDiffChangedAt = expandRankDiffs(items.rankDiffChangedAt);
  const hiddenIds = new Set(items.hiddenIds.map(String));

  // Sync hidden IDs from the DOM when user visits /hidden pages
  if (isHiddenPage()) {
    syncHiddenIdsFromPage(hiddenIds);
    return;
  }

  // Remove false positives: stories visible on the feed are clearly not hidden
  {
    let cleaned = false;
    for (const row of document.querySelectorAll('tr.athing')) {
      const id = row.getAttribute('id');
      if (id && hiddenIds.has(id)) {
        hiddenIds.delete(id);
        cleaned = true;
      }
    }
    if (cleaned) saveHiddenIds(hiddenIds);
  }

  capArray(items.dimmedEntries);
  capArray(items.undimmedEntries);
  pruneOldRanks(seenStories, items.previousPageRanks);

  const dimmingConfig = {
    ciKeywords: items.ciKeywords,
    csKeywords: items.csKeywords,
    domains: items.domains,
    dimmedEntries: items.dimmedEntries,
    undimmedEntries: items.undimmedEntries,
  };

  adjustTitlesAndPersistDimming(dimmingConfig);
  colorizePoints();

  if (items.showUnseen) showUnseenStories(seenStories, hiddenIds, dimmingConfig);
  markNewAndTrendingStories(items.previousPageRanks, rankDiffChangedAt, seenStories);
  addSeenLinks(seenStories);
  observeNewRows(items.previousPageRanks, rankDiffChangedAt, seenStories, hiddenIds, dimmingConfig);
});

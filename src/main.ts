// HN Mod — entry point
//
// Loads persisted state from chrome.storage.sync, then initializes
// each feature module: dimming, colorization, and new/trending indicators.

import { loadAll, loadSeenStories, expandRankDiffs, capArray, pruneOldRanks } from './storage.ts';
import { isHiddenPage, syncHiddenIdsFromPage, cleanHiddenIds } from './page.ts';
import { adjustTitlesAndPersistDimming } from './dimming.ts';
import { colorizePoints } from './colorize.ts';
import { markNewAndTrendingStories, observeNewRows, addSeenLinks } from './indicators.ts';
import { showUnseenStories } from './unseen.ts';
import { addFavicons } from './favicons.ts';

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
  cleanHiddenIds(hiddenIds);

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

  addFavicons();
  adjustTitlesAndPersistDimming(dimmingConfig);
  colorizePoints();

  if (items.showUnseen) showUnseenStories(seenStories, hiddenIds, dimmingConfig);
  markNewAndTrendingStories(items.previousPageRanks, rankDiffChangedAt, seenStories);
  addSeenLinks(seenStories);
  observeNewRows(items.previousPageRanks, rankDiffChangedAt, seenStories, hiddenIds, dimmingConfig);
});

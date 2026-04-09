// HN Mod — entry point
//
// Loads persisted state from chrome.storage.sync, then initializes
// each feature module: dimming, colorization, and new/trending indicators.

import {
  loadAll,
  loadSeenStories,
  loadChunked,
  chunkedFields,
  capArray,
  MAX_DIM_STATE_ENTRIES,
  pruneOldRanks,
  pruneOldIds,
  migrateStorage,
  STORAGE_VERSION,
} from './storage.ts';
import { isHiddenPage, syncHiddenIdsFromPage, cleanHiddenIds } from './page.ts';
import { adjustTitlesAndPersistDimming } from './dimming.ts';
import { colorizePoints } from './colorize.ts';
import { markNewAndTrendingStories, observeNewRows } from './indicators.ts';
import { showUnseenStories } from './unseen.ts';
import { addFavicons } from './favicons.ts';

loadAll((items) => {
  // Handles all formats: chunked, legacy single (seenIds), legacy compact (seenStories)
  const seenStories = loadSeenStories(items);

  const rawItems = items as unknown as Record<string, unknown>;
  const rankDiffChangedAt = loadChunked(chunkedFields.rankDiffChangedAt, rawItems);
  const hiddenIds = loadChunked(chunkedFields.hiddenIds, rawItems);
  const previousPageRanks = loadChunked(chunkedFields.previousPageRanks, rawItems);

  const dismissedIds = loadChunked(chunkedFields.dismissedIds, rawItems);

  // One-time migration: re-save all data in chunked format
  if ((items.storageVersion as number) < STORAGE_VERSION) {
    migrateStorage(items, seenStories, hiddenIds, dismissedIds, previousPageRanks, rankDiffChangedAt);
  }

  // Sync hidden IDs from the DOM when user visits /hidden pages
  if (isHiddenPage()) {
    syncHiddenIdsFromPage(hiddenIds);
    return;
  }

  // Remove false positives: stories visible on the feed are clearly not hidden
  cleanHiddenIds(hiddenIds);

  capArray(items.dimmedEntries as string[], MAX_DIM_STATE_ENTRIES);
  capArray(items.undimmedEntries as string[], MAX_DIM_STATE_ENTRIES);
  pruneOldRanks(seenStories, previousPageRanks);
  pruneOldIds(hiddenIds, seenStories);
  pruneOldIds(dismissedIds, seenStories);

  const dimmingConfig = {
    ciKeywords: items.ciKeywords as string[],
    csKeywords: items.csKeywords as string[],
    domains: items.domains as string[],
    dimmedEntries: items.dimmedEntries as string[],
    undimmedEntries: items.undimmedEntries as string[],
  };

  addFavicons();
  adjustTitlesAndPersistDimming(dimmingConfig);
  colorizePoints();

  if (items.showUnseen) showUnseenStories(seenStories, hiddenIds, dismissedIds, dimmingConfig);
  markNewAndTrendingStories(previousPageRanks, rankDiffChangedAt, seenStories);
  observeNewRows(previousPageRanks, rankDiffChangedAt, seenStories, hiddenIds, dimmingConfig);
});

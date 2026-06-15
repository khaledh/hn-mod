// New-story dots and rank trend arrows
//
// Red dots fade over 30 minutes using exponential decay from first seen.
// Trend arrows show rank changes vs previous page load, fading similarly
// but resetting to full intensity when the rank diff changes.

import { isFrontPage, isListingPage, getPageRanks, currentPageNumber } from './page.ts';
import { adjustTitlesAndPersistDimming } from './dimming.ts';
import { addFavicons } from './favicons.ts';
import { addHnSieveMetadata } from './hn-sieve.ts';
import { colorizePoints } from './colorize.ts';
import {
  FADE_SEC,
  saveSeenStories,
  saveRankDiffs,
  savePageRanks,
  saveHiddenIds,
  touchOrderedSet,
  capMap,
  MAX_RANK_DIFF_ENTRIES,
  MAX_TRACKED_STORIES,
  type SeenStories,
  type RankDiffMap,
  type PageRanks,
  type DimmingConfig,
} from './storage.ts';

let activeFillMissingStories: Promise<void> | null = null;

/** Exponential decay: e^(-3t) where t is normalized age (0..1) */
export function decay(ageSec: number): number {
  if (ageSec >= FADE_SEC) return 0;
  return Math.exp((-3 * ageSec) / FADE_SEC);
}

// --- Rank diff computation ---

/**
 * Compare current page ranks to previous page load.
 * Updates previousPageRanks and rankDiffChangedAt in place, then persists.
 */
export function computeRankDiffs(previousPageRanks: PageRanks, rankDiffChangedAt: RankDiffMap): void {
  const currentRanks = getPageRanks();
  const nowSec = Math.floor(Date.now() / 1000);

  for (const [id, rank] of Object.entries(currentRanks)) {
    if (previousPageRanks[id] !== undefined && previousPageRanks[id] !== rank) {
      const diff = previousPageRanks[id] - rank; // positive = moved up
      if (!rankDiffChangedAt[id] || rankDiffChangedAt[id].d !== diff) {
        rankDiffChangedAt[id] = { d: diff, t: nowSec };
      }
    }
    previousPageRanks[id] = rank;
  }

  // Remove fully faded entries
  for (const id of Object.keys(rankDiffChangedAt)) {
    if (nowSec - rankDiffChangedAt[id].t >= FADE_SEC) {
      delete rankDiffChangedAt[id];
    }
  }

  // Cap tracked story state and short-lived trend state separately.
  capMap(previousPageRanks, MAX_TRACKED_STORIES, (rank) => rank); // keep lowest ranks
  capMap(rankDiffChangedAt, MAX_RANK_DIFF_ENTRIES, (entry) => entry.t); // keep newest

  savePageRanks(previousPageRanks);
  saveRankDiffs(rankDiffChangedAt);
}

// --- DOM rendering ---

/** Build the indicator <td> for a story row (dot + optional trend arrow) */
export function buildIndicatorCell(
  entryId: string | null,
  rankDiffChangedAt: RankDiffMap,
  seenStories: SeenStories,
  renderTimeSec: number,
): HTMLTableCellElement {
  const td = document.createElement('td');
  td.className = 'hn-mod-indicator-cell';
  if (!entryId) return td;

  // Trend arrow
  const changedEntry = rankDiffChangedAt[entryId];
  let hasArrow = false;

  if (changedEntry) {
    const arrowOpacity = decay(renderTimeSec - changedEntry.t);
    if (arrowOpacity > 0) {
      const isUp = changedEntry.d > 0;
      hasArrow = true;

      const marker = document.createElement('span');
      marker.style.color = isUp ? '#228b22' : '#999';
      marker.style.opacity = arrowOpacity.toFixed(2);
      marker.style.verticalAlign = 'middle';

      const num = document.createElement('span');
      num.textContent = String(Math.abs(changedEntry.d));
      num.style.fontSize = '8px';

      const arrow = document.createElement('span');
      arrow.textContent = isUp ? '\u2b06' : '\u2b07';
      arrow.style.fontSize = '11px';

      marker.append(num, arrow);
      td.appendChild(marker);
    }
  }

  // New-story dot (always reserve space for alignment)
  const seenVal = seenStories.get(entryId);
  let dotOpacity = 0;
  if (seenVal === undefined) {
    dotOpacity = 1; // never seen
  } else if (typeof seenVal === 'number') {
    dotOpacity = decay(renderTimeSec - seenVal); // fading
  }
  // else: seenVal === true → fully faded, opacity stays 0

  const dot = document.createElement('span');
  dot.textContent = '\u2022';
  dot.className = 'hn-mod-dot';
  if (hasArrow) dot.classList.add('has-arrow');
  dot.style.opacity = (dotOpacity > 0 ? dotOpacity : 0).toFixed(2);
  dot.style.fontSize = `${(12 + 4 * dotOpacity).toFixed(1)}px`;
  td.appendChild(dot);

  return td;
}

/** Add an empty <td> (or increment colspan) to align non-story rows */
function addEmptyIndicatorToRow(tr: Element): void {
  if (tr.nodeType !== Node.ELEMENT_NODE || tr.tagName !== 'TR') return;
  if (tr.classList.contains('athing') || tr.querySelector('.hn-mod-indicator-cell')) return;
  if ((tr as HTMLElement).dataset.hnModAligned) return;

  const colspanTd = tr.querySelector('td[colspan]');
  if (colspanTd) {
    const current = parseInt(colspanTd.getAttribute('colspan') || '1');
    colspanTd.setAttribute('colspan', String(current + 1));
    (tr as HTMLElement).dataset.hnModAligned = '1';
  } else {
    const td = document.createElement('td');
    td.className = 'hn-mod-indicator-cell';
    tr.insertBefore(td, tr.firstChild);
  }
}

// --- HN pagination bug fix ---

interface ObserverContext {
  previousPageRanks: PageRanks;
  rankDiffChangedAt: RankDiffMap;
  seenStories: SeenStories;
  hiddenIds: Set<string>;
  dimmingConfig: DimmingConfig;
}

function prepareStoryRows(
  titleRow: Element,
  subRow: Element | null,
  spacerRow: Element | null,
  rankDiffChangedAt: RankDiffMap,
  seenStories: SeenStories,
  renderTimeSec: number,
): {
  titleRow: HTMLTableRowElement;
  subRow: HTMLTableRowElement | null;
  spacerRow: HTMLTableRowElement | null;
  storyId: string | null;
} {
  const storyId = titleRow.getAttribute('id');
  const newTitleRow = document.importNode(titleRow, true) as HTMLTableRowElement;
  const newSubRow = subRow ? (document.importNode(subRow, true) as HTMLTableRowElement) : null;
  const newSpacerRow = spacerRow ? (document.importNode(spacerRow, true) as HTMLTableRowElement) : null;

  ensureFavoriteLinkForRow(newSubRow, storyId);
  newTitleRow.insertBefore(
    buildIndicatorCell(storyId, rankDiffChangedAt, seenStories, renderTimeSec),
    newTitleRow.firstChild,
  );

  return {
    titleRow: newTitleRow,
    subRow: newSubRow,
    spacerRow: newSpacerRow,
    storyId,
  };
}

async function fillMissingStoriesFromPages(
  storyTable: Element,
  page: number,
  targetStoryCount: number,
  ctx: ObserverContext,
): Promise<void> {
  if (activeFillMissingStories) {
    return activeFillMissingStories;
  }

  const fillPromise = fillMissingStoriesFromPagesNow(storyTable, page, targetStoryCount, ctx).finally(
    () => {
      if (activeFillMissingStories === fillPromise) {
        activeFillMissingStories = null;
      }
    },
  );
  activeFillMissingStories = fillPromise;
  return fillPromise;
}

async function fillMissingStoriesFromPagesNow(
  storyTable: Element,
  page: number,
  targetStoryCount: number,
  ctx: ObserverContext,
): Promise<void> {
  const { previousPageRanks, rankDiffChangedAt, seenStories, hiddenIds, dimmingConfig } = ctx;
  const currentIds = getCurrentStoryIds(storyTable);
  if (currentIds.size >= targetStoryCount) return;

  try {
    const rowParent = storyTable.querySelector('tbody') ?? storyTable;
    let appended = false;

    for (let pageOffset = 0; pageOffset < 5 && currentIds.size < targetStoryCount; pageOffset += 1) {
      // First try this same page because HN renders it with the logged-in user's
      // hidden stories applied. If that has not settled yet, continue into later pages.
      const res = await fetch(`${window.location.pathname}?p=${page + pageOffset}`, {
        cache: 'no-store',
      });
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const rows = [...doc.querySelectorAll('tr.athing')];

      for (const row of rows) {
        if (currentIds.size >= targetStoryCount) break;

        const id = row.getAttribute('id');
        if (!id) continue;
        if (currentIds.has(id)) continue;
        if (hiddenIds.has(id)) continue;
        if (getCurrentStoryIds(storyTable).has(id)) {
          currentIds.add(id);
          continue;
        }

        const renderTimeSec = Math.floor(Date.now() / 1000);
        const prepared = prepareStoryRows(
          row,
          row.nextElementSibling,
          row.nextElementSibling?.nextElementSibling ?? null,
          rankDiffChangedAt,
          seenStories,
          renderTimeSec,
        );

        insertStoryRowsBeforeMore(rowParent, prepared.titleRow, prepared.subRow, prepared.spacerRow);

        currentIds.add(id);
        appended = true;

        if (prepared.storyId) {
          const rankEl = prepared.titleRow.querySelector('span.rank');
          const rank = parseInt(rankEl?.textContent || '');
          if (!isNaN(rank)) previousPageRanks[prepared.storyId] = rank;
          if (!seenStories.has(prepared.storyId)) {
            seenStories.set(prepared.storyId, renderTimeSec);
            saveSeenStories(seenStories);
          }
        }
      }
    }

    if (!appended) {
      return;
    }

    addFavicons();
    adjustTitlesAndPersistDimming(dimmingConfig);
    colorizePoints();
    void addHnSieveMetadata();
    renumberStories(storyTable, page);
    savePageRanks(previousPageRanks);
  } catch {
    /* ignore fetch errors */
  }
}

function getCurrentStoryIds(storyTable: Element): Set<string> {
  return new Set(
    [...storyTable.querySelectorAll<HTMLElement>('tr.athing[id]')]
      .map((row) => row.getAttribute('id'))
      .filter((id): id is string => Boolean(id)),
  );
}

export function insertStoryRowsBeforeMore(
  rowParent: Element,
  titleRow: HTMLTableRowElement,
  subRow: HTMLTableRowElement | null,
  spacerRow: HTMLTableRowElement | null,
): void {
  const moreRow = [...rowParent.querySelectorAll<HTMLAnchorElement>('a.morelink')]
    .map((link) => link.closest('tr'))
    .find((row): row is HTMLTableRowElement => row?.parentNode === rowParent) ?? null;
  const moreSpaceRow = moreRow?.previousElementSibling;
  const insertionAnchor = moreSpaceRow?.classList.contains('morespace') ? moreSpaceRow : moreRow;

  const insert = (row: HTMLTableRowElement | null) => {
    if (!row) return;
    if (insertionAnchor) {
      rowParent.insertBefore(row, insertionAnchor);
      return;
    }
    rowParent.append(row);
  };

  insert(titleRow);
  insert(subRow);
  insert(spacerRow);
}

/** Ensure dynamically swapped-in HN rows keep the logged-in favorite action. */
export function ensureFavoriteLinkForRow(subRow: Element | null, storyId: string | null): void {
  if (!subRow || !storyId) return;

  const subtext = subRow.querySelector<HTMLElement>('.subtext');
  if (!subtext) return;

  const hasFavorite = [...subtext.querySelectorAll<HTMLAnchorElement>('a')].some((link) => {
    const href = link.getAttribute('href') ?? '';
    return href.startsWith(`fave?id=${storyId}&`) || href.includes(`/fave?id=${storyId}&`);
  });
  if (hasFavorite) return;

  const authLink = [...subtext.querySelectorAll<HTMLAnchorElement>('a')].find((link) => {
    const href = link.getAttribute('href') ?? '';
    return href.includes(`id=${storyId}`) && href.includes('auth=');
  });
  const auth = authLink?.getAttribute('href')?.match(/[?&]auth=([^&]+)/)?.[1];
  if (!auth) return;

  const favoriteLink = document.createElement('a');
  favoriteLink.className = '__rhn__fave-button';
  favoriteLink.href = `fave?id=${storyId}&auth=${auth}`;
  favoriteLink.textContent = 'favorite';

  const commentsLink = [...subtext.querySelectorAll<HTMLAnchorElement>('a')].find((link) => {
    const href = link.getAttribute('href') ?? '';
    const text = link.textContent ?? '';
    return href === `item?id=${storyId}` && /comments?|discuss/i.test(text);
  });

  if (commentsLink) {
    const insertionParent = commentsLink.parentNode;
    if (insertionParent) {
      insertionParent.insertBefore(favoriteLink, commentsLink);
      insertionParent.insertBefore(document.createTextNode(' | '), commentsLink);
      return;
    }

    subtext.append(document.createTextNode(' | '), favoriteLink);
    return;
  }

  subtext.append(document.createTextNode(' | '), favoriteLink);
}

// --- DOM helpers ---

/** Renumber main feed stories sequentially after hides (HN doesn't renumber client-side) */
export function renumberStories(storyTable: Element, page: number): void {
  const startRank = (page - 1) * 30 + 1;
  let rank = startRank;
  for (const rankSpan of storyTable.querySelectorAll('tr.athing span.rank')) {
    if (rankSpan.closest('.hn-mod-unseen')) continue;
    rankSpan.textContent = `${rank}.`;
    rank++;
  }
}

/** Remove a story's three rows (title, subtext, spacer) from the DOM */
export function removeStoryRows(trTitle: Element): void {
  const trSub = trTitle.nextElementSibling;
  const trSpacer = trSub?.nextElementSibling;
  trTitle.remove();
  trSub?.remove();
  trSpacer?.remove();
}

/** Hide a story's three rows immediately (used to suppress flicker) */
function hideStoryRows(trTitle: HTMLElement): void {
  trTitle.style.display = 'none';
  const trSub = trTitle.nextElementSibling;
  if (trSub instanceof HTMLElement) trSub.style.display = 'none';
  const trSpacer = trSub?.nextElementSibling;
  if (trSpacer instanceof HTMLElement) trSpacer.style.display = 'none';
}

// --- Entry points ---

/** Insert indicator cells for all story rows and mark stories as seen */
export function markNewAndTrendingStories(
  previousPageRanks: PageRanks,
  rankDiffChangedAt: RankDiffMap,
  seenStories: SeenStories,
): void {
  if (!isListingPage()) return;

  const frontPage = isFrontPage();
  if (frontPage) computeRankDiffs(previousPageRanks, rankDiffChangedAt);

  // Freeze render time so indicators don't keep fading while the tab is open
  const renderTimeSec = Math.floor(Date.now() / 1000);

  for (const tr of document.querySelectorAll('tr.athing, tr.athing + tr, tr.spacer')) {
    if (tr.classList.contains('athing')) {
      const entryId = tr.getAttribute('id');
      const diffs = frontPage ? rankDiffChangedAt : {};
      tr.insertBefore(
        buildIndicatorCell(entryId, diffs, seenStories, renderTimeSec),
        tr.firstChild,
      );
    } else {
      addEmptyIndicatorToRow(tr);
    }
  }

  markVisibleStoriesAsSeen(seenStories);
}


/** Record all currently visible stories as seen */
function markVisibleStoriesAsSeen(seenStories: SeenStories): void {
  const nowSec = Math.floor(Date.now() / 1000);
  let updated = false;

  for (const row of document.querySelectorAll('.athing')) {
    const id = row.getAttribute('id');
    if (id && !seenStories.has(id)) {
      seenStories.set(id, nowSec);
      updated = true;
    }
  }

  if (updated) saveSeenStories(seenStories);
}

// --- Mutation observer ---

/** Handle rank adjustments when stories are hidden on front pages */
export function handleHideRankAdjustments(
  removedIds: string[],
  previousPageRanks: PageRanks,
  hiddenIds: Set<string>,
  suppressHiddenTracking: boolean,
): void {
  // Track hidden story IDs (skip during pagination fix replacements)
  if (!suppressHiddenTracking) {
    for (const id of removedIds) touchOrderedSet(hiddenIds, id);
    if (removedIds.length > 0) saveHiddenIds(hiddenIds);
  }

  // Decrement ranks of all stories below each removed story to suppress
  // false +1 diffs caused by personal hide actions
  for (const removedId of removedIds) {
    const removedRank = previousPageRanks[removedId];
    if (removedRank !== undefined) {
      for (const id of Object.keys(previousPageRanks)) {
        if (previousPageRanks[id] > removedRank) previousPageRanks[id]--;
      }
      delete previousPageRanks[removedId];
    }
  }

  // Add ranks for newly appeared stories (e.g. replacements after a hide)
  // without overwriting the adjusted ranks of existing stories
  const currentRanks = getPageRanks();
  for (const [id, rank] of Object.entries(currentRanks)) {
    if (previousPageRanks[id] === undefined) {
      previousPageRanks[id] = rank;
    }
  }
  savePageRanks(previousPageRanks);
}

/**
 * Watch for dynamically added/removed rows (e.g. hiding stories) and maintain
 * indicator cells and rank tracking data.
 */
export function observeNewRows(
  previousPageRanks: PageRanks,
  rankDiffChangedAt: RankDiffMap,
  seenStories: SeenStories,
  hiddenIds: Set<string>,
  dimmingConfig: DimmingConfig,
): void {
  const storyTable = document.querySelector('tr.athing')?.closest('table');
  if (!storyTable) return;

  let knownStoryIds = new Set(Object.keys(getPageRanks()));
  const targetStoryCount = knownStoryIds.size;
  let pendingPageFix = false; // set when a hide is detected on page 2+
  let suppressHiddenTracking = false; // suppress during pagination fix replacements
  const ctx: ObserverContext = {
    previousPageRanks,
    rankDiffChangedAt,
    seenStories,
    hiddenIds,
    dimmingConfig,
  };

  const observer = new MutationObserver((mutations) => {
    const renderTimeSec = Math.floor(Date.now() / 1000);
    const addedStoryNodes: HTMLElement[] = [];

    // Collect all added TR elements, including those nested inside containers
    const addedRows: HTMLElement[] = [];
    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.tagName === 'TR') {
          addedRows.push(node);
        } else {
          for (const tr of node.querySelectorAll<HTMLElement>('tr')) {
            addedRows.push(tr);
          }
        }
      }
    }

    for (const row of addedRows) {
      if (row.querySelector('.hn-mod-indicator-cell')) continue;

      if (row.classList.contains('athing')) {
        const entryId = row.getAttribute('id');
        const td = buildIndicatorCell(entryId, rankDiffChangedAt, seenStories, renderTimeSec);
        row.insertBefore(td, row.firstChild);
        if (entryId && !seenStories.has(entryId)) {
          seenStories.set(entryId, renderTimeSec);
          saveSeenStories(seenStories);
        }
        addedStoryNodes.push(row);
      } else {
        addEmptyIndicatorToRow(row);
      }
    }

    // Apply favicons, dimming, hn-sieve metadata, and seen links to newly added stories
    if (addedRows.length > 0) {
      void addHnSieveMetadata();
    }

    if (addedStoryNodes.length > 0) {
      addFavicons();
      adjustTitlesAndPersistDimming(dimmingConfig);
      colorizePoints();
    }

    // Adjust rank tracking when stories are hidden (front pages only)
    if (isFrontPage()) {
      const currentIds = new Set(Object.keys(getPageRanks()));
      const removedIds = [...knownStoryIds].filter((id) => !currentIds.has(id));

      handleHideRankAdjustments(removedIds, previousPageRanks, hiddenIds, suppressHiddenTracking);
      knownStoryIds = currentIds;

      if (removedIds.length > 0) {
        renumberStories(storyTable, currentPageNumber());
      }

      // Fix HN's pagination bug: on page 2+, HN adds the wrong story after a
      // hide. The removal and addition often arrive in separate observer batches,
      // so we use a flag to bridge them.
      const page = currentPageNumber();
      if (page > 1 && removedIds.length > 0) {
        pendingPageFix = true;
      }
      if (pendingPageFix && addedStoryNodes.length > 0) {
        pendingPageFix = false;
        const wrongNode = addedStoryNodes[addedStoryNodes.length - 1];
        hideStoryRows(wrongNode);
        suppressHiddenTracking = true;
        window.setTimeout(() => {
          removeStoryRows(wrongNode);
          fillMissingStoriesFromPages(storyTable, page, targetStoryCount, ctx).finally(() => {
            suppressHiddenTracking = false;
          });
        }, 150);
      }
    }
  });

  observer.observe(storyTable, { childList: true, subtree: true });
}

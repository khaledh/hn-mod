// New-story dots and rank trend arrows
//
// Red dots fade over 30 minutes using exponential decay from first seen.
// Trend arrows show rank changes vs previous page load, fading similarly
// but resetting to full intensity when the rank diff changes.

import { isFrontPage, isListingPage, getPageRanks } from './page.js';
import { adjustTitlesAndPersistDimming } from './dimming.js';
import {
  saveSeenStories, saveRankDiffs, savePageRanks, saveHiddenIds,
  capMap, MAX_ENTRIES,
} from './storage.js';

const FADE_SEC = 30 * 60; // 30 minutes

/** Exponential decay: e^(-3t) where t is normalized age (0..1) */
export function decay(ageSec) {
  if (ageSec >= FADE_SEC) return 0;
  return Math.exp(-3 * ageSec / FADE_SEC);
}

// --- Rank diff computation ---

/**
 * Compare current page ranks to previous page load.
 * Updates previousPageRanks and rankDiffChangedAt in place, then persists.
 */
function computeRankDiffs(previousPageRanks, rankDiffChangedAt) {
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

  // Cap to MAX_ENTRIES
  capMap(previousPageRanks, MAX_ENTRIES, rank => rank);         // keep lowest ranks
  capMap(rankDiffChangedAt, MAX_ENTRIES, entry => entry.t);     // keep newest

  savePageRanks(previousPageRanks);
  saveRankDiffs(rankDiffChangedAt);
}

// --- DOM rendering ---

/** Build the indicator <td> for a story row (dot + optional trend arrow) */
export function buildIndicatorCell(entryId, rankDiffChangedAt, seenStories, renderTimeSec) {
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
      num.textContent = Math.abs(changedEntry.d);
      num.style.fontSize = '8px';

      const arrow = document.createElement('span');
      arrow.textContent = isUp ? '\u2b06' : '\u2b07';
      arrow.style.fontSize = '11px';

      marker.append(num, arrow);
      td.appendChild(marker);
    }
  }

  // New-story dot (always reserve space for alignment)
  const seenVal = seenStories[entryId];
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
function addEmptyIndicatorToRow(tr) {
  if (!tr || tr.nodeType !== Node.ELEMENT_NODE || tr.tagName !== 'TR') return;
  if (tr.classList.contains('athing') || tr.querySelector('.hn-mod-indicator-cell')) return;

  const colspanTd = tr.querySelector('td[colspan]');
  if (colspanTd) {
    colspanTd.setAttribute('colspan', parseInt(colspanTd.getAttribute('colspan')) + 1);
  } else {
    tr.insertBefore(document.createElement('td'), tr.firstChild);
  }
}

// --- HN pagination bug fix ---

/**
 * On page 2+, HN's client-side JS adds the wrong story at the bottom after a
 * hide (always picks the next story as if on page 1). We fix this by fetching
 * the correct page from the server (which has the right state post-hide) and
 * swapping in the correct last story.
 */
async function fixWrongStoryOnPage(wrongNode, page, previousPageRanks, rankDiffChangedAt, seenStories, dimmingConfig) {
  try {
    const res = await fetch(`${window.location.pathname}?p=${page}`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const pageRows = doc.querySelectorAll('tr.athing');
    const lastCorrectRow = pageRows[pageRows.length - 1];
    if (!lastCorrectRow) return;

    const correctId = lastCorrectRow.getAttribute('id');
    const wrongId = wrongNode.getAttribute('id');
    if (wrongId === correctId) return; // already correct

    // On the last page, the server may return fewer stories after the hide,
    // so the "correct" last story is one already on our page — just remove
    // the wrong row instead of duplicating.
    if (document.getElementById(correctId)) {
      const wrongSub = wrongNode.nextElementSibling;
      const wrongSpacer = wrongSub?.nextElementSibling;
      wrongNode.remove();
      wrongSub?.remove();
      wrongSpacer?.remove();
      delete previousPageRanks[wrongId];
      savePageRanks(previousPageRanks);
      return;
    }

    // Extract the three rows (title, subtext, spacer) from the parsed page
    const correctSub = lastCorrectRow.nextElementSibling;
    const correctSpacer = correctSub?.nextElementSibling;

    const newTitleRow = document.adoptNode(lastCorrectRow);
    const newSubRow = correctSub ? document.adoptNode(correctSub) : null;
    const newSpacerRow = correctSpacer ? document.adoptNode(correctSpacer) : null;

    // Add indicator cell before inserting (prevents re-processing by observer).
    // Don't call addEmptyIndicatorToRow here — the observer will handle the
    // subtext/spacer rows when they're inserted, avoiding double colspan increment.
    const renderTimeSec = Math.floor(Date.now() / 1000);
    newTitleRow.insertBefore(
      buildIndicatorCell(correctId, rankDiffChangedAt, seenStories, renderTimeSec),
      newTitleRow.firstChild,
    );

    // Replace wrong rows in the DOM
    const wrongSub = wrongNode.nextElementSibling;
    const wrongSpacer = wrongSub?.nextElementSibling;

    wrongNode.replaceWith(newTitleRow);
    if (wrongSub && newSubRow) wrongSub.replaceWith(newSubRow);
    if (wrongSpacer && newSpacerRow) wrongSpacer.replaceWith(newSpacerRow);

    // Apply dimming and seen links to the new row
    if (dimmingConfig) adjustTitlesAndPersistDimming(dimmingConfig);
    addSeenLinks(seenStories);

    // Update rank tracking
    delete previousPageRanks[wrongId];
    const rankEl = newTitleRow.querySelector('span.rank');
    if (rankEl) {
      const rank = parseInt(rankEl.textContent);
      if (!isNaN(rank)) previousPageRanks[correctId] = rank;
    }
    savePageRanks(previousPageRanks);

    if (correctId && seenStories[correctId] === undefined) {
      seenStories[correctId] = renderTimeSec;
      saveSeenStories(seenStories);
    }
  } catch { /* ignore fetch errors */ }
}

// --- Entry points ---

/** Insert indicator cells for all story rows and mark stories as seen */
export function markNewAndTrendingStories(previousPageRanks, rankDiffChangedAt, seenStories) {
  if (!isListingPage()) return;

  const frontPage = isFrontPage();
  if (frontPage) computeRankDiffs(previousPageRanks, rankDiffChangedAt);

  // Freeze render time so indicators don't keep fading while the tab is open
  const renderTimeSec = Math.floor(Date.now() / 1000);

  for (const tr of document.querySelectorAll('tr.athing, tr.athing + tr, tr.spacer')) {
    if (tr.classList.contains('athing')) {
      const entryId = tr.getAttribute('id');
      const diffs = frontPage ? rankDiffChangedAt : {};
      tr.insertBefore(buildIndicatorCell(entryId, diffs, seenStories, renderTimeSec), tr.firstChild);
    } else {
      addEmptyIndicatorToRow(tr);
    }
  }

  markVisibleStoriesAsSeen(seenStories);
}

/** Add "seen" links to all story subtext rows */
export function addSeenLinks(seenStories) {
  for (const trTitle of document.querySelectorAll('tr.athing')) {
    const entryId = trTitle.getAttribute('id');
    if (!entryId) continue;

    const trSub = trTitle.nextElementSibling;
    const tdSubtext = trSub?.querySelector('td.subtext');
    if (!tdSubtext || tdSubtext.querySelector('.seenLink')) continue;

    // Only show for stories that aren't already fully seen
    if (seenStories[entryId] === true) continue;

    const link = document.createElement('a');
    link.href = '#';
    link.className = 'seenLink';
    link.textContent = 'seen';
    link.onclick = (e) => {
      e.preventDefault();
      seenStories[entryId] = true;
      saveSeenStories(seenStories);

      // Update all rows with this story ID (main page + unseen panel)
      for (const row of document.querySelectorAll(`tr.athing[id="${entryId}"]`)) {
        const dot = row.querySelector('.hn-mod-dot');
        if (dot) {
          dot.style.opacity = '0.00';
          dot.style.fontSize = '12.0px';
        }

        row.dispatchEvent(new CustomEvent('hn-mod-seen', { bubbles: true }));

        // Remove seen link from this row's subtext
        const seenLink = row.nextElementSibling?.querySelector('.seenLink');
        if (seenLink) {
          const prevText = seenLink.previousSibling;
          if (prevText?.nodeType === Node.TEXT_NODE) prevText.remove();
          seenLink.remove();
        }
      }
    };

    tdSubtext.appendChild(document.createTextNode(' | '));
    tdSubtext.appendChild(link);
  }
}

/** Record all currently visible stories as seen */
function markVisibleStoriesAsSeen(seenStories) {
  const nowSec = Math.floor(Date.now() / 1000);
  let updated = false;

  for (const row of document.querySelectorAll('.athing')) {
    const id = row.getAttribute('id');
    if (id && seenStories[id] === undefined) {
      seenStories[id] = nowSec;
      updated = true;
    }
  }

  if (updated) saveSeenStories(seenStories);
}

/**
 * Watch for dynamically added/removed rows (e.g. hiding stories) and maintain
 * indicator cells and rank tracking data.
 */
export function observeNewRows(previousPageRanks, rankDiffChangedAt, seenStories, hiddenIds, dimmingConfig) {
  const storyTable = document.querySelector('tr.athing')?.closest('table');
  if (!storyTable) return;

  let knownStoryIds = new Set(Object.keys(getPageRanks()));
  let pendingPageFix = false; // set when a hide is detected on page 2+
  let suppressHiddenTracking = false; // suppress during pagination fix replacements

  const observer = new MutationObserver(mutations => {
    const renderTimeSec = Math.floor(Date.now() / 1000);
    const addedStoryNodes = [];

    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {
        if (node?.nodeType !== Node.ELEMENT_NODE || node.tagName !== 'TR') continue;
        if (node.querySelector('.hn-mod-indicator-cell')) continue;

        if (node.classList.contains('athing')) {
          const entryId = node.getAttribute('id');
          const td = buildIndicatorCell(entryId, rankDiffChangedAt, seenStories, renderTimeSec);
          node.insertBefore(td, node.firstChild);
          if (entryId && seenStories[entryId] === undefined) {
            seenStories[entryId] = renderTimeSec;
            saveSeenStories(seenStories);
          }
          addedStoryNodes.push(node);
        } else {
          addEmptyIndicatorToRow(node);
        }
      }
    }

    // Apply dimming and seen links to newly added stories
    if (addedStoryNodes.length > 0) {
      adjustTitlesAndPersistDimming(dimmingConfig);
      addSeenLinks(seenStories);
    }

    // Adjust rank tracking when stories are hidden (front pages only)
    if (isFrontPage()) {
      const currentIds = new Set(Object.keys(getPageRanks()));
      const removedIds = [...knownStoryIds].filter(id => !currentIds.has(id));

      // Track hidden story IDs (skip during pagination fix replacements)
      if (!suppressHiddenTracking) {
        for (const id of removedIds) hiddenIds.add(id);
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

      // Merge current page ranks into the flat map
      Object.assign(previousPageRanks, getPageRanks());
      knownStoryIds = currentIds;
      savePageRanks(previousPageRanks);

      // Fix HN's pagination bug: on page 2+, HN adds the wrong story after a
      // hide. The removal and addition often arrive in separate observer batches,
      // so we use a flag to bridge them.
      const page = parseInt(new URLSearchParams(window.location.search).get('p') || '1');
      if (page > 1 && removedIds.length > 0) {
        pendingPageFix = true;
      }
      if (pendingPageFix && addedStoryNodes.length > 0) {
        pendingPageFix = false;
        const wrongNode = addedStoryNodes[addedStoryNodes.length - 1];
        // Hide wrong rows immediately to prevent flicker during async fetch
        const wrongSub = wrongNode.nextElementSibling;
        const wrongSpacer = wrongSub?.nextElementSibling;
        wrongNode.style.display = 'none';
        if (wrongSub) wrongSub.style.display = 'none';
        if (wrongSpacer) wrongSpacer.style.display = 'none';
        suppressHiddenTracking = true;
        fixWrongStoryOnPage(wrongNode, page, previousPageRanks, rankDiffChangedAt, seenStories, dimmingConfig)
          .finally(() => { suppressHiddenTracking = false; });
      }
    }
  });

  observer.observe(storyTable, { childList: true, subtree: true });
}

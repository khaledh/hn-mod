// New-story dots and rank trend arrows
//
// Red dots fade over 30 minutes using exponential decay from first seen.
// Trend arrows show rank changes vs previous page load, fading similarly
// but resetting to full intensity when the rank diff changes.

import { isFrontPage, isListingPage, getPageRanks } from './page.js';
import {
  saveSeenStories, saveRankDiffs, savePageRanks,
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
function buildIndicatorCell(entryId, rankDiffChangedAt, seenStories, renderTimeSec) {
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
  const seenAt = seenStories[entryId];
  let dotOpacity = 0;
  if (!seenAt) {
    dotOpacity = 1;
  } else {
    dotOpacity = decay(renderTimeSec - seenAt);
  }

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

/** Record all currently visible stories as seen */
function markVisibleStoriesAsSeen(seenStories) {
  const nowSec = Math.floor(Date.now() / 1000);
  let updated = false;

  for (const row of document.querySelectorAll('.athing')) {
    const id = row.getAttribute('id');
    if (id && !seenStories[id]) {
      seenStories[id] = nowSec;
      updated = true;
    }
  }

  if (updated) {
    capMap(seenStories, MAX_ENTRIES, ts => ts);
    saveSeenStories(seenStories);
  }
}

/**
 * Watch for dynamically added/removed rows (e.g. hiding stories) and maintain
 * indicator cells and rank tracking data.
 */
export function observeNewRows(previousPageRanks, rankDiffChangedAt, seenStories) {
  const storyTable = document.querySelector('tr.athing')?.closest('table');
  if (!storyTable) return;

  let knownStoryIds = new Set(Object.keys(getPageRanks()));

  const observer = new MutationObserver(mutations => {
    const renderTimeSec = Math.floor(Date.now() / 1000);

    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {
        if (node?.nodeType !== Node.ELEMENT_NODE || node.tagName !== 'TR') continue;
        if (node.querySelector('.hn-mod-indicator-cell')) continue;

        if (node.classList.contains('athing')) {
          const entryId = node.getAttribute('id');
          const td = buildIndicatorCell(entryId, rankDiffChangedAt, seenStories, renderTimeSec);
          node.insertBefore(td, node.firstChild);
          if (entryId && !seenStories[entryId]) {
            seenStories[entryId] = renderTimeSec;
            saveSeenStories(seenStories);
          }
        } else {
          addEmptyIndicatorToRow(node);
        }
      }
    }

    // Adjust rank tracking when stories are hidden (front pages only)
    if (isFrontPage()) {
      const currentIds = new Set(Object.keys(getPageRanks()));
      const removedIds = [...knownStoryIds].filter(id => !currentIds.has(id));

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
    }
  });

  observer.observe(storyTable, { childList: true, subtree: true });
}

// Page type detection and DOM helpers for Hacker News

import { saveHiddenIds } from './storage.js';

/** Front pages have ranked stories with trend tracking (/, /news) */
export function isFrontPage() {
  const path = window.location.pathname;
  return path === '/' || path === '/news';
}

/** Listing pages show ranked story rows */
const LISTING_PATHS = [
  '/',
  '/news',
  '/newest',
  '/front',
  '/show',
  '/shownew',
  '/ask',
  '/active',
  '/best',
  '/noobstories',
  '/classic',
  '/invited',
  '/pool',
  '/launches',
];
export function isListingPage() {
  return LISTING_PATHS.includes(window.location.pathname);
}

/** The /hidden page lists stories the user has hidden */
export function isHiddenPage() {
  return window.location.pathname === '/hidden';
}

/** Read displayed rank numbers from all story rows on the current page */
export function getPageRanks() {
  const ranks = {};
  for (const row of document.querySelectorAll('.athing')) {
    const id = row.getAttribute('id');
    const rankEl = row.querySelector('span.rank');
    if (id && rankEl) {
      const rank = parseInt(rankEl.textContent);
      if (!isNaN(rank)) ranks[id] = rank;
    }
  }
  return ranks;
}

/** Current page number from URL query string */
export function currentPageNumber() {
  return parseInt(new URLSearchParams(window.location.search).get('p') || '1');
}

/** Remove false-positive hidden IDs: stories visible on the feed aren't hidden */
export function cleanHiddenIds(hiddenIds) {
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

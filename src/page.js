// Page type detection for Hacker News

/** Front pages have ranked stories with trend tracking (/, /news) */
export function isFrontPage() {
  const path = window.location.pathname;
  return path === '/' || path === '/news';
}

/** Listing pages show ranked story rows */
const LISTING_PATHS = ['/', '/news', '/newest', '/front', '/show', '/shownew', '/ask', '/active', '/best', '/noobstories', '/classic', '/invited', '/pool', '/launches'];
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

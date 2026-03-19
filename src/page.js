// Page type detection for Hacker News

/** Front pages have ranked stories with trend tracking (/, /news) */
export function isFrontPage() {
  const path = window.location.pathname;
  return path === '/' || path === '/news';
}

/** Listing pages show story rows (everything except /item comment pages) */
export function isListingPage() {
  return window.location.pathname !== '/item';
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

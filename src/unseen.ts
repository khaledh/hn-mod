// Unseen stories panel
//
// Fetches top 500 story IDs from the HN API, compares against seen stories,
// and shows a collapsible section at the top of the page listing unseen ones.
// Story details are fetched lazily when the section is expanded.
// Rows are styled identically to HN's native story rows, with indicators.

import { isListingPage, currentPageNumber } from './page.ts';
import { removeStoryRows } from './indicators.ts';
import { intensityStyle, type IntensityStyle } from './colorize.ts';
import { adjustTitlesAndPersistDimming, isStoryDimmed } from './dimming.ts';
import { FADE_SEC, saveHiddenIds, saveDismissedIds, saveSeenStories, type SeenStories, type DimmingConfig } from './storage.ts';
import { fetchTopStoryIds, fetchStory, fetchAuthToken, type HNStory } from './api.ts';
import { addFavicons } from './favicons.ts';

function applyStyle(el: HTMLElement, style: IntensityStyle | null): void {
  if (!style) return;
  el.style.color = style.color;
  el.style.fontWeight = style.fontWeight;
}

const MAX_UNSEEN_SHOWN = 5;
const STORIES_PER_PAGE = 30;
const NO_NEW_STORIES_TEXT = 'No new stories';

interface UnseenEntry {
  id: number;
  rank: number;
}

function unseenSummaryText(count: number): string {
  return `${count} new ${count === 1 ? 'story' : 'stories'}`;
}

function buildNoNewStoriesMessage(): HTMLDivElement {
  return Object.assign(document.createElement('div'), {
    className: 'hn-mod-unseen',
    textContent: NO_NEW_STORIES_TEXT,
  });
}

function replaceWithNoNewStories(el: Element): void {
  el.replaceWith(buildNoNewStoriesMessage());
}

function storySiteText(story: HNStory): string | null {
  if (!story.url) return null;
  try {
    return new URL(story.url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isFreshlyUnseen(seenStories: SeenStories, id: string, nowSec: number): boolean {
  const seen = seenStories[id];
  return seen === undefined || (typeof seen === 'number' && nowSec - seen < FADE_SEC);
}

function mainFeedStoryIds(): Set<string> {
  return new Set(
    [...document.querySelectorAll('tr.athing')]
      .map((tr) => tr.getAttribute('id'))
      .filter((id): id is string => id !== null),
  );
}

function readMainFeedRank(feedId: string): number {
  const rankEl = document.querySelector(`tr.athing[id="${feedId}"] span.rank`);
  return rankEl ? parseInt(rankEl.textContent || '') : 0;
}

function isDimmedOnMainFeed(entryId: string, dimmingConfig: DimmingConfig): boolean {
  const row = document.querySelector<HTMLElement>(`tr.athing[id="${entryId}"]`);
  if (!row) return false;
  if (row.classList.contains('dimmed')) return true;
  return isStoryDimmed(
    entryId,
    row.querySelector<HTMLElement>('.titleline > a')?.innerText ??
      row.querySelector<HTMLElement>('.titleline > a')?.textContent ??
      null,
    row.querySelector<HTMLElement>('.sitestr')?.innerText ??
      row.querySelector<HTMLElement>('.sitestr')?.textContent ??
      null,
    dimmingConfig,
  );
}

/** Format Unix timestamp as relative time (e.g. "3 hours ago") */
function timeAgo(unixTime: number): string {
  const sec = Math.floor(Date.now() / 1000) - unixTime;
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min !== 1 ? 's' : ''} ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

// --- Action links (added after auth tokens load) ---

function addActionLinks(
  tdSubtext: HTMLElement,
  story: HNStory,
  hiddenIds: Set<string>,
  id: string,
  trTitle: HTMLElement,
): void {
  /** Fetch the auth token on first use, then cache it */
  let cachedToken: string | null = null;
  async function getToken(): Promise<string | null> {
    if (cachedToken) return cachedToken;
    cachedToken = await fetchAuthToken(story.id);
    return cachedToken;
  }

  for (const text of ['flag', 'hide', 'favorite'] as const) {
    tdSubtext.appendChild(document.createTextNode(' | '));
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = text;
    link.onclick = async (e) => {
      e.preventDefault();
      if (text === 'hide') {
        hiddenIds.add(id);
        saveHiddenIds(hiddenIds);
        trTitle.dispatchEvent(
          new CustomEvent('hn-mod-seen', { bubbles: true, detail: { hidden: true } }),
        );
        const mainHideLink = document.querySelector<HTMLAnchorElement>(
          `tr.athing[id="${id}"] ~ tr a[href^="hide?id=${id}&"]`,
        );
        if (mainHideLink && mainHideLink.closest('.hn-mod-unseen') === null) {
          mainHideLink.click();
        } else {
          const token = await getToken();
          if (token) {
            const url = `hide?id=${story.id}&auth=${token}&onop=news`;
            fetch(url.replace('hide', 'snip-story'));
          }
        }
      } else if (text === 'flag') {
        const token = await getToken();
        if (token) window.location.href = `flag?id=${story.id}&auth=${token}&goto=item?id=${story.id}`;
      } else {
        const token = await getToken();
        if (token) fetch(`fave?id=${story.id}&auth=${token}`);
      }
    };
    tdSubtext.appendChild(link);
  }
}

// --- Row building (matches HN's native DOM structure) ---

function buildStoryRows(
  story: HNStory,
  rank: number,
  dismissedIds: Set<string>,
): [HTMLTableRowElement, HTMLTableRowElement, HTMLTableRowElement] {
  const id = String(story.id);

  // Title row: dismiss × | rank | vote placeholder | title
  const trTitle = document.createElement('tr');
  trTitle.className = 'athing';
  trTitle.id = `hn-mod-${id}`;
  trTitle.dataset.storyId = id;

  const tdDismiss = document.createElement('td');
  tdDismiss.className = 'hn-mod-indicator-cell';
  const dismissBtn = document.createElement('a');
  dismissBtn.href = '#';
  dismissBtn.className = 'hn-mod-dismiss';
  dismissBtn.textContent = '\u00d7';
  dismissBtn.title = 'Dismiss';
  dismissBtn.onclick = (e) => {
    e.preventDefault();
    dismissedIds.add(id);
    saveDismissedIds(dismissedIds);
    trTitle.dispatchEvent(new CustomEvent('hn-mod-seen', { bubbles: true }));
  };
  tdDismiss.appendChild(dismissBtn);
  trTitle.appendChild(tdDismiss);

  const tdRank = document.createElement('td');
  tdRank.className = 'title';
  tdRank.setAttribute('valign', 'top');
  tdRank.setAttribute('align', 'right');
  const rankSpan = document.createElement('span');
  rankSpan.className = 'hn-mod-rank';
  rankSpan.textContent = `${rank}.`;
  tdRank.appendChild(rankSpan);
  trTitle.appendChild(tdRank);

  const tdVote = document.createElement('td');
  tdVote.className = 'votelinks';
  tdVote.setAttribute('valign', 'top');
  trTitle.appendChild(tdVote);

  const tdTitle = document.createElement('td');
  tdTitle.className = 'title';
  const titleLine = document.createElement('span');
  titleLine.className = 'titleline';
  const a = document.createElement('a');
  a.href = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
  a.target = '_blank';
  a.textContent = story.title;
  titleLine.appendChild(a);

  if (story.url) {
    try {
      const host = new URL(story.url).hostname.replace(/^www\./, '');
      const sitebit = document.createElement('span');
      sitebit.className = 'sitebit comhead';
      sitebit.innerHTML = ` (<a href="from?site=${host}"><span class="sitestr">${host}</span></a>)`;
      titleLine.appendChild(sitebit);
    } catch {
      /* skip invalid URLs */
    }
  }

  tdTitle.appendChild(titleLine);
  trTitle.appendChild(tdTitle);

  // Subtext row
  const trSub = document.createElement('tr');
  trSub.appendChild(document.createElement('td')); // indicator column spacer

  const tdEmpty = document.createElement('td');
  tdEmpty.setAttribute('colspan', '2');
  trSub.appendChild(tdEmpty);

  const tdSubtext = document.createElement('td');
  tdSubtext.className = 'subtext';

  const scoreSpan = document.createElement('span');
  scoreSpan.className = 'score';
  scoreSpan.id = `hn-mod-score_${story.id}`;
  scoreSpan.textContent = `${story.score || 0} points`;
  applyStyle(scoreSpan, intensityStyle(story.score || 0));
  tdSubtext.appendChild(scoreSpan);

  tdSubtext.appendChild(document.createTextNode(` by `));
  const byLink = document.createElement('a');
  byLink.href = `https://news.ycombinator.com/user?id=${story.by}`;
  byLink.textContent = story.by;
  tdSubtext.appendChild(byLink);

  if (story.time) {
    tdSubtext.appendChild(document.createTextNode(` ${timeAgo(story.time)} `));
  }

  // Comments link
  if (story.descendants !== undefined) {
    tdSubtext.appendChild(document.createTextNode(' | '));
    const commentsLink = document.createElement('a');
    commentsLink.href = `https://news.ycombinator.com/item?id=${story.id}`;
    commentsLink.textContent = `${story.descendants}\u00a0comments`;
    applyStyle(commentsLink, intensityStyle(story.descendants));
    tdSubtext.appendChild(commentsLink);
  }

  trSub.appendChild(tdSubtext);

  // Spacer row
  const trSpacer = document.createElement('tr');
  trSpacer.className = 'spacer';
  trSpacer.style.height = '5px';
  const tdSpacer = document.createElement('td');
  tdSpacer.setAttribute('colspan', '4');
  trSpacer.appendChild(tdSpacer);

  return [trTitle, trSub, trSpacer];
}

function updateRankSpansAfterHiddenRemoval(
  tbody: HTMLTableSectionElement,
  overflow: UnseenEntry[],
  removedRank: number,
): void {
  for (const rankSpan of tbody.querySelectorAll('span.hn-mod-rank')) {
    const rank = parseInt(rankSpan.textContent || '');
    if (!isNaN(rank) && rank > removedRank) {
      rankSpan.textContent = `${rank - 1}.`;
    }
  }
  for (const entry of overflow) {
    if (entry.rank > removedRank) entry.rank--;
  }
}

// --- Pagination ---

function addPaginationLinks(visibleCount: number): void {
  const page = currentPageNumber();
  const moreLink = document.querySelector<HTMLAnchorElement>('a.morelink');
  const minPages = moreLink ? page + 1 : page;
  const totalPages = Math.max(Math.ceil(visibleCount / STORIES_PER_PAGE), minPages);
  const basePath = window.location.pathname || '/';

  const td = document.createElement('td');
  td.className = 'hn-mod-pagination';
  td.style.paddingLeft = '10px';
  for (let p = 1; p <= totalPages; p++) {
    if (p > 1) td.appendChild(document.createTextNode('\u2003'));
    if (p === page) {
      const span = document.createElement('span');
      span.textContent = String(p);
      span.style.color = '#000';
      span.style.border = '1px solid #999';
      span.style.padding = '1px 5px';

      td.appendChild(span);
    } else {
      const a = document.createElement('a');
      a.href = `${basePath}?p=${p}`;
      a.textContent = String(p);
      a.style.color = '#336699';
      td.appendChild(a);
    }
  }

  if (moreLink) {
    moreLink.textContent = 'Next';
    moreLink.style.color = '#336699';
    const moreTd = moreLink.closest('td');
    if (moreTd) moreTd.after(td);
  } else {
    // Last page: no "More" link — insert pagination after the last spacer
    const storyTable = document.querySelector('tr.athing')?.closest('tbody');
    if (storyTable) {
      const tr = document.createElement('tr');
      const spacerTd = document.createElement('td');
      spacerTd.setAttribute('colspan', '2');
      tr.appendChild(spacerTd);
      tr.appendChild(td);
      storyTable.appendChild(tr);
    }
  }
}

// --- Unseen panel content loading ---

/** Append a story row to the panel tbody and wire up its action links */
async function appendStoryToPanel(
  entry: UnseenEntry,
  tbody: HTMLTableSectionElement,
  seenStories: SeenStories,
  hiddenIds: Set<string>,
  dismissedIds: Set<string>,
  dimmingConfig: DimmingConfig,
): Promise<boolean> {
  const story = await fetchStory(entry.id);
  if (!story) return false;

  const id = String(story.id);
  if (isStoryDimmed(id, story.title, storySiteText(story), dimmingConfig)) return false;

  if (seenStories[id] === undefined) {
    seenStories[id] = Math.floor(Date.now() / 1000);
    saveSeenStories(seenStories);
  }

  for (const row of buildStoryRows(story, entry.rank, dismissedIds)) {
    tbody.appendChild(row);
  }
  {
    const tr = tbody.querySelector<HTMLElement>(`tr.athing[id="hn-mod-${id}"]`);
    const tdSubtext = tr?.nextElementSibling?.querySelector<HTMLElement>('td.subtext');
    if (tdSubtext && tr) addActionLinks(tdSubtext, story, hiddenIds, id, tr);
  }
  addFavicons();
  adjustTitlesAndPersistDimming(dimmingConfig);
  return true;
}

async function appendNextVisibleStory(
  entries: UnseenEntry[],
  tbody: HTMLTableSectionElement,
  seenStories: SeenStories,
  hiddenIds: Set<string>,
  dismissedIds: Set<string>,
  dimmingConfig: DimmingConfig,
): Promise<number> {
  let skipped = 0;
  while (entries.length > 0) {
    const entry = entries.shift()!;
    if (
      await appendStoryToPanel(entry, tbody, seenStories, hiddenIds, dismissedIds, dimmingConfig)
    ) {
      return skipped;
    }
    skipped++;
  }
  return skipped;
}

function updateOverflowMessage(
  content: HTMLElement,
  moreDiv: HTMLDivElement | null,
  overflow: UnseenEntry[],
): HTMLDivElement | null {
  if (overflow.length > 0) {
    const el =
      moreDiv ??
      Object.assign(document.createElement('div'), {
        className: 'hn-mod-unseen-more',
      });
    if (!moreDiv) content.appendChild(el);
    el.textContent = `${overflow.length} more new ${overflow.length === 1 ? 'story' : 'stories'}`;
    return el;
  }
  moreDiv?.remove();
  return null;
}

/** Load initial stories into the panel */
async function loadPanelContent(
  content: HTMLElement,
  unseenEntries: UnseenEntry[],
  seenStories: SeenStories,
  hiddenIds: Set<string>,
  dismissedIds: Set<string>,
  dimmingConfig: DimmingConfig,
  summary: HTMLElement,
  details: HTMLDetailsElement,
): Promise<void> {
  content.textContent = 'Loading...';

  content.textContent = '';

  const table = document.createElement('table');
  table.className = 'itemlist';
  table.style.cssText = 'border-spacing: 0; border-collapse: collapse;';

  const tbody = document.createElement('tbody');
  const overflow = [...unseenEntries];
  for (let i = 0; i < MAX_UNSEEN_SHOWN && overflow.length > 0; i++) {
    await appendNextVisibleStory(
      overflow,
      tbody,
      seenStories,
      hiddenIds,
      dismissedIds,
      dimmingConfig,
    );
  }

  table.appendChild(tbody);
  content.appendChild(table);
  addFavicons();

  // Overflow message
  let moreDiv: HTMLDivElement | null = null;
  moreDiv = updateOverflowMessage(content, moreDiv, overflow);

  adjustTitlesAndPersistDimming(dimmingConfig);

  let unseenCount = tbody.querySelectorAll('tr.athing').length + overflow.length;
  if (unseenCount === 0) {
    replaceWithNoNewStories(details);
    return;
  }
  summary.textContent = unseenSummaryText(unseenCount);

  // When a story is hidden from the main feed, also remove it from the panel
  document.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement).closest?.('a[href^="hide?id="]');
    if (!link || link.closest('.hn-mod-unseen')) return;
    const match = link.getAttribute('href')?.match(/hide\?id=(\d+)/);
    if (!match) return;
    const id = match[1];
    const panelRow = table.querySelector<HTMLElement>(`tr.athing[data-story-id="${id}"]`);
    if (panelRow) {
      hiddenIds.add(id);
      saveHiddenIds(hiddenIds);
      panelRow.dispatchEvent(
        new CustomEvent('hn-mod-seen', { bubbles: true, detail: { hidden: true } }),
      );
    }
  });

  // Remove stories from the panel when marked as seen/hidden
  table.addEventListener('hn-mod-seen', async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const trTitle = target.closest('tr.athing');
    if (!trTitle) return;

    // Persist dismissal so the story doesn't reappear on reload.
    // Hidden stories are already tracked via hiddenIds, so skip those.
    const isHidden = e instanceof CustomEvent && e.detail?.hidden;
    if (!isHidden) {
      const storyId = (trTitle as HTMLElement).dataset.storyId;
      if (storyId) {
        dismissedIds.add(storyId);
        saveDismissedIds(dismissedIds);
      }
    }

    // Only decrement ranks when a story is hidden (removed from HN's ranking).
    // Marking as seen just removes it from the panel — it keeps its rank.
    if (isHidden) {
      const removedRankEl = trTitle.querySelector('span.hn-mod-rank');
      const removedRank = removedRankEl ? parseInt(removedRankEl.textContent || '') : NaN;
      if (!isNaN(removedRank)) {
        updateRankSpansAfterHiddenRemoval(tbody, overflow, removedRank);
      }
    }

    // Fetch the backfill story and wait for it BEFORE removing the old rows,
    // so the new row appears in the same paint frame — no visible gap.
    if (unseenCount > 1 && overflow.length > 0) {
      moreDiv = updateOverflowMessage(content, moreDiv, overflow);
      const skipped = await appendNextVisibleStory(
        overflow,
        tbody,
        seenStories,
        hiddenIds,
        dismissedIds,
        dimmingConfig,
      );
      unseenCount -= skipped;
    }

    removeStoryRows(trTitle);
    moreDiv = updateOverflowMessage(content, moreDiv, overflow);

    unseenCount--;
    if (unseenCount > 0) {
      summary.textContent = unseenSummaryText(unseenCount);
    } else {
      replaceWithNoNewStories(details);
    }
  });
}

// --- Main entry point ---

/**
 * Show a collapsible "unseen stories" section at the top of the page.
 */
export async function showUnseenStories(
  seenStories: SeenStories,
  hiddenIds: Set<string>,
  dismissedIds: Set<string>,
  dimmingConfig: DimmingConfig,
): Promise<void> {
  if (!isListingPage()) return;

  // Snapshot seen state before the async fetch, since markNewAndTrendingStories
  // may mutate seenStories while we await the API response
  const nowSec = Math.floor(Date.now() / 1000);
  const seenSnapshot = { ...seenStories };

  const topIds = await fetchTopStoryIds();

  // Filter out hidden stories first, then assign user-facing ranks
  let visibleIds = topIds.filter((id) => !hiddenIds.has(String(id)));

  // Detect server-side hidden stories: present in the API but missing from
  // the current page's expected rank range (hidden via HN's native interface)
  const page = currentPageNumber();
  const pageStart = (page - 1) * STORIES_PER_PAGE;
  const pageEnd = pageStart + STORIES_PER_PAGE;
  const mainFeedIds = mainFeedStoryIds();
  let hiddenUpdated = false;
  for (let i = pageStart; i < Math.min(pageEnd, visibleIds.length); i++) {
    const id = String(visibleIds[i]);
    if (!mainFeedIds.has(id)) {
      hiddenIds.add(id);
      hiddenUpdated = true;
    }
  }
  if (hiddenUpdated) {
    saveHiddenIds(hiddenIds);
    visibleIds = visibleIds.filter((id) => !hiddenIds.has(String(id)));
  }

  addPaginationLinks(visibleIds.length);

  // Include stories that are unseen or still within the fade period, excluding dismissed
  const visibleIdSet = new Set(visibleIds.map(String));
  const unseenEntries: UnseenEntry[] = [];
  for (let i = 0; i < visibleIds.length; i++) {
    const id = visibleIds[i];
    if (dismissedIds.has(String(id)) || isDimmedOnMainFeed(String(id), dimmingConfig)) continue;
    if (isFreshlyUnseen(seenSnapshot, String(id), nowSec)) {
      unseenEntries.push({ id, rank: i + 1 });
    }
  }

  // Supplement with new stories on the current page that aren't in the API's
  // top 500 (can happen when many stories are hidden, pushing lower-ranked
  // stories onto the page beyond the API's reach)
  for (const feedId of mainFeedIds) {
    if (
      !feedId ||
      visibleIdSet.has(feedId) ||
      dismissedIds.has(feedId) ||
      hiddenIds.has(feedId) ||
      isDimmedOnMainFeed(feedId, dimmingConfig)
    )
      continue;
    if (isFreshlyUnseen(seenSnapshot, feedId, nowSec)) {
      unseenEntries.push({ id: Number(feedId), rank: readMainFeedRank(feedId) });
    }
  }

  // Find insertion point
  const storyTable = document.querySelector('tr.athing')?.closest('table');
  if (!storyTable) return;

  const parentEl = storyTable.parentNode;
  if (!parentEl) return;

  if (unseenEntries.length === 0) {
    parentEl.insertBefore(buildNoNewStoriesMessage(), storyTable);
    return;
  }

  // Build collapsible section
  const details = document.createElement('details');
  details.className = 'hn-mod-unseen';

  // Restore collapse state (default: expanded)
  const stored = await new Promise<Record<string, boolean>>((resolve) =>
    chrome.storage.local.get({ unseenPanelOpen: true }, (items) =>
      resolve(items as Record<string, boolean>),
    ),
  );
  details.open = stored.unseenPanelOpen;

  const summary = document.createElement('summary');
  summary.className = 'hn-mod-unseen-summary';
  summary.textContent = unseenSummaryText(unseenEntries.length);
  details.appendChild(summary);

  const content = document.createElement('div');
  content.className = 'hn-mod-unseen-content';
  details.appendChild(content);

  // Lazy-load story details on first expand, persist collapse state
  let loaded = false;
  async function loadIfNeeded(): Promise<void> {
    if (loaded) return;
    loaded = true;
    details.classList.add('hn-mod-unseen-loading');
    try {
      await loadPanelContent(
        content,
        unseenEntries,
        seenStories,
        hiddenIds,
        dismissedIds,
        dimmingConfig,
        summary,
        details,
      );
    } finally {
      if (details.isConnected) details.classList.remove('hn-mod-unseen-loading');
    }
  }

  details.addEventListener('toggle', async () => {
    chrome.storage.local.set({ unseenPanelOpen: details.open });
    if (!details.open) return;
    await loadIfNeeded();
  });

  parentEl.insertBefore(details, storyTable);
  if (details.open) {
    summary.textContent = 'Loading...';
    await loadIfNeeded();
  }
}

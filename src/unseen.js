// Unseen stories panel
//
// Fetches top 500 story IDs from the HN API, compares against seen stories,
// and shows a collapsible section at the top of the page listing unseen ones.
// Story details are fetched lazily when the section is expanded.
// Rows are styled identically to HN's native story rows, with indicators.

import { isListingPage, currentPageNumber } from './page.js';
import { buildIndicatorCell, addSeenLinks, removeStoryRows } from './indicators.js';
import { intensityStyle } from './colorize.js';
import { adjustTitlesAndPersistDimming } from './dimming.js';
import { FADE_SEC, saveHiddenIds } from './storage.js';
import { fetchTopStoryIds, fetchStory, fetchAuthToken } from './api.js';

const MAX_UNSEEN_SHOWN = 5;
const STORIES_PER_PAGE = 30;

/** Format Unix timestamp as relative time (e.g. "3 hours ago") */
function timeAgo(unixTime) {
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

function addActionLinks(tdSubtext, story, authToken, hiddenIds, id, trTitle) {
  const itemUrl = `item?id=${story.id}`;
  const actions = [
    { text: 'flag', href: `flag?id=${story.id}&auth=${authToken}&goto=${itemUrl}` },
    { text: 'hide', href: `hide?id=${story.id}&auth=${authToken}&goto=news` },
    { text: 'favorite', href: `fave?id=${story.id}&auth=${authToken}` },
  ];
  for (const action of actions) {
    tdSubtext.appendChild(document.createTextNode(' | '));
    const link = document.createElement('a');
    link.href = action.href;
    link.textContent = action.text;
    if (action.text === 'hide') {
      link.onclick = (e) => {
        e.preventDefault();
        hiddenIds.add(id);
        saveHiddenIds(hiddenIds);
        trTitle.dispatchEvent(new CustomEvent('hn-mod-seen', { bubbles: true }));

        const mainHideLink = document.querySelector(
          `tr.athing[id="${id}"] ~ tr a.clicky[href^="hide?id=${id}&"]`,
        );
        if (mainHideLink && mainHideLink.closest('.hn-mod-unseen') === null) {
          mainHideLink.click();
        } else {
          const snipUrl = link.href.replace('/hide', '/snip-story').replace('goto', 'onop');
          fetch(snipUrl);
        }
      };
    }
    tdSubtext.appendChild(link);
  }
}

// --- Row building (matches HN's native DOM structure) ---

function buildStoryRows(story, rank, seenStories) {
  const id = String(story.id);
  const renderTimeSec = Math.floor(Date.now() / 1000);

  // Title row: indicator | rank | vote placeholder | title
  const trTitle = document.createElement('tr');
  trTitle.className = 'athing';
  trTitle.id = id;

  trTitle.appendChild(buildIndicatorCell(id, {}, seenStories, renderTimeSec));

  const tdRank = document.createElement('td');
  tdRank.className = 'title';
  tdRank.setAttribute('valign', 'top');
  tdRank.setAttribute('align', 'right');
  const rankSpan = document.createElement('span');
  rankSpan.className = 'rank';
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
  scoreSpan.id = `score_${story.id}`;
  scoreSpan.textContent = `${story.score || 0} points`;
  const scoreStyle = intensityStyle(story.score || 0);
  if (scoreStyle.color) {
    scoreSpan.style.color = scoreStyle.color;
    scoreSpan.style.fontWeight = scoreStyle.fontWeight;
  }
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
    const commentStyle = intensityStyle(story.descendants);
    if (commentStyle.color) {
      commentsLink.style.color = commentStyle.color;
      commentsLink.style.fontWeight = commentStyle.fontWeight;
    }
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

// --- Pagination ---

function addPaginationLinks(visibleCount) {
  const moreLink = document.querySelector('a.morelink');
  if (!moreLink) return;

  moreLink.textContent = 'Next';

  const page = currentPageNumber();
  const totalPages = Math.max(Math.ceil(visibleCount / STORIES_PER_PAGE), page + 1);

  const basePath = window.location.pathname || '/';
  const td = document.createElement('td');
  td.className = 'hn-mod-pagination';
  td.style.paddingLeft = '10px';
  for (let p = 1; p <= totalPages; p++) {
    if (p > 1) td.appendChild(document.createTextNode('\u2003'));
    if (p === page) {
      const span = document.createElement('span');
      span.textContent = p;
      span.style.fontWeight = 'bold';
      td.appendChild(span);
    } else {
      const a = document.createElement('a');
      a.href = `${basePath}?p=${p}`;
      a.textContent = p;
      td.appendChild(a);
    }
  }
  moreLink.closest('td').after(td);
}

// --- Unseen panel content loading ---

/** Append a story row to the panel tbody and wire up its action links */
async function appendStoryToPanel(entry, tbody, seenStories, hiddenIds, dimmingConfig) {
  const [story, authToken] = await Promise.all([fetchStory(entry.id), fetchAuthToken(entry.id)]);
  if (!story) return;

  for (const row of buildStoryRows(story, entry.rank, seenStories)) {
    tbody.appendChild(row);
  }
  if (authToken) {
    const id = String(story.id);
    const tr = tbody.querySelector(`tr.athing[id="${id}"]`);
    const tdSubtext = tr?.nextElementSibling?.querySelector('td.subtext');
    if (tdSubtext) addActionLinks(tdSubtext, story, authToken, hiddenIds, id, tr);
  }
  adjustTitlesAndPersistDimming(dimmingConfig);
  addSeenLinks(seenStories);
}

/** Load initial stories into the panel */
async function loadPanelContent(
  content,
  unseenEntries,
  seenStories,
  hiddenIds,
  dimmingConfig,
  summary,
  details,
) {
  content.textContent = 'Loading...';

  const shown = unseenEntries.slice(0, MAX_UNSEEN_SHOWN);
  const overflow = unseenEntries.slice(MAX_UNSEEN_SHOWN);

  const stories = await Promise.all(shown.map(({ id }) => fetchStory(id)));

  content.textContent = '';

  const table = document.createElement('table');
  table.className = 'itemlist';
  table.style.cssText = 'border-spacing: 0; border-collapse: collapse;';

  const tbody = document.createElement('tbody');
  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    if (!story) continue;
    for (const row of buildStoryRows(story, unseenEntries[i].rank, seenStories)) {
      tbody.appendChild(row);
    }
  }

  table.appendChild(tbody);
  content.appendChild(table);

  // Overflow message
  let moreDiv = null;
  function updateOverflowMsg() {
    if (overflow.length > 0) {
      if (!moreDiv) {
        moreDiv = document.createElement('div');
        moreDiv.className = 'hn-mod-unseen-more';
        content.appendChild(moreDiv);
      }
      moreDiv.textContent = `${overflow.length} more new ${overflow.length === 1 ? 'story' : 'stories'}`;
    } else if (moreDiv) {
      moreDiv.remove();
      moreDiv = null;
    }
  }
  updateOverflowMsg();

  // Fetch auth tokens in background, then add action links + dimming/seen
  Promise.all(shown.map(({ id }) => fetchAuthToken(id))).then((authTokens) => {
    for (let i = 0; i < stories.length; i++) {
      if (!stories[i] || !authTokens[i]) continue;
      const id = String(stories[i].id);
      const tr = tbody.querySelector(`tr.athing[id="${id}"]`);
      const tdSubtext = tr?.nextElementSibling?.querySelector('td.subtext');
      if (!tdSubtext) continue;
      addActionLinks(tdSubtext, stories[i], authTokens[i], hiddenIds, id, tr);
    }
    adjustTitlesAndPersistDimming(dimmingConfig);
    addSeenLinks(seenStories);
  });

  // Remove stories from the panel when marked as seen/hidden
  let unseenCount = unseenEntries.length;
  table.addEventListener('hn-mod-seen', (e) => {
    const trTitle = e.target.closest('tr.athing');
    if (!trTitle) return;
    removeStoryRows(trTitle);

    unseenCount--;
    if (unseenCount > 0) {
      summary.textContent = `${unseenCount} new ${unseenCount === 1 ? 'story' : 'stories'}`;
      // Backfill from overflow
      if (overflow.length > 0) {
        const entry = overflow.shift();
        updateOverflowMsg();
        appendStoryToPanel(entry, tbody, seenStories, hiddenIds, dimmingConfig);
      }
    } else {
      details.replaceWith(
        Object.assign(document.createElement('div'), {
          className: 'hn-mod-unseen',
          textContent: 'No new stories',
        }),
      );
    }
  });
}

// --- Main entry point ---

/**
 * Show a collapsible "unseen stories" section at the top of the page.
 * @param {Object} seenStories - in-memory seen map { id: timestamp | true }
 * @param {Set<string>} hiddenIds - IDs of stories the user has hidden
 */
export async function showUnseenStories(seenStories, hiddenIds, dimmingConfig) {
  if (!isListingPage()) return;

  // Snapshot seen state before the async fetch, since markNewAndTrendingStories
  // may mutate seenStories while we await the API response
  const nowSec = Math.floor(Date.now() / 1000);
  const seenSnapshot = { ...seenStories };

  const topIds = await fetchTopStoryIds();

  // Filter out hidden stories first, then assign user-facing ranks
  const visibleIds = topIds.filter((id) => !hiddenIds.has(String(id)));

  addPaginationLinks(visibleIds.length);

  // Include stories that are unseen or still within the fade period
  const unseenEntries = [];
  for (let i = 0; i < visibleIds.length; i++) {
    const id = visibleIds[i];
    const seen = seenSnapshot[String(id)];
    if (seen === undefined || (typeof seen === 'number' && nowSec - seen < FADE_SEC)) {
      unseenEntries.push({ id, rank: i + 1 });
    }
  }

  // Find insertion point
  const storyTable = document.querySelector('tr.athing')?.closest('table');
  if (!storyTable) return;

  if (unseenEntries.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'hn-mod-unseen';
    msg.textContent = 'No new stories';
    storyTable.parentNode.insertBefore(msg, storyTable);
    return;
  }

  // Build collapsible section
  const details = document.createElement('details');
  details.className = 'hn-mod-unseen';
  details.open = true;

  const summary = document.createElement('summary');
  summary.className = 'hn-mod-unseen-summary';
  summary.textContent = `${unseenEntries.length} new ${unseenEntries.length === 1 ? 'story' : 'stories'}`;
  details.appendChild(summary);

  const content = document.createElement('div');
  content.className = 'hn-mod-unseen-content';
  details.appendChild(content);

  // Lazy-load story details on first expand
  let loaded = false;
  details.addEventListener('toggle', async () => {
    if (!details.open || loaded) return;
    loaded = true;
    await loadPanelContent(
      content,
      unseenEntries,
      seenStories,
      hiddenIds,
      dimmingConfig,
      summary,
      details,
    );
  });

  storyTable.parentNode.insertBefore(details, storyTable);
}

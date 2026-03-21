// Unseen stories panel
//
// Fetches top 500 story IDs from the HN API, compares against seen stories,
// and shows a collapsible section at the top of the page listing unseen ones.
// Story details are fetched lazily when the section is expanded.
// Rows are styled identically to HN's native story rows, with indicators.

import { isListingPage } from './page.js';
import { buildIndicatorCell, addSeenLinks } from './indicators.js';
import { intensity } from './colorize.js';
import { adjustTitlesAndPersistDimming } from './dimming.js';
import { saveHiddenIds } from './storage.js';

const API_BASE = 'https://hacker-news.firebaseio.com/v0';
const MAX_UNSEEN_SHOWN = 5;
const FADE_SEC = 30 * 60; // 30 minutes — must match indicators.js

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

async function fetchTopStoryIds() {
  const res = await fetch(`${API_BASE}/topstories.json`);
  return res.json();
}

async function fetchStory(id) {
  const res = await fetch(`${API_BASE}/item/${id}.json`);
  return res.json();
}

/** Fetch a story's item page and extract its per-story auth token from the hide link */
async function fetchAuthToken(id) {
  try {
    const res = await fetch(`https://news.ycombinator.com/item?id=${id}`);
    const html = await res.text();
    const match = html.match(new RegExp(`hide\\?id=${id}&(?:amp;)?auth=([a-f0-9]+)`));
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// --- Color helpers (shared with colorize.js via intensity()) ---

const BASE = { r: 130, g: 130, b: 130 };
const TARGET = { r: 0, g: 119, b: 119 };

function intensityStyle(value) {
  const t = intensity(value);
  if (t <= 0) return {};
  const r = Math.round(BASE.r + (TARGET.r - BASE.r) * t);
  const g = Math.round(BASE.g + (TARGET.g - BASE.g) * t);
  const b = Math.round(BASE.b + (TARGET.b - BASE.b) * t);
  return { color: `rgb(${r}, ${g}, ${b})`, fontWeight: Math.round(400 + 500 * t) };
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
          `tr.athing[id="${id}"] ~ tr a.clicky[href^="hide?id=${id}&"]`
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

function buildStoryRows(story, rank, seenStories, authToken, hiddenIds) {
  const id = String(story.id);
  const renderTimeSec = Math.floor(Date.now() / 1000);

  // Title row: indicator | rank | vote placeholder | title
  const trTitle = document.createElement('tr');
  trTitle.className = 'athing';
  trTitle.id = id;

  // Indicator cell
  trTitle.appendChild(buildIndicatorCell(id, {}, seenStories, renderTimeSec));

  // Rank
  const tdRank = document.createElement('td');
  tdRank.className = 'title';
  tdRank.setAttribute('valign', 'top');
  tdRank.setAttribute('align', 'right');
  const rankSpan = document.createElement('span');
  rankSpan.className = 'rank';
  rankSpan.textContent = `${rank}.`;
  tdRank.appendChild(rankSpan);
  trTitle.appendChild(tdRank);

  // Vote links placeholder
  const tdVote = document.createElement('td');
  tdVote.className = 'votelinks';
  tdVote.setAttribute('valign', 'top');
  trTitle.appendChild(tdVote);

  // Title cell
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
    } catch { /* skip */ }
  }

  tdTitle.appendChild(titleLine);
  trTitle.appendChild(tdTitle);

  // Subtext row
  const trSub = document.createElement('tr');

  // Empty cell for indicator column
  const tdEmpty1 = document.createElement('td');
  trSub.appendChild(tdEmpty1);

  // Colspan cell for rank + vote
  const tdEmpty2 = document.createElement('td');
  tdEmpty2.setAttribute('colspan', '2');
  trSub.appendChild(tdEmpty2);

  // Subtext cell
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

  // Time ago
  if (story.time) {
    tdSubtext.appendChild(document.createTextNode(` ${timeAgo(story.time)} `));
  }

  // Action links added lazily after auth tokens load

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
  const visibleIds = topIds.filter(id => !hiddenIds.has(String(id)));

  // Add pagination links
  // We can't know exact page count from the API (HN backfills beyond top 500).
  // Use visibleIds as a lower bound; ensure we always show at least currentPage + 1
  // when a "More" link exists, so the user can always navigate forward.
  const STORIES_PER_PAGE = 30;
  const currentPage = parseInt(new URLSearchParams(window.location.search).get('p') || '1');
  const hasMore = !!document.querySelector('a.morelink');
  const totalPages = hasMore
    ? Math.max(Math.ceil(visibleIds.length / STORIES_PER_PAGE), currentPage + 1)
    : currentPage;
  const moreLink = document.querySelector('a.morelink');
  if (moreLink) moreLink.textContent = 'Next';
  if (moreLink && totalPages > 1) {
    const currentPage = parseInt(new URLSearchParams(window.location.search).get('p') || '1');
    const basePath = window.location.pathname || '/';
    const td = document.createElement('td');
    td.className = 'hn-mod-pagination';
    td.style.paddingLeft = '10px';
    for (let p = 1; p <= totalPages; p++) {
      if (p > 1) td.appendChild(document.createTextNode('\u2003'));
      if (p === currentPage) {
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

  // Include stories that are unseen or still within the fade period
  const unseenEntries = [];
  for (let i = 0; i < visibleIds.length; i++) {
    const id = visibleIds[i];
    const seen = seenSnapshot[String(id)];
    if (seen === undefined || (typeof seen === 'number' && nowSec - seen < FADE_SEC)) {
      unseenEntries.push({ id, rank: i + 1 });
    }
    // seen === true or timestamp past fade → fully seen, skip
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

    content.textContent = 'Loading...';

    const shown = unseenEntries.slice(0, MAX_UNSEEN_SHOWN);
    const overflowCount = unseenEntries.length - shown.length;

    const stories = await Promise.all(shown.map(({ id }) => fetchStory(id)));

    content.textContent = '';

    const table = document.createElement('table');
    table.className = 'itemlist';
    table.style.cssText = 'border-spacing: 0; border-collapse: collapse;';

    const tbody = document.createElement('tbody');
    for (let i = 0; i < stories.length; i++) {
      const story = stories[i];
      if (!story) continue;
      for (const row of buildStoryRows(story, unseenEntries[i].rank, seenStories, null, hiddenIds)) {
        tbody.appendChild(row);
      }
    }

    table.appendChild(tbody);
    content.appendChild(table);

    if (overflowCount > 0) {
      const more = document.createElement('div');
      more.className = 'hn-mod-unseen-more';
      more.textContent = `${overflowCount} more new ${overflowCount === 1 ? 'story' : 'stories'}`;
      content.appendChild(more);
    }

    // Fetch auth tokens in background, then add action links + dimming/seen
    Promise.all(shown.map(({ id }) => fetchAuthToken(id))).then(authTokens => {
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

    // Remove stories from the panel when marked as seen
    let unseenCount = unseenEntries.length;
    table.addEventListener('hn-mod-seen', (e) => {
      const trTitle = e.target.closest('tr.athing');
      if (!trTitle) return;
      const trSub = trTitle.nextElementSibling;
      const trSpacer = trSub?.nextElementSibling;
      trTitle.remove();
      trSub?.remove();
      trSpacer?.remove();

      unseenCount--;
      if (unseenCount > 0) {
        summary.textContent = `${unseenCount} new ${unseenCount === 1 ? 'story' : 'stories'}`;
      } else {
        details.replaceWith(Object.assign(document.createElement('div'), {
          className: 'hn-mod-unseen',
          textContent: 'No new stories',
        }));
      }
    });
  });

  storyTable.parentNode.insertBefore(details, storyTable);
}

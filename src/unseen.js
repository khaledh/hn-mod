// Unseen stories panel
//
// Fetches top 500 story IDs from the HN API, compares against seen stories,
// and shows a collapsible section at the top of the page listing unseen ones.
// Story details are fetched lazily when the section is expanded.
// Rows are styled identically to HN's native story rows, with indicators.

import { buildIndicatorCell } from './indicators.js';
import { intensity } from './colorize.js';

const API_BASE = 'https://hacker-news.firebaseio.com/v0';

async function fetchTopStoryIds() {
  const res = await fetch(`${API_BASE}/topstories.json`);
  return res.json();
}

async function fetchStory(id) {
  const res = await fetch(`${API_BASE}/item/${id}.json`);
  return res.json();
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

// --- Row building (matches HN's native DOM structure) ---

function buildStoryRows(story, rank, seenStories) {
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
export async function showUnseenStories(seenStories, hiddenIds) {
  if (window.location.pathname === '/item') return;

  const topIds = await fetchTopStoryIds();

  // Filter out hidden stories first, then assign user-facing ranks
  const visibleIds = topIds.filter(id => !hiddenIds.has(String(id)));

  // Find unseen among visible, using user rank (position after hiding)
  const unseenEntries = [];
  for (let i = 0; i < visibleIds.length; i++) {
    const id = visibleIds[i];
    if (seenStories[String(id)] === undefined) {
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

    const stories = await Promise.all(
      unseenEntries.map(({ id }) => fetchStory(id))
    );

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
  });

  storyTable.parentNode.insertBefore(details, storyTable);
}

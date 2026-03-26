// Shared DOM fixture helpers for tests that need HN-like page structures

import { vi } from 'vitest';

/** Override window.location.pathname and search */
export function setLocation(path: string, search = ''): void {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, pathname: path, search } as Location,
    writable: true,
    configurable: true,
  });
}

/** Build the three rows (title, subtext, spacer) for a single HN story */
export function buildStoryRows(
  id: string,
  rank: number,
): [HTMLTableRowElement, HTMLTableRowElement, HTMLTableRowElement] {
  const trTitle = document.createElement('tr');
  trTitle.className = 'athing';
  trTitle.id = id;

  const tdRank = document.createElement('td');
  tdRank.className = 'title';
  const rankSpan = document.createElement('span');
  rankSpan.className = 'rank';
  rankSpan.textContent = `${rank}.`;
  tdRank.appendChild(rankSpan);
  trTitle.appendChild(tdRank);

  const tdVote = document.createElement('td');
  tdVote.className = 'votelinks';
  trTitle.appendChild(tdVote);

  const tdTitle = document.createElement('td');
  tdTitle.className = 'title';
  const titleLine = document.createElement('span');
  titleLine.className = 'titleline';
  const a = document.createElement('a');
  a.href = `https://news.ycombinator.com/item?id=${id}`;
  a.textContent = `Story ${id}`;
  titleLine.appendChild(a);
  tdTitle.appendChild(titleLine);
  trTitle.appendChild(tdTitle);

  const trSub = document.createElement('tr');
  const tdEmpty = document.createElement('td');
  tdEmpty.setAttribute('colspan', '2');
  trSub.appendChild(tdEmpty);
  const tdSubtext = document.createElement('td');
  tdSubtext.className = 'subtext';
  tdSubtext.textContent = `100 points by user ${id}`;
  trSub.appendChild(tdSubtext);

  const trSpacer = document.createElement('tr');
  trSpacer.className = 'spacer';
  const tdSpacer = document.createElement('td');
  tdSpacer.setAttribute('colspan', '3');
  trSpacer.appendChild(tdSpacer);

  return [trTitle, trSub, trSpacer];
}

/** Build a <table> with story rows appended to document.body */
export function buildStoryTable(stories: { id: string; rank: number }[]): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'itemlist';
  const tbody = document.createElement('tbody');
  for (const s of stories) {
    for (const row of buildStoryRows(s.id, s.rank)) {
      tbody.appendChild(row);
    }
  }
  table.appendChild(tbody);
  document.body.appendChild(table);
  return table;
}

/** Build an unseen panel containing story rows, appended to document.body */
export function buildUnseenPanel(stories: { id: string; rank: number }[]): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'hn-mod-unseen';

  const table = document.createElement('table');
  table.className = 'itemlist';
  const tbody = document.createElement('tbody');
  for (const s of stories) {
    for (const row of buildStoryRows(s.id, s.rank)) {
      tbody.appendChild(row);
    }
  }
  table.appendChild(tbody);
  details.appendChild(table);
  document.body.appendChild(details);
  return details;
}

/** Set up chrome.storage mock */
export function mockChrome(): void {
  const noop = vi.fn();
  globalThis.chrome = {
    storage: {
      sync: { set: noop, get: noop, remove: noop },
      local: { set: noop, get: noop },
    },
  } as unknown as typeof chrome;
}

/** Clear document body */
export function cleanup(): void {
  document.body.innerHTML = '';
}

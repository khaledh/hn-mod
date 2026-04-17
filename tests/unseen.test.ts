/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showUnseenStories } from '../src/unseen.ts';
import { buildStoryTable, mockChrome, cleanup, setLocation } from './helpers/dom-fixtures.ts';

function mockTopStories(ids: number[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      json: async () => ids,
    })),
  );
}

function mockTopStoriesAndItems(ids: number[], stories: Record<number, object>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/topstories.json')) {
        return { json: async () => ids };
      }
      const match = url.match(/\/item\/(\d+)\.json/);
      if (match) {
        return { json: async () => stories[Number(match[1])] ?? null };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setPanelOpen(open: boolean): void {
  chrome.storage.local.get = vi.fn(
    (_defaults: unknown, callback: (items: { unseenPanelOpen: boolean }) => void) =>
      callback({ unseenPanelOpen: open }),
  ) as unknown as typeof chrome.storage.local.get;
}

function addMoreLink(): void {
  const table = document.querySelector('table.itemlist');
  if (!table) throw new Error('Expected main story table');

  const tbody = table.querySelector('tbody');
  if (!tbody) throw new Error('Expected tbody');

  const tr = document.createElement('tr');
  const spacerTd = document.createElement('td');
  spacerTd.setAttribute('colspan', '2');
  tr.appendChild(spacerTd);

  const td = document.createElement('td');
  const link = document.createElement('a');
  link.className = 'morelink';
  link.href = 'news?p=2';
  link.textContent = 'More';
  td.appendChild(link);
  tr.appendChild(td);

  tbody.appendChild(tr);
}

function paginationLabels(): string[] {
  return [
    ...document.querySelectorAll<HTMLElement>('.hn-mod-pagination a, .hn-mod-pagination span'),
  ].map((el) => el.textContent || '');
}

beforeEach(() => {
  mockChrome();
  setLocation('/news');
  setPanelOpen(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('showUnseenStories', () => {
  it('excludes manually dimmed stories from the unseen summary on refresh', async () => {
    buildStoryTable([
      { id: '100', rank: 1 },
      { id: '200', rank: 2 },
    ]);
    mockTopStories([100, 200]);

    await showUnseenStories(
      {},
      new Set(),
      new Set(),
      {
        ciKeywords: [],
        csKeywords: [],
        domains: [],
        dimmedEntries: ['100'],
        undimmedEntries: [],
      },
    );

    expect(document.querySelector('.hn-mod-unseen-summary')?.textContent).toBe('1 new story');
  });

  it('excludes keyword-dimmed main-feed stories from the unseen summary on refresh', async () => {
    buildStoryTable([
      { id: '100', rank: 1 },
      { id: '200', rank: 2 },
    ]);
    mockTopStories([100, 200]);

    await showUnseenStories(
      {},
      new Set(),
      new Set(),
      {
        ciKeywords: ['story'],
        csKeywords: [],
        domains: [],
        dimmedEntries: [],
        undimmedEntries: [],
      },
    );

    expect(document.querySelector('.hn-mod-unseen')?.textContent).toContain('No new stories');
  });

  it('shows the empty state instead of "0 new stories" when fetched unseen stories are filtered out', async () => {
    buildStoryTable([{ id: '100', rank: 1 }]);
    mockTopStoriesAndItems([300], {
      300: {
        id: 300,
        title: 'Filtered Story',
        by: 'alice',
        time: 1,
        type: 'story',
      },
    });

    await showUnseenStories(
      {},
      new Set(),
      new Set(),
      {
        ciKeywords: ['filtered'],
        csKeywords: [],
        domains: [],
        dimmedEntries: [],
        undimmedEntries: [],
      },
    );

    expect(document.querySelector('details.hn-mod-unseen')).toBeNull();
    expect(document.querySelector('.hn-mod-unseen')?.textContent).toContain('No new stories');
  });

  it('still resolves to the empty state when the panel starts closed and opens later', async () => {
    setPanelOpen(false);
    buildStoryTable([{ id: '100', rank: 1 }]);
    mockTopStoriesAndItems([300], {
      300: {
        id: 300,
        title: 'Filtered Story',
        by: 'alice',
        time: 1,
        type: 'story',
      },
    });

    await showUnseenStories(
      {},
      new Set(),
      new Set(),
      {
        ciKeywords: ['filtered'],
        csKeywords: [],
        domains: [],
        dimmedEntries: [],
        undimmedEntries: [],
      },
    );

    const details = document.querySelector<HTMLDetailsElement>('details.hn-mod-unseen');
    expect(details).not.toBeNull();
    details!.open = true;
    details!.dispatchEvent(new Event('toggle'));
    await flushMicrotasks();

    expect(document.querySelector('details.hn-mod-unseen')).toBeNull();
    expect(document.querySelector('.hn-mod-unseen')?.textContent).toContain('No new stories');
  });

  it('shows page links 1 through 10 on page 1 when more pages exist', async () => {
    setLocation('/news');
    buildStoryTable([{ id: '100', rank: 1 }]);
    addMoreLink();
    mockTopStories(Array.from({ length: 270 }, (_, i) => i + 1));

    await showUnseenStories({}, new Set(), new Set(), {
      ciKeywords: [],
      csKeywords: [],
      domains: [],
      dimmedEntries: [],
      undimmedEntries: [],
    });

    expect(paginationLabels()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });

  it('keeps page links capped at 10 on page 9 when page 10 exists', async () => {
    setLocation('/news', '?p=9');
    buildStoryTable([{ id: '100', rank: 241 }]);
    addMoreLink();
    mockTopStories(Array.from({ length: 270 }, (_, i) => i + 1));

    await showUnseenStories({}, new Set(), new Set(), {
      ciKeywords: [],
      csKeywords: [],
      domains: [],
      dimmedEntries: [],
      undimmedEntries: [],
    });

    expect(paginationLabels()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });

  it('extends to page 11 on page 10 when a next page exists', async () => {
    setLocation('/news', '?p=10');
    buildStoryTable([{ id: '100', rank: 271 }]);
    addMoreLink();
    mockTopStories(Array.from({ length: 270 }, (_, i) => i + 1));

    await showUnseenStories({}, new Set(), new Set(), {
      ciKeywords: [],
      csKeywords: [],
      domains: [],
      dimmedEntries: [],
      undimmedEntries: [],
    });

    expect(paginationLabels()).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
    ]);
  });
});

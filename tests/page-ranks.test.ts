/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getPageRanks, cleanHiddenIds } from '../src/page.ts';
import { buildStoryTable, buildUnseenPanel, mockChrome, cleanup } from './helpers/dom-fixtures.ts';

beforeEach(() => mockChrome());
afterEach(() => cleanup());

describe('getPageRanks', () => {
  it('reads rank numbers from main feed story rows', () => {
    buildStoryTable([
      { id: '100', rank: 1 },
      { id: '200', rank: 2 },
      { id: '300', rank: 3 },
    ]);
    expect(getPageRanks()).toEqual({ '100': 1, '200': 2, '300': 3 });
  });

  it('excludes stories inside .hn-mod-unseen panel', () => {
    buildStoryTable([
      { id: '100', rank: 1 },
      { id: '200', rank: 2 },
    ]);
    buildUnseenPanel([{ id: '999', rank: 5 }]);

    const ranks = getPageRanks();
    expect(ranks).toEqual({ '100': 1, '200': 2 });
    expect(ranks).not.toHaveProperty('999');
  });

  it('skips rows without a rank span', () => {
    const table = document.createElement('table');
    const tr = document.createElement('tr');
    tr.className = 'athing';
    tr.id = '100';
    table.appendChild(tr);
    document.body.appendChild(table);

    expect(getPageRanks()).toEqual({});
  });

  it('skips rows without an id', () => {
    const table = document.createElement('table');
    const tr = document.createElement('tr');
    tr.className = 'athing';
    const span = document.createElement('span');
    span.className = 'rank';
    span.textContent = '1.';
    tr.appendChild(span);
    table.appendChild(tr);
    document.body.appendChild(table);

    expect(getPageRanks()).toEqual({});
  });

  it('returns empty object when no stories exist', () => {
    expect(getPageRanks()).toEqual({});
  });
});

describe('cleanHiddenIds', () => {
  it('removes IDs that appear in the main feed', () => {
    buildStoryTable([
      { id: '100', rank: 1 },
      { id: '200', rank: 2 },
    ]);
    const hiddenIds = new Set(['100', '200', '300']);
    cleanHiddenIds(hiddenIds);

    expect(hiddenIds.has('100')).toBe(false);
    expect(hiddenIds.has('200')).toBe(false);
    expect(hiddenIds.has('300')).toBe(true);
  });

  it('does NOT remove IDs for stories only in the unseen panel', () => {
    buildStoryTable([{ id: '100', rank: 1 }]);
    buildUnseenPanel([{ id: '999', rank: 5 }]);

    const hiddenIds = new Set(['999']);
    cleanHiddenIds(hiddenIds);

    expect(hiddenIds.has('999')).toBe(true);
  });

  it('does not call saveHiddenIds when nothing was cleaned', () => {
    buildStoryTable([{ id: '100', rank: 1 }]);
    const hiddenIds = new Set(['888']);
    cleanHiddenIds(hiddenIds);

    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });
});

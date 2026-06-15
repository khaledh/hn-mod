/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { insertStoryRowsBeforeMore } from '../src/indicators.ts';

function row(id?: string, html = ''): HTMLTableRowElement {
  const tr = document.createElement('tr');
  if (id) tr.id = id;
  tr.innerHTML = html;
  return tr;
}

describe('insertStoryRowsBeforeMore', () => {
  it('inserts replacement story rows before the morespace footer row', () => {
    const tbody = document.createElement('tbody');
    tbody.append(
      row('existing', '<td>existing</td>'),
      row(undefined, '<td>space</td>'),
      row(undefined, '<td><a class="morelink" href="news?p=2">More</a></td>'),
    );
    tbody.children[1].className = 'morespace';

    insertStoryRowsBeforeMore(
      tbody,
      row('replacement', '<td>replacement</td>'),
      row(undefined, '<td>subtext</td>'),
      row(undefined, '<td>spacer</td>'),
    );

    expect([...tbody.children].map((child) => child.textContent)).toEqual([
      'existing',
      'replacement',
      'subtext',
      'spacer',
      'space',
      'More',
    ]);
  });

  it('falls back to inserting before More when there is no morespace row', () => {
    const tbody = document.createElement('tbody');
    tbody.append(
      row('existing', '<td>existing</td>'),
      row(undefined, '<td><a class="morelink" href="news?p=2">More</a></td>'),
    );

    insertStoryRowsBeforeMore(tbody, row('replacement', '<td>replacement</td>'), null, null);

    expect([...tbody.children].map((child) => child.textContent)).toEqual([
      'existing',
      'replacement',
      'More',
    ]);
  });

  it('appends replacement story rows when there is no More row', () => {
    const tbody = document.createElement('tbody');
    tbody.append(row('existing', '<td>existing</td>'));

    insertStoryRowsBeforeMore(tbody, row('replacement', '<td>replacement</td>'), null, null);

    expect([...tbody.children].map((child) => child.textContent)).toEqual(['existing', 'replacement']);
  });
});

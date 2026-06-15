/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { ensureFavoriteLinkForRow } from '../src/indicators.ts';

function buildSubRow(html: string): HTMLTableRowElement {
  const row = document.createElement('tr');
  row.innerHTML = `<td class="subtext">${html}</td>`;
  return row;
}

describe('ensureFavoriteLinkForRow', () => {
  it('adds a favorite link before the comments link using the row auth token', () => {
    const row = buildSubRow(
      '10 points by user | <a href="hide?id=123&auth=abc&goto=news">hide</a> | <a href="item?id=123">4&nbsp;comments</a>',
    );

    ensureFavoriteLinkForRow(row, '123');

    const subtext = row.querySelector('.subtext')!;
    expect(subtext.innerHTML).toContain('<a class="__rhn__fave-button" href="fave?id=123&amp;auth=abc">favorite</a> | <a href="item?id=123">4&nbsp;comments</a>');
  });

  it('adds the favorite link inside the nested subline when comments are nested', () => {
    const row = buildSubRow(
      '<span class="subline">10 points by user | <a href="hide?id=123&auth=abc&goto=news">hide</a> | <a href="item?id=123">4&nbsp;comments</a></span>',
    );

    ensureFavoriteLinkForRow(row, '123');

    const subline = row.querySelector('.subline')!;
    expect(subline.innerHTML).toContain('<a class="__rhn__fave-button" href="fave?id=123&amp;auth=abc">favorite</a> | <a href="item?id=123">4&nbsp;comments</a>');
  });

  it('does not duplicate an existing favorite link', () => {
    const row = buildSubRow(
      '10 points by user | <a href="hide?id=123&auth=abc&goto=news">hide</a> | <a href="fave?id=123&auth=abc">favorite</a> | <a href="item?id=123">4&nbsp;comments</a>',
    );

    ensureFavoriteLinkForRow(row, '123');

    expect(row.querySelectorAll('a[href^="fave?id=123&"]').length).toBe(1);
  });
});

// Story dimming by keyword/domain matching
//
// Dims stories matching configured keywords or domains, with manual
// dim/undim toggle per story. State persists via chrome.storage.sync.

import { capArray, MAX_ENTRIES, saveDimState, type DimmingConfig } from './storage.ts';

interface StoryElements {
  trTitle: HTMLElement;
  tdSubtext: HTMLElement | null;
  tdRank: HTMLElement | null;
  tdVoteLinks: HTMLElement | null;
  entryId: string;
  aTitle: HTMLElement | null;
  aSite: HTMLElement | null;
}

function escapeForRegex(s: string): string {
  return s.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

/** Check if a story title/site matches any dimming rules */
function matchesDimRules(
  title: HTMLElement | null,
  site: HTMLElement | null,
  ciKeywords: string[],
  csKeywords: string[],
  domains: string[],
): boolean {
  if (!title) return false;
  if (site && domains.some((d) => site.innerText.startsWith(d))) return true;
  if (
    csKeywords.some((kw) => new RegExp(`(^|\\W)${escapeForRegex(kw)}(\\W|$)`).test(title.innerText))
  )
    return true;
  if (
    ciKeywords.some((kw) =>
      new RegExp(`(^|\\W)${escapeForRegex(kw)}(\\W|$)`).test(title.innerText.toLowerCase()),
    )
  )
    return true;
  return false;
}

/** Apply or remove dimming effect on a story's DOM elements */
function applyDimming(els: StoryElements, isDimming: boolean): void {
  const opacity = isDimming ? '0.35' : '1';
  const fontSize = isDimming ? '60%' : '';
  const imgSize = isDimming ? 7 : 12;
  const arrowSize = isDimming ? '7px' : '';

  if (isDimming) {
    els.trTitle.classList.add('dimmed');
  } else {
    els.trTitle.classList.remove('dimmed');
  }

  for (const cell of els.trTitle.querySelectorAll<HTMLElement>('td.title')) {
    cell.style.opacity = opacity;
    cell.style.fontSize = fontSize;
    const img = cell.querySelector<HTMLImageElement>('img');
    if (img) {
      img.width = imgSize;
      img.height = imgSize;
    }
  }

  if (els.tdSubtext) {
    els.tdSubtext.style.opacity = opacity;
    els.tdSubtext.style.fontSize = fontSize;
  }

  if (els.tdRank) els.tdRank.removeAttribute('valign');

  if (els.tdVoteLinks) {
    for (const arrow of els.tdVoteLinks.querySelectorAll<HTMLElement>('.votearrow')) {
      arrow.style.width = arrowSize;
      arrow.style.height = arrowSize;
    }
  }
}

/** Persist dim/undim state for a story */
function persistDimState(
  entryId: string,
  isDimming: boolean,
  dimmedEntries: string[],
  undimmedEntries: string[],
): void {
  const dimIdx = dimmedEntries.indexOf(entryId);
  if (isDimming && dimIdx === -1) {
    dimmedEntries.push(entryId);
    capArray(dimmedEntries, MAX_ENTRIES);
  } else if (!isDimming && dimIdx !== -1) {
    dimmedEntries.splice(dimIdx, 1);
  }

  const undimIdx = undimmedEntries.indexOf(entryId);
  if (!isDimming && undimIdx === -1) {
    undimmedEntries.push(entryId);
    capArray(undimmedEntries, MAX_ENTRIES);
  } else if (isDimming && undimIdx !== -1) {
    undimmedEntries.splice(undimIdx, 1);
  }

  saveDimState(dimmedEntries, undimmedEntries);
}

/** Extract relevant DOM elements for a story row */
function getStoryElements(trTitle: HTMLElement): StoryElements {
  const trSubtext = trTitle.nextElementSibling;
  return {
    trTitle,
    tdSubtext: trSubtext?.querySelector<HTMLElement>('td.subtext') ?? null,
    tdRank: trTitle.querySelector<HTMLElement>('td:first-child'),
    tdVoteLinks: trTitle.querySelector<HTMLElement>('td:nth-child(2)'),
    entryId: trTitle.id,
    aTitle: trTitle.querySelector<HTMLElement>('.titleline > a'),
    aSite: trTitle.querySelector<HTMLElement>('.sitestr'),
  };
}

/**
 * Process all stories on the page: apply dimming rules and add dim/undim links.
 */
export function adjustTitlesAndPersistDimming(config: DimmingConfig): void {
  const { ciKeywords, csKeywords, domains, dimmedEntries, undimmedEntries } = config;

  for (const trTitle of document.querySelectorAll<HTMLElement>('.athing')) {
    const els = getStoryElements(trTitle);
    if (!els.entryId) continue;

    const shouldDim =
      !undimmedEntries.includes(els.entryId) &&
      (matchesDimRules(els.aTitle, els.aSite, ciKeywords, csKeywords, domains) ||
        dimmedEntries.includes(els.entryId));

    if (shouldDim) applyDimming(els, true);

    // Add dim/undim toggle link
    if (els.tdSubtext) {
      let dimLink = els.tdSubtext.querySelector<HTMLAnchorElement>('.dimLink');
      if (!dimLink) {
        dimLink = document.createElement('a');
        dimLink.href = '#';
        dimLink.className = 'dimLink';
        els.tdSubtext.appendChild(document.createTextNode(' | '));
        els.tdSubtext.appendChild(dimLink);
      }
      dimLink.innerText = shouldDim ? 'undim' : 'dim';
      const capturedLink = dimLink;
      const { entryId } = els;
      capturedLink.onclick = (e) => {
        e.preventDefault();
        const isDimming = capturedLink.innerText === 'dim';
        // Apply to all rows with the same story ID (main feed + unseen panel)
        for (const row of document.querySelectorAll<HTMLElement>(`tr.athing[id="${entryId}"]`)) {
          applyDimming(getStoryElements(row), isDimming);
          const link = row.nextElementSibling?.querySelector<HTMLElement>('.dimLink');
          if (link) link.innerText = isDimming ? 'undim' : 'dim';
        }
        persistDimState(entryId, isDimming, dimmedEntries, undimmedEntries);
      };
    }
  }
}

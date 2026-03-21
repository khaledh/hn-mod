// Story dimming by keyword/domain matching
//
// Dims stories matching configured keywords or domains, with manual
// dim/undim toggle per story. State persists via chrome.storage.sync.

import { capArray, MAX_ENTRIES, saveDimState } from './storage.js';

function escapeForRegex(s) {
  return s.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

/** Check if a story title/site matches any dimming rules */
function matchesDimRules(title, site, ciKeywords, csKeywords, domains) {
  if (site && domains.some(d => site.innerText.startsWith(d))) return true;
  if (csKeywords.some(kw =>
    new RegExp(`(^|\\W)${escapeForRegex(kw)}(\\W|$)`).test(title.innerText)
  )) return true;
  if (ciKeywords.some(kw =>
    new RegExp(`(^|\\W)${escapeForRegex(kw)}(\\W|$)`).test(title.innerText.toLowerCase())
  )) return true;
  return false;
}

/** Apply or remove dimming effect on a story's DOM elements */
function applyDimming(els, isDimming) {
  const opacity = isDimming ? '0.35' : '1';
  const fontSize = isDimming ? '60%' : '';
  const imgSize = isDimming ? 7 : 12;
  const arrowSize = isDimming ? '7px' : '';

  if (isDimming) {
    els.trTitle.classList.add('dimmed');
  } else {
    els.trTitle.classList.remove('dimmed');
  }

  for (const cell of els.trTitle.querySelectorAll('td.title')) {
    cell.style.opacity = opacity;
    cell.style.fontSize = fontSize;
    const img = cell.querySelector('img');
    if (img) { img.width = imgSize; img.height = imgSize; }
  }

  if (els.tdSubtext) {
    els.tdSubtext.style.opacity = opacity;
    els.tdSubtext.style.fontSize = fontSize;
  }

  if (els.tdRank) els.tdRank.removeAttribute('valign');

  if (els.tdVoteLinks) {
    for (const arrow of els.tdVoteLinks.querySelectorAll('.votearrow')) {
      arrow.style.width = arrowSize;
      arrow.style.height = arrowSize;
    }
  }
}

/** Persist dim/undim state for a story */
function persistDimState(entryId, isDimming, dimmedEntries, undimmedEntries) {
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
function getStoryElements(trTitle) {
  const trSubtext = trTitle.nextElementSibling;
  return {
    trTitle,
    tdSubtext: trSubtext?.querySelector('td.subtext'),
    tdRank: trTitle.querySelector('td:first-child'),
    tdVoteLinks: trTitle.querySelector('td:nth-child(2)'),
    entryId: trTitle.getAttribute('id'),
    aTitle: trTitle.querySelector('.titleline > a'),
    aSite: trTitle.querySelector('.sitestr'),
  };
}

/**
 * Process all stories on the page: apply dimming rules and add dim/undim links.
 * @param {Object} config - { ciKeywords, csKeywords, domains, dimmedEntries, undimmedEntries }
 */
export function adjustTitlesAndPersistDimming(config) {
  const { ciKeywords, csKeywords, domains, dimmedEntries, undimmedEntries } = config;

  for (const trTitle of document.querySelectorAll('.athing')) {
    const els = getStoryElements(trTitle);

    const shouldDim = !undimmedEntries.includes(els.entryId) && (
      matchesDimRules(els.aTitle, els.aSite, ciKeywords, csKeywords, domains) ||
      dimmedEntries.includes(els.entryId)
    );

    if (shouldDim) applyDimming(els, true);

    // Add dim/undim toggle link
    if (els.tdSubtext) {
      let dimLink = els.tdSubtext.querySelector('.dimLink');
      if (!dimLink) {
        dimLink = document.createElement('a');
        dimLink.href = '#';
        dimLink.className = 'dimLink';
        els.tdSubtext.appendChild(document.createTextNode(' | '));
        els.tdSubtext.appendChild(dimLink);
      }
      dimLink.innerText = shouldDim ? 'undim' : 'dim';
      dimLink.onclick = (e) => {
        e.preventDefault();
        const isDimming = dimLink.innerText === 'dim';
        // Apply to all rows with the same story ID (main feed + unseen panel)
        for (const row of document.querySelectorAll(`tr.athing[id="${els.entryId}"]`)) {
          applyDimming(getStoryElements(row), isDimming);
          const link = row.nextElementSibling?.querySelector('.dimLink');
          if (link) link.innerText = isDimming ? 'undim' : 'dim';
        }
        persistDimState(els.entryId, isDimming, dimmedEntries, undimmedEntries);
      };
    }
  }
}

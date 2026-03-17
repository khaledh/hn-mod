let
    CI_KEYWORDS = [],
    CS_KEYWORDS = [],
    DOMAINS = [],
    DIMMED_ENTRIES = [],
    UNDIMMED_ENTRIES = []; // allows user to undim entries that were dimmed by the keyword filters

// Function to dim titles, reduce font size, add a dimming link, and persist dimmed state
function adjustTitlesAndPersistDimming() {
    // Function to apply dimming effect
    const applyDimmingEffect = (
      trTitle, trSubtext,
      tdTitle, tdSubtext,
      entryId, trSpacingPrev, trSpacingNext, tdRank, tdVoteLinks, isDimming, doSave
    ) => {
        const opacity = isDimming ? "0.35" : "1"; // Dimmed or original opacity
        const fontSize = isDimming ? "60%" : ""; // Dimmed or original font size
        const imgSize = isDimming ? "7" : "12"; // Dimmed or original image size
        const spacingHeightPrev = isDimming ? "5px" : trSpacingPrev.style.height; // Dimmed or original spacing
        const spacingHeightNext = isDimming ? "5px" : trSpacingPrev.style.height; // Dimmed or original spacing
        const voteArrowsSize = isDimming ? "7px" : trSpacingPrev.style.height;

        if (isDimming) {
          trTitle.classList.add("dimmed");
      } else {
          trTitle.classList.remove("dimmed");
      }

        tdTitle.forEach(cell => {
            cell.style.opacity = opacity;
            cell.style.fontSize = fontSize;
            let img = cell.querySelector("img");
            if (img) {
                img.width = imgSize;
                img.height = imgSize;
            }
        });
        if (tdSubtext) {
            tdSubtext.style.opacity = opacity;
            tdSubtext.style.fontSize = fontSize;
        }
        // if (trSpacingPrev) {
        //     trSpacingPrev.style.setProperty("height", spacingHeightPrev, "important");
        // }
        // if (trSpacingNext) {
        //     trSpacingNext.style.setProperty("height", spacingHeightNext, "important");
        // }
        if (tdRank) {
            tdRank.removeAttribute("valign");
        }
        if (tdVoteLinks) {
            let votearrows = tdVoteLinks.querySelectorAll(".votearrow");
            votearrows.forEach(div => {
                div.style.width = voteArrowsSize;
                div.style.height = voteArrowsSize;
            });
        }

        if (doSave) {
            // Update dimmed entries
            const dimmedIndex = DIMMED_ENTRIES.indexOf(entryId);
            if (isDimming && dimmedIndex === -1) {
                // not found, add it
                DIMMED_ENTRIES.push(entryId);
            } else if (!isDimming && dimmedIndex !== -1) {
                // found, remove it
                DIMMED_ENTRIES.splice(dimmedIndex, 1);
            }
            chrome.storage.sync.set({ dimmedEntries: DIMMED_ENTRIES });

            // Update undimmed entries
            const undimmedIndex = UNDIMMED_ENTRIES.indexOf(entryId);
            if (!isDimming && undimmedIndex === -1) {
                // not found, add it
                UNDIMMED_ENTRIES.push(entryId);
            } else if (isDimming && undimmedIndex !== -1) {
                // found, remove it
                UNDIMMED_ENTRIES.splice(undimmedIndex, 1);
            }
            chrome.storage.sync.set({ undimmedEntries: UNDIMMED_ENTRIES });
        }
    };

    // Get all title rows on Hacker News homepage
    const titleRows = document.querySelectorAll(".athing");

    // Iterate over each title row
    titleRows.forEach(trTitle => {
        const entryId = trTitle.getAttribute("id"); // Get the entry"s unique ID
        const aTitle = trTitle.querySelector(".titleline > a");
        const aSite = trTitle.querySelector(".sitestr");
        const tdTitle = trTitle.querySelectorAll("td.title");
        let trSubtext = trTitle.nextElementSibling;
        let tdSubtext = trSubtext ? trSubtext.querySelector("td.subtext") : null;

        let tdRank = trTitle.querySelector("td:first-child");
        let tdVoteLinks = trTitle.querySelector("td:nth-child(2)");

        let trSpacingPrev = trTitle.previousElementSibling;
        let trSpacingNext = trSubtext.nextElementSibling;

        function escapeForRegex(string) {
            return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&");
        }

        // Check if the entry should be initially dimmed
        function checkTitle(title, site) {
            return (
                (site && DOMAINS.some(s => site.innerText.startsWith(s))) ||
                CS_KEYWORDS.some(kw => (new RegExp(`(^|\\W)${escapeForRegex(kw)}(\\W|$)`)).test(title.innerText)) ||
                CI_KEYWORDS.some(kw => (new RegExp(`(^|\\W)${escapeForRegex(kw)}(\\W|$)`)).test(title.innerText.toLowerCase()))
            );
        }
        const isInitiallyDimmed = !UNDIMMED_ENTRIES.includes(entryId) && (
            checkTitle(aTitle, aSite) || DIMMED_ENTRIES.includes(entryId)
        );
        if (isInitiallyDimmed) {
            applyDimmingEffect(
              trTitle, trSubtext,
              tdTitle, tdSubtext,
              entryId, trSpacingPrev, trSpacingNext, tdRank, tdVoteLinks, true, false
            );
        }

        // Add or update the "dim/undim" link in subtext
        if (tdSubtext) {
            // Locate or create the dim link
            let dimLink = tdSubtext.querySelector(".dimLink");
            if (!dimLink) {
                dimLink = document.createElement("a");
                dimLink.href = "#";
                dimLink.className = "dimLink"; // Add a class for easy identification
                tdSubtext.appendChild(document.createTextNode(" | "));
                tdSubtext.appendChild(dimLink);
            }
            dimLink.innerText = isInitiallyDimmed ? "undim" : "dim";
            dimLink.onclick = (event) => {
                event.preventDefault();
                const isDimming = dimLink.innerText === "dim";
                applyDimmingEffect(
                  trTitle, trSubtext,
                  tdTitle, tdSubtext,
                  entryId, trSpacingPrev, trSpacingNext, tdRank, tdVoteLinks, isDimming, true
                );
                dimLink.innerText = isDimming ? "undim" : "dim"; // Toggle the link text
            };
        }
    });
}

// --- Points coloring ---

function colorizePoints() {
    const scoreElements = document.querySelectorAll("span.score");
    scoreElements.forEach(el => {
        const points = parseInt(el.textContent);
        if (isNaN(points) || points <= 0) return;

        // Interpolation from default gray to maroon
        // log10 normalized to 0..1, then raised to power 4 for slow ramp that gets steep
        const maxLog = Math.log10(5000);
        const t = Math.pow(Math.min(Math.log10(Math.max(points, 1)) / maxLog, 1), 4);

        // Default HN gray: #828282 (130,130,130) → dark teal (0,119,119)
        const r = Math.round(130 + (0 - 130) * t);
        const g = Math.round(130 + (119 - 130) * t);
        const b = Math.round(130 + (119 - 130) * t);

        // Font weight: 400 (normal) → 900 (heavy)
        const weight = Math.round(400 + 500 * t);
        el.style.color = `rgb(${r}, ${g}, ${b})`;
        el.style.fontWeight = weight;
    });

    // Same treatment for comment count links
    const subtextLinks = document.querySelectorAll("td.subtext > span > a");
    subtextLinks.forEach(el => {
        const match = el.textContent.match(/(\d+)\s*comment/);
        if (!match) return;
        const count = parseInt(match[1]);
        if (isNaN(count) || count <= 0) return;

        const maxLog = Math.log10(5000);
        const t = Math.pow(Math.min(Math.log10(Math.max(count, 1)) / maxLog, 1), 4);

        const cr = Math.round(130 + (0 - 130) * t);
        const cg = Math.round(130 + (119 - 130) * t);
        const cb = Math.round(130 + (119 - 130) * t);
        const weight = Math.round(400 + 500 * t);

        el.style.color = `rgb(${cr}, ${cg}, ${cb})`;
        el.style.fontWeight = weight;
    });
}

// --- "What's New" feature ---

function isFrontPage() {
    const path = window.location.pathname;
    return path === "/" || path === "/news";
}

// Get current page ranks from the displayed rank numbers (works across all pages)
function getPageRanks() {
    const ranks = {};
    const titleRows = document.querySelectorAll(".athing");
    titleRows.forEach(trTitle => {
        const entryId = trTitle.getAttribute("id");
        const rankEl = trTitle.querySelector("span.rank");
        if (entryId && rankEl) {
            const rank = parseInt(rankEl.textContent);
            if (!isNaN(rank)) {
                ranks[entryId] = rank;
            }
        }
    });
    return ranks;
}

// Compare current page ranks to previously seen ranks (single flat map across all pages).
// If a story's diff changed, reset changedAt to now (full intensity).
// If unchanged, keep existing changedAt so it fades over time.
function computeRankDiffs(previousPageRanks, rankDiffChangedAt) {
    const currentRanks = getPageRanks();
    const now = Date.now();

    for (const id of Object.keys(currentRanks)) {
        if (previousPageRanks[id] !== undefined && previousPageRanks[id] !== currentRanks[id]) {
            const diff = previousPageRanks[id] - currentRanks[id]; // positive = moved up
            if (!rankDiffChangedAt[id] || rankDiffChangedAt[id].diff !== diff) {
                rankDiffChangedAt[id] = { diff, changedAt: now };
            }
        }
        // Update this story's rank in the map (merge, don't replace)
        previousPageRanks[id] = currentRanks[id];
    }

    // Clean up fully faded entries (>30 min)
    for (const id of Object.keys(rankDiffChangedAt)) {
        if ((now - rankDiffChangedAt[id].changedAt) >= INDICATOR_FADE_MS) {
            delete rankDiffChangedAt[id];
        }
    }

    chrome.storage.local.set({ previousPageRanks, rankDiffChangedAt });
}

function markNewAndTrendingStories(previousPageRanks, rankDiffChangedAt, seenStories) {
    const frontPage = isFrontPage();

    // Only compute/update rank diffs on front pages
    if (frontPage) {
        computeRankDiffs(previousPageRanks, rankDiffChangedAt);
    }

    // Freeze render time so indicators don't keep fading while the tab is open
    const renderTime = Date.now();

    // Insert indicator cells into story rows (and fix alignment for other rows)
    const allRows = document.querySelectorAll("tr.athing, tr.athing + tr, tr.spacer");
    allRows.forEach(tr => {
        if (tr.classList.contains("athing")) {
            const entryId = tr.getAttribute("id");
            const td = buildIndicatorCell(entryId, frontPage ? rankDiffChangedAt : {}, seenStories, renderTime);
            tr.insertBefore(td, tr.firstChild);
        } else {
            addEmptyIndicatorToRow(tr);
        }
    });

    // Mark all visible stories as seen
    markVisibleStoriesAsSeen(seenStories);
}

// Mark visible stories as seen, storing the timestamp of first viewing
function markVisibleStoriesAsSeen(seenStories) {
    const titleRows = document.querySelectorAll(".athing");
    const now = Date.now();
    let updated = false;
    titleRows.forEach(trTitle => {
        const entryId = trTitle.getAttribute("id");
        if (entryId && !seenStories[entryId]) {
            seenStories[entryId] = now;
            updated = true;
        }
    });
    if (updated) {
        chrome.storage.local.set({ seenStories });
    }
}

const INDICATOR_FADE_MS = 30 * 60 * 1000; // 30 minutes

// Build an indicator td for a story row
function buildIndicatorCell(entryId, rankDiffChangedAt, seenStories, renderTime) {
    const td = document.createElement("td");
    td.className = "hn-mod-indicator-cell";
    td.style.cssText = "min-width: 30px; text-align: right; vertical-align: middle; padding: 0 2px 0 0; white-space: nowrap;";

    if (!entryId) return td;

    const now = renderTime;
    const seenAt = seenStories[entryId];

    // Compute dot opacity — fades over 30 min from when you first saw it
    let dotOpacity = 0;
    if (!seenAt) {
        dotOpacity = 1;
    } else {
        const dotAge = now - seenAt;
        if (dotAge < INDICATOR_FADE_MS) {
            dotOpacity = 1 - (dotAge / INDICATOR_FADE_MS);
        }
    }

    // Trend arrow — fades over 30 min from when the diff last changed, resets on change
    const changedEntry = rankDiffChangedAt[entryId];
    let hasArrow = false;

    if (changedEntry) {
        const diff = changedEntry.diff;
        let trendIndicator = null;

        if (diff > 0) {
            trendIndicator = { number: diff, symbol: "\u2b06", color: "#228b22" };
        } else if (diff < 0) {
            trendIndicator = { number: Math.abs(diff), symbol: "\u2b07", color: "#999" };
        }

        if (trendIndicator) {
            const age = now - changedEntry.changedAt;
            let arrowOpacity = 1;
            if (age >= INDICATOR_FADE_MS) {
                arrowOpacity = 0;
            } else {
                arrowOpacity = 1 - (age / INDICATOR_FADE_MS);
            }

            if (arrowOpacity > 0) {
                hasArrow = true;
                const marker = document.createElement("span");
                marker.style.cssText = `color: ${trendIndicator.color}; opacity: ${arrowOpacity.toFixed(2)}; vertical-align: middle;`;

                const num = document.createElement("span");
                num.textContent = trendIndicator.number;
                num.style.cssText = "font-size: 8px;";

                const arrow = document.createElement("span");
                arrow.textContent = trendIndicator.symbol;
                arrow.style.cssText = "font-size: 11px;";

                marker.appendChild(num);
                marker.appendChild(arrow);
                td.appendChild(marker);
            }
        }
    }

    // New story dot — always reserve space so arrow position stays consistent
    const dot = document.createElement("span");
    dot.textContent = "\u2022";
    if (dotOpacity > 0) {
        dot.style.cssText = `color: #ff6600; font-size: 14px; font-weight: bold; opacity: ${dotOpacity.toFixed(2)}; vertical-align: middle; margin-right: 3px;${hasArrow ? " margin-left: 3px;" : ""}`;
    } else {
        dot.style.cssText = `font-size: 14px; font-weight: bold; opacity: 0; vertical-align: middle; margin-right: 3px;${hasArrow ? " margin-left: 3px;" : ""}`;
    }
    td.appendChild(dot);

    return td;
}

// Process a non-story row to fix column alignment
function addEmptyIndicatorToRow(tr) {
    if (!tr || tr.nodeType !== Node.ELEMENT_NODE || tr.tagName !== "TR") return;
    if (tr.classList.contains("athing")) return;
    if (tr.querySelector(".hn-mod-indicator-cell")) return;

    const colspanTd = tr.querySelector("td[colspan]");
    if (colspanTd) {
        const current = parseInt(colspanTd.getAttribute("colspan"));
        colspanTd.setAttribute("colspan", current + 1);
    } else {
        const td = document.createElement("td");
        tr.insertBefore(td, tr.firstChild);
    }
}

// Watch for dynamically added rows (e.g. when hiding a story) and add indicator cells
function observeNewRows(previousPageRanks, rankDiffChangedAt, seenStories) {
    const firstStory = document.querySelector("tr.athing");
    if (!firstStory) return;
    const storyTable = firstStory.closest("table");
    if (!storyTable) return;

    let knownStoryIds = new Set(Object.keys(getPageRanks()));

    const observer = new MutationObserver(mutations => {
        const renderTime = Date.now();

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!node || node.nodeType !== Node.ELEMENT_NODE || node.tagName !== "TR") continue;
                if (node.querySelector(".hn-mod-indicator-cell")) continue;

                if (node.classList.contains("athing")) {
                    const entryId = node.getAttribute("id");
                    const td = buildIndicatorCell(entryId, rankDiffChangedAt, seenStories, renderTime);
                    node.insertBefore(td, node.firstChild);
                    if (entryId && !seenStories[entryId]) {
                        seenStories[entryId] = Date.now();
                        chrome.storage.local.set({ seenStories });
                    }
                } else {
                    addEmptyIndicatorToRow(node);
                }
            }
        }

        // Only update rank tracking on front pages
        if (isFrontPage()) {
            const currentIds = new Set(Object.keys(getPageRanks()));
            const removedIds = [...knownStoryIds].filter(id => !currentIds.has(id));

            // Adjust previousPageRanks for hidden stories so hiding
            // doesn't cause false rank diffs on other pages
            if (removedIds.length > 0) {
                for (const removedId of removedIds) {
                    const removedRank = previousPageRanks[removedId];
                    if (removedRank !== undefined) {
                        for (const id of Object.keys(previousPageRanks)) {
                            if (previousPageRanks[id] > removedRank) {
                                previousPageRanks[id]--;
                            }
                        }
                        delete previousPageRanks[removedId];
                    }
                }
            }

            // Merge current page ranks
            const currentRanks = getPageRanks();
            for (const id of Object.keys(currentRanks)) {
                previousPageRanks[id] = currentRanks[id];
            }

            knownStoryIds = currentIds;
            chrome.storage.local.set({ previousPageRanks });
        }
    });

    observer.observe(storyTable, { childList: true, subtree: true });
}

// --- Initialization ---

// Load sync storage (keywords/dimming) and local storage (snapshots/visits) in parallel
chrome.storage.sync.get(
    { ciKeywords: [], csKeywords: [], domains: [], dimmedEntries: [], undimmedEntries: [] },
    (syncItems) => {
        CI_KEYWORDS = syncItems.ciKeywords;
        CS_KEYWORDS = syncItems.csKeywords;
        DOMAINS = syncItems.domains;
        DIMMED_ENTRIES = syncItems.dimmedEntries;
        UNDIMMED_ENTRIES = syncItems.undimmedEntries;

        adjustTitlesAndPersistDimming();
        colorizePoints();

        // Load snapshot data and mark new/trending stories
        chrome.storage.local.get(
            { previousPageRanks: {}, rankDiffChangedAt: {}, seenStories: {} },
            (localItems) => {
                markNewAndTrendingStories(
                    localItems.previousPageRanks,
                    localItems.rankDiffChangedAt,
                    localItems.seenStories
                );
                observeNewRows(
                    localItems.previousPageRanks,
                    localItems.rankDiffChangedAt,
                    localItems.seenStories
                );
            }
        );
    }
);

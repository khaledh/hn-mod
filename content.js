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

// Record firstSeen for any stories on the page not already tracked
function snapshotVisibleStories(storyFirstSeen) {
    const now = Date.now();
    const titleRows = document.querySelectorAll(".athing");
    let updated = false;

    titleRows.forEach(trTitle => {
        const entryId = trTitle.getAttribute("id");
        if (entryId && !storyFirstSeen[entryId]) {
            storyFirstSeen[entryId] = now;
            updated = true;
        }
    });

    if (updated) {
        chrome.storage.local.set({ storyFirstSeen });
        // Trigger a background snapshot to update API ranks
        chrome.runtime.sendMessage({ type: "takeSnapshot" });
    }
}

const RANK_WINDOW_MS = 30 * 60 * 1000; // 30 minute rolling window
const RANK_HISTORY_MAX_AGE_MS = 35 * 60 * 1000; // prune entries older than 35 min

// Get current page ranks (1-based position) for each story
function getPageRanks() {
    const ranks = {};
    const titleRows = document.querySelectorAll(".athing");
    titleRows.forEach((trTitle, index) => {
        const entryId = trTitle.getAttribute("id");
        if (entryId) {
            ranks[entryId] = index + 1;
        }
    });
    return ranks;
}

// Compute rank diffs given current ranks against the rolling window baseline.
// Updates rankDiffChangedAt to track when each story's diff last changed (for fading).
// Does NOT push a new snapshot — caller is responsible for that.
function computeRankDiffsFromHistory(rankHistory, currentRanks, rankDiffChangedAt) {
    const now = Date.now();

    // Prune entries older than 35 minutes
    while (rankHistory.length > 0 && (now - rankHistory[0].timestamp) > RANK_HISTORY_MAX_AGE_MS) {
        rankHistory.shift();
    }

    // Find the oldest entry that's at least ~30 minutes old
    // If none is old enough, use the oldest available
    let baseline = rankHistory[0];
    for (const entry of rankHistory) {
        if ((now - entry.timestamp) >= RANK_WINDOW_MS) {
            baseline = entry;
            break;
        }
    }

    // Compute diffs against baseline
    const rankDiff = {};
    if (baseline && baseline.timestamp !== now) {
        for (const id of Object.keys(currentRanks)) {
            if (baseline.ranks[id] !== undefined && baseline.ranks[id] !== currentRanks[id]) {
                rankDiff[id] = baseline.ranks[id] - currentRanks[id]; // positive = moved up
            }
        }
    }

    // Update changedAt timestamps: reset to now if diff changed, remove if diff gone
    for (const id of Object.keys(rankDiff)) {
        if (!rankDiffChangedAt[id] || rankDiffChangedAt[id].diff !== rankDiff[id]) {
            rankDiffChangedAt[id] = { diff: rankDiff[id], changedAt: now };
        }
    }
    for (const id of Object.keys(rankDiffChangedAt)) {
        if (!rankDiff[id]) {
            delete rankDiffChangedAt[id];
        }
    }

    chrome.storage.local.set({ rankHistory, rankDiffChangedAt });
    return rankDiff;
}

// Snapshot current page ranks into history and compute diffs against the rolling window.
function computeRankDiffs(rankHistory, rankDiffChangedAt) {
    const currentRanks = getPageRanks();
    rankHistory.push({ timestamp: Date.now(), ranks: currentRanks });
    return computeRankDiffsFromHistory(rankHistory, currentRanks, rankDiffChangedAt);
}

function markNewAndTrendingStories(storyFirstSeen, rankHistory, rankDiffChangedAt, seenStories) {
    // Record new stories on the page
    snapshotVisibleStories(storyFirstSeen);

    // Compute rank diffs from rolling window
    const rankDiff = computeRankDiffs(rankHistory, rankDiffChangedAt);

    // Insert indicator cells into story rows (and fix alignment for other rows)
    const allRows = document.querySelectorAll("tr.athing, tr.athing + tr, tr.spacer");
    allRows.forEach(tr => {
        if (tr.classList.contains("athing")) {
            const entryId = tr.getAttribute("id");
            const td = buildIndicatorCell(entryId, storyFirstSeen, rankDiff, rankDiffChangedAt, seenStories);
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
function buildIndicatorCell(entryId, storyFirstSeen, rankDiff, rankDiffChangedAt, seenStories) {
    const td = document.createElement("td");
    td.className = "hn-mod-indicator-cell";
    td.style.cssText = "min-width: 30px; text-align: right; vertical-align: middle; padding: 0 2px 0 0; white-space: nowrap;";

    if (!entryId) return td;

    const now = Date.now();
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
    const diff = rankDiff[entryId];
    let hasArrow = false;

    if (diff) {
        let trendIndicator = null;

        if (diff > 0) {
            trendIndicator = { number: diff, symbol: "\u2b06", color: "#228b22" };
        } else if (diff < 0) {
            trendIndicator = { number: Math.abs(diff), symbol: "\u2b07", color: "#999" };
        }

        if (trendIndicator) {
            let arrowOpacity = 1;
            const changedEntry = rankDiffChangedAt[entryId];
            if (changedEntry) {
                const age = now - changedEntry.changedAt;
                if (age >= INDICATOR_FADE_MS) {
                    arrowOpacity = 0;
                } else {
                    arrowOpacity = 1 - (age / INDICATOR_FADE_MS);
                }
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
function observeNewRows(storyFirstSeen, rankHistory, rankDiffChangedAt, seenStories) {
    const firstStory = document.querySelector("tr.athing");
    if (!firstStory) return;
    const storyTable = firstStory.closest("table");
    if (!storyTable) return;

    // Track which story IDs are currently on the page so we can detect removals
    let knownStoryIds = new Set(Object.keys(getPageRanks()));

    const observer = new MutationObserver(mutations => {
        const currentRanks = getPageRanks();
        const currentIds = new Set(Object.keys(currentRanks));

        // Find stories that were removed (hidden) — these cause rank shifts
        const removedIds = [...knownStoryIds].filter(id => !currentIds.has(id));

        if (removedIds.length > 0) {
            // For each removed story, adjust all historical snapshots:
            // remove the hidden story and shift ranks of stories that were below it
            for (const snapshot of rankHistory) {
                for (const removedId of removedIds) {
                    const removedRank = snapshot.ranks[removedId];
                    if (removedRank !== undefined) {
                        // Shift up all stories that were ranked below the removed one
                        for (const id of Object.keys(snapshot.ranks)) {
                            if (snapshot.ranks[id] > removedRank) {
                                snapshot.ranks[id]--;
                            }
                        }
                        delete snapshot.ranks[removedId];
                    }
                }
            }
            chrome.storage.local.set({ rankHistory });
        }

        knownStoryIds = currentIds;

        // Compute diffs using the corrected history (without adding a new snapshot)
        const rankDiff = computeRankDiffsFromHistory(rankHistory, currentRanks, rankDiffChangedAt);

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!node || node.nodeType !== Node.ELEMENT_NODE || node.tagName !== "TR") continue;
                if (node.querySelector(".hn-mod-indicator-cell")) continue;

                if (node.classList.contains("athing")) {
                    const entryId = node.getAttribute("id");
                    // Record firstSeen for this story if not already tracked
                    if (entryId && !storyFirstSeen[entryId]) {
                        storyFirstSeen[entryId] = Date.now();
                        chrome.storage.local.set({ storyFirstSeen });
                    }
                    const td = buildIndicatorCell(entryId, storyFirstSeen, rankDiff, rankDiffChangedAt, seenStories);
                    node.insertBefore(td, node.firstChild);
                    // Mark dynamically added stories as seen
                    if (!seenStories[entryId]) {
                        seenStories[entryId] = Date.now();
                        chrome.storage.local.set({ seenStories });
                    }
                } else {
                    addEmptyIndicatorToRow(node);
                }
            }
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
            { storyFirstSeen: {}, rankHistory: [], rankDiffChangedAt: {}, seenStories: {} },
            (localItems) => {
                markNewAndTrendingStories(
                    localItems.storyFirstSeen,
                    localItems.rankHistory,
                    localItems.rankDiffChangedAt,
                    localItems.seenStories
                );
                observeNewRows(
                    localItems.storyFirstSeen,
                    localItems.rankHistory,
                    localItems.rankDiffChangedAt,
                    localItems.seenStories
                );
            }
        );
    }
);

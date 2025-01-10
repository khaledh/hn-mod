let
    CI_KEYWORDS = [],
    CS_KEYWORDS = [],
    DOMAINS = [],
    DIMMED_ENTRIES = [];
    UNDIMMED_ENTRIES = []; // allows user to undim entries that were dimmed by the keyword filters

// Function to dim titles, reduce font size, add a dimming link, and persist dimmed state
function adjustTitlesAndPersistDimming() {
    // Function to apply dimming effect
    const applyDimmingEffect = (titleCells, subtext, entryId, spacingRowPrev, spacingRowNext, tdRank, tdVoteLinks, isDimming, doSave) => {
        const opacity = isDimming ? "0.35" : "1"; // Dimmed or original opacity
        const fontSize = isDimming ? "60%" : ""; // Dimmed or original font size
        const imgSize = isDimming ? "7" : "12"; // Dimmed or original image size
        const spacingHeightPrev = isDimming ? "4px" : "10px"; // Dimmed or original spacing
        const spacingHeightNext = isDimming ? "6px" : "10px"; // Dimmed or original spacing
        const voteArrowsSize = isDimming ? "7px" : "10px";

        titleCells.forEach(cell => {
            cell.style.opacity = opacity;
            cell.style.fontSize = fontSize;
            let img = cell.querySelector("img");
            if (img) {
                img.width = imgSize;
                img.height = imgSize;
            }
        });
        if (subtext) {
            subtext.style.opacity = opacity;
            subtext.style.fontSize = fontSize;
        }
        if (spacingRowPrev) {
            spacingRowPrev.style.setProperty("height", spacingHeightPrev, "important");
        }
        if (spacingRowNext) {
            spacingRowNext.style.setProperty("height", spacingHeightNext, "important");
        }
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
    titleRows.forEach(row => {
        const entryId = row.getAttribute("id"); // Get the entry"s unique ID
        const titleLink = row.querySelector(".titleline > a");
        const siteLink = row.querySelector(".sitestr");
        const titleCells = row.querySelectorAll("td.title");
        let subtextRow = row.nextElementSibling;
        let subtext = subtextRow ? subtextRow.querySelector("td.subtext") : null;

        let tdRank = row.querySelector("td:first-child");
        let tdVoteLinks = row.querySelector("td:nth-child(2)");

        let spacingRowPrev = row.previousElementSibling;
        let spacingRowNext = subtextRow.nextElementSibling;

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
            checkTitle(titleLink, siteLink) || DIMMED_ENTRIES.includes(entryId)
        );
        if (isInitiallyDimmed) {
            applyDimmingEffect(titleCells, subtext, entryId, spacingRowPrev, spacingRowNext, tdRank, tdVoteLinks, true, false);
        }

        // Add or update the "dim/undim" link in subtext
        if (subtext) {
            // Locate or create the dim link
            let dimLink = subtext.querySelector(".dimLink");
            if (!dimLink) {
                dimLink = document.createElement("a");
                dimLink.href = "#";
                dimLink.className = "dimLink"; // Add a class for easy identification
                subtext.appendChild(document.createTextNode(" | "));
                subtext.appendChild(dimLink);
            }
            dimLink.innerText = isInitiallyDimmed ? "undim" : "dim";
            dimLink.onclick = (event) => {
                event.preventDefault();
                const isDimming = dimLink.innerText === "dim";
                applyDimmingEffect(titleCells, subtext, entryId, spacingRowPrev, spacingRowNext, tdRank, tdVoteLinks, isDimming, true);
                dimLink.innerText = isDimming ? "undim" : "dim"; // Toggle the link text
            };
        }
    });
}

chrome.storage.sync.get(
    { ciKeywords: [], csKeywords: [], domains: [], dimmedEntries: [], undimmedEntries: [] },
    (items) => {
        CI_KEYWORDS = items.ciKeywords;
        CS_KEYWORDS = items.csKeywords;
        DOMAINS = items.domains;
        DIMMED_ENTRIES = items.dimmedEntries;
        UNDIMMED_ENTRIES = items.undimmedEntries;

        adjustTitlesAndPersistDimming();
    }
);


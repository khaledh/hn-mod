// case insensitive keywords
const CI_KEYWORDS = [
  'is hiring', 'startup', 'startups', 'layoff', 'fired',
  'deep learning', 'foundation model', 'foundation models', 'foundational model', 'foundational models',
  'generative',
  'llm', 'llms', 'large language model', 'large language models', 'language model', 'language models',
  'embedding', 'embeddings', 'transformers',
  'llama', 'mistral', 'mixtral', 'stablelm',
  'kubernetes', 'crypto', 'cryptocurrency', 'blockchain', 'ethereum', 'bitcoin',
  'apple watch', '3d print', '3d printer', '3d printing',
  'twitter', 'tesla', 'cybertruck', 'spacex', 'battery', 'microscope', 'telescope',
  'quantum', 'academic', 'academia',
  'openstreetmap', 'nintendo', 'tiktok',
  'mastodon', 'fediverse', 'social media',
  'webb', 'satellite', 'satellites',
  'u.s.', 'china', 'chinese', 'japan', 'japanese', 'india', 'indian', 'saudi', 'vietnam', 'vietnamese',
  'american',
  'ukraine', 'ukrainian', 'russia', 'russian', 'military', 'war', 'drone',
  'climate', 'weather', 'solar', 'lunar',
  'mental', 'depression', 'anxiety', 'loneliness', 'suicide', 'public health',
  'asthma', 'cancer', 'abortion', 'metabolism', 'protein', 'pregnancy', 'abortion',
  'boeing', 'congress', 'biden', 'trump',
  'heat pump', 'housing', 'rent', 'rents', 'basic income', 'unemployment',
];

// case-sensitive keywords
const CS_KEYWORDS = [
  'AI', 'A.I.', 'A.I', 'ML',
  'ISP', 'ISPs',
  'EV', 'EVs',
  'PFAS',
  'America', 'US', 'EU', 'UK', 'Africa', 'Asia', 'Australia', 'Taiwan',
  'Norway', 'Brazil', 'Israel',
  'Bay Area', 'San Francisco', 'California', 'New York', 'NYC',
  'Musk',
  'TSMC', 'NES',
  'CIA', 'NSA', 'CISA', 'FISA', 'NASA', 'EPA', 'NTSB', 'DOE',
]

const SITES = [
  'theatlantic.com', 'arstechnica.com', 'theverge.com', 'techcrunch.com', 'engadget.com',
  'bbc.com', 'cnn.com', 'msn.com', 'reuters.com', 'theguardian.com', 'washingtonpost.com',
  'usatoday.com', 'nytimes.com', 'latimes.com', 'bloomberg.com', 'bnnbloomberg.ca', 'wsj.com',
  'fortune.com', 'cbc.ca', 'npr.org', 'gallup.com',
  'phys.org', 'science.org', 'sciencedirect.com', 'sciencealert.com', 'sciencenews.org', 'nature.com',
  'springer.com', 'smithsonianmag.com', 'eff.org', 'justice.gov',
]


// Function to dim titles, reduce font size, add a dimming link, and persist dimmed state
function adjustTitlesAndPersistDimming() {
    const DIMMED_ENTRIES_KEY = 'dimmedEntries'; // Key for storage

    // Function to apply dimming effect
    const applyDimmingEffect = (titleCells, subtext, entryId, spacingRowPrev, spacingRowNext, tdRank, tdVoteLinks, isDimming, doSave) => {
        const opacity = isDimming ? '0.35' : '1'; // Dimmed or original opacity
        const fontSize = isDimming ? '60%' : ''; // Dimmed or original font size
        const imgSize = isDimming ? '7' : '12'; // Dimmed or original image size
        const spacingHeightPrev = isDimming ? '4px' : '10px'; // Dimmed or original spacing
        const spacingHeightNext = isDimming ? '6px' : '10px'; // Dimmed or original spacing
        const voteArrowsSize = isDimming ? '7px' : '10px';

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
            // Update the stored list of dimmed entries
            const index = dimmedEntries.indexOf(entryId);
            if (isDimming && index === -1) {
                dimmedEntries.push(entryId);
            } else if (!isDimming && index !== -1) {
                dimmedEntries.splice(index, 1);
            }
            // GM_setValue(DIMMED_ENTRIES_KEY, JSON.stringify(dimmedEntries));
            chrome.storage.sync.set({ 'dimmedEntries': dimmedEntries });
        }
    };

    let dimmedEntries = [];
    
    chrome.storage.sync.get('dimmedEntries', (result) => {
        dimmedEntries = result[DIMMED_ENTRIES_KEY] || [];

        // Get all title rows on Hacker News homepage
        const titleRows = document.querySelectorAll('.athing');

        // Iterate over each title row
        titleRows.forEach(row => {
            const entryId = row.getAttribute('id'); // Get the entry's unique ID
            const titleLink = row.querySelector('.titleline > a');
            const siteLink = row.querySelector('.sitestr');
            const titleCells = row.querySelectorAll('td.title');
            let subtextRow = row.nextElementSibling;
            let subtext = subtextRow ? subtextRow.querySelector('td.subtext') : null;

            let tdRank = row.querySelector("td:first-child");
            let tdVoteLinks = row.querySelector("td:nth-child(2)");

            let spacingRowPrev = row.previousElementSibling;
            let spacingRowNext = subtextRow.nextElementSibling;

            function escapeForRegex(string) {
            return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
            }

            // Check if the entry should be initially dimmed
            function checkTitle(title, site) {
                return (
                (site && SITES.some(s => site.innerText.includes(s))) ||
                CS_KEYWORDS.some(kw => (new RegExp(`(^|\\W)${escapeForRegex(kw)}(\\W|$)`)).test(title.innerText)) ||
                CI_KEYWORDS.some(kw => (new RegExp(`(^|\\W)${escapeForRegex(kw)}(\\W|$)`)).test(title.innerText.toLowerCase()))
                );
            }
            const isInitiallyDimmed = checkTitle(titleLink, siteLink) || dimmedEntries.includes(entryId);
            if (isInitiallyDimmed) {
                applyDimmingEffect(titleCells, subtext, entryId, spacingRowPrev, spacingRowNext, tdRank, tdVoteLinks, true, false);
            }

            // Add or update the 'dim/undim' link in subtext
            if (subtext) {
                // Locate or create the dim link
                let dimLink = subtext.querySelector('.dimLink');
                if (!dimLink) {
                    dimLink = document.createElement('a');
                    dimLink.href = '#';
                    dimLink.className = 'dimLink'; // Add a class for easy identification
                    subtext.appendChild(document.createTextNode(" | "));
                    subtext.appendChild(dimLink);
                }
                dimLink.innerText = isInitiallyDimmed ? 'undim' : 'dim';
                dimLink.onclick = (event) => {
                    event.preventDefault();
                    const isDimming = dimLink.innerText === 'dim';
                    applyDimmingEffect(titleCells, subtext, entryId, spacingRowPrev, spacingRowNext, tdRank, tdVoteLinks, isDimming, true);
                    dimLink.innerText = isDimming ? 'undim' : 'dim'; // Toggle the link text
                };
            }
        });
    });

}

adjustTitlesAndPersistDimming();

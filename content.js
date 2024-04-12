// Define an array of keywords to match against story titles
const LC_KEYWORDS = [
  'is hiring', 'startup', 'layoff', 'fired',
  'deep learning', 'llm', 'language model', 'foundation model', 'foundational model', 'generative', 'embedding', 'transformers',
  'llama', 'mistral', 'mixtral', 'stablelm',
  'kubernetes', 'crypto',
  'apple watch', '3d print',
  'twitter', 'tesla', 'cybertruck', 'spacex',
  'quantum',
  'openstreetmap', 'nintendo', 'tiktok',
  'mastodon', 'fediverse', 'social media',
  'webb', 'satellite',
  'u.s.', 'china', 'chinese', 'japan', 'japanese', 'india', 'indian', 'saudi', 'vietnam', 'vietnamese',
  'american',
  'ukraine', 'ukrainian', 'russia', 'russian', 'military', 'war', 'drone',
  'climate', 'weather', 'solar', 'lunar',
  'mental', 'depression', 'anxiety', 'loneliness', 'suicide', 'public health',
  'asthma', 'cancer', 'abortion', 'metabolism', 'protein', 'pregnancy', 'abortion',
  'boeing', 'congress', 'biden', 'trump',
  'heat pump', 'housing', 'rent', 'basic income', 'unemployment',
];

const UC_KEYWORDS = [
  'AI', 'A.I.', 'A.I', 'ML',
  'ISP', 'EV',
  'America', 'US', 'EU', 'UK', 'Africa', 'Asia', 'Australia', 'Taiwan',
  'Norway',
  'Bay Area', 'San Francisco', 'California', 'New York', 'NYC',
  'Musk',
  'TSMC', 'NES',
  'CIA', 'NSA', 'CISA', 'FISA', 'NASA', 'EPA', 'NTSB', 'DOE',
]

const SITES = [
  'theatlantic.com', 'arstechnica.com', 'theverge.com', 'techcrunch.com', 'engadget.com',
  'bbc.com', 'cnn.com', 'msn.com', 'reuters.com', 'theguardian.com', 'washingtonpost.com',
  'usatoday.com', 'nytimes.com', 'latimes.com', 'bloomberg.com', 'wsj.com',
  'npr.org', 'phys.org', 'science.org', 'sciencedirect.com', 'sciencealert.com', 'nature.com',
  'springer.com', 'smithsonianmag.com', 'eff.org', 'justice.gov',
]


// Function to dim titles, reduce font size, add a dimming link, and persist dimmed state
function adjustTitlesAndPersistDimming(keywords) {
    // const DIMMED_ENTRIES_KEY = 'dimmedEntries'; // Key for storage

    // Retrieve dimmed entries from localStorage or initialize an empty array
    // const dimmedEntries = JSON.parse(GM_getValue(DIMMED_ENTRIES_KEY) || '[]');
    const dimmedEntries = [];

    // Function to apply dimming effect
    const applyDimmingEffect = (titleCells, subtext, entryId, spacingRowPrev, spacingRowNext, tdRank, tdVoteLinks, isDimming) => {
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

        // Update the stored list of dimmed entries
        const index = dimmedEntries.indexOf(entryId);
        if (isDimming && index === -1) {
            dimmedEntries.push(entryId);
        } else if (!isDimming && index !== -1) {
            dimmedEntries.splice(index, 1);
        }
        // GM_setValue(DIMMED_ENTRIES_KEY, JSON.stringify(dimmedEntries));
    };

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
              UC_KEYWORDS.some(kw => (new RegExp(`(^|\\W)${escapeForRegex(kw)}(\\W|$)`)).test(title.innerText)) ||
              LC_KEYWORDS.some(kw => (new RegExp(`(^|\\W)${escapeForRegex(kw)}(\\W|$)`)).test(title.innerText.toLowerCase()))
            );
        }
        const isInitiallyDimmed = checkTitle(titleLink, siteLink) || dimmedEntries.includes(entryId);
        if (isInitiallyDimmed) {
            applyDimmingEffect(titleCells, subtext, entryId, spacingRowPrev, spacingRowNext, tdRank, tdVoteLinks, true);
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
                applyDimmingEffect(titleCells, subtext, entryId, spacingRowPrev, spacingRowNext, tdRank, tdVoteLinks, isDimming);
                dimLink.innerText = isDimming ? 'undim' : 'dim'; // Toggle the link text
            };
        }
    });
}

adjustTitlesAndPersistDimming();

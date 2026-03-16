const ALARM_NAME = "hn-snapshot";
const SNAPSHOT_INTERVAL_MINUTES = 5;
const PRUNE_AGE_MS = 72 * 60 * 60 * 1000; // 72 hours
const FADE_MS = 30 * 60 * 1000; // 30 minutes — must match content.js INDICATOR_FADE_MS
const HN_TOP_STORIES_URL = "https://hacker-news.firebaseio.com/v0/topstories.json";

// Fetch current top stories and record first-seen times
async function takeSnapshot() {
  try {
    const response = await fetch(HN_TOP_STORIES_URL);
    const storyIds = await response.json();
    // Track all top stories (up to 500 returned by the API)
    const frontPageIds = storyIds;

    const {
      storyFirstSeen = {},
      apiRanks = {},
      stableRank = {},
      rankChangedAt = {},
      rankDiff = {},
    } = await new Promise(resolve =>
      chrome.storage.local.get({
        storyFirstSeen: {},
        apiRanks: {},
        stableRank: {},
        rankChangedAt: {},
        rankDiff: {},
      }, resolve)
    );

    const now = Date.now();

    // Clear stableRank for stories whose indicator has faded out
    for (const id of Object.keys(stableRank)) {
      const changedAt = rankChangedAt[id];
      if (changedAt && (now - changedAt) >= FADE_MS) {
        delete stableRank[id];
        delete rankChangedAt[id];
        delete rankDiff[id];
      }
    }

    // Record first-seen and track rank changes
    for (let i = 0; i < frontPageIds.length; i++) {
      const id = frontPageIds[i];
      const newRank = i + 1;

      if (!storyFirstSeen[id]) {
        storyFirstSeen[id] = now;
      }

      // Detect rank change
      if (apiRanks[id] !== undefined && apiRanks[id] !== newRank) {
        // Set stable rank to the rank before movement started
        if (stableRank[id] === undefined) {
          stableRank[id] = apiRanks[id];
        }
        // Cumulative diff from stable position
        rankDiff[id] = stableRank[id] - newRank;
        rankChangedAt[id] = now;
      }

      apiRanks[id] = newRank;
    }

    // Prune old entries
    for (const id of Object.keys(storyFirstSeen)) {
      if (now - storyFirstSeen[id] > PRUNE_AGE_MS) {
        delete storyFirstSeen[id];
        delete apiRanks[id];
        delete stableRank[id];
        delete rankChangedAt[id];
        delete rankDiff[id];
      }
    }

    await new Promise(resolve =>
      chrome.storage.local.set({ storyFirstSeen, apiRanks, stableRank, rankChangedAt, rankDiff }, resolve)
    );

    console.log(`[hn-mod] Snapshot taken: ${frontPageIds.length} stories, ${Object.keys(storyFirstSeen).length} tracked`);
  } catch (err) {
    console.error("[hn-mod] Snapshot failed:", err);
  }
}

// Take a snapshot immediately on load, then set up periodic alarm
takeSnapshot().then(() => {
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: SNAPSHOT_INTERVAL_MINUTES,
  });
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) {
    takeSnapshot();
  }
});

// Allow content script to trigger a snapshot (e.g. when new stories are detected)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "takeSnapshot") {
    takeSnapshot();
  }
});

const ALARM_NAME = "hn-snapshot";
const SNAPSHOT_INTERVAL_MINUTES = 5;
const PRUNE_AGE_MS = 72 * 60 * 60 * 1000; // 72 hours
const HN_TOP_STORIES_URL = "https://hacker-news.firebaseio.com/v0/topstories.json";

// Fetch current top stories and record first-seen times
async function takeSnapshot() {
  try {
    const response = await fetch(HN_TOP_STORIES_URL);
    const storyIds = await response.json();

    const { storyFirstSeen = {} } = await new Promise(resolve =>
      chrome.storage.local.get({ storyFirstSeen: {} }, resolve)
    );

    const now = Date.now();

    for (const id of storyIds) {
      if (!storyFirstSeen[id]) {
        storyFirstSeen[id] = now;
      }
    }

    // Prune old entries
    for (const id of Object.keys(storyFirstSeen)) {
      if (now - storyFirstSeen[id] > PRUNE_AGE_MS) {
        delete storyFirstSeen[id];
      }
    }

    await new Promise(resolve =>
      chrome.storage.local.set({ storyFirstSeen }, resolve)
    );

    console.log(`[hn-mod] Snapshot taken: ${storyIds.length} stories, ${Object.keys(storyFirstSeen).length} tracked`);
  } catch (err) {
    console.error("[hn-mod] Snapshot failed:", err);
  }
}

// Set up alarm unconditionally
chrome.alarms.create(ALARM_NAME, {
  periodInMinutes: SNAPSHOT_INTERVAL_MINUTES,
});

takeSnapshot();

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) {
    takeSnapshot();
  }
});

// Allow content script to trigger a snapshot
let lastSnapshotTime = 0;
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "takeSnapshot") {
    const now = Date.now();
    if (now - lastSnapshotTime > 60000) {
      lastSnapshotTime = now;
      takeSnapshot();
    }
  }
});

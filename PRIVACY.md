# Privacy Policy

**Hacker News Mod** does not collect, transmit, or share any personal data.

## What the extension stores

All data is stored locally on your device using Chrome's `chrome.storage.sync` API:

- **User preferences**: dimming keywords, domains, and display settings.
- **Tracking data**: seen story IDs, rank history, hidden/dismissed story IDs — used to show new-story indicators and the unseen stories panel.

This data syncs across your Chrome browsers if you are signed into Chrome, using Google's built-in sync infrastructure. The extension does not operate or control this sync.

## External requests

The extension makes requests only to:

- **news.ycombinator.com** — to read and modify the Hacker News page, and to fetch story auth tokens for hide/flag/favorite actions.
- **hacker-news.firebaseio.com** — the official Hacker News API, to fetch public story data for the unseen stories panel.

No data is sent to any other server. There are no analytics, tracking pixels, or third-party services.

## Contact

If you have questions about this policy, please open an issue at [github.com/khaledh/hn-mod](https://github.com/khaledh/hn-mod).

// HN API helpers
//
// Wraps Firebase API and HN page fetches used by the unseen panel.

const API_BASE = 'https://hacker-news.firebaseio.com/v0';

export async function fetchTopStoryIds() {
  const res = await fetch(`${API_BASE}/topstories.json`);
  return res.json();
}

export async function fetchStory(id) {
  const res = await fetch(`${API_BASE}/item/${id}.json`);
  return res.json();
}

/** Fetch a story's item page and extract its per-story auth token from the hide link */
export async function fetchAuthToken(id) {
  try {
    const res = await fetch(`https://news.ycombinator.com/item?id=${id}`);
    const html = await res.text();
    const match = html.match(new RegExp(`hide\\?id=${id}&(?:amp;)?auth=([a-f0-9]+)`));
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

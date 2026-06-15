// HN Sieve snapshot integration
//
// Fetches the public hn-sieve JSON snapshot and decorates matching HN story
// rows with the story TL;DR and topic classification.

import { isItemPage, isListingPage } from './page.ts';

const SNAPSHOT_URL = 'https://pub-514b8236a581400b8257fb55d8ec78f6.r2.dev/v1/snapshot.json';
const SNAPSHOT_STORAGE_KEY = 'hnSieveSnapshotCache';
const SNAPSHOT_REFETCH_COOLDOWN_MS = 60 * 1000;
const SNAPSHOT_REVALIDATE_AFTER_MS = 5 * 60 * 1000;

interface SieveSnapshotStory {
  id: number;
  tldr: string | null;
  primaryTopic: string | null;
  secondaryTopic: string | null;
  primaryTopicReason: string | null;
  secondaryTopicReason: string | null;
  classifiedAt: string | null;
}

interface SieveSnapshot {
  version: number;
  generatedAt: string;
  stories: Record<string, SieveSnapshotStory>;
}

interface SieveSnapshotCacheEntry {
  cachedAt: number;
  etag: string | null;
  snapshot: SieveSnapshot;
}

let cachedSnapshot: SieveSnapshot | null = null;
let cachedAt = 0;
let cachedEtag: string | null = null;
let lastFetchAttemptAt = 0;
let pendingLoad: Promise<SieveSnapshot | null> | null = null;
let pendingFetch: Promise<SieveSnapshot | null> | null = null;

function isValidSnapshot(value: unknown): value is SieveSnapshot {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'stories' in value &&
      typeof (value as { stories?: unknown }).stories === 'object',
  );
}

function isValidCacheEntry(value: unknown): value is SieveSnapshotCacheEntry {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { cachedAt?: unknown }).cachedAt === 'number' &&
      ((value as { etag?: unknown }).etag === undefined ||
        (value as { etag?: unknown }).etag === null ||
        typeof (value as { etag?: unknown }).etag === 'string') &&
      isValidSnapshot((value as { snapshot?: unknown }).snapshot),
  );
}

function localStorageArea(): chrome.storage.StorageArea | null {
  return typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null;
}

function visibleStoryIds(): string[] {
  return [...document.querySelectorAll('tr.athing')]
    .map((row) => row.getAttribute('id'))
    .filter((id): id is string => Boolean(id));
}

function snapshotHasStories(snapshot: SieveSnapshot, storyIds: string[]): boolean {
  return storyIds.every((id) => Boolean(snapshot.stories[id]));
}

function classifiedAtMs(story: SieveSnapshotStory | undefined): number {
  if (!story?.classifiedAt) return 0;
  const value = Date.parse(story.classifiedAt);
  return Number.isNaN(value) ? 0 : value;
}

function mergeSnapshotStories(
  freshSnapshot: SieveSnapshot,
  previousSnapshot: SieveSnapshot | null,
): SieveSnapshot {
  if (!previousSnapshot) {
    return freshSnapshot;
  }

  const stories = { ...previousSnapshot.stories };
  for (const [id, freshStory] of Object.entries(freshSnapshot.stories)) {
    const cachedStory = stories[id];
    if (!cachedStory || classifiedAtMs(freshStory) >= classifiedAtMs(cachedStory)) {
      stories[id] = freshStory;
    }
  }

  return {
    ...freshSnapshot,
    stories,
  };
}

async function loadCachedSnapshot(): Promise<SieveSnapshot | null> {
  if (cachedSnapshot) {
    return cachedSnapshot;
  }

  if (pendingLoad) {
    return pendingLoad;
  }

  pendingLoad = new Promise<SieveSnapshot | null>((resolve) => {
    const storage = localStorageArea();
    if (!storage) {
      resolve(null);
      return;
    }

    storage.get(SNAPSHOT_STORAGE_KEY, (items) => {
      const entry = items[SNAPSHOT_STORAGE_KEY];
      if (chrome.runtime.lastError || !isValidCacheEntry(entry)) {
        resolve(null);
        return;
      }

      cachedSnapshot = entry.snapshot;
      cachedAt = entry.cachedAt;
      cachedEtag = entry.etag ?? null;
      resolve(entry.snapshot);
    });
  }).finally(() => {
    pendingLoad = null;
  });

  return pendingLoad;
}

function saveCachedSnapshot(snapshot: SieveSnapshot): void {
  const entry: SieveSnapshotCacheEntry = {
    cachedAt,
    etag: cachedEtag,
    snapshot,
  };

  localStorageArea()?.set({ [SNAPSHOT_STORAGE_KEY]: entry });
}

async function fetchSieveSnapshot(): Promise<SieveSnapshot | null> {
  if (pendingFetch) {
    return pendingFetch;
  }

  lastFetchAttemptAt = Date.now();
  const headers = cachedEtag ? { 'If-None-Match': cachedEtag } : undefined;

  pendingFetch = fetch(SNAPSHOT_URL, { cache: 'no-store', headers })
    .then(async (response) => {
      if (response.status === 304) {
        cachedAt = Date.now();
        if (cachedSnapshot) saveCachedSnapshot(cachedSnapshot);
        return cachedSnapshot;
      }
      if (!response.ok) return null;
      const payload = await response.json();
      if (!isValidSnapshot(payload)) return null;
      cachedEtag = response.headers.get('ETag') ?? cachedEtag;
      cachedSnapshot = mergeSnapshotStories(payload, cachedSnapshot);
      cachedAt = Date.now();
      saveCachedSnapshot(cachedSnapshot);
      return cachedSnapshot;
    })
    .catch(() => null)
    .finally(() => {
      pendingFetch = null;
    });

  return pendingFetch;
}

async function getSnapshotForCurrentPage(): Promise<SieveSnapshot | null> {
  const storyIds = visibleStoryIds();
  const cached = await loadCachedSnapshot();
  const canUseCached = cached && snapshotHasStories(cached, storyIds);
  const cacheIsFresh = cached && Date.now() - cachedAt < SNAPSHOT_REVALIDATE_AFTER_MS;
  if (canUseCached && cacheIsFresh) {
    return cached;
  }

  if (!canUseCached && cached && Date.now() - lastFetchAttemptAt < SNAPSHOT_REFETCH_COOLDOWN_MS) {
    return cached;
  }

  const fresh = await fetchSieveSnapshot();
  return fresh ?? cached;
}

function buildTopicLabel(story: SieveSnapshotStory): HTMLElement | null {
  if (!story.primaryTopic) {
    return null;
  }

  const fragment = document.createElement('span');
  fragment.className = 'hn-sieve-topics';

  const primary = document.createElement('span');
  primary.className = 'hn-sieve-topic';
  primary.textContent = story.primaryTopic;
  if (story.primaryTopicReason) primary.title = story.primaryTopicReason;
  fragment.appendChild(primary);

  if (story.secondaryTopic) {
    const dot = document.createElement('span');
    dot.className = 'hn-sieve-topic-dot';
    dot.textContent = '\u2022';
    fragment.appendChild(dot);

    const secondary = document.createElement('span');
    secondary.className = 'hn-sieve-topic';
    secondary.textContent = story.secondaryTopic;
    if (story.secondaryTopicReason) secondary.title = story.secondaryTopicReason;
    fragment.appendChild(secondary);
  }

  return fragment;
}

function metadataLineFor(subtext: Element): Element {
  const subline = subtext.querySelector('.subline');
  if (!subline) return subtext;

  const dimLink = subtext.querySelector('.dimLink');
  if (dimLink && dimLink.parentElement === subtext) {
    const previousNode = dimLink.previousSibling;
    if (previousNode?.nodeType === Node.TEXT_NODE && previousNode.textContent?.includes('|')) {
      subline.appendChild(previousNode);
    } else {
      subline.append(' | ');
    }
    subline.appendChild(dimLink);
  }

  return subline;
}

function decorateStory(row: Element, story: SieveSnapshotStory): void {
  if (!(row instanceof HTMLElement)) {
    return;
  }

  const renderedClassifiedAt = Number(row.dataset.hnSieveClassifiedAt || '0');
  const nextClassifiedAt = classifiedAtMs(story);
  if (row.dataset.hnSieveDecorated === '1' && nextClassifiedAt <= renderedClassifiedAt) return;

  const subtextRow = row.nextElementSibling;
  const subtext = subtextRow?.querySelector('.subtext');
  if (!subtext) {
    return;
  }

  row.dataset.hnSieveDecorated = '1';
  row.dataset.hnSieveClassifiedAt = String(nextClassifiedAt);
  subtext.querySelector('.hn-sieve-tldr')?.remove();
  subtext.querySelector('.hn-sieve-topics')?.previousSibling?.remove();
  subtext.querySelector('.hn-sieve-topics')?.remove();
  const metadataLine = metadataLineFor(subtext);

  if (story.tldr) {
    const tldr = document.createElement('span');
    tldr.className = 'hn-sieve-tldr';
    tldr.textContent = story.tldr;
    subtext.prepend(tldr);
  }

  const topicLabel = buildTopicLabel(story);
  if (topicLabel) {
    metadataLine.append(' | ', topicLabel);
  }
}

export async function addHnSieveMetadata(): Promise<void> {
  if (!isListingPage() && !isItemPage()) return;

  const snapshot = await getSnapshotForCurrentPage();
  if (!snapshot) return;

  for (const row of document.querySelectorAll('tr.athing')) {
    const id = row.getAttribute('id');
    const story = id ? snapshot.stories[id] : null;
    if (story) decorateStory(row, story);
  }
}

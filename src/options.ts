// Options page — tabbed interface

import { allChunkKeys, allLocalTrackingKeys } from './storage.ts';

interface OptionsState {
  ci: string[];
  cs: string[];
  domains: string[];
}

const state: OptionsState = {
  ci: [], // case-insensitive keywords
  cs: [], // case-sensitive keywords
  domains: [], // domains
};

// --- Tab switching ---

function setupTabs(): void {
  const tabs = document.querySelectorAll<HTMLElement>('.tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.panel}`)!.classList.add('active');
    });
  });
}

// --- Tag rendering ---

function renderTags(key: keyof OptionsState, containerId: string): void {
  const container = document.getElementById(containerId)!;
  container.innerHTML = '';
  for (const value of state[key]) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = value;

    const remove = document.createElement('span');
    remove.className = 'remove';
    remove.textContent = '\u00d7';
    remove.onclick = () => {
      state[key] = state[key].filter((v) => v !== value);
      renderTags(key, containerId);
    };

    tag.appendChild(remove);
    container.appendChild(tag);
  }
}

function addTag(key: keyof OptionsState, inputId: string, containerId: string): void {
  const input = document.getElementById(inputId) as HTMLInputElement;
  const value = input.value.trim();
  if (!value || state[key].includes(value)) {
    input.value = '';
    return;
  }
  state[key].push(value);
  input.value = '';
  renderTags(key, containerId);
}

function setupTagInput(key: keyof OptionsState, inputId: string, containerId: string): void {
  const input = document.getElementById(inputId)!;
  const btn = input.nextElementSibling as HTMLElement;
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(key, inputId, containerId);
    }
  });
  btn.addEventListener('click', () => addTag(key, inputId, containerId));
}

// --- Helpers ---

function showStatus(id: string, message: string, duration = 1500): void {
  const el = document.getElementById(id)!;
  el.textContent = message;
  setTimeout(() => {
    el.textContent = '';
  }, duration);
}

function reloadHNTabs(): void {
  chrome.tabs.query({ url: 'https://news.ycombinator.com/*' }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id !== undefined) chrome.tabs.reload(tab.id);
    }
  });
}

// --- Save / Load ---

function saveDimming(): void {
  chrome.storage.sync.set(
    {
      ciKeywords: state.ci,
      csKeywords: state.cs,
      domains: state.domains,
    },
    () => {
      showStatus('status', 'Saved');
      reloadHNTabs();
    },
  );
}

function saveNewStories(): void {
  chrome.storage.sync.set(
    {
      showUnseen: (document.getElementById('show-unseen') as HTMLInputElement).checked,
    },
    () => {
      showStatus('new-stories-status', 'Saved');
      reloadHNTabs();
    },
  );
}

interface OptionsStorage {
  ciKeywords: string[];
  csKeywords: string[];
  domains: string[];
  showUnseen: boolean;
}

function restoreOptions(): void {
  chrome.storage.sync.get(
    { ciKeywords: [], csKeywords: [], domains: [], showUnseen: true },
    (data) => {
      // chrome.storage.sync.get returns { [key: string]: unknown }; we know the shape from defaults
      const items = data as unknown as OptionsStorage;
      (document.getElementById('show-unseen') as HTMLInputElement).checked = items.showUnseen;
      state.ci = items.ciKeywords;
      state.cs = items.csKeywords;
      state.domains = items.domains;
      renderTags('ci', 'ci-tags');
      renderTags('cs', 'cs-tags');
      renderTags('domains', 'domains-tags');
    },
  );
}

function resetTracking(): void {
  if (!confirm('Reset all tracking data? This cannot be undone.')) return;
  const dimmingStorageKeys = new Set(['dimmedEntries', 'undimmedEntries']);
  const keys = [
    ...allChunkKeys().filter((key) => !dimmingStorageKeys.has(key.replace(/_\d+$/, ''))),
    'recentlySeen',
    // Legacy keys
    'seenIds',
    'seenIds_0',
    'seenStories',
  ];
  chrome.storage.sync.remove(keys, () => {
    chrome.storage.local.remove(allLocalTrackingKeys(), () => {
      showStatus('reset-status', 'Reset complete');
      loadStorageStats();
      reloadHNTabs();
    });
  });
}

// --- Storage stats ---

function loadStorageStats(): void {
  chrome.storage.sync.get(null, (syncItems) => {
    chrome.storage.local.get(null, (localItems) => {
    const container = document.getElementById('storage-stats')!;
    container.innerHTML = '';

    const settingsKeys = ['showUnseen'];
    const syncKeys = Object.keys(syncItems).sort();
    const dimmingKeys = syncKeys.filter((k) =>
      /^(ciKeywords|csKeywords|domains|dimmedEntries(_\d+)?|undimmedEntries(_\d+)?)$/.test(k),
    );
    const syncActionKeys = syncKeys.filter((k) => !dimmingKeys.includes(k) && !settingsKeys.includes(k));
    const localKeys = Object.keys(localItems).sort();

    let syncTotalBytes = 0;
    let localTotalBytes = 0;

    function entryCount(val: unknown): number | null {
      if (Array.isArray(val)) return val.length;
      if (typeof val === 'object' && val !== null)
        return Object.values(val).reduce(
          (sum: number, v) => sum + (Array.isArray(v) ? v.length : 1),
          0,
        );
      return null;
    }

    function buildTable(
      heading: HTMLElement,
      items: Record<string, unknown>,
      keyList: string[],
      total: { bytes: number },
    ): void {
      if (keyList.length === 0) return;

      const table = document.createElement('table');
      table.className = 'stats-table';
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>Key</th><th>Entries</th><th>Bytes</th></tr>';
      const tbody = document.createElement('tbody');

      for (const key of keyList) {
        if (!(key in items)) continue;
        const bytes = JSON.stringify(items[key]).length;
        total.bytes += bytes;
        const count = entryCount(items[key]);
        const tr = document.createElement('tr');
        tr.innerHTML =
          `<td class="key">${key}</td>` +
          `<td class="val">${count !== null ? count.toLocaleString() : '-'}</td>` +
          `<td class="val">${bytes.toLocaleString()}</td>`;
        tbody.appendChild(tr);
      }

      table.appendChild(thead);
      table.appendChild(tbody);
      heading.appendChild(table);
    }

    function buildStorageGroup(
      title: string,
      subtitle: string,
      items: Record<string, unknown>,
      groups: Array<{ label: string; keys: string[] }>,
      quotaBytes?: number,
    ): void {
      const group = document.createElement('section');
      group.className = 'storage-group';

      const heading = document.createElement('h3');
      heading.textContent = title;
      group.appendChild(heading);

      const description = document.createElement('p');
      description.textContent = subtitle;
      group.appendChild(description);

      const total = { bytes: 0 };
      for (const { label, keys } of groups) {
        const presentKeys = keys.filter((key) => key in items);
        if (presentKeys.length === 0) continue;

        const subheading = document.createElement('h4');
        subheading.textContent = label;
        group.appendChild(subheading);
        buildTable(group, items, presentKeys, total);
      }

      const totalTable = document.createElement('table');
      totalTable.className = 'stats-table';
      const tfoot = document.createElement('tbody');
      const totalStr =
        quotaBytes === undefined
          ? total.bytes.toLocaleString()
          : `${total.bytes.toLocaleString()} / ${quotaBytes.toLocaleString()}`;
      tfoot.innerHTML =
        `<tr><td colspan="2"><strong>Total</strong></td>` +
        `<td class="val"><strong>${totalStr}</strong></td></tr>`;
      totalTable.appendChild(tfoot);
      totalTable.style.marginTop = '12px';
      group.appendChild(totalTable);
      container.appendChild(group);

      if (title === 'Sync storage') {
        syncTotalBytes = total.bytes;
      } else {
        localTotalBytes = total.bytes;
      }
    }

    buildStorageGroup(
      'Sync storage',
      'Synced settings and intentional user actions. Limit: 102,400 bytes total, 8,192 bytes per item.',
      syncItems,
      [
        { label: 'Dimming', keys: dimmingKeys },
        { label: 'Synced actions', keys: syncActionKeys },
      ],
      102400,
    );
    buildStorageGroup(
      'Local storage',
      'Device-local passive tracking and cached data.',
      localItems,
      [{ label: 'Local data', keys: localKeys }],
    );

    if (syncTotalBytes === 0 && localTotalBytes === 0) {
      container.textContent = 'No storage data found.';
    }
    });
  });
}

// --- Init ---

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  restoreOptions();
  setupTagInput('ci', 'ci-input', 'ci-tags');
  setupTagInput('cs', 'cs-input', 'cs-tags');
  setupTagInput('domains', 'domains-input', 'domains-tags');
  loadStorageStats();
});

document.getElementById('save')!.addEventListener('click', saveDimming);
document.getElementById('save-new-stories')!.addEventListener('click', saveNewStories);
document.getElementById('reset-tracking')!.addEventListener('click', resetTracking);

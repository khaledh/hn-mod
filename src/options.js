// Options page — tabbed interface

const state = {
  ci: [],      // case-insensitive keywords
  cs: [],      // case-sensitive keywords
  domains: [], // domains
};

// --- Tab switching ---

function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.panel}`).classList.add('active');
    });
  });
}

// --- Tag rendering ---

function renderTags(key, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  for (const value of state[key]) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = value;

    const remove = document.createElement('span');
    remove.className = 'remove';
    remove.textContent = '\u00d7';
    remove.onclick = () => {
      state[key] = state[key].filter(v => v !== value);
      renderTags(key, containerId);
    };

    tag.appendChild(remove);
    container.appendChild(tag);
  }
}

function addTag(key, inputId, containerId) {
  const input = document.getElementById(inputId);
  const value = input.value.trim();
  if (!value || state[key].includes(value)) {
    input.value = '';
    return;
  }
  state[key].push(value);
  input.value = '';
  renderTags(key, containerId);
}

function setupTagInput(key, inputId, containerId) {
  const input = document.getElementById(inputId);
  const btn = input.nextElementSibling;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(key, inputId, containerId); }
  });
  btn.addEventListener('click', () => addTag(key, inputId, containerId));
}

// --- Helpers ---

function showStatus(id, message, duration = 1500) {
  const el = document.getElementById(id);
  el.textContent = message;
  setTimeout(() => { el.textContent = ''; }, duration);
}

function reloadHNTabs() {
  chrome.tabs.query({ url: 'https://news.ycombinator.com/*' }, (tabs) => {
    tabs.forEach(tab => chrome.tabs.reload(tab.id));
  });
}

// --- Save / Load ---

function saveDimming() {
  chrome.storage.sync.set({
    ciKeywords: state.ci,
    csKeywords: state.cs,
    domains: state.domains,
  }, () => {
    showStatus('status', 'Saved');
    reloadHNTabs();
  });
}

function saveNewStories() {
  chrome.storage.sync.set({
    showUnseen: document.getElementById('show-unseen').checked,
  }, () => {
    showStatus('new-stories-status', 'Saved');
    reloadHNTabs();
  });
}

function restoreOptions() {
  chrome.storage.sync.get(
    { ciKeywords: [], csKeywords: [], domains: [], showUnseen: true },
    (items) => {
      document.getElementById('show-unseen').checked = items.showUnseen;
      state.ci = items.ciKeywords;
      state.cs = items.csKeywords;
      state.domains = items.domains;
      renderTags('ci', 'ci-tags');
      renderTags('cs', 'cs-tags');
      renderTags('domains', 'domains-tags');
    }
  );
}

function resetTracking() {
  if (!confirm('Reset all tracking data? This cannot be undone.')) return;
  chrome.storage.sync.remove(
    ['previousPageRanks', 'rankDiffChangedAt',
     'seenIds', 'seenIds_0', 'seenIds_1', 'seenIds_2',
     'recentlySeen', 'hiddenIds', 'seenStories'],
    () => {
      showStatus('reset-status', 'Reset complete');
      loadStorageStats();
      reloadHNTabs();
    }
  );
}

// --- Storage stats ---

function loadStorageStats() {
  chrome.storage.sync.get(null, (items) => {
    const container = document.getElementById('storage-stats');
    container.innerHTML = '';

    const dimmingKeys = ['ciKeywords', 'csKeywords', 'domains', 'dimmedEntries', 'undimmedEntries'];
    const settingsKeys = ['showUnseen'];
    const keys = Object.keys(items).sort();
    const trackingKeys = keys.filter(k => !dimmingKeys.includes(k) && !settingsKeys.includes(k));

    let totalBytes = 0;

    function entryCount(val) {
      if (Array.isArray(val)) return val.length;
      if (typeof val === 'object' && val !== null)
        return Object.values(val).reduce((sum, v) => sum + (Array.isArray(v) ? v.length : 1), 0);
      return null;
    }

    function buildTable(label, keyList) {
      const heading = document.createElement('h3');
      heading.textContent = label;
      heading.style.cssText = 'font-size: 10pt; color: #333; margin: 12px 0 4px;';
      container.appendChild(heading);

      const table = document.createElement('table');
      table.className = 'stats-table';
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>Key</th><th>Entries</th><th>Bytes</th></tr>';
      const tbody = document.createElement('tbody');

      for (const key of keyList) {
        if (!(key in items)) continue;
        const bytes = JSON.stringify(items[key]).length;
        totalBytes += bytes;
        const count = entryCount(items[key]);
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="key">${key}</td>`
          + `<td class="val">${count !== null ? count.toLocaleString() : '-'}</td>`
          + `<td class="val">${bytes.toLocaleString()}</td>`;
        tbody.appendChild(tr);
      }

      table.appendChild(thead);
      table.appendChild(tbody);
      container.appendChild(table);
    }

    buildTable('Dimming', dimmingKeys);
    buildTable('Tracking', trackingKeys);

    // Total
    const totalTable = document.createElement('table');
    totalTable.className = 'stats-table';
    const tfoot = document.createElement('tbody');
    tfoot.innerHTML = `<tr><td colspan="2"><strong>Total</strong></td><td class="val"><strong>${totalBytes.toLocaleString()} / 102,400</strong></td></tr>`;
    totalTable.appendChild(tfoot);
    totalTable.style.marginTop = '12px';
    container.appendChild(totalTable);
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

document.getElementById('save').addEventListener('click', saveDimming);
document.getElementById('save-new-stories').addEventListener('click', saveNewStories);
document.getElementById('reset-tracking').addEventListener('click', resetTracking);

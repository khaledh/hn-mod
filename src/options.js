const saveOptions = () => {
  const ciKeywords = document.getElementById('ci-keywords').value;
  const csKeywords = document.getElementById('cs-keywords').value;
  const domains = document.getElementById('domains').value;

  chrome.storage.sync.set({
      ciKeywords: JSON.parse(ciKeywords),
      csKeywords: JSON.parse(csKeywords),
      domains: JSON.parse(domains),
    },
    () => {
      // Update status to let user know options were saved.
      const status = document.getElementById('status');
      status.textContent = 'Options saved.';
      setTimeout(() => {
        status.textContent = '';
      }, 1000);

      // reload page
      chrome.tabs.query({"url": "https://news.ycombinator.com/*"}, function(tabs) {
        tabs.forEach(tab => { chrome.tabs.reload(tab.id) });
      })
    }
  );
};

const restoreOptions = () => {
  chrome.storage.sync.get(
    { ciKeywords: [], csKeywords: [], domains: [] },
    (items) => {
      document.getElementById('ci-keywords').value = JSON.stringify(items.ciKeywords);
      document.getElementById('cs-keywords').value = JSON.stringify(items.csKeywords);
      document.getElementById('domains').value = JSON.stringify(items.domains);
    }
  );
};

const resetTracking = () => {
  chrome.storage.sync.remove(
    ['previousPageRanks', 'rankDiffChangedAt', 'seenStories'],
    () => {
      const status = document.getElementById('reset-status');
      status.textContent = 'Tracking data reset.';
      setTimeout(() => { status.textContent = ''; }, 2000);

      chrome.tabs.query({"url": "https://news.ycombinator.com/*"}, function(tabs) {
        tabs.forEach(tab => { chrome.tabs.reload(tab.id) });
      });
    }
  );
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);
document.getElementById('reset-tracking').addEventListener('click', resetTracking);

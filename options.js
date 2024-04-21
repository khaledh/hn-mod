// Saves options to chrome.storage
const saveOptions = () => {
  const ci_keywords = document.getElementById('ci-keywords').value;
  console.log(ci_keywords);
  const cs_keywords = document.getElementById('cs-keywords').value;
  const ci_domains = document.getElementById('domains').value;

  chrome.storage.sync.set({
      ciKeywords: JSON.parse(ci_keywords),
      csKeywords: JSON.parse(cs_keywords),
      domains: JSON.parse(ci_domains)
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

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
const restoreOptions = () => {
  chrome.storage.sync.get(
    { ciKeywords: [], csKeywords: [], domains: [] },
    (items) => {
      console.log(items);
      CI_KEYWORDS = items.ciKeywords;
      CS_KEYWORDS = items.csKeywords;
      DOMAINS = items.domains;

      document.getElementById('ci-keywords').value = JSON.stringify(items.ciKeywords);
      document.getElementById('cs-keywords').value = JSON.stringify(items.csKeywords);
      document.getElementById('domains').value = JSON.stringify(items.domains);
    }
  );
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);

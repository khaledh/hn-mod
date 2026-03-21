// Only reload tabs on extension install/update
chrome.runtime.onInstalled.addListener(() => {
  chrome.management.getSelf().then((self) => {
    if (self.installType === 'development') {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
        if (tabs[0]?.id !== undefined) {
          chrome.tabs.reload(tabs[0].id);
        }
      });
    }
  });
});

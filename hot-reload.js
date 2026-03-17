// Only reload tabs on actual extension install/update, not on every service worker wake-up
chrome.runtime.onInstalled.addListener(() => {
    chrome.management.getSelf().then(self => {
        if (self.installType === 'development') {
            chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(tabs => {
                if (tabs[0]) {
                    chrome.tabs.reload(tabs[0].id);
                }
            });
        }
    });
});


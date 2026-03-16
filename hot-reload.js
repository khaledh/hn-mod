importScripts('background.js');

let lastReloadTime = Date.now();

const watchChanges = () => {
    chrome.runtime.reload();
}

chrome.management.getSelf().then(self => {
    if (self.installType === 'development') {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(tabs => {
            if (tabs[0]) {
                chrome.tabs.reload(tabs[0].id);
            }
        });
    }
});

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', () => {
    clients.claim();
});


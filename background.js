// ================================================
// Calendar Free Time Finder - Service Worker
// ================================================

// Handle extension install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Calendar Free Time Finder installed');
});

// Handle auth token refresh if needed
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'refreshToken') {
    chrome.identity.removeCachedAuthToken({ token: message.token }, () => {
      chrome.identity.getAuthToken({ interactive: true }, (newToken) => {
        sendResponse({ token: newToken, error: chrome.runtime.lastError?.message });
      });
    });
    return true; // async response
  }
});

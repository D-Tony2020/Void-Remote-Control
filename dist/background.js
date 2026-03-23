// ─── Background Service Worker ───
// Routes gesture messages from side panel to the active tab's content script.
// Opens side panel on extension icon click.

// Open side panel when clicking the extension icon
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Route messages from side panel to active tab
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'gesture-scroll' || msg.type === 'gesture-stop') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, msg).catch(() => {
          // Content script not loaded yet — ignore
        });
      }
    });
  }
});

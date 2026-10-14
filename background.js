/* Deploy background service worker (Manifest V3).
 *
 * Responsibilities:
 *  - Open the side panel when the toolbar action is clicked.
 *  - Proxy { type: 'fetchRepo' } messages to fetchRepo() (github.js).
 *
 * The standalone web page (localhost mode) calls fetchRepo() directly
 * and never touches this worker.
 */

importScripts('github.js');

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id, windowId: tab.windowId });
  } catch (e) {
    // Side panel may already be open, or the tab has no id — ignore.
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'fetchRepo') {
    fetchRepo(msg.owner, msg.repo)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: errMessage(err) }));
    return true; // keep the message channel open for the async response
  }
  return false;
});

function errMessage(err) {
  return (err && err.message) || String(err) || 'Unknown error';
}

/* Deploy environment adapters — one codebase, two homes.
 *
 *  - Inside the Chrome extension: uses chrome.storage + the background
 *    service worker exactly as before.
 *  - As a plain web page (localhost / file / any static host): the same
 *    UI runs with localStorage instead of chrome.storage, and calls the
 *    GitHub helpers directly instead of messaging a service worker.
 *
 * Load order: env.js BEFORE github.js, chat.js, runner.js, sidepanel.js,
 * options.js. background.js (service worker) does not need this file.
 */

const Env = (() => {
  const isExtension =
    typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;

  /* ---------- storage (async, chrome.storage.local-compatible) ---------- */
  let storage;
  if (isExtension) {
    storage = {
      get: (defaults) => chrome.storage.local.get(defaults),
      set: (obj) => chrome.storage.local.set(obj)
    };
  } else {
    const PREFIX = 'repobot:';
    const read = (key, fallback) => {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    };
    storage = {
      get: async (defaults) => {
        const out = Object.assign({}, defaults);
        for (const key of Object.keys(defaults || {})) {
          out[key] = read(key, defaults[key]);
        }
        return out;
      },
      set: async (obj) => {
        for (const key of Object.keys(obj || {})) {
          try {
            localStorage.setItem(PREFIX + key, JSON.stringify(obj[key]));
          } catch (e) {
            /* storage full or unavailable — non-fatal */
          }
        }
      }
    };
  }

  /* ---------- repo loading ---------- */
  // In the extension this goes through the service worker; on the web
  // fetchRepo() (github.js) is called directly. Same { ok, data|error } shape.
  async function loadRepo(owner, repo) {
    if (isExtension) {
      const res = await chrome.runtime.sendMessage({ type: 'fetchRepo', owner, repo });
      if (!res || !res.ok) throw new Error((res && res.error) || 'Failed to load repo.');
      return res.data;
    }
    return fetchRepo(owner, repo); // throws with friendly messages (github.js)
  }

  /* ---------- settings page ---------- */
  function openOptions() {
    if (isExtension) {
      chrome.runtime.openOptionsPage();
    } else {
      window.location.href = 'options.html';
    }
  }

  return { isExtension, storage, loadRepo, openOptions };
})();

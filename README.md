# Deploy — Chrome extension (v1 scaffold)

**Deploy** is an AI bot that lives in a Chrome side panel. Paste any GitHub repo URL and it loads the repo's file tree + README **inside the extension — zero downloads**. Then chat with an AI (OpenAI or Claude) about the code. Repo *execution* is stubbed in v1 (clean interface ready for Phase 2).

Working title: **Deploy**. Location of this scaffold: `~/workspace/deploy-bot/chrome-extension/`

## How to load it (unpacked)

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this `chrome-extension/` folder.
4. Click the Deploy toolbar icon to open the side panel (or pin it and use the side-panel icon).
5. Click the gear icon in the panel header, choose your AI provider, paste your API key, **Save**, then **Test connection**.

## Also runs as a web page (localhost / mobile)

The same UI works **without installing the extension** — open it like any
local web page. This is also how it runs on **mobile browsers** (Chrome on
Android doesn't support extensions, but a web page works fine).

```bash
cd ~/workspace/deploy-bot/chrome-extension
python3 -m http.server 8080
# then open:  http://localhost:8080/sidepanel.html
```

- On your **phone** (same Wi-Fi): open `http://<your-laptop-ip>:8080/sidepanel.html`
  in the mobile browser. Find the laptop IP with `hostname -I`.
- How it works: `env.js` detects the environment. As a web page it uses
  `localStorage` instead of `chrome.storage`, and calls the GitHub helpers
  (`github.js`) directly instead of going through the service worker. The
  settings page becomes `options.html` in the same folder. No build step,
  no server code needed — it's all static files.

## Features (v1)

- **Repo loader** — accepts `github.com/owner/repo` or `owner/repo`; fetches repo meta (stars, language, default branch), the **recursive file tree** via the GitHub REST API, and the README via the raw CDN. Nothing is downloaded to disk.
- **File browser** — collapsible folder tree; click any file to preview it as text (200 KB cap, binary-safe).
- **README tab** — rendered as plain text.
- **AI chat** — bottom-docked chat box. Repo context (file list + README excerpt) is prepended as system context on every request.
  - Providers: **OpenAI** (chat completions) and **Claude** (Anthropic messages API) — same `askAI()` interface.
  - API key stored only in `chrome.storage.local`; never logged.
- **Run repo button** — calls the stable `runRepo()` interface. In v1 it detects the project type (Node.js / Python / Go / Rust / unknown) and reports that execution wiring is Phase 2.
- **Settings page** — provider select, API key (password field), model override, Save + Test connection (tiny live ping).

## What's stubbed

- **`runner.js` → `runRepo()` is a STUB.** It detects project type from the file tree and returns `{ status: 'not_wired', detected, logs[] }`. No code executes, nothing is fetched beyond the tree/README.

## Next steps (Phase 2 / 3)

1. **Sandbox server** (`~/workspace/deploy-bot/sandbox-server/`): Node/Express API — `POST /api/run { repoUrl }` with token auth → shallow clone → runtime detect (`package.json` / `requirements.txt` / `go.mod` / `Cargo.toml`) → `docker run` with safety limits (`--rm`, `--network none`, `-m 512m`, `--cpus 1`, timeout, non-root) → logs back.
2. **Wire `runner.js`** to `POST {sandboxUrl}/api/run` keeping the exact same `{ status, detected, logs[] }` return shape — the side panel needs zero changes.
3. **Settings**: add Sandbox URL + token fields (stored in `chrome.storage.local` next to the AI settings).
4. Later platforms: VS Code extension, Claude MCP server, OpenAI Custom GPT — all reusing this core.

## Notes

- Manifest V3, vanilla JS/CSS/HTML only — **no build step, no remote scripts** (MV3 CSP forbids remote code).
- `host_permissions` cover `api.github.com`, `raw.githubusercontent.com`, `api.openai.com`, `api.anthropic.com` (the AI hosts are required for chat to work).
- Anonymous GitHub API use is rate-limited to 60 requests/hour; the UI shows a friendly message when the limit is hit.

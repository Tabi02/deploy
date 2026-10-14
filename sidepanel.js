/* Deploy side panel logic (classic script; chat.js and runner.js load first).
 *
 * Flow:
 *  1. User pastes a GitHub repo URL -> "Load".
 *  2. background.js fetches meta + recursive tree + README (zero downloads).
 *  3. File tree renders (collapsible folders, click a file to preview it).
 *  4. README renders as plain text.
 *  5. "Run repo" calls the runner interface (runner.js — v1 is a stub).
 *  6. Chat box calls askAI() (chat.js) with the repo file list + README as context.
 *
 * All repo/user content is injected via textContent — never innerHTML.
 */

const $ = (id) => document.getElementById(id);

/* Inline SVG icons (no emoji — keeps the UI feeling designed, not "coded"). */
const ICON_FOLDER = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#9a86ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
const ICON_FILE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
const escHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let currentRepo = null; // { owner, repo, branch, tree, meta, readme }
const chatHistory = []; // { role: 'user'|'assistant'|'system', content }

document.addEventListener('DOMContentLoaded', init);

function init() {
  $('loadBtn').addEventListener('click', onLoadRepo);
  $('repoUrl').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onLoadRepo();
  });
  $('tabFiles').addEventListener('click', () => switchTab('files'));
  $('tabReadme').addEventListener('click', () => switchTab('readme'));
  $('settingsBtn').addEventListener('click', () => Env.openOptions());
  $('fileViewClose').addEventListener('click', () => $('fileView').classList.add('hidden'));
  $('runBtn').addEventListener('click', () => onRunRepo({ preview: false }));
  $('previewRunBtn').addEventListener('click', () => onRunRepo({ preview: true }));
  $('sendBtn').addEventListener('click', onSendChat);
  $('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onSendChat();
  });

  addSystemMsg('Load a repo, then ask anything about its code.');

  // Restore the last loaded repo.
  Env.storage
    .get({ lastRepo: '' })
    .then(({ lastRepo }) => {
      if (lastRepo) {
        $('repoUrl').value = lastRepo;
        onLoadRepo();
      }
    })
    .catch(() => {});
}

/* ---------------- repo loading ---------------- */

/** Accept "github.com/owner/repo", "https://github.com/owner/repo", or "owner/repo". */
function parseRepoUrl(input) {
  const s = String(input || '')
    .trim()
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
  let m = s.match(/github\.com\/([^/\s]+)\/([^/\s]+)/i);
  if (!m) m = s.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

async function onLoadRepo() {
  const parsed = parseRepoUrl($('repoUrl').value);
  if (!parsed) {
    setStatus('Please enter a valid GitHub repo URL or "owner/repo".', true);
    return;
  }
  setStatus('Loading repo…', false);
  $('loadBtn').disabled = true;
  try {
    // Extension: via the background service worker. Web page: direct call.
    // Both return the same { meta, tree, treeTruncated, readme } shape.
    const data = await Env.loadRepo(parsed.owner, parsed.repo);
    currentRepo = {
      owner: parsed.owner,
      repo: parsed.repo,
      branch: data.meta.defaultBranch,
      tree: data.tree,
      meta: data.meta,
      readme: data.readme
    };
    renderRepo(data);
    chatHistory.length = 0;
    addSystemMsg(`Loaded ${data.meta.fullName}. Ask me anything about this repo.`);
    Env.storage.set({ lastRepo: `${parsed.owner}/${parsed.repo}` }).catch(() => {});
    const blobs = data.tree.filter((e) => e.type === 'blob').length;
    setStatus(`Loaded ${data.meta.fullName} — ${blobs} files.`, false);
  } catch (err) {
    setStatus((err && err.message) || 'Failed to load repo.', true);
  } finally {
    $('loadBtn').disabled = false;
  }
}

function renderRepo(data) {
  const m = data.meta;
  const metaEl = $('repoMeta');
  metaEl.classList.remove('hidden');
  metaEl.textContent =
    `${m.fullName} · ★ ${m.stars != null ? m.stars : 0} · ${m.language || '—'} · branch ${m.defaultBranch}` +
    (data.treeTruncated ? ' · tree truncated' : '');

  renderTree(data.tree);
  $('fileView').classList.add('hidden');
  $('readmeContent').textContent = data.readme || 'No README found in this repo.';
  $('runBtn').disabled = false;
  $('previewRunBtn').disabled = false;
  $('runOutput').classList.add('hidden');
  $('runOutput').textContent = '';
  $('previewBtn').classList.add('hidden');
  $('previewBtn').onclick = null;
}

/* ---------------- file tree ---------------- */

function renderTree(tree) {
  const root = {};
  for (const e of tree) {
    if (!e || e.type !== 'blob' || !e.path) continue;
    const parts = e.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = { __dir: true, __children: {} };
      node = node[parts[i]].__children;
    }
    node[parts[parts.length - 1]] = { __file: true, path: e.path };
  }
  const el = $('fileTree');
  el.textContent = '';
  const names = Object.keys(root);
  if (!names.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'This repo has no files.';
    el.appendChild(p);
    return;
  }
  el.appendChild(buildTreeUl(root, 0));
}

function buildTreeUl(node, depth) {
  const ul = document.createElement('ul');
  ul.className = 'treelist';
  const names = Object.keys(node).sort((a, b) => {
    const da = !!node[a].__dir;
    const db = !!node[b].__dir;
    if (da !== db) return da ? -1 : 1;
    return a.localeCompare(b);
  });
  for (const name of names) {
    const li = document.createElement('li');
    const entry = node[name];
    if (entry.__dir) {
      const details = document.createElement('details');
      if (depth === 0) details.open = true;
      const summary = document.createElement('summary');
      summary.innerHTML = ICON_FOLDER + '<span>' + escHtml(name) + '</span>';
      details.appendChild(summary);
      details.appendChild(buildTreeUl(entry.__children, depth + 1));
      li.appendChild(details);
    } else {
      const btn = document.createElement('button');
      btn.className = 'filelink';
      btn.innerHTML = ICON_FILE + '<span>' + escHtml(name) + '</span>';
      btn.title = entry.path;
      btn.addEventListener('click', () => onOpenFile(entry.path));
      li.appendChild(btn);
    }
    ul.appendChild(li);
  }
  return ul;
}

/** Preview a single file via the raw CDN (text only, 200 KB cap). */
async function onOpenFile(path) {
  if (!currentRepo) return;
  $('fileView').classList.remove('hidden');
  $('fileViewName').textContent = path;
  $('fileViewContent').textContent = 'Loading…';
  const url =
    `https://raw.githubusercontent.com/${encodeURIComponent(currentRepo.owner)}` +
    `/${encodeURIComponent(currentRepo.repo)}/${encodeURIComponent(currentRepo.branch)}/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed');
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 200 * 1024) {
      $('fileViewContent').textContent = 'File too large to preview (over 200 KB).';
      return;
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    $('fileViewContent').textContent = text.slice(0, 50000) || '(empty file)';
  } catch (err) {
    $('fileViewContent').textContent = 'Could not preview this file (it may be binary).';
  }
}

/* ---------------- run repo (sandbox-wired) ---------------- */

async function onRunRepo({ preview = false } = {}) {
  if (!currentRepo) return;
  const out = $('runOutput');
  const btn = preview ? $('previewRunBtn') : $('runBtn');
  out.classList.remove('hidden');
  out.textContent = preview ? 'Starting app + opening tunnel…' : 'Preparing…';
  $('runBtn').disabled = true;
  $('previewRunBtn').disabled = true;
  btn.classList.add('busy');
  $('previewBtn').classList.add('hidden');
  $('previewBtn').onclick = null;
  try {
    const result = await runRepo({
      owner: currentRepo.owner,
      repo: currentRepo.repo,
      branch: currentRepo.branch,
      tree: currentRepo.tree,
      preview
    });
    out.textContent = (result.logs || []).join('\n');
    // Preview URL available -> show the "open in new tab" button.
    // window.open here is inside the original click gesture, so no popup block.
    if (result.previewUrl) {
      const url = result.previewUrl;
      const pbtn = $('previewBtn');
      pbtn.classList.remove('hidden');
      pbtn.onclick = () => window.open(url, '_blank', 'noopener');
    }
  } catch (err) {
    out.textContent = 'Runner error: ' + ((err && err.message) || err);
  } finally {
    $('runBtn').disabled = false;
    $('previewRunBtn').disabled = false;
    btn.classList.remove('busy');
  }
}

/* ---------------- chat ---------------- */

function buildRepoContext() {
  if (!currentRepo) return null;
  const fileList = currentRepo.tree
    .filter((e) => e.type === 'blob')
    .map((e) => e.path)
    .slice(0, 500);
  return {
    fullName: currentRepo.meta.fullName,
    description: currentRepo.meta.description,
    language: currentRepo.meta.language,
    fileList,
    readmeExcerpt: (currentRepo.readme || '').slice(0, 4000)
  };
}

function addSystemMsg(content) {
  chatHistory.push({ role: 'system', content });
  renderChat();
}

function renderChat() {
  const box = $('chatMessages');
  box.textContent = '';
  for (const m of chatHistory) {
    const d = document.createElement('div');
    d.className = 'msg ' + m.role;
    d.textContent = m.content;
    box.appendChild(d);
  }
  box.scrollTop = box.scrollHeight;
}

async function onSendChat() {
  const input = $('chatInput');
  const text = input.value.trim();
  if (!text || $('sendBtn').disabled) return;
  input.value = '';
  chatHistory.push({ role: 'user', content: text });
  renderChat();

  if (!currentRepo) {
    chatHistory.push({ role: 'assistant', content: 'Load a GitHub repo first, then ask me about it.' });
    renderChat();
    return;
  }

  const pending = { role: 'assistant', content: 'Thinking…' };
  chatHistory.push(pending);
  renderChat();
  $('sendBtn').disabled = true;
  try {
    const apiMessages = chatHistory.filter((m) => m.role === 'user' || m.role === 'assistant');
    pending.content = await askAI(apiMessages, buildRepoContext());
  } catch (err) {
    pending.content = 'Error: ' + ((err && err.message) || 'AI request failed.');
  } finally {
    renderChat();
    $('sendBtn').disabled = false;
  }
}

/* ---------------- small UI helpers ---------------- */

function switchTab(which) {
  const files = which === 'files';
  $('tabFiles').classList.toggle('active', files);
  $('tabReadme').classList.toggle('active', !files);
  $('panelFiles').classList.toggle('active', files);
  $('panelReadme').classList.toggle('active', !files);
}

function setStatus(msg, isError) {
  const el = $('statusLine');
  el.textContent = msg || '';
  el.className = 'status' + (isError ? ' error' : '');
}

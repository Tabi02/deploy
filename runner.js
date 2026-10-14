/* Deploy repo-execution — wired to the sandbox server (Phase 3).
 * ============================================================================
 * STABLE INTERFACE — the side panel only depends on this contract:
 *
 *   runRepo({ owner, repo, branch, tree, preview? }) -> Promise<{
 *     status:     'ok' | 'error' | 'not_wired',
 *     detected:   { kind, label },
 *     logs:       string[],          // shown verbatim in the terminal panel
 *     previewUrl: string | null     // set when the sandbox exposed the app
 *   }>
 *
 * Config lives in Env.storage (settings page): sandboxUrl, sandboxToken,
 * previewPort. When preview=true the request includes exposePort so the
 * sandbox starts the app detached and returns a public tunnel URL.
 * ============================================================================
 */

async function runRepo({ owner, repo, branch, tree, preview = false }) {
  const paths = Array.isArray(tree) ? tree.map((e) => e.path) : [];
  const detected = detectProjectType(paths);

  const cfg = await Env.storage.get({ sandboxUrl: '', sandboxToken: '', previewPort: '3000' });
  const base = String(cfg.sandboxUrl || '').trim().replace(/\/+$/, '');

  if (!base) {
    return {
      status: 'not_wired',
      detected,
      previewUrl: null,
      logs: [
        `Repo: ${owner}/${repo} @ ${branch}`,
        `Detected: ${detected.label}`,
        '',
        'Sandbox server connected nahi hai.',
        'Settings me Sandbox URL + Token dalo:',
        '1. Upar gear icon dabao -> Settings kholo',
        '2. Sandbox URL aur Sandbox Token paste karke Save dabao'
      ]
    };
  }

  const body = { repoUrl: `https://github.com/${owner}/${repo}` };
  if (preview) {
    const port = parseInt(cfg.previewPort, 10);
    body.exposePort = Number.isFinite(port) && port > 0 && port < 65536 ? port : 3000;
  }

  let res;
  try {
    res = await fetch(base + '/api/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (cfg.sandboxToken || '')
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000)
    });
  } catch (err) {
    return {
      status: 'error',
      detected,
      previewUrl: null,
      logs: [
        'Sandbox server se connect nahi ho paya: ' + base,
        'Check karo: (1) server chal raha hai? (2) URL sahi hai? (3) token Settings me dala?',
        'Error: ' + ((err && err.message) || err)
      ]
    };
  }

  if (res.status === 401) {
    return {
      status: 'error',
      detected,
      previewUrl: null,
      logs: ['Sandbox token galat hai.', 'Settings me Sandbox Token dobara check karke Save dabao.']
    };
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* fall through to the generic error below */
  }
  if (!data || typeof data !== 'object') {
    return {
      status: 'error',
      detected,
      previewUrl: null,
      logs: [`Sandbox ne ajeeb jawab diya (HTTP ${res.status}). Server logs check karo.`]
    };
  }

  const logs = [];
  if (data.detected && data.detected.runtime) {
    logs.push('Detected: ' + data.detected.runtime);
  } else {
    logs.push('Detected: ' + detected.label);
  }
  // The sandbox may return logs under different keys across versions.
  for (const key of ['buildLogs', 'runLogs', 'logs']) {
    const v = data[key];
    if (Array.isArray(v)) logs.push(...v.map(String));
    else if (typeof v === 'string' && v) logs.push(v);
  }
  if (data.error && data.status !== 'ok') logs.push('Error: ' + data.error);
  if (data.message) logs.push(data.message);
  if (data.note) logs.push('Note: ' + data.note);

  return {
    status: data.status === 'ok' ? 'ok' : 'error',
    detected,
    logs,
    previewUrl: typeof data.previewUrl === 'string' && data.previewUrl ? data.previewUrl : null
  };
}

/** Heuristic project-type detection from file paths (no network, no execution). */
function detectProjectType(paths) {
  const has = (name) => paths.some((p) => p === name || p.endsWith('/' + name));
  if (has('package.json')) return { kind: 'node', label: 'Node.js (package.json found)' };
  if (has('requirements.txt') || has('pyproject.toml') || has('setup.py')) {
    return { kind: 'python', label: 'Python (requirements.txt / pyproject.toml / setup.py found)' };
  }
  if (has('go.mod')) return { kind: 'go', label: 'Go (go.mod found)' };
  if (has('Cargo.toml')) return { kind: 'rust', label: 'Rust (Cargo.toml found)' };
  return { kind: 'unknown', label: 'Unknown (no package.json, requirements.txt, go.mod or Cargo.toml)' };
}

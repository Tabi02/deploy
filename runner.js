/* Deploy repo-execution interface (loaded by sidepanel.html as a classic script).
 * ============================================================================
 * STABLE INTERFACE — the side panel only depends on this contract:
 *
 *   runRepo({ owner, repo, branch, tree }) -> Promise<{
 *     status:   'ok' | 'error' | 'not_wired',   // execution outcome
 *     detected: { kind: 'node'|'python'|'go'|'rust'|'unknown', label: string },
 *     logs:     string[]                          // human-readable log lines, shown verbatim
 *   }>
 *
 * V1 STATUS: STUB. No code is executed, nothing is downloaded, nothing leaves
 * the extension. It only detects the project type from the file tree and
 * reports that execution wiring is a later phase.
 *
 * PHASE 2/3 PLAN (decided): wire this to the backend sandbox server
 * (~/workspace/repo-runner-bot/sandbox-server/):
 *   POST {sandboxUrl}/api/run  with  { repoUrl, token }  (token auth)
 *   -> { status: 'ok'|'error', logs: [] }
 * The real implementation must keep the exact same signature and return shape
 * so the UI (sidepanel.js) needs zero changes. Sandbox URL + token will live
 * in Env.storage (settings page) alongside the AI provider settings.
 * ============================================================================
 */

async function runRepo({ owner, repo, branch, tree }) {
  const paths = Array.isArray(tree) ? tree.map((e) => e.path) : [];
  const detected = detectProjectType(paths);

  return {
    status: 'not_wired',
    detected,
    logs: [
      `Repo: ${owner}/${repo} @ ${branch}`,
      `Detected project type: ${detected.label}`,
      '',
      'Repo execution is not wired up yet.',
      'Phase 2 will connect this button to the sandbox server:',
      'shallow clone -> runtime detect -> docker run (sandboxed) -> logs back here.',
      'No code was executed and nothing was downloaded.'
    ]
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

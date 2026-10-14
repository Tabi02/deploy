/* Deploy GitHub helpers — shared by the extension service worker
 * (via importScripts) and by the standalone web page (via <script>).
 * Pure functions: no chrome.* dependency, works on any page.
 *
 * fetchRepo(owner, repo) -> { meta, tree, treeTruncated, readme }
 *   meta: { fullName, description, defaultBranch, language, stars, url }
 *   tree: [{ path, type: 'blob'|'tree', size }]
 *   readme: string | null
 * Throws Errors with user-friendly messages.
 */

async function fetchRepo(owner, repo) {
  owner = String(owner || '').trim();
  repo = String(repo || '').trim().replace(/\.git$/, '');
  if (!owner || !repo) {
    throw new Error('Please enter a repo as "owner/name".');
  }

  const meta = await ghJson(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  );
  const branch = meta.default_branch || 'main';

  const treeRes = await ghJson(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`
  );
  const tree = Array.isArray(treeRes.tree) ? treeRes.tree : [];

  const readme = await fetchReadme(owner, repo, branch);

  return {
    meta: {
      fullName: meta.full_name,
      description: meta.description,
      defaultBranch: branch,
      language: meta.language,
      stars: meta.stargazers_count,
      url: meta.html_url
    },
    tree,
    treeTruncated: !!treeRes.truncated,
    readme
  };
}

/** GET JSON from the GitHub API with friendly error mapping. */
async function ghJson(url) {
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  } catch (e) {
    throw new Error('Could not reach GitHub. Check your internet connection and try again.');
  }
  if (res.status === 404) {
    throw new Error('Repository not found. Check the owner/name — private repos are not supported.');
  }
  if (res.status === 403) {
    if (res.headers.get('x-ratelimit-remaining') === '0') {
      throw new Error(
        'GitHub API rate limit exceeded (60 requests/hour for anonymous use). ' +
        'Please wait a few minutes and try again.'
      );
    }
    throw new Error('GitHub refused the request (HTTP 403).');
  }
  if (!res.ok) {
    throw new Error(`GitHub request failed (HTTP ${res.status}). Please try again.`);
  }
  return res.json();
}

/** Best-effort README fetch. Returns string | null. */
async function fetchReadme(owner, repo, branch) {
  const enc = encodeURIComponent;
  // 1. GitHub's dedicated README endpoint — handles any filename casing
  //    (README.md, Readme.md, README.rst, ...).
  try {
    const data = await ghJson(
      `https://api.github.com/repos/${enc(owner)}/${enc(repo)}/readme`
    );
    if (data && data.content) {
      const bin = atob(String(data.content).replace(/\s/g, ''));
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes);
    }
  } catch (e) {
    // fall through to raw CDN guesses
  }
  // 2. Raw CDN guesses (common casings).
  for (const name of ['README.md', 'readme.md', 'Readme.md']) {
    try {
      const res = await fetch(
        `https://raw.githubusercontent.com/${enc(owner)}/${enc(repo)}/${enc(branch)}/${name}`
      );
      if (res.ok) return await res.text();
    } catch (e) {
      // try the next candidate name
    }
  }
  return null;
}

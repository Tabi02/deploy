/* Deploy chat provider layer (loaded by sidepanel.html as a classic script).
 *
 * Single entry point:  askAI(messages, repoContext) -> Promise<string>
 *
 *  - messages:    [{ role: 'user'|'assistant', content }] (system-role entries are stripped)
 *  - repoContext: { fullName, description, language, fileList[], readmeExcerpt }
 *                 (may be null — chat still works, just without repo context)
 *
 * Reads { provider, apiKey, model } from Env.storage (chrome.storage or localStorage).
 * Supports OpenAI chat completions and the Anthropic messages API through
 * the same interface. The API key is never logged.
 */

async function askAI(messages, repoContext) {
  const cfg = await Env.storage.get({ provider: 'openai', apiKey: '', model: '' });
  const provider = String(cfg.provider || 'openai').toLowerCase();
  const apiKey = String(cfg.apiKey || '').trim();
  let model = String(cfg.model || '').trim();
  if (!model) model = provider === 'claude' ? 'claude-sonnet-4-5' : 'gpt-4o-mini';

  if (!apiKey) {
    throw new Error('No API key saved. Click the gear icon above and add your API key in settings.');
  }

  const clean = (messages || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
    .map((m) => ({ role: m.role, content: String(m.content) }));
  if (!clean.length) throw new Error('Nothing to send.');

  const system = buildSystemPrompt(repoContext);
  if (provider === 'claude') return askClaude({ apiKey, model, system, messages: clean });
  return askOpenAI({ apiKey, model, system, messages: clean });
}

/** Repo context is prepended as system context: file list (truncated) + README excerpt. */
function buildSystemPrompt(ctx) {
  if (!ctx) return 'You are Deploy, a helpful coding assistant inside a Chrome extension.';
  const files = (ctx.fileList || []).join('\n');
  const readme = ctx.readmeExcerpt || '(no README found)';
  return [
    'You are Deploy, an AI assistant inside a Chrome extension.',
    `The user has loaded the GitHub repo "${ctx.fullName}".`,
    ctx.description ? `Repo description: ${ctx.description}` : '',
    ctx.language ? `Primary language: ${ctx.language}` : '',
    '',
    'README (excerpt):',
    readme,
    '',
    'File list (may be truncated):',
    files || '(empty)',
    '',
    'Answer questions about this repo: explain code, point to relevant files, summarize structure. Be concise.'
  ]
    .filter(Boolean)
    .join('\n');
}

/* ---------------- providers ---------------- */

async function askOpenAI({ apiKey, model, system, messages }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...messages],
      temperature: 0.3
    })
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error('OpenAI error: ' + apiError(data, res.status));
  const text =
    data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error('OpenAI returned an empty response.');
  return text.trim();
}

async function askClaude({ apiKey, model, system, messages }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model, max_tokens: 1024, system, messages })
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error('Claude error: ' + apiError(data, res.status));
  const blocks = data && data.content;
  const text = Array.isArray(blocks)
    ? blocks
        .filter((b) => b && b.type === 'text')
        .map((b) => b.text)
        .join('\n')
    : '';
  if (!text) throw new Error('Claude returned an empty response.');
  return text.trim();
}

/* ---------------- helpers ---------------- */

async function safeJson(res) {
  try {
    return await res.json();
  } catch (e) {
    return null;
  }
}

function apiError(data, status) {
  if (data && data.error) {
    if (typeof data.error === 'string') return data.error;
    if (data.error.message) return data.error.message;
  }
  return 'HTTP ' + status;
}

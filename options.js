/* Deploy settings page logic (classic script, no inline handlers). */

const DEFAULT_MODELS = { openai: 'gpt-4o-mini', claude: 'claude-sonnet-4-5' };

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const cfg = await Env.storage.get({ provider: 'openai', apiKey: '', model: '' });
  $('provider').value = cfg.provider || 'openai';
  $('apiKey').value = cfg.apiKey || '';
  $('model').value = cfg.model || '';
  updateModelPlaceholder();

  $('provider').addEventListener('change', updateModelPlaceholder);
  $('saveBtn').addEventListener('click', onSave);
  $('testBtn').addEventListener('click', onTest);
}

function $(id) {
  return document.getElementById(id);
}

function updateModelPlaceholder() {
  const p = $('provider').value;
  $('model').placeholder = 'e.g. ' + (DEFAULT_MODELS[p] || DEFAULT_MODELS.openai);
}

function currentConfig() {
  const provider = $('provider').value;
  return {
    provider,
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim() || DEFAULT_MODELS[provider] || DEFAULT_MODELS.openai
  };
}

async function onSave() {
  const { provider, apiKey, model } = currentConfig();
  // Store the raw model text (may be empty = use default); keep exactly what the user typed.
  await Env.storage.set({ provider, apiKey, model: $('model').value.trim() });
  setStatus('Settings saved.', false);
}

/** Tiny live ping: OpenAI -> list models, Claude -> minimal 1-token message call. */
async function onTest() {
  const { provider, apiKey, model } = currentConfig();
  if (!apiKey) {
    setStatus('Enter an API key first.', true);
    return;
  }
  setStatus('Testing connection…', false);
  $('testBtn').disabled = true;
  try {
    if (provider === 'claude') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error('Claude: ' + ((data && data.error && data.error.message) || 'HTTP ' + res.status));
      }
    } else {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: 'Bearer ' + apiKey }
      });
      if (!res.ok) throw new Error('OpenAI: HTTP ' + res.status + ' — check your API key.');
    }
    setStatus('Connection OK.', false);
  } catch (err) {
    setStatus((err && err.message) || 'Connection failed.', true);
  } finally {
    $('testBtn').disabled = false;
  }
}

function setStatus(msg, isError) {
  const el = $('status');
  el.textContent = msg || '';
  el.className = 'status' + (isError ? ' error' : msg ? ' ok' : '');
}

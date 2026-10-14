/* Deploy settings page logic (classic script, no inline handlers). */

const DEFAULT_MODELS = { openai: 'gpt-4o-mini', claude: 'claude-sonnet-4-5' };

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const cfg = await Env.storage.get({
    provider: 'openai', apiKey: '', model: '',
    sandboxUrl: '', sandboxToken: '', previewPort: '3000'
  });
  $('provider').value = cfg.provider || 'openai';
  $('apiKey').value = cfg.apiKey || '';
  $('model').value = cfg.model || '';
  $('sandboxUrl').value = cfg.sandboxUrl || '';
  $('sandboxToken').value = cfg.sandboxToken || '';
  $('previewPort').value = cfg.previewPort || '3000';
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
  await Env.storage.set({
    provider,
    apiKey,
    model: $('model').value.trim(),
    sandboxUrl: $('sandboxUrl').value.trim().replace(/\/+$/, ''),
    sandboxToken: $('sandboxToken').value.trim(),
    previewPort: $('previewPort').value.trim() || '3000'
  });
  setStatus('Settings saved.', false);
}

/** Tiny live ping: AI provider + optional sandbox health check. */
async function onTest() {
  const { provider, apiKey, model } = currentConfig();
  const sandboxUrl = $('sandboxUrl').value.trim().replace(/\/+$/, '');
  const results = [];
  $('testBtn').disabled = true;
  try {
    if (apiKey) {
      setStatus('Testing AI connection…', false);
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
      results.push('AI: OK');
    } else {
      results.push('AI: skipped (no key)');
    }

    if (sandboxUrl) {
      setStatus('Testing sandbox…', false);
      const res = await fetch(sandboxUrl + '/api/health', { signal: AbortSignal.timeout(15000) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) throw new Error('Sandbox: bad response from /api/health.');
      results.push(`Sandbox: OK (docker ${data.docker ? 'available' : 'NOT available — runs will fail until Docker works'})`);
    } else {
      results.push('Sandbox: skipped (no URL)');
    }

    setStatus(results.join(' · '), false);
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

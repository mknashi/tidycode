/**
 * Model Catalog
 *
 * Providers retire models often, so hardcoded lists go stale. This module:
 *  - fetches each provider's live model list once a key is configured
 *    (the built-in lists in AIService.js are only a fallback), and
 *  - moves saved settings off model IDs that earlier versions shipped and
 *    the providers have since retired.
 */

import { ANTHROPIC_API_URL, anthropicHeaders } from './anthropic.js';

/** Settings key holding each provider's selected model */
export const MODEL_SETTING_KEYS = {
  groq: 'groqModel',
  openai: 'openaiModel',
  claude: 'claudeModel',
  gemini: 'geminiModel',
  mistral: 'mistralModel',
  cerebras: 'cerebrasModel',
  sambanova: 'sambanovaModel',
};

/**
 * Retired IDs that earlier versions offered, mapped to the closest current
 * model of the same tier. Only these are migrated automatically, so a model
 * the user picked from a live list is never overwritten.
 */
export const RETIRED_MODEL_REPLACEMENTS = {
  claude: {
    'claude-3-haiku-20240307': 'claude-haiku-5-5',
    'claude-3-5-haiku-20241022': 'claude-haiku-5-5',
    'claude-haiku-4-5-20251001': 'claude-haiku-5-5',
    'claude-3-sonnet-20240229': 'claude-sonnet-5-5',
    'claude-3-5-sonnet-20241022': 'claude-sonnet-5-5',
    'claude-4-sonnet': 'claude-sonnet-5-5',
    'claude-sonnet-4-6': 'claude-sonnet-5-5',
    'claude-3-opus-20240229': 'claude-opus-5-5',
    'claude-4-opus': 'claude-opus-5-5',
    'claude-opus-4-6': 'claude-opus-5-5',
  },
  openai: {
    'gpt-3.5-turbo': 'gpt-5.4-mini',
    'gpt-4': 'gpt-5.5',
    'gpt-4-32k': 'gpt-5.5',
    'gpt-4-turbo': 'gpt-5.5',
    'gpt-4-turbo-preview': 'gpt-5.5',
    'gpt-4o': 'gpt-5.5',
    'gpt-4o-2024-11-20': 'gpt-5.5',
    'gpt-4o-mini': 'gpt-5.4-mini',
    'gpt-5': 'gpt-5.5',
    'gpt-5-mini': 'gpt-5.4-mini',
    'o1-preview': 'gpt-5.5',
    'o1-mini': 'gpt-5.4-mini',
    'o3-mini': 'gpt-5.4-mini',
    'o4-mini': 'gpt-5.4-mini',
    'codex-mini-latest': 'gpt-5.4-mini',
    'codex-mini-2025-01-24': 'gpt-5.4-mini',
  },
  groq: {
    'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
    'llama-3.1-70b-versatile': 'openai/gpt-oss-120b',
    'llama-3.1-8b-instant': 'openai/gpt-oss-20b',
    'llama-3.2-90b-vision-preview': 'openai/gpt-oss-120b',
    'llama-3.2-11b-vision-preview': 'openai/gpt-oss-20b',
    'llama-3.2-3b-preview': 'openai/gpt-oss-20b',
    'llama-3.2-1b-preview': 'openai/gpt-oss-20b',
    'mixtral-8x7b-32768': 'openai/gpt-oss-20b',
    'gemma2-9b-it': 'openai/gpt-oss-20b',
    'deepseek-r1-distill-llama-70b': 'openai/gpt-oss-120b',
  },
  gemini: {
    'gemini-1.0-pro': 'gemini-flash-latest',
    'gemini-1.5-pro': 'gemini-flash-latest',
    'gemini-1.5-pro-latest': 'gemini-flash-latest',
    'gemini-1.5-flash': 'gemini-flash-latest',
    'gemini-1.5-flash-8b': 'gemini-flash-lite-latest',
    'gemini-2.0-flash': 'gemini-flash-latest',
    'gemini-2.0-flash-thinking': 'gemini-flash-latest',
    'gemini-2.0-pro': 'gemini-flash-latest',
  },
  mistral: {
    'mistral-large-2411': 'mistral-large-latest',
    'codestral-mamba-latest': 'codestral-latest',
    'mistral-nemo': 'mistral-small-latest',
    'open-mistral-nemo': 'mistral-small-latest',
    'open-mixtral-8x22b': 'mistral-large-latest',
    'open-mixtral-8x7b': 'mistral-small-latest',
    'pixtral-12b-2409': 'mistral-small-latest',
  },
  cerebras: {
    'llama-3.3-70b': 'gpt-oss-120b',
    'llama3.1-8b': 'gpt-oss-120b',
  },
  sambanova: {
    'Meta-Llama-3.1-405B-Instruct': 'Meta-Llama-3.3-70B-Instruct',
    'Meta-Llama-3.1-8B-Instruct': 'Meta-Llama-3.3-70B-Instruct',
  },
};

/**
 * Replace retired model IDs in saved AI settings.
 * @param {Object} settings - AI settings as loaded from storage
 * @returns {{ settings: Object, migrated: Array<{provider: string, from: string, to: string}> }}
 */
export function migrateRetiredModels(settings) {
  if (!settings) return { settings, migrated: [] };

  const next = { ...settings };
  const migrated = [];
  for (const [provider, key] of Object.entries(MODEL_SETTING_KEYS)) {
    const replacement = RETIRED_MODEL_REPLACEMENTS[provider]?.[next[key]];
    if (replacement) {
      migrated.push({ provider, from: next[key], to: replacement });
      next[key] = replacement;
    }
  }
  return { settings: next, migrated };
}

/** Base URLs of providers that expose an OpenAI-compatible GET /models */
const OPENAI_COMPATIBLE_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  sambanova: 'https://api.sambanova.ai/v1',
};

// OpenAI's list includes embeddings, audio and image models; keep chat models only
const NON_CHAT_MODEL_PATTERN = /embed|whisper|tts|audio|transcribe|dall-e|image|moderation|realtime|search|davinci|babbage|guard/i;

async function fetchJSON(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Model list request failed: ${response.status}`);
  }
  return response.json();
}

async function fetchAnthropicModels(apiKey) {
  const data = await fetchJSON(`${ANTHROPIC_API_URL}/models?limit=100`, anthropicHeaders(apiKey));
  return (data.data || []).map(m => ({ id: m.id, name: m.display_name || m.id }));
}

async function fetchGeminiModels(apiKey) {
  const data = await fetchJSON(
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`,
    {}
  );
  return (data.models || [])
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name }));
}

async function fetchOpenAICompatibleModels(baseUrl, apiKey) {
  const data = await fetchJSON(`${baseUrl}/models`, { Authorization: `Bearer ${apiKey}` });
  return (data.data || [])
    .filter(m => m.active !== false && !NON_CHAT_MODEL_PATTERN.test(m.id))
    .map(m => ({ id: m.id, name: m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

const liveModelCache = new Map();

/**
 * Fetch the models a provider currently serves for this key.
 * Results are cached per provider and key for the session.
 * @param {string} provider - Provider ID (claude, openai, gemini, groq, mistral, cerebras, sambanova)
 * @param {string} apiKey - Provider API key
 * @returns {Promise<Array<{id: string, name: string}>>} Empty when the list can't be fetched
 */
export async function fetchProviderModels(provider, apiKey) {
  if (!apiKey) return [];

  const cacheKey = `${provider}:${apiKey}`;
  if (liveModelCache.has(cacheKey)) return liveModelCache.get(cacheKey);

  let models = [];
  try {
    if (provider === 'claude') {
      models = await fetchAnthropicModels(apiKey);
    } else if (provider === 'gemini') {
      models = await fetchGeminiModels(apiKey);
    } else if (OPENAI_COMPATIBLE_BASE_URLS[provider]) {
      models = await fetchOpenAICompatibleModels(OPENAI_COMPATIBLE_BASE_URLS[provider], apiKey);
    }
  } catch (error) {
    // Some providers block browser requests to their model list; fall back to the built-in list
    console.warn(`[modelCatalog] Could not fetch ${provider} models:`, error.message);
    return [];
  }

  liveModelCache.set(cacheKey, models);
  return models;
}

/**
 * Merge a built-in model list with a live one. Built-in entries keep their
 * descriptions and order; live-only models are appended. The selected model
 * is always included so a select element can display it.
 * @param {Array<{id: string, name: string, description?: string}>} builtIn
 * @param {Array<{id: string, name: string}>} live
 * @param {string} [selectedId]
 */
export function mergeModelLists(builtIn, live, selectedId) {
  const merged = [...builtIn];
  const seen = new Set(builtIn.map(m => m.id));
  for (const model of live) {
    if (!seen.has(model.id)) {
      merged.push(model);
      seen.add(model.id);
    }
  }
  if (selectedId && !seen.has(selectedId)) {
    merged.push({ id: selectedId, name: selectedId });
  }
  return merged;
}

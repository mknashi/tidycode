/**
 * Model Catalog and Anthropic Request Tests
 *
 * Covers retired-model migration, merging live model lists, and the shape of
 * Claude requests (browser header, no temperature, text extraction).
 */

import { TestSuite, assert } from './testUtils.js';
import { migrateRetiredModels, mergeModelLists, fetchProviderModels } from '../modelCatalog.js';
import { anthropicHeaders, claudeMaxTokens, claudeEffort, extractClaudeText } from '../anthropic.js';
import { ClaudeProvider } from '../providers/ClaudeProvider.js';

/**
 * Replace global fetch, recording each request and answering with `body`
 */
function captureFetch(body, ok = true) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: url.toString(), options });
    return {
      ok,
      status: ok ? 200 : 500,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

/**
 * migrateRetiredModels Tests
 */
export const migrationTests = new TestSuite('migrateRetiredModels');

migrationTests.test('should replace retired model IDs with current ones', () => {
  const { settings, migrated } = migrateRetiredModels({
    provider: 'claude',
    claudeModel: 'claude-3-5-haiku-20241022',
    openaiModel: 'gpt-4o-mini',
    groqModel: 'llama-3.3-70b-versatile',
    geminiModel: 'gemini-2.0-flash',
  });

  assert.equal(settings.claudeModel, 'claude-haiku-5-5');
  assert.equal(settings.openaiModel, 'gpt-5.4-mini');
  assert.equal(settings.groqModel, 'openai/gpt-oss-120b');
  assert.equal(settings.geminiModel, 'gemini-flash-latest');
  assert.lengthOf(migrated, 4);
});

migrationTests.test('should leave current and user-picked models alone', () => {
  const input = {
    claudeModel: 'claude-sonnet-5-5',
    openaiModel: 'some-model-from-the-live-list',
  };
  const { settings, migrated } = migrateRetiredModels(input);

  assert.deepEqual(settings, input);
  assert.lengthOf(migrated, 0);
});

migrationTests.test('should handle missing settings', () => {
  const { settings, migrated } = migrateRetiredModels(null);
  assert.equal(settings, null);
  assert.lengthOf(migrated, 0);
});

/**
 * mergeModelLists Tests
 */
export const mergeTests = new TestSuite('mergeModelLists');

mergeTests.test('should keep built-in models first and append live-only ones', () => {
  const builtIn = [{ id: 'a', name: 'A', description: 'built in' }];
  const live = [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }];

  const merged = mergeModelLists(builtIn, live);

  assert.deepEqual(merged.map(m => m.id), ['a', 'b']);
  assert.equal(merged[0].description, 'built in');
});

mergeTests.test('should always include the selected model', () => {
  const merged = mergeModelLists([{ id: 'a', name: 'A' }], [], 'custom');
  assert.deepEqual(merged.map(m => m.id), ['a', 'custom']);
});

/**
 * fetchProviderModels Tests
 */
export const liveModelTests = new TestSuite('fetchProviderModels');

liveModelTests.test('should list Claude models with the browser header', async () => {
  const mock = captureFetch({ data: [{ id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' }] });
  try {
    const models = await fetchProviderModels('claude', 'sk-ant-test-list');
    assert.deepEqual(models, [{ id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' }]);
    assert.ok(mock.calls[0].url.includes('/v1/models'));
    assert.equal(mock.calls[0].options.headers['anthropic-dangerous-direct-browser-access'], 'true');
  } finally {
    mock.restore();
  }
});

liveModelTests.test('should drop non-chat models from OpenAI-compatible lists', async () => {
  const mock = captureFetch({ data: [{ id: 'gpt-5.5' }, { id: 'text-embedding-3-small' }, { id: 'whisper-1' }] });
  try {
    const models = await fetchProviderModels('openai', 'sk-test-filter');
    assert.deepEqual(models.map(m => m.id), ['gpt-5.5']);
  } finally {
    mock.restore();
  }
});

liveModelTests.test('should return an empty list when the request fails', async () => {
  const mock = captureFetch({}, false);
  try {
    const models = await fetchProviderModels('groq', 'gsk_test_failure');
    assert.lengthOf(models, 0);
  } finally {
    mock.restore();
  }
});

/**
 * Anthropic request helper Tests
 */
export const anthropicTests = new TestSuite('anthropic helpers');

anthropicTests.test('should send the direct browser access header', () => {
  const headers = anthropicHeaders('sk-ant-key');
  assert.equal(headers['x-api-key'], 'sk-ant-key');
  assert.equal(headers['anthropic-dangerous-direct-browser-access'], 'true');
});

anthropicTests.test('should leave room for thinking in max_tokens', () => {
  assert.equal(claudeMaxTokens(2048), 16000);
  assert.equal(claudeMaxTokens(32000), 32000);
});

anthropicTests.test('should only set effort on models that support it', () => {
  assert.deepEqual(claudeEffort('claude-haiku-5-5', 'low'), { output_config: { effort: 'low' } });
  assert.deepEqual(claudeEffort('claude-haiku-4-5', 'low'), {});
});

anthropicTests.test('should skip thinking blocks when extracting text', () => {
  const text = extractClaudeText({
    content: [
      { type: 'thinking', thinking: '' },
      { type: 'text', text: 'Hello' },
      { type: 'text', text: ' world' },
    ],
  });
  assert.equal(text, 'Hello world');
});

/**
 * ClaudeProvider request shape Tests
 */
export const claudeRequestTests = new TestSuite('ClaudeProvider requests');

claudeRequestTests.test('should not send temperature and should read text after thinking', async () => {
  const mock = captureFetch({
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'done' }],
    stop_reason: 'end_turn',
    model: 'claude-sonnet-5-5',
  });
  try {
    const provider = new ClaudeProvider({ apiKey: 'sk-ant-test' });
    const result = await provider.chat([{ role: 'user', content: 'Hi' }], { temperature: 0.7 });

    const body = JSON.parse(mock.calls[0].options.body);
    assert.ok(!('temperature' in body), 'temperature should not be sent');
    assert.equal(body.max_tokens, 16000);
    assert.equal(result.text, 'done');
  } finally {
    mock.restore();
  }
});

claudeRequestTests.test('should validate the key by listing models', async () => {
  const mock = captureFetch({ data: [] });
  try {
    const provider = new ClaudeProvider({ apiKey: 'sk-ant-test' });
    const result = await provider.validateConfig();

    assert.ok(result.valid);
    assert.ok(mock.calls[0].url.endsWith('/models?limit=1'));
  } finally {
    mock.restore();
  }
});

export const allSuites = [
  migrationTests,
  mergeTests,
  liveModelTests,
  anthropicTests,
  claudeRequestTests,
];

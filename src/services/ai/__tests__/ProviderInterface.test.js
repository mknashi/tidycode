/**
 * ProviderInterface Unit Tests
 */

import { TestSuite, assert } from './testUtils.js';
import {
  AIProvider,
  CompletionResult,
  ChatMessage,
  ModelInfo,
  ProviderConfig,
  AI_CAPABILITIES,
} from '../ProviderInterface.js';

/**
 * Test AI_CAPABILITIES constants
 */
export const capabilitiesTests = new TestSuite('AI_CAPABILITIES');

capabilitiesTests.test('should have all expected capability constants', () => {
  assert.hasProperty(AI_CAPABILITIES, 'COMPLETION');
  assert.hasProperty(AI_CAPABILITIES, 'CHAT');
  assert.hasProperty(AI_CAPABILITIES, 'STREAM');
  assert.hasProperty(AI_CAPABILITIES, 'EXPLAIN');
  assert.hasProperty(AI_CAPABILITIES, 'REFACTOR');
  assert.hasProperty(AI_CAPABILITIES, 'CONVERT');
  assert.hasProperty(AI_CAPABILITIES, 'INFER_SCHEMA');
  assert.hasProperty(AI_CAPABILITIES, 'SUMMARIZE_LOGS');
  assert.hasProperty(AI_CAPABILITIES, 'GENERATE_TESTS');
  assert.hasProperty(AI_CAPABILITIES, 'FIX_SYNTAX');
  assert.hasProperty(AI_CAPABILITIES, 'TRANSFORM_TEXT');
  assert.hasProperty(AI_CAPABILITIES, 'VISION');
  assert.hasProperty(AI_CAPABILITIES, 'CODE_EXECUTION');
});

capabilitiesTests.test('capability values should be strings', () => {
  Object.values(AI_CAPABILITIES).forEach(cap => {
    assert.equal(typeof cap, 'string', `Capability ${cap} should be a string`);
  });
});

/**
 * Test CompletionResult class
 */
export const completionResultTests = new TestSuite('CompletionResult');

completionResultTests.test('should create with required text field', () => {
  const result = new CompletionResult({ text: 'Hello world' });
  assert.equal(result.text, 'Hello world');
});

completionResultTests.test('should have default values for optional fields', () => {
  const result = new CompletionResult({ text: 'test' });
  assert.equal(result.confidence, null);
  assert.deepEqual(result.metadata, {});
  assert.equal(result.usage, null);
});

completionResultTests.test('should accept all fields', () => {
  const result = new CompletionResult({
    text: 'generated code',
    confidence: 0.95,
    metadata: { model: 'test-model' },
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
  });

  assert.equal(result.text, 'generated code');
  assert.equal(result.confidence, 0.95);
  assert.equal(result.metadata.model, 'test-model');
  assert.equal(result.usage.totalTokens, 30);
});

/**
 * Test ChatMessage class
 */
export const chatMessageTests = new TestSuite('ChatMessage');

chatMessageTests.test('should create message with role and content', () => {
  const msg = new ChatMessage('user', 'Hello');
  assert.equal(msg.role, 'user');
  assert.equal(msg.content, 'Hello');
});

chatMessageTests.test('should have static factory methods', () => {
  const system = ChatMessage.system('You are helpful');
  assert.equal(system.role, 'system');
  assert.equal(system.content, 'You are helpful');

  const user = ChatMessage.user('Hi');
  assert.equal(user.role, 'user');

  const assistant = ChatMessage.assistant('Hello!');
  assert.equal(assistant.role, 'assistant');
});

/**
 * Test ModelInfo class
 */
export const modelInfoTests = new TestSuite('ModelInfo');

modelInfoTests.test('should create with required fields', () => {
  const model = new ModelInfo({ id: 'test-model', name: 'Test Model' });
  assert.equal(model.id, 'test-model');
  assert.equal(model.name, 'Test Model');
});

modelInfoTests.test('should have default values', () => {
  const model = new ModelInfo({ id: 'test', name: 'Test' });
  assert.equal(model.contextWindow, 4096);
  assert.equal(model.description, '');
  assert.equal(model.isDefault, false);
  assert.equal(model.supportsVision, false);
  assert.equal(model.supportsStreaming, true);
  assert.equal(model.status, 'stable');
});

modelInfoTests.test('should accept all fields', () => {
  const model = new ModelInfo({
    id: 'gpt-4',
    name: 'GPT-4',
    contextWindow: 128000,
    description: 'Most capable',
    isDefault: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: '2024-01-01',
    status: 'preview',
  });

  assert.equal(model.contextWindow, 128000);
  assert.equal(model.isDefault, true);
  assert.equal(model.supportsVision, true);
  assert.equal(model.status, 'preview');
});

/**
 * Test ProviderConfig class
 */
export const providerConfigTests = new TestSuite('ProviderConfig');

providerConfigTests.test('should create with required fields', () => {
  const config = new ProviderConfig({ name: 'Test', id: 'test' });
  assert.equal(config.name, 'Test');
  assert.equal(config.id, 'test');
});

providerConfigTests.test('should convert model objects to ModelInfo instances', () => {
  const config = new ProviderConfig({
    name: 'Test',
    id: 'test',
    models: [{ id: 'model-1', name: 'Model 1' }],
  });

  assert.lengthOf(config.models, 1);
  assert.instanceOf(config.models[0], ModelInfo);
});

providerConfigTests.test('should have default values', () => {
  const config = new ProviderConfig({ name: 'Test', id: 'test' });
  assert.isArray(config.models);
  assert.isArray(config.capabilities);
  assert.equal(config.requiresApiKey, true);
});

/**
 * Test AIProvider base class
 */
export const aiProviderTests = new TestSuite('AIProvider');

aiProviderTests.test('should create instance with config', () => {
  const provider = new AIProvider({
    name: 'Test Provider',
    id: 'test',
    models: [{ id: 'model-1', name: 'Model 1' }],
    capabilities: ['completion', 'chat'],
  });

  assert.equal(provider.name, 'Test Provider');
  assert.equal(provider.id, 'test');
  assert.lengthOf(provider.models, 1);
  assert.lengthOf(provider.capabilities, 2);
});

aiProviderTests.test('should initialize with options', async () => {
  const provider = new AIProvider({ name: 'Test', id: 'test' });
  await provider.initialize({ apiKey: 'test-key', model: 'model-1' });

  assert.equal(provider.apiKey, 'test-key');
  assert.equal(provider.selectedModel, 'model-1');
  assert.ok(provider._initialized);
});

aiProviderTests.test('hasCapability should return correct value', () => {
  const provider = new AIProvider({
    name: 'Test',
    id: 'test',
    capabilities: ['completion', 'chat'],
  });

  assert.ok(provider.hasCapability('completion'));
  assert.ok(provider.hasCapability('chat'));
  assert.ok(!provider.hasCapability('vision'));
});

aiProviderTests.test('getDefaultModel should return first default or first model', () => {
  const provider1 = new AIProvider({
    name: 'Test',
    id: 'test',
    models: [
      { id: 'model-1', name: 'Model 1' },
      { id: 'model-2', name: 'Model 2', isDefault: true },
    ],
  });

  const defaultModel = provider1.getDefaultModel();
  assert.equal(defaultModel.id, 'model-2');

  const provider2 = new AIProvider({
    name: 'Test',
    id: 'test',
    models: [{ id: 'model-1', name: 'Model 1' }],
  });

  const firstModel = provider2.getDefaultModel();
  assert.equal(firstModel.id, 'model-1');
});

aiProviderTests.test('isReady should check initialization and API key', async () => {
  const provider = new AIProvider({
    name: 'Test',
    id: 'test',
    requiresApiKey: true,
  });

  assert.ok(!provider.isReady()); // Not initialized

  await provider.initialize({});
  assert.ok(!provider.isReady()); // No API key

  await provider.initialize({ apiKey: 'test-key' });
  assert.ok(provider.isReady()); // Now ready
});

aiProviderTests.test('validateApiKeyFormat should validate key prefix', () => {
  const provider = new AIProvider({
    name: 'Test',
    id: 'test',
    apiKeyPrefix: 'sk-',
  });

  assert.ok(provider.validateApiKeyFormat('sk-abc123456789012345678'));
  assert.ok(!provider.validateApiKeyFormat('invalid-key'));
  assert.ok(!provider.validateApiKeyFormat(''));
  assert.ok(!provider.validateApiKeyFormat(null));
});

aiProviderTests.test('extractContent should remove markdown code blocks', () => {
  const provider = new AIProvider({ name: 'Test', id: 'test' });

  const input = '```json\n{"key": "value"}\n```';
  const result = provider.extractContent(input, 'json');
  assert.equal(result, '{"key": "value"}');
});

aiProviderTests.test('extractContent should extract JSON objects', () => {
  const provider = new AIProvider({ name: 'Test', id: 'test' });

  const input = 'Here is the JSON: {"name": "test", "value": 123} end';
  const result = provider.extractContent(input, 'json');
  assert.equal(result, '{"name": "test", "value": 123}');
});

aiProviderTests.test('extractContent should extract XML content', () => {
  const provider = new AIProvider({ name: 'Test', id: 'test' });

  const input = 'XML output: <root><item>test</item></root> done';
  const result = provider.extractContent(input, 'xml');
  assert.equal(result, '<root><item>test</item></root>');
});

aiProviderTests.test('buildSystemPrompt should include language', () => {
  const provider = new AIProvider({ name: 'Test', id: 'test' });

  const prompt = provider.buildSystemPrompt('completion', { language: 'javascript' });
  assert.ok(prompt.includes('javascript'));
  assert.ok(prompt.includes('code'));
});

aiProviderTests.test('abstract methods should throw', async () => {
  const provider = new AIProvider({ name: 'Test', id: 'test' });

  await assert.rejects(provider.validateConfig());
  await assert.rejects(provider.complete({}));
  await assert.rejects(provider.streamComplete({}, () => {}));
  await assert.rejects(provider.chat([]));
  await assert.rejects(provider.streamChat([], () => {}));
});

// Export all test suites
export const allSuites = [
  capabilitiesTests,
  completionResultTests,
  chatMessageTests,
  modelInfoTests,
  providerConfigTests,
  aiProviderTests,
];

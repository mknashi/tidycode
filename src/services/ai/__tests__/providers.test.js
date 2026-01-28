/**
 * Individual Provider Unit Tests
 *
 * Tests each provider's configuration, model definitions, and API key validation.
 * Note: Actual API calls are tested in integration tests.
 */

import { TestSuite, assert, createMockFetch } from './testUtils.js';
import { AI_CAPABILITIES, ModelInfo } from '../ProviderInterface.js';
import { ClaudeProvider } from '../providers/ClaudeProvider.js';
import { OpenAIProvider } from '../providers/OpenAIProvider.js';
import { GeminiProvider } from '../providers/GeminiProvider.js';
import { GroqProvider } from '../providers/GroqProvider.js';
import { MistralProvider } from '../providers/MistralProvider.js';
import { OllamaProvider } from '../providers/OllamaProvider.js';

/**
 * ClaudeProvider Tests
 */
export const claudeProviderTests = new TestSuite('ClaudeProvider');

claudeProviderTests.test('should create with correct configuration', () => {
  const provider = new ClaudeProvider();

  assert.equal(provider.name, 'Claude');
  assert.equal(provider.id, 'claude');
  assert.equal(provider.baseUrl, 'https://api.anthropic.com/v1');
  assert.ok(provider.requiresApiKey);
});

claudeProviderTests.test('should have Claude models defined', () => {
  const provider = new ClaudeProvider();

  assert.ok(provider.models.length > 0, 'Should have models');

  // Check for expected models
  const modelIds = provider.models.map(m => m.id);
  assert.ok(modelIds.some(id => id.includes('claude-3-5-sonnet')), 'Should have Claude 3.5 Sonnet');
  assert.ok(modelIds.some(id => id.includes('claude-3-5-haiku')), 'Should have Claude 3.5 Haiku');
});

claudeProviderTests.test('should have expected capabilities', () => {
  const provider = new ClaudeProvider();

  assert.ok(provider.hasCapability(AI_CAPABILITIES.COMPLETION));
  assert.ok(provider.hasCapability(AI_CAPABILITIES.CHAT));
  assert.ok(provider.hasCapability(AI_CAPABILITIES.STREAM));
  assert.ok(provider.hasCapability(AI_CAPABILITIES.VISION));
  assert.ok(provider.hasCapability(AI_CAPABILITIES.EXPLAIN));
  assert.ok(provider.hasCapability(AI_CAPABILITIES.REFACTOR));
});

claudeProviderTests.test('should validate API key format correctly', () => {
  const provider = new ClaudeProvider();

  assert.ok(provider.validateApiKeyFormat('sk-ant-api123456789012345678'));
  assert.ok(!provider.validateApiKeyFormat('sk-123'));
  assert.ok(!provider.validateApiKeyFormat('invalid-key'));
});

claudeProviderTests.test('should accept API key in constructor', () => {
  const provider = new ClaudeProvider({ apiKey: 'sk-ant-test-key' });
  assert.equal(provider.apiKey, 'sk-ant-test-key');
});

claudeProviderTests.test('should generate correct request headers', () => {
  const provider = new ClaudeProvider({ apiKey: 'sk-ant-test' });
  const headers = provider.getRequestHeaders();

  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers['x-api-key'], 'sk-ant-test');
  assert.ok(headers['anthropic-version']);
});

/**
 * OpenAIProvider Tests
 */
export const openaiProviderTests = new TestSuite('OpenAIProvider');

openaiProviderTests.test('should create with correct configuration', () => {
  const provider = new OpenAIProvider();

  assert.equal(provider.name, 'OpenAI');
  assert.equal(provider.id, 'openai');
  assert.equal(provider.baseUrl, 'https://api.openai.com/v1');
  assert.ok(provider.requiresApiKey);
});

openaiProviderTests.test('should have GPT models including GPT-5 placeholder', () => {
  const provider = new OpenAIProvider();

  const modelIds = provider.models.map(m => m.id);
  assert.ok(modelIds.includes('gpt-4o'), 'Should have GPT-4o');
  assert.ok(modelIds.includes('gpt-4o-mini'), 'Should have GPT-4o-mini');
  assert.ok(modelIds.includes('gpt-5'), 'Should have GPT-5 placeholder');
});

openaiProviderTests.test('should have expected capabilities', () => {
  const provider = new OpenAIProvider();

  assert.ok(provider.hasCapability(AI_CAPABILITIES.COMPLETION));
  assert.ok(provider.hasCapability(AI_CAPABILITIES.CHAT));
  assert.ok(provider.hasCapability(AI_CAPABILITIES.STREAM));
  assert.ok(provider.hasCapability(AI_CAPABILITIES.VISION));
});

openaiProviderTests.test('should validate API key format correctly', () => {
  const provider = new OpenAIProvider();

  assert.ok(provider.validateApiKeyFormat('sk-proj-abc123456789012345678'));
  assert.ok(provider.validateApiKeyFormat('sk-abc123456789012345678901'));
  assert.ok(!provider.validateApiKeyFormat('invalid'));
});

openaiProviderTests.test('should generate correct request headers', () => {
  const provider = new OpenAIProvider({ apiKey: 'sk-test' });
  const headers = provider.getRequestHeaders();

  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers['Authorization'], 'Bearer sk-test');
});

openaiProviderTests.test('should include organization header if set', () => {
  const provider = new OpenAIProvider({
    apiKey: 'sk-test',
    organizationId: 'org-123',
  });
  const headers = provider.getRequestHeaders();

  assert.equal(headers['OpenAI-Organization'], 'org-123');
});

/**
 * GeminiProvider Tests
 */
export const geminiProviderTests = new TestSuite('GeminiProvider');

geminiProviderTests.test('should create with correct configuration', () => {
  const provider = new GeminiProvider();

  assert.equal(provider.name, 'Gemini');
  assert.equal(provider.id, 'gemini');
  assert.ok(provider.baseUrl.includes('generativelanguage.googleapis.com'));
  assert.ok(provider.requiresApiKey);
});

geminiProviderTests.test('should have Gemini 2.0 models', () => {
  const provider = new GeminiProvider();

  const modelIds = provider.models.map(m => m.id);
  assert.ok(modelIds.includes('gemini-2.0-flash'), 'Should have Gemini 2.0 Flash');
  assert.ok(modelIds.some(id => id.includes('gemini-1.5')), 'Should have Gemini 1.5 models');
});

geminiProviderTests.test('should support code execution capability', () => {
  const provider = new GeminiProvider();
  assert.ok(provider.hasCapability(AI_CAPABILITIES.CODE_EXECUTION));
});

geminiProviderTests.test('should have very large context windows', () => {
  const provider = new GeminiProvider();

  const flashModel = provider.models.find(m => m.id === 'gemini-2.0-flash');
  assert.ok(flashModel);
  assert.greaterThan(flashModel.contextWindow, 100000);
});

geminiProviderTests.test('should build correct API URL', () => {
  const provider = new GeminiProvider({ apiKey: 'test-key' });
  const url = provider.buildUrl('gemini-2.0-flash', 'generateContent');

  assert.ok(url.includes('gemini-2.0-flash'));
  assert.ok(url.includes('generateContent'));
  assert.ok(url.includes('key=test-key'));
});

/**
 * GroqProvider Tests
 */
export const groqProviderTests = new TestSuite('GroqProvider');

groqProviderTests.test('should create with correct configuration', () => {
  const provider = new GroqProvider();

  assert.equal(provider.name, 'Groq');
  assert.equal(provider.id, 'groq');
  assert.equal(provider.baseUrl, 'https://api.groq.com/openai/v1');
  assert.ok(provider.requiresApiKey);
});

groqProviderTests.test('should have Llama and Mixtral models', () => {
  const provider = new GroqProvider();

  const modelIds = provider.models.map(m => m.id);
  assert.ok(modelIds.some(id => id.includes('llama')), 'Should have Llama models');
  assert.ok(modelIds.some(id => id.includes('mixtral')), 'Should have Mixtral models');
});

groqProviderTests.test('should validate Groq API key format', () => {
  const provider = new GroqProvider();

  assert.ok(provider.validateApiKeyFormat('gsk_abc123456789012345678'));
  assert.ok(!provider.validateApiKeyFormat('sk-invalid'));
});

groqProviderTests.test('should use OpenAI-compatible headers', () => {
  const provider = new GroqProvider({ apiKey: 'gsk_test' });
  const headers = provider.getRequestHeaders();

  assert.equal(headers['Authorization'], 'Bearer gsk_test');
});

/**
 * MistralProvider Tests
 */
export const mistralProviderTests = new TestSuite('MistralProvider');

mistralProviderTests.test('should create with correct configuration', () => {
  const provider = new MistralProvider();

  assert.equal(provider.name, 'Mistral');
  assert.equal(provider.id, 'mistral');
  assert.equal(provider.baseUrl, 'https://api.mistral.ai/v1');
  assert.ok(provider.requiresApiKey);
});

mistralProviderTests.test('should have Codestral models', () => {
  const provider = new MistralProvider();

  const modelIds = provider.models.map(m => m.id);
  assert.ok(modelIds.some(id => id.includes('codestral')), 'Should have Codestral models');
  assert.ok(modelIds.some(id => id.includes('mistral-large')), 'Should have Mistral Large');
});

mistralProviderTests.test('should have Pixtral vision models', () => {
  const provider = new MistralProvider();

  const visionModels = provider.models.filter(m => m.supportsVision);
  assert.ok(visionModels.length > 0, 'Should have vision models');
  assert.ok(visionModels.some(m => m.id.includes('pixtral')));
});

/**
 * OllamaProvider Tests
 */
export const ollamaProviderTests = new TestSuite('OllamaProvider');

ollamaProviderTests.test('should create with correct configuration', () => {
  const provider = new OllamaProvider();

  assert.equal(provider.name, 'Ollama');
  assert.equal(provider.id, 'ollama');
  assert.equal(provider.baseUrl, 'http://localhost:11434');
  assert.ok(!provider.requiresApiKey); // Ollama doesn't need API key
});

ollamaProviderTests.test('should allow custom base URL', () => {
  const provider = new OllamaProvider({ baseUrl: 'http://192.168.1.100:11434' });
  assert.equal(provider.baseUrl, 'http://192.168.1.100:11434');
});

ollamaProviderTests.test('should have common local models defined', () => {
  const provider = new OllamaProvider();

  const modelIds = provider.models.map(m => m.id);
  assert.ok(modelIds.some(id => id.includes('llama')), 'Should have Llama models');
  assert.ok(modelIds.some(id => id.includes('qwen')), 'Should have Qwen models');
  assert.ok(modelIds.some(id => id.includes('codellama')), 'Should have CodeLlama');
});

ollamaProviderTests.test('should have vision models', () => {
  const provider = new OllamaProvider();

  const visionModels = provider.models.filter(m => m.supportsVision);
  assert.ok(visionModels.length > 0, 'Should have vision models');
  assert.ok(visionModels.some(m => m.id.includes('llava')));
});

ollamaProviderTests.test('should be ready without API key', async () => {
  const provider = new OllamaProvider();
  await provider.initialize({});
  // Note: isReady() might still fail if Ollama isn't running
  // This just tests that API key isn't required
  assert.ok(!provider.requiresApiKey);
});

/**
 * Cross-Provider Tests
 */
export const crossProviderTests = new TestSuite('Cross-Provider Compatibility');

crossProviderTests.test('all providers should extend AIProvider', () => {
  const providers = [
    new ClaudeProvider(),
    new OpenAIProvider(),
    new GeminiProvider(),
    new GroqProvider(),
    new MistralProvider(),
    new OllamaProvider(),
  ];

  providers.forEach(provider => {
    assert.isFunction(provider.complete);
    assert.isFunction(provider.streamComplete);
    assert.isFunction(provider.chat);
    assert.isFunction(provider.streamChat);
    assert.isFunction(provider.validateConfig);
  });
});

crossProviderTests.test('all providers should have models with ModelInfo instances', () => {
  const providers = [
    new ClaudeProvider(),
    new OpenAIProvider(),
    new GeminiProvider(),
    new GroqProvider(),
    new MistralProvider(),
    new OllamaProvider(),
  ];

  providers.forEach(provider => {
    assert.ok(provider.models.length > 0, `${provider.name} should have models`);
    provider.models.forEach(model => {
      assert.instanceOf(model, ModelInfo, `${provider.name} models should be ModelInfo`);
      assert.ok(model.id, `${provider.name} model should have id`);
      assert.ok(model.name, `${provider.name} model should have name`);
    });
  });
});

crossProviderTests.test('all providers should have a default model', () => {
  const providers = [
    new ClaudeProvider(),
    new OpenAIProvider(),
    new GeminiProvider(),
    new GroqProvider(),
    new MistralProvider(),
    new OllamaProvider(),
  ];

  providers.forEach(provider => {
    const defaultModel = provider.getDefaultModel();
    assert.ok(defaultModel, `${provider.name} should have a default model`);
  });
});

crossProviderTests.test('all providers should support basic capabilities', () => {
  const providers = [
    new ClaudeProvider(),
    new OpenAIProvider(),
    new GeminiProvider(),
    new GroqProvider(),
    new MistralProvider(),
    new OllamaProvider(),
  ];

  const basicCapabilities = [
    AI_CAPABILITIES.COMPLETION,
    AI_CAPABILITIES.CHAT,
    AI_CAPABILITIES.STREAM,
  ];

  providers.forEach(provider => {
    basicCapabilities.forEach(cap => {
      assert.ok(
        provider.hasCapability(cap),
        `${provider.name} should support ${cap}`
      );
    });
  });
});

// Export all test suites
export const allSuites = [
  claudeProviderTests,
  openaiProviderTests,
  geminiProviderTests,
  groqProviderTests,
  mistralProviderTests,
  ollamaProviderTests,
  crossProviderTests,
];

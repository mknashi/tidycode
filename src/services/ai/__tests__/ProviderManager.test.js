/**
 * ProviderManager Integration Tests
 */

import { TestSuite, assert } from './testUtils.js';
import { ProviderManager, providerManager } from '../ProviderManager.js';
import { AI_CAPABILITIES } from '../ProviderInterface.js';

/**
 * ProviderManager Initialization Tests
 */
export const initializationTests = new TestSuite('ProviderManager Initialization');

initializationTests.test('should create new instance', () => {
  const manager = new ProviderManager();

  assert.ok(manager);
  assert.equal(manager.providers.size, 0);
  assert.equal(manager.activeProvider, null);
  assert.equal(manager.activeModel, null);
  assert.ok(!manager.isInitialized());
});

initializationTests.test('should initialize with empty config', async () => {
  const manager = new ProviderManager();
  await manager.initialize({});

  assert.ok(manager.isInitialized());
  assert.greaterThan(manager.providers.size, 0);
});

initializationTests.test('should register all built-in providers', async () => {
  const manager = new ProviderManager();
  await manager.initialize({});

  const providers = manager.getAvailableProviders();
  const providerIds = providers.map(p => p.id);

  assert.includes(providerIds, 'claude');
  assert.includes(providerIds, 'openai');
  assert.includes(providerIds, 'gemini');
  assert.includes(providerIds, 'groq');
  assert.includes(providerIds, 'mistral');
  assert.includes(providerIds, 'ollama');
});

initializationTests.test('should initialize providers with API keys', async () => {
  const manager = new ProviderManager();
  await manager.initialize({
    providers: {
      groq: { apiKey: 'gsk_test_key_12345678901234567890' },
    },
  });

  const groq = manager.getProvider('groq');
  assert.equal(groq.apiKey, 'gsk_test_key_12345678901234567890');
});

initializationTests.test('should set active provider from config', async () => {
  const manager = new ProviderManager();
  await manager.initialize({
    providers: {
      groq: { apiKey: 'gsk_test_key_12345678901234567890' },
    },
    activeProvider: 'groq',
  });

  assert.ok(manager.activeProvider);
  assert.equal(manager.activeProvider.id, 'groq');
});

initializationTests.test('should emit initialized event', async () => {
  const manager = new ProviderManager();
  let eventFired = false;

  manager.on('initialized', () => {
    eventFired = true;
  });

  await manager.initialize({});
  assert.ok(eventFired);
});

/**
 * Provider Management Tests
 */
export const providerManagementTests = new TestSuite('ProviderManager Provider Management');

providerManagementTests.test('should get provider by ID', async () => {
  const manager = new ProviderManager();
  await manager.initialize({});

  const claude = manager.getProvider('claude');
  assert.ok(claude);
  assert.equal(claude.id, 'claude');

  const notFound = manager.getProvider('nonexistent');
  assert.equal(notFound, null);
});

providerManagementTests.test('should set active provider', async () => {
  const manager = new ProviderManager();
  await manager.initialize({});

  manager.setActiveProvider('openai');
  assert.equal(manager.activeProvider.id, 'openai');
});

providerManagementTests.test('should throw when setting unknown provider', async () => {
  const manager = new ProviderManager();
  await manager.initialize({});

  let threw = false;
  try {
    manager.setActiveProvider('unknown');
  } catch (e) {
    threw = true;
    assert.ok(e.message.includes('not found'));
  }
  assert.ok(threw);
});

providerManagementTests.test('should set active model', async () => {
  const manager = new ProviderManager();
  await manager.initialize({
    activeProvider: 'openai',
  });

  manager.setActiveModel('gpt-4o-mini');
  assert.equal(manager.activeModel, 'gpt-4o-mini');
});

providerManagementTests.test('should emit events on provider change', async () => {
  const manager = new ProviderManager();
  await manager.initialize({});

  let eventData = null;
  manager.on('activeProviderChanged', (data) => {
    eventData = data;
  });

  manager.setActiveProvider('gemini');
  assert.ok(eventData);
  assert.equal(eventData.providerId, 'gemini');
});

providerManagementTests.test('should unsubscribe from events', async () => {
  const manager = new ProviderManager();
  await manager.initialize({});

  let callCount = 0;
  const unsubscribe = manager.on('activeProviderChanged', () => {
    callCount++;
  });

  manager.setActiveProvider('openai');
  assert.equal(callCount, 1);

  unsubscribe();
  manager.setActiveProvider('groq');
  assert.equal(callCount, 1); // Should not increment
});

/**
 * Provider Info Tests
 */
export const providerInfoTests = new TestSuite('ProviderManager Provider Info');

providerInfoTests.test('should get available providers list', async () => {
  const manager = new ProviderManager();
  await manager.initialize({});

  const providers = manager.getAvailableProviders();
  assert.ok(Array.isArray(providers));
  assert.greaterThan(providers.length, 0);

  // Check provider info structure
  const provider = providers[0];
  assert.hasProperty(provider, 'id');
  assert.hasProperty(provider, 'name');
  assert.hasProperty(provider, 'models');
  assert.hasProperty(provider, 'capabilities');
  assert.hasProperty(provider, 'isReady');
});

providerInfoTests.test('should get providers with specific capability', async () => {
  const manager = new ProviderManager();
  await manager.initialize({
    providers: {
      ollama: {}, // Ollama doesn't need API key
    },
  });

  const completionProviders = manager.getProvidersWithCapability(AI_CAPABILITIES.COMPLETION);
  assert.ok(Array.isArray(completionProviders));

  // Only ready providers should be returned
  completionProviders.forEach(p => {
    assert.ok(p.capabilities.includes(AI_CAPABILITIES.COMPLETION));
  });
});

providerInfoTests.test('should get active provider info', async () => {
  const manager = new ProviderManager();
  await manager.initialize({
    providers: {
      groq: { apiKey: 'gsk_test_key_12345678901234567890' },
    },
    activeProvider: 'groq',
  });

  const info = manager.getActiveProviderInfo();
  assert.ok(info);
  assert.equal(info.id, 'groq');
  assert.equal(info.name, 'Groq');
  assert.ok(info.model);
  assert.ok(Array.isArray(info.capabilities));
});

providerInfoTests.test('should return null when no active provider', async () => {
  const manager = new ProviderManager();
  await manager.initialize({});

  const info = manager.getActiveProviderInfo();
  assert.equal(info, null);
});

/**
 * Capability Tests
 */
export const capabilityTests = new TestSuite('ProviderManager Capabilities');

capabilityTests.test('should check capability on active provider', async () => {
  const manager = new ProviderManager();
  await manager.initialize({
    providers: {
      groq: { apiKey: 'gsk_test_key_12345678901234567890' },
    },
    activeProvider: 'groq',
  });

  assert.ok(manager.hasCapability(AI_CAPABILITIES.COMPLETION));
  assert.ok(manager.hasCapability(AI_CAPABILITIES.CHAT));
});

capabilityTests.test('should return false when no active provider', async () => {
  const manager = new ProviderManager();
  await manager.initialize({});

  assert.ok(!manager.hasCapability(AI_CAPABILITIES.COMPLETION));
});

/**
 * Error Handling Tests
 */
export const errorHandlingTests = new TestSuite('ProviderManager Error Handling');

errorHandlingTests.test('should throw on complete without active provider', async () => {
  const manager = new ProviderManager();
  await manager.initialize({});

  await assert.rejects(
    manager.complete({ prompt: 'test' }),
    'Should throw without active provider'
  );
});

errorHandlingTests.test('should throw on chat without active provider', async () => {
  const manager = new ProviderManager();
  await manager.initialize({});

  await assert.rejects(
    manager.chat([{ role: 'user', content: 'test' }]),
    'Should throw without active provider'
  );
});

errorHandlingTests.test('should throw when provider not ready', async () => {
  const manager = new ProviderManager();
  await manager.initialize({});

  // Set provider without API key
  manager.setActiveProvider('openai');

  await assert.rejects(
    manager.complete({ prompt: 'test' }),
    'Should throw when provider not ready'
  );
});

/**
 * Configuration Tests
 */
export const configurationTests = new TestSuite('ProviderManager Configuration');

configurationTests.test('should configure provider with API key', async () => {
  const manager = new ProviderManager();
  await manager.initialize({});

  // Note: This will fail validation since it's not a real key
  // but the provider should be configured
  const groq = manager.getProvider('groq');
  await groq.initialize({ apiKey: 'gsk_new_key_12345678901234567890' });

  assert.equal(groq.apiKey, 'gsk_new_key_12345678901234567890');
});

configurationTests.test('should update config', async () => {
  const manager = new ProviderManager();
  await manager.initialize({});

  manager.updateConfig({ customSetting: 'value' });
  const config = manager.getConfig();

  assert.equal(config.customSetting, 'value');
});

configurationTests.test('should emit config update event', async () => {
  const manager = new ProviderManager();
  await manager.initialize({});

  let eventData = null;
  manager.on('configUpdated', (data) => {
    eventData = data;
  });

  manager.updateConfig({ test: true });
  assert.ok(eventData);
  assert.equal(eventData.test, true);
});

/**
 * Cleanup Tests
 */
export const cleanupTests = new TestSuite('ProviderManager Cleanup');

cleanupTests.test('should cleanup all providers', async () => {
  const manager = new ProviderManager();
  await manager.initialize({});

  assert.greaterThan(manager.providers.size, 0);

  await manager.cleanup();

  assert.equal(manager.providers.size, 0);
  assert.equal(manager.activeProvider, null);
  assert.ok(!manager.isInitialized());
});

/**
 * Singleton Tests
 */
export const singletonTests = new TestSuite('ProviderManager Singleton');

singletonTests.test('providerManager should be a singleton instance', () => {
  assert.ok(providerManager);
  assert.instanceOf(providerManager, ProviderManager);
});

singletonTests.test('singleton should be reusable after cleanup', async () => {
  // Clean up any previous state
  await providerManager.cleanup();

  await providerManager.initialize({});
  assert.ok(providerManager.isInitialized());

  await providerManager.cleanup();
  assert.ok(!providerManager.isInitialized());

  // Re-initialize
  await providerManager.initialize({});
  assert.ok(providerManager.isInitialized());

  // Clean up for other tests
  await providerManager.cleanup();
});

// Export all test suites
export const allSuites = [
  initializationTests,
  providerManagementTests,
  providerInfoTests,
  capabilityTests,
  errorHandlingTests,
  configurationTests,
  cleanupTests,
  singletonTests,
];

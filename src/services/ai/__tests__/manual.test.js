/**
 * Manual/Interactive Tests for AI Providers
 *
 * These tests require actual API keys and make real API calls.
 * Run with: node --experimental-vm-modules src/services/ai/__tests__/manual.test.js
 *
 * Set environment variables before running:
 *   GROQ_API_KEY=gsk_...
 *   OPENAI_API_KEY=sk-...
 *   CLAUDE_API_KEY=sk-ant-...
 *   GEMINI_API_KEY=AIza...
 *   MISTRAL_API_KEY=...
 */

import { TestSuite, assert, runSuites, colors } from './testUtils.js';
import { providerManager, AI_CAPABILITIES, PROVIDER_IDS } from '../index.js';

// Get API keys from environment
const API_KEYS = {
  groq: process.env.GROQ_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  claude: process.env.CLAUDE_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
  mistral: process.env.MISTRAL_API_KEY,
};

/**
 * Helper to check if a provider can be tested
 */
function canTestProvider(providerId) {
  if (providerId === 'ollama') {
    return true; // Ollama doesn't need API key
  }
  return !!API_KEYS[providerId];
}

/**
 * Groq API Tests (usually easiest to test - free tier available)
 */
export const groqLiveTests = new TestSuite('Groq Live API Tests');

groqLiveTests.beforeAll(async () => {
  if (!canTestProvider('groq')) {
    console.log(`  ${colors.yellow}Skipping Groq tests - no API key${colors.reset}`);
    return;
  }

  await providerManager.initialize({
    providers: {
      groq: { apiKey: API_KEYS.groq },
    },
    activeProvider: 'groq',
  });
});

groqLiveTests.test('should validate Groq API key', async () => {
  if (!canTestProvider('groq')) return;

  const result = await providerManager.validateActiveProvider();
  assert.ok(result.valid, `Groq validation failed: ${result.error}`);
});

groqLiveTests.test('should complete simple prompt', async () => {
  if (!canTestProvider('groq')) return;

  const result = await providerManager.complete({
    prompt: 'Respond with exactly: "Hello, test successful!"',
    maxTokens: 50,
    temperature: 0,
  });

  assert.ok(result.text);
  assert.ok(result.text.toLowerCase().includes('hello'));
});

groqLiveTests.test('should stream completion', async () => {
  if (!canTestProvider('groq')) return;

  const chunks = [];
  const result = await providerManager.streamComplete(
    {
      prompt: 'Count from 1 to 3, one number per line.',
      maxTokens: 50,
    },
    (chunk, done) => {
      if (!done) chunks.push(chunk);
    }
  );

  assert.ok(chunks.length > 0, 'Should receive chunks');
  assert.ok(result.text.includes('1'));
  assert.ok(result.text.includes('2'));
  assert.ok(result.text.includes('3'));
});

groqLiveTests.afterAll(async () => {
  await providerManager.cleanup();
});

/**
 * Ollama Tests (local, no API key needed)
 */
export const ollamaLiveTests = new TestSuite('Ollama Live Tests');

ollamaLiveTests.test('should check Ollama availability', async () => {
  await providerManager.initialize({
    activeProvider: 'ollama',
  });

  const ollama = providerManager.getProvider('ollama');
  const result = await ollama.validateConfig();

  if (result.valid) {
    console.log(`    ${colors.green}Ollama is running${colors.reset}`);
    if (result.models?.length > 0) {
      console.log(`    ${colors.gray}Available models: ${result.models.join(', ')}${colors.reset}`);
    }
  } else {
    console.log(`    ${colors.yellow}Ollama not running: ${result.error}${colors.reset}`);
  }

  // Don't fail if Ollama isn't running
  assert.ok(true);
});

ollamaLiveTests.test('should complete with Ollama (if running)', async () => {
  const ollama = providerManager.getProvider('ollama');
  const validation = await ollama.validateConfig();

  if (!validation.valid) {
    console.log(`    ${colors.yellow}Skipping - Ollama not available${colors.reset}`);
    return;
  }

  // Check if any model is available
  const models = await ollama.getAvailableModels();
  if (models.length === 0) {
    console.log(`    ${colors.yellow}Skipping - No models installed${colors.reset}`);
    return;
  }

  providerManager.setActiveProvider('ollama');
  providerManager.setActiveModel(models[0].id);

  const result = await providerManager.complete({
    prompt: 'Say "test passed" and nothing else.',
    maxTokens: 20,
  });

  assert.ok(result.text);
});

ollamaLiveTests.afterAll(async () => {
  await providerManager.cleanup();
});

/**
 * OpenAI Tests
 */
export const openaiLiveTests = new TestSuite('OpenAI Live API Tests');

openaiLiveTests.beforeAll(async () => {
  if (!canTestProvider('openai')) {
    console.log(`  ${colors.yellow}Skipping OpenAI tests - no API key${colors.reset}`);
    return;
  }

  await providerManager.initialize({
    providers: {
      openai: { apiKey: API_KEYS.openai },
    },
    activeProvider: 'openai',
  });
});

openaiLiveTests.test('should validate OpenAI API key', async () => {
  if (!canTestProvider('openai')) return;

  const result = await providerManager.validateActiveProvider();
  assert.ok(result.valid, `OpenAI validation failed: ${result.error}`);
});

openaiLiveTests.test('should complete with GPT-4o-mini', async () => {
  if (!canTestProvider('openai')) return;

  providerManager.setActiveModel('gpt-4o-mini');

  const result = await providerManager.complete({
    prompt: 'What is 2+2? Reply with just the number.',
    maxTokens: 10,
    temperature: 0,
  });

  assert.ok(result.text.includes('4'));
});

openaiLiveTests.afterAll(async () => {
  await providerManager.cleanup();
});

/**
 * Claude Tests
 */
export const claudeLiveTests = new TestSuite('Claude Live API Tests');

claudeLiveTests.beforeAll(async () => {
  if (!canTestProvider('claude')) {
    console.log(`  ${colors.yellow}Skipping Claude tests - no API key${colors.reset}`);
    return;
  }

  await providerManager.initialize({
    providers: {
      claude: { apiKey: API_KEYS.claude },
    },
    activeProvider: 'claude',
  });
});

claudeLiveTests.test('should validate Claude API key', async () => {
  if (!canTestProvider('claude')) return;

  const result = await providerManager.validateActiveProvider();
  assert.ok(result.valid, `Claude validation failed: ${result.error}`);
});

claudeLiveTests.test('should complete with Claude', async () => {
  if (!canTestProvider('claude')) return;

  const result = await providerManager.complete({
    prompt: 'Reply with exactly: "Claude test passed"',
    maxTokens: 20,
    temperature: 0,
  });

  assert.ok(result.text.toLowerCase().includes('claude'));
});

claudeLiveTests.afterAll(async () => {
  await providerManager.cleanup();
});

/**
 * Gemini Tests
 */
export const geminiLiveTests = new TestSuite('Gemini Live API Tests');

geminiLiveTests.beforeAll(async () => {
  if (!canTestProvider('gemini')) {
    console.log(`  ${colors.yellow}Skipping Gemini tests - no API key${colors.reset}`);
    return;
  }

  await providerManager.initialize({
    providers: {
      gemini: { apiKey: API_KEYS.gemini },
    },
    activeProvider: 'gemini',
  });
});

geminiLiveTests.test('should validate Gemini API key', async () => {
  if (!canTestProvider('gemini')) return;

  const result = await providerManager.validateActiveProvider();
  assert.ok(result.valid, `Gemini validation failed: ${result.error}`);
});

geminiLiveTests.test('should complete with Gemini', async () => {
  if (!canTestProvider('gemini')) return;

  const result = await providerManager.complete({
    prompt: 'Reply with exactly: "Gemini test passed"',
    maxTokens: 20,
    temperature: 0,
  });

  assert.ok(result.text.toLowerCase().includes('gemini') || result.text.toLowerCase().includes('test'));
});

geminiLiveTests.afterAll(async () => {
  await providerManager.cleanup();
});

/**
 * Run all live tests
 */
async function runLiveTests() {
  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}       AI Provider Manual/Live Tests${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);

  console.log(`\n${colors.gray}Available API keys:${colors.reset}`);
  Object.entries(API_KEYS).forEach(([provider, key]) => {
    const status = key ? `${colors.green}✓${colors.reset}` : `${colors.yellow}○${colors.reset}`;
    console.log(`  ${status} ${provider}`);
  });
  console.log(`  ${colors.green}✓${colors.reset} ollama (no key needed)`);

  const success = await runSuites([
    groqLiveTests,
    ollamaLiveTests,
    openaiLiveTests,
    claudeLiveTests,
    geminiLiveTests,
  ]);

  process.exit(success ? 0 : 1);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runLiveTests().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

export const allSuites = [
  groqLiveTests,
  ollamaLiveTests,
  openaiLiveTests,
  claudeLiveTests,
  geminiLiveTests,
];

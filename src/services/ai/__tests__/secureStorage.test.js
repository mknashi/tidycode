/**
 * Secure Storage Tests
 *
 * Runs the web storage path in Node with small localStorage/sessionStorage
 * stand-ins. IndexedDB is absent here, so the in-memory key fallback is used.
 */

import { TestSuite, assert } from './testUtils.js';

class MemoryStorage {
  constructor() { this.items = new Map(); }
  getItem(key) { return this.items.has(key) ? this.items.get(key) : null; }
  setItem(key, value) { this.items.set(key, String(value)); }
  removeItem(key) { this.items.delete(key); }
  clear() { this.items.clear(); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
globalThis.screen = { colorDepth: 24, width: 1920, height: 1080 };

const { saveSecureSettings, loadSecureSettings, API_KEY_STORAGE } = await import('../../../utils/secureStorage.js');

const SETTINGS_KEY = 'tidycode-ai-settings';

// Encrypt the way earlier versions did, with a key derived from the browser fingerprint
async function legacyEncrypt(plaintext) {
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    new Date().getTimezoneOffset(),
    screen.colorDepth,
    screen.width + 'x' + screen.height
  ].join('|');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
  const key = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)));
  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv, 0);
  combined.set(encrypted, iv.length);
  return btoa(String.fromCharCode(...combined));
}

function storedSettings() {
  return JSON.parse(localStorage.getItem(SETTINGS_KEY));
}

function reset() {
  localStorage.clear();
  sessionStorage.clear();
}

export const secureStorageTests = new TestSuite('secureStorage');

secureStorageTests.test('should encrypt every API key and read them back', async () => {
  reset();
  await saveSecureSettings({
    provider: 'claude',
    claudeApiKey: 'sk-ant-abc-123',
    geminiApiKey: 'AIzaSyExample_Key-1',
    claudeModel: 'claude-haiku-5-5',
  });

  const stored = storedSettings();
  assert.ok(stored.claudeApiKey.startsWith('v2:'), 'Claude key should be encrypted');
  assert.ok(stored.geminiApiKey.startsWith('v2:'), 'Gemini key should be encrypted');
  assert.ok(!JSON.stringify(stored).includes('sk-ant-abc-123'), 'No plaintext key in storage');
  assert.equal(stored.claudeModel, 'claude-haiku-5-5');

  const { settings, unreadableKeys } = await loadSecureSettings();
  assert.equal(settings.claudeApiKey, 'sk-ant-abc-123');
  assert.equal(settings.geminiApiKey, 'AIzaSyExample_Key-1');
  assert.lengthOf(unreadableKeys, 0);
});

secureStorageTests.test('should read keys saved by earlier versions', async () => {
  reset();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    provider: 'openai',
    openaiApiKey: await legacyEncrypt('sk-proj-legacy-key'),
    mistralApiKey: 'plain-mistral-key',
  }));
  localStorage.setItem('tidycode-ai-settings-encrypted', 'true');

  const { settings, unreadableKeys } = await loadSecureSettings();
  assert.equal(settings.openaiApiKey, 'sk-proj-legacy-key');
  assert.equal(settings.mistralApiKey, 'plain-mistral-key');
  assert.lengthOf(unreadableKeys, 0);
});

secureStorageTests.test('should report a legacy key it cannot decrypt', async () => {
  reset();
  // Encrypted under a fingerprint that no longer matches (e.g. a new screen size)
  screen.width = 1280;
  const staleCiphertext = await legacyEncrypt('sk-ant-old-key');
  screen.width = 1920;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ provider: 'claude', claudeApiKey: staleCiphertext }));

  const { settings, unreadableKeys } = await loadSecureSettings();
  assert.equal(settings.claudeApiKey, '', 'Unreadable key should come back empty, not as ciphertext');
  assert.deepEqual(unreadableKeys, ['claudeApiKey']);
});

secureStorageTests.test('should keep session-only keys out of localStorage', async () => {
  reset();
  await saveSecureSettings({
    provider: 'groq',
    apiKeyStorage: API_KEY_STORAGE.SESSION,
    groqApiKey: 'gsk_session_key_123',
  });

  assert.ok(!('groqApiKey' in storedSettings()), 'Key should not be in localStorage');
  assert.ok(sessionStorage.getItem('tidycode-ai-keys-session'), 'Key should be in sessionStorage');

  const { settings } = await loadSecureSettings();
  assert.equal(settings.groqApiKey, 'gsk_session_key_123');
});

secureStorageTests.test('should come back without keys after the session ends', async () => {
  reset();
  await saveSecureSettings({
    provider: 'groq',
    apiKeyStorage: API_KEY_STORAGE.SESSION,
    groqApiKey: 'gsk_session_key_123',
  });
  sessionStorage.clear();

  const { settings, unreadableKeys } = await loadSecureSettings();
  assert.equal(settings.groqApiKey, '');
  assert.lengthOf(unreadableKeys, 0, 'An ended session is not an error');
});

secureStorageTests.test('should move keys back to the device when switching from session', async () => {
  reset();
  await saveSecureSettings({ provider: 'groq', apiKeyStorage: API_KEY_STORAGE.SESSION, groqApiKey: 'gsk_move_me_123' });
  await saveSecureSettings({ provider: 'groq', apiKeyStorage: API_KEY_STORAGE.DEVICE, groqApiKey: 'gsk_move_me_123' });

  assert.ok(storedSettings().groqApiKey.startsWith('v2:'));
  assert.equal(sessionStorage.getItem('tidycode-ai-keys-session'), null);
});

export const allSuites = [secureStorageTests];

/**
 * Storage for AI settings, with API keys kept out of plain text.
 *
 * - Desktop: API keys go in the OS keychain (macOS Keychain, Windows
 *   Credential Manager, Linux Secret Service) through Tauri commands.
 * - Web (and desktop when no keychain is available): API keys are encrypted
 *   with AES-GCM under a random key generated once and kept in IndexedDB as a
 *   non-extractable CryptoKey. This stops casual inspection of localStorage;
 *   it cannot protect against code running in the page itself.
 * - "This session only" keeps API keys in sessionStorage, so they are
 *   cleared when the tab or app closes.
 *
 * Earlier versions derived the AES key from a browser fingerprint (user agent,
 * screen size, timezone...), so keys became unreadable whenever any of those
 * changed, and only three of the seven keys were encrypted. Those values are
 * read once and re-saved in the current format.
 */

import { isDesktop } from './platform.js';

const SETTINGS_KEY = 'tidycode-ai-settings';
const SESSION_KEYS_KEY = 'tidycode-ai-keys-session';
const LEGACY_ENCRYPTED_FLAG = 'tidycode-ai-settings-encrypted';
const CIPHERTEXT_PREFIX = 'v2:';
const KEYCHAIN_MARKER = 'keychain';

/** Settings fields that hold provider API keys */
export const API_KEY_FIELDS = [
  'groqApiKey',
  'openaiApiKey',
  'claudeApiKey',
  'geminiApiKey',
  'mistralApiKey',
  'cerebrasApiKey',
  'sambanovaApiKey',
];

// The legacy format encrypted only these
const LEGACY_ENCRYPTED_FIELDS = ['groqApiKey', 'openaiApiKey', 'claudeApiKey'];

/** Where API keys are kept: 'device' (default) or 'session' */
export const API_KEY_STORAGE = { DEVICE: 'device', SESSION: 'session' };

// ---------------------------------------------------------------------------
// Encryption key (IndexedDB)
// ---------------------------------------------------------------------------

const DB_NAME = 'tidycode-secure';
const DB_STORE = 'keys';
const DB_KEY_ID = 'ai-settings-key';

let encryptionKeyPromise = null;

function openKeyDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbRequest(db, mode, operation) {
  return new Promise((resolve, reject) => {
    const store = db.transaction(DB_STORE, mode).objectStore(DB_STORE);
    const request = operation(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadOrCreateEncryptionKey() {
  try {
    const db = await openKeyDatabase();
    const existing = await idbRequest(db, 'readonly', store => store.get(DB_KEY_ID));
    if (existing) return existing;

    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await idbRequest(db, 'readwrite', store => store.put(key, DB_KEY_ID));
    return key;
  } catch (error) {
    // IndexedDB can be unavailable (some private windows). Keys encrypted with
    // this in-memory key won't be readable after a reload.
    console.warn('[secureStorage] IndexedDB unavailable; saved API keys will not survive a reload:', error);
    return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
}

function getEncryptionKey() {
  if (!encryptionKeyPromise) {
    encryptionKeyPromise = loadOrCreateEncryptionKey();
  }
  return encryptionKeyPromise;
}

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text) {
  return Uint8Array.from(atob(text), c => c.charCodeAt(0));
}

async function aesEncrypt(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return toBase64(combined);
}

async function aesDecrypt(key, ciphertext) {
  const combined = fromBase64(ciphertext);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, key, combined.slice(12));
  return new TextDecoder().decode(decrypted);
}

/**
 * Encrypt a value for storage.
 * @param {string} plaintext
 * @returns {Promise<string>} Prefixed ciphertext
 */
export async function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  return CIPHERTEXT_PREFIX + await aesEncrypt(await getEncryptionKey(), plaintext);
}

/**
 * Decrypt a value written by encrypt().
 * @param {string} stored
 * @returns {Promise<string>}
 * @throws When the value can't be decrypted
 */
export async function decrypt(stored) {
  if (!stored) return stored;
  if (!stored.startsWith(CIPHERTEXT_PREFIX)) {
    throw new Error('Not in the current encrypted format');
  }
  return aesDecrypt(await getEncryptionKey(), stored.slice(CIPHERTEXT_PREFIX.length));
}

// ---------------------------------------------------------------------------
// Legacy format (fingerprint-derived key)
// ---------------------------------------------------------------------------

async function getLegacyFingerprintKey() {
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    new Date().getTimezoneOffset(),
    screen.colorDepth,
    screen.width + 'x' + screen.height
  ].join('|');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}

const BASE64_ONLY = /^[A-Za-z0-9+/]+=*$/;

/**
 * Read a key saved by an earlier version.
 * @returns {Promise<string|null>} The key, or null if it can't be recovered
 */
async function readLegacyValue(field, stored) {
  try {
    return await aesDecrypt(await getLegacyFingerprintKey(), stored);
  } catch {
    // Real API keys contain characters such as '-' or '_' that base64 output
    // never does, so anything else was saved as plain text.
    const couldBeCiphertext = LEGACY_ENCRYPTED_FIELDS.includes(field) && BASE64_ONLY.test(stored) && stored.length >= 40;
    return couldBeCiphertext ? null : stored;
  }
}

// ---------------------------------------------------------------------------
// OS keychain (desktop)
// ---------------------------------------------------------------------------

let keychainAvailable = null;
// Keys were in the keychain but couldn't be read this session; keep pointing
// at the keychain so they are picked up again once it is reachable
let keychainReadFailed = false;
// Last value written per field, so unchanged keys aren't rewritten on every save
const keychainWritten = new Map();

async function keychainInvoke(command, args) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(command, args);
}

function useKeychain() {
  return isDesktop() && keychainAvailable !== false;
}

async function keychainGet(field) {
  const value = await keychainInvoke('secret_get', { name: field });
  keychainWritten.set(field, value || '');
  return value || '';
}

async function keychainSet(field, value) {
  if (keychainWritten.get(field) === value) return;
  if (value) {
    await keychainInvoke('secret_set', { name: field, value });
  } else {
    await keychainInvoke('secret_delete', { name: field });
  }
  keychainWritten.set(field, value);
}

function markKeychainUnavailable(error) {
  if (keychainAvailable !== false) {
    console.warn('[secureStorage] OS keychain unavailable; storing encrypted keys locally instead:', error);
  }
  keychainAvailable = false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function encryptKeys(keys) {
  const encrypted = {};
  for (const field of API_KEY_FIELDS) {
    if (keys[field]) encrypted[field] = await encrypt(keys[field]);
  }
  return encrypted;
}

// Saves run one at a time so keychain writes can't interleave
let saveQueue = Promise.resolve();

/**
 * Save AI settings. API keys go to the keychain, sessionStorage or encrypted
 * localStorage depending on `settings.apiKeyStorage` and the platform.
 * @param {Object} settings - AI settings object
 */
export function saveSecureSettings(settings) {
  const run = saveQueue.then(() => writeSettings(settings));
  saveQueue = run.catch(() => {});
  return run;
}

async function writeSettings(settings) {
  const stored = { ...settings };
  const keys = {};
  for (const field of API_KEY_FIELDS) {
    keys[field] = settings[field] || '';
    delete stored[field];
  }

  if (settings.apiKeyStorage === API_KEY_STORAGE.SESSION) {
    sessionStorage.setItem(SESSION_KEYS_KEY, JSON.stringify(await encryptKeys(keys)));
    if (useKeychain()) {
      try {
        for (const field of API_KEY_FIELDS) await keychainSet(field, '');
      } catch (error) {
        markKeychainUnavailable(error);
      }
    }
  } else {
    sessionStorage.removeItem(SESSION_KEYS_KEY);
    let savedToKeychain = false;
    if (useKeychain()) {
      try {
        for (const field of API_KEY_FIELDS) await keychainSet(field, keys[field]);
        keychainAvailable = true;
        savedToKeychain = true;
      } catch (error) {
        markKeychainUnavailable(error);
      }
    }
    if (savedToKeychain) {
      stored.apiKeyLocation = KEYCHAIN_MARKER;
    } else {
      Object.assign(stored, await encryptKeys(keys));
      if (keychainReadFailed) {
        stored.apiKeyLocation = KEYCHAIN_MARKER;
      } else {
        delete stored.apiKeyLocation;
      }
    }
  }

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(stored));
  localStorage.removeItem(LEGACY_ENCRYPTED_FLAG);
}

/**
 * Load AI settings and their API keys.
 * @returns {Promise<{settings: Object, unreadableKeys: string[], keychainError: boolean} | null>}
 *   `unreadableKeys` lists fields whose saved key couldn't be read; those
 *   fields come back empty so the user can re-enter them. `keychainError` is
 *   true when keys are in the OS keychain but it couldn't be reached.
 */
export async function loadSecureSettings() {
  let settings;
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return null;
    settings = JSON.parse(saved);
  } catch (error) {
    console.error('Failed to load AI settings:', error);
    return null;
  }

  const unreadableKeys = [];
  let keychainError = false;
  const sessionOnly = settings.apiKeyStorage === API_KEY_STORAGE.SESSION;

  // Keys stored in localStorage: current encrypted format, or an earlier version's
  for (const field of API_KEY_FIELDS) {
    const stored = settings[field];
    if (!stored) continue;
    if (stored.startsWith(CIPHERTEXT_PREFIX)) {
      try {
        settings[field] = await decrypt(stored);
      } catch {
        settings[field] = '';
        unreadableKeys.push(field);
      }
    } else {
      const value = await readLegacyValue(field, stored);
      settings[field] = value || '';
      if (value === null) unreadableKeys.push(field);
    }
  }

  if (sessionOnly) {
    try {
      const sessionKeys = JSON.parse(sessionStorage.getItem(SESSION_KEYS_KEY) || '{}');
      for (const field of API_KEY_FIELDS) {
        // A missing session entry just means the session ended
        settings[field] = sessionKeys[field] ? await decrypt(sessionKeys[field]) : '';
      }
    } catch (error) {
      console.warn('[secureStorage] Could not read session API keys:', error);
    }
  } else if (useKeychain() && settings.apiKeyLocation === KEYCHAIN_MARKER) {
    try {
      for (const field of API_KEY_FIELDS) {
        // A key saved locally while the keychain was unreachable is newer
        settings[field] = settings[field] || await keychainGet(field);
      }
      keychainAvailable = true;
      keychainReadFailed = false;
    } catch (error) {
      markKeychainUnavailable(error);
      keychainReadFailed = true;
      keychainError = true;
    }
  }

  delete settings.apiKeyLocation;
  return { settings, unreadableKeys, keychainError };
}

/**
 * Remove all stored AI settings and API keys.
 */
export async function clearSecureSettings() {
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(LEGACY_ENCRYPTED_FLAG);
  sessionStorage.removeItem(SESSION_KEYS_KEY);
  if (useKeychain()) {
    try {
      for (const field of API_KEY_FIELDS) await keychainSet(field, '');
    } catch (error) {
      markKeychainUnavailable(error);
    }
  }
}

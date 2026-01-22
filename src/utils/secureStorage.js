/**
 * Secure storage utility for encrypting sensitive data before storing in localStorage
 * Uses Web Crypto API for AES-GCM encryption
 */

// Generate a device-specific encryption key from browser fingerprint
async function getEncryptionKey() {
  // Create a device fingerprint from stable browser properties
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    new Date().getTimezoneOffset(),
    screen.colorDepth,
    screen.width + 'x' + screen.height
  ].join('|');

  // Hash the fingerprint to create a consistent key
  const encoder = new TextEncoder();
  const data = encoder.encode(fingerprint);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Import the hash as a crypto key
  return crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data using AES-GCM
 * @param {string} plaintext - The data to encrypt
 * @returns {Promise<string>} Base64-encoded encrypted data with IV
 */
export async function encrypt(plaintext) {
  try {
    if (!plaintext) return plaintext;

    const key = await getEncryptionKey();
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    // Generate random IV (Initialization Vector)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt the data
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedBuffer), iv.length);

    // Convert to base64 for storage
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Encryption failed:', error);
    // Fallback to plaintext if encryption fails (shouldn't happen)
    return plaintext;
  }
}

/**
 * Decrypt data using AES-GCM
 * @param {string} ciphertext - Base64-encoded encrypted data
 * @returns {Promise<string>} Decrypted plaintext
 */
export async function decrypt(ciphertext) {
  try {
    if (!ciphertext) return ciphertext;

    // Check if data is already decrypted (for backward compatibility)
    if (!ciphertext.includes('=') && ciphertext.length < 100) {
      // Looks like plaintext, return as-is
      return ciphertext;
    }

    const key = await getEncryptionKey();

    // Decode from base64
    const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));

    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const encryptedData = combined.slice(12);

    // Decrypt
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedData
    );

    // Convert back to string
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.error('Decryption failed:', error);
    // Return original if decryption fails (backward compatibility)
    return ciphertext;
  }
}

/**
 * Encrypt and save AI settings to localStorage
 * @param {Object} settings - AI settings object
 */
export async function saveSecureSettings(settings) {
  try {
    // Clone settings to avoid mutating original
    const secureSettings = { ...settings };

    // Encrypt sensitive fields
    if (secureSettings.groqApiKey) {
      secureSettings.groqApiKey = await encrypt(secureSettings.groqApiKey);
    }
    if (secureSettings.openaiApiKey) {
      secureSettings.openaiApiKey = await encrypt(secureSettings.openaiApiKey);
    }
    if (secureSettings.claudeApiKey) {
      secureSettings.claudeApiKey = await encrypt(secureSettings.claudeApiKey);
    }

    // Save encrypted settings
    localStorage.setItem('tidycode-ai-settings', JSON.stringify(secureSettings));

    // Mark as encrypted for future detection
    localStorage.setItem('tidycode-ai-settings-encrypted', 'true');
  } catch (error) {
    console.error('Failed to save secure settings:', error);
    throw error;
  }
}

/**
 * Load and decrypt AI settings from localStorage
 * @returns {Promise<Object>} Decrypted AI settings
 */
export async function loadSecureSettings() {
  try {
    const saved = localStorage.getItem('tidycode-ai-settings');
    if (!saved) return null;

    const settings = JSON.parse(saved);
    const isEncrypted = localStorage.getItem('tidycode-ai-settings-encrypted') === 'true';

    // If not encrypted, encrypt and save
    if (!isEncrypted) {
      await saveSecureSettings(settings);
      return settings;
    }

    // Decrypt sensitive fields
    if (settings.groqApiKey) {
      settings.groqApiKey = await decrypt(settings.groqApiKey);
    }
    if (settings.openaiApiKey) {
      settings.openaiApiKey = await decrypt(settings.openaiApiKey);
    }
    if (settings.claudeApiKey) {
      settings.claudeApiKey = await decrypt(settings.claudeApiKey);
    }

    return settings;
  } catch (error) {
    console.error('Failed to load secure settings:', error);
    return null;
  }
}

/**
 * Clear all stored API keys
 */
export function clearSecureSettings() {
  localStorage.removeItem('tidycode-ai-settings');
  localStorage.removeItem('tidycode-ai-settings-encrypted');
}

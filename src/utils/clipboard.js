/**
 * Cross-platform clipboard utilities
 * Uses Tauri's native clipboard in desktop mode, falls back to browser API in web mode
 */

import { isDesktop } from './platform.js';

/**
 * Read text from clipboard
 * @returns {Promise<string>} The clipboard text content
 */
export async function readClipboardText() {
  if (isDesktop()) {
    try {
      // Use Tauri's clipboard API in desktop mode (no permission prompt)
      const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
      const text = await readText();
      return text || '';
    } catch (error) {
      console.warn('[Clipboard] Tauri clipboard read failed, falling back to browser API:', error);
      // Fall back to browser API if Tauri fails
      return await navigator.clipboard.readText();
    }
  } else {
    // Use browser Clipboard API in web mode
    return await navigator.clipboard.readText();
  }
}

/**
 * Write text to clipboard
 * @param {string} text - The text to write to clipboard
 * @returns {Promise<void>}
 */
export async function writeClipboardText(text) {
  if (isDesktop()) {
    try {
      // Use Tauri's clipboard API in desktop mode (no permission prompt)
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
      await writeText(text);
      return;
    } catch (error) {
      console.warn('[Clipboard] Tauri clipboard write failed, falling back to browser API:', error);
      // Fall back to browser API if Tauri fails
      await navigator.clipboard.writeText(text);
    }
  } else {
    // Use browser Clipboard API in web mode
    await navigator.clipboard.writeText(text);
  }
}

/**
 * Check if clipboard contains text
 * @returns {Promise<boolean>}
 */
export async function hasClipboardText() {
  try {
    const text = await readClipboardText();
    return text.length > 0;
  } catch (error) {
    console.warn('[Clipboard] Failed to check clipboard:', error);
    return false;
  }
}

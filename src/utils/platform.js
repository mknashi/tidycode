/**
 * Platform detection utilities for web vs desktop environment
 */

/**
 * Check if running in Tauri desktop environment
 * Tauri injects __TAURI_INVOKE__ function that we can detect
 * @returns {boolean} true if running as Tauri desktop app
 */
export const isDesktop = () => {
  if (typeof window === 'undefined') return false;

  // Check for Tauri-specific globals that are injected by the runtime
  const hasTauriInvoke = typeof window.__TAURI_INVOKE__ === 'function';
  const hasTauriInternals = window.__TAURI_INTERNALS__ !== undefined;
  const hasTauriLegacy = window.__TAURI__ !== undefined;
  const hasTauriIpc = window.__TAURI_IPC__ !== undefined;

  const isTauri = hasTauriInvoke || hasTauriInternals || hasTauriLegacy || hasTauriIpc;

  // Log platform detection only once on first call
  if (!window.__PLATFORM_DETECTED__) {
    window.__PLATFORM_DETECTED__ = true;

    const debugInfo = {
      hasTauriInvoke,
      hasTauriInternals,
      hasTauriLegacy,
      hasTauriIpc,
      isTauri,
      userAgent: navigator.userAgent.substring(0, 50),
      allGlobals: Object.keys(window).filter(k => k.includes('TAURI'))
    };

    const platform = isTauri ? 'DESKTOP (Tauri)' : 'WEB';
    console.log(`%c🚀 Running in ${platform} mode`, 'font-size: 16px; color: #10b981; font-weight: bold');
    console.log('[Platform Detection]', debugInfo);

    // Store in window for debugging
    window.__PLATFORM_INFO__ = debugInfo;
  }

  return isTauri;
};

/**
 * Check if running in web browser environment
 * @returns {boolean} true if running in web browser
 */
export const isWeb = () => {
  return !isDesktop();
};

/**
 * Get the AI service instance (browser-based, tinyllm only)
 * @returns {Promise<import('../services/FormatterService').formatterService>}
 */
export const getAIService = async () => {
  const { formatterService } = await import('../services/FormatterService.js');
  return formatterService;
};

/**
 * Get platform-specific configuration
 * @returns {Object} Platform configuration
 */
export const getPlatformConfig = () => {
  if (isDesktop()) {
    return {
      platform: 'desktop',
      aiProvider: 'ollama',
      supportsNativeFileSystem: true,
      supportsAutoUpdate: true,
      supportsSystemTray: true
    };
  } else {
    return {
      platform: 'web',
      aiProvider: 'webllm', // or 'groq'
      supportsNativeFileSystem: false,
      supportsAutoUpdate: false,
      supportsSystemTray: false
    };
  }
};

/**
 * Platform-specific feature flags
 */
export const FEATURES = {
  // AI features
  get NATIVE_AI() { return isDesktop(); },
  get WEBGPU_AI() { return isWeb(); },

  // File system
  get NATIVE_FILE_DIALOGS() { return isDesktop(); },

  // UI features
  get SYSTEM_TRAY() { return isDesktop(); },
  get WINDOW_CONTROLS() { return isDesktop(); },

  // Updates
  get AUTO_UPDATE() { return isDesktop(); }
};

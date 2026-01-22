/**
 * WASM Module Loader for Tidy Code
 * Handles lazy loading and initialization of the WebAssembly module
 */

let wasmModule = null;
let isInitialized = false;
let initPromise = null;

/**
 * Initialize WASM module (lazy loaded)
 * Only loads when first large file is opened
 * @returns {Promise<object>} The WASM module
 */
export async function initWasm() {
  if (isInitialized) return wasmModule;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log('[WASM] Loading module...');
      const startTime = performance.now();

      // Detect if running in Tauri
      const isTauri = typeof window !== 'undefined' &&
                      (window.__TAURI_INVOKE__ !== undefined ||
                       window.__TAURI_INTERNALS__ !== undefined);

      console.log('[WASM] Platform:', isTauri ? 'Tauri Desktop' : 'Web');
      console.log('[WASM] import.meta.url:', import.meta.url);

      // Dynamic import - code splitting
      const wasm = await import('../../src-wasm/pkg/file_ops_wasm.js');

      // Initialize WASM
      // In Tauri, the WASM file is served from the asset:// protocol
      // Let wasm-bindgen auto-detect the path
      console.log('[WASM] Attempting initialization...');

      // Initialize WASM with multi-tier fallback strategy
      let initSuccess = false;
      let lastError = null;

      // Tier 1: Import WASM file as URL (Vite will handle bundling)
      try {
        console.log('[WASM] Tier 1: Trying Vite-bundled WASM import...');

        // Import the WASM file URL - Vite will handle this during build
        const wasmUrl = new URL('../../src-wasm/pkg/file_ops_wasm_bg.wasm', import.meta.url).href;
        console.log('[WASM] WASM URL:', wasmUrl);

        const response = await fetch(wasmUrl);
        console.log('[WASM] Fetch response status:', response.status, response.statusText);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const wasmBinary = await response.arrayBuffer();
        console.log('[WASM] Fetched binary, size:', (wasmBinary.byteLength / 1024).toFixed(1), 'KB');

        if (wasmBinary.byteLength === 0) {
          throw new Error('WASM binary is empty (0 bytes)');
        }

        await wasm.default(wasmBinary);
        console.log('[WASM] ✓ Tier 1 successful (Vite-bundled)');
        initSuccess = true;
      } catch (directError) {
        console.warn('[WASM] ✗ Tier 1 failed:', directError.message);
        console.warn('[WASM] Error details:', directError.stack);
        lastError = directError;
      }

      // Tier 2: Auto-detection fallback (let wasm-bindgen find the file)
      if (!initSuccess) {
        try {
          console.log('[WASM] Tier 2: Trying auto-detection...');
          await wasm.default(undefined);
          console.log('[WASM] ✓ Tier 2 successful (auto-detect)');
          initSuccess = true;
        } catch (autoError) {
          console.warn('[WASM] ✗ Tier 2 failed:', autoError.message);
          lastError = autoError;
        }
      }

      // Tier 3: Try using initSync with binary (last resort for Tauri)
      if (!initSuccess && isTauri && wasm.initSync) {
        try {
          console.log('[WASM] Tier 3: Trying initSync fallback...');
          const wasmUrl = new URL('../../src-wasm/pkg/file_ops_wasm_bg.wasm', import.meta.url);
          const response = await fetch(wasmUrl.href);

          if (response.ok) {
            const wasmBinary = await response.arrayBuffer();
            wasm.initSync(new Uint8Array(wasmBinary));
            console.log('[WASM] ✓ Tier 3 successful (initSync)');
            initSuccess = true;
          } else {
            throw new Error(`Fetch failed: ${response.status}`);
          }
        } catch (syncError) {
          console.error('[WASM] ✗ Tier 3 failed:', syncError.message);
          lastError = syncError;
        }
      }

      if (!initSuccess) {
        console.error('[WASM] ❌ All initialization tiers failed');
        console.error('[WASM] Platform:', isTauri ? 'Tauri' : 'Web');
        console.error('[WASM] Environment details:', {
          userAgent: navigator.userAgent,
          wasmSupported: typeof WebAssembly !== 'undefined',
          location: window.location.href
        });
        throw new Error(`WASM initialization failed after all attempts: ${lastError?.message || 'Unknown error'}`);
      }

      const loadTime = performance.now() - startTime;
      console.log(`[WASM] Module loaded in ${loadTime.toFixed(2)}ms`);

      wasmModule = wasm;
      isInitialized = true;
      return wasm;
    } catch (error) {
      console.error('[WASM] Failed to load module:', error);
      console.error('[WASM] Error details:', error.stack);
      initPromise = null; // Allow retry
      throw new Error(`WASM initialization failed: ${error.message}`);
    }
  })();

  return initPromise;
}

/**
 * Check if WASM is supported in this browser
 * @returns {boolean} True if WebAssembly is supported
 */
export function isWasmSupported() {
  try {
    if (
      typeof WebAssembly === 'object' &&
      typeof WebAssembly.instantiate === 'function'
    ) {
      // Test instantiation with minimal valid WASM module
      const module = new WebAssembly.Module(
        Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)
      );
      return module instanceof WebAssembly.Module;
    }
  } catch (e) {
    console.warn('[WASM] WebAssembly not supported:', e);
    return false;
  }
  return false;
}

/**
 * Get WASM module (must call initWasm first)
 * @returns {object} The WASM module
 * @throws {Error} If module not initialized
 */
export function getWasmModule() {
  if (!isInitialized) {
    throw new Error('WASM module not initialized. Call initWasm() first.');
  }
  return wasmModule;
}

/**
 * Check if WASM is currently initialized
 * @returns {boolean} True if initialized
 */
export function isWasmInitialized() {
  return isInitialized;
}

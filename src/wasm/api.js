/**
 * High-Level WASM API for Tidy Code
 * Provides a JavaScript-friendly interface to WASM file operations
 */

import { initWasm, getWasmModule } from './loader.js';

/**
 * File Manager API - Wraps WASM calls with JS-friendly interface
 */
export class WasmFileManager {
  constructor() {
    this.fileHandles = new Map(); // file_id -> metadata
  }

  /**
   * Load file into WASM buffer
   * @param {Uint8Array} content - File content as bytes
   * @param {string} fileName - File name for tracking
   * @returns {Promise<number>} - File ID
   */
  async loadFile(content, fileName) {
    await initWasm();
    const wasm = getWasmModule();

    try {
      const fileId = wasm.create_file_buffer(content);

      // Get file info
      const info = wasm.get_file_info(fileId);
      console.log('[WASM API] get_file_info returned:', info);

      // Store metadata
      this.fileHandles.set(fileId, {
        fileName,
        size: info.size || 0,
        lineCount: info.line_count || 0,
        encoding: info.encoding || 'UTF-8',
        indexSize: info.index_size || 0,
        loadedAt: Date.now(),
      });

      console.log(
        `[WASM] Loaded ${fileName}: ${(info.line_count || 0).toLocaleString()} lines, ${((info.size || 0) / 1024 / 1024).toFixed(2)}MB`
      );

      return fileId;
    } catch (error) {
      console.error('[WASM] Failed to load file:', error);
      throw error;
    }
  }

  /**
   * Get visible lines for CodeMirror viewport
   * @param {number} fileId - File ID from loadFile
   * @param {number} startLine - First line (1-indexed)
   * @param {number} endLine - Last line (inclusive)
   * @returns {Promise<string>} - Line content
   */
  async getLineRange(fileId, startLine, endLine) {
    const wasm = getWasmModule();

    try {
      return wasm.get_line_range(fileId, startLine, endLine);
    } catch (error) {
      console.error(
        `[WASM] Failed to get lines ${startLine}-${endLine}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Search file for pattern
   * @param {number} fileId - File ID
   * @param {string} pattern - Search pattern (regex supported)
   * @param {number} maxResults - Maximum results to return
   * @returns {Promise<Array>} - Search results
   */
  async search(fileId, pattern, maxResults = 1000) {
    const wasm = getWasmModule();

    try {
      const startTime = performance.now();
      const results = wasm.search_file(fileId, pattern, maxResults);
      const searchTime = performance.now() - startTime;

      const meta = this.fileHandles.get(fileId);
      console.log(
        `[WASM] Searched ${meta?.fileName} (${(meta?.size / 1024 / 1024).toFixed(2)}MB) in ${searchTime.toFixed(2)}ms - found ${results.length} matches`
      );

      return results;
    } catch (error) {
      console.error('[WASM] Search failed:', error);
      throw error;
    }
  }

  /**
   * Get full file content from WASM
   * Used when saving files - content is stored in WASM, not React state
   * @param {number} fileId - File ID from loadFile
   * @returns {Promise<string>} - Full file content
   */
  async getContent(fileId) {
    console.log('[WASM API] getContent called for fileId:', fileId);
    const wasm = getWasmModule();
    console.log('[WASM API] WASM module obtained');

    try {
      console.log('[WASM API] Calling wasm.get_content()...');
      const startTime = performance.now();
      const content = wasm.get_content(fileId);
      const loadTime = performance.now() - startTime;
      console.log(`[WASM API] Content retrieved in ${loadTime.toFixed(2)}ms, length: ${content.length}`);
      return content;
    } catch (error) {
      console.error('[WASM API] Failed to get content:', error);
      console.error('[WASM API] Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Validate JSON content
   * @param {number} fileId - File ID
   * @returns {Promise<boolean>} - True if valid JSON
   */
  async validateJson(fileId) {
    const wasm = getWasmModule();

    try {
      return wasm.validate_json(fileId);
    } catch (error) {
      // Return false for invalid JSON, throw for other errors
      if (error.message && error.message.includes('JSON')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Format JSON content
   * @param {number} fileId - File ID
   * @param {number} indent - Spaces per indentation level
   * @returns {Promise<string>} - Formatted JSON
   */
  async formatJson(fileId, indent = 2) {
    const wasm = getWasmModule();

    try {
      const startTime = performance.now();
      const formatted = wasm.format_json(fileId, indent);
      const formatTime = performance.now() - startTime;

      const meta = this.fileHandles.get(fileId);
      console.log(
        `[WASM] Formatted JSON ${meta?.fileName} in ${formatTime.toFixed(2)}ms`
      );

      return formatted;
    } catch (error) {
      console.error('[WASM] Format failed:', error);
      throw error;
    }
  }

  /**
   * Get file metadata
   * @param {number} fileId - File ID
   * @returns {object} - File metadata
   */
  getFileInfo(fileId) {
    return this.fileHandles.get(fileId);
  }

  /**
   * Unload file from WASM memory
   * @param {number} fileId - File ID
   */
  unloadFile(fileId) {
    const wasm = getWasmModule();
    wasm.free_file_buffer(fileId);
    this.fileHandles.delete(fileId);

    console.log(`[WASM] Unloaded file ${fileId}`);
  }

  /**
   * Get memory usage statistics
   * @returns {object} - Memory stats
   */
  async getMemoryStats() {
    const wasm = getWasmModule();

    try {
      const wasmStats = wasm.get_memory_stats();

      // Combine with our local metadata
      let totalSizeFromMeta = 0;
      let totalFiles = 0;

      for (const meta of this.fileHandles.values()) {
        totalSizeFromMeta += meta.size;
        totalFiles++;
      }

      return {
        ...wasmStats,
        totalFiles,
        totalSizeMB: (totalSizeFromMeta / 1024 / 1024).toFixed(2),
        files: Array.from(this.fileHandles.entries()).map(([id, meta]) => ({
          id,
          fileName: meta.fileName,
          sizeMB: (meta.size / 1024 / 1024).toFixed(2),
          lineCount: meta.lineCount.toLocaleString(),
          loadedAt: new Date(meta.loadedAt).toLocaleTimeString(),
        })),
      };
    } catch (error) {
      console.error('[WASM] Failed to get memory stats:', error);
      return {
        totalFiles: this.fileHandles.size,
        totalSizeMB: '0',
        files: [],
      };
    }
  }

  /**
   * Check if a file is loaded
   * @param {number} fileId - File ID
   * @returns {boolean} - True if file is loaded
   */
  isFileLoaded(fileId) {
    return this.fileHandles.has(fileId);
  }

  /**
   * Get all loaded file IDs
   * @returns {number[]} - Array of file IDs
   */
  getAllFileIds() {
    return Array.from(this.fileHandles.keys());
  }
}

// Singleton instance
export const wasmFileManager = new WasmFileManager();

// Export individual functions for convenience
export { initWasm, isWasmSupported } from './loader.js';

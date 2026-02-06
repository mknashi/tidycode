/**
 * WASM File Handler Utility
 *
 * Provides intelligent file loading with automatic WASM backend selection for large files.
 * This module handles:
 * - Large file detection and WASM loading
 * - Progress tracking for file operations
 * - Memory management and cleanup
 * - Fallback to regular JavaScript for small files
 */

import { wasmFileManager } from '../wasm/api.js';

// File size thresholds (in bytes)
export const FILE_SIZE_THRESHOLDS = {
  // Use WASM for files larger than 5MB for optimal performance
  // WASM provides efficient line indexing and memory management for large files
  WASM_THRESHOLD: 5 * 1024 * 1024, // 5MB

  // Warn user for very large files (100MB+)
  WARNING_THRESHOLD: 100 * 1024 * 1024, // 100MB

  // Maximum recommended file size (500MB web, 1GB desktop)
  MAX_RECOMMENDED_WEB: 500 * 1024 * 1024, // 500MB
  MAX_RECOMMENDED_DESKTOP: 1024 * 1024 * 1024, // 1GB
};

/**
 * Detect if a file should use WASM based on size
 */
export function shouldUseWasm(fileSize) {
  return fileSize >= FILE_SIZE_THRESHOLDS.WASM_THRESHOLD;
}

/**
 * Check if file size exceeds warning threshold
 */
export function shouldWarnUser(fileSize, isDesktop = false) {
  const maxRecommended = isDesktop
    ? FILE_SIZE_THRESHOLDS.MAX_RECOMMENDED_DESKTOP
    : FILE_SIZE_THRESHOLDS.MAX_RECOMMENDED_WEB;

  return fileSize > maxRecommended;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} Bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Load file with automatic WASM detection
 *
 * @param {string|Uint8Array} content - File content (string or bytes)
 * @param {string} fileName - File name
 * @param {Object} options - Loading options
 * @param {Function} options.onProgress - Progress callback (percent, message)
 * @param {boolean} options.forceWasm - Force WASM usage regardless of size
 * @returns {Promise<Object>} File handle with metadata
 */
export async function loadFile(content, fileName, options = {}) {
  const { onProgress, forceWasm = false } = options;

  // Convert content to bytes for size detection
  let contentBytes;
  let contentString;

  if (typeof content === 'string') {
    contentString = content;
    contentBytes = new TextEncoder().encode(content);
  } else {
    contentBytes = content;
    contentString = new TextDecoder().decode(content);
  }

  const fileSize = contentBytes.length;
  const useWasm = forceWasm || shouldUseWasm(fileSize);

  if (onProgress) {
    onProgress(10, useWasm ? 'Initializing WASM...' : 'Loading file...');
  }

  // Load with WASM for large files
  if (useWasm) {
    try {
      if (onProgress) onProgress(30, 'Indexing lines...');

      const startTime = performance.now();
      const fileId = await wasmFileManager.loadFile(contentBytes, fileName);
      const loadTime = performance.now() - startTime;

      if (onProgress) onProgress(80, 'Getting file info...');

      const info = await wasmFileManager.getFileInfo(fileId);
      console.log('[WASM] File info returned:', info);

      if (onProgress) onProgress(100, 'Complete');

      console.log(`[WASM] Loaded ${formatFileSize(fileSize)} file in ${loadTime.toFixed(0)}ms`);
      if (info && info.lineCount !== undefined) {
        console.log(`[WASM] Indexed ${info.lineCount.toLocaleString()} lines`);
      }

      return {
        wasmFileId: fileId,
        content: contentString,
        fileSize,
        lineCount: info?.lineCount || 0,
        indexSize: info?.indexSize || 0,
        loadTime,
        isWasmBacked: true,
        fileName
      };
    } catch (error) {
      console.error('[WASM] Failed to load file, falling back to JavaScript:', error);
      console.error('[WASM] Error stack:', error.stack);
      console.error('[WASM] Error message:', error.message);
      // Fall through to regular loading
    }
  }

  // Regular JavaScript loading for small files or WASM fallback
  if (onProgress) onProgress(50, 'Loading content...');

  const lines = contentString.split('\n');

  if (onProgress) onProgress(100, 'Complete');

  return {
    wasmFileId: null,
    content: contentString,
    fileSize,
    lineCount: lines.length,
    isWasmBacked: false,
    fileName
  };
}

/**
 * Get line range from file (WASM or regular)
 *
 * @param {Object} fileHandle - File handle from loadFile()
 * @param {number} startLine - Start line (1-indexed)
 * @param {number} endLine - End line (1-indexed)
 * @returns {Promise<string>} Line content
 */
export async function getLineRange(fileHandle, startLine, endLine) {
  if (fileHandle.isWasmBacked && fileHandle.wasmFileId !== null) {
    return await wasmFileManager.getLineRange(fileHandle.wasmFileId, startLine, endLine);
  }

  // Fallback to regular string splitting
  const lines = fileHandle.content.split('\n');
  return lines.slice(startLine - 1, endLine).join('\n') + '\n';
}

/**
 * Search in file (WASM or regular)
 *
 * @param {Object} fileHandle - File handle from loadFile()
 * @param {string} pattern - Search pattern (regex)
 * @param {number} maxResults - Maximum results
 * @returns {Promise<Array>} Search results
 */
export async function searchInFile(fileHandle, pattern, maxResults = 1000) {
  if (fileHandle.isWasmBacked && fileHandle.wasmFileId !== null) {
    return await wasmFileManager.search(fileHandle.wasmFileId, pattern, maxResults);
  }

  // Fallback to regular search
  const results = [];
  const lines = fileHandle.content.split('\n');
  const regex = new RegExp(pattern, 'gi');

  for (let i = 0; i < lines.length && results.length < maxResults; i++) {
    const matches = lines[i].matchAll(regex);
    for (const match of matches) {
      results.push({
        line: i + 1,
        column: match.index,
        text: lines[i]
      });

      if (results.length >= maxResults) break;
    }
  }

  return results;
}

/**
 * Get full content from WASM file
 * Used when saving files - avoids storing large content in React state
 *
 * @param {Object} fileHandle - File handle from loadFile()
 * @returns {Promise<string>} Full file content
 */
export async function getContentFromWasm(fileHandle) {
  console.log('[WASM] getContentFromWasm called with:', {
    isWasmBacked: fileHandle.isWasmBacked,
    wasmFileId: fileHandle.wasmFileId,
    fileName: fileHandle.fileName,
    fileSize: fileHandle.fileSize
  });

  if (fileHandle.isWasmBacked && fileHandle.wasmFileId !== null) {
    try {
      console.log('[WASM] Retrieving content from WASM...');
      const startTime = performance.now();
      const content = await wasmFileManager.getContent(fileHandle.wasmFileId);
      const loadTime = performance.now() - startTime;
      console.log(`[WASM] Content retrieved successfully in ${loadTime.toFixed(2)}ms:`, {
        contentLength: content.length,
        firstChars: content.substring(0, 100),
        lastChars: content.substring(Math.max(0, content.length - 100))
      });
      return content;
    } catch (error) {
      console.error('[WASM] Failed to get content from WASM:', error);
      throw error;
    }
  }
  throw new Error('File is not WASM-backed');
}

/**
 * Unload file and free memory
 *
 * @param {Object} fileHandle - File handle from loadFile()
 */
export async function unloadFile(fileHandle) {
  if (fileHandle.isWasmBacked && fileHandle.wasmFileId !== null) {
    wasmFileManager.unloadFile(fileHandle.wasmFileId);
    console.log(`[WASM] Unloaded file: ${fileHandle.fileName}`);
  }
}

/**
 * Get memory statistics
 *
 * @returns {Promise<Object>} Memory stats
 */
export async function getMemoryStats() {
  try {
    return await wasmFileManager.getMemoryStats();
  } catch (error) {
    console.warn('[WASM] Failed to get memory stats:', error);
    return {
      file_count: 0,
      total_content_size: 0,
      total_index_size: 0,
      total_size: 0
    };
  }
}

/**
 * Format JSON content (WASM or regular)
 *
 * @param {Object} fileHandle - File handle from loadFile()
 * @param {number} indent - Indentation spaces
 * @returns {Promise<string>} Formatted JSON
 */
export async function formatJson(fileHandle, indent = 2) {
  if (fileHandle.isWasmBacked && fileHandle.wasmFileId !== null) {
    try {
      return await wasmFileManager.formatJson(fileHandle.wasmFileId, indent);
    } catch (error) {
      console.warn('[WASM] JSON format failed, falling back to JavaScript:', error);
    }
  }

  // Fallback to regular JSON formatting
  const parsed = JSON.parse(fileHandle.content);
  return JSON.stringify(parsed, null, indent);
}

/**
 * Validate JSON content (WASM or regular)
 *
 * @param {Object} fileHandle - File handle from loadFile()
 * @returns {Promise<boolean>} True if valid JSON
 */
export async function validateJson(fileHandle) {
  if (fileHandle.isWasmBacked && fileHandle.wasmFileId !== null) {
    try {
      return await wasmFileManager.validateJson(fileHandle.wasmFileId);
    } catch (error) {
      return false;
    }
  }

  // Fallback to regular JSON validation
  try {
    JSON.parse(fileHandle.content);
    return true;
  } catch {
    return false;
  }
}

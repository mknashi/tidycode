/**
 * Smart File Reader Utility
 * Automatically chooses between regular and chunked file reading based on file size
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// File size threshold for using chunked reading (10MB)
const CHUNKED_READ_THRESHOLD = 10 * 1024 * 1024; // 10MB

/**
 * Format bytes to human-readable format
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Read file with automatic chunked reading for large files
 *
 * @param {string} filePath - Path to the file
 * @param {Object} options - Options
 * @param {Function} options.onProgress - Progress callback (progress, bytesRead, totalBytes)
 * @param {boolean} options.forceChunked - Force chunked reading
 * @returns {Promise<Uint8Array>} File content as bytes
 */
export async function readFile(filePath, options = {}) {
  const { onProgress, forceChunked = false } = options;

  try {
    // Get file size first to determine reading strategy
    const stats = await invoke('get_file_stats', { path: filePath });
    const fileSize = stats.size;

    console.log(`[FileReader] Reading file: ${filePath}`);
    console.log(`[FileReader] Size: ${formatBytes(fileSize)}`);

    // Use chunked reading for large files
    const useChunked = forceChunked || fileSize >= CHUNKED_READ_THRESHOLD;

    if (useChunked) {
      console.log('[FileReader] Using chunked reading for large file');
      return await readFileChunked(filePath, fileSize, onProgress);
    } else {
      console.log('[FileReader] Using standard reading for small file');
      if (onProgress) {
        onProgress(0, 0, fileSize);
      }

      const content = await invoke('read_file_from_path', { filePath });

      if (onProgress) {
        onProgress(100, fileSize, fileSize);
      }

      return content;
    }
  } catch (error) {
    console.error('[FileReader] Failed to read file:', error);
    throw error;
  }
}

/**
 * Read file in chunks with progress updates
 *
 * @param {string} filePath - Path to the file
 * @param {number} fileSize - Total file size
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Uint8Array>} File content as bytes
 */
async function readFileChunked(filePath, fileSize, onProgress) {
  return new Promise((resolve, reject) => {
    let unlisten = null;

    // Set up progress listener
    const setupListener = async () => {
      try {
        unlisten = await listen('file-read-progress', (event) => {
          const { bytesRead, totalBytes, progress } = event.payload;

          if (event.payload.path === filePath && onProgress) {
            onProgress(progress, bytesRead, totalBytes);
          }
        });

        // Start chunked read
        const content = await invoke('read_large_file_chunked', {
          appHandle: null, // Tauri will inject this
          filePath,
          chunkSize: 512 * 1024 // 512KB chunks
        });

        // Final progress update
        if (onProgress) {
          onProgress(100, fileSize, fileSize);
        }

        // Clean up listener
        if (unlisten) {
          unlisten();
        }

        resolve(content);
      } catch (error) {
        // Clean up listener on error
        if (unlisten) {
          unlisten();
        }
        reject(error);
      }
    };

    setupListener();
  });
}

/**
 * Read file as text with automatic encoding detection
 *
 * @param {string} filePath - Path to the file
 * @param {Object} options - Options
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise<string>} File content as string
 */
export async function readTextFile(filePath, options = {}) {
  const bytes = await readFile(filePath, options);

  // Convert Uint8Array to string
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(new Uint8Array(bytes));
}

/**
 * Check if file should use chunked reading
 *
 * @param {number} fileSize - File size in bytes
 * @returns {boolean} True if should use chunked reading
 */
export function shouldUseChunkedReading(fileSize) {
  return fileSize >= CHUNKED_READ_THRESHOLD;
}

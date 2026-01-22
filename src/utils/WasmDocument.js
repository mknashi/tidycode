/**
 * WASM-backed virtual document for CodeMirror
 * Enables viewing very large files without loading entire content into memory
 */

import { Text } from '@codemirror/state';
import { wasmFileManager } from '../wasm/api.js';

/**
 * Custom Text implementation that loads lines from WASM on demand
 * This allows CodeMirror to work with files larger than available JS memory
 */
export class WasmBackedText extends Text {
  constructor(wasmFileId, lineCount, fileSize) {
    super();
    this.wasmFileId = wasmFileId;
    this.lineCount = lineCount;
    this.fileSize = fileSize;
    this.cachedLines = new Map(); // Cache loaded lines
    this.cacheSize = 0;
    this.maxCacheSize = 1000; // Cache up to 1000 lines
  }

  get length() {
    return this.fileSize;
  }

  get lines() {
    return this.lineCount;
  }

  /**
   * Get line at given position (1-indexed in WASM, 0-indexed in CodeMirror)
   */
  line(lineNum) {
    if (lineNum < 1 || lineNum > this.lineCount) {
      throw new RangeError(`Invalid line number: ${lineNum}`);
    }

    return {
      from: this.lineStart(lineNum),
      to: this.lineEnd(lineNum),
      number: lineNum,
      text: this.getLineText(lineNum)
    };
  }

  /**
   * Get line start position
   */
  lineStart(lineNum) {
    // This is approximate - we'd need to track actual byte positions
    // For now, estimate based on average line length
    const avgLineLength = this.lineCount > 0 ? Math.floor(this.fileSize / this.lineCount) : 0;
    return (lineNum - 1) * avgLineLength;
  }

  /**
   * Get line end position
   */
  lineEnd(lineNum) {
    const avgLineLength = this.lineCount > 0 ? Math.floor(this.fileSize / this.lineCount) : 0;
    return lineNum * avgLineLength;
  }

  /**
   * Get text for a specific line (synchronous, uses cache)
   */
  getLineText(lineNum) {
    if (this.cachedLines.has(lineNum)) {
      return this.cachedLines.get(lineNum);
    }

    // If not cached, we need to load it - but CodeMirror expects sync
    // We'll load a chunk of lines around this one
    this.loadLineChunk(lineNum);
    return this.cachedLines.get(lineNum) || '';
  }

  /**
   * Load a chunk of lines around the requested line
   */
  loadLineChunk(centerLine) {
    const chunkSize = 100; // Load 100 lines at a time
    const startLine = Math.max(1, centerLine - 50);
    const endLine = Math.min(this.lineCount, centerLine + 50);

    try {
      // Synchronous WASM call - this is why we cache
      const wasm = wasmFileManager.getWasmModule();
      const content = wasm.get_line_range(this.wasmFileId, startLine, endLine);
      const lines = content.split('\n');

      // Cache the loaded lines
      for (let i = 0; i < lines.length; i++) {
        const lineNum = startLine + i;
        if (!this.cachedLines.has(lineNum)) {
          this.cachedLines.set(lineNum, lines[i]);
          this.cacheSize++;

          // Evict old cache entries if cache is too large
          if (this.cacheSize > this.maxCacheSize) {
            const firstKey = this.cachedLines.keys().next().value;
            this.cachedLines.delete(firstKey);
            this.cacheSize--;
          }
        }
      }
    } catch (error) {
      console.error('[WasmDocument] Failed to load line chunk:', error);
    }
  }

  /**
   * Get text in a range
   */
  sliceString(from, to) {
    // For simplicity, return empty for now
    // Full implementation would need to map byte positions to lines
    return '';
  }

  /**
   * Get a slice of the document
   */
  slice(from, to) {
    return this.sliceString(from, to);
  }

  /**
   * Get line at byte position
   */
  lineAt(pos) {
    const avgLineLength = this.lineCount > 0 ? Math.floor(this.fileSize / this.lineCount) : 0;
    const lineNum = Math.max(1, Math.min(this.lineCount, Math.floor(pos / avgLineLength) + 1));
    return this.line(lineNum);
  }

  /**
   * Iterate over lines in a range
   */
  iterLines(from, to) {
    // Not implemented for virtual document
    return [];
  }

  /**
   * Required by Text interface
   */
  toString() {
    return '[WasmBackedText]';
  }

  /**
   * Append (not supported for read-only WASM document)
   */
  append(other) {
    throw new Error('WasmBackedText is read-only');
  }
}

/**
 * Create a simplified text representation for CodeMirror
 * This creates a proxy that shows line numbers and loads content on demand
 */
export function createWasmDocument(wasmFileHandle) {
  const { wasmFileId, lineCount, fileSize } = wasmFileHandle;

  // For minified files (0 lines), we can't use virtual scrolling
  if (lineCount === 0) {
    return null;
  }

  // Create line number placeholders
  const lines = [];
  for (let i = 1; i <= lineCount; i++) {
    lines.push(`[Line ${i} - loading...]`);
  }
  const placeholderText = lines.join('\n');

  return {
    text: placeholderText,
    wasmFileId,
    lineCount,
    isVirtual: true
  };
}

/**
 * Get a range of lines from WASM (async version for editor updates)
 */
export async function loadVisibleLines(wasmFileId, startLine, endLine) {
  try {
    return await wasmFileManager.getLineRange(wasmFileId, startLine, endLine);
  } catch (error) {
    console.error('[WasmDocument] Failed to load visible lines:', error);
    return '';
  }
}

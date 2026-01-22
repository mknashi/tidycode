/**
 * Base class for all format handlers
 * Provides common interface and utility methods
 */
export class BaseFormatter {
  constructor(formatName) {
    this.formatName = formatName;
    this.extensions = [];
    this.mimeTypes = [];
    this.warnings = [];
  }

  /**
   * Detect if content matches this format
   * @param {string} content - Content to check
   * @returns {{ match: boolean, confidence: number }}
   */
  detect(content) {
    throw new Error('detect() must be implemented by subclass');
  }

  /**
   * Validate content syntax
   * @param {string} content - Content to validate
   * @returns {{ valid: boolean, errors: array, warnings: array }}
   */
  validate(content) {
    throw new Error('validate() must be implemented by subclass');
  }

  /**
   * Format/prettify content
   * @param {string} content - Content to format
   * @param {object} options - Formatting options
   * @returns {{ formatted: string, errors: array }}
   */
  format(content, options = {}) {
    throw new Error('format() must be implemented by subclass');
  }

  /**
   * Minify content (remove whitespace)
   * @param {string} content - Content to minify
   * @returns {{ minified: string, errors: array }}
   */
  minify(content) {
    // Default implementation - subclasses can override
    return { minified: null, errors: [{ message: 'Minification not supported for this format' }] };
  }

  /**
   * Build structure tree for Structure View
   * @param {string} content - Content to parse
   * @returns {{ nodes: array, errors: array }}
   */
  buildStructure(content) {
    throw new Error('buildStructure() must be implemented by subclass');
  }

  /**
   * Parse content to JavaScript object
   * @param {string} content - Content to parse
   * @returns {any}
   */
  parse(content) {
    throw new Error('parse() must be implemented by subclass');
  }

  /**
   * Convert JavaScript object to format string
   * @param {any} data - Data to stringify
   * @param {object} options - Stringification options
   * @returns {string}
   */
  stringify(data, options = {}) {
    throw new Error('stringify() must be implemented by subclass');
  }

  /**
   * Check if file extension matches this format
   * @param {string} filename - Filename to check
   * @returns {boolean}
   */
  matchesExtension(filename) {
    if (!filename) return false;
    const ext = '.' + filename.split('.').pop().toLowerCase();
    return this.extensions.includes(ext);
  }

  /**
   * Truncate value for display in structure view
   * @param {any} value - Value to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string}
   */
  truncateValue(value, maxLength = 50) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';

    const str = String(value);
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }

  /**
   * Format array for preview display
   * @param {array} arr - Array to format
   * @param {number} maxItems - Maximum items to show
   * @returns {string}
   */
  formatArrayPreview(arr, maxItems = 3) {
    if (!Array.isArray(arr)) return String(arr);

    const preview = arr.slice(0, maxItems).map(item => {
      if (typeof item === 'object') return '{...}';
      return this.truncateValue(item, 20);
    });

    if (arr.length > maxItems) {
      preview.push(`... +${arr.length - maxItems} more`);
    }

    return `[${preview.join(', ')}]`;
  }

  /**
   * Create standard error object
   * @param {Error|string} error - Error or message
   * @param {object} location - Line/column info
   * @returns {object}
   */
  createError(error, location = {}) {
    const message = typeof error === 'string' ? error : error.message;
    return {
      message,
      line: location.line || null,
      column: location.column || null,
      severity: 'error',
      format: this.formatName
    };
  }

  /**
   * Create standard warning object
   * @param {string} message - Warning message
   * @param {object} location - Line/column info
   * @returns {object}
   */
  createWarning(message, location = {}) {
    return {
      message,
      line: location.line || null,
      column: location.column || null,
      severity: 'warning',
      format: this.formatName
    };
  }
}

export default BaseFormatter;

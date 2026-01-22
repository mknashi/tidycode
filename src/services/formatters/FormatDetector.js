/**
 * Content-based format detection
 * Analyzes content to determine the most likely format
 */
export class FormatDetector {
  constructor(formatters) {
    this.formatters = formatters;
    // Detection priority - more specific formats first
    this.detectionOrder = ['json', 'xml', 'toml', 'yaml'];
  }

  /**
   * Detect format from content
   * @param {string} content - Content to analyze
   * @param {string} filename - Optional filename for extension-based hints
   * @returns {{ format: string, confidence: number, method: string }}
   */
  detect(content, filename = null) {
    // First try extension-based detection if filename provided
    if (filename) {
      const extFormat = this.detectByExtension(filename);
      if (extFormat) {
        return {
          format: extFormat,
          confidence: 0.9,
          method: 'extension'
        };
      }
    }

    // Content-based detection
    const results = [];

    for (const formatName of this.detectionOrder) {
      const formatter = this.formatters.get(formatName);
      if (formatter) {
        const detection = formatter.detect(content);
        if (detection.match) {
          results.push({
            format: formatName,
            confidence: detection.confidence,
            method: 'content'
          });
        }
      }
    }

    // Sort by confidence (highest first)
    results.sort((a, b) => b.confidence - a.confidence);

    if (results.length > 0) {
      return results[0];
    }

    // No match found
    return {
      format: null,
      confidence: 0,
      method: 'none'
    };
  }

  /**
   * Detect format from file extension
   * @param {string} filename - Filename to check
   * @returns {string|null}
   */
  detectByExtension(filename) {
    if (!filename) return null;

    const ext = '.' + filename.split('.').pop().toLowerCase();

    for (const [formatName, formatter] of this.formatters.entries()) {
      if (formatter.extensions.includes(ext)) {
        return formatName;
      }
    }

    return null;
  }

  /**
   * Get all supported formats
   * @returns {string[]}
   */
  getSupportedFormats() {
    return Array.from(this.formatters.keys());
  }

  /**
   * Get all supported extensions
   * @returns {object} - Map of extension to format
   */
  getSupportedExtensions() {
    const extensions = {};

    for (const [formatName, formatter] of this.formatters.entries()) {
      for (const ext of formatter.extensions) {
        extensions[ext] = formatName;
      }
    }

    return extensions;
  }
}

export default FormatDetector;

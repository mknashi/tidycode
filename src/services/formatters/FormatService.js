import { JsonFormatter } from './JsonFormatter';
import { XmlFormatter } from './XmlFormatter';
import { YamlFormatter } from './YamlFormatter';
import { TomlFormatter } from './TomlFormatter';
import { FormatDetector } from './FormatDetector';
import { FormatConverter } from './FormatConverter';

/**
 * Unified format service
 * Provides a single interface for all format operations
 */
export class FormatService {
  constructor() {
    this.formatters = new Map([
      ['json', new JsonFormatter()],
      ['xml', new XmlFormatter()],
      ['yaml', new YamlFormatter()],
      ['toml', new TomlFormatter()]
    ]);

    this.detector = new FormatDetector(this.formatters);
    this.converter = new FormatConverter();
  }

  /**
   * Detect format from content
   * @param {string} content - Content to analyze
   * @param {string} filename - Optional filename for hints
   * @returns {{ format: string, confidence: number, method: string }}
   */
  detect(content, filename = null) {
    return this.detector.detect(content, filename);
  }

  /**
   * Validate content
   * @param {string} content - Content to validate
   * @param {string} format - Format to validate as (auto-detect if not provided)
   * @returns {{ valid: boolean, errors: array, warnings: array, format: string }}
   */
  validate(content, format = null) {
    if (!format) {
      const detection = this.detect(content);
      format = detection.format;
    }

    if (!format) {
      return {
        valid: false,
        errors: [{ message: 'Could not detect format' }],
        warnings: [],
        format: null
      };
    }

    const formatter = this.formatters.get(format);
    if (!formatter) {
      return {
        valid: false,
        errors: [{ message: `Unsupported format: ${format}` }],
        warnings: [],
        format
      };
    }

    const result = formatter.validate(content);
    return { ...result, format };
  }

  /**
   * Format/prettify content
   * @param {string} content - Content to format
   * @param {string} format - Format (auto-detect if not provided)
   * @param {object} options - Formatting options
   * @returns {{ formatted: string, errors: array, format: string }}
   */
  format(content, format = null, options = {}) {
    if (!format) {
      const detection = this.detect(content);
      format = detection.format;
    }

    if (!format) {
      return {
        formatted: null,
        errors: [{ message: 'Could not detect format' }],
        format: null
      };
    }

    const formatter = this.formatters.get(format);
    if (!formatter) {
      return {
        formatted: null,
        errors: [{ message: `Unsupported format: ${format}` }],
        format
      };
    }

    const result = formatter.format(content, options);
    return { ...result, format };
  }

  /**
   * Minify content
   * @param {string} content - Content to minify
   * @param {string} format - Format (auto-detect if not provided)
   * @returns {{ minified: string, errors: array, format: string }}
   */
  minify(content, format = null) {
    if (!format) {
      const detection = this.detect(content);
      format = detection.format;
    }

    if (!format) {
      return {
        minified: null,
        errors: [{ message: 'Could not detect format' }],
        format: null
      };
    }

    const formatter = this.formatters.get(format);
    if (!formatter) {
      return {
        minified: null,
        errors: [{ message: `Unsupported format: ${format}` }],
        format
      };
    }

    const result = formatter.minify(content);
    return { ...result, format };
  }

  /**
   * Build structure tree for Structure View
   * @param {string} content - Content to parse
   * @param {string} format - Format (auto-detect if not provided)
   * @returns {{ nodes: array, errors: array, format: string }}
   */
  buildStructure(content, format = null) {
    if (!format) {
      const detection = this.detect(content);
      format = detection.format;
    }

    if (!format) {
      return {
        nodes: [],
        errors: [{ message: 'Could not detect format' }],
        format: null
      };
    }

    const formatter = this.formatters.get(format);
    if (!formatter) {
      return {
        nodes: [],
        errors: [{ message: `Unsupported format: ${format}` }],
        format
      };
    }

    const result = formatter.buildStructure(content);
    return { ...result, format };
  }

  /**
   * Convert content between formats
   * @param {string} content - Content to convert
   * @param {string} fromFormat - Source format
   * @param {string} toFormat - Target format
   * @param {object} options - Conversion options
   * @returns {{ converted: string, errors: array, warnings: array }}
   */
  convert(content, fromFormat, toFormat, options = {}) {
    const result = this.converter.convert(content, fromFormat, toFormat, options);
    const warnings = this.converter.getConversionWarnings(fromFormat, toFormat);
    return { ...result, warnings };
  }

  /**
   * Get available conversion targets for a format
   * @param {string} format - Source format
   * @returns {string[]}
   */
  getConversionTargets(format) {
    return this.converter.getConversionTargets(format);
  }

  /**
   * Get all supported formats
   * @returns {string[]}
   */
  getSupportedFormats() {
    return Array.from(this.formatters.keys());
  }

  /**
   * Get formatter for a specific format
   * @param {string} format - Format name
   * @returns {BaseFormatter|null}
   */
  getFormatter(format) {
    return this.formatters.get(format) || null;
  }

  /**
   * Get validation tips for an error
   * @param {object} error - Error object
   * @param {string} format - Format
   * @returns {string[]}
   */
  getValidationTips(error, format) {
    const formatter = this.formatters.get(format);
    if (formatter && typeof formatter.getValidationTips === 'function') {
      return formatter.getValidationTips(error);
    }
    return [];
  }

  /**
   * Check if format supports minification
   * @param {string} format - Format to check
   * @returns {boolean}
   */
  supportsMinification(format) {
    return ['json', 'xml'].includes(format);
  }

  /**
   * Check if format supports structure view
   * @param {string} format - Format to check
   * @returns {boolean}
   */
  supportsStructureView(format) {
    return ['json', 'xml', 'yaml', 'toml'].includes(format);
  }
}

// Export singleton instance
export const formatService = new FormatService();
export default FormatService;

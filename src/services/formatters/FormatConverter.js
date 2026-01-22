import { JsonFormatter } from './JsonFormatter';
import { XmlFormatter } from './XmlFormatter';
import { YamlFormatter } from './YamlFormatter';
import { TomlFormatter } from './TomlFormatter';

/**
 * Format conversion service
 * Handles bidirectional conversion between all supported formats
 */
export class FormatConverter {
  constructor() {
    this.formatters = {
      json: new JsonFormatter(),
      xml: new XmlFormatter(),
      yaml: new YamlFormatter(),
      toml: new TomlFormatter()
    };
    // Track adjustments made during conversion
    this.adjustments = [];
  }

  /**
   * Convert content from one format to another
   * @param {string} content - Source content
   * @param {string} fromFormat - Source format (json|xml|yaml|toml)
   * @param {string} toFormat - Target format (json|xml|yaml|toml)
   * @param {object} options - Conversion options
   * @returns {{ converted: string, errors: array, adjustments: array }}
   */
  convert(content, fromFormat, toFormat, options = {}) {
    // Reset adjustments for each conversion
    this.adjustments = [];

    if (fromFormat === toFormat) {
      return { converted: content, errors: [], adjustments: [] };
    }

    const sourceFormatter = this.formatters[fromFormat];
    const targetFormatter = this.formatters[toFormat];

    if (!sourceFormatter) {
      return {
        converted: null,
        errors: [{ message: `Unsupported source format: ${fromFormat}`, phase: 'validation' }],
        adjustments: []
      };
    }

    if (!targetFormatter) {
      return {
        converted: null,
        errors: [{ message: `Unsupported target format: ${toFormat}`, phase: 'validation' }],
        adjustments: []
      };
    }

    try {
      // Step 1: Parse source format to intermediate object
      const parsed = sourceFormatter.parse(content);

      // Step 2: Handle format-specific data transformations
      const transformed = this.transformData(parsed, fromFormat, toFormat);

      // Step 3: Convert intermediate to target format
      const converted = targetFormatter.stringify(transformed, options);

      // Step 4: Find line numbers for adjustments in the converted output
      this.calculateAdjustmentLines(converted, toFormat);

      return { converted, errors: [], adjustments: [...this.adjustments] };
    } catch (error) {
      return {
        converted: null,
        errors: [{
          message: `Conversion failed: ${error.message}`,
          phase: error.phase || 'conversion'
        }],
        adjustments: [...this.adjustments]
      };
    }
  }

  /**
   * Calculate line numbers for adjustments in the converted output
   */
  calculateAdjustmentLines(converted, toFormat) {
    const lines = converted.split('\n');

    for (const adjustment of this.adjustments) {
      if (adjustment.newValue) {
        // Find the line containing the adjusted value
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(adjustment.newValue)) {
            adjustment.line = i + 1;
            break;
          }
        }
      }
    }
  }

  /**
   * Transform data between formats to handle incompatibilities
   * @param {any} data - Parsed data
   * @param {string} fromFormat - Source format
   * @param {string} toFormat - Target format
   * @returns {any}
   */
  transformData(data, fromFormat, toFormat) {
    // Handle XML-specific transformations
    if (fromFormat === 'xml') {
      // Remove @attributes wrapper if converting to simpler formats
      if (toFormat !== 'xml') {
        data = this.flattenXmlAttributes(data);
      }
    }

    // Handle TOML limitations
    if (toFormat === 'toml') {
      // TOML doesn't support null values
      data = this.removeNullValues(data);
      // TOML requires top-level to be an object
      if (Array.isArray(data)) {
        this.adjustments.push({
          type: 'structure',
          message: 'Root array wrapped in object with "items" key (TOML requires object at root)',
          original: 'Array',
          newValue: 'items'
        });
        data = { items: data };
      }
    }

    // Handle XML output - sanitize tag names
    if (toFormat === 'xml') {
      data = this.sanitizeForXml(data);
    }

    return data;
  }

  /**
   * Sanitize data for XML output - replace invalid characters in tag names
   * @param {any} data - Data to sanitize
   * @param {string} path - Current path for tracking
   * @returns {any}
   */
  sanitizeForXml(data, path = '') {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item, idx) => this.sanitizeForXml(item, `${path}[${idx}]`));
    }

    const result = {};
    for (const [key, value] of Object.entries(data)) {
      const sanitizedKey = this.sanitizeXmlTagName(key, path);
      result[sanitizedKey] = this.sanitizeForXml(value, path ? `${path}.${sanitizedKey}` : sanitizedKey);
    }
    return result;
  }

  /**
   * Sanitize a string to be a valid XML tag name
   * - Replace spaces with underscores
   * - Replace other invalid characters
   * - Ensure it doesn't start with a number or invalid character
   * @param {string} name - Original name
   * @param {string} path - Path for adjustment tracking
   * @returns {string}
   */
  sanitizeXmlTagName(name, path) {
    let sanitized = name;
    let wasModified = false;
    const modifications = [];

    // Replace spaces with underscores
    if (name.includes(' ')) {
      sanitized = sanitized.replace(/ /g, '_');
      modifications.push('spaces replaced with underscores');
      wasModified = true;
    }

    // Replace other invalid characters (keep letters, numbers, underscore, hyphen, period)
    const invalidChars = sanitized.match(/[^a-zA-Z0-9_\-\.]/g);
    if (invalidChars) {
      const uniqueInvalid = [...new Set(invalidChars)];
      sanitized = sanitized.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      modifications.push(`invalid characters "${uniqueInvalid.join('')}" replaced with underscores`);
      wasModified = true;
    }

    // XML tag names cannot start with a number, hyphen, or period
    if (/^[0-9\-\.]/.test(sanitized)) {
      sanitized = '_' + sanitized;
      modifications.push('prefixed with underscore (cannot start with number/hyphen/period)');
      wasModified = true;
    }

    // XML tag names cannot start with "xml" (case-insensitive)
    if (/^xml/i.test(sanitized)) {
      sanitized = '_' + sanitized;
      modifications.push('prefixed with underscore (cannot start with "xml")');
      wasModified = true;
    }

    if (wasModified) {
      this.adjustments.push({
        type: 'tagName',
        message: `Tag name "${name}" → "${sanitized}" (${modifications.join(', ')})`,
        original: name,
        newValue: sanitized,
        path: path || sanitized
      });
    }

    return sanitized;
  }

  /**
   * Flatten XML @attributes into parent object
   * @param {any} data - Data to transform
   * @returns {any}
   */
  flattenXmlAttributes(data) {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.flattenXmlAttributes(item));
    }

    const result = {};

    for (const [key, value] of Object.entries(data)) {
      if (key === '@attributes') {
        // Flatten attributes with @ prefix
        for (const [attrKey, attrValue] of Object.entries(value)) {
          result[`@${attrKey}`] = attrValue;
        }
      } else if (key === '#text') {
        // Handle text content
        if (Object.keys(data).length === 1 ||
            (Object.keys(data).length === 2 && data['@attributes'])) {
          return value; // Return just the text value
        }
        result['_text'] = value;
      } else {
        result[key] = this.flattenXmlAttributes(value);
      }
    }

    return result;
  }

  /**
   * Remove null values (required for TOML)
   * @param {any} data - Data to transform
   * @param {string} path - Current path for tracking
   * @returns {any}
   */
  removeNullValues(data, path = '') {
    if (typeof data !== 'object' || data === null) {
      if (data === null) {
        this.adjustments.push({
          type: 'nullValue',
          message: `Null value at "${path || 'root'}" converted to empty string (TOML doesn't support null)`,
          original: 'null',
          newValue: '""',
          path: path || 'root'
        });
        return '';
      }
      return data;
    }

    if (Array.isArray(data)) {
      const filtered = [];
      data.forEach((item, idx) => {
        if (item === null) {
          this.adjustments.push({
            type: 'nullValue',
            message: `Null value at "${path}[${idx}]" removed from array (TOML doesn't support null)`,
            original: 'null',
            newValue: '(removed)',
            path: `${path}[${idx}]`
          });
        } else {
          filtered.push(this.removeNullValues(item, `${path}[${idx}]`));
        }
      });
      return filtered;
    }

    const result = {};
    for (const [key, value] of Object.entries(data)) {
      const currentPath = path ? `${path}.${key}` : key;
      if (value === null) {
        this.adjustments.push({
          type: 'nullValue',
          message: `Null value at "${currentPath}" removed (TOML doesn't support null)`,
          original: 'null',
          newValue: '(removed)',
          path: currentPath
        });
      } else {
        result[key] = this.removeNullValues(value, currentPath);
      }
    }
    return result;
  }

  /**
   * Get available conversion targets for a source format
   * @param {string} fromFormat - Source format
   * @returns {string[]}
   */
  getConversionTargets(fromFormat) {
    const allFormats = Object.keys(this.formatters);
    return allFormats.filter(f => f !== fromFormat);
  }

  /**
   * Check if conversion is supported
   * @param {string} fromFormat - Source format
   * @param {string} toFormat - Target format
   * @returns {boolean}
   */
  isConversionSupported(fromFormat, toFormat) {
    return this.formatters[fromFormat] && this.formatters[toFormat];
  }

  /**
   * Get conversion warnings (for potentially lossy conversions)
   * @param {string} fromFormat - Source format
   * @param {string} toFormat - Target format
   * @returns {string[]}
   */
  getConversionWarnings(fromFormat, toFormat) {
    const warnings = [];

    if (fromFormat === 'xml' && toFormat !== 'xml') {
      warnings.push('XML attributes will be converted to object properties with @ prefix');
      warnings.push('XML text content will be stored as _text property');
    }

    if (toFormat === 'toml') {
      warnings.push('TOML does not support null values (they will be converted to empty strings)');
      warnings.push('TOML requires the root to be an object (arrays will be wrapped)');
    }

    if (toFormat === 'xml') {
      warnings.push('XML requires a single root element');
      warnings.push('Property names must be valid XML element names');
    }

    return warnings;
  }
}

export const formatConverter = new FormatConverter();
export default FormatConverter;

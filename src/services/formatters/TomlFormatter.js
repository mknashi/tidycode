import * as TOML from 'smol-toml';
import { BaseFormatter } from './BaseFormatter';

/**
 * TOML format handler
 * Provides validation, formatting, and structure building for TOML
 * Uses smol-toml which is browser-compatible
 */
export class TomlFormatter extends BaseFormatter {
  constructor() {
    super('toml');
    this.extensions = ['.toml'];
    this.mimeTypes = ['application/toml'];
  }

  detect(content) {
    const trimmed = content.trim();

    // Negative patterns - definitely not TOML
    if (trimmed.startsWith('{') || trimmed.startsWith('<')) {
      return { match: false, confidence: 0 };
    }
    if (trimmed.startsWith('---')) {
      return { match: false, confidence: 0 }; // YAML document marker
    }

    // TOML indicators
    const tomlPatterns = [
      /^\[[\w.-]+\]\s*$/m,              // [section] headers
      /^\[\[[\w.-]+\]\]\s*$/m,          // [[array.of.tables]]
      /^[a-zA-Z_][\w-]*\s*=/m,          // key = value
      /=\s*"""/,                         // Multi-line basic strings
      /=\s*'''/,                         // Multi-line literal strings
      /=\s*\d{4}-\d{2}-\d{2}/,          // Date values
      /=\s*\d{2}:\d{2}:\d{2}/,          // Time values
      /=\s*\[\s*$/m,                     // Array values
      /^#.*$/m,                          // Comments
    ];

    const matches = tomlPatterns.filter(p => p.test(content)).length;

    // Strong indicator: section headers
    const hasSections = /^\[[\w.-]+\]/m.test(content);
    const hasArrayTables = /^\[\[[\w.-]+\]\]/m.test(content);

    // Key=value without colon is a strong TOML indicator
    const hasKeyEquals = /^[a-zA-Z_][\w-]*\s*=\s*[^=]/m.test(content);

    if (hasSections || hasArrayTables) {
      return {
        match: true,
        confidence: 0.95
      };
    }

    if (hasKeyEquals && matches >= 1) {
      return {
        match: true,
        confidence: Math.min(0.6 + (matches * 0.1), 0.9)
      };
    }

    return { match: false, confidence: 0 };
  }

  validate(content) {
    try {
      TOML.parse(content);
      return { valid: true, errors: [], warnings: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [this.parseTomlError(error)],
        warnings: []
      };
    }
  }

  format(content, options = {}) {
    const {
      sortKeys = false,
      newlineAfterSection = true
    } = options;

    try {
      let parsed = TOML.parse(content);

      if (sortKeys) {
        parsed = this.sortObject(parsed);
      }

      let formatted = TOML.stringify(parsed);

      // Post-process formatting
      if (newlineAfterSection) {
        // Add blank line before section headers
        formatted = formatted.replace(/(\n)(\[[^\]]+\])/g, '\n\n$2');
        // Clean up multiple blank lines
        formatted = formatted.replace(/\n{3,}/g, '\n\n');
        // Ensure no leading blank line
        formatted = formatted.replace(/^\n+/, '');
      }

      return { formatted, errors: [] };
    } catch (error) {
      return { formatted: null, errors: [this.parseTomlError(error)] };
    }
  }

  parse(content) {
    return TOML.parse(content);
  }

  stringify(data, options = {}) {
    const { sortKeys = false } = options;
    const toStringify = sortKeys ? this.sortObject(data) : data;
    return TOML.stringify(toStringify);
  }

  buildStructure(content) {
    try {
      const parsed = TOML.parse(content);
      const lines = content.split('\n');
      this.nodeCounter = 0;
      return { nodes: this.buildNodes(parsed, '', 0, lines), errors: [] };
    } catch (error) {
      return { nodes: [], errors: [this.parseTomlError(error)] };
    }
  }

  /**
   * Find the line number for a key or section in the TOML content
   */
  findKeyLine(lines, key, isSection = false, isArrayTable = false) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (isArrayTable) {
      // Look for [[section]]
      const pattern = new RegExp(`^\\s*\\[\\[${escapedKey}\\]\\]\\s*$`);
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          return i + 1;
        }
      }
    } else if (isSection) {
      // Look for [section]
      const pattern = new RegExp(`^\\s*\\[${escapedKey}\\]\\s*$`);
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          return i + 1;
        }
      }
    } else {
      // Look for key = value
      const pattern = new RegExp(`^\\s*${escapedKey}\\s*=`);
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          return i + 1;
        }
      }
    }
    return 1;
  }

  buildNodes(data, parentKey = '', depth = 0, lines = []) {
    const nodes = [];

    for (const [key, value] of Object.entries(data)) {
      const fullKey = parentKey ? `${parentKey}.${key}` : key;

      if (Array.isArray(value)) {
        // Check if array of tables
        if (value.length > 0 && typeof value[0] === 'object' && !Array.isArray(value[0]) && !(value[0] instanceof Date)) {
          const line = this.findKeyLine(lines, fullKey, false, true);
          nodes.push({
            id: `toml-${this.nodeCounter++}-${line}`,
            label: `[[${fullKey}]] (${value.length})`,
            line,
            children: value.map((item, i) => {
              const itemLine = this.findKeyLine(lines, fullKey, false, true);
              return {
                id: `toml-${this.nodeCounter++}-${itemLine}`,
                label: `[${i}]`,
                line: itemLine,
                children: this.buildNodes(item, '', depth + 2, lines)
              };
            })
          });
        } else {
          const line = this.findKeyLine(lines, key);
          const preview = this.formatArrayPreview(value);
          nodes.push({
            id: `toml-${this.nodeCounter++}-${line}`,
            label: `${key} = ${preview}`,
            line,
            children: []
          });
        }
      } else if (value instanceof Date) {
        const line = this.findKeyLine(lines, key);
        nodes.push({
          id: `toml-${this.nodeCounter++}-${line}`,
          label: `${key} = ${value.toISOString()}`,
          line,
          children: []
        });
      } else if (typeof value === 'object' && value !== null) {
        const line = this.findKeyLine(lines, fullKey, true);
        nodes.push({
          id: `toml-${this.nodeCounter++}-${line}`,
          label: `[${fullKey}]`,
          line,
          children: this.buildNodes(value, fullKey, depth + 1, lines)
        });
      } else {
        const line = this.findKeyLine(lines, key);
        const valueStr = this.truncateValue(value);
        nodes.push({
          id: `toml-${this.nodeCounter++}-${line}`,
          label: `${key} = ${valueStr}`,
          line,
          children: []
        });
      }
    }

    return nodes;
  }

  getValueType(value) {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'float';
    }
    if (typeof value === 'string') return 'string';
    return typeof value;
  }

  parseTomlError(error) {
    // smol-toml provides line info in error
    const lineMatch = error.message.match(/line\s*(\d+)/i);
    const colMatch = error.message.match(/col(?:umn)?\s*(\d+)/i);

    // Try to extract a cleaner message
    let message = error.message;

    // Common TOML error patterns
    if (message.includes('Unexpected character')) {
      const charMatch = message.match(/Unexpected character[:\s]*['"]?(.+?)['"]?\s*(at|$)/i);
      if (charMatch) {
        message = `Unexpected character: ${charMatch[1]}`;
      }
    }

    return {
      message,
      line: lineMatch ? parseInt(lineMatch[1], 10) : (error.line || null),
      column: colMatch ? parseInt(colMatch[1], 10) : (error.column || null),
      reason: 'TOML syntax error',
      severity: 'error',
      format: 'toml'
    };
  }

  sortObject(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(item => this.sortObject(item));
    if (obj instanceof Date) return obj;

    return Object.keys(obj)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = this.sortObject(obj[key]);
        return sorted;
      }, {});
  }

  /**
   * Get validation tips based on error
   * @param {object} error - Error object
   * @returns {string[]}
   */
  getValidationTips(error) {
    const tips = [];
    const msg = (error.message || '').toLowerCase();

    if (msg.includes('key')) {
      tips.push('TOML keys can only contain A-Za-z0-9_-');
      tips.push('Use quotes for keys with special characters: "my.key"');
    }
    if (msg.includes('string')) {
      tips.push('Strings must be quoted with single or double quotes');
      tips.push('Use """ for multi-line strings');
    }
    if (msg.includes('date') || msg.includes('time')) {
      tips.push('Dates must be in RFC 3339 format: 2024-01-15T10:30:00Z');
    }
    if (msg.includes('table') || msg.includes('section')) {
      tips.push('Table headers use square brackets: [table.name]');
      tips.push('Array of tables use double brackets: [[array.name]]');
    }

    if (tips.length === 0) {
      tips.push('Ensure proper TOML syntax');
      tips.push('Keys and values must be on the same line');
      tips.push('Use = to separate keys and values');
    }

    return tips;
  }
}

export default TomlFormatter;

import * as TOML from 'smol-toml';
import { BaseFormatter } from './BaseFormatter.js';

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
    const lines = content.split('\n');
    const errors = [];
    // Outline recovery only: validation and formatting still parse the original
    // document strictly. Blank unfinished lines to retain original line numbers.
    for (let attempt = 0; attempt < 8; attempt++) {
      const source = lines.join('\n');
      try {
        const parsed = TOML.parse(source);
        this.nodeCounter = 0;
        const locations = this.buildSourceLocations(source, parsed);
        return { nodes: this.buildNodes(parsed, '', locations), errors };
      } catch (error) {
        if (!errors.length) errors.push(this.parseTomlError(error));
        let index = Math.min(lines.length, error.line || lines.length) - 1;
        while (index >= 0 && !lines[index].trim()) index--;
        if (index < 0) break;
        lines[index] = '';
      }
    }
    return { nodes: [], errors };
  }

  // Scan complete statements, ignoring apparent keys inside strings and arrays.
  // Object identity keeps repeated keys and nested arrays of tables distinct.
  buildSourceLocations(content, parsed) {
    const locations = new WeakMap();
    const arrayIndices = new WeakMap();
    locations.leadingComments = new Map();
    let commentStart = null;
    const mark = (object, key, line) => {
      if (!locations.has(object)) locations.set(object, new Map());
      locations.get(object).set(key, line);
    };
    const keyPath = text => {
      let object = TOML.parse(`${text} = 0`);
      const path = [];
      while (object && typeof object === 'object') {
        const key = Object.keys(object)[0];
        path.push(key);
        object = object[key];
      }
      return path;
    };
    const resolve = (object, path, line, newArray = false) => {
      for (let i = 0; i < path.length; i++) {
        const key = path[i];
        if (!locations.get(object)?.has(key)) mark(object, key, line);
        object = object[key];
        if (Array.isArray(object)) {
          if (newArray && i === path.length - 1) {
            arrayIndices.set(object, (arrayIndices.get(object) ?? -1) + 1);
          }
          const index = arrayIndices.get(object) ?? 0;
          if (!locations.get(object)?.has(index)) mark(object, index, line);
          object = object[index];
        }
      }
      return object;
    };
    let table = parsed;
    let start = 0;
    let quote = null;
    let triple = false;
    let nesting = 0;
    let statement = '';
    const lines = content.split('\n');
    for (let n = 0; n < lines.length; n++) {
      const line = lines[n];
      if (!statement) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) {
          commentStart ??= n + 1;
          continue;
        }
        if (!trimmed) continue;
        start = n + 1;
        if (commentStart !== null) locations.leadingComments.set(start, commentStart);
        commentStart = null;
      }
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quote) {
          if (c === '\\' && quote === '"') { statement += c + (line[++i] ?? ''); continue; }
          if (c === quote && (!triple || line.slice(i, i + 3) === quote.repeat(3))) {
            statement += triple ? quote.repeat(3) : c;
            if (triple) i += 2;
            quote = null;
            triple = false;
          } else statement += c;
        } else {
          if (c === '#') break;
          if (c === '"' || c === "'") {
            quote = c;
            triple = line.slice(i, i + 3) === c.repeat(3);
            statement += triple ? c.repeat(3) : c;
            if (triple) i += 2;
          } else {
            if (c === '[' || c === '{') nesting++;
            if (c === ']' || c === '}') nesting--;
            statement += c;
          }
        }
      }
      if (quote || nesting > 0) { statement += '\n'; continue; }
      const text = statement.trim();
      statement = '';
      if (!text) continue;
      if (text.startsWith('[')) {
        const array = text.startsWith('[[');
        const path = keyPath(text.slice(array ? 2 : 1, array ? -2 : -1));
        table = resolve(parsed, path, start, array);
        // Explicit headers supersede the location of an implicit parent table.
        mark(table, '$header', start);
      } else {
        // Locate the assignment operator outside a quoted key.
        let keyQuote = null;
        let equals = 0;
        for (; equals < text.length; equals++) {
          const c = text[equals];
          if (keyQuote && c === '\\' && keyQuote === '"') { equals++; continue; }
          if (c === keyQuote) keyQuote = null;
          else if (!keyQuote && (c === '"' || c === "'")) keyQuote = c;
          else if (!keyQuote && c === '=') break;
        }
        resolve(table, keyPath(text.slice(0, equals)), start);
      }
    }
    return locations;
  }

  buildNodes(data, parentKey = '', locations, fallbackLine = 1) {
    return Object.entries(data).map(([key, value]) => {
      const fullKey = parentKey ? `${parentKey}.${key}` : key;
      const object = value && typeof value === 'object' && !(value instanceof Date);
      const line = (object && locations.get(value)?.get('$header')) || locations.get(data)?.get(key) || fallbackLine;
      const node = { id: `toml-${this.nodeCounter++}-${line}`, line, selectionLine: locations.leadingComments.get(line) || line, children: [] };
      if (Array.isArray(value)) {
        if (value.length && value[0] && typeof value[0] === 'object' && !(value[0] instanceof Date) && !Array.isArray(value[0])) {
          node.label = `[[${fullKey}]] (${value.length})`;
          node.isArrayGroup = true;
          node.children = value.map((item, index) => {
            const itemLine = locations.get(value)?.get(index) || line;
            return {
              id: `toml-${this.nodeCounter++}-${itemLine}`,
              label: `[${index}]`, line: itemLine, selectionLine: locations.leadingComments.get(itemLine) || itemLine,
              children: this.buildNodes(item, fullKey, locations, itemLine)
            };
          });
        } else node.label = `${key} = ${this.formatArrayPreview(value)}`;
      } else if (value instanceof Date) node.label = `${key} = ${value.toISOString()}`;
      else if (object) {
        node.label = `[${fullKey}]`;
        node.children = this.buildNodes(value, fullKey, locations, line);
      } else node.label = `${key} = ${this.truncateValue(value)}`;
      return node;
    }).sort((a, b) => a.line - b.line);
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

import { BaseFormatter } from './BaseFormatter';

/**
 * JSON format handler
 * Provides validation, formatting, and structure building for JSON
 */
export class JsonFormatter extends BaseFormatter {
  constructor() {
    super('json');
    this.extensions = ['.json', '.jsonc'];
    this.mimeTypes = ['application/json', 'text/json'];
  }

  detect(content) {
    const trimmed = content.trim();

    // Must start with { or [
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return { match: false, confidence: 0 };
    }

    // Must end with } or ]
    if (!trimmed.endsWith('}') && !trimmed.endsWith(']')) {
      return { match: false, confidence: 0 };
    }

    // Try to parse
    try {
      JSON.parse(trimmed);
      return { match: true, confidence: 1 };
    } catch {
      // Might still be JSON with syntax errors
      // Check for JSON-like patterns
      const jsonPatterns = [
        /"[^"]*"\s*:/,      // "key":
        /:\s*"[^"]*"/,       // : "value"
        /:\s*\d+/,           // : 123
        /:\s*(true|false)/,  // : true/false
        /:\s*null/,          // : null
      ];

      const matches = jsonPatterns.filter(p => p.test(content)).length;
      if (matches >= 2) {
        return { match: true, confidence: 0.7 };
      }

      return { match: false, confidence: 0 };
    }
  }

  validate(content) {
    try {
      JSON.parse(content);
      return { valid: true, errors: [], warnings: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [this.parseJsonError(error, content)],
        warnings: []
      };
    }
  }

  format(content, options = {}) {
    const { indent = 2, sortKeys = false } = options;

    try {
      let parsed = JSON.parse(content);

      if (sortKeys) {
        parsed = this.sortObject(parsed);
      }

      const formatted = JSON.stringify(parsed, null, indent);
      return { formatted, errors: [] };
    } catch (error) {
      return { formatted: null, errors: [this.parseJsonError(error, content)] };
    }
  }

  minify(content) {
    try {
      const parsed = JSON.parse(content);
      const minified = JSON.stringify(parsed);
      return { minified, errors: [] };
    } catch (error) {
      return { minified: null, errors: [this.parseJsonError(error, content)] };
    }
  }

  parse(content) {
    return JSON.parse(content);
  }

  stringify(data, options = {}) {
    const { indent = 2, minify = false } = options;
    return minify ? JSON.stringify(data) : JSON.stringify(data, null, indent);
  }

  buildStructure(content) {
    try {
      const parsed = JSON.parse(content);
      return { nodes: this.buildNodes(parsed), errors: [] };
    } catch (error) {
      return { nodes: [], errors: [this.parseJsonError(error, content)] };
    }
  }

  buildNodes(data, key = null, depth = 0) {
    const nodes = [];

    if (Array.isArray(data)) {
      const node = {
        key: key || 'Array',
        type: 'array',
        length: data.length,
        depth,
        children: data.map((item, i) =>
          this.buildNodes(item, `[${i}]`, depth + 1)
        ).flat()
      };
      nodes.push(node);
    } else if (typeof data === 'object' && data !== null) {
      const entries = Object.entries(data);
      if (key !== null) {
        nodes.push({
          key,
          type: 'object',
          depth,
          children: entries.map(([k, v]) =>
            this.buildNodes(v, k, depth + 1)
          ).flat()
        });
      } else {
        entries.forEach(([k, v]) => {
          nodes.push(...this.buildNodes(v, k, depth));
        });
      }
    } else {
      nodes.push({
        key: key || 'value',
        type: typeof data,
        value: this.truncateValue(data),
        depth
      });
    }

    return nodes;
  }

  parseJsonError(error, content) {
    const match = error.message.match(/position (\d+)/i);
    let line = null;
    let column = null;

    if (match) {
      const position = parseInt(match[1], 10);
      const lines = content.substring(0, position).split('\n');
      line = lines.length;
      column = lines[lines.length - 1].length + 1;
    }

    return {
      message: error.message,
      line,
      column,
      severity: 'error',
      format: 'json'
    };
  }

  sortObject(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(item => this.sortObject(item));

    return Object.keys(obj)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = this.sortObject(obj[key]);
        return sorted;
      }, {});
  }
}

export default JsonFormatter;

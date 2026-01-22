import yaml from 'js-yaml';
import { BaseFormatter } from './BaseFormatter';

/**
 * YAML format handler
 * Provides validation, formatting, and structure building for YAML
 */
export class YamlFormatter extends BaseFormatter {
  constructor() {
    super('yaml');
    this.extensions = ['.yaml', '.yml'];
    this.mimeTypes = ['application/x-yaml', 'text/yaml', 'text/x-yaml'];
  }

  detect(content) {
    const trimmed = content.trim();

    // Negative patterns - definitely not YAML
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      // Could be JSON
      try {
        JSON.parse(trimmed);
        return { match: false, confidence: 0 };
      } catch {
        // Invalid JSON, might still be YAML-ish
      }
    }
    if (trimmed.startsWith('<')) return { match: false, confidence: 0 };

    // YAML indicators
    const yamlPatterns = [
      /^---\s*$/m,                      // Document start marker
      /^[a-zA-Z_][a-zA-Z0-9_-]*:\s/m,   // Key: value pattern
      /^\s*-\s+\S/m,                    // List item
      /^[a-zA-Z_]+:\s*$/m,              // Key with no value (object start)
      /^\s*[a-zA-Z_]+:\s*\|/m,          // Multi-line string (literal)
      /^\s*[a-zA-Z_]+:\s*>/m,           // Multi-line string (folded)
      /^\.\.\.$/m,                      // Document end marker
      /^#.*/m,                          // Comments
    ];

    // Check for TOML patterns that would disqualify YAML
    const tomlPatterns = [
      /^\[[a-zA-Z_][\w.-]*\]\s*$/m,     // TOML section header
      /^\[\[[a-zA-Z_][\w.-]*\]\]\s*$/m, // TOML array of tables
    ];

    const tomlMatches = tomlPatterns.filter(p => p.test(content)).length;
    if (tomlMatches > 0) {
      return { match: false, confidence: 0 };
    }

    const matches = yamlPatterns.filter(p => p.test(content)).length;

    // Need at least 1 match to consider it YAML
    if (matches >= 1) {
      return {
        match: true,
        confidence: Math.min(0.5 + (matches * 0.1), 0.95)
      };
    }

    return { match: false, confidence: 0 };
  }

  validate(content) {
    const warnings = [];

    try {
      yaml.load(content, {
        schema: yaml.DEFAULT_SCHEMA,
        onWarning: (warning) => {
          warnings.push(this.createWarning(warning.message, {
            line: warning.mark?.line + 1,
            column: warning.mark?.column + 1
          }));
        }
      });
      return { valid: true, errors: [], warnings };
    } catch (error) {
      return {
        valid: false,
        errors: [this.parseYamlError(error)],
        warnings
      };
    }
  }

  format(content, options = {}) {
    const {
      indent = 2,
      lineWidth = 80,
      noRefs = true,
      sortKeys = false,
      quotingType = '"',
      forceQuotes = false
    } = options;

    try {
      const parsed = yaml.load(content);
      const formatted = yaml.dump(parsed, {
        indent,
        lineWidth,
        noRefs,
        sortKeys,
        quotingType,
        forceQuotes,
        noCompatMode: true
      });
      return { formatted, errors: [] };
    } catch (error) {
      return { formatted: null, errors: [this.parseYamlError(error)] };
    }
  }

  parse(content) {
    return yaml.load(content);
  }

  stringify(data, options = {}) {
    const {
      indent = 2,
      lineWidth = 80,
      noRefs = true,
      sortKeys = false
    } = options;

    return yaml.dump(data, {
      indent,
      lineWidth,
      noRefs,
      sortKeys,
      noCompatMode: true
    });
  }

  buildStructure(content) {
    try {
      const parsed = yaml.load(content);
      const lines = content.split('\n');
      this.nodeCounter = 0;
      return { nodes: this.buildNodes(parsed, null, 0, lines, 1), errors: [] };
    } catch (error) {
      return { nodes: [], errors: [this.parseYamlError(error)] };
    }
  }

  /**
   * Find the line number for a key in the YAML content
   */
  findKeyLine(lines, key, startLine = 0) {
    const keyPattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`);
    const arrayPattern = new RegExp(`^\\s*-\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`);

    for (let i = startLine; i < lines.length; i++) {
      if (keyPattern.test(lines[i]) || arrayPattern.test(lines[i])) {
        return i + 1; // 1-indexed
      }
    }
    // Also check for array item markers
    if (key.match(/^\[\d+\]$/)) {
      let arrayIndex = 0;
      for (let i = startLine; i < lines.length; i++) {
        if (/^\s*-\s/.test(lines[i])) {
          const targetIndex = parseInt(key.slice(1, -1));
          if (arrayIndex === targetIndex) {
            return i + 1;
          }
          arrayIndex++;
        }
      }
    }
    return startLine + 1;
  }

  buildNodes(data, key = null, depth = 0, lines = [], startLine = 1) {
    const nodes = [];

    if (Array.isArray(data)) {
      const line = key ? this.findKeyLine(lines, key, startLine - 1) : startLine;
      const node = {
        id: `yaml-${this.nodeCounter++}-${line}`,
        label: key ? `${key} [ ] (${data.length})` : `[ ] (${data.length})`,
        line,
        children: data.map((item, i) =>
          this.buildNodes(item, `[${i}]`, depth + 1, lines, line)
        ).flat()
      };
      nodes.push(node);
    } else if (typeof data === 'object' && data !== null) {
      const entries = Object.entries(data);
      if (key !== null) {
        const line = this.findKeyLine(lines, key, startLine - 1);
        nodes.push({
          id: `yaml-${this.nodeCounter++}-${line}`,
          label: `${key} { }`,
          line,
          children: entries.map(([k, v]) =>
            this.buildNodes(v, k, depth + 1, lines, line)
          ).flat()
        });
      } else {
        entries.forEach(([k, v]) => {
          nodes.push(...this.buildNodes(v, k, depth, lines, startLine));
        });
      }
    } else {
      const line = key ? this.findKeyLine(lines, key, startLine - 1) : startLine;
      const valueStr = this.truncateValue(data);
      nodes.push({
        id: `yaml-${this.nodeCounter++}-${line}`,
        label: key ? `${key}: ${valueStr}` : valueStr,
        line,
        children: []
      });
    }

    return nodes;
  }

  getValueType(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'float';
    }
    return typeof value;
  }

  parseYamlError(error) {
    return {
      message: error.message,
      line: error.mark?.line != null ? error.mark.line + 1 : null,
      column: error.mark?.column != null ? error.mark.column + 1 : null,
      reason: error.reason || 'YAML syntax error',
      snippet: error.mark?.snippet || null,
      severity: 'error',
      format: 'yaml'
    };
  }

  /**
   * Get validation tips based on error
   * @param {object} error - Error object
   * @returns {string[]}
   */
  getValidationTips(error) {
    const tips = [];
    const msg = (error.message || '').toLowerCase();

    if (msg.includes('indent')) {
      tips.push('YAML uses spaces for indentation, not tabs');
      tips.push('Ensure consistent indentation (typically 2 spaces)');
    }
    if (msg.includes('mapping')) {
      tips.push('Check that keys are followed by a colon and space');
      tips.push('Ensure proper key: value format');
    }
    if (msg.includes('duplicate')) {
      tips.push('Remove duplicate keys in the same mapping');
    }
    if (msg.includes('anchor') || msg.includes('alias')) {
      tips.push('Check anchor (&) and alias (*) references');
    }
    if (msg.includes('unexpected')) {
      tips.push('Check for missing colons after keys');
      tips.push('Ensure strings with special characters are quoted');
    }

    if (tips.length === 0) {
      tips.push('Ensure proper YAML syntax');
      tips.push('Check indentation consistency');
      tips.push('Verify all strings are properly quoted if they contain special characters');
    }

    return tips;
  }
}

export default YamlFormatter;

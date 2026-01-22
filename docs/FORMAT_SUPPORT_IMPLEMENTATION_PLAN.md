# Format Support Implementation Plan

## YAML, TOML Validation/Formatting & Format Conversions

This document outlines the comprehensive implementation plan for adding YAML and TOML support, along with bidirectional conversions between JSON, XML, YAML, and TOML formats in TidyCode.

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Proposed Features](#proposed-features)
3. [Architecture Overview](#architecture-overview)
4. [Implementation Phases](#implementation-phases)
5. [Technical Specifications](#technical-specifications)
6. [UI/UX Design](#uiux-design)
7. [Dependencies](#dependencies)
8. [File Modifications](#file-modifications)
9. [Testing Strategy](#testing-strategy)

---

## Current State Analysis

### Existing Format Support

| Format | Detection | Validation | Formatting | Structure View | Syntax Highlighting |
|--------|-----------|------------|------------|----------------|---------------------|
| JSON | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| XML | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| YAML | ⚠️ Partial | ❌ None | ❌ None | ❌ None | ⚠️ Prism only |
| TOML | ⚠️ Partial | ❌ None | ❌ None | ❌ None | ⚠️ Prism only |

### Current Architecture Pattern

```
Detection → Validation → Formatting → Error Display → Structure Parsing
    ↓           ↓            ↓             ↓              ↓
looksLike*()  parse()    stringify()   buildError()   buildStructure()
```

---

## Proposed Features

### 1. YAML Support
- **Validation**: Syntax checking with detailed error messages
- **Formatting**: Consistent indentation and style
- **Structure View**: Hierarchical tree of keys/values
- **Error Detection**: Line/column positions for syntax errors

### 2. TOML Support
- **Validation**: Syntax checking with detailed error messages
- **Formatting**: Consistent formatting with section ordering
- **Structure View**: Tables and key/value hierarchy
- **Error Detection**: Line/column positions for syntax errors

### 3. Format Conversions

| From → To | JSON | XML | YAML | TOML |
|-----------|------|-----|------|------|
| **JSON** | - | ✅ | ✅ | ✅ |
| **XML** | ✅ | - | ✅ | ✅ |
| **YAML** | ✅ | ✅ | - | ✅ |
| **TOML** | ✅ | ✅ | ✅ | - |

### 4. Enhanced Features
- **Auto-detection** of format from content
- **Minification** for JSON/XML
- **Schema inference** from data
- **Configurable formatting options** (indent size, quote style)

---

## Architecture Overview

### Component Structure

```
src/
├── services/
│   └── formatters/
│       ├── index.js              # Unified format service
│       ├── FormatDetector.js     # Content type detection
│       ├── JsonFormatter.js      # JSON operations
│       ├── XmlFormatter.js       # XML operations
│       ├── YamlFormatter.js      # YAML operations
│       ├── TomlFormatter.js      # TOML operations
│       └── FormatConverter.js    # Cross-format conversion
├── utils/
│   └── formatUtils.js            # Shared utilities
└── components/
    ├── FormatToolbar.jsx         # Format action buttons
    ├── ConversionModal.jsx       # Format conversion UI
    └── FormatOptionsPanel.jsx    # Settings panel
```

### Unified Format Interface

```javascript
// src/services/formatters/FormatService.js

export class FormatService {
  constructor() {
    this.formatters = new Map([
      ['json', new JsonFormatter()],
      ['xml', new XmlFormatter()],
      ['yaml', new YamlFormatter()],
      ['toml', new TomlFormatter()]
    ]);
  }

  // Core operations
  detect(content)                    // → { format, confidence }
  validate(content, format)          // → { valid, errors[] }
  format(content, format, options)   // → { formatted, errors[] }
  minify(content, format)            // → { minified, errors[] }

  // Conversions
  convert(content, fromFormat, toFormat, options) // → { converted, errors[] }

  // Structure
  buildStructure(content, format)    // → { nodes[], errors[] }
}
```

---

## Implementation Phases

### Phase 1: Core Infrastructure

**Goal**: Create unified format service architecture

#### Tasks:
- [ ] Create `src/services/formatters/` directory structure
- [ ] Implement `FormatService` base class with unified interface
- [ ] Create `FormatDetector` for content-based format detection
- [ ] Migrate existing JSON formatting to `JsonFormatter` class
- [ ] Migrate existing XML formatting to `XmlFormatter` class
- [ ] Add comprehensive unit tests for existing functionality

#### Files to Create:
```
src/services/formatters/
├── index.js
├── FormatService.js
├── FormatDetector.js
├── BaseFormatter.js
├── JsonFormatter.js
└── XmlFormatter.js
```

---

### Phase 2: YAML Support

**Goal**: Full YAML validation, formatting, and structure view

#### Tasks:
- [ ] Add `js-yaml` library dependency
- [ ] Implement `YamlFormatter` class
- [ ] Add `looksLikeYAML()` detection function
- [ ] Implement `validateYAML()` with error details
- [ ] Implement `formatYAML()` with options
- [ ] Implement `buildYAMLStructure()` for Structure View
- [ ] Add `buildYAMLErrorDetails()` for error panel
- [ ] Add CodeMirror YAML language extension
- [ ] Update `formatContent()` to handle YAML
- [ ] Update Structure View to support YAML

#### YAML Formatter Implementation:

```javascript
// src/services/formatters/YamlFormatter.js

import yaml from 'js-yaml';

export class YamlFormatter extends BaseFormatter {
  constructor() {
    super('yaml');
    this.extensions = ['.yaml', '.yml'];
    this.mimeTypes = ['application/x-yaml', 'text/yaml'];
  }

  detect(content) {
    const trimmed = content.trim();

    // YAML indicators
    const yamlPatterns = [
      /^---\s*$/m,                    // Document start marker
      /^[a-zA-Z_][a-zA-Z0-9_]*:\s/m,  // Key: value pattern
      /^\s*-\s+\S/m,                  // List item
      /^[a-zA-Z_]+:\s*$/m,            // Key with no value (object start)
      /^\s*[a-zA-Z_]+:\s*\|/m,        // Multi-line string
      /^\s*[a-zA-Z_]+:\s*>/m,         // Folded string
    ];

    // Negative patterns (not YAML)
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return { match: false };
    if (trimmed.startsWith('<')) return { match: false };
    if (trimmed.startsWith('[') && trimmed.includes(']=')) return { match: false }; // TOML array

    const matches = yamlPatterns.filter(p => p.test(content)).length;
    return {
      match: matches >= 2,
      confidence: Math.min(matches / yamlPatterns.length, 1)
    };
  }

  validate(content) {
    try {
      yaml.load(content, {
        schema: yaml.DEFAULT_SCHEMA,
        onWarning: (warning) => this.warnings.push(warning)
      });
      return { valid: true, errors: [], warnings: this.warnings };
    } catch (error) {
      return {
        valid: false,
        errors: [this.parseYamlError(error)],
        warnings: this.warnings
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

  buildStructure(content) {
    try {
      const parsed = yaml.load(content);
      return { nodes: this.buildNodes(parsed, 0), errors: [] };
    } catch (error) {
      return { nodes: [], errors: [this.parseYamlError(error)] };
    }
  }

  buildNodes(data, depth, key = null) {
    const nodes = [];

    if (Array.isArray(data)) {
      const node = {
        key: key || 'Array',
        type: 'array',
        length: data.length,
        children: data.map((item, i) =>
          this.buildNodes(item, depth + 1, `[${i}]`)
        ).flat()
      };
      nodes.push(node);
    } else if (typeof data === 'object' && data !== null) {
      const entries = Object.entries(data);
      if (key) {
        nodes.push({
          key,
          type: 'object',
          children: entries.map(([k, v]) =>
            this.buildNodes(v, depth + 1, k)
          ).flat()
        });
      } else {
        entries.forEach(([k, v]) => {
          nodes.push(...this.buildNodes(v, depth, k));
        });
      }
    } else {
      nodes.push({
        key: key || 'value',
        type: typeof data,
        value: this.truncateValue(data)
      });
    }

    return nodes;
  }

  parseYamlError(error) {
    return {
      message: error.message,
      line: error.mark?.line + 1 || null,
      column: error.mark?.column + 1 || null,
      reason: error.reason || 'YAML syntax error',
      snippet: error.mark?.snippet || null
    };
  }
}
```

#### YAML Error Details Builder:

```javascript
// In TidyCode.jsx or separate file

function buildYAMLErrorDetails(content, error) {
  const lines = content.split('\n');
  const errorLine = error.line || 1;

  // Get context lines
  const contextStart = Math.max(0, errorLine - 2);
  const contextEnd = Math.min(lines.length, errorLine + 2);
  const contextLines = [];

  for (let i = contextStart; i < contextEnd; i++) {
    contextLines.push({
      lineNum: i + 1,
      text: lines[i] || '',
      isError: i + 1 === errorLine,
      column: i + 1 === errorLine ? error.column : null
    });
  }

  return {
    type: 'YAML',
    message: error.message,
    line: errorLine,
    column: error.column,
    allErrors: [{
      line: errorLine,
      column: error.column,
      message: error.reason || error.message,
      isPrimary: true,
      severity: 'error'
    }],
    context: contextLines,
    tips: getYAMLValidationTips(error)
  };
}

function getYAMLValidationTips(error) {
  const tips = [];
  const msg = error.message.toLowerCase();

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

  // Default tips
  if (tips.length === 0) {
    tips.push('Ensure proper YAML syntax');
    tips.push('Check indentation consistency');
    tips.push('Verify all strings are properly quoted if they contain special characters');
  }

  return tips;
}
```

---

### Phase 3: TOML Support

**Goal**: Full TOML validation, formatting, and structure view

#### Tasks:
- [ ] Add `@iarna/toml` library dependency
- [ ] Implement `TomlFormatter` class
- [ ] Add `looksLikeTOML()` detection function
- [ ] Implement `validateTOML()` with error details
- [ ] Implement `formatTOML()` with options
- [ ] Implement `buildTOMLStructure()` for Structure View
- [ ] Add `buildTOMLErrorDetails()` for error panel
- [ ] Add CodeMirror TOML language extension (or custom highlighting)
- [ ] Update `formatContent()` to handle TOML
- [ ] Update Structure View to support TOML

#### TOML Formatter Implementation:

```javascript
// src/services/formatters/TomlFormatter.js

import TOML from '@iarna/toml';

export class TomlFormatter extends BaseFormatter {
  constructor() {
    super('toml');
    this.extensions = ['.toml'];
    this.mimeTypes = ['application/toml'];
  }

  detect(content) {
    const trimmed = content.trim();

    // TOML indicators
    const tomlPatterns = [
      /^\[[\w.-]+\]\s*$/m,              // [section] headers
      /^\[\[[\w.-]+\]\]\s*$/m,          // [[array.of.tables]]
      /^[a-zA-Z_][\w-]*\s*=/m,          // key = value
      /=\s*"""/,                         // Multi-line strings
      /=\s*'''/,                         // Literal multi-line strings
      /=\s*\d{4}-\d{2}-\d{2}/,          // Date values
      /=\s*\[\s*$/m,                     // Array values
    ];

    // Negative patterns
    if (trimmed.startsWith('{') || trimmed.startsWith('<')) return { match: false };
    if (trimmed.startsWith('---')) return { match: false }; // YAML

    const matches = tomlPatterns.filter(p => p.test(content)).length;

    // Strong indicator: section headers
    const hasSections = /^\[[\w.-]+\]/m.test(content);

    return {
      match: matches >= 2 || hasSections,
      confidence: Math.min((matches + (hasSections ? 2 : 0)) / 6, 1)
    };
  }

  validate(content) {
    try {
      TOML.parse(content);
      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [this.parseTomlError(error)]
      };
    }
  }

  format(content, options = {}) {
    const {
      indent = 2,
      newlineAfterSection = true,
      sortKeys = false
    } = options;

    try {
      const parsed = TOML.parse(content);

      // Sort keys if requested
      const toStringify = sortKeys ? this.sortObject(parsed) : parsed;

      let formatted = TOML.stringify(toStringify);

      // Post-process formatting
      if (newlineAfterSection) {
        formatted = formatted.replace(/(\])\n([^\n])/g, '$1\n\n$2');
      }

      return { formatted, errors: [] };
    } catch (error) {
      return { formatted: null, errors: [this.parseTomlError(error)] };
    }
  }

  buildStructure(content) {
    try {
      const parsed = TOML.parse(content);
      return { nodes: this.buildNodes(parsed), errors: [] };
    } catch (error) {
      return { nodes: [], errors: [this.parseTomlError(error)] };
    }
  }

  buildNodes(data, parentKey = '') {
    const nodes = [];

    for (const [key, value] of Object.entries(data)) {
      const fullKey = parentKey ? `${parentKey}.${key}` : key;

      if (Array.isArray(value)) {
        // Check if array of tables
        if (value.length > 0 && typeof value[0] === 'object' && !Array.isArray(value[0])) {
          nodes.push({
            key: `[[${fullKey}]]`,
            type: 'table-array',
            children: value.map((item, i) => ({
              key: `[${i}]`,
              type: 'table',
              children: this.buildNodes(item, '')
            }))
          });
        } else {
          nodes.push({
            key,
            type: 'array',
            value: this.formatArrayPreview(value)
          });
        }
      } else if (typeof value === 'object' && value !== null) {
        // Check if it's a date
        if (value instanceof Date) {
          nodes.push({
            key,
            type: 'datetime',
            value: value.toISOString()
          });
        } else {
          nodes.push({
            key: `[${fullKey}]`,
            type: 'table',
            children: this.buildNodes(value, fullKey)
          });
        }
      } else {
        nodes.push({
          key,
          type: typeof value,
          value: this.truncateValue(value)
        });
      }
    }

    return nodes;
  }

  parseTomlError(error) {
    // @iarna/toml provides line info in error
    const lineMatch = error.message.match(/line (\d+)/i);
    const colMatch = error.message.match(/col(?:umn)? (\d+)/i);

    return {
      message: error.message,
      line: lineMatch ? parseInt(lineMatch[1]) : null,
      column: colMatch ? parseInt(colMatch[1]) : null,
      reason: 'TOML syntax error'
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
```

---

### Phase 4: Format Conversions

**Goal**: Bidirectional conversion between all supported formats

#### Tasks:
- [ ] Implement `FormatConverter` class
- [ ] Add JSON → YAML conversion
- [ ] Add YAML → JSON conversion
- [ ] Add JSON → TOML conversion
- [ ] Add TOML → JSON conversion
- [ ] Add JSON → XML conversion
- [ ] Add XML → JSON conversion
- [ ] Add YAML → XML conversion
- [ ] Add XML → YAML conversion
- [ ] Add YAML → TOML conversion
- [ ] Add TOML → YAML conversion
- [ ] Add XML → TOML conversion
- [ ] Add TOML → XML conversion
- [ ] Create ConversionModal UI component
- [ ] Add conversion options (pretty print, minify, etc.)

#### Format Converter Implementation:

```javascript
// src/services/formatters/FormatConverter.js

import { JsonFormatter } from './JsonFormatter';
import { XmlFormatter } from './XmlFormatter';
import { YamlFormatter } from './YamlFormatter';
import { TomlFormatter } from './TomlFormatter';

export class FormatConverter {
  constructor() {
    this.formatters = {
      json: new JsonFormatter(),
      xml: new XmlFormatter(),
      yaml: new YamlFormatter(),
      toml: new TomlFormatter()
    };
  }

  /**
   * Convert content from one format to another
   * @param {string} content - Source content
   * @param {string} fromFormat - Source format (json|xml|yaml|toml)
   * @param {string} toFormat - Target format (json|xml|yaml|toml)
   * @param {object} options - Conversion options
   * @returns {{ converted: string, errors: array }}
   */
  convert(content, fromFormat, toFormat, options = {}) {
    if (fromFormat === toFormat) {
      return { converted: content, errors: [] };
    }

    try {
      // Step 1: Parse source format to intermediate object
      const parsed = this.parse(content, fromFormat);

      // Step 2: Convert intermediate to target format
      const converted = this.stringify(parsed, toFormat, options);

      return { converted, errors: [] };
    } catch (error) {
      return {
        converted: null,
        errors: [{
          message: `Conversion failed: ${error.message}`,
          phase: error.phase || 'unknown'
        }]
      };
    }
  }

  /**
   * Parse content to JavaScript object
   */
  parse(content, format) {
    switch (format) {
      case 'json':
        return JSON.parse(content);

      case 'yaml':
        return require('js-yaml').load(content);

      case 'toml':
        return require('@iarna/toml').parse(content);

      case 'xml':
        return this.xmlToObject(content);

      default:
        throw new Error(`Unsupported source format: ${format}`);
    }
  }

  /**
   * Convert JavaScript object to target format string
   */
  stringify(data, format, options = {}) {
    const { indent = 2, minify = false } = options;

    switch (format) {
      case 'json':
        return minify
          ? JSON.stringify(data)
          : JSON.stringify(data, null, indent);

      case 'yaml':
        return require('js-yaml').dump(data, {
          indent,
          lineWidth: options.lineWidth || 80,
          noRefs: true
        });

      case 'toml':
        return require('@iarna/toml').stringify(data);

      case 'xml':
        return this.objectToXml(data, options);

      default:
        throw new Error(`Unsupported target format: ${format}`);
    }
  }

  /**
   * Convert XML string to JavaScript object
   */
  xmlToObject(xml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      const error = new Error('Invalid XML');
      error.phase = 'parse';
      throw error;
    }

    return this.nodeToObject(doc.documentElement);
  }

  nodeToObject(node) {
    const obj = {};

    // Handle attributes
    if (node.attributes && node.attributes.length > 0) {
      obj['@attributes'] = {};
      for (const attr of node.attributes) {
        obj['@attributes'][attr.name] = attr.value;
      }
    }

    // Handle child nodes
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent.trim();
        if (text) {
          if (Object.keys(obj).length === 0) {
            return this.parseValue(text);
          }
          obj['#text'] = this.parseValue(text);
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const childObj = this.nodeToObject(child);
        const tagName = child.tagName;

        if (obj[tagName]) {
          // Convert to array if multiple elements with same tag
          if (!Array.isArray(obj[tagName])) {
            obj[tagName] = [obj[tagName]];
          }
          obj[tagName].push(childObj);
        } else {
          obj[tagName] = childObj;
        }
      }
    }

    return obj;
  }

  /**
   * Convert JavaScript object to XML string
   */
  objectToXml(data, options = {}) {
    const {
      rootName = 'root',
      indent = 2,
      declaration = true
    } = options;

    let xml = declaration ? '<?xml version="1.0" encoding="UTF-8"?>\n' : '';

    if (typeof data === 'object' && data !== null) {
      const keys = Object.keys(data);
      if (keys.length === 1 && !keys[0].startsWith('@')) {
        // Single root element
        xml += this.objectToXmlNode(keys[0], data[keys[0]], 0, indent);
      } else {
        // Wrap in root element
        xml += this.objectToXmlNode(rootName, data, 0, indent);
      }
    } else {
      xml += this.objectToXmlNode(rootName, data, 0, indent);
    }

    return xml;
  }

  objectToXmlNode(tagName, value, depth, indentSize) {
    const indent = ' '.repeat(depth * indentSize);
    const childIndent = ' '.repeat((depth + 1) * indentSize);

    if (value === null || value === undefined) {
      return `${indent}<${tagName}/>\n`;
    }

    if (Array.isArray(value)) {
      return value
        .map(item => this.objectToXmlNode(tagName, item, depth, indentSize))
        .join('');
    }

    if (typeof value === 'object') {
      let xml = `${indent}<${tagName}`;
      let children = '';
      let textContent = '';

      for (const [key, val] of Object.entries(value)) {
        if (key === '@attributes') {
          for (const [attrName, attrVal] of Object.entries(val)) {
            xml += ` ${attrName}="${this.escapeXml(String(attrVal))}"`;
          }
        } else if (key === '#text') {
          textContent = this.escapeXml(String(val));
        } else {
          children += this.objectToXmlNode(key, val, depth + 1, indentSize);
        }
      }

      if (children) {
        xml += `>\n${children}${indent}</${tagName}>\n`;
      } else if (textContent) {
        xml += `>${textContent}</${tagName}>\n`;
      } else {
        xml += '/>\n';
      }

      return xml;
    }

    // Primitive value
    const text = this.escapeXml(String(value));
    return `${indent}<${tagName}>${text}</${tagName}>\n`;
  }

  escapeXml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  parseValue(str) {
    // Try to parse as number
    if (/^-?\d+$/.test(str)) return parseInt(str, 10);
    if (/^-?\d*\.\d+$/.test(str)) return parseFloat(str);

    // Try to parse as boolean
    if (str === 'true') return true;
    if (str === 'false') return false;

    // Return as string
    return str;
  }

  /**
   * Get available conversion targets for a source format
   */
  getConversionTargets(fromFormat) {
    const allFormats = ['json', 'xml', 'yaml', 'toml'];
    return allFormats.filter(f => f !== fromFormat);
  }
}

export const formatConverter = new FormatConverter();
```

---

### Phase 5: UI Integration

**Goal**: Integrate new format support into TidyCode UI

#### Tasks:
- [ ] Update Format button to support all formats
- [ ] Create "Convert to..." dropdown menu
- [ ] Add format indicator in tab/status bar
- [ ] Update Structure View for YAML/TOML
- [ ] Add format-specific validation tips
- [ ] Create format options panel in settings
- [ ] Add keyboard shortcuts for conversions

#### Conversion Modal Component:

```jsx
// src/components/ConversionModal.jsx

import React, { useState, useCallback } from 'react';
import { X, ArrowRight, FileJson, FileCode, FileText, Settings } from 'lucide-react';
import { formatConverter } from '../services/formatters/FormatConverter';

const FORMAT_ICONS = {
  json: FileJson,
  xml: FileCode,
  yaml: FileText,
  toml: FileText
};

const FORMAT_LABELS = {
  json: 'JSON',
  xml: 'XML',
  yaml: 'YAML',
  toml: 'TOML'
};

export function ConversionModal({
  isOpen,
  onClose,
  sourceContent,
  sourceFormat,
  onConvert
}) {
  const [targetFormat, setTargetFormat] = useState(null);
  const [options, setOptions] = useState({
    indent: 2,
    minify: false,
    declaration: true,  // XML declaration
    rootName: 'root'    // XML root element name
  });
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [showOptions, setShowOptions] = useState(false);

  const availableTargets = formatConverter.getConversionTargets(sourceFormat);

  const handleTargetSelect = useCallback((format) => {
    setTargetFormat(format);
    setError(null);

    // Generate preview
    const result = formatConverter.convert(sourceContent, sourceFormat, format, options);
    if (result.errors.length > 0) {
      setError(result.errors[0].message);
      setPreview(null);
    } else {
      setPreview(result.converted);
    }
  }, [sourceContent, sourceFormat, options]);

  const handleConvert = useCallback(() => {
    if (preview) {
      onConvert(preview, targetFormat);
      onClose();
    }
  }, [preview, targetFormat, onConvert, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="conversion-modal">
        <div className="modal-header">
          <h2>Convert Format</h2>
          <button onClick={onClose} className="close-btn">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Format Selection */}
          <div className="format-selection">
            <div className="source-format">
              <span className="label">From</span>
              <div className="format-badge current">
                {React.createElement(FORMAT_ICONS[sourceFormat], { size: 20 })}
                <span>{FORMAT_LABELS[sourceFormat]}</span>
              </div>
            </div>

            <ArrowRight size={24} className="arrow" />

            <div className="target-formats">
              <span className="label">To</span>
              <div className="format-options">
                {availableTargets.map(format => {
                  const Icon = FORMAT_ICONS[format];
                  return (
                    <button
                      key={format}
                      className={`format-badge ${targetFormat === format ? 'selected' : ''}`}
                      onClick={() => handleTargetSelect(format)}
                    >
                      <Icon size={20} />
                      <span>{FORMAT_LABELS[format]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Options Toggle */}
          <button
            className="options-toggle"
            onClick={() => setShowOptions(!showOptions)}
          >
            <Settings size={16} />
            <span>Conversion Options</span>
          </button>

          {/* Options Panel */}
          {showOptions && (
            <div className="options-panel">
              <label>
                <span>Indentation</span>
                <select
                  value={options.indent}
                  onChange={e => setOptions({...options, indent: parseInt(e.target.value)})}
                >
                  <option value={2}>2 spaces</option>
                  <option value={4}>4 spaces</option>
                  <option value={0}>Tab</option>
                </select>
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={options.minify}
                  onChange={e => setOptions({...options, minify: e.target.checked})}
                />
                <span>Minify output</span>
              </label>

              {targetFormat === 'xml' && (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={options.declaration}
                      onChange={e => setOptions({...options, declaration: e.target.checked})}
                    />
                    <span>Include XML declaration</span>
                  </label>
                  <label>
                    <span>Root element name</span>
                    <input
                      type="text"
                      value={options.rootName}
                      onChange={e => setOptions({...options, rootName: e.target.value})}
                    />
                  </label>
                </>
              )}
            </div>
          )}

          {/* Preview */}
          {targetFormat && (
            <div className="preview-section">
              <h3>Preview</h3>
              {error ? (
                <div className="preview-error">
                  <span>Conversion Error:</span>
                  <p>{error}</p>
                </div>
              ) : (
                <pre className="preview-content">
                  {preview?.substring(0, 1000)}
                  {preview?.length > 1000 && '\n... (truncated)'}
                </pre>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleConvert}
            className="btn-primary"
            disabled={!preview || error}
          >
            Convert & Replace
          </button>
          <button
            onClick={() => {
              if (preview) {
                onConvert(preview, targetFormat, { newTab: true });
                onClose();
              }
            }}
            className="btn-primary"
            disabled={!preview || error}
          >
            Convert to New Tab
          </button>
        </div>
      </div>
    </div>
  );
}
```

#### Updated Format Toolbar:

```jsx
// src/components/FormatToolbar.jsx

import React, { useState, useRef, useEffect } from 'react';
import { Code2, ChevronDown, ArrowRightLeft, Minimize2, Maximize2 } from 'lucide-react';
import { formatService } from '../services/formatters';

export function FormatToolbar({
  content,
  detectedFormat,
  onFormat,
  onMinify,
  onConvert,
  disabled
}) {
  const [showConvertMenu, setShowConvertMenu] = useState(false);
  const menuRef = useRef(null);

  const conversionTargets = formatService.getConversionTargets(detectedFormat);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowConvertMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="format-toolbar">
      {/* Format Button */}
      <button
        onClick={onFormat}
        disabled={disabled}
        title={`Format ${detectedFormat?.toUpperCase() || 'content'}`}
        className="toolbar-btn"
      >
        <Code2 size={16} />
        <span>Format</span>
      </button>

      {/* Minify Button (JSON/XML only) */}
      {['json', 'xml'].includes(detectedFormat) && (
        <button
          onClick={onMinify}
          disabled={disabled}
          title="Minify content"
          className="toolbar-btn"
        >
          <Minimize2 size={16} />
        </button>
      )}

      {/* Convert Dropdown */}
      <div className="convert-dropdown" ref={menuRef}>
        <button
          onClick={() => setShowConvertMenu(!showConvertMenu)}
          disabled={disabled || !detectedFormat}
          className="toolbar-btn"
          title="Convert to another format"
        >
          <ArrowRightLeft size={16} />
          <span>Convert</span>
          <ChevronDown size={14} />
        </button>

        {showConvertMenu && (
          <div className="dropdown-menu">
            {conversionTargets.map(format => (
              <button
                key={format}
                onClick={() => {
                  onConvert(format);
                  setShowConvertMenu(false);
                }}
                className="dropdown-item"
              >
                Convert to {format.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Format Indicator */}
      {detectedFormat && (
        <span className="format-indicator">
          {detectedFormat.toUpperCase()}
        </span>
      )}
    </div>
  );
}
```

---

### Phase 6: CodeMirror Language Support

**Goal**: Add syntax highlighting for YAML and TOML

#### Tasks:
- [ ] Install `@codemirror/lang-yaml` (if available) or create custom extension
- [ ] Create TOML language support (no official package)
- [ ] Update `getLanguageExtension()` in CodeMirrorEditor
- [ ] Add format-specific autocomplete hints
- [ ] Add bracket/quote matching for new formats

#### CodeMirror Extension Updates:

```javascript
// src/components/CodeMirrorEditor.jsx - Updated getLanguageExtension

import { StreamLanguage } from '@codemirror/language';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';

// Custom TOML mode (simplified)
const tomlLanguage = StreamLanguage.define({
  token(stream, state) {
    // Comments
    if (stream.match(/^#.*/)) {
      return 'comment';
    }

    // Section headers
    if (stream.match(/^\[{1,2}[\w.-]+\]{1,2}/)) {
      return 'keyword';
    }

    // Keys
    if (stream.match(/^[\w-]+(?=\s*=)/)) {
      return 'property';
    }

    // Strings
    if (stream.match(/^"""/) || stream.match(/^'''/)) {
      state.inMultilineString = stream.current()[0];
      return 'string';
    }
    if (stream.match(/^"[^"]*"/) || stream.match(/^'[^']*'/)) {
      return 'string';
    }

    // Numbers
    if (stream.match(/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?/)) {
      return 'number';
    }

    // Booleans
    if (stream.match(/^(true|false)/)) {
      return 'atom';
    }

    // Dates
    if (stream.match(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/)) {
      return 'number';
    }

    stream.next();
    return null;
  }
});

function getLanguageExtension(language) {
  switch (language?.toLowerCase()) {
    case 'json':
      return json();
    case 'xml':
    case 'html':
    case 'markup':
      return xml();
    case 'yaml':
    case 'yml':
      return StreamLanguage.define(yaml);
    case 'toml':
      return tomlLanguage;
    // ... other languages
    default:
      return javascript();
  }
}
```

---

## Technical Specifications

### Format Detection Priority

```javascript
const DETECTION_PRIORITY = [
  { format: 'json', check: looksLikeJSON },    // Highest - most specific
  { format: 'xml', check: looksLikeXML },
  { format: 'toml', check: looksLikeTOML },
  { format: 'yaml', check: looksLikeYAML },    // Lowest - most permissive
];
```

### Error Object Schema

```typescript
interface FormatError {
  message: string;
  line: number | null;
  column: number | null;
  severity: 'error' | 'warning';
  code?: string;           // Error code for i18n
  suggestion?: string;     // Auto-fix suggestion
}

interface ValidationResult {
  valid: boolean;
  errors: FormatError[];
  warnings: FormatError[];
  formatted?: string;      // If auto-fixed
}
```

### Conversion Options Schema

```typescript
interface ConversionOptions {
  // Common
  indent: number;          // Default: 2
  minify: boolean;         // Default: false

  // JSON specific
  sortKeys: boolean;       // Default: false

  // XML specific
  declaration: boolean;    // Default: true
  rootName: string;        // Default: 'root'
  attributePrefix: string; // Default: '@'
  textKey: string;         // Default: '#text'

  // YAML specific
  lineWidth: number;       // Default: 80
  noRefs: boolean;         // Default: true
  quotingType: '"' | "'";  // Default: '"'

  // TOML specific
  // (minimal options, TOML has strict formatting)
}
```

---

## UI/UX Design

### Format Button States

| State | Visual | Action |
|-------|--------|--------|
| Idle | Default color | Click to format |
| Detecting | Spinner | Auto-detecting format |
| Error | Red highlight | Click to show errors |
| Success | Green flash | Format applied |

### Keyboard Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Format | `Cmd+Shift+F` | `Ctrl+Shift+F` |
| Minify | `Cmd+Shift+M` | `Ctrl+Shift+M` |
| Convert to JSON | `Cmd+Shift+1` | `Ctrl+Shift+1` |
| Convert to XML | `Cmd+Shift+2` | `Ctrl+Shift+2` |
| Convert to YAML | `Cmd+Shift+3` | `Ctrl+Shift+3` |
| Convert to TOML | `Cmd+Shift+4` | `Ctrl+Shift+4` |

### Status Bar Format Indicator

```
┌──────────────────────────────────────────────────┐
│ [JSON] ✓ Valid │ 245 lines │ UTF-8 │ LF │ Ln 42 │
└──────────────────────────────────────────────────┘
```

---

## Dependencies

### New NPM Packages Required

```json
{
  "dependencies": {
    "js-yaml": "^4.1.0",
    "@iarna/toml": "^2.2.5"
  },
  "devDependencies": {
    "@codemirror/legacy-modes": "^6.4.0"
  }
}
```

### Package Size Impact

| Package | Size (gzipped) | Justification |
|---------|----------------|---------------|
| js-yaml | ~25KB | Industry standard YAML parser |
| @iarna/toml | ~15KB | Best TOML v1.0 support |
| @codemirror/legacy-modes | ~5KB | YAML syntax highlighting |

**Total additional size: ~45KB gzipped**

---

## File Modifications

### Files to Create

| File | Purpose |
|------|---------|
| `src/services/formatters/index.js` | Export all formatters |
| `src/services/formatters/FormatService.js` | Unified service |
| `src/services/formatters/FormatDetector.js` | Content detection |
| `src/services/formatters/BaseFormatter.js` | Base class |
| `src/services/formatters/JsonFormatter.js` | JSON operations |
| `src/services/formatters/XmlFormatter.js` | XML operations |
| `src/services/formatters/YamlFormatter.js` | YAML operations |
| `src/services/formatters/TomlFormatter.js` | TOML operations |
| `src/services/formatters/FormatConverter.js` | Conversions |
| `src/components/ConversionModal.jsx` | Conversion UI |
| `src/components/FormatToolbar.jsx` | Format actions |

### Files to Modify

| File | Changes |
|------|---------|
| `src/TidyCode.jsx` | Integrate new format service, update formatContent(), update Structure View |
| `src/components/CodeMirrorEditor.jsx` | Add YAML/TOML language extensions |
| `package.json` | Add new dependencies |

---

## Testing Strategy

### Unit Tests

```javascript
// tests/formatters/YamlFormatter.test.js

describe('YamlFormatter', () => {
  describe('detect()', () => {
    test('detects simple YAML', () => {
      const yaml = 'name: John\nage: 30';
      expect(formatter.detect(yaml).match).toBe(true);
    });

    test('rejects JSON', () => {
      const json = '{"name": "John"}';
      expect(formatter.detect(json).match).toBe(false);
    });
  });

  describe('validate()', () => {
    test('validates correct YAML', () => {
      const yaml = 'items:\n  - one\n  - two';
      expect(formatter.validate(yaml).valid).toBe(true);
    });

    test('catches indentation errors', () => {
      const yaml = 'items:\n- one\n  - two';  // Inconsistent indent
      const result = formatter.validate(yaml);
      expect(result.valid).toBe(false);
      expect(result.errors[0].line).toBeDefined();
    });
  });

  describe('format()', () => {
    test('formats with consistent indentation', () => {
      const yaml = 'items:\n    - one\n    - two';
      const result = formatter.format(yaml, { indent: 2 });
      expect(result.formatted).toContain('  - one');
    });
  });
});
```

### Integration Tests

```javascript
// tests/integration/conversion.test.js

describe('Format Conversions', () => {
  test('JSON → YAML → JSON roundtrip', () => {
    const original = { name: 'test', items: [1, 2, 3] };
    const json = JSON.stringify(original);

    const yaml = converter.convert(json, 'json', 'yaml').converted;
    const backToJson = converter.convert(yaml, 'yaml', 'json').converted;

    expect(JSON.parse(backToJson)).toEqual(original);
  });

  test('handles complex nested structures', () => {
    const complex = {
      users: [
        { name: 'Alice', roles: ['admin', 'user'] },
        { name: 'Bob', roles: ['user'] }
      ],
      settings: {
        theme: 'dark',
        notifications: { email: true, sms: false }
      }
    };

    // Test all conversion paths
    const formats = ['json', 'yaml', 'toml', 'xml'];
    for (const from of formats) {
      for (const to of formats) {
        if (from !== to) {
          const result = converter.convert(
            converter.stringify(complex, from),
            from,
            to
          );
          expect(result.errors).toHaveLength(0);
        }
      }
    }
  });
});
```

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2025-01-07 | 0.1.0 | Initial implementation plan |

---

## Notes

- TOML has limited expressiveness compared to JSON/YAML (no null, limited nesting)
- XML → JSON conversion may lose attribute ordering
- Large file conversions should be async to prevent UI freeze
- Consider adding "Preview" before applying conversions
- YAML anchors/aliases not supported in conversions (flattened)

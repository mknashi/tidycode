import { BaseFormatter } from './BaseFormatter';

/**
 * XML format handler
 * Provides validation, formatting, and structure building for XML
 */
export class XmlFormatter extends BaseFormatter {
  constructor() {
    super('xml');
    this.extensions = ['.xml', '.xsl', '.xslt', '.svg', '.xhtml', '.rss', '.atom', '.plist'];
    this.mimeTypes = ['application/xml', 'text/xml', 'application/xhtml+xml'];
  }

  detect(content) {
    const trimmed = content.trim();

    // Check for XML declaration or root element
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<!DOCTYPE')) {
      return { match: true, confidence: 1 };
    }

    // Check for opening tag
    if (/^<[a-zA-Z][\w:-]*/.test(trimmed)) {
      // Verify it has a closing tag or self-closing
      const tagMatch = trimmed.match(/^<([a-zA-Z][\w:-]*)/);
      if (tagMatch) {
        const tagName = tagMatch[1];
        if (trimmed.includes(`</${tagName}>`) || trimmed.includes('/>')) {
          return { match: true, confidence: 0.9 };
        }
      }
      return { match: true, confidence: 0.7 };
    }

    return { match: false, confidence: 0 };
  }

  validate(content) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/xml');
      const parseError = doc.querySelector('parsererror');

      if (parseError) {
        const errorText = parseError.textContent;
        return {
          valid: false,
          errors: [this.parseXmlError(errorText, content)],
          warnings: []
        };
      }

      return { valid: true, errors: [], warnings: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [this.createError(error)],
        warnings: []
      };
    }
  }

  format(content, options = {}) {
    const { indent = 2 } = options;

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/xml');
      const parseError = doc.querySelector('parsererror');

      if (parseError) {
        return { formatted: null, errors: [this.parseXmlError(parseError.textContent, content)] };
      }

      const formatted = this.prettifyXml(doc, indent);
      return { formatted, errors: [] };
    } catch (error) {
      return { formatted: null, errors: [this.createError(error)] };
    }
  }

  minify(content) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/xml');
      const parseError = doc.querySelector('parsererror');

      if (parseError) {
        return { minified: null, errors: [this.parseXmlError(parseError.textContent, content)] };
      }

      const serializer = new XMLSerializer();
      let minified = serializer.serializeToString(doc);

      // Remove whitespace between tags
      minified = minified.replace(/>\s+</g, '><');
      // Remove newlines
      minified = minified.replace(/\n\s*/g, '');

      return { minified, errors: [] };
    } catch (error) {
      return { minified: null, errors: [this.createError(error)] };
    }
  }

  parse(content) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/xml');
    const parseError = doc.querySelector('parsererror');

    if (parseError) {
      throw new Error('Invalid XML: ' + parseError.textContent);
    }

    return this.nodeToObject(doc.documentElement);
  }

  stringify(data, options = {}) {
    const {
      indent = 2,
      declaration = true,
      rootName = 'root'
    } = options;

    let xml = declaration ? '<?xml version="1.0" encoding="UTF-8"?>\n' : '';

    if (typeof data === 'object' && data !== null) {
      const keys = Object.keys(data);
      if (keys.length === 1 && !keys[0].startsWith('@')) {
        xml += this.objectToXmlNode(keys[0], data[keys[0]], 0, indent);
      } else {
        xml += this.objectToXmlNode(rootName, data, 0, indent);
      }
    } else {
      xml += this.objectToXmlNode(rootName, data, 0, indent);
    }

    return xml;
  }

  buildStructure(content) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/xml');
      const parseError = doc.querySelector('parsererror');

      if (parseError) {
        return { nodes: [], errors: [this.parseXmlError(parseError.textContent, content)] };
      }

      return { nodes: this.buildNodesFromElement(doc.documentElement), errors: [] };
    } catch (error) {
      return { nodes: [], errors: [this.createError(error)] };
    }
  }

  buildNodesFromElement(element, depth = 0) {
    const nodes = [];

    const node = {
      key: element.tagName,
      type: 'element',
      depth,
      children: []
    };

    // Add attributes
    if (element.attributes.length > 0) {
      for (const attr of element.attributes) {
        node.children.push({
          key: `@${attr.name}`,
          type: 'attribute',
          value: this.truncateValue(attr.value),
          depth: depth + 1
        });
      }
    }

    // Add child elements and text
    for (const child of element.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        node.children.push(...this.buildNodesFromElement(child, depth + 1));
      } else if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent.trim();
        if (text) {
          node.children.push({
            key: '#text',
            type: 'text',
            value: this.truncateValue(text),
            depth: depth + 1
          });
        }
      } else if (child.nodeType === Node.CDATA_SECTION_NODE) {
        node.children.push({
          key: '#cdata',
          type: 'cdata',
          value: this.truncateValue(child.textContent),
          depth: depth + 1
        });
      }
    }

    nodes.push(node);
    return nodes;
  }

  prettifyXml(doc, indentSize) {
    const serializer = new XMLSerializer();
    let xml = serializer.serializeToString(doc);

    // Simple prettification
    let formatted = '';
    let indent = 0;
    const indentStr = ' '.repeat(indentSize);

    // Split by tags
    const parts = xml.replace(/>\s*</g, '>\n<').split('\n');

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Decrease indent for closing tags
      if (trimmed.startsWith('</')) {
        indent = Math.max(0, indent - 1);
      }

      formatted += indentStr.repeat(indent) + trimmed + '\n';

      // Increase indent for opening tags (not self-closing)
      if (trimmed.startsWith('<') && !trimmed.startsWith('</') &&
          !trimmed.startsWith('<?') && !trimmed.startsWith('<!') &&
          !trimmed.endsWith('/>')) {
        // Check if tag has content on same line
        if (!trimmed.includes('</')) {
          indent++;
        }
      }
    }

    return formatted.trim();
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
          if (Object.keys(obj).length === 0 ||
              (Object.keys(obj).length === 1 && obj['@attributes'])) {
            // Simple text content
            if (Object.keys(obj).length === 0) {
              return this.parseValue(text);
            }
            obj['#text'] = this.parseValue(text);
          } else {
            obj['#text'] = this.parseValue(text);
          }
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const childObj = this.nodeToObject(child);
        const tagName = child.tagName;

        if (obj[tagName]) {
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

  objectToXmlNode(tagName, value, depth, indentSize) {
    const indent = ' '.repeat(depth * indentSize);

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
    if (/^-?\d+$/.test(str)) return parseInt(str, 10);
    if (/^-?\d*\.\d+$/.test(str)) return parseFloat(str);
    if (str === 'true') return true;
    if (str === 'false') return false;
    return str;
  }

  parseXmlError(errorText, content) {
    // Try to extract line/column from error message
    const lineMatch = errorText.match(/line\s*(\d+)/i);
    const colMatch = errorText.match(/column\s*(\d+)/i);

    return {
      message: errorText.replace(/This page contains the following errors:.*?Below is a rendering.*$/s, '').trim() || 'XML parsing error',
      line: lineMatch ? parseInt(lineMatch[1], 10) : null,
      column: colMatch ? parseInt(colMatch[1], 10) : null,
      severity: 'error',
      format: 'xml'
    };
  }
}

export default XmlFormatter;

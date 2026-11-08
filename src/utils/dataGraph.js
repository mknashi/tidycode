/**
 * Turn JSON or XML text into a graph of cards for the graph view.
 *
 * Each object, array or element becomes a card. Simple values are rows on
 * their parent's card; nested containers are rows that link to a child card.
 * Every card and row keeps the source offset it came from so a click can
 * move the editor there.
 *
 * Card: { id, title, kind, offset, rows: [{ key, value, valueType, offset, childId? }], children: [cardId] }
 */

export const MAX_GRAPH_CARDS = 5000;
const MAX_ROWS_PER_CARD = 100;

export class GraphTooLargeError extends Error {}

// --- JSON -----------------------------------------------------------------

// Recursive-descent JSON parser that records where each value starts
const parseJsonWithOffsets = (text) => {
  let i = 0;

  const fail = (message) => {
    const before = text.slice(0, i);
    const line = before.split('\n').length;
    const column = i - before.lastIndexOf('\n');
    throw new SyntaxError(`${message} at line ${line}, column ${column}`);
  };

  const skipWhitespace = () => {
    while (i < text.length && ' \t\n\r﻿'.includes(text[i])) i++;
  };

  const parseString = () => {
    const start = i;
    i++; // opening quote
    while (i < text.length) {
      const ch = text[i];
      if (ch === '\\') { i += 2; continue; }
      if (ch === '"') {
        i++;
        return JSON.parse(text.slice(start, i));
      }
      if (ch === '\n') break;
      i++;
    }
    i = start;
    return fail('Unterminated string');
  };

  const parseValue = () => {
    skipWhitespace();
    const offset = i;
    const ch = text[i];

    if (ch === '{') {
      i++;
      const entries = [];
      skipWhitespace();
      if (text[i] === '}') { i++; return { type: 'object', entries, offset }; }
      while (true) {
        skipWhitespace();
        if (text[i] !== '"') fail('Expected a property name');
        const keyOffset = i;
        const key = parseString();
        skipWhitespace();
        if (text[i] !== ':') fail('Expected ":"');
        i++;
        entries.push({ key, keyOffset, value: parseValue() });
        skipWhitespace();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return { type: 'object', entries, offset }; }
        fail('Expected "," or "}"');
      }
    }

    if (ch === '[') {
      i++;
      const items = [];
      skipWhitespace();
      if (text[i] === ']') { i++; return { type: 'array', items, offset }; }
      while (true) {
        items.push(parseValue());
        skipWhitespace();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; return { type: 'array', items, offset }; }
        fail('Expected "," or "]"');
      }
    }

    if (ch === '"') return { type: 'string', value: parseString(), offset };

    const literal = text.slice(i).match(/^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/);
    if (!literal) fail('Unexpected token');
    i += literal[0].length;
    const raw = literal[0];
    if (raw === 'null') return { type: 'null', value: null, offset };
    if (raw === 'true' || raw === 'false') return { type: 'boolean', value: raw === 'true', offset };
    return { type: 'number', value: Number(raw), raw, offset };
  };

  const root = parseValue();
  skipWhitespace();
  if (i < text.length) fail('Unexpected content after the end of the data');
  return root;
};

const formatJsonValue = (node) => (node.type === 'string' ? JSON.stringify(node.value) : node.raw ?? String(node.value));

const buildJsonGraph = (text) => {
  const root = parseJsonWithOffsets(text);
  const cards = new Map();

  const addCard = (node, title) => {
    if (cards.size >= MAX_GRAPH_CARDS) throw new GraphTooLargeError();
    const id = `c${cards.size}`;
    const card = { id, title, kind: node.type, offset: node.offset, rows: [], children: [] };
    cards.set(id, card);

    const entries = node.type === 'object'
      ? node.entries.map(({ key, keyOffset, value }) => ({ key, offset: keyOffset, value }))
      : node.type === 'array'
        ? node.items.map((value, index) => ({ key: String(index), offset: value.offset, value }))
        : [{ key: null, offset: node.offset, value: node }];

    entries.slice(0, MAX_ROWS_PER_CARD).forEach(({ key, offset, value }) => {
      if (value.type === 'object' || value.type === 'array') {
        const count = value.type === 'object' ? value.entries.length : value.items.length;
        const childTitle = node.type === 'array' ? `${title}[${key}]` : key;
        const childId = count > 0 ? addCard(value, childTitle) : null;
        if (childId) card.children.push(childId);
        card.rows.push({
          key,
          value: value.type === 'object' ? `{${count}}` : `[${count}]`,
          valueType: value.type,
          offset,
          childId
        });
      } else {
        card.rows.push({ key, value: formatJsonValue(value), valueType: value.type, offset });
      }
    });

    if (entries.length > MAX_ROWS_PER_CARD) {
      card.rows.push({ key: null, value: `… ${entries.length - MAX_ROWS_PER_CARD} more`, valueType: 'more', offset: node.offset });
    }
    return id;
  };

  const rootId = addCard(root, root.type === 'array' ? 'root[ ]' : root.type === 'object' ? 'root' : 'value');
  return { rootId, cards };
};

// --- XML ------------------------------------------------------------------

// Offsets of every start tag, in document order, skipping comments, CDATA,
// processing instructions and the doctype
const findStartTagOffsets = (text) => {
  const offsets = [];
  const pattern = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE(?:[^[>]|\[[\s\S]*?\])*>|<([A-Za-z_][\w.:-]*)/g;
  let match;
  while ((match = pattern.exec(text))) {
    if (match[1]) offsets.push(match.index);
  }
  return offsets;
};

const buildXmlGraph = (text) => {
  if (typeof DOMParser === 'undefined') throw new Error('XML parsing is not available here');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const error = doc.getElementsByTagName('parsererror')[0];
  if (error) {
    const message = (error.textContent || 'Invalid XML').split('\n').find(line => line.trim()) || 'Invalid XML';
    throw new SyntaxError(message.trim());
  }

  // Pair each element with its start tag offset (both are in document order)
  const tagOffsets = findStartTagOffsets(text);
  const elementOffsets = new Map();
  let index = 0;
  const walk = (element) => {
    elementOffsets.set(element, tagOffsets[index++] ?? 0);
    for (const child of element.children) walk(child);
  };
  walk(doc.documentElement);

  const ownText = (element) => Array.from(element.childNodes)
    .filter(node => node.nodeType === 3 || node.nodeType === 4) // text, CDATA
    .map(node => node.nodeValue)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

  // A leaf element with no attributes reads best as a "tag: text" row
  const isSimple = (element) => element.children.length === 0 && element.attributes.length === 0;

  const cards = new Map();
  const addCard = (element) => {
    if (cards.size >= MAX_GRAPH_CARDS) throw new GraphTooLargeError();
    const id = `c${cards.size}`;
    const offset = elementOffsets.get(element);
    const card = { id, title: `<${element.tagName}>`, kind: 'element', offset, rows: [], children: [] };
    cards.set(id, card);

    for (const attr of element.attributes) {
      card.rows.push({ key: `@${attr.name}`, value: JSON.stringify(attr.value), valueType: 'attribute', offset });
    }
    const textContent = ownText(element);
    if (textContent && element.children.length > 0) {
      card.rows.push({ key: '#text', value: JSON.stringify(textContent), valueType: 'string', offset });
    } else if (textContent) {
      card.rows.push({ key: null, value: textContent, valueType: 'string', offset });
    }

    const children = Array.from(element.children);
    children.slice(0, MAX_ROWS_PER_CARD).forEach(child => {
      const childOffset = elementOffsets.get(child);
      if (isSimple(child)) {
        const value = ownText(child);
        card.rows.push({ key: child.tagName, value: value ? JSON.stringify(value) : '<empty/>', valueType: value ? 'string' : 'null', offset: childOffset });
      } else {
        const childId = addCard(child);
        card.children.push(childId);
        const childText = ownText(child);
        const summary = child.children.length > 0
          ? `<${child.children.length}>`
          : childText ? JSON.stringify(childText) : '<…>';
        card.rows.push({ key: `<${child.tagName}>`, value: summary, valueType: 'element', offset: childOffset, childId });
      }
    });
    if (children.length > MAX_ROWS_PER_CARD) {
      card.rows.push({ key: null, value: `… ${children.length - MAX_ROWS_PER_CARD} more`, valueType: 'more', offset });
    }
    return id;
  };

  const rootId = addCard(doc.documentElement);
  return { rootId, cards };
};

/**
 * @param {string} text
 * @param {'json'|'xml'} format
 * @returns {{ rootId: string, cards: Map<string, object> }}
 * @throws {SyntaxError} for invalid input, GraphTooLargeError past MAX_GRAPH_CARDS
 */
export function buildDataGraph(text, format) {
  return format === 'xml' ? buildXmlGraph(text) : buildJsonGraph(text);
}

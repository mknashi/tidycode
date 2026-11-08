/**
 * Infer a JSON Schema (draft 2020-12) from a sample JSON value.
 *
 * Arrays merge the schemas of all their items: an object key is "required"
 * only when every item has it, and items of different types become a type
 * list or anyOf.
 */

const SCHEMA_DRAFT = 'https://json-schema.org/draft/2020-12/schema';

const STRING_FORMATS = [
  ['date-time', /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:?\d{2})?$/],
  ['date', /^\d{4}-\d{2}-\d{2}$/],
  ['time', /^\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:?\d{2})?$/],
  ['email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/],
  ['uuid', /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/],
  ['uri', /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S+$/]
];

const detectStringFormat = (value) => {
  for (const [format, pattern] of STRING_FORMATS) {
    if (pattern.test(value)) return format;
  }
  return null;
};

const typeOf = (value) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value; // string | boolean | object
};

const infer = (value, options) => {
  const type = typeOf(value);

  if (type === 'string') {
    const format = options.detectFormats ? detectStringFormat(value) : null;
    return format ? { type, format } : { type };
  }

  if (type === 'array') {
    if (value.length === 0) return { type, items: {} };
    const items = value.map(item => infer(item, options)).reduce(merge);
    return { type, items };
  }

  if (type === 'object') {
    const properties = {};
    for (const [key, child] of Object.entries(value)) {
      properties[key] = infer(child, options);
    }
    const required = Object.keys(properties);
    const schema = { type, properties };
    if (required.length > 0 && options.required) schema.required = required;
    if (options.additionalProperties === false) schema.additionalProperties = false;
    return schema;
  }

  return { type };
};

// Split a schema into single-type variants keyed by type
const variants = (schema) => {
  if (schema.anyOf) return schema.anyOf.flatMap(variants);
  if (Array.isArray(schema.type)) return schema.type.map(type => ({ type }));
  if (!schema.type) return []; // {} from an empty array matches anything
  return [schema];
};

const mergeSameType = (a, b) => {
  if (a.type === 'string') {
    return a.format && a.format === b.format ? a : { type: 'string' };
  }

  if (a.type === 'array') {
    const aEmpty = !a.items.type && !a.items.anyOf;
    const bEmpty = !b.items.type && !b.items.anyOf;
    if (aEmpty) return b;
    if (bEmpty) return a;
    return { type: 'array', items: merge(a.items, b.items) };
  }

  if (a.type === 'object') {
    const properties = { ...a.properties };
    for (const [key, schema] of Object.entries(b.properties)) {
      properties[key] = key in properties ? merge(properties[key], schema) : schema;
    }
    const merged = { type: 'object', properties };
    if (a.required || b.required) {
      const bRequired = new Set(b.required || []);
      const required = (a.required || []).filter(key => bRequired.has(key));
      if (required.length > 0) merged.required = required;
    }
    if (a.additionalProperties === false) merged.additionalProperties = false;
    return merged;
  }

  return a;
};

const merge = (a, b) => {
  const byType = new Map();
  for (const variant of [...variants(a), ...variants(b)]) {
    const existing = byType.get(variant.type);
    byType.set(variant.type, existing ? mergeSameType(existing, variant) : variant);
  }

  // integer is a subset of number
  if (byType.has('integer') && byType.has('number')) byType.delete('integer');

  // Keep null last so nullable fields read as ["string", "null"]
  const list = [...byType.values()].sort((x, y) => (x.type === 'null') - (y.type === 'null'));
  if (list.length === 0) return {};
  if (list.length === 1) return list[0];

  // Plain types (no properties, items or format) can share one "type" list
  const isPlain = (schema) => Object.keys(schema).length === 1;
  if (list.every(isPlain)) return { type: list.map(schema => schema.type) };
  return { anyOf: list };
};

/**
 * @param {*} data - Parsed JSON value
 * @param {object} [options]
 * @param {string} [options.title] - Root schema title
 * @param {boolean} [options.required=true] - Mark keys present in every sample as required
 * @param {boolean} [options.detectFormats=true] - Add "format" for dates, emails, URIs, UUIDs
 * @param {boolean} [options.additionalProperties] - Set to false to disallow unknown keys
 * @returns {object} JSON Schema
 */
export function generateJsonSchema(data, options = {}) {
  const opts = { required: true, detectFormats: true, ...options };
  const schema = infer(data, opts);
  return {
    $schema: SCHEMA_DRAFT,
    ...(opts.title ? { title: opts.title } : {}),
    ...schema
  };
}

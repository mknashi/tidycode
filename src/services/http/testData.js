// Deliberately bounded JSON Schema subset. No scripts, remote references or source values.
export const TEST_DATA_LIMIT = 256 * 1024;
export const DEFAULT_TEST_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", format: "name" },
    email: { type: "string", format: "email" },
    age: { type: "integer", minimum: 18, maximum: 80 },
    active: { type: "boolean" },
  },
};
const keys = new Set([
  "type",
  "properties",
  "items",
  "enum",
  "format",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
]);
const formats = ["name", "email", "uuid", "date", "date-time", "url"];
export function parseTestSchema(text) {
  if (text.length > 32768) throw new Error("Schema is limited to 32 KiB.");
  const schema = JSON.parse(text);
  let nodes = 0;
  function check(s, depth = 0) {
    if (++nodes > 200 || depth > 8)
      throw new Error("Use at most 200 schema fields and 8 nesting levels.");
    if (
      !s ||
      typeof s !== "object" ||
      Array.isArray(s) ||
      ![
        "object",
        "array",
        "string",
        "number",
        "integer",
        "boolean",
        "null",
      ].includes(s.type)
    )
      throw new Error("Every schema field needs a supported type.");
    for (const key of Object.keys(s))
      if (!keys.has(key)) throw new Error(`Unsupported schema keyword: ${key}`);
    if (s.format && (s.type !== "string" || !formats.includes(s.format)))
      throw new Error("Unsupported string format.");
    for (const [low, high, fallback, limit] of [
      ["minimum", "maximum", 0, 1000000],
      ["minLength", "maxLength", 0, 1000],
      ["minItems", "maxItems", 0, 20],
    ]) {
      const a = s[low] ?? fallback,
        b =
          s[high] ??
          Math.max(a, low === "minimum" ? 100 : low === "minLength" ? 20 : 3);
      if (
        ![a, b].every(Number.isFinite) ||
        a > b ||
        Math.abs(a) > limit ||
        Math.abs(b) > limit ||
        (low !== "minimum" &&
          (!Number.isInteger(a) || !Number.isInteger(b) || a < 0))
      )
        throw new Error(`Invalid ${low}/${high} bounds.`);
      if (
        s.type === "integer" &&
        low === "minimum" &&
        Math.ceil(a) > Math.floor(b)
      )
        throw new Error("Integer bounds must contain an integer.");
    }
    if (
      s.enum &&
      (!Array.isArray(s.enum) ||
        !s.enum.length ||
        s.enum.length > 100 ||
        s.enum.some(
          (v) =>
            !matchesType(v, s.type) || (v !== null && typeof v === "object"),
        ))
    )
      throw new Error("Enum needs 1–100 primitive values matching its type.");
    if (s.type === "object") {
      if (
        !s.properties ||
        typeof s.properties !== "object" ||
        Array.isArray(s.properties)
      )
        throw new Error("Objects need properties.");
      Object.values(s.properties).forEach((v) => check(v, depth + 1));
    }
    if (s.type === "array") {
      if (!s.items) throw new Error("Arrays need items.");
      check(s.items, depth + 1);
    }
  }
  check(schema);
  return schema;
}
function matchesType(v, t) {
  return t === "null"
    ? v === null
    : t === "array"
      ? Array.isArray(v)
      : t === "object"
        ? v !== null && v !== null && typeof v === "object" && !Array.isArray(v)
        : t === "integer"
          ? Number.isSafeInteger(v)
          : t === "number"
            ? typeof v === "number" && Number.isFinite(v)
            : typeof v === t;
}
export function inferTestSchema(value, depth = 0) {
  if (depth > 8) throw new Error("Request is too deeply nested.");
  if (Array.isArray(value))
    return { type: "array", items: inferTestSchema(value[0] ?? "", depth + 1) };
  if (value !== null && typeof value === "object")
    return {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(value).map(([k, v]) => [
          k,
          inferTestSchema(v, depth + 1),
        ]),
      ),
    };
  return {
    type:
      value === null
        ? "null"
        : typeof value === "number"
          ? Number.isInteger(value)
            ? "integer"
            : "number"
          : typeof value,
  };
}
export function generateTestData(
  schema,
  { seed = "1", scenario = "normal", count = 1 } = {},
) {
  schema = parseTestSchema(JSON.stringify(schema));
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new Error("Choose 1–100 records.");
  if (!["normal", "minimum", "maximum", "empty", "null"].includes(scenario))
    throw new Error("Unknown scenario.");
  let state = 2166136261;
  for (const c of String(seed))
    state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const pick = (min, max) =>
    scenario === "minimum"
      ? min
      : scenario === "maximum"
        ? max
        : min + Math.floor(random() * (max - min + 1));
  let visits = 0;
  function make(s, key = "value") {
    if (++visits > 10000)
      throw new Error(
        "Generated structure exceeds 10,000 values. Reduce array sizes or record count.",
      );
    if (scenario === "null") return null;
    if (s.enum) return s.enum[pick(0, s.enum.length - 1)];
    if (s.type === "object")
      return Object.fromEntries(
        Object.entries(s.properties).map(([k, v]) => [k, make(v, k)]),
      );
    if (s.type === "array")
      return Array.from(
        {
          length:
            scenario === "empty"
              ? 0
              : pick(
                  s.minItems ?? 1,
                  s.maxItems ?? Math.max(s.minItems ?? 1, 3),
                ),
        },
        () => make(s.items, key),
      );
    if (s.type === "null") return null;
    if (s.type === "boolean")
      return scenario === "minimum" || scenario === "empty"
        ? false
        : scenario === "maximum"
          ? true
          : random() >= 0.5;
    if (s.type === "integer" || s.type === "number") {
      const min = s.minimum ?? 0,
        max = s.maximum ?? Math.max(min, 100);
      return s.type === "integer"
        ? pick(Math.ceil(min), Math.floor(max))
        : scenario === "minimum"
          ? min
          : scenario === "maximum"
            ? max
            : Math.min(
                max,
                Math.max(
                  min,
                  Number((min + random() * (max - min)).toFixed(4)),
                ),
              );
    }
    if (scenario === "empty") return "";
    const n = pick(1, 9999);
    let value =
      s.format === "email"
        ? `tester${n}@example.test`
        : s.format === "name"
          ? `Test User ${n}`
          : s.format === "url"
            ? `https://example.test/items/${n}`
            : s.format === "date"
              ? `2025-01-${String(pick(1, 28)).padStart(2, "0")}`
              : s.format === "date-time"
                ? `2025-01-${String(pick(1, 28)).padStart(2, "0")}T12:00:00Z`
                : s.format === "uuid"
                  ? "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
                      /[xy]/g,
                      (c) => {
                        const r = Math.floor(random() * 16);
                        return (c === "x" ? r : (r & 3) | 8).toString(16);
                      },
                    )
                  : `${key}_${n}`;
    if (
      s.format === undefined ||
      s.minLength !== undefined ||
      s.maxLength !== undefined
    ) {
      const min = s.minLength ?? 1,
        max = s.maxLength ?? Math.max(min, 20);
      const len =
        scenario === "minimum"
          ? min
          : scenario === "maximum"
            ? max
            : Math.min(max, Math.max(min, value.length));
      value = value.padEnd(len, "x").slice(0, len);
    }
    return value;
  }
  const result =
    count === 1
      ? make(schema)
      : Array.from({ length: count }, () => make(schema));
  return encodeTestData(result);
}
export function encodeTestData(value) {
  const text = JSON.stringify(value, null, 2);
  if (/\{\{/.test(text))
    throw new Error(
      "Generated data cannot contain variable references. Use literal synthetic values.",
    );
  if (new TextEncoder().encode(text).length > TEST_DATA_LIMIT)
    throw new Error("Generated preview exceeds 256 KiB.");
  return text;
}
export function validateAiTestData(text, schema, count = 1) {
  if (typeof text !== "string" || text.length > TEST_DATA_LIMIT)
    throw new Error("AI output is too large.");
  schema = parseTestSchema(JSON.stringify(schema));
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new Error("Choose 1–100 records.");
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const value = JSON.parse(clean);
  let nodes = 0;
  function validate(v, s, depth = 0) {
    if (++nodes > 10000 || depth > 8)
      throw new Error("AI output is too complex.");
    if (!matchesType(v, s.type))
      throw new Error("AI output does not match the schema types.");
    if (s.enum && !s.enum.includes(v))
      throw new Error("AI output is outside an enum.");
    if (s.type === "object") {
      const names = Object.keys(v);
      if (
        names.length !== Object.keys(s.properties).length ||
        names.some((k) => !Object.hasOwn(s.properties, k))
      )
        throw new Error("AI output fields do not match the schema.");
      for (const [k, sub] of Object.entries(s.properties))
        validate(v[k], sub, depth + 1);
    }
    if (s.type === "array") {
      if (v.length < (s.minItems ?? 0) || v.length > (s.maxItems ?? 20))
        throw new Error("AI array length is outside bounds.");
      v.forEach((x) => validate(x, s.items, depth + 1));
    }
    if (
      typeof v === "number" &&
      (v < (s.minimum ?? -Infinity) || v > (s.maximum ?? Infinity))
    )
      throw new Error("AI number is outside bounds.");
    if (
      typeof v === "string" &&
      s.format &&
      s.minLength === undefined &&
      s.maxLength === undefined
    ) {
      const valid =
        s.format === "email"
          ? /^[^\s@]+@example\.test$/i.test(v)
          : s.format === "uuid"
            ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                v,
              )
            : s.format === "date"
              ? /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
              : s.format === "date-time"
                ? /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v))
                : s.format === "url"
                  ? (() => {
                      try {
                        const url = new URL(v);
                        return (
                          ["https:", "http:"].includes(url.protocol) &&
                          url.hostname === "example.test" &&
                          !url.username &&
                          !url.password
                        );
                      } catch {
                        return false;
                      }
                    })()
                  : v.length > 0;
      if (!valid)
        throw new Error("AI string does not match its synthetic data format.");
    }
    if (
      typeof v === "string" &&
      (v.length < (s.minLength ?? 0) || v.length > (s.maxLength ?? 10000))
    )
      throw new Error("AI string length is outside bounds.");
  }
  if (count === 1) validate(value, schema);
  else {
    if (!Array.isArray(value) || value.length !== count)
      throw new Error("AI record count does not match.");
    value.forEach((v) => validate(v, schema));
  }
  return encodeTestData(value);
}

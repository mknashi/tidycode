import {
  credentialVariable,
  validateVariables,
  newVariable,
} from "./variables.js";
export function responseValues(source) {
  if (new TextEncoder().encode(source).length > 1024 * 1024)
    return {
      entries: [],
      error: "JSON value actions support complete responses up to 1 MiB.",
    };
  try {
    JSON.parse(source);
  } catch {
    return {
      entries: [],
      error: "JSON value actions require a valid, complete JSON response.",
    };
  }
  const entries = [];
  let at = 0,
    nodes = 0;
  const space = () => {
    while (/\s/.test(source[at] || "") && at < source.length) at++;
  };
  const string = () => {
    const start = at++;
    while (at < source.length) {
      if (source[at++] === '"') break;
      if (source[at - 1] === "\\") at++;
    }
    return JSON.parse(source.slice(start, at));
  };
  const read = (path, secret, depth) => {
    if (++nodes > 500 || depth > 32) throw new Error("bounded");
    space();
    const start = at;
    let value;
    let hasSecret = secret;
    if (source[at] === '"') value = string();
    else if (source[at] === "{" || source[at] === "[") {
      const object = source[at++] === "{";
      const end = object ? "}" : "]";
      let index = 0;
      const keys = new Set();
      space();
      while (source[at] !== end) {
        const key = object ? string() : String(index++);
        if (keys.has(key)) throw new Error("duplicate");
        keys.add(key);
        if (object) {
          space();
          at++;
        }
        hasSecret =
          read(
            path + "/" + key.replaceAll("~", "~0").replaceAll("/", "~1"),
            secret || credentialVariable(key),
            depth + 1,
          ) || hasSecret;
        space();
        if (source[at] === ",") {
          at++;
          space();
        } else break;
      }
      at++;
      value = source.slice(start, at);
    } else {
      while (at < source.length && !/[\s,}\]]/.test(source[at])) at++;
      value = source.slice(start, at);
    }
    entries.push({
      path,
      value,
      secret: hasSecret,
      type:
        source[start] === '"'
          ? "string"
          : source[start] === "{"
            ? "object"
            : source[start] === "["
              ? "array"
              : "literal",
    });
    return hasSecret;
  };
  try {
    read("", false, 0);
  } catch (error) {
    if (error.message !== "bounded")
      return {
        entries: [],
        error:
          "JSON with duplicate keys cannot be selected reliably. Use the raw response instead.",
      };
    return {
      entries: [],
      limited: true,
      error:
        "JSON value actions support up to 500 nodes and 32 levels. Use the raw response for larger JSON.",
    };
  }
  return { entries };
}
export function variableRows(settings, scope, request) {
  if (scope === "global") return settings.globals;
  if (scope === "collection") {
    if (!request.collectionId) throw new Error("Choose a collection first.");
    return settings.collections[request.collectionId] || [];
  }
  if (scope === "request") return settings.requests[request.id] || [];
  const env = settings.environments.find((e) => "env:" + e.id === scope);
  if (!env) throw new Error("Choose an existing variable scope.");
  return env.variables;
}
export function assignResponseVariable(
  settings,
  scope,
  request,
  row,
  overwrite = false,
) {
  const rows = variableRows(settings, scope, request);
  if (rows.some((r) => r.key === row.key) && !overwrite)
    throw new Error("Confirm replacement of the existing variable.");
  const next = structuredClone(settings);
  const updated = [
    ...rows.filter((r) => r.key !== row.key),
    { ...newVariable(), ...row, enabled: true },
  ];
  if (scope === "global") next.globals = updated;
  else if (scope === "request") next.requests[request.id] = updated;
  else if (scope === "collection")
    next.collections[request.collectionId] = updated;
  else
    next.environments.find((e) => "env:" + e.id === scope).variables = updated;
  return validateVariables(next);
}

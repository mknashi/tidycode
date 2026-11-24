import { HttpError, queryRows } from "./request.js";
export const credentialVariable = (key) =>
  /token|secret|password|authorization|cookie|api[-_]?key/i.test(key);
export const emptyVariables = () => ({
  version: 1,
  activeId: null,
  globals: [],
  environments: [],
  collections: {},
  requests: {},
});
const namePattern = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;
export function newVariable() {
  return {
    id: crypto.randomUUID(),
    key: "",
    value: "",
    secret: false,
    enabled: true,
  };
}
export function validateVariables(value, persist = false) {
  if (
    value?.version !== 1 ||
    !Array.isArray(value.globals) ||
    !Array.isArray(value.environments) ||
    value.environments.length > 100
  )
    throw new Error("Invalid variable settings.");
  const rows = (list) => {
    if (!Array.isArray(list) || list.length > 200)
      throw new Error("Use at most 200 variables per scope.");
    const names = new Set();
    return list.map((row) => {
      if (
        !row ||
        typeof row.key !== "string" ||
        typeof row.value !== "string" ||
        new TextEncoder().encode(row.value).length > 65536 ||
        (row.key && !namePattern.test(row.key))
      )
        throw new Error(
          "Variable names must start with a letter or underscore and use letters, digits, dots, underscores, or hyphens. Values are limited to 64 KiB.",
        );
      if (!row.key && row.value)
        throw new Error("Variable names are required for nonempty values.");
      const enabled = row.enabled !== false;
      const secret = row.secret === true || credentialVariable(row.key);
      if (enabled && row.key && names.has(row.key))
        throw new Error(
          "Enabled variable names must be unique within each scope.",
        );
      if (enabled && row.key) names.add(row.key);
      return {
        id: typeof row.id === "string" ? row.id : crypto.randomUUID(),
        key: row.key,
        value: persist && secret ? "" : row.value,
        secret,
        enabled,
        ...(secret &&
        typeof row.vaultId === "string" &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          row.vaultId,
        )
          ? { vaultId: row.vaultId }
          : {}),
      };
    });
  };
  const scoped = (map) => {
    if (
      !map ||
      typeof map !== "object" ||
      Array.isArray(map) ||
      Object.keys(map).length > 500
    )
      throw new Error("Invalid variable scopes.");
    return Object.fromEntries(
      Object.entries(map).map(([key, list]) => [key, rows(list)]),
    );
  };
  const ids = new Set();
  const environments = value.environments.map((e) => {
    if (
      !e ||
      typeof e.id !== "string" ||
      ids.has(e.id) ||
      typeof e.name !== "string" ||
      !e.name.trim() ||
      e.name.length > 200
    )
      throw new Error("Give each environment a name of up to 200 characters.");
    ids.add(e.id);
    return {
      id: e.id,
      name: e.name.trim(),
      production: e.production === true,
      variables: rows(e.variables),
    };
  });
  return {
    version: 1,
    activeId: ids.has(value.activeId) ? value.activeId : null,
    globals: rows(value.globals),
    environments,
    collections: scoped(value.collections || {}),
    requests: scoped(value.requests || {}),
  };
}
const placeholders = /\{\{\s*([^{}]+?)\s*\}\}/g;
export function resolveVariables(
  request,
  settings,
  { uuid = () => crypto.randomUUID(), now = () => Date.now() } = {},
) {
  const environment = settings.environments.find(
    (e) => e.id === settings.activeId,
  );
  const get = (map, id) => (id && Object.hasOwn(map, id) ? map[id] : []);
  const sources = [
    ["Global", settings.globals],
    ["File", request.fileVariables || []],
    ["Collection", get(settings.collections, request.collectionId)],
    [
      environment ? `Environment (${environment.name})` : "Environment",
      environment?.variables || [],
    ],
    ["Request", get(settings.requests, request.id)],
    ["Request block", request.blockVariables || []],
  ];
  const values = new Map();
  for (const [scope, list] of sources)
    for (const row of list)
      if (row.enabled && row.key)
        values.set(row.key, {
          ...row,
          secret: row.secret || credentialVariable(row.key),
          scope,
        });
  const cache = new Map();
  const used = new Map();
  const fail = (kind, key) => {
    const error = new HttpError(
      "variables",
      kind === "missing"
        ? `Define variable “${key}” in Variables, or enter its secret value for this session.`
        : `Variable “${key}” has a circular reference or exceeds the resolution limit.`,
    );
    error.variable = key;
    throw error;
  };
  function variable(key, chain) {
    if (cache.has(key)) return cache.get(key);
    if (chain.includes(key) || chain.length >= 16) fail("cycle", key);
    if (key === "$uuid" || key === "$timestamp") {
      const result = {
        value: key === "$uuid" ? uuid() : String(Math.floor(now() / 1000)),
        secret: false,
      };
      cache.set(key, result);
      used.set(key, {
        key,
        scope: "Dynamic",
        secret: false,
        preview: "Generated when sent",
      });
      return result;
    }
    if (key.startsWith("$"))
      throw new HttpError(
        "variables",
        `Dynamic variable “${key}” is not supported. Use {{$uuid}}, {{$timestamp}}, or a literal value.`,
      );
    const definition = values.get(key);
    if (!definition || (definition.secret && !definition.value))
      fail("missing", key);
    const expanded = expand(definition.value, [...chain, key]);
    const result = {
      value: expanded.value,
      secret: definition.secret || expanded.secret,
    };
    cache.set(key, result);
    used.set(key, {
      key,
      scope: definition.scope,
      secret: result.secret,
      preview: result.secret
        ? "••••••••"
        : result.value.length > 200
          ? result.value.slice(0, 200) + "…"
          : result.value,
    });
    return result;
  }
  let expandedBudget = 0;
  function expand(input, chain = []) {
    let secret = false;
    const source = String(input ?? "");
    if (!/\{\{\s*[^{}]+?\s*\}\}/.test(source))
      return { value: source, secret: false };
    let size = source.length;
    if (size > 2 * 1024 * 1024) fail("cycle", chain[0] || "value");
    const value = source.replace(placeholders, (match, name) => {
      const result = variable(name.trim(), chain);
      size += result.value.length - match.length;
      if (size > 2 * 1024 * 1024) fail("cycle", chain[0] || "value");
      secret ||= result.secret;
      return result.value;
    });
    expandedBudget += value.length;
    if (expandedBudget > 4 * 1024 * 1024) fail("cycle", chain[0] || "value");
    return { value, secret };
  }
  let resolved;
  let error;
  let secretDestination = false;
  try {
    const raw = request.url.split("#")[0];
    const queryAt = raw.indexOf("?");
    const path = queryAt < 0 ? raw : raw.slice(0, queryAt);
    const decodedPath = path.replace(
      /%7B%7B([A-Za-z0-9_.%$-]+)%7D%7D/gi,
      (match) => {
        try {
          return decodeURIComponent(match);
        } catch {
          return match;
        }
      },
    );
    const expandedPath = expand(decodedPath);
    secretDestination = expandedPath.secret;
    let url = expandedPath.value;
    const rows = queryRows(request.url);
    // Query values are expanded before URL encoding, including encoded {{placeholders}}.
    if (rows.length) {
      const target = new URL(url);
      for (const row of rows)
        target.searchParams.append(
          expand(row.key).value,
          expand(row.value).value,
        );
      url = target.href;
    }
    const headers = request.headers.map((h) =>
      h.enabled && h.key
        ? { ...h, key: expand(h.key).value, value: expand(h.value).value }
        : { ...h },
    );
    resolved = {
      ...request,
      sensitiveUrl: secretDestination,
      ...(request.desktop
        ? {
            desktop: {
              ...request.desktop,
              proxyUsername: expand(request.desktop.proxyUsername || "").value,
              proxyPassword: expand(request.desktop.proxyPassword || "").value,
            },
          }
        : {}),
      url,
      headers,
      token:
        request.auth === "bearer" ? expand(request.token).value : request.token,
      ...(request.auth === "basic"
        ? {
            username: expand(request.username || "").value,
            password: expand(request.password || "").value,
          }
        : {}),
      ...(request.auth === "apikey"
        ? {
            apiKeyName: expand(request.apiKeyName || "").value,
            apiKeyValue: expand(request.apiKeyValue || "").value,
          }
        : {}),
      multipart:
        request.bodyMode === "multipart" &&
        !["GET", "HEAD"].includes(request.method)
          ? (request.multipart || []).map((row) =>
              row.enabled
                ? {
                    ...row,
                    key: expand(row.key).value,
                    value:
                      row.type === "file" ? row.value : expand(row.value).value,
                  }
                : row,
            )
          : request.multipart,
      body:
        !["GET", "HEAD"].includes(request.method) &&
        ["json", "text", "form"].includes(request.bodyMode)
          ? request.bodyMode === "form"
            ? (() => {
                // Parse the template first. Expanding credentials into the raw form
                // would turn literal +/&/% characters into spaces or new fields.
                const form = new URLSearchParams();
                for (const [key, value] of new URLSearchParams(request.body))
                  form.append(expand(key).value, expand(value).value);
                return form.toString();
              })()
            : expand(request.body).value
          : request.body,
    };
  } catch (e) {
    error =
      e instanceof HttpError
        ? e
        : new HttpError(
            "validation",
            "The resolved URL is invalid. Check its base URL and variable values.",
          );
  }
  return {
    request: resolved,
    error,
    used: [...used.values()],
    environment,
    secretDestination,
  };
}

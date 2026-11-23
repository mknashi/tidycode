import { savedTemplate } from "./store.js";
import { applyQuery, credentialReference } from "./request.js";

const sensitive = /authorization|cookie|token|secret|password|api[-_]?key/i;
const quote = (value) => "'" + String(value).replaceAll("'", "'\\''") + "'";

// Export unresolved definitions only: never expand environment or secret values.
export function exportRequest(request, options = {}) {
  const clean = savedTemplate(request, options);
  clean.params = clean.params.map((row) => ({
    ...row,
    value:
      sensitive.test(row.key) ||
      (request.auth === "apikey" && row.key === request.apiKeyName)
        ? credentialReference(row.value)
        : row.value,
  }));
  clean.headers = clean.headers.map((row) => ({
    ...row,
    value:
      request.auth === "apikey" &&
      row.key.toLowerCase() === (request.apiKeyName || "").toLowerCase()
        ? credentialReference(row.value)
        : row.value,
  }));
  clean.url = applyQuery(clean.url, clean.params);
  return clean;
}
export function curlExport(request, options = {}) {
  const r = exportRequest(request, options);
  if (r.auth === "apikey" && r.apiKeyIn === "query" && r.apiKeyValue)
    r.url = applyQuery(r.url, [
      ...r.params,
      { key: r.apiKeyName, value: r.apiKeyValue, enabled: true },
    ]);
  const parts = [
    "curl",
    "--globoff",
    "--request",
    quote(r.method),
    "--url",
    quote(r.url),
  ];
  for (const h of r.headers.filter((h) => h.enabled && h.value))
    parts.push("--header", quote(`${h.key}: ${h.value}`));
  if (r.auth === "bearer" && r.token)
    parts.push("--header", quote(`Authorization: Bearer ${r.token}`));
  if (r.auth === "basic" && r.username)
    parts.push("--user", quote(`${r.username}:${r.password || ""}`));
  if (r.auth === "apikey" && r.apiKeyIn === "header" && r.apiKeyValue)
    parts.push("--header", quote(`${r.apiKeyName}: ${r.apiKeyValue}`));
  if (
    !["GET", "HEAD"].includes(r.method) &&
    r.bodyMode !== "none" &&
    options.body &&
    !["multipart", "binary"].includes(r.bodyMode)
  ) {
    const type =
      r.bodyMode === "json"
        ? "application/json"
        : r.bodyMode === "form"
          ? "application/x-www-form-urlencoded"
          : "text/plain";
    if (
      !r.headers.some(
        (h) => h.enabled && h.value && h.key.toLowerCase() === "content-type",
      )
    )
      parts.push("--header", quote(`Content-Type: ${type}`));
    parts.push("--data-raw", quote(r.body));
  }
  return parts.join(" ");
}
function postmanItem(request, options) {
  const r = exportRequest(request, options);
  return {
    name: r.name,
    request: {
      method: r.method,
      url: {
        raw: r.url,
        query: r.params.map((p) => ({
          key: p.key,
          value: p.value,
          disabled: !p.enabled,
        })),
      },
      header: r.headers.map((h) => ({
        key: h.key,
        value: h.value,
        disabled: !h.enabled,
      })),
      auth:
        r.auth === "bearer" && r.token
          ? {
              type: "bearer",
              bearer: [{ key: "token", value: r.token, type: "string" }],
            }
          : r.auth === "basic"
            ? {
                type: "basic",
                basic: [
                  { key: "username", value: r.username, type: "string" },
                  { key: "password", value: r.password, type: "string" },
                ],
              }
            : r.auth === "apikey"
              ? {
                  type: "apikey",
                  apikey: [
                    { key: "key", value: r.apiKeyName, type: "string" },
                    { key: "value", value: r.apiKeyValue, type: "string" },
                    { key: "in", value: r.apiKeyIn, type: "string" },
                  ],
                }
              : { type: "noauth" },
      ...(!["none", "multipart", "binary"].includes(r.bodyMode) && options.body
        ? {
            body:
              r.bodyMode === "form"
                ? {
                    mode: "urlencoded",
                    urlencoded: [...new URLSearchParams(r.body)].map(
                      ([key, value]) => ({ key, value }),
                    ),
                  }
                : {
                    mode: "raw",
                    raw: r.body,
                    options: {
                      raw: {
                        language: r.bodyMode === "json" ? "json" : "text",
                      },
                    },
                  },
          }
        : {}),
    },
  };
}
export function collectionExport(collection, requests, options = {}) {
  const folders = collection.folders || [];
  const walk = (parent, depth = 0) => {
    if (depth > 12)
      throw new Error("Collection folders exceed the export depth limit.");
    return [
      ...folders
        .filter((f) => (f.parentId || null) === parent)
        .map((f) => ({ name: f.name, item: walk(f.id, depth + 1) })),
      ...requests
        .filter((r) => (r.folderId || null) === parent)
        .map((r) => postmanItem(r, options)),
    ];
  };
  return JSON.stringify(
    {
      info: {
        name: collection.name,
        schema:
          "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: walk(null),
    },
    null,
    2,
  );
}

export function httpExport(request, options = {}) {
  const r = exportRequest(request, options);
  const headers = r.headers
    .filter((row) => row.enabled && row.value)
    .map((row) => `${row.key}: ${row.value}`);
  if (r.auth === "bearer" && r.token)
    headers.push("Authorization: Bearer " + r.token);
  // Basic helper references need runtime encoding; configure Basic auth after opening this .http export.
  let url = r.url;
  if (r.auth === "apikey" && r.apiKeyValue) {
    if (r.apiKeyIn === "query")
      url = applyQuery(url, [
        ...r.params,
        { key: r.apiKeyName, value: r.apiKeyValue, enabled: true },
      ]);
    else headers.push(r.apiKeyName + ": " + r.apiKeyValue);
  }
  if (
    r.bodyMode === "json" &&
    options.body &&
    !headers.some((h) => /^content-type:/i.test(h))
  )
    headers.push("Content-Type: application/json");
  if (
    r.bodyMode === "form" &&
    options.body &&
    !headers.some((h) => /^content-type:/i.test(h))
  )
    headers.push("Content-Type: application/x-www-form-urlencoded");
  return (
    "### " +
    r.name.replace(/[\r\n]/g, " ") +
    "\n" +
    r.method +
    " " +
    url +
    "\n" +
    headers.join("\n") +
    (options.body && !["multipart", "binary", "none"].includes(r.bodyMode)
      ? "\n\n" + r.body
      : "") +
    "\n"
  );
}

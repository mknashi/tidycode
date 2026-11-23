import { uploadBody } from "./uploads.js";
/** Browser-client contract v1. Request definitions never contain execution state. */
export const RESPONSE_LIMIT = 20 * 1024 * 1024;
export const DISPLAY_LIMIT = 1024 * 1024;
export const newRow = (key = "", value = "") => ({
  id: crypto.randomUUID(),
  key,
  value,
  enabled: true,
});
export function createRequest(overrides = {}) {
  return {
    version: 1,
    id: crypto.randomUUID(),
    name: "Untitled request",
    method: "GET",
    url: "",
    headers: [newRow("Accept", "application/json")],
    assertions: [],
    bodyMode: "none",
    multipart: [],
    binaryFile: null,
    body: "",
    timeoutMs: 30000,
    token: "",
    username: "",
    password: "",
    apiKeyName: "X-API-Key",
    apiKeyValue: "",
    apiKeyIn: "header",
    auth: "none",
    credentialOrigin: "",
    collectionId: null,
    folderId: null,
    params: queryRows(overrides.url || ""),
    ...overrides,
  };
}
export const credentialReference = (value) =>
  /^(?:(?:Bearer|Basic) )?\{\{\s*[A-Za-z_][A-Za-z0-9_.-]*\s*\}\}$/i.test(
    value || "",
  )
    ? value
    : "";
export function templateUrl(value) {
  // Validate structure without resolving variables or persisting their values.
  const has = /\{\{[^{}]+\}\}/.test(value);
  if (!has) {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Use an HTTP(S) URL without embedded credentials.");
    url.hash = "";
    return url.href;
  }
  let check = value
    .replace(/^\{\{[^{}]+\}\}(?=:\/\/)/, "https")
    .replace(/^\{\{[^{}]+\}\}(?=\/|$|[?#])/, "https://placeholder.invalid")
    .replace(/\{\{[^{}]+\}\}/g, "placeholder");
  const url = new URL(check);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Use an HTTP(S) URL template without embedded credentials.",
    );
  return value.split("#")[0];
}
export class HttpError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HttpError";
    this.code = code;
  }
}
const forbidden =
  /^(accept-charset|accept-encoding|access-control-request-headers|access-control-request-method|connection|content-length|cookie2?|date|dnt|expect|host|keep-alive|origin|permissions-policy|referer|set-cookie|te|trailer|transfer-encoding|upgrade|via|user-agent)$/i;
export const browserHeaderRestricted = (key) =>
  forbidden.test(key) || /^(proxy-|sec-)/i.test(key);
export function prepareRequest(request) {
  if (
    [
      request.url,
      request.auth === "bearer" ? request.token : "",
      ...(request.auth === "basic"
        ? [request.username, request.password]
        : request.auth === "apikey"
          ? [request.apiKeyName, request.apiKeyValue]
          : []),
      ...request.headers.filter((h) => h.enabled).map((h) => h.value),
      ...(!["GET", "HEAD"].includes(request.method) &&
      request.bodyMode === "multipart"
        ? (request.multipart || [])
            .filter((r) => r.enabled)
            .flatMap((r) => [r.key, r.type === "text" ? r.value : ""])
        : []),
      !["GET", "HEAD"].includes(request.method) &&
      ["json", "text", "form"].includes(request.bodyMode)
        ? request.body
        : "",
    ].some((v) => /\{\{.*?\}\}/.test(v))
  )
    throw new HttpError(
      "validation",
      "Replace unresolved {{variables}} in the URL, headers, authentication, or body before sending.",
    );
  let url;
  try {
    url = new URL(request.url);
  } catch {
    throw new HttpError("validation", "Enter a complete HTTP or HTTPS URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new HttpError(
      "validation",
      "Use HTTP or HTTPS. Put credentials in Auth, rather than in the URL.",
    );
  }
  const headers = new Headers();
  for (const row of request.headers.filter((r) => r.enabled && r.key.trim())) {
    const key = row.key.trim();
    if (!/^[!#$%&'*+.^_`|~\w-]+$/.test(key) || /[\r\n]/.test(row.value))
      throw new HttpError(
        "validation",
        "A header has an invalid name or a line break in its value.",
      );
    if (forbidden.test(key) || /^(proxy-|sec-)/i.test(key))
      throw new HttpError(
        "validation",
        `${key} cannot be controlled reliably by browser requests. Remove or disable it.`,
      );
    headers.append(key, row.value);
  }
  if (request.auth === "bearer") {
    if (!request.token.trim())
      throw new HttpError(
        "validation",
        "Enter a bearer token, or select No auth.",
      );
    if (headers.has("authorization"))
      throw new HttpError(
        "validation",
        "Authorization is set in both Headers and Auth. Choose one.",
      );
    if (/[\r\n]/.test(request.token))
      throw new HttpError(
        "validation",
        "The bearer token contains a line break.",
      );
    headers.set("Authorization", `Bearer ${request.token}`);
  }
  if (request.auth === "basic") {
    if (!request.username)
      throw new HttpError(
        "validation",
        "Enter a Basic username, or select No auth.",
      );
    if (
      /[\r\n:]/.test(request.username) ||
      /[\r\n]/.test(request.password || "")
    )
      throw new HttpError(
        "validation",
        "Basic username cannot contain a colon or line break; password cannot contain a line break.",
      );
    if (headers.has("authorization"))
      throw new HttpError(
        "validation",
        "Authorization is set in both Headers and Auth. Choose one.",
      );
    const bytes = new TextEncoder().encode(
      `${request.username}:${request.password || ""}`,
    );
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    headers.set("Authorization", `Basic ${btoa(binary)}`);
  }
  if (request.auth === "apikey") {
    const name = (request.apiKeyName || "").trim();
    const value = request.apiKeyValue || "";
    if (!name || !value)
      throw new HttpError(
        "validation",
        "Enter an API key name and value, or select No auth.",
      );
    if (/[\r\n]/.test(name + value))
      throw new HttpError(
        "validation",
        "API key fields cannot contain line breaks.",
      );
    if (request.apiKeyIn === "query") {
      if (url.searchParams.has(name))
        throw new HttpError(
          "validation",
          "The API key is set in both Params and Auth. Choose one.",
        );
      url.searchParams.append(name, value);
    } else {
      if (
        !/^[!#$%&'*+.^_`|~\w-]+$/.test(name) ||
        forbidden.test(name) ||
        /^(proxy-|sec-)/i.test(name)
      )
        throw new HttpError(
          "validation",
          "Choose an API key header name supported by the browser.",
        );
      if (headers.has(name))
        throw new HttpError(
          "validation",
          "The API key is set in both Headers and Auth. Choose one.",
        );
      headers.set(name, value);
    }
  }
  // Every user-supplied value may be a secret, including custom headers and query keys.
  const sensitive =
    request.sensitiveUrl === true ||
    ["bearer", "basic", "apikey"].includes(request.auth) ||
    request.headers.some((r) => r.enabled && r.value) ||
    !!url.search ||
    !!request.body ||
    !!request.binaryFile ||
    (request.multipart || []).some(
      (row) => row.enabled && (row.value || row.file),
    );
  if (
    request.credentialOrigin &&
    sensitive &&
    request.credentialOrigin !== url.origin
  ) {
    throw new HttpError(
      "origin",
      `The destination changed to ${url.origin}. Review the URL, headers, body, and credentials before approving this destination.`,
    );
  }
  if (
    url.protocol === "http:" &&
    sensitive &&
    request.credentialOrigin !== url.origin
  ) {
    throw new HttpError(
      "origin",
      `This destination uses unencrypted HTTP: ${url.origin}. Review any credentials or private data before approving it for development.`,
    );
  }
  let body;
  if (
    !["GET", "HEAD"].includes(request.method) &&
    request.bodyMode !== "none"
  ) {
    if (["multipart", "binary"].includes(request.bodyMode))
      return { url, headers, body: uploadBody(request, headers) };
    body = request.body;
    if (request.bodyMode === "json") {
      try {
        JSON.parse(body);
      } catch {
        throw new HttpError(
          "validation",
          "The JSON body is invalid. Fix it or select Text to send the exact content.",
        );
      }
      if (!headers.has("content-type"))
        headers.set("Content-Type", "application/json");
    } else if (request.bodyMode === "form") {
      body = new URLSearchParams(body).toString();
      if (!headers.has("content-type"))
        headers.set("Content-Type", "application/x-www-form-urlencoded");
    } else if (!headers.has("content-type"))
      headers.set("Content-Type", "text/plain;charset=UTF-8");
  }
  return { url, headers, body };
}
/** History is memory-only, metadata only: no URL, headers, bodies, auth, or response values. */
export function historySummary(request, response) {
  return {
    id: crypto.randomUUID(),
    requestId: request.id,
    method: request.method,
    at: Date.now(),
    status: response.status,
    totalMs: response.totalMs,
    size: response.size,
  };
}
export function queryRows(url) {
  const end = url.indexOf("#");
  const base = end < 0 ? url : url.slice(0, end);
  const start = base.indexOf("?");
  return start < 0
    ? []
    : [...new URLSearchParams(base.slice(start + 1))].map(([k, v]) =>
        newRow(k, v),
      );
}
export function applyQuery(url, rows) {
  const hashAt = url.indexOf("#");
  const hash = hashAt < 0 ? "" : url.slice(hashAt);
  const base = (hashAt < 0 ? url : url.slice(0, hashAt)).split("?")[0];
  const query = new URLSearchParams();
  rows
    .filter((r) => r.enabled && r.key)
    .forEach((r) => query.append(r.key, r.value));
  return base + (query.size ? `?${query}` : "") + hash;
}

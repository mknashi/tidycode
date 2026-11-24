import { savedMultipart } from "./uploads.js";
import { validateAssertions } from "./assertions.js";
import { assignResponseVariable } from "./responseValues.js";
import { safeAuth } from "./auth.js";
import { emptyVariables, validateVariables } from "./variables.js";
import {
  createRequest,
  newRow,
  queryRows,
  DISPLAY_LIMIT,
  templateUrl,
  credentialReference,
  applyQuery,
} from "./request.js";
const DB_NAME = "tidycode-api-client";
const MAX_RECORDS = 200;
let queue = Promise.resolve();
function database() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    let blocked = false;
    open.onupgradeneeded = () => {
      open.result.createObjectStore("requests", { keyPath: "id" });
      open.result.createObjectStore("workspace");
    };
    open.onsuccess = () => {
      if (blocked) open.result.close();
      else resolve(open.result);
    };
    open.onerror = () =>
      reject(
        new Error(
          "Local API storage is unavailable. Your draft is still in memory.",
        ),
      );
    open.onblocked = () => {
      blocked = true;
      reject(new Error("Close other Tidy Code tabs and retry local storage."));
    };
  });
}
async function transaction(stores, mode, action) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const result = action(tx);
      tx.oncomplete = () => {
        try {
          resolve(typeof result === "function" ? result() : undefined);
        } catch (error) {
          reject(error);
        }
      };
      tx.onerror = tx.onabort = () =>
        reject(
          new Error(
            "Could not update local API storage. Your in-memory draft is unchanged.",
          ),
        );
    });
  } finally {
    db.close();
  }
}
function write(action) {
  const next = queue.then(action);
  queue = next.catch(() => {});
  return next;
}
export function savedTemplate(request, options = {}) {
  let url;
  try {
    url = templateUrl(request.url);
  } catch {
    throw new Error(
      "Use a valid HTTP(S) URL or variable template without embedded credentials before saving.",
    );
  }
  const rows = request.params || queryRows(request.url);
  const params = rows.map((r) => ({
    ...newRow(r.key, options.query ? r.value : ""),
    enabled: r.enabled,
  }));
  url = applyQuery(url, params);
  const headers = request.headers.map((r) => ({
    ...newRow(
      r.key,
      /authorization|cookie|token|secret|password|api[-_]?key/i.test(
        r.key.trim(),
      )
        ? options.headers
          ? credentialReference(r.value)
          : ""
        : options.headers
          ? r.value
          : "",
    ),
    enabled: r.enabled,
  }));
  return {
    version: 1,
    id: request.id,
    name: request.name,
    method: request.method,
    url,
    params,
    headers,
    bodyMode: request.bodyMode,
    multipart: savedMultipart(request.multipart || [], options.body),
    binaryFile: null,
    body: options.body ? request.body : "",
    assertions: options.assertions
      ? validateAssertions(request.assertions || [])
      : [],
    timeoutMs: request.timeoutMs,
    ...safeAuth(request),
    token: credentialReference(request.token),
    credentialOrigin: "",
    collectionId:
      typeof request.collectionId === "string" ? request.collectionId : null,
    folderId: typeof request.folderId === "string" ? request.folderId : null,
  };
}
// Compare content, not regenerated row identifiers or temporary destination approvals.
export function templateSignature(request) {
  return JSON.stringify({
    ...request,
    assertions: validateAssertions(request.assertions || []),
    ...safeAuth(request),
    token: credentialReference(request.token),
    credentialOrigin: "",
    params: request.params.map(({ id, ...r }) => r),
    headers: request.headers.map(({ id, ...r }) => r),
  });
}
export function responseSnapshot(response) {
  if (!response) return null;
  if (response.bytes.byteLength > DISPLAY_LIMIT)
    throw new Error("Only responses up to 1 MiB can be saved.");
  let binary = "";
  for (let offset = 0; offset < response.bytes.length; offset += 32768)
    binary += String.fromCharCode(
      ...response.bytes.subarray(offset, offset + 32768),
    );
  return validateSnapshot({
    version: 1,
    at: response.receivedAt || Date.now(),
    status: response.status,
    statusText: response.statusText,
    contentType: response.contentType,
    size: response.size,
    totalMs: response.totalMs,
    headersMs: response.headersMs,
    headers: response.headers,
    bodyBase64: btoa(binary),
    environmentName: response.environmentName || "",
  });
}
export function validateSnapshot(snapshot) {
  if (snapshot == null) return null;
  if (
    snapshot.version !== 1 ||
    !Number.isFinite(snapshot.at) ||
    snapshot.at <= 0 ||
    !Number.isInteger(snapshot.status) ||
    snapshot.status < 100 ||
    snapshot.status > 599 ||
    typeof snapshot.statusText !== "string" ||
    typeof snapshot.contentType !== "string" ||
    !Number.isFinite(snapshot.totalMs) ||
    snapshot.totalMs < 0 ||
    !Array.isArray(snapshot.headers) ||
    snapshot.headers.length > 500 ||
    typeof snapshot.bodyBase64 !== "string" ||
    snapshot.bodyBase64.length > Math.ceil(DISPLAY_LIMIT / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(snapshot.bodyBase64)
  )
    throw new Error("Saved response snapshot is invalid.");
  const bytes = atob(snapshot.bodyBase64).length;
  if (bytes > DISPLAY_LIMIT || bytes !== snapshot.size)
    throw new Error("Saved response size is invalid.");
  const headers = snapshot.headers.filter((row) => {
    if (
      !Array.isArray(row) ||
      row.length !== 2 ||
      row.some((value) => typeof value !== "string")
    )
      throw new Error("Saved response headers are invalid.");
    return !/authorization|cookie|token|secret|password|api[-_]?key|^location$/i.test(
      row[0],
    );
  });
  if (JSON.stringify(headers).length > 65536)
    throw new Error("Saved response headers exceed the storage limit.");
  return {
    version: 1,
    at: snapshot.at,
    status: snapshot.status,
    statusText: snapshot.statusText.slice(0, 256),
    contentType: snapshot.contentType.slice(0, 1024),
    size: bytes,
    totalMs: snapshot.totalMs,
    headersMs: Number.isFinite(snapshot.headersMs)
      ? Math.max(0, snapshot.headersMs)
      : 0,
    headers,
    bodyBase64: snapshot.bodyBase64,
    environmentName:
      typeof snapshot.environmentName === "string"
        ? snapshot.environmentName.slice(0, 200)
        : "",
  };
}
export function restoreResponse(snapshot) {
  if (!snapshot) return undefined;
  return {
    status: snapshot.status,
    statusText: snapshot.statusText,
    contentType: snapshot.contentType,
    size: snapshot.size,
    totalMs: snapshot.totalMs,
    headersMs: snapshot.headersMs,
    headers: snapshot.headers,
    bytes: Uint8Array.from(atob(snapshot.bodyBase64), (c) => c.charCodeAt(0)),
    receivedAt: snapshot.at,
    savedSnapshot: true,
    environmentName: snapshot.environmentName || "",
  };
}
export function validateRecord(record) {
  const r = record?.request;
  if (
    record?.version !== 1 ||
    !r ||
    typeof r.id !== "string" ||
    typeof r.url !== "string" ||
    typeof r.name !== "string" ||
    !["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(
      r.method,
    ) ||
    !["none", "json", "text", "form", "multipart", "binary"].includes(
      r.bodyMode,
    ) ||
    !Array.isArray(r.headers) ||
    !Array.isArray(r.params) ||
    r.headers.length > 500 ||
    r.params.length > 500 ||
    typeof r.body !== "string" ||
    JSON.stringify(r).length > 2 * 1024 * 1024
  )
    throw new Error(
      "A saved API request is invalid. Stored data was left untouched.",
    );
  for (const row of [...r.headers, ...r.params])
    if (
      typeof row.key !== "string" ||
      typeof row.value !== "string" ||
      typeof row.enabled !== "boolean"
    )
      throw new Error(
        "Saved API fields are invalid. Stored data was left untouched.",
      );
  const options = {
    query: record.options?.query === true,
    headers: record.options?.headers === true,
    body: record.options?.body === true,
    response: record.options?.response === true,
    assertions: record.options?.assertions === true,
  };
  const clean = savedTemplate(
    createRequest({
      id: r.id,
      name: r.name,
      method: r.method,
      url: r.url,
      headers: r.headers,
      collectionId: typeof r.collectionId === "string" ? r.collectionId : null,
      folderId: typeof r.folderId === "string" ? r.folderId : null,
      params: r.params,
      assertions: validateAssertions(r.assertions || []),
      bodyMode: r.bodyMode,
      multipart: savedMultipart(r.multipart || [], options.body),
      binaryFile: null,
      body: r.body,
      ...safeAuth(r),
      token: credentialReference(r.token),
      timeoutMs: Math.max(1000, Math.min(120000, Number(r.timeoutMs) || 30000)),
    }),
    options,
  );
  return {
    version: 1,
    id: clean.id,
    request: clean,
    options,
    response: options.response ? validateSnapshot(record.response) : null,
  };
}
export function validateCollections(value) {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error("Invalid collections.");
  const ids = new Set();
  return value.map((c) => {
    if (
      !c ||
      typeof c.id !== "string" ||
      ids.has(c.id) ||
      typeof c.name !== "string" ||
      c.name.length > 500 ||
      !Array.isArray(c.folders) ||
      c.folders.length > 200
    )
      throw new Error("Invalid collection data.");
    ids.add(c.id);
    const folderIds = new Set(c.folders.map((f) => f.id));
    if (folderIds.size !== c.folders.length)
      throw new Error("Duplicate folder identifiers.");
    const folders = c.folders.map((f) => {
      if (
        typeof f.id !== "string" ||
        typeof f.name !== "string" ||
        f.name.length > 500 ||
        (f.parentId !== null && !folderIds.has(f.parentId))
      )
        throw new Error("Invalid folder data.");
      let parent = f;
      const visited = new Set();
      while (parent) {
        if (visited.has(parent.id) || visited.size > 12)
          throw new Error("Invalid folder hierarchy.");
        visited.add(parent.id);
        parent = c.folders.find((p) => p.id === parent.parentId);
      }
      return { id: f.id, name: f.name, parentId: f.parentId };
    });
    return {
      id: c.id,
      name: c.name,
      sourceFormat: ["openapi", "postman", "curl", "http"].includes(
        c.sourceFormat,
      )
        ? c.sourceFormat
        : undefined,
      folders,
      forkedFrom: typeof c.forkedFrom === "string" ? c.forkedFrom : null,
    };
  });
}
export const apiStore = {
  importEnvironments: (environments) =>
    write(() =>
      transaction(["workspace"], "readwrite", (tx) => {
        const store = tx.objectStore("workspace"),
          read = store.get("variables");
        read.onsuccess = () => {
          try {
            const existing = validateVariables(read.result || emptyVariables());
            store.put(
              validateVariables(
                {
                  ...existing,
                  environments: [...existing.environments, ...environments],
                },
                true,
              ),
              "variables",
            );
          } catch {
            tx.abort();
          }
        };
      }),
    ),
  responseVariable: (scope, request, row, overwrite, environment) =>
    write(() =>
      transaction(["workspace"], "readwrite", (tx) => {
        const store = tx.objectStore("workspace");
        const read = store.get("variables");
        read.onsuccess = () => {
          try {
            const settings = validateVariables(read.result || emptyVariables());
            if (
              scope.startsWith("env:") &&
              !settings.environments.some((e) => "env:" + e.id === scope) &&
              environment
            )
              settings.environments.push({ ...environment, variables: [] });
            store.put(
              validateVariables(
                assignResponseVariable(
                  settings,
                  scope,
                  request,
                  row,
                  overwrite,
                ),
                true,
              ),
              "variables",
            );
          } catch {
            tx.abort();
          }
        };
      }),
    ),
  variables: (settings) =>
    write(() =>
      transaction(["workspace"], "readwrite", (tx) => {
        tx.objectStore("workspace").put(
          validateVariables(settings, true),
          "variables",
        );
      }),
    ),
  removeEnvironment: (id) =>
    write(() =>
      transaction(["workspace"], "readwrite", (tx) => {
        const store = tx.objectStore("workspace");
        const read = store.get("variables");
        read.onsuccess = () => {
          try {
            const value = validateVariables(
              read.result || emptyVariables(),
              true,
            );
            value.environments = value.environments.filter((e) => e.id !== id);
            if (value.activeId === id) value.activeId = null;
            store.put(value, "variables");
          } catch {
            tx.abort();
          }
        };
      }),
    ),
  selectEnvironment: (id) =>
    write(() =>
      transaction(["workspace"], "readwrite", (tx) => {
        const store = tx.objectStore("workspace");
        const read = store.get("variables");
        read.onsuccess = () => {
          try {
            const value = validateVariables(
              read.result || emptyVariables(),
              true,
            );
            value.activeId = value.environments.some((e) => e.id === id)
              ? id
              : null;
            store.put(value, "variables");
          } catch {
            tx.abort();
          }
        };
      }),
    ),
  organize: (collections, records = []) =>
    write(() =>
      transaction(["requests", "workspace"], "readwrite", (tx) => {
        const clean = validateCollections(collections);
        const checked = records.map(validateRecord);
        const store = tx.objectStore("requests");
        const keys = store.getAllKeys();
        keys.onsuccess = () => {
          const all = new Set([...keys.result, ...checked.map((r) => r.id)]);
          if (all.size > MAX_RECORDS) {
            tx.abort();
            return;
          }
          for (const record of checked) store.put(record);
          tx.objectStore("workspace").put(clean, "collections");
        };
      }),
    ),
  load: () =>
    transaction(["requests", "workspace"], "readonly", (tx) => {
      const records = tx.objectStore("requests").getAll();
      const workspace = tx.objectStore("workspace").get("state");
      const collections = tx.objectStore("workspace").get("collections");
      const variables = tx.objectStore("workspace").get("variables");
      return () => {
        if (records.result.length > MAX_RECORDS)
          throw new Error(
            "Too many saved API requests. Stored data was left untouched.",
          );
        return {
          records: records.result.map(validateRecord),
          workspace: workspace.result,
          collections: validateCollections(collections.result || []),
          variables: validateVariables(
            variables.result || emptyVariables(),
            true,
          ),
        };
      };
    }),
  save: (record, workspaceState) =>
    write(() =>
      transaction(["requests", "workspace"], "readwrite", (tx) => {
        const clean = validateRecord(record);
        const store = tx.objectStore("requests");
        const put = () => {
          store.put(clean);
          if (workspaceState)
            tx.objectStore("workspace").put(workspaceState, "state");
        };
        const count = store.count();
        count.onsuccess = () => {
          if (count.result < MAX_RECORDS) {
            put();
            return;
          }
          const existing = store.get(clean.id);
          existing.onsuccess = () => {
            if (existing.result) put();
            else tx.abort();
          };
        };
      }),
    ),
  workspace: (state) =>
    write(() =>
      transaction(["workspace"], "readwrite", (tx) => {
        tx.objectStore("workspace").put(state, "state");
      }),
    ),
  remove: (id) =>
    write(() =>
      transaction(["requests"], "readwrite", (tx) => {
        tx.objectStore("requests").delete(id);
      }),
    ),
  clear: () =>
    write(() =>
      transaction(["requests", "workspace"], "readwrite", (tx) => {
        tx.objectStore("requests").clear();
        tx.objectStore("workspace").clear();
      }),
    ),
};

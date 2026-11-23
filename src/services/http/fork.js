import { savedMultipart } from "./uploads.js";
import { safeAuth } from "./auth.js";
import {
  applyQuery,
  createRequest,
  newRow,
  queryRows,
  credentialReference,
} from "./request.js";
import { responseSnapshot, validateSnapshot } from "./store.js";
const credentialHeader =
  /authorization|cookie|token|secret|password|api[-_]?key/i;
/** Fork only definitions/snapshots: IDs, auth credentials and execution state never carry over. */
export function buildForkPreview(collection, requests, responses = {}) {
  const source = requests.filter((r) => r.collectionId === collection.id);
  if (source.length > 200 || collection.folders.length > 200)
    throw new Error("Fork at most 200 requests and folders at a time.");
  const id = crypto.randomUUID();
  const folders = new Map(
    collection.folders.map((f) => [f.id, crypto.randomUUID()]),
  );
  const snapshots = {};
  const warnings = new Set();
  if (source.some((r) => r.assertions?.length))
    warnings.add("Assertions are not copied by local forks yet.");
  let credentials = 0;
  const hosts = new Set();
  const copies = source.map((r) => {
    let url = r.url;
    try {
      const parsed = new URL(url);
      if (parsed.username || parsed.password) {
        parsed.username = "";
        parsed.password = "";
        url = parsed.href;
        warnings.add("Credentials embedded in URLs were removed.");
      }
      hosts.add(parsed.origin);
    } catch {
      hosts.add("Unresolved URL");
    }
    if (
      r.token ||
      r.username ||
      r.password ||
      r.apiKeyValue ||
      r.headers.some((h) => credentialHeader.test(h.key) && h.value)
    )
      credentials++;
    const copy = createRequest({
      name: r.name,
      method: r.method,
      url,
      timeoutMs: r.timeoutMs,
      bodyMode: r.bodyMode,
      multipart: savedMultipart(r.multipart || [], true),
      binaryFile: null,
      body: r.body,
      ...safeAuth(r),
      token: credentialReference(r.token),
      credentialOrigin: "",
      collectionId: id,
      folderId: folders.get(r.folderId) || null,
      headers: r.headers.map((h) => ({
        ...newRow(
          h.key,
          credentialHeader.test(h.key) ? credentialReference(h.value) : h.value,
        ),
        enabled: h.enabled,
      })),
      params: (r.params || queryRows(r.url)).map((p) => ({
        ...newRow(p.key, p.value),
        enabled: p.enabled,
      })),
    });
    const response = responses[r.id];
    if (response) {
      try {
        const snapshot = response.bytes
          ? responseSnapshot(response)
          : validateSnapshot(response);
        if (snapshot)
          snapshots[copy.id] = {
            ...snapshot,
            headers: snapshot.headers.map((row) => [...row]),
          };
      } catch {
        warnings.add(
          "Responses larger than 1 MiB or invalid snapshots were not copied.",
        );
      }
    }
    return copy;
  });
  warnings.add(
    "This is an independent local fork. Upstream updates and merging are not supported.",
  );
  if (credentials)
    warnings.add(
      "Literal authentication credentials, destination approvals, and known credential headers were removed from the fork.",
    );
  return {
    format: "fork",
    collection: {
      id,
      name: collection.name.slice(0, 480) + " — My fork",
      forkedFrom: collection.id,
      folders: collection.folders.map((f) => ({
        id: folders.get(f.id),
        name: f.name,
        parentId: folders.get(f.parentId) || null,
      })),
    },
    requests: copies,
    responseSnapshots: snapshots,
    warnings: [...warnings],
    hosts: [...hosts],
    credentials,
  };
}
export function applyForkOptions(preview, options) {
  return {
    ...preview,
    requests: preview.requests.map((r) => {
      const params = r.params.map((p) => ({
        ...p,
        value: options.query ? p.value : "",
      }));
      return {
        ...r,
        url: applyQuery(r.url, params),
        params,
        headers: r.headers.map((h) => ({
          ...h,
          value: !options.headers
            ? ""
            : credentialHeader.test(h.key)
              ? credentialReference(h.value)
              : h.value,
        })),
        body: options.body ? r.body : "",
        multipart: savedMultipart(r.multipart || [], options.body),
        binaryFile: null,
        ...safeAuth(r),
        token: credentialReference(r.token),
        credentialOrigin: "",
      };
    }),
    responseSnapshots: options.response ? preview.responseSnapshots : {},
  };
}

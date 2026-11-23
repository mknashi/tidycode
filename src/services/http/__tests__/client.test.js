import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  createRequest,
  prepareRequest,
  newRow,
  applyQuery,
  queryRows,
  historySummary,
} from "../request.js";
import { sendBrowserRequest } from "../webTransport.js";

test("ordered query rows retain duplicates, blanks, disabled drafts and fragments", () => {
  const rows = queryRows(
    "https://example.test/path?tag=a&tag=b&empty=#section",
  );
  assert.deepEqual(
    rows.map((r) => [r.key, r.value]),
    [
      ["tag", "a"],
      ["tag", "b"],
      ["empty", ""],
    ],
  );
  rows[1].enabled = false;
  assert.equal(
    applyQuery("https://example.test/path?old=1#section", rows),
    "https://example.test/path?tag=a&empty=#section",
  );
});
test("credential boundaries and browser header restrictions are validated before sending", () => {
  assert.throws(
    () => prepareRequest(createRequest({ url: "file:///secret" })),
    /HTTP or HTTPS/,
  );
  assert.throws(
    () => prepareRequest(createRequest({ url: "https://u:p@example.test" })),
    /credentials/,
  );
  assert.throws(
    () =>
      prepareRequest(
        createRequest({
          url: "https://example.test",
          headers: [newRow("Cookie", "secret")],
        }),
      ),
    /cannot be controlled/,
  );
  assert.throws(
    () =>
      prepareRequest(
        createRequest({
          url: "https://example.test",
          headers: [newRow("X-Key", "a\r\nb")],
        }),
      ),
    /line break/,
  );
  assert.throws(
    () =>
      prepareRequest(
        createRequest({
          url: "https://other.test",
          auth: "bearer",
          token: "sentinel",
          credentialOrigin: "https://example.test",
        }),
      ),
    { code: "origin" },
  );
  assert.throws(
    () =>
      prepareRequest(
        createRequest({
          url: "https://example.test",
          auth: "bearer",
          token: "sentinel",
          headers: [newRow("Authorization", "other")],
        }),
      ),
    /both Headers and Auth/,
  );
  assert.throws(
    () =>
      prepareRequest(
        createRequest({
          url: "http://localhost:8080",
          auth: "bearer",
          token: "sentinel",
        }),
      ),
    { code: "origin" },
  );
});
test("body validation preserves definitions and GET does not send draft bodies", () => {
  const req = createRequest({
    url: "https://example.test",
    method: "POST",
    bodyMode: "json",
    body: "{invalid",
  });
  assert.throws(() => prepareRequest(req), /JSON body is invalid/);
  assert.equal(req.body, "{invalid");
  req.method = "GET";
  assert.equal(prepareRequest(req).body, undefined);
});
test("transport uses privacy defaults and never retries failure", async () => {
  let calls = 0;
  const req = createRequest({
    url: "https://example.test",
    auth: "bearer",
    token: "sentinel",
  });
  await assert.rejects(
    sendBrowserRequest(req, {
      fetchImpl: async (_, options) => {
        calls++;
        assert.equal(options.credentials, "omit");
        assert.equal(options.redirect, "error");
        assert.equal(options.referrerPolicy, "no-referrer");
        assert.equal(options.cache, "no-store");
        throw new Error("sentinel URL error");
      },
    }),
    (e) => e.code === "network" && !e.message.includes("sentinel"),
  );
  assert.equal(calls, 1);
});
test("metadata-only history contains no request or response content", () => {
  const request = createRequest({
    url: "https://secret.test/private?token=sentinel",
    name: "sentinel",
    token: "sentinel",
    body: "sentinel",
  });
  const summary = historySummary(request, {
    status: 200,
    totalMs: 12,
    size: 20,
    body: "sentinel",
  });
  assert.ok(!JSON.stringify(summary).includes("sentinel"));
  assert.ok(!JSON.stringify(summary).includes("secret.test"));
});
test("HTTP fixture: raw bytes, errors, redirects, timeout, cancellation and size limits", async (t) => {
  let redirects = 0;
  const server = http.createServer((req, res) => {
    if (req.url === "/slow") {
      const timer = setTimeout(() => res.end("late"), 1000);
      res.on("close", () => clearTimeout(timer));
      return;
    }
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "/target" });
      res.end();
      return;
    }
    if (req.url === "/target") redirects++;
    if (req.url === "/large") {
      res.end(Buffer.alloc(1024));
      return;
    }
    if (req.url === "/binary") {
      res.end(Buffer.from([0, 255, 128]));
      return;
    }
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end('{"error":"unauthorized"}');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path) =>
    createRequest({ url: origin + path, credentialOrigin: origin });
  const error = await sendBrowserRequest(request("/"));
  assert.equal(error.status, 401);
  assert.equal(
    new TextDecoder().decode(error.bytes),
    '{"error":"unauthorized"}',
  );
  const binary = await sendBrowserRequest(request("/binary"));
  assert.deepEqual([...binary.bytes], [0, 255, 128]);
  await assert.rejects(sendBrowserRequest(request("/redirect")), {
    code: "network",
  });
  assert.equal(redirects, 0);
  await assert.rejects(sendBrowserRequest(request("/large"), { limit: 20 }), {
    code: "size",
  });
  await assert.rejects(
    sendBrowserRequest({ ...request("/slow"), timeoutMs: 100 }),
    { code: "timeout" },
  );
  const controller = new AbortController();
  const pending = sendBrowserRequest(request("/slow"), {
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, { code: "cancelled" });
});

test("local templates omit credentials and default-exclude arbitrary field values", async () => {
  const { savedTemplate, templateSignature, validateRecord } = await import(
    "../store.js"
  );
  const req = createRequest({
    name: "Customers",
    url: "https://example.test/users?token=query-sentinel#secret",
    auth: "bearer",
    token: "bearer-sentinel",
    bodyMode: "json",
    body: '{"private":"body-sentinel"}',
    credentialOrigin: "https://example.test",
    headers: [
      newRow("Authorization", "header-sentinel"),
      newRow("X-Api-Key", "key-sentinel"),
      newRow("X-Session-Token", "session-sentinel"),
      newRow("X-Custom", "custom-sentinel"),
    ],
  });
  const safe = savedTemplate(req);
  assert.ok(!JSON.stringify(safe).includes("sentinel"));
  assert.equal(safe.token, "");
  assert.equal(safe.credentialOrigin, "");
  const explicit = savedTemplate(req, {
    query: true,
    headers: true,
    body: true,
  });
  assert.equal(explicit.headers[0].value, "");
  assert.equal(explicit.headers[1].value, "");
  assert.equal(explicit.headers[2].value, "");
  assert.equal(explicit.headers[3].value, "custom-sentinel");
  assert.match(explicit.body, /body-sentinel/);
  assert.match(explicit.url, /query-sentinel/);
  assert.equal(templateSignature(safe), templateSignature(savedTemplate(req)));
  const record = validateRecord({
    version: 1,
    request: {
      ...explicit,
      token: "injected-token",
      credentialOrigin: "https://evil.test",
    },
    options: { query: true, headers: true, body: true },
  });
  assert.equal(record.request.token, "");
  assert.equal(record.request.credentialOrigin, "");
  assert.throws(() => validateRecord({ version: 2, request: req }));
  assert.throws(() =>
    savedTemplate({ ...req, url: "https://user:secret@example.test" }),
  );
});

test("response snapshots are opt-in, bounded, preserve bytes, and omit credential headers", async () => {
  const { responseSnapshot, restoreResponse, validateRecord } = await import(
    "../store.js"
  );
  const bytes = Uint8Array.from([0, 128, 255]);
  const snapshot = responseSnapshot({
    bytes,
    size: 3,
    status: 201,
    statusText: "Created",
    contentType: "application/octet-stream",
    totalMs: 12,
    headersMs: 4,
    receivedAt: 1700000000000,
    headers: [
      ["content-type", "application/octet-stream"],
      ["set-cookie", "secret"],
      ["authorization", "secret"],
      ["x-api-key", "secret"],
      ["location", "https://example.test?token=secret"],
    ],
  });
  assert.deepEqual([...restoreResponse(snapshot).bytes], [...bytes]);
  assert.equal(restoreResponse(snapshot).savedSnapshot, true);
  assert.deepEqual(snapshot.headers, [
    ["content-type", "application/octet-stream"],
  ]);
  const request = createRequest({ url: "https://example.test" });
  assert.equal(
    validateRecord({ version: 1, request, options: {}, response: snapshot })
      .response,
    null,
  );
  assert.equal(
    validateRecord({
      version: 1,
      request,
      options: { response: true },
      response: snapshot,
    }).response.status,
    201,
  );
  assert.throws(
    () =>
      responseSnapshot({
        ...restoreResponse(snapshot),
        bytes: new Uint8Array(1024 * 1024 + 1),
      }),
    /1 MiB/,
  );
  const boundary = new Uint8Array(1024 * 1024);
  assert.equal(
    responseSnapshot({
      ...restoreResponse(snapshot),
      bytes: boundary,
      size: boundary.length,
    }).size,
    boundary.length,
  );
  assert.throws(() =>
    validateRecord({
      version: 1,
      request,
      options: { response: true },
      response: { ...snapshot, bodyBase64: "not base64" },
    }),
  );
});

test("cURL import is literal, preserves request details, and rejects executable/file syntax", async () => {
  const { parseImport } = await import("../importers.js");
  const parsed = parseImport(
    `curl 'https://example.test/items?tag=a&tag=b' -H 'Authorization: Bearer secret' --json '{"name":"Avery"}'`,
  );
  assert.equal(parsed.requests[0].method, "POST");
  assert.equal(parsed.requests[0].bodyMode, "json");
  assert.equal(parsed.requests[0].params.length, 2);
  assert.equal(parsed.credentials, 1);
  assert.throws(
    () => parseImport("curl https://example.test --data @/etc/passwd"),
    /file references/,
  );
  assert.throws(() => parseImport("curl $(cat secret)"), /substitutions/);
  assert.throws(
    () => parseImport("curl https://example.test; echo bad"),
    /operators/,
  );
  assert.throws(() => parseImport("curl file:///etc/passwd"), /HTTP/);
  assert.throws(
    () => parseImport("curl https://example.test --upload-file secret"),
    /Unsupported/,
  );
  assert.equal(
    parseImport("curl https://example.test -k -L").warnings.length,
    2,
  );
});
test("Postman imports nested folders and inherited auth without executing scripts", async () => {
  const { parseImport } = await import("../importers.js");
  const doc = {
    info: {
      name: "Customers",
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    auth: { type: "bearer", bearer: [{ key: "token", value: "secret" }] },
    event: [{ script: { exec: ['throw new Error("never")'] } }],
    item: [
      {
        name: "Users",
        item: [
          {
            name: "List",
            request: { method: "GET", url: "https://example.test/users" },
          },
        ],
      },
    ],
  };
  const parsed = parseImport(JSON.stringify(doc));
  assert.equal(parsed.collection.name, "Customers");
  assert.equal(parsed.collection.folders.length, 1);
  assert.equal(parsed.requests[0].folderId, parsed.collection.folders[0].id);
  assert.equal(parsed.requests[0].token, "secret");
  assert.match(parsed.warnings.join(" "), /scripts were skipped/);
  assert.equal(
    parseImport(JSON.stringify(doc)).requests[0].id === parsed.requests[0].id,
    false,
  );
});
test("HTTP-file import supports named requests, headers, JSON bodies, and placeholders", async () => {
  const { parseImport } = await import("../importers.js");
  const parsed = parseImport(
    '### List customers\nGET https://example.test/users\nAccept: application/json\n\n### Create customer\nPOST https://example.test/users\nContent-Type: application/json\n\n{"name":"Avery"}',
    "http",
  );
  assert.equal(parsed.requests.length, 2);
  assert.equal(parsed.requests[0].name, "List customers");
  assert.equal(parsed.requests[1].bodyMode, "json");
  assert.equal(parsed.requests[1].body, '{"name":"Avery"}');
  const variable = parseImport("GET {{base_url}}/users", "http");
  assert.match(variable.warnings.join(" "), /unresolved/i);
  assert.throws(
    () => parseImport("GET https://example.test\n\n> {% script %}", "http"),
    /scripts/,
  );
});
test("OpenAPI JSON/YAML imports operations and does not fetch external references", async () => {
  const { parseImport } = await import("../importers.js");
  const doc = {
    openapi: "3.0.3",
    info: { title: "Catalog" },
    servers: [{ url: "https://example.test" }],
    paths: {
      "/items/{id}": {
        get: {
          parameters: [
            { name: "id", in: "path", required: true, example: "42" },
            { name: "limit", in: "query", example: 2 },
          ],
        },
        post: { requestBody: { $ref: "https://private.test/spec.json" } },
      },
    },
  };
  const parsed = parseImport(JSON.stringify(doc));
  assert.equal(parsed.requests.length, 2);
  assert.equal(parsed.requests[0].url, "https://example.test/items/42?limit=2");
  assert.match(parsed.warnings.join(" "), /not fetched/);
  const yaml =
    "openapi: 3.1.0\ninfo:\n  title: YAML API\npaths:\n  /health:\n    get:\n      summary: Health\n";
  assert.equal(parseImport(yaml).requests[0].url, "{{base_url}}/health");
  assert.throws(() => parseImport("x".repeat(10 * 1024 * 1024 + 1)), /10 MiB/);
});
test("collection metadata rejects cycles and request preparation blocks unresolved auth/body values", async () => {
  const { validateCollections } = await import("../store.js");
  assert.throws(
    () =>
      validateCollections([
        {
          id: "c",
          name: "C",
          folders: [
            { id: "a", name: "A", parentId: "b" },
            { id: "b", name: "B", parentId: "a" },
          ],
        },
      ]),
    /hierarchy/,
  );
  assert.throws(
    () =>
      prepareRequest(
        createRequest({
          url: "https://example.test",
          headers: [newRow("X-Key", "{{token}}")],
        }),
      ),
    /unresolved/,
  );
  assert.throws(
    () =>
      prepareRequest(
        createRequest({
          url: "https://example.test",
          method: "POST",
          bodyMode: "json",
          body: '{"token":"{{token}}"}',
        }),
      ),
    /unresolved/,
  );
});

test("local forks remap every identifier, exclude auth, preserve independent drafts, and honor copy choices", async () => {
  const { buildForkPreview, applyForkOptions } = await import("../fork.js");
  const collection = {
    id: "original",
    name: "Customers",
    folders: [
      { id: "parent", name: "Users", parentId: null },
      { id: "child", name: "Create", parentId: "parent" },
    ],
  };
  const request = createRequest({
    collectionId: "original",
    folderId: "child",
    url: "https://example.test?limit=2",
    name: "Unsaved current name",
    auth: "bearer",
    token: "auth-secret",
    credentialOrigin: "https://example.test",
    headers: [
      newRow("Authorization", "header-secret"),
      newRow("X-Other", "keep"),
    ],
    method: "POST",
    bodyMode: "json",
    body: '{"a":1}',
  });
  const response = {
    bytes: new TextEncoder().encode('{"ok":true}'),
    size: 11,
    status: 200,
    statusText: "OK",
    contentType: "application/json",
    totalMs: 12,
    headersMs: 4,
    headers: [["content-type", "application/json"]],
    receivedAt: 1700000000000,
  };
  const fork = buildForkPreview(collection, [request], {
    [request.id]: response,
  });
  assert.notEqual(fork.collection.id, collection.id);
  assert.equal(fork.collection.forkedFrom, collection.id);
  assert.notEqual(fork.requests[0].id, request.id);
  assert.equal(fork.requests[0].token, "");
  assert.equal(fork.requests[0].credentialOrigin, "");
  assert.equal(fork.requests[0].headers[0].value, "");
  assert.equal(fork.requests[0].body, request.body);
  assert.equal(
    fork.collection.folders[1].parentId,
    fork.collection.folders[0].id,
  );
  assert.equal(fork.requests[0].folderId, fork.collection.folders[1].id);
  assert.equal(fork.requests[0].collectionId, fork.collection.id);
  fork.requests[0].headers[1].value = "changed";
  assert.equal(request.headers[1].value, "keep");
  assert.equal(request.token, "auth-secret");
  assert.equal(collection.folders[1].parentId, "parent");
  const excluded = applyForkOptions(fork, {
    query: false,
    headers: false,
    body: false,
    response: false,
  });
  assert.equal(excluded.requests[0].params[0].value, "");
  assert.equal(excluded.requests[0].body, "");
  assert.equal(excluded.requests[0].headers[1].value, "");
  assert.deepEqual(excluded.responseSnapshots, {});
  assert.equal(Object.values(fork.responseSnapshots)[0].at, 1700000000000);
  assert.equal(buildForkPreview(collection, []).requests.length, 0);
});

test("variables resolve by scope without mutating templates; query values encode safely", async () => {
  const { emptyVariables, resolveVariables, validateVariables } = await import(
    "../variables.js"
  );
  const row = (key, value, secret = false) => ({
    id: crypto.randomUUID(),
    key,
    value,
    secret,
    enabled: true,
  });
  const r = createRequest({
    id: "request",
    collectionId: "collection",
    method: "POST",
    url: "{{base_url}}/users?q=%7B%7Bsearch%7D%7D&again={{search}}",
    auth: "bearer",
    token: "{{alias}}",
    bodyMode: "json",
    body: '{"search":"{{search}}"}',
  });
  const state = validateVariables({
    ...emptyVariables(),
    activeId: "dev",
    globals: [
      row("base_url", "https://example.test"),
      row("search", "global"),
      row("token", "private-token"),
      row("alias", "{{token}}"),
    ],
    collections: { collection: [row("search", "collection")] },
    environments: [
      {
        id: "dev",
        name: "Development",
        production: false,
        variables: [row("search", "environment")],
      },
    ],
    requests: { request: [row("search", "a&b=x")] },
  });
  const result = resolveVariables(r, state);
  assert.equal(result.error, undefined);
  assert.equal(new URL(result.request.url).searchParams.get("q"), "a&b=x");
  assert.equal(new URL(result.request.url).searchParams.has("b"), false);
  assert.equal(result.request.token, "private-token");
  assert.equal(result.used.find((v) => v.key === "search").scope, "Request");
  assert.equal(result.used.find((v) => v.key === "alias").secret, true);
  assert.ok(!JSON.stringify(result.used).includes("private-token"));
  assert.equal(r.token, "{{alias}}");
  assert.match(r.url, /base_url/);
  assert.ok(
    !JSON.stringify(validateVariables(state, true)).includes("private-token"),
  );
  state.requests = {};
  assert.match(
    resolveVariables(r, state).used.find((v) => v.key === "search").scope,
    /Development/,
  );
});
test("variables block missing secrets/cycles, ignore disabled fields, and cache dynamic values per send", async () => {
  const { emptyVariables, resolveVariables } = await import("../variables.js");
  const row = (key, value, secret = false) => ({
    id: crypto.randomUUID(),
    key,
    value,
    secret,
    enabled: true,
  });
  const settings = {
    ...emptyVariables(),
    globals: [row("base_url", "https://example.test"), row("token", "", true)],
  };
  const req = createRequest({
    url: "{{base_url}}/users",
    auth: "bearer",
    token: "{{token}}",
  });
  assert.equal(resolveVariables(req, settings).error.code, "variables");
  settings.globals = [
    row("base_url", "{{cycle}}"),
    row("cycle", "{{base_url}}"),
  ];
  assert.match(resolveVariables(req, settings).error.message, /circular/);
  const dynamic = createRequest({
    url: "https://example.test?x={{$uuid}}&y={{$uuid}}&at={{$timestamp}}",
    headers: [{ ...newRow("X-Disabled", "{{missing}}"), enabled: false }],
  });
  let calls = 0;
  const result = resolveVariables(dynamic, emptyVariables(), {
    uuid: () => {
      calls++;
      return "uuid";
    },
    now: () => 1234000,
  });
  assert.equal(result.error, undefined);
  assert.equal(calls, 1);
  assert.equal(new URL(result.request.url).searchParams.get("at"), "1234");
});
test("saved variable templates preserve references and never persist expanded credentials", async () => {
  const { savedTemplate, validateRecord } = await import("../store.js");
  const request = createRequest({
    url: "{{base_url}}/users?token={{token}}",
    auth: "bearer",
    token: "{{token}}",
    headers: [
      newRow("Authorization", "Bearer {{token}}"),
      newRow("X-Api-Key", "literal-secret"),
    ],
    bodyMode: "json",
    body: '{"name":"{{name}}"}',
  });
  const clean = savedTemplate(request, {
    query: true,
    headers: true,
    body: true,
  });
  assert.match(clean.url, /base_url/);
  assert.equal(clean.token, "{{token}}");
  assert.equal(clean.headers[0].value, "Bearer {{token}}");
  assert.equal(clean.headers[1].value, "");
  assert.equal(
    validateRecord({
      version: 1,
      request: clean,
      options: { query: true, headers: true, body: true },
    }).request.token,
    "{{token}}",
  );
  assert.ok(!JSON.stringify(clean).includes("literal-secret"));
});

test("variable expansion limits are enforced before oversized substitutions are constructed", async () => {
  const { emptyVariables, resolveVariables, validateVariables } = await import(
    "../variables.js"
  );
  const row = (key, value) => ({
    id: crypto.randomUUID(),
    key,
    value,
    secret: false,
    enabled: true,
  });
  const settings = validateVariables({
    ...emptyVariables(),
    globals: [
      row("part", "x".repeat(65536)),
      row("large", "{{part}}".repeat(40)),
    ],
  });
  const result = resolveVariables(
    createRequest({
      url: "https://example.test",
      method: "POST",
      bodyMode: "text",
      body: "{{large}}",
    }),
    settings,
  );
  assert.equal(result.error.code, "variables");
  assert.match(result.error.message, /resolution limit/);
});

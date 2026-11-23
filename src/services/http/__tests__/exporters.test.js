import test from "node:test";
import assert from "node:assert/strict";
import { createRequest, newRow } from "../request.js";
import { curlExport, collectionExport } from "../exporters.js";
import { parseImport } from "../importers.js";

test("default exports omit literal credentials and optional content", () => {
  const r = createRequest({
    url: "https://example.test/a?api_key=QUERY_SECRET&q=private",
    method: "POST",
    auth: "bearer",
    token: "AUTH_SECRET",
    headers: [
      newRow("Authorization", "Bearer HEADER_SECRET"),
      newRow("X-Trace", "PRIVATE_HEADER"),
    ],
    bodyMode: "json",
    body: '{"password":"BODY_SECRET"}',
  });
  for (const text of [
    curlExport(r),
    collectionExport({ name: "Backup" }, [r]),
  ]) {
    for (const secret of [
      "QUERY_SECRET",
      "private",
      "AUTH_SECRET",
      "HEADER_SECRET",
      "PRIVATE_HEADER",
      "BODY_SECRET",
    ])
      assert.ok(!text.includes(secret));
  }
  const included = curlExport(r, { query: true, headers: true, body: false });
  assert.ok(included.includes("q=private"));
  assert.ok(included.includes("PRIVATE_HEADER"));
  assert.ok(!included.includes("QUERY_SECRET"));
  assert.ok(!included.includes("AUTH_SECRET"));
  assert.ok(!included.includes("HEADER_SECRET"));
});
test("cURL safely quotes apostrophes and preserves duplicate queries and literal body", () => {
  const r = createRequest({
    url: "https://example.test/a?tag=one&tag=two",
    method: "POST",
    bodyMode: "text",
    body: "Avery's data; & @payload",
    headers: [newRow("X-Name", "O'Reilly")],
  });
  const command = curlExport(r, { query: true, headers: true, body: true });
  assert.ok(command.includes("'\\''"));
  const imported = parseImport(command).requests[0];
  assert.equal(imported.url, r.url);
  assert.equal(imported.method, "POST");
  assert.equal(imported.body, r.body);
  assert.equal(
    imported.headers.find((h) => h.key === "X-Name").value,
    "O'Reilly",
  );
});
test("collection backup roundtrips nested folders, disabled rows, templates, and body modes", () => {
  const folders = [
    { id: "a", name: "Root", parentId: null },
    { id: "b", name: "Nested", parentId: "a" },
  ];
  const r = createRequest({
    url: "{{base_url}}/users?tag=a&tag=b",
    folderId: "b",
    auth: "bearer",
    token: "{{token}}",
    bodyMode: "json",
    body: '{"name":"{{name}}"}',
    method: "POST",
  });
  r.params.push({ ...newRow("unused", "draft"), enabled: false });
  r.headers.push({ ...newRow("X-Skipped", "draft"), enabled: false });
  const result = parseImport(
    collectionExport({ name: "Backup", folders }, [r], {
      query: true,
      headers: true,
      body: true,
    }),
  );
  assert.equal(result.collection.folders.length, 2);
  assert.equal(
    result.collection.folders[1].parentId,
    result.collection.folders[0].id,
  );
  assert.equal(result.requests[0].folderId, result.collection.folders[1].id);
  assert.equal(result.requests[0].token, "{{token}}");
  assert.equal(result.requests[0].body, r.body);
  assert.equal(
    result.requests[0].params.filter((p) => p.key === "tag").length,
    2,
  );
  assert.equal(
    result.requests[0].params.find((p) => p.key === "unused").enabled,
    false,
  );
  assert.equal(
    result.requests[0].headers.find((p) => p.key === "X-Skipped").enabled,
    false,
  );
  const form = createRequest({
    url: "https://example.test",
    method: "POST",
    bodyMode: "form",
    body: "tag=a&tag=b&space=hello+world",
  });
  const parsed = parseImport(
    collectionExport({ name: "Form" }, [form], { body: true }),
  ).requests[0];
  assert.equal(parsed.bodyMode, "form");
  assert.equal(parsed.body, form.body);
});
test("embedded URL credentials block export", () => {
  assert.throws(() =>
    curlExport(createRequest({ url: "https://user:secret@example.test" })),
  );
});

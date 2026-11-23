import test from "node:test";
import assert from "node:assert/strict";
import { requestAtLine, httpRequestOutline } from "../editorRequests.js";
const source =
  '# API examples\n\n### List users\nGET https://example.test/users\nAccept: application/json\n\n### Create user\nPOST https://example.test/users\nContent-Type: application/json\nAuthorization: Bearer LOCAL_SECRET\n\n{"name":"Avery"}';
test("editor selection chooses only the cursor block, including CRLF, delimiter, body, and preamble", () => {
  assert.equal(requestAtLine(source, 1).request.method, "GET");
  assert.equal(requestAtLine(source, 5).request.name, "List users");
  for (const line of [7, 8, 12, 999]) {
    const selected = requestAtLine(source.replaceAll("\n", "\r\n"), line);
    assert.equal(selected.request.method, "POST");
    assert.equal(selected.request.name, "Create user");
    assert.equal(selected.request.body, '{"name":"Avery"}');
    assert.equal(
      selected.request.headers.find((h) => h.key === "Authorization").value,
      "Bearer LOCAL_SECRET",
    );
    assert.equal(selected.request.collectionId, null);
    assert.equal(selected.warnings.length, 0);
  }
  assert.notEqual(
    requestAtLine(source, 8).request.id,
    requestAtLine(source, 8).request.id,
  );
});
test("unsupported or empty cursor blocks never silently select another request", () => {
  assert.throws(
    () =>
      requestAtLine(
        "CONNECT https://example.test\n### Valid\nGET https://example.test",
        1,
      ),
    /cursor/,
  );
  assert.throws(
    () => requestAtLine("### Empty\n\n### Valid\nGET https://example.test", 1),
    /cursor/,
  );
  assert.throws(() => requestAtLine("hello"), /cursor/);
  assert.throws(
    () => requestAtLine("GET https://example.test\n\n< ./secret.txt"),
    /scripts|references/,
  );
  assert.throws(
    () => requestAtLine("GET https://example.test\n\n> {% throw 1 %}"),
    /scripts|references/,
  );
});
test("declarations or unresolved variables produce review warnings and work is bounded", () => {
  const selected = requestAtLine(
    "@base_url=https://example.test\n### Get\nGET {{base_url}}/users",
    4,
  );
  assert.equal(selected.warnings.length, 0);
  assert.equal(selected.request.fileVariables[0].key, "base_url");
  assert.equal(selected.request.url, "{{base_url}}/users");
  assert.throws(
    () => requestAtLine("x".repeat(10 * 1024 * 1024 + 1)),
    /10 MiB/,
  );
  assert.throws(() => requestAtLine("\n".repeat(100001)), /100,000/);
});

test("HTTP outline reports request names and source ranges without exposing URL query values", () => {
  const outline = httpRequestOutline(source);
  assert.deepEqual(
    outline.map((r) => [r.name, r.method, r.line]),
    [
      ["List users", "GET", 4],
      ["Create user", "POST", 8],
    ],
  );
  for (const entry of outline)
    assert.equal(
      requestAtLine(source, entry.line).blockIndex,
      entry.blockIndex,
    );
  assert.ok(
    !JSON.stringify(
      httpRequestOutline("GET https://example.test?token=PRIVATE"),
    ).includes("PRIVATE"),
  );
  assert.equal(httpRequestOutline("").length, 0);
});

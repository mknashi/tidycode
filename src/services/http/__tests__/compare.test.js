import test from "node:test";
import assert from "node:assert/strict";
import { compareResponses, COMPARE_LIMIT } from "../compare.js";
const response = (text, extra = {}) => ({
  bytes: new TextEncoder().encode(text),
  headers: [],
  ...extra,
});
test("response comparison preserves exact text while reporting JSON Pointer changes", () => {
  const baseline = response('{"a/b":{"~id":1},"array":[1],"old":true}');
  const current = response('{"a/b":{"~id":2},"array":[1,2],"new":false}');
  const before = baseline.bytes.slice();
  const result = compareResponses(baseline, current);
  assert.equal(result.identical, false);
  assert.deepEqual(
    result.paths.map((p) => p.path),
    ["/a~1b/~0id", "/array/1", "/old", "/new"],
  );
  assert.ok(result.changes.some((p) => p.added));
  assert.ok(result.changes.some((p) => p.removed));
  assert.deepEqual(baseline.bytes, before);
  assert.equal(
    compareResponses(response("same"), response("same")).identical,
    true,
  );
  assert.equal(
    compareResponses(response('{"a":1,"b":2}'), response('{ "b":2,"a":1 }'))
      .paths.length,
    0,
  );
});
test("comparison rejects binary, oversized, too many lines, and missing fresh baseline pair", () => {
  assert.match(compareResponses(null, response("a")).error, /Save a response/);
  assert.match(
    compareResponses(response("a"), response("a", { savedSnapshot: true }))
      .error,
    /fresh/,
  );
  assert.match(
    compareResponses(response("a"), response("a", { copiedSnapshot: true }))
      .error,
    /fresh/,
  );
  assert.match(compareResponses(response("a"), response("\0")).error, /Binary/);
  assert.match(
    compareResponses(response("a"), {
      bytes: new Uint8Array([255]),
      headers: [],
    }).error,
    /Binary/,
  );
  assert.match(
    compareResponses(response("a"), response("x".repeat(COMPARE_LIMIT + 1)))
      .error,
    /128 KiB/,
  );
  assert.match(
    compareResponses(response("a"), response("\n".repeat(2001))).error,
    /too large/,
  );
});
test("header comparison normalizes order and case, excludes snapshot-omitted fields", () => {
  const a = response("", {
    headers: [
      ["Content-Type", "application/json"],
      ["Authorization", "secret"],
      ["Location", "/old"],
      ["X-Trace", "one"],
    ],
  });
  const b = response("", {
    headers: [
      ["x-trace", "one"],
      ["content-type", "application/json"],
      ["Location", "/new"],
    ],
  });
  assert.equal(compareResponses(a, b, "headers").identical, true);
  b.headers[0][1] = "two";
  const result = compareResponses(a, b, "headers");
  assert.equal(result.identical, false);
  assert.ok(!JSON.stringify(result).includes("secret"));
});
test("unsafe JSON integers never yield misleading path equality", () => {
  const result = compareResponses(
    response('{"id":9007199254740992}'),
    response('{"id":9007199254740993}'),
  );
  assert.equal(result.identical, false);
  assert.equal(result.paths, null);
});

test("comparison retains UTF-8 BOM differences and rejects declared binary", () => {
  assert.equal(
    compareResponses(response("hello"), response("\ufeffhello")).identical,
    false,
  );
  assert.match(
    compareResponses(
      response("abc"),
      response("abc", { contentType: "application/octet-stream" }),
    ).error,
    /Binary/,
  );
});

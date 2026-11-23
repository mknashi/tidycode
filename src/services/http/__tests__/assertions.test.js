import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateAssertions,
  newAssertion,
  validateAssertions,
} from "../assertions.js";
import { createRequest } from "../request.js";
import { savedTemplate, responseSnapshot, validateRecord } from "../store.js";
const response = (
  body = '{"id":9007199254740993,"ready":true,"label":"Avery"}',
) => ({
  status: 200,
  statusText: "OK",
  totalMs: 80,
  bytes: new TextEncoder().encode(body),
  headers: [["Content-Type", "application/json"]],
  contentType: "application/json",
  size: body.length,
});
const rule = (type, target = "", expected = "") => ({
  ...newAssertion(),
  type,
  target,
  expected,
});
test("declarative status/header/time/JSON assertions pass, fail, and skip without mutating responses", () => {
  const r = response();
  const before = r.bytes.slice();
  const results = evaluateAssertions(
    [
      rule("status", "", "200"),
      rule("status", "", "404"),
      rule("headerExists", "content-type"),
      rule("headerContains", "Content-Type", "json"),
      rule("headerContains", "Content-Type", "JSON"),
      rule("duration", "", "100"),
      rule("duration", "", "80"),
      rule("jsonExists", "/id"),
      rule("jsonEquals", "/id", "9007199254740993"),
      rule("jsonEquals", "/id", "9007199254740992"),
      rule("jsonEquals", "/ready", "true"),
      rule("jsonEquals", "/label", '"Avery"'),
      { ...rule("status"), enabled: false },
    ],
    r,
  );
  assert.deepEqual(
    results.map((r) => r.state),
    [
      "passed",
      "failed",
      "passed",
      "passed",
      "failed",
      "passed",
      "failed",
      "passed",
      "passed",
      "failed",
      "passed",
      "passed",
      "skipped",
    ],
  );
  assert.deepEqual(r.bytes, before);
  assert.ok(!JSON.stringify(results).includes("Avery"));
});
test("JSON scalar numeric comparison is precise, supports exponent spelling, and rejects invalid checks safely", () => {
  assert.equal(
    evaluateAssertions(
      [rule("jsonEquals", "/n", "1.23e3")],
      response('{"n":1230.00}'),
    )[0].state,
    "passed",
  );
  assert.equal(
    evaluateAssertions(
      [rule("jsonEquals", "/a~1b/~0id", "null")],
      response('{"a/b":{"~id":null}}'),
    )[0].state,
    "passed",
  );
  for (const bad of [
    rule("status", "", "abc"),
    rule("duration", "", "0"),
    rule("headerExists", "bad header"),
    rule("jsonExists", "data.id"),
    rule("jsonEquals", "/label", "PRIVATE_SENTINEL"),
    rule("jsonEquals", "", "{}"),
  ]) {
    const result = evaluateAssertions([bad], response())[0];
    assert.equal(result.state, "failed");
    assert.ok(!result.message.includes("PRIVATE_SENTINEL"));
  }
  assert.match(
    evaluateAssertions([rule("headerExists", "X-Hidden")], response())[0]
      .message,
    /CORS/,
  );
  assert.equal(
    evaluateAssertions([rule("jsonExists", "/id")], response("not json"))[0]
      .state,
    "failed",
  );
});
test("assertion work and persistence are bounded and results never become saved snapshots", () => {
  assert.throws(
    () => validateAssertions(Array.from({ length: 51 }, () => newAssertion())),
    /50/,
  );
  assert.throws(() => validateAssertions([rule("unknown")]), /Invalid/);
  assert.equal(
    evaluateAssertions(
      [rule("jsonExists", "/id")],
      response("x".repeat(1024 * 1024 + 1)),
    )[0].state,
    "failed",
  );
  const request = createRequest({
    url: "https://example.test",
    assertions: [rule("headerContains", "X-Private", "PRIVATE_EXPECTED")],
  });
  assert.equal(savedTemplate(request).assertions.length, 0);
  const saved = savedTemplate(request, { assertions: true });
  assert.equal(saved.assertions[0].expected, "PRIVATE_EXPECTED");
  const restored = validateRecord({
    version: 1,
    request: saved,
    options: { assertions: true },
  });
  assert.equal(restored.request.assertions.length, 1);
  assert.ok(
    !JSON.stringify(
      responseSnapshot({
        ...response(),
        assertionResults: [{ message: "PRIVATE_RESULT" }],
      }),
    ).includes("PRIVATE_RESULT"),
  );
});

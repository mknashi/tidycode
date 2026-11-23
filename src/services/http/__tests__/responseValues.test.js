import test from "node:test";
import assert from "node:assert/strict";
import { responseValues, assignResponseVariable } from "../responseValues.js";
import { emptyVariables, validateVariables } from "../variables.js";
import { parseImport, IMPORT_LIMIT } from "../importers.js";

test("JSON selection preserves numeric precision, string escapes, objects, arrays, and Pointer paths", () => {
  const source =
    '{"id":9007199254740993,"x/y":{"~key":"a\\\"b\\n"},"arr":[null,true,1.2300e+9],"token":"SECRET"}';
  const result = responseValues(source);
  assert.equal(result.error, undefined);
  const find = (path) => result.entries.find((e) => e.path === path);
  assert.equal(find("/id").value, "9007199254740993");
  assert.equal(find("/x~1y/~0key").value, 'a"b\n');
  assert.equal(find("/arr/2").value, "1.2300e+9");
  assert.equal(find("/arr").value, "[null,true,1.2300e+9]");
  assert.equal(find("/token").secret, true);
  assert.equal(find("").secret, true);
  assert.equal(find("/id").secret, false);
  assert.ok(responseValues('{"a":1,"a":2}').error);
  assert.ok(responseValues("invalid").error);
  assert.ok(responseValues("x".repeat(1024 * 1024 + 1)).error);
  assert.equal(
    responseValues(JSON.stringify(Array.from({ length: 600 }, (_, i) => i)))
      .limited,
    true,
  );
});
test("variable extraction changes only chosen scope, confirms replacement, and redacts secrets on persistence", () => {
  const settings = emptyVariables();
  const request = { id: "r", collectionId: "c" };
  settings.environments.push({
    id: "env",
    name: "Dev",
    production: false,
    variables: [],
  });
  for (const scope of ["request", "collection", "global", "env:env"]) {
    const next = assignResponseVariable(settings, scope, request, {
      key: "token",
      value: "SECRET",
      secret: false,
    });
    assert.ok(
      !JSON.stringify(validateVariables(next, true)).includes("SECRET"),
    );
    assert.throws(
      () =>
        assignResponseVariable(next, scope, request, {
          key: "token",
          value: "other",
        }),
      /Confirm/,
    );
    assert.ok(
      assignResponseVariable(
        next,
        scope,
        request,
        { key: "token", value: "other" },
        true,
      ),
    );
  }
  assert.equal(settings.globals.length, 0);
  assert.equal(Object.keys(settings.requests).length, 0);
  assert.throws(
    () =>
      assignResponseVariable(settings, "request", request, {
        key: "bad name",
        value: "1",
      }),
    /Variable/,
  );
  assert.throws(
    () =>
      assignResponseVariable(settings, "request", request, {
        key: "id",
        value: "x".repeat(65537),
      }),
    /64 KiB/,
  );
});
test("collection imports accept 4 MiB and the exact 10 MiB boundary, reject larger byte counts", (t) => {
  const collection = JSON.stringify({
    info: {
      name: "Large collection",
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      description: "x".repeat(4 * 1024 * 1024),
    },
    item: [
      {
        name: "Get",
        request: { method: "GET", url: "https://example.test/get" },
      },
    ],
  });
  const started = performance.now();
  assert.equal(parseImport(collection).requests.length, 1);
  const exact =
    collection + " ".repeat(IMPORT_LIMIT - Buffer.byteLength(collection));
  assert.equal(parseImport(exact).requests.length, 1);
  assert.throws(() => parseImport(exact + " "), /10 MiB/);
  assert.throws(() => parseImport("é".repeat(IMPORT_LIMIT / 2 + 1)), /10 MiB/);
  t.diagnostic(
    `4 MiB and 10 MiB import checks completed in ${Math.round(performance.now() - started)} ms on this machine (not a cross-device guarantee).`,
  );
});

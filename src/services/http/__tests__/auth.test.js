import test from "node:test";
import assert from "node:assert/strict";
import { createRequest, prepareRequest, newRow } from "../request.js";
import { resolveVariables, emptyVariables, newVariable } from "../variables.js";
import { savedTemplate, templateSignature } from "../store.js";
import { collectionExport, curlExport } from "../exporters.js";
import { parseImport } from "../importers.js";
import { buildForkPreview } from "../fork.js";

test("Basic generates UTF-8 authorization transiently and blocks conflicts and invalid usernames", () => {
  const request = createRequest({
    url: "https://example.test",
    auth: "basic",
    username: "Averyé",
    password: "p:aß",
  });
  const result = prepareRequest(request);
  assert.equal(
    result.headers.get("authorization"),
    "Basic " + Buffer.from("Averyé:p:aß").toString("base64"),
  );
  assert.equal(request.headers.length, 1);
  for (const patch of [
    { username: "a:b" },
    { username: "" },
    { password: "a\nb" },
    { headers: [newRow("Authorization", "other")] },
  ])
    assert.throws(
      () => prepareRequest({ ...request, ...patch }),
      /username|password|Authorization|line break/,
    );
});
test("API key supports custom headers and safely encoded query keys without mutation", () => {
  const request = createRequest({
    url: "https://example.test?q=one",
    auth: "apikey",
    apiKeyName: "X-Custom",
    apiKeyValue: "a&b=é",
  });
  assert.equal(prepareRequest(request).headers.get("x-custom"), "a&b=é");
  const result = prepareRequest({ ...request, apiKeyIn: "query" });
  assert.equal(new URL(result.url).searchParams.get("X-Custom"), "a&b=é");
  assert.equal(request.url, "https://example.test?q=one");
  for (const patch of [
    { apiKeyValue: "" },
    { apiKeyName: "Cookie" },
    { apiKeyName: "bad name" },
    { apiKeyValue: "x\ny" },
    { headers: [newRow("x-custom", "duplicate")] },
    { apiKeyIn: "query", url: "https://example.test?X-Custom=duplicate" },
  ])
    assert.throws(
      () => prepareRequest({ ...request, ...patch }),
      /API key|browser/,
    );
});
test("auth variable resolution requires only active auth fields and does not replace definitions", () => {
  const variables = emptyVariables();
  variables.globals = [
    { ...newVariable(), key: "user", value: "Avery" },
    { ...newVariable(), key: "password", value: "SECRET", secret: true },
  ];
  const request = createRequest({
    url: "https://example.test",
    auth: "basic",
    username: "{{user}}",
    password: "{{password}}",
    apiKeyValue: "{{missing}}",
  });
  const result = resolveVariables(request, variables);
  assert.equal(result.error, undefined);
  assert.equal(result.request.username, "Avery");
  assert.equal(result.request.password, "SECRET");
  assert.equal(request.password, "{{password}}");
  assert.ok(
    resolveVariables({ ...request, password: "{{missing}}" }, variables).error,
  );
  assert.throws(() => prepareRequest(request), /unresolved/);
  assert.equal(
    resolveVariables({ ...request, auth: "none" }, emptyVariables()).error,
    undefined,
  );
});
test("save, export, and fork exclude literal Basic/API-key credentials and preserve references", () => {
  for (const auth of ["basic", "apikey"]) {
    const request = createRequest({
      url: "https://example.test",
      collectionId: "source",
      auth,
      username: "USER_SENTINEL",
      password: "PASSWORD_SENTINEL",
      apiKeyValue: "KEY_SENTINEL",
    });
    const saved = savedTemplate(request);
    for (const text of [
      JSON.stringify(saved),
      collectionExport({ name: "Export" }, [{ ...request, folderId: null }]),
      curlExport(request),
      JSON.stringify(
        buildForkPreview(
          { id: "source", name: "Source", folders: [] },
          [request],
          {},
        ),
      ),
    ]) {
      for (const secret of [
        "USER_SENTINEL",
        "PASSWORD_SENTINEL",
        "KEY_SENTINEL",
      ])
        assert.ok(!text.includes(secret));
    }
    const referenced = {
      ...request,
      username: "{{user}}",
      password: "{{password}}",
      apiKeyValue: "{{api_key}}",
    };
    const result = parseImport(
      collectionExport({ name: "Export" }, [{ ...referenced, folderId: null }]),
    ).requests[0];
    assert.equal(result.auth, auth);
    if (auth === "basic") {
      assert.equal(result.password, "{{password}}");
      const curl = parseImport(curlExport(referenced)).requests[0];
      assert.equal(curl.username, "{{user}}");
      assert.equal(curl.password, "{{password}}");
    } else assert.equal(result.apiKeyValue, "{{api_key}}");
    assert.equal(
      templateSignature(request),
      templateSignature({
        ...request,
        password: "changed",
        apiKeyValue: "changed",
        username: "changed",
      }),
    );
  }
});

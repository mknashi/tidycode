import { apiVariablePreview, variableFieldPreview } from '../variablePreview.js';
import {
  retainExecution,
  EXECUTION_BODY_LIMIT,
} from "../executionRetention.js";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { httpCompletionSource, httpVariablePreview } from "../../../utils/codemirror/httpEditing.js";
import test from "node:test";
import assert from "node:assert/strict";
import { requestAtLine, httpRequestOutline } from "../editorRequests.js";
import {
  fileDeclarations,
  httpDiagnostics,
  editingBlocks,
  editHttpBlock,
} from "../httpEditing.js";
import { emptyVariables, newVariable, resolveVariables } from "../variables.js";
import { createRequest, newRow, prepareRequest } from "../request.js";
import { savedTemplate, validateRecord } from "../store.js";
import { parseEnvironments } from "../environmentImport.js";
import { runSequence } from "../runner.js";
import { uploadRow, UPLOAD_LIMIT } from "../uploads.js";
import { httpExport } from "../exporters.js";
const row = (key, value, secret = false) => ({
  ...newVariable(),
  key,
  value,
  secret,
});
test("file/block declarations resolve with explicit precedence, remain transient, and have local diagnostics", () => {
  const source =
    '@base_url=https://file.test\n@value=file\n### One\n@value=block\nPOST {{base_url}}/users\nContent-Type: application/json\n\n{"id":"{{value}}"}\n### Two\nGET {{base_url}}/users';
  const selected = requestAtLine(source, 5),
    settings = emptyVariables();
  settings.globals = [row("base_url", "https://global.test")];
  settings.environments = [
    {
      id: "dev",
      name: "Dev",
      production: false,
      variables: [row("base_url", "https://environment.test")],
    },
  ];
  settings.activeId = "dev";
  const result = resolveVariables(selected.request, settings);
  assert.equal(result.request.url, "https://environment.test/users");
  assert.equal(result.request.body, '{"id":"block"}');
  assert.equal(requestAtLine(source, 10).request.blockVariables.length, 0);
  assert.equal(fileDeclarations(source, 1).file.length, 2);
  assert.equal(
    httpDiagnostics(source).filter((d) => d.severity === "error").length,
    0,
  );
  assert.ok(
    httpDiagnostics("GET {{missing}}/users").some((d) =>
      d.message.includes("missing"),
    ),
  );
  assert.ok(
    httpDiagnostics("GET https://example.test\nBad header").some((d) =>
      d.message.includes("Headers"),
    ),
  );
  assert.ok(
    !JSON.stringify(savedTemplate(selected.request, { body: true })).includes(
      "https://file.test",
    ),
  );
  assert.throws(() => fileDeclarations("@x=1\n@x=2", 0), /unique/);
  assert.throws(
    () => fileDeclarations("@x=1\n@bad declaration", 0),
    /name=value/,
  );
});
test("authoring edits preserve file variables and request bodies while targeting explicit blocks", () => {
  const source =
    '@base_url=https://example.test\nGET {{base_url}}/one\n\n### Two\nPOST {{base_url}}/two\nContent-Type: application/json\n\n{"id":9007199254740993}';
  const entries = httpRequestOutline(source);
  const duplicate = editHttpBlock(source, entries[0], "duplicate");
  assert.equal(httpRequestOutline(duplicate).length, 3);
  assert.equal((duplicate.match(/@base_url=/g) || []).length, 1);
  const renamed = editHttpBlock(source, entries[0], "rename", "First");
  assert.ok(renamed.startsWith("@base_url="));
  assert.equal(httpRequestOutline(renamed)[0].name, "First");
  const moved = editHttpBlock(source, entries[1], "up");
  assert.equal(httpRequestOutline(moved)[0].name, "Two");
  assert.ok(moved.includes("9007199254740993"));
  assert.equal(fileDeclarations(moved, 1).file[0].key, "base_url");
  const deleted = editHttpBlock(source, entries[0], "delete");
  assert.ok(deleted.startsWith("@base_url="));
  assert.equal(httpRequestOutline(deleted).length, 1);
  assert.equal(httpRequestOutline(deleted)[0].name, "Two");
  assert.ok(deleted.includes("9007199254740993"));
  assert.equal(httpRequestOutline(editHttpBlock(deleted, httpRequestOutline(deleted)[0], "delete")).length, 0);
  const blocks = editingBlocks(source);
  assert.equal(
    source.slice(blocks[1].bodyStart, blocks[1].to).trim(),
    '{"id":9007199254740993}',
  );
  assert.throws(
    () => editHttpBlock(source, { ...entries[0], name: "stale" }, "duplicate"),
    /changed/,
  );
  const exported = httpExport(
    createRequest({
      url: "https://example.test?token=SECRET",
      headers: [newRow("Authorization", "Bearer SECRET")],
    }),
  );
  assert.ok(!exported.includes("SECRET"));
});
test("environment imports flatten names, protect secrets and reject unsafe definitions", () => {
  const env = parseEnvironments(
    '{"dev":{"host":{"url":"https://example.test"},"token":"SECRET"}}',
    false,
  )[0];
  assert.equal(env.variables[0].key, "host.url");
  assert.equal(env.variables[1].secret, true);
  assert.ok(
    parseEnvironments('{"dev":{"name":"Avery"}}')[0].variables[0].secret,
  );
  assert.equal(
    parseEnvironments(
      '{"name":"Production","values":[{"key":"key","value":"v","type":"secret"}]}',
      false,
    )[0].production,
    true,
  );
  assert.throws(
    () => parseEnvironments('{"dev":{"id":9007199254740993}}'),
    /Quote/,
  );
  assert.throws(() => parseEnvironments("x".repeat(1024 * 1024 + 1)), /1 MiB/);
});
test("multipart and binary payloads validate boundaries, variable fields, origin guards and omission on persistence", async () => {
  const file = new File(["PRIVATE_UPLOAD"], "private.txt", {
    type: "text/plain",
  });
  const request = createRequest({
    url: "https://example.test/upload",
    method: "POST",
    bodyMode: "multipart",
    multipart: [
      { ...uploadRow(), key: "name", value: "{{name}}" },
      { ...uploadRow(), key: "file", type: "file", file },
    ],
  });
  const settings = emptyVariables();
  settings.globals = [row("name", "Avery")];
  const resolved = resolveVariables(request, settings).request;
  const prepared = prepareRequest(resolved);
  assert.equal(prepared.body.get("name"), "Avery");
  assert.equal(await prepared.body.get("file").text(), "PRIVATE_UPLOAD");
  assert.equal(prepared.headers.has("content-type"), false);
  assert.throws(
    () =>
      prepareRequest({
        ...resolved,
        headers: [newRow("Content-Type", "multipart/form-data")],
      }),
    /boundary/,
  );
  assert.throws(
    () =>
      prepareRequest({ ...resolved, credentialOrigin: "https://other.test" }),
    /destination changed/i,
  );
  const saved = savedTemplate(request, { body: true });
  assert.equal(saved.multipart[1].file, null);
  assert.ok(!JSON.stringify(saved).includes("private.txt"));
  assert.ok(!JSON.stringify(saved).includes("PRIVATE_UPLOAD"));
  const restored = validateRecord({
    version: 1,
    request: saved,
    options: { body: true },
  }).request;
  assert.equal(restored.bodyMode, "multipart");
  assert.throws(
    () =>
      prepareRequest({
        ...restored,
        multipart: restored.multipart.filter((r) => r.type === "file"),
      }),
    /Reselect/,
  );
  const binary = createRequest({
    url: "https://example.test",
    method: "POST",
    bodyMode: "binary",
    binaryFile: file,
    body: "{{unused}}",
  });
  assert.equal(prepareRequest(binary).body, file);
  assert.equal(savedTemplate(binary).binaryFile, null);
  assert.throws(
    () =>
      prepareRequest({
        ...binary,
        binaryFile: new Blob([new Uint8Array(UPLOAD_LIMIT + 1)]),
      }),
    /20 MiB/,
  );
  assert.equal(prepareRequest({ ...binary, method: "GET" }).body, undefined);
});
test("sequential runner captures exact run-only values, stops on failures, cancels and never retries", async () => {
  const settings = emptyVariables(),
    requests = [
      createRequest({ url: "https://example.test/login" }),
      createRequest({ url: "https://example.test/users?id={{id}}" }),
    ];
  let calls = 0;
  const results = await runSequence({
    settings,
    steps: [
      { request: requests[0], capture: { name: "id", path: "/id" } },
      { request: requests[1] },
    ],
    send: async (request, variables) => {
      calls++;
      if (calls === 2) {
        const resolved = resolveVariables(request, variables);
        assert.equal(resolved.error, undefined);
        assert.ok(resolved.request.url.includes("9007199254740993"));
        assert.equal(request.blockVariables[0].secret, true);
      }
      return {
        ok: true,
        response: {
          bytes: new TextEncoder().encode('{"id":9007199254740993}'),
          status: 200,
          totalMs: 1,
        },
      };
    },
  });
  assert.equal(calls, 2);
  assert.equal(results.length, 2);
  assert.ok(!JSON.stringify(settings).includes("9007199254740993"));
  assert.ok(!JSON.stringify(results).includes("9007199254740993"));
  calls = 0;
  await runSequence({
    settings,
    steps: requests.map((request) => ({ request })),
    send: async () => {
      calls++;
      return { ok: false, error: new Error("failure") };
    },
  });
  assert.equal(calls, 1);
  let stopped = false;
  calls = 0;
  await runSequence({
    settings,
    steps: requests.map((request) => ({ request })),
    isStopped: () => stopped,
    send: async () => {
      calls++;
      stopped = true;
      return { ok: true };
    },
  });
  assert.equal(calls, 1);
});

test("local completion covers headers, MIME types, variables, and imported endpoint URLs without values", () => {
  const complete = (doc, metadata = [], endpoints = []) => {
    const state = EditorState.create({ doc });
    return httpCompletionSource(
      metadata,
      endpoints,
    )(new CompletionContext(state, state.doc.length, true));
  };
  assert.ok(
    complete("GET https://example.test\nCon").options.some(
      (option) => option.label === "Content-Type",
    ),
  );
  assert.ok(
    complete(
      "GET https://example.test\nContent-Type: application/j",
    ).options.some((option) => option.label === "application/json"),
  );
  const variables = complete("GET {{tok", [{ key: "token", hasValue: false }]);
  assert.equal(
    variables.options.find((option) => option.label === "token").apply,
    "token}}",
  );
  assert.equal(
    complete(
      "GET https://ex",
      [],
      [{ method: "GET", url: "https://example.test/users" }],
    ).options[0].label,
    "https://example.test/users",
  );
});
test("HTTP titles beginning with methods remain titles and secret URL changes keep origin guards", () => {
  assert.equal(
    requestAtLine(
      "### GET users\nGET https://example.test\nAccept: application/json",
      2,
    ).request.name,
    "GET users",
  );
  const settings = emptyVariables();
  settings.globals = [row("secret_url", "https://other.test", true)];
  const request = createRequest({
    url: "{{secret_url}}/private",
    credentialOrigin: "https://example.test",
    headers: [],
  });
  assert.throws(
    () => prepareRequest(resolveVariables(request, settings).request),
    /destination changed/i,
  );
});

test("response retention releases old bodies while preserving results and the new response", () => {
  let records = {};
  for (let i = 0; i < 4; i++)
    records = retainExecution(records, String(i), {
      response: { size: 20 * 1024 * 1024, receivedAt: i + 1 },
      assertionResults: [{ state: "passed" }],
    });
  assert.equal(records["0"].response, undefined);
  assert.match(records["0"].notice, /released/);
  assert.equal(records["0"].assertionResults[0].state, "passed");
  assert.ok(records["3"].response);
  assert.ok(
    Object.values(records).reduce(
      (size, record) => size + (record.response?.size || 0),
      0,
    ) <= EXECUTION_BODY_LIMIT,
  );
});

test("HTTP hover previews respect precedence and mask secrets", () => {
  const source = "@host=file.test\n### Demo\nGET https://{{host}}/{{token}}";
  const metadata = [{ key: "host", value: "env.test", rank: 3, scope: "Environment" }, { key: "token", value: "PRIVATE", secret: true, rank: 3, scope: "Environment" }];
  assert.equal(httpVariablePreview(source, source.indexOf("{{host}}") + 3, metadata).detail, "Environment · env.test");
  assert.equal(httpVariablePreview(source, source.indexOf("{{token}}") + 3, metadata).detail, "Environment · Secret value hidden");
  assert.equal(httpVariablePreview(source, 0, metadata), null);
  const block = "### Demo\n@host=block.test\nGET https://{{host}}";
  assert.equal(httpVariablePreview(block, block.indexOf("{{host}}") + 3, metadata).detail, "Request block · block.test");
});

test('API hover resolves independently with scope precedence and transitive secret masking',()=>{
 const settings=emptyVariables();settings.globals=[row('host','global.test'),row('token','PRIVATE_SECRET',true),row('alias','{{token}}')];settings.activeId='dev';settings.environments=[{id:'dev',name:'Dev',variables:[row('host','dev.test')]}];
 const request=createRequest({url:'{{missing}}'});
 assert.equal(apiVariablePreview(request,settings,'host').detail,'Environment (Dev) · dev.test');
 assert.equal(apiVariablePreview(request,settings,'alias').detail,'Global · Secret value hidden');
 assert.ok(!variableFieldPreview('{{alias}} {{host}}',key=>apiVariablePreview(request,settings,key)).includes('PRIVATE_SECRET'));
 assert.match(apiVariablePreview(request,settings,'unknown').detail,/Define variable/);
 assert.match(apiVariablePreview(request,settings,'$uuid').detail,/Generated when sent/);
 settings.activeId=null;assert.equal(apiVariablePreview(request,settings,'host').detail,'Global · global.test');
});

test('form variables preserve credential bytes without introducing fields or decoding plus/percent',()=>{
 const settings=emptyVariables();const secret='synthetic+secret&scope=unexpected%2F= /é';
 settings.globals=[row('Consumer_Key','synthetic+key'),row('Consumer_Secret',secret,true)];
 const request=createRequest({method:'POST',url:'https://example.test/token',bodyMode:'form',body:'grant_type=client_credentials&client_id={{Consumer_Key}}&client_secret={{Consumer_Secret}}&tag=first&tag=second&literal=a%2Bb'});
 const result=resolveVariables(request,settings);assert.equal(result.error,undefined);
 const prepared=prepareRequest(result.request),fields=new URLSearchParams(prepared.body);
 assert.equal(fields.get('client_id'),'synthetic+key');assert.equal(fields.get('client_secret'),secret);assert.equal(fields.has('scope'),false);
 assert.deepEqual(fields.getAll('tag'),['first','second']);assert.equal(fields.get('literal'),'a+b');
 assert.equal(request.body.includes(secret),false);assert.ok(result.used.find(v=>v.key==='Consumer_Secret').secret);
 assert.equal(prepared.headers.get('content-type'),'application/x-www-form-urlencoded');
});

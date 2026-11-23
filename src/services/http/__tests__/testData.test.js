import { applyTestDataToSource } from "../testDataSource.js";
import { httpRequestOutline, requestAtLine } from "../editorRequests.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TEST_SCHEMA,
  parseTestSchema,
  inferTestSchema,
  generateTestData,
  validateAiTestData,
} from "../testData.js";
test("rules produce deterministic synthetic records with bounds and safe domains", () => {
  const options = { seed: "repeat", count: 3 };
  const a = generateTestData(DEFAULT_TEST_SCHEMA, options);
  assert.equal(a, generateTestData(DEFAULT_TEST_SCHEMA, options));
  assert.notEqual(
    a,
    generateTestData(DEFAULT_TEST_SCHEMA, { ...options, seed: "other" }),
  );
  const rows = JSON.parse(a);
  assert.equal(rows.length, 3);
  for (const r of rows) {
    assert.match(r.email, /@example\.test$/);
    assert.ok(r.age >= 18 && r.age <= 80);
    assert.equal(typeof r.active, "boolean");
  }
});
test("boundaries, nested arrays, negative scenarios and enums are explicit", () => {
  const schema = {
    type: "object",
    properties: {
      rows: {
        type: "array",
        minItems: 1,
        maxItems: 2,
        items: { type: "integer", minimum: 2, maximum: 5 },
      },
      code: { type: "string", minLength: 2, maxLength: 5 },
      state: { type: "string", enum: ["a", "b"] },
    },
  };
  assert.deepEqual(
    JSON.parse(generateTestData(schema, { scenario: "minimum" })),
    { rows: [2], code: "co", state: "a" },
  );
  const max = JSON.parse(generateTestData(schema, { scenario: "maximum" }));
  assert.deepEqual(max.rows, [5, 5]);
  assert.equal(max.code.length, 5);
  assert.equal(max.state, "b");
  assert.equal(
    JSON.parse(generateTestData(schema, { scenario: "empty" })).code,
    "",
  );
  assert.equal(
    JSON.parse(generateTestData(schema, { scenario: "null" })),
    null,
  );
});
test("inference excludes source values and unsupported or expensive rules are rejected", () => {
  const inferred = inferTestSchema({
    password: "VERY_PRIVATE",
    nested: [{ number: 9007199254740993 }],
  });
  assert.ok(!JSON.stringify(inferred).includes("VERY_PRIVATE"));
  assert.throws(
    () => parseTestSchema('{"type":"string","$ref":"https://example.test"}'),
    /Unsupported/,
  );
  assert.throws(
    () =>
      generateTestData({
        type: "array",
        items: { type: "string" },
        maxItems: 100000,
      }),
    /bounds/,
  );
  assert.throws(
    () => generateTestData(DEFAULT_TEST_SCHEMA, { count: 101 }),
    /1–100/,
  );
  assert.throws(
    () =>
      generateTestData(
        {
          type: "array",
          minItems: 20,
          maxItems: 20,
          items: {
            type: "array",
            minItems: 20,
            maxItems: 20,
            items: {
              type: "array",
              minItems: 20,
              maxItems: 20,
              items: { type: "string" },
            },
          },
        },
        { count: 100 },
      ),
    /10,000/,
  );
});
test("AI output must be bounded JSON with exactly the schema fields, types and record count", () => {
  const schema = {
    type: "object",
    properties: { id: { type: "integer", minimum: 1, maximum: 3 } },
  };
  assert.deepEqual(
    JSON.parse(validateAiTestData('```json\n{"id":2}\n```', schema)),
    { id: 2 },
  );
  for (const text of [
    '{"id":"two"}',
    '{"id":4}',
    '{"id":2,"extra":true}',
    "{}",
    "not json",
  ])
    assert.throws(() => validateAiTestData(text, schema));
  assert.throws(() => validateAiTestData('[{"id":2}]', schema, 2), /count/);
  assert.throws(() => validateAiTestData("x".repeat(300000), schema), /large/);
});

test("generated data cannot resolve environment credentials and AI formats use synthetic domains", () => {
  assert.throws(
    () => generateTestData({ type: "string", enum: ["{{access_token}}"] }),
    /variable references/,
  );
  assert.throws(
    () => validateAiTestData('"{{access_token}}"', { type: "string" }),
    /variable references/,
  );
  assert.throws(
    () =>
      validateAiTestData('"person@real-company.com"', {
        type: "string",
        format: "email",
      }),
    /synthetic data format/,
  );
  assert.equal(
    JSON.parse(
      validateAiTestData('"person@example.test"', {
        type: "string",
        format: "email",
      }),
    ),
    "person@example.test",
  );
});

test("source data edits target one block, preserving declarations, headers and neighbors", () => {
  const source =
    "@base=https://example.test\n### First\nPOST {{base}}/one\nAuthorization: Bearer {{token}}\nContent-Type: text/plain\nContent-Length: 4\n\nold\n\n### Second\nGET {{base}}/two?keep=yes&page=old\nAccept: application/json\n";
  const items = httpRequestOutline(source),
    preview = '{"id":1}';
  const next = applyTestDataToSource(source, items[0], "body", preview);
  assert.ok(next.startsWith("@base=https://example.test"));
  assert.ok(next.includes("Authorization: Bearer {{token}}"));
  assert.ok(next.includes("Content-Type: application/json"));
  assert.ok(!next.includes("Content-Length:"));
  assert.equal(
    requestAtLine(next, httpRequestOutline(next)[0].line).request.body,
    preview,
  );
  assert.equal(
    next.slice(next.indexOf("### Second")),
    source.slice(source.indexOf("### Second")),
  );
  const query = applyTestDataToSource(source, items[1], "params", '{"page":2}');
  assert.ok(query.includes("keep=yes&page=2"));
  assert.equal(
    query.slice(0, query.indexOf("### Second")),
    source.slice(0, source.indexOf("### Second")),
  );
  assert.throws(
    () =>
      applyTestDataToSource(
        source,
        { ...items[0], name: "stale" },
        "body",
        preview,
      ),
    /changed/,
  );
  const empty =
    "### Upload\n# @body binary\nPOST https://example.test/upload\n";
  const filled = applyTestDataToSource(
    empty,
    httpRequestOutline(empty)[0],
    "body",
    preview,
  );
  assert.ok(!filled.includes("@body"));
  assert.equal(
    requestAtLine(filled, httpRequestOutline(filled)[0].line).request.body,
    preview,
  );
});

test("source query generation preserves unresolved references and original encoding", () => {
  const source =
    "GET https://example.test?token={{access_token}}&encoded=a%20b&page=1";
  const result = applyTestDataToSource(
    source,
    httpRequestOutline(source)[0],
    "params",
    '{"page":2}',
  );
  assert.equal(
    result,
    "GET https://example.test?token={{access_token}}&encoded=a%20b&page=2",
  );
});

test('form editing synchronizes duplicate fields, blanks, references and literal reserved characters',async()=>{
 const {formRows,formBody,formBodyWarning}=await import('../formBody.js');
 const input=[{key:'tag',value:'a+b&c=d%2F é'},{key:'tag',value:''},{key:'client_secret',value:'{{Consumer_Secret}}'}];
 const body=formBody(input);assert.ok(body.includes('{{Consumer_Secret}}'));
 assert.deepEqual(formRows(body).map(({key,value})=>({key,value})),input);
 assert.equal(formBody([{key:'',value:''}]),'');assert.equal(formRows('flag')[0].value,'');
 assert.match(formBodyWarning('grant_type%3Aclient_credentials='),/key: value/);
 assert.match(formBodyWarning('a=1\nb=2'),/line breaks/);assert.equal(formBodyWarning('grant_type=client_credentials'),'');
});

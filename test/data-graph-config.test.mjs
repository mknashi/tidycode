import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDataGraph, GraphTooLargeError } from '../src/utils/dataGraph.js';

const card = (graph, title) => [...graph.cards.values()].find(item => item.title === title);

test('YAML nested mappings and sequences keep types and source offsets', () => {
  const text = 'service:\n  enabled: true\n  ports: [80, 443]\nusers:\n  - name: alpha\n  - name: beta';
  const graph = buildDataGraph(text, 'yaml');
  assert.equal(card(graph, 'service').rows[0].valueType, 'boolean');
  assert.equal(card(graph, 'ports').rows[1].value, '443');
  assert.equal(card(graph, 'users[1]').rows[0].offset, text.indexOf('name: beta'));
});

test('YAML aliases and recursive aliases produce a finite graph', () => {
  const graph = buildDataGraph('defaults: &defaults\n  host: localhost\ncopy: *defaults\nloop: &loop\n  self: *loop', 'yaml');
  assert.equal(card(graph, 'copy').rows[0].value, '"localhost"');
  assert.equal(card(graph, 'loop').rows[0].value, '"[Circular alias]"');
});

test('TOML repeated keys and array tables navigate to the correct source locations', () => {
  const text = '[dev]\nhost="dev"\n[prod]\nhost="prod"\n[[servers]]\nname="one"\n[[servers]]\nname="two"\ncreated=2026-11-24T11:00:00Z';
  const graph = buildDataGraph(text, 'toml');
  assert.equal(card(graph, 'prod').rows[0].offset, text.indexOf('host="prod"'));
  assert.equal(card(graph, 'servers[1]').rows[0].offset, text.indexOf('name="two"'));
  assert.equal(card(graph, 'servers[1]').rows[1].valueType, 'string');
});

test('YAML scalar roots and TOML inline tables are supported', () => {
  assert.equal(card(buildDataGraph('hello', 'yaml'), 'value').rows[0].value, '"hello"');
  const graph = buildDataGraph('credentials = { user = "admin", enabled = true }', 'toml');
  assert.equal(card(graph, 'credentials').rows[1].value, 'true');
});

test('invalid configuration is reported instead of drawing misleading data', () => {
  assert.throws(() => buildDataGraph('x: [', 'yaml'));
  assert.throws(() => buildDataGraph('[[]]', 'toml'));
  assert.throws(() => buildDataGraph('a: 1\n---\nb: 2', 'yaml'));
});

test('configuration graphs enforce the existing card limit', () => {
  const text = Array.from({ length: 5001 }, (_, i) => `item${i}: { value: ${i} }`).join('\n');
  assert.throws(() => buildDataGraph(text, 'yaml'), GraphTooLargeError);
});

test('JSON graph behavior is preserved', () => {
  const graph = buildDataGraph('{"items":[{"name":"one"}]}', 'json');
  assert.equal(card(graph, 'items[0]').rows[0].value, '"one"');
});

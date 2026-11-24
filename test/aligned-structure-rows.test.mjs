import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAlignedStructureRows } from '../src/utils/alignedStructureRows.js';

test('inline fields share one readable row without shifting source alignment', () => {
  const rows = mergeAlignedStructureRows([
    { key: 'table', line: 10, top: 160, depth: 1, hasChildren: true, node: { label: '[credentials]' } },
    { key: 'user', line: 10, top: 160, depth: 2, node: { label: 'username = admin' } },
    { key: 'ssl', line: 10, top: 160, depth: 2, node: { label: 'ssl = require' } },
    { key: 'next', line: 12, top: 192, node: { label: '[pool]' } },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].displayLabel, '[credentials] · username = admin · ssl = require');
  assert.equal(rows[0].hasChildren, true);
  assert.equal(rows[0].top, 160);
  assert.equal(rows[1].top, 192);
});

test('array heading and first entry occupy separate rows without overlapping fields', () => {
  const rows = mergeAlignedStructureRows([
    { key: 'array', line: 3, top: 40, node: { label: '[[servers]] (2)', isArrayGroup: true } },
    { key: 'entry', line: 3, top: 40, node: { label: '[0]' } },
    { key: 'field', line: 4, top: 60, node: { label: 'name = alpha' } },
  ], 20);
  assert.deepEqual(rows.map(row => row.displayLabel), ['[[servers]] (2)', '[0]', 'name = alpha']);
  assert.deepEqual(rows.map(row => row.top), [20, 40, 60]);
  assert.deepEqual(rows.map(row => row.line), [3, 3, 4]);
});

test('adjacent content and array headings remain readable when no blank line is available', () => {
  const rows = mergeAlignedStructureRows([
    { key: 'before', line: 1, top: 0, node: { label: 'title = example' } },
    { key: 'array', line: 2, top: 20, node: { label: '[[servers]]', isArrayGroup: true } },
    { key: 'entry', line: 2, top: 20, node: { label: '[0]' } },
    { key: 'field', line: 3, top: 40, node: { label: 'name = alpha' } },
    { key: 'next', line: 6, top: 100, node: { label: 'next' } },
  ], 20);
  assert.deepEqual(rows.map(row => row.top), [0, 20, 40, 60, 100]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { history, undo } from '@codemirror/commands';
import { formatOnPaste, formatPastedDocument } from '../src/utils/codemirror/formatOnPaste.js';

test('JSON formatting retains exact numbers, duplicate keys and escapes', () => {
  const source = '{"n":9007199254740993,"n":1e+30,"text":" a \\u0041 \\" ","list":[{},[]]}';
  const result = formatPastedDocument(source);
  // Compare lexical tokens without insignificant whitespace.
  const compact = text => text.replace(/"(?:[^"\\]|\\.)*"|\s+/g, match => match.startsWith('"') ? match : '');
  assert.equal(compact(result), compact(source));
  assert.ok(result.includes('\n'));
  JSON.parse(result);
});
test('only paste transactions format; a single Undo restores the pre-paste document', () => {
  let state = EditorState.create({ doc: '', extensions: [formatOnPaste, history()] });
  const input = '{"x":[1,2]}';
  assert.equal(state.update({ changes: { from: 0, insert: input }, userEvent: 'input.type' }).newDoc.toString(), input);
  state = state.update({ changes: { from: 0, insert: input }, userEvent: 'input.paste' }).state;
  assert.equal(state.doc.toString(), '{\n  "x": [\n    1,\n    2\n  ]\n}');
  assert.equal(undo({ state, dispatch: transaction => { state = transaction.state; } }), true);
  assert.equal(state.doc.toString(), '');
});
test('invalid JSON and ordinary text remain unchanged', () => {
  for (const input of ['{"x":}', '{"x":1,}', 'ordinary text']) assert.equal(formatPastedDocument(input), input);
});

test('a whole JSON paste replaces an untouched starter and Undo restores it', async () => {
  const { createFormatOnPaste } = await import('../src/utils/codemirror/formatOnPaste.js');
  const starter = '{\n  \n}';
  let state = EditorState.create({ doc: starter, extensions: [createFormatOnPaste(() => starter), history()] });
  state = state.update({ changes: { from: 4, insert: '{"count":9007199254740993}' }, userEvent: 'input.paste' }).state;
  assert.equal(state.doc.toString(), '{\n  "count": 9007199254740993\n}');
  assert.equal(undo({ state, dispatch: transaction => { state = transaction.state; } }), true);
  assert.equal(state.doc.toString(), starter);
});

test('starter handling does not replace property snippets or edited documents', async () => {
  const { createFormatOnPaste } = await import('../src/utils/codemirror/formatOnPaste.js');
  const starter = '{\n  \n}';
  const extensions = [createFormatOnPaste(() => starter)];
  let state = EditorState.create({ doc: starter, extensions });
  assert.equal(state.update({ changes: { from: 4, insert: '"ok":true' }, userEvent: 'input.paste' }).newDoc.toString(), '{\n  "ok": true\n}');
  state = EditorState.create({ doc: '{"existing":1}', extensions });
  const result = state.update({ changes: { from: 1, insert: '{"new":2}' }, userEvent: 'input.paste' }).newDoc.toString();
  assert.ok(result.includes('"existing":1'));
  assert.ok(result.includes('{"new":2}'));
});

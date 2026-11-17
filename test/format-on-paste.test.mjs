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

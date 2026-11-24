import test from 'node:test';
import assert from 'node:assert/strict';
import { TomlFormatter } from '../src/services/formatters/TomlFormatter.js';

const structure = source => {
  const result = new TomlFormatter().buildStructure(source);
  assert.deepEqual(result.errors, []);
  return result.nodes;
};

test('repeated keys navigate to their own table and array entry', () => {
  const nodes = structure('[dev]\nname="dev"\n[prod]\nname="prod"\n[[users]]\nname="one"\n[[users]]\nname="two"');
  assert.equal(nodes[0].children[0].line, 2);
  assert.equal(nodes[1].children[0].line, 4);
  assert.deepEqual(nodes[2].children.map(n => [n.line, n.children[0].line]), [[5, 6], [7, 8]]);
});

test('quoted and dotted keys, comments, inline tables and multiline values retain source locations', () => {
  const nodes = structure(`"root.key" = { value = 1 }
text = """
[not.a.table]
name = "fake"
"""
values = [
  "name=not-a-key",
  "#not-a-comment"
]
["real.table".child] # trailing comment
"quoted.name" = "actual"
dotted.key = 2`);
  assert.deepEqual(nodes.map(n => n.line), [1, 2, 6, 10]);
  assert.equal(nodes[0].children[0].line, 1);
  const child = nodes[3].children[0];
  assert.equal(child.line, 10);
  assert.deepEqual(child.children.map(n => n.line), [11, 12]);
  assert.equal(child.children[1].children[0].line, 12);
});

test('nested array tables resolve against the current parent entry', () => {
  const nodes = structure('[[parents]]\nname="a"\n[[parents.children]]\nname="x"\n[[parents]]\nname="b"\n[[parents.children]]\nname="y"');
  const entries = nodes[0].children;
  assert.equal(entries[0].children[1].children[0].children[0].line, 4);
  assert.equal(entries[1].children[1].children[0].children[0].line, 8);
});

test('invalid TOML still reports validation errors', () => {
  const result = new TomlFormatter().buildStructure('[broken');
  assert.equal(result.nodes.length, 0);
  assert.equal(result.errors.length, 1);
});

test('leading section comments select the following node without moving its source row', () => {
  const nodes = structure('ports = [\n  80, # array comment\n  443\n]\n\n# Database section\n# Connection settings\n[database]\n# Host setting\nhost = "localhost"');
  assert.equal(nodes[0].selectionLine, 1);
  assert.equal(nodes[1].line, 8);
  assert.equal(nodes[1].selectionLine, 6);
  assert.equal(nodes[1].children[0].line, 10);
  assert.equal(nodes[1].children[0].selectionLine, 9);
});

test('comment-like content in multiline strings is not a leading comment', () => {
  const nodes = structure('text = """\n# content\n"""\nnext = 1\n# First server\n[[servers]]\nname = "one"');
  assert.equal(nodes[1].selectionLine, 4);
  assert.equal(nodes[2].selectionLine, 5);
  assert.equal(nodes[2].children[0].selectionLine, 5);
});

test('unfinished entries do not clear the valid outline and retain source lines', () => {
  const formatter = new TomlFormatter();
  for (const draft of ['[[', '[[]]', 'name =', 'name = "', 'items = [\n  1,']) {
    const result = formatter.buildStructure(`[database]\nhost = "localhost"\n${draft}`);
    assert.equal(result.nodes[0].label, '[database]', draft);
    assert.equal(result.nodes[0].children[0].line, 2, draft);
    assert.ok(result.errors.length, draft);
    assert.equal(formatter.validate(`[database]\nhost = "localhost"\n${draft}`).valid, false);
  }
});

test('editing in the middle preserves later entries and completing a draft adds it', () => {
  const formatter = new TomlFormatter();
  const result = formatter.buildStructure('[dev]\nhost = "dev"\nincomplete =\n[prod]\nhost = "prod"');
  assert.equal(result.nodes[1].label, '[prod]');
  assert.equal(result.nodes[1].children[0].line, 5);
  const completed = formatter.buildStructure('[dev]\nhost = "dev"\nincomplete = 1');
  assert.deepEqual(completed.errors, []);
  assert.equal(completed.nodes[0].children[1].label, 'incomplete = 1');
});

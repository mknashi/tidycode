// Synthetic evaluation fixtures. These do not enable document repair in the app.
export const repairCases = [
  {
    name: 'JSON missing comma between records', type: 'JSON',
    input: '{"items":[{"id":1,"name":"A"} {"id":2,"name":"B"}],"count":2}',
    expected: { items: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }], count: 2 },
  },
  {
    name: 'JSON missing closing quote in property name', type: 'JSON',
    input: '{"name":"Ravi","city:"Chicago","age":32}',
    expected: { name: 'Ravi', city: 'Chicago', age: 32 },
  },
  {
    name: 'JSON unescaped quotes inside a value', type: 'JSON',
    input: '{"message":"He said "hello".","id":7}',
    expected: { message: 'He said "hello".', id: 7 },
  },
  {
    name: 'JSON missing final brace', type: 'JSON',
    input: '{"items":[1,2,3],"active":true',
    expected: { items: [1, 2, 3], active: true },
  },
  {
    name: 'XML mismatched closing order', type: 'XML',
    input: '<root><item id="1"><name>Ravi</item></name></root>',
    expected: '<root><item id="1"><name>Ravi</name></item></root>',
  },
  {
    name: 'XML bare ampersand in text', type: 'XML',
    input: '<root><name>Ravi & Maya</name><count>2</count></root>',
    expected: '<root><name>Ravi &amp; Maya</name><count>2</count></root>',
  },
  {
    name: 'XML unquoted attribute', type: 'XML',
    input: '<root><item id=42 status="active">A</item><item id="43">B</item></root>',
    expected: '<root><item id="42" status="active">A</item><item id="43">B</item></root>',
  },
  {
    name: 'XML missing root close', type: 'XML',
    input: '<root><item id="1">A</item><item id="2">B</item>',
    expected: '<root><item id="1">A</item><item id="2">B</item></root>',
  },
];

function canonicalJSON(value) {
  if (Array.isArray(value)) return value.map(canonicalJSON);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalJSON(value[key])]));
  return value;
}
function canonicalXML(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid XML');
  function walk(node) {
    if (node.nodeType === 3 || node.nodeType === 4) return node.textContent.trim() ? { text: node.textContent } : null;
    if (node.nodeType !== 1) return null;
    return { tag: node.tagName,
      attributes: Object.fromEntries(Array.from(node.attributes).map(attr => [attr.name, attr.value]).sort(([a], [b]) => a.localeCompare(b))),
      children: Array.from(node.childNodes).map(walk).filter(Boolean) };
  }
  return walk(doc.documentElement);
}
export function checkRepair(test, output) {
  // A single surrounding code fence is a presentation detail, not lost data.
  const text = output.trim().replace(/^```(?:json|xml)?\s*\n([\s\S]*?)\n```$/i, '$1').trim();
  try {
    const actual = test.type === 'JSON' ? canonicalJSON(JSON.parse(text)) : canonicalXML(text);
    const expected = test.type === 'JSON' ? canonicalJSON(test.expected) : canonicalXML(test.expected);
    return { parses: true, preservesExpectedData: JSON.stringify(actual) === JSON.stringify(expected), cleanedOutput: text };
  } catch (error) { return { parses: false, preservesExpectedData: false, error: error.message, cleanedOutput: text }; }
}

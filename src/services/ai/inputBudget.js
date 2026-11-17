// Bound parsing and traversal independently of the model's context window.
export function summarizeStructure(content, type = '') {
  if (content.length > 262144) return ''; // Large files retain a prefix sample only.
  if (type.toLowerCase() === 'json' || /^[\s]*[\[{]/.test(content)) {
    try {
      const root = JSON.parse(content);
      const lines = [];
      let remaining = 64;
      function visit(value, path, depth) {
        if (remaining-- <= 0 || depth > 4) return;
        const kind = value === null ? 'null' : Array.isArray(value) ? `array (${value.length} items)` : typeof value;
        lines.push(`${path}: ${kind}`);
        if (value && typeof value === 'object') {
          // Inspect one representative array item, never imply all items match it.
          if (Array.isArray(value)) { if (value.length) visit(value[0], `${path}[0]`, depth + 1); }
          else {
            let count = 0;
            for (const key in value) {
              if (!Object.hasOwn(value, key)) continue;
              if (remaining <= 0 || count++ >= 12) break;
              visit(value[key], `${path}.${JSON.stringify(key.slice(0, 40))}`, depth + 1);
            }
          }
        }
      }
      visit(root, '$', 0);
      return `Partial JSON structure (array item shapes describe only item 0):\n${lines.join('\n')}`.slice(0, 1600);
    } catch { return ''; } // Malformed input is still useful as a text sample.
  }
  if (type.toLowerCase() === 'xml' && typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(content, 'application/xml');
    if (doc.querySelector('parsererror')) return '';
    const lines = [];
    let remaining = 64;
    function visit(element, depth) {
      if (!element || remaining-- <= 0 || depth > 4) return;
      lines.push(`${'  '.repeat(depth)}<${element.tagName.slice(0, 80)}> (${element.childElementCount} child elements)`);
      for (let child = element.firstElementChild; child && remaining > 0; child = child.nextElementSibling) visit(child, depth + 1);
    }
    visit(doc.documentElement, 0);
    return `Partial XML structure:\n${lines.join('\n')}`.slice(0, 1600);
  }
  return '';
}

// Measure the final prompt, never truncate instructions or repair input.
export async function budgetPrompt({ content, buildPrompt, measure, capacity, used = 0, reserve = 1500, allowSampling = false, type = '' }) {
  if (!Number.isFinite(capacity) || capacity <= 0) throw new Error('Cannot determine the on-device context limit.');
  const budget = capacity - used - reserve;
  let size = content.length;
  let structure;
  for (let attempt = 0; attempt < 24; attempt++) {
    const wasCut = size < content.length;
    // Keep a Unicode surrogate pair intact at the sample boundary.
    if (size < content.length && size > 0 && /[\uD800-\uDBFF]/.test(content[size - 1])) size--;
    const sample = content.slice(0, size);
    if (wasCut && structure === undefined) structure = summarizeStructure(content, type);
    const prompt = buildPrompt(sample, wasCut, wasCut ? structure : '');
    const usage = await measure(prompt);
    if (!Number.isFinite(usage)) throw new Error('Cannot measure the on-device prompt.');
    if (usage <= budget) {
      return { prompt, metadata: { wasCut, originalChars: content.length, analyzedChars: size, samplingStrategy: wasCut ? (structure ? 'structure-and-prefix' : 'prefix') : 'complete' } };
    }
    if (allowSampling && size === 0 && structure) { structure = ''; continue; }
    if (!allowSampling || size === 0 || budget <= 0) break;
    size = Math.max(0, Math.floor(size * Math.min(0.75, Math.max(0.1, budget / usage * 0.8))));
  }
  throw Object.assign(new Error('This content exceeds the on-device context limit. Shorten the input, start a new chat, or explicitly choose a cloud provider.'), { code: 'CONTEXT_LIMIT' });
}

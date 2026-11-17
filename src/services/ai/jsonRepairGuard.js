import { diffChars } from 'diff';

export const NANO_REPAIR_MAX_CHARS = 8192;
export function checkNanoRepairInput(content, type) {
  if (type?.toUpperCase() !== 'JSON') throw new Error('Private AI repair currently supports JSON only. XML repair is not enabled.');
  if (!content?.trim() || content.length > NANO_REPAIR_MAX_CHARS) throw new Error('Experimental Private AI repair supports JSON up to 8,192 characters. The document will not be sampled.');
}

// Deliberately narrow: accept insertions that repair syntax, never deleted or
// replaced source characters. Ambiguous changes are refused, even if valid JSON.
export function validateNanoRepair(original, output) {
  const source = original.trim();
  const fixed = output.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1').trim();
  if (fixed.length > source.length + 1024) throw new Error('Private AI proposed too many changes. The document is unchanged.');
  try { JSON.parse(fixed); } catch { throw new Error('Private AI did not return valid JSON. The document is unchanged.'); }
  // Reject duplicate keys before JSON.parse can silently discard their values.
  const tokens = fixed.match(/"(?:[^"\\]|\\.)*"|[{}\[\],:]|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g);
  let index = 0;
  function value(depth = 0) {
    if (depth > 128) throw new Error('JSON nesting is too deep for experimental repair.');
    const token = tokens[index++];
    if (token === '{') {
      const keys = new Set();
      while (tokens[index] !== '}') {
        const key = JSON.parse(tokens[index++]);
        if (keys.has(key)) throw new Error('Private AI repair contains duplicate object keys. Review the original manually.');
        keys.add(key); index++; value(depth + 1);
        if (tokens[index] !== ',') break;
        index++;
      }
      index++;
    } else if (token === '[') {
      while (tokens[index] !== ']') { value(depth + 1); if (tokens[index] !== ',') break; index++; }
      index++;
    }
  }
  value();
  const inside = []; let inString = false; let escaped = false;
  for (let i = 0; i < fixed.length; i++) {
    inside[i] = inString;
    if (escaped) escaped = false;
    else if (inString && fixed[i] === '\\') escaped = true;
    else if (fixed[i] === '"') inString = !inString;
  }
  const changes = diffChars(source, fixed, { maxEditLength: 1024, timeout: 100 });
  const reject = () => { throw new Error('Private AI could not verify that this repair preserves your data. The document is unchanged.'); };
  if (!changes) reject();
  let offset = 0; let sourceOffset = 0;
  for (const change of changes) {
    if (change.removed) reject();
    if (change.added) {
      for (let j = 0; j < change.value.length; j++) {
        const pos = offset + j, char = fixed[pos];
        const escapingQuote = char === '\\' && inside[pos] && fixed[pos + 1] === '"';
        const closingKeyQuote = char === '"' && inside[pos] && /^\s*:/.test(fixed.slice(pos + 1));
        const spacing = /\s/.test(char) && !inside[pos];
        const separator = /[,:]/.test(char) && !inside[pos] && !(/[\d.eE+-]/.test(source[sourceOffset - 1] || '') && /[\d.eE+-]/.test(source[sourceOffset] || ''));
        const ending = /[}\]]/.test(char) && !inside[pos] && /^[\s}\]]*$/.test(source.slice(sourceOffset));
        if (!escapingQuote && !closingKeyQuote && !spacing && !separator && !ending) reject();
      }
    } else sourceOffset += change.value.length;
    offset += change.value.length;
  }
  return fixed;
}

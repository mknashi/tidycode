import { EditorState } from '@codemirror/state';

// Format tokens rather than parsed values: retain duplicate keys, numeric
// precision, string escapes, XML attributes, and text exactly as pasted.
export function formatPastedDocument(content) {
  const text = content.trim();
  const pad = depth => '  '.repeat(Math.min(200, Math.max(0, depth)));
  try {
    if (/^[{[]/.test(text)) {
      JSON.parse(text); // Validation only; never serialize the parsed values.
      const tokens = text.match(/"(?:[^"\\]|\\.)*"|[^\s"{}\[\],:]+|[{}\[\],:]/g);
      let depth = 0, result = '';
      tokens.forEach((token, i) => {
        if (token === '{' || token === '[') {
          result += token; depth++;
          if (tokens[i + 1] !== (token === '{' ? '}' : ']')) result += '\n' + pad(depth);
        } else if (token === '}' || token === ']') {
          depth--;
          if (tokens[i - 1] !== (token === '}' ? '{' : '[')) result += '\n' + pad(depth);
          result += token;
        } else if (token === ',') result += ',\n' + pad(depth);
        else if (token === ':') result += ': ';
        else result += token;
      });
      return result;
    }
    if (!text.startsWith('<') || /<\?(?:php|=)|<!DOCTYPE|<!\[CDATA\[/i.test(text)) return content;
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return content;
    for (const element of doc.getElementsByTagName('*')) {
      // Mixed content and explicit whitespace preservation must remain untouched.
      if (element.hasAttribute('xml:space')) return content;
      const children = Array.from(element.childNodes);
      if (children.some(node => node.nodeType === 3 && node.textContent.trim()) && children.some(node => node.nodeType !== 3)) return content;
    }
    const tokens = text.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/g);
    let depth = 0, result = '', previous = '';
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token.startsWith('<')) {
        if (token.trim()) { result += token; previous = 'text'; }
        // Keep whitespace-only leaf values, e.g. <value> </value>.
        else if (previous === 'open' && tokens[i + 1]?.startsWith('</')) { result += token; }
        continue;
      }
      const closing = token.startsWith('</');
      const opening = !closing && !/^<[!?]/.test(token) && !token.endsWith('/>');
      if (closing) depth--;
      if (result && !(closing && (previous === 'text' || previous === 'open'))) result += '\n' + pad(depth);
      result += token;
      if (opening) depth++;
      previous = opening ? 'open' : closing ? 'close' : 'other';
    }
    return result;
  } catch { return content; } // Invalid paste stays intact for normal validation.
}

export const createFormatOnPaste = (getStarter = () => null) => EditorState.transactionFilter.of(transaction => {
  if (!transaction.docChanged || !transaction.isUserEvent('input.paste')) return transaction;
  let content = transaction.newDoc.toString();
  const starter = getStarter();
  if (starter && transaction.startState.doc.toString() === starter) {
    const insertions = [];
    transaction.changes.iterChanges((_from, _to, _fromNew, _toNew, inserted) => {
      insertions.push(inserted.toString());
    });
    const pasted = insertions.length === 1 ? insertions[0].trim() : '';
    // Replace the untouched scaffold only for a whole document, not a property
    // pasted inside it. XML must parse as a document with its own root.
    const jsonDocument = /^[{[]/.test(pasted) && /[}\]]$/.test(pasted);
    let xmlDocument = false;
    if (pasted.startsWith('<') && typeof DOMParser !== 'undefined') {
      const parsed = new DOMParser().parseFromString(pasted, 'application/xml');
      xmlDocument = !parsed.getElementsByTagName('parsererror').length;
    }
    if (jsonDocument || xmlDocument) content = insertions[0];
  }
  const formatted = formatPastedDocument(content);
  if (formatted === transaction.newDoc.toString()) return transaction;
  // Both changes are one transaction: one Undo removes the paste and formatting.
  return [transaction, {
    changes: { from: 0, to: transaction.newDoc.length, insert: formatted },
    selection: { anchor: formatted.length },
    sequential: true,
  }];
});

export const formatOnPaste = createFormatOnPaste();

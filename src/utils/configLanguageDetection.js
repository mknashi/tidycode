// Recognize configuration syntax before Markdown comments or CSS-like flow maps.
// Detection does not require validity: partially edited files keep their language.
export function detectConfigurationLanguage(content = '') {
  const lines = content.split('\n').filter(line => line.trim() && !/^\s*#/.test(line));
  const first = lines.find(line => !/^\s*(---|\.\.\.)\s*$/.test(line));
  if (!first) return null;
  const key = '(?:[\\w.-]+|"[^"\\n]+"|\'[^\'\\n]+\')';
  const mapping = new RegExp(`^\\s*(?:-\\s+)?${key}:([ \\t]|$)`);
  if (mapping.test(first) || /^\s*-\s+\S/.test(first)) {
    const mappings = lines.filter(line => mapping.test(line));
    if (mapping.test(first) || mappings.length >= 2) return 'yaml';
  }
  if (/^\s*\[\[?[^\]]+\]\]?\s*(?:#.*)?$/.test(first) || new RegExp(`^\\s*${key}\\s*=`).test(first)) return 'toml';
  return null;
}

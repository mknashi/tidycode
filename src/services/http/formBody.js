// Keep the body string as the portable request definition; rows are only an editing view.
export function formRows(body, limit = Infinity) {
  const rows = [];
  for (const [key, value] of new URLSearchParams(body)) {
    if (rows.length >= limit) break;
    rows.push({ id: crypto.randomUUID(), key, value });
  }
  return rows;
}
export function formBody(rows) {
  const params = new URLSearchParams();
  for (const row of rows)
    if (row.key || row.value) params.append(row.key, row.value);
  // References remain readable in Raw. Literal values keep standard form encoding.
  return params
    .toString()
    .replace(/%7B%7B([^&]*?)%7D%7D/gi, (match) =>
      decodeURIComponent(match.replace(/\+/g, " ")),
    );
}
export function formBodyWarning(body) {
  if (
    [...new URLSearchParams(body)].some(
      ([key, value]) => !value && /^\s*[A-Za-z_][\w.-]*\s*:/.test(key),
    )
  )
    return "This looks like key: value text. Use the Fields editor, or key=value pairs separated by & in Raw.";
  if (/[\r\n]/.test(body))
    return "Raw form data contains line breaks. Separate fields with &, and encode literal line breaks as %0A.";
  return "";
}

import { resolveVariables } from "./variables.js";
// Probe only the requested definition. Unrelated draft errors cannot suppress the tooltip.
// Never return expanded secret values (including indirectly referenced secrets).
export function apiVariablePreview(request, settings, key) {
  const result = resolveVariables(
    {
      ...request,
      url: "https://preview.invalid/",
      headers: [],
      auth: "none",
      method: "POST",
      bodyMode: "text",
      body: "{{" + key + "}}",
      multipart: [],
    },
    settings,
    { uuid: () => "", now: () => 0 },
  );
  const row = result.used.find((r) => r.key === key);
  if (result.error || !row)
    return {
      key,
      detail: result.error?.message || "Not defined in the current scopes",
    };
  return {
    key,
    detail: `${row.scope} · ${row.secret ? "Secret value hidden" : row.preview || "(empty)"}`,
  };
}
export function variableFieldPreview(text, preview) {
  const names = [
    ...new Set(
      [...String(text || "").matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((m) =>
        m[1].trim(),
      ),
    ),
  ].slice(0, 20);
  return names
    .map((key) => {
      const result = preview(key);
      return `${key}: ${result.detail}`;
    })
    .join("\n");
}

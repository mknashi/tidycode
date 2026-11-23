import { editingBlocks } from "./httpEditing.js";
import { requestAtLine } from "./editorRequests.js";

// Only the explicitly selected source block changes; file declarations and neighbors survive.
export function applyTestDataToSource(source, item, target, preview) {
  const block = editingBlocks(source).find(
    (b) => b.blockIndex === item.blockIndex,
  );
  if (!block || block.name !== item.name || block.method !== item.method)
    throw new Error("Request changed. Open the generator again.");
  const value = JSON.parse(preview);
  if (target === "params") {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.values(value).some((v) => v !== null && typeof v === "object")
    )
      throw new Error("Query data must be an object of primitive values.");
    const request = requestAtLine(source, block.line).request;
    const names = new Set(Object.keys(value));
    const hashAt = request.url.indexOf("#");
    const hash = hashAt < 0 ? "" : request.url.slice(hashAt);
    const url = hashAt < 0 ? request.url : request.url.slice(0, hashAt);
    const queryAt = url.indexOf("?");
    const base = queryAt < 0 ? url : url.slice(0, queryAt);
    const existing =
      queryAt < 0
        ? []
        : url
            .slice(queryAt + 1)
            .split("&")
            .filter(Boolean)
            .filter((part) => {
              const key = new URLSearchParams(part).keys().next().value;
              return !names.has(key);
            });
    const generated = new URLSearchParams(
      Object.entries(value).map(([key, v]) => [
        key,
        v === null ? "" : String(v),
      ]),
    ).toString();
    const query = [...existing, ...(generated ? [generated] : [])].join("&");
    const nextUrl = base + (query ? "?" + query : "") + hash;
    const line = source.slice(block.requestFrom, block.requestTo);
    const replaced = line.replace(
      /^(\s*\w+\s+)\S+/,
      (_, prefix) => prefix + nextUrl,
    );
    return (
      source.slice(0, block.requestFrom) +
      replaced +
      source.slice(block.requestTo)
    );
  }
  if (target !== "body") throw new Error("Unknown test data target.");
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  // Preserve comments, auth and custom headers; replace upload directives and body metadata.
  const prefix = source
    .slice(block.from, block.requestTo)
    .replace(/^\s*#\s*@body\s+[^\r\n]*\r?\n/gm, "")
    .replace(/\r$/, "");
  const headers = block.headers
    .filter((h) => !/^\s*(?:content-type|content-length)\s*:/i.test(h.text))
    .map((h) => h.text.replace(/\r$/, ""));
  const replacement = [
    prefix,
    ...headers,
    "Content-Type: application/json",
    "",
    preview.replace(/\r?\n/g, newline),
    "",
  ].join(newline);
  return source.slice(0, block.from) + replacement + source.slice(block.to);
}

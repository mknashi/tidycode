import { httpRequestOutline } from "./editorRequests.js";
import { fileDeclarations } from "./fileVariables.js";
export { fileDeclarations } from "./fileVariables.js";
import { templateUrl, browserHeaderRestricted } from "./request.js";
export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];
export const HTTP_HEADERS = [
  "Accept",
  "Authorization",
  "Content-Type",

  "Cache-Control",
  "If-None-Match",
  "If-Modified-Since",
  "X-API-Key",
  "X-Request-ID",
];
export const HTTP_CONTENT_TYPES = [
  "application/json",
  "application/xml",
  "application/octet-stream",
  "application/x-www-form-urlencoded",
  "text/plain",
  "text/html",
  "multipart/form-data",
];
export function editingBlocks(source) {
  const rawLines = source.split("\n");
  let offset = 0;
  const lines = rawLines.map((text, i) => {
    const line = {
      text,
      from: offset,
      to: offset + text.length,
      number: i + 1,
    };
    offset += text.length + 1;
    return line;
  });
  return httpRequestOutline(source).map((item) => {
    const request = lines[item.line - 1];
    let blank = item.line;
    while (blank < item.endLine && lines[blank].text.trim()) blank++;
    const bodyStart =
      blank < item.endLine ? lines[blank].to + 1 : lines[item.endLine - 1].to;
    return {
      ...item,
      from: lines[item.startLine - 1].from,
      to: lines[item.endLine - 1].to,
      requestFrom: request.from,
      requestTo: request.to,
      bodyStart,
      headers: lines.slice(item.line, blank),
      lines,
    };
  });
}
export function httpDiagnostics(
  source,
  metadata = [],
  { native = false } = {},
) {
  if (new TextEncoder().encode(source).length > 1024 * 1024)
    return [
      {
        from: 0,
        to: Math.min(1, source.length),
        severity: "warning",
        message:
          "Editing assistance is limited to files up to 1 MiB; request actions support up to 10 MiB.",
      },
    ];
  const diagnostics = [];
  const add = (from, to, message, severity = "error") => {
    if (diagnostics.length < 100)
      diagnostics.push({ from, to: Math.max(from + 1, to), message, severity });
  };
  let blocks;
  try {
    blocks = editingBlocks(source);
  } catch (error) {
    return [
      {
        from: 0,
        to: Math.min(1, source.length),
        severity: "error",
        message: error.message,
      },
    ];
  }
  const lines = source.split("\n");
  let start = 0,
    seen = false;
  for (const line of lines) {
    if (/^\s*###/.test(line)) seen = false;
    else if (!seen && line.trim() && !/^\s*[@#]/.test(line)) {
      if (!/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+/i.test(line))
        add(
          start,
          start + line.length,
          "Start a request with a supported HTTP method and URL.",
        );
      seen = true;
    }
    start += line.length + 1;
  }
  if (blocks.length > 500)
    add(
      0,
      Math.min(1, source.length),
      "Diagnostics cover the first 500 request blocks; use smaller files for complete editing assistance.",
      "warning",
    );
  for (const block of blocks.slice(0, 500)) {
    const line = block.lines[block.line - 1];
    const match = line.text.match(/^(\w+)\s+(\S+)(?:\s+HTTP\/[\d.]+)?\s*$/);
    try {
      if (!match) throw new Error();
      templateUrl(match[2]);
    } catch {
      add(
        line.from,
        line.to,
        "Use an HTTP(S) URL or a valid {{variable}} URL template.",
      );
    }
    for (const header of block.headers)
      if (
        !/^\s*#/.test(header.text) &&
        !/^[!#$%&'*+.^_`|~\w-]+\s*:/.test(header.text)
      )
        add(
          header.from,
          header.to,
          "Headers need a valid name followed by a colon.",
        );
    for (const header of block.headers) {
      const key = header.text.match(/^([^:]+):/)?.[1];
      if (
        key &&
        browserHeaderRestricted(key.trim()) &&
        !(native && /^(cookie|user-agent)$/i.test(key.trim()))
      )
        add(
          header.from,
          header.to,
          "This header is controlled by the browser and cannot be set reliably.",
          "warning",
        );
    }
    let declarations;
    try {
      declarations = fileDeclarations(source, block.blockIndex);
    } catch (error) {
      add(line.from, line.to, error.message);
      continue;
    }
    const definitions = [
      ...metadata.map((row) =>
        typeof row === "string" ? { key: row, rank: 0, hasValue: true } : row,
      ),
      ...declarations.file.map((row) => ({
        key: row.key,
        rank: 1,
        hasValue: !row.secret || !!row.value,
      })),
      ...declarations.block.map((row) => ({
        key: row.key,
        rank: 5,
        hasValue: !row.secret || !!row.value,
      })),
    ].sort((a, b) => (a.rank || 0) - (b.rank || 0));
    const names = new Map(definitions.map((row) => [row.key, row.hasValue]));
    names.set("$uuid", true);
    names.set("$timestamp", true);
    const fragment = source.slice(line.from, block.to);
    for (const match of fragment.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g))
      if (!names.has(match[1]) || names.get(match[1]) === false)
        add(
          line.from + match.index,
          line.from + match.index + match[0].length,
          `Define variable “${match[1]}” before sending.`,
          "warning",
        );
    const body = source.slice(block.bodyStart, block.to).trim();
    if (
      body &&
      !/\{\{/.test(body) &&
      (block.headers.some((h) =>
        /^content-type:\s*application\/(?:[\w.+-]*\+)?json/i.test(h.text),
      ) ||
        /^[{[]/.test(body))
    ) {
      try {
        JSON.parse(body);
      } catch {
        add(
          block.bodyStart,
          Math.min(block.to, block.bodyStart + 1),
          "Invalid JSON request body.",
        );
      }
    }
  }
  return diagnostics;
}
export const HTTP_TEMPLATES = {
  get: "### New request\nGET {{base_url}}/path\nAccept: application/json\n",
  json: '### Create resource\nPOST {{base_url}}/path\nContent-Type: application/json\nAccept: application/json\n\n{"name":"value"}\n',
  form: "### Submit form\nPOST {{base_url}}/path\nContent-Type: application/x-www-form-urlencoded\n\nname=value\n",
  bearer:
    "### Authenticated request\nGET {{base_url}}/path\nAuthorization: Bearer {{access_token}}\nAccept: application/json\n",
  multipart:
    "### Upload form\n# @body multipart\n# Open in the API client to select files; file bytes remain session-only.\nPOST {{base_url}}/upload\n",
  binary:
    "### Upload binary\n# @body binary\n# Open in the API client to select a file; file bytes remain session-only.\nPOST {{base_url}}/upload\n",
};
export function editHttpBlock(source, item, action, name) {
  const blocks = editingBlocks(source);
  const block = blocks.find((b) => b.blockIndex === item.blockIndex);
  if (!block || block.name !== item.name || block.method !== item.method)
    throw new Error("The request changed. Select it again.");
  for (const entry of blocks)
    if (!/^\s*###/.test(source.slice(entry.from, entry.to)))
      entry.from = entry.requestFrom;
  const text = source.slice(block.from, block.to);
  if (action === "delete")
    return source.slice(0, block.from) + source.slice(block.to);
  if (action === "duplicate")
    return (
      source.slice(0, block.to) +
      "\n\n" +
      (/^\s*###/.test(text)
        ? text.replace(/^\s*###[^\n]*/, () => "### " + block.name + " copy")
        : "### " + block.name + " copy\n" + text) +
      source.slice(block.to)
    );
  if (action === "rename") {
    if (!name?.trim() || /[\r\n]/.test(name) || name.length > 200)
      throw new Error("Use a request name of 1–200 characters on one line.");
    const replaced = /^\s*###/.test(text)
      ? text.replace(/^\s*###[^\n]*/, () => "### " + name.trim())
      : "### " + name.trim() + "\n" + text;
    return source.slice(0, block.from) + replaced + source.slice(block.to);
  }
  const index = blocks.indexOf(block);
  const other = blocks[index + (action === "up" ? -1 : 1)];
  if (!other) return source;
  const first = block.from < other.from ? block : other,
    last = first === block ? other : block;
  return (
    source.slice(0, first.from) +
    (/^\s*###/.test(source.slice(last.from, last.to))
      ? source.slice(last.from, last.to)
      : "### " + last.name + "\n" + source.slice(last.from, last.to)) +
    source.slice(first.to, last.from) +
    (/^\s*###/.test(source.slice(first.from, first.to))
      ? source.slice(first.from, first.to)
      : "### " + first.name + "\n" + source.slice(first.from, first.to)) +
    source.slice(last.to)
  );
}

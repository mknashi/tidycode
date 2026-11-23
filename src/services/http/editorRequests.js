import { newRow } from "./request.js";
import { fileDeclarations } from "./fileVariables.js";
import { parseImport, IMPORT_LIMIT } from "./importers.js";

/** Select one ### request block without executing scripts or reading referenced files. */
function httpBlocks(source) {
  if (
    typeof source !== "string" ||
    new TextEncoder().encode(source).length > IMPORT_LIMIT
  )
    throw new Error("HTTP editor files must be text no larger than 10 MiB.");
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  if (lines.length > 100000)
    throw new Error("HTTP editor files support up to 100,000 lines.");
  const starts = [0];
  lines.forEach((line, index) => {
    if (/^\s*###/.test(line) && index !== 0) starts.push(index);
  });
  if (starts.length > 10000)
    throw new Error("HTTP editor files support up to 10,000 request blocks.");
  const blocks = starts.map((start, i) => ({
    start,
    end: starts[i + 1] ?? lines.length,
    source: lines.slice(start, starts[i + 1] ?? lines.length).join("\n"),
  }));
  return { lines, blocks };
}
export function httpRequestOutline(source) {
  const { blocks } = httpBlocks(source);
  return blocks.flatMap((block, blockIndex) => {
    const lines = block.source.split("\n");
    const index = lines.findIndex((line) =>
      /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+/i.test(line),
    );
    if (index < 0) return [];
    const method = lines[index].match(/^(\w+)/)[1].toUpperCase();
    const name =
      lines
        .slice(0, index)
        .map((line) => line.replace(/^\s*#+\s*/, "").trim())
        .find((line) => line && !line.startsWith("@")) || method + " request";
    return [
      {
        blockIndex,
        method,
        name: name.slice(0, 500),
        line: block.start + index + 1,
        startLine: block.start + 1,
        endLine: block.end,
      },
    ];
  });
}
export function requestAtLine(source, cursorLine = 1) {
  const { lines, blocks } = httpBlocks(source);
  const row = Math.max(
    0,
    Math.min(lines.length - 1, Math.floor(cursorLine || 1) - 1),
  );
  let block = blocks.find((b) => row >= b.start && row < b.end);
  const hasRequest = (block) =>
    /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+/im.test(block.source);
  if (
    block === blocks[0] &&
    !hasRequest(block) &&
    !/^\s*###/m.test(block.source) &&
    block.source
      .split("\n")
      .every((line) => !line.trim() || /^\s*[#@]/.test(line))
  )
    block = blocks.find(hasRequest);
  if (!block || !hasRequest(block))
    throw new Error(
      "Place the cursor inside a supported HTTP request block, separated with ###.",
    );
  const declarations = fileDeclarations(source, blocks.indexOf(block));
  const blockLines = block.source.split("\n");
  const requestLineIndex = blockLines.findIndex((line) =>
    /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s/i.test(line),
  );
  const cleanSource = blockLines
    .map((line, index) =>
      index < requestLineIndex && /^\s*@/.test(line) ? "" : line,
    )
    .join("\n");
  const preview = parseImport(cleanSource, "http");
  const bodyMode = blockLines
    .slice(0, requestLineIndex)
    .join("\n")
    .match(/^\s*#\s*@body\s+(\w+)/m)?.[1];
  if (bodyMode && !["multipart", "binary"].includes(bodyMode))
    throw new Error("Supported @body directives are multipart and binary.");
  if (bodyMode) preview.requests[0].bodyMode = bodyMode;
  if (bodyMode === "multipart")
    preview.requests[0].multipart = [
      { ...newRow("file"), type: "file", file: null },
    ];
  if (preview.requests.length !== 1)
    throw new Error("Choose one HTTP request block at the cursor.");
  const warnings = preview.warnings.filter(
    (w) =>
      !w.includes("unresolved {{variables}}") &&
      !w.includes("variable declarations"),
  );
  if (bodyMode && ["GET", "HEAD"].includes(preview.requests[0].method))
    warnings.push(
      "GET/HEAD upload bodies are not sent. Choose a method that supports an upload.",
    );
  return {
    blockIndex: blocks.indexOf(block),
    request: {
      ...preview.requests[0],
      collectionId: null,
      folderId: null,
      fileVariables: declarations.file,
      blockVariables: declarations.block,
    },
    warnings,
  };
}

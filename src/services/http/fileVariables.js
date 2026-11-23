import { newVariable, credentialVariable } from "./variables.js";
let previousSource, previousModel;
function declarations(source) {
  if (source === previousSource) return previousModel;
  const file = [],
    blocks = new Map();
  let blockIndex = 0,
    delimited = false,
    seenRequest = false,
    total = 0;
  for (const [index, line] of source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .entries()) {
    if (/^\s*###/.test(line)) {
      if (index > 0) blockIndex++;
      delimited = true;
      seenRequest = false;
    }
    if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s/i.test(line))
      seenRequest = true;
    if (seenRequest) continue;
    const match = line.match(/^\s*@([A-Za-z_][\w.-]*)\s*=\s*(.*)$/);
    if (!match) {
      if (/^\s*@/.test(line))
        throw new Error("File declarations use @name=value before a request.");
      continue;
    }
    if (++total > 4000)
      throw new Error(
        "Use at most 4,000 file declarations in one source file.",
      );
    let value = match[2].trim();
    if (/^"/.test(value)) {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === "string") value = parsed;
      } catch {}
    }
    if (new TextEncoder().encode(value).length > 65536)
      throw new Error("File variable values support up to 64 KiB.");
    const row = {
      ...newVariable(),
      key: match[1],
      value,
      secret: credentialVariable(match[1]),
    };
    const rows = delimited ? blocks.get(blockIndex) || [] : file;
    if (rows.length >= 200 || rows.some((r) => r.key === row.key))
      throw new Error(
        "Use at most 200 unique variable names within each file or request scope.",
      );
    rows.push(row);
    if (delimited) blocks.set(blockIndex, rows);
  }
  previousSource = source;
  previousModel = { file, blocks };
  return previousModel;
}
export function fileDeclarations(source, blockIndex) {
  const model = declarations(source);
  return { file: model.file, block: model.blocks.get(blockIndex) || [] };
}

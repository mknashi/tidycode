import { hoverTooltip } from "@codemirror/view";
import { json as jsonBodyMode } from "@codemirror/legacy-modes/mode/javascript";
import { xml as xmlBodyMode } from "@codemirror/legacy-modes/mode/xml";
import { autocompletion } from "@codemirror/autocomplete";
import { linter } from "@codemirror/lint";
import { foldService } from "@codemirror/language";
import {
  HTTP_METHODS,
  HTTP_HEADERS,
  HTTP_CONTENT_TYPES,
  fileDeclarations,
  httpDiagnostics,
  editingBlocks,
} from "../../services/http/httpEditing.js";
export function httpCompletionSource(metadata = [], endpoints = []) {
  return (context) => {
    if (context.state.doc.length > 1024 * 1024) return null;
    const before = context.state.sliceDoc(
      context.state.doc.lineAt(context.pos).from,
      context.pos,
    );
    const variable = before.match(/\{\{\s*([\w.$-]*)$/);
    if (variable) {
      let declarations = { file: [], block: [] };
      try {
        const block = editingBlocks(context.state.doc.toString()).find(
          (b) => context.pos >= b.from && context.pos <= b.to,
        );
        declarations = fileDeclarations(
          context.state.doc.toString(),
          block?.blockIndex || 0,
        );
      } catch {}
      const names = new Set([
        ...metadata.map((r) => (typeof r === "string" ? r : r.key)),
        ...declarations.file.map((r) => r.key),
        ...declarations.block.map((r) => r.key),
        "$uuid",
        "$timestamp",
      ]);
      return {
        from: context.pos - variable[1].length,
        options: [...names].map((label) => ({
          label,
          type: "variable",
          apply:
            label +
            (context.state.sliceDoc(context.pos, context.pos + 2) === "}}"
              ? ""
              : "}}"),
        })),
        validFor: /[\w.$-]*/,
      };
    }
    const endpoint = before.match(
      /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+([^\s]*)$/i,
    );
    if (endpoint && (context.explicit || endpoint[2]))
      return {
        from: context.pos - endpoint[2].length,
        options: endpoints
          .filter((item) => item.method === endpoint[1].toUpperCase())
          .slice(0, 200)
          .map((item) => ({
            label: item.url,
            type: "url",
            detail: "Imported OpenAPI endpoint",
            apply: item.url,
          })),
      };
    const word = context.matchBefore(/[\w/+.-]*/);
    if (!word || (!context.explicit && !word.text)) return null;
    let block;
    try {
      block = editingBlocks(context.state.doc.toString()).find(
        (b) => context.pos >= b.from && context.pos <= b.to,
      );
    } catch {}
    const requestLine =
      !block || context.state.doc.lineAt(context.pos).number <= block.line;
    const options =
      requestLine && /^\s*[A-Za-z]*$/.test(before)
        ? HTTP_METHODS.map((label) => ({
            label,
            type: "keyword",
            apply: label + " ",
          }))
        : /^content-type:\s*[\w/+-]*$/i.test(before) ||
            /^accept:\s*[\w/+-]*$/i.test(before)
          ? HTTP_CONTENT_TYPES.map((label) => ({
              label,
              type: "constant",
            }))
          : block && context.pos <= block.bodyStart && /^[\w-]*$/.test(before)
            ? HTTP_HEADERS.map((label) => ({
                label,
                type: "property",
                apply: label + ": ",
              }))
            : [];
    // Method and header suggestions share an empty line; headers are also available on explicit completion.
    if (context.explicit && requestLine && /^\w*$/.test(before))
      options.push(
        ...HTTP_HEADERS.map((label) => ({
          label,
          type: "property",
          apply: label + ": ",
        })),
      );
    return options.length ? { from: word.from, options } : null;
  };
}
export function httpVariablePreview(source, pos, metadata = []) {
  if (source.length > 1024 * 1024) return null;
  const start = source.lastIndexOf("\n", pos - 1) + 1;
  const end = source.indexOf("\n", pos);
  const line = source.slice(start, end < 0 ? source.length : end);
  const match = [...line.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].find(
    m => pos >= start + m.index && pos < start + m.index + m[0].length,
  );
  if (!match) return null;
  const key = match[1].trim();
  const block = editingBlocks(source).find(b => pos >= b.from && pos <= b.to);
  let declarations;
  try { declarations = fileDeclarations(source, block?.blockIndex || 0); }
  catch { return { key, from: start + match.index, to: start + match.index + match[0].length, detail: "Fix variable declarations to preview this value." }; }
  const rows = [
    ...metadata.filter(r => typeof r !== "string" && (r.blockIndex === undefined || r.blockIndex === block?.blockIndex)),
    ...declarations.file.map(r => ({ ...r, rank: 1, scope: "File" })),
    ...declarations.block.map(r => ({ ...r, rank: 5, scope: "Request block" })),
  ].sort((a,b) => (a.rank || 0) - (b.rank || 0));
  const row = rows.filter(r => r.key === key).at(-1);
  const detail = row
    ? `${row.scope || "Variable"} · ${row.secret ? "Secret value hidden" : row.hasValue === false ? "Value required" : String(row.value ?? "").slice(0, 1000) || "(empty)"}`
    : ["$uuid", "$timestamp"].includes(key) ? "Generated when the request is sent" : "Not defined in the current scopes";
  return { key, detail, from: start + match.index, to: start + match.index + match[0].length };
}

export function httpEditingExtensions(metadata = [], endpoints = []) {
  return [
    hoverTooltip((view, pos) => {
      const preview = httpVariablePreview(view.state.doc.toString(), pos, metadata);
      if (!preview) return null;
      return { pos: preview.from, end: preview.to, above: true, create() {
        const dom = document.createElement("div");
        dom.style.cssText = "padding:6px 9px;max-width:420px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px";
        const name = document.createElement("strong");
        name.textContent = preview.key;
        const value = document.createElement("div");
        value.textContent = preview.detail;
        dom.append(name, value);
        return { dom };
      }};
    }),
    autocompletion({
      override: [httpCompletionSource(metadata, endpoints)],
      activateOnTyping: true,
    }),
    linter((view) => httpDiagnostics(view.state.doc.toString(), metadata), {
      delay: 350,
    }),
    foldService.of((state, lineStart, lineEnd) => {
      if (state.doc.length > 1024 * 1024) return null;
      try {
        for (const block of editingBlocks(state.doc.toString())) {
          const start = state.doc.line(block.startLine),
            request = state.doc.line(block.line);
          if (
            (lineStart === start.from || lineStart === request.from) &&
            block.to > lineEnd
          )
            return { from: lineEnd, to: block.to };
          if (block.headers.length > 1 && lineStart === block.headers[0].from)
            return { from: lineEnd, to: block.headers.at(-1).to };
          const bodyLine = state.doc.lineAt(
            Math.min(block.bodyStart, state.doc.length),
          );
          if (lineStart === bodyLine.from && block.to > lineEnd)
            return { from: lineEnd, to: block.to };
        }
      } catch {}
      return null;
    }),
  ];
}

export const httpStreamParser = {
  startState: () => ({ phase: "preamble", type: "text", body: null }),
  copyState: (state) => ({
    ...state,
    body: state.body
      ? Object.fromEntries(
          Object.entries(state.body).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.slice() : value,
          ]),
        )
      : null,
  }),
  blankLine(state) {
    if (state.phase === "headers") {
      state.phase = "body";
      state.body = null;
    }
  },
  token(stream, state) {
    if (stream.sol() && stream.match(/\s*###.*/)) {
      state.phase = "preamble";
      state.type = "text";
      state.body = null;
      return "comment";
    }
    if (state.phase !== "body" && stream.sol() && stream.match(/\s*#.*/))
      return "comment";
    if (stream.match(/\{\{[^}]*\}\}/)) return "variableName";
    if (state.phase === "body") {
      if (state.type === "text" && stream.sol()) {
        if (/^\s*[{[]/.test(stream.string)) state.type = "json";
        else if (/^\s*</.test(stream.string)) state.type = "xml";
      }
      const mode =
        state.type === "json"
          ? jsonBodyMode
          : state.type === "xml"
            ? xmlBodyMode
            : null;
      if (mode) {
        if (!state.body) state.body = mode.startState(2);
        return mode.token(stream, state.body);
      }
      stream.skipToEnd();
      return null;
    }
    if (
      stream.sol() &&
      stream.match(/(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/i)
    ) {
      state.phase = "headers";
      return "keyword";
    }
    if (stream.sol() && /^content-type:/i.test(stream.string)) {
      state.type = /json/i.test(stream.string)
        ? "json"
        : /xml/i.test(stream.string)
          ? "xml"
          : "text";
    }
    if (stream.sol() && stream.match(/[A-Za-z0-9_-]+(?=:)/))
      return "propertyName";
    if (stream.sol() && stream.match(/@[A-Za-z_][\w.-]*/))
      return "variableName";
    if (stream.match(/https?:\/\/[^\s]+/)) return "string";
    if (stream.match(/"(?:[^"\\]|\\.)*"/)) return "string";
    stream.next();
    return null;
  },
  indent(state, textAfter, context) {
    const mode =
      state.type === "json"
        ? jsonBodyMode
        : state.type === "xml"
          ? xmlBodyMode
          : null;
    return state.phase === "body" && state.body && mode?.indent
      ? mode.indent(state.body, textAfter, context)
      : null;
  },
  languageData: { commentTokens: { line: "#" } },
};

import { hoverTooltip } from "@codemirror/view";
export function variableHover(preview) {
  return hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos);
    const match = [...line.text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].find(
      (m) =>
        pos >= line.from + m.index && pos < line.from + m.index + m[0].length,
    );
    if (!match) return null;
    const result = preview(match[1].trim());
    return {
      pos: line.from + match.index,
      end: line.from + match.index + match[0].length,
      above: true,
      create() {
        const dom = document.createElement("div");
        dom.style.cssText =
          "padding:6px 9px;max-width:420px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px";
        const key = document.createElement("strong"),
          detail = document.createElement("div");
        key.textContent = result.key;
        detail.textContent = result.detail;
        dom.append(key, detail);
        return { dom };
      },
    };
  });
}

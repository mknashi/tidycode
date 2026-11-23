import React, { useEffect, useRef } from "react";
export default function HttpEditorMenu({
  context,
  theme,
  onClose,
  onAction,
  onFocusEditor,
}) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showPopover();
    ref.current.querySelector("button:not(:disabled)")?.focus();
  }, [context.id]);
  const dark = theme === "dark";
  return (
    <div
      ref={ref}
      popover="auto"
      role="menu"
      aria-label="HTTP editor actions"
      className={`fixed m-0 p-1 border rounded-lg shadow-xl w-64 ${dark ? "bg-gray-900 border-gray-700 text-gray-200" : "bg-white border-gray-300 text-gray-800"}`}
      style={{
        left: Math.max(8, Math.min(context.x, innerWidth - 264)),
        top: Math.max(8, Math.min(context.y, innerHeight - 280)),
      }}
      onToggle={(event) => {
        if (event.newState === "closed") onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          ref.current.hidePopover();
          onFocusEditor();
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const items = [
            ...ref.current.querySelectorAll("button:not(:disabled)"),
          ];
          const index = items.indexOf(document.activeElement);
          items[
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    items.length) %
                  items.length
          ]?.focus();
        }
      }}
    >
      <p className="text-xs opacity-60 px-2 py-1 truncate">
        {context.item?.name || "No request at this position"}
      </p>
      {[
        ["send", "Send request", "Ctrl/⌘ Alt R"],
        ["open", "Open in API client", "Ctrl/⌘ Alt O"],
        ["format", "Format request body", ""],
        ["generate-body", "Generate body data…", ""],
        ["generate-params", "Generate query data…", ""],
        ["outline", "Show HTTP requests", ""],
      ].map(([action, label, shortcut]) => (
        <button
          key={action}
          role="menuitem"
          aria-label={label}
          aria-keyshortcuts={
            action === "send"
              ? "Control+Alt+R Meta+Alt+R"
              : action === "open"
                ? "Control+Alt+O Meta+Alt+O"
                : undefined
          }
          disabled={action !== "outline" && !context.item}
          className={`flex justify-between items-center gap-2 w-full px-2 py-2 text-xs rounded text-left disabled:opacity-40 ${dark ? "hover:bg-gray-800" : "hover:bg-gray-100"}`}
          onClick={() => {
            ref.current.hidePopover();
            onAction(action);
          }}
        >
          <span>{label}</span>
          <span className="text-[10px] opacity-60">{shortcut}</span>
        </button>
      ))}
    </div>
  );
}

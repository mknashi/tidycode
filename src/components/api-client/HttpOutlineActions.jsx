import React, { useRef } from "react";
import { MoreHorizontal } from "lucide-react";
export default function HttpOutlineActions({ item, onEdit, onExtract, theme }) {
  const ref = useRef(null),
    trigger = useRef(null);
  return (
    <>
      <button
        ref={trigger}
        aria-label={`Actions for HTTP request ${item.name}`}
        title="Request actions"
        className="p-1 rounded hover:bg-indigo-500/10"
        onClick={() => {
          const box = trigger.current.getBoundingClientRect();
          Object.assign(ref.current.style, {
            left: Math.max(8, Math.min(box.left, innerWidth - 200)) + "px",
            top: Math.max(8, Math.min(box.bottom, innerHeight - 300)) + "px",
          });
          ref.current.showPopover();
          ref.current.querySelector("button")?.focus();
        }}
      >
        <MoreHorizontal size={14} />
      </button>
      <div
        ref={ref}
        popover="auto"
        role="menu"
        aria-label={`Actions for HTTP request ${item.name}`}
        className={`fixed m-0 w-48 border rounded p-1 shadow-lg ${theme === "dark" ? "bg-gray-900 text-gray-200 border-gray-700" : "bg-white text-gray-800 border-gray-200"}`}
        onKeyDown={(e) => {
          const items = [...ref.current.querySelectorAll("button")],
            index = items.indexOf(document.activeElement);
          if (e.key === "Escape") {
            e.preventDefault();
            ref.current.hidePopover();
            trigger.current.focus();
          }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            items[
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? items.length - 1
                  : (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                    items.length
            ]?.focus();
          }
        }}
      >
        {[
          ["rename", "Rename"],
          ["duplicate", "Duplicate"],
          ["up", "Move up"],
          ["down", "Move down"],
          ["extract", "Extract to .http file"],
          ["generate-body", "Generate body data…"],
          ["generate-params", "Generate query data…"],
        ].map(([action, label]) => (
          <button
            key={action}
            role="menuitem"
            className="w-full text-left text-xs rounded px-2 py-2 hover:bg-indigo-500/15"
            onClick={() => {
              ref.current.hidePopover();
              if (action === "extract") onExtract(item);
              else onEdit(item, action);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

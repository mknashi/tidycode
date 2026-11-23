import React, { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

export default function TabActions({ client, activeId, context, onClose }) {
  const ref = useRef(null);
  const trigger = useRef(null);
  const restore = useRef(null);
  const [target, setTarget] = useState(null);
  const show = (id, x, y, element) => {
    restore.current = element;
    setTarget({
      id,
      left: Math.max(8, Math.min(x, innerWidth - 200)),
      top: Math.max(8, Math.min(y, innerHeight - 180)),
    });
    ref.current.showPopover();
    ref.current.querySelector("button")?.focus();
  };
  useEffect(() => {
    if (context) show(context.id, context.x, context.y, context.trigger);
  }, [context]);
  const dismiss = () => {
    ref.current.hidePopover();
    restore.current?.focus();
    onClose();
  };
  const index = client.openRequests.findIndex((r) => r.id === target?.id);
  const actions = [
    ["Close", target ? [target.id] : []],
    [
      "Close Others",
      client.openRequests.filter((r) => r.id !== target?.id).map((r) => r.id),
    ],
    [
      "Close to the Right",
      client.openRequests.slice(index + 1).map((r) => r.id),
    ],
    ["Close All", client.openRequests.map((r) => r.id)],
  ];
  return (
    <>
      <button
        ref={trigger}
        className="api-tab-actions-trigger"
        aria-label="Request tab actions"
        title="Tab close options"
        aria-haspopup="menu"
        onClick={() => {
          const box = trigger.current.getBoundingClientRect();
          show(activeId, box.right - 190, box.bottom, trigger.current);
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      <div
        ref={ref}
        popover="auto"
        role="menu"
        aria-label="Request tab actions"
        className="api-tree-menu"
        style={target ? { left: target.left, top: target.top } : undefined}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            dismiss();
          }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            const items = [
              ...ref.current.querySelectorAll("button:not(:disabled)"),
            ];
            const index = items.indexOf(document.activeElement);
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
        {actions.map(([label, ids]) => (
          <button
            key={label}
            role="menuitem"
            disabled={!ids.length}
            onClick={() => {
              dismiss();
              client.closeTabs(ids);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

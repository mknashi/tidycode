import React, { useId, useRef, useState } from "react";
import { MoreHorizontal, Copy, Settings, Trash2 } from "lucide-react";

export default function EnvironmentMenu({
  environment,
  onCopy,
  onManage,
  onDelete,
}) {
  const id = useId();
  const menu = useRef(null);
  const trigger = useRef(null);
  const [position, setPosition] = useState({});
  return (
    <>
      <button
        ref={trigger}
        className="api-tree-more"
        aria-label={`Environment actions for ${environment.name}`}
        title="Environment actions"
        aria-haspopup="menu"
        popoverTarget={id}
        onClick={() => {
          const box = trigger.current.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(box.left, window.innerWidth - 170)),
            top: Math.min(box.bottom + 4, window.innerHeight - 130),
          });
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      <div
        id={id}
        ref={menu}
        popover="auto"
        role="menu"
        aria-label={`Actions for environment ${environment.name}`}
        className="api-tree-menu"
        style={position}
        onToggle={(e) => {
          if (e.newState === "open")
            menu.current?.querySelector("button")?.focus();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            menu.current.hidePopover();
            trigger.current.focus();
          }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            const items = [...menu.current.querySelectorAll("button")];
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
        {[
          ["Copy", Copy, onCopy],
          ["Manage", Settings, onManage],
          ["Delete", Trash2, onDelete],
        ].map(([label, Icon, action]) => (
          <button
            key={label}
            role="menuitem"
            onClick={() => {
              menu.current.hidePopover();
              trigger.current?.focus();
              action();
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
// Portaled menus escape both toolbar scrolling and editor clipping containers.
export default function ToolbarMenu({
  anchorRef,
  onClose,
  theme,
  id,
  label,
  align = "left",
  width = 180,
  children,
}) {
  const menu = useRef(null),
    close = useRef(onClose),
    [position, setPosition] = useState({ left: 8, top: 8, maxHeight: 300 });
  close.current = onClose;
  useLayoutEffect(() => {
    const update = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return close.current();
      const height = menu.current?.scrollHeight || 160;
      const spaceBelow = innerHeight - anchor.bottom - 12;
      const top =
        spaceBelow >= Math.min(height, 100)
          ? anchor.bottom + 4
          : Math.max(8, anchor.top - Math.min(height, innerHeight - 16) - 4);
      setPosition({
        left: Math.max(
          8,
          Math.min(
            align === "right" ? anchor.right - width : anchor.left,
            innerWidth - width - 8,
          ),
        ),
        top,
        maxHeight: Math.max(60, innerHeight - top - 8),
      });
    };
    const outside = (e) => {
      if (
        !anchorRef.current?.contains(e.target) &&
        !menu.current?.contains(e.target)
      )
        close.current();
    };
    const scroll = (e) => {
      if (!menu.current?.contains(e.target)) update();
    };
    update();
    menu.current
      ?.querySelector("button:not(:disabled)")
      ?.focus({ preventScroll: true });
    document.addEventListener("pointerdown", outside);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef, align, width]);
  return createPortal(
    <div
      ref={menu}
      id={id}
      role="menu"
      aria-label={label}
      style={{ ...position, width, maxWidth: "calc(100vw - 16px)" }}
      className={`fixed py-1 rounded-md shadow-lg z-[100] overflow-y-auto ${theme === "dark" ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-200"}`}
      onKeyDown={(event) => {
        const items = [
          ...menu.current.querySelectorAll("button:not(:disabled)"),
        ];
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close.current();
          anchorRef.current?.querySelector("button")?.focus();
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const current = items.indexOf(document.activeElement);
          items[
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (current +
                    (event.key === "ArrowUp" ? -1 : 1) +
                    items.length) %
                  items.length
          ]?.focus();
        }
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

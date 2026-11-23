import React from "react";
import { ChevronRight } from "lucide-react";
export default function SidebarSection({
  label,
  count,
  open,
  onChange,
  children,
}) {
  return (
    <details
      className="api-sidebar-section api-sidebar-disclosure"
      open={open}
      onToggle={(e) => {
        if (e.target === e.currentTarget && e.currentTarget.open !== open)
          onChange(e.currentTarget.open);
      }}
    >
      <summary
        onClick={(e) => {
          e.preventDefault();
          onChange(!open);
        }}
      >
        <ChevronRight
          size={14}
          className="api-tree-chevron"
          aria-hidden="true"
        />
        <span>{label}</span>
        {count !== undefined && (
          <span className="api-section-count">{count}</span>
        )}
      </summary>
      {children}
    </details>
  );
}

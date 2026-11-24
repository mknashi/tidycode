import React from "react";
import { Eye, EyeOff } from "lucide-react";
export default function SecretVisibilityButton({
  shown,
  onToggle,
  disabled = false,
  label = "secret value",
  className = "",
}) {
  const action = `${shown ? "Hide" : "Show"} ${label}`;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-label={action}
      title={action}
      aria-pressed={shown}
      className={`secret-visibility-button ${className}`}
    >
      <span aria-hidden="true">
        {shown ? <EyeOff size={16} /> : <Eye size={16} />}
      </span>
    </button>
  );
}

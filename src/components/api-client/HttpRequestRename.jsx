import React, { useEffect, useRef, useState } from "react";
export default function HttpRequestRename({ item, theme, onSave, onClose }) {
  const ref = useRef(null),
    [name, setName] = useState(item.name);
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="api-client api-import-modal"
      data-theme={theme}
      aria-label="Rename HTTP request"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        className="api-import-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(name);
        }}
      >
        <h2>Rename HTTP request</h2>
        <label>
          Request name
          <input
            aria-label="HTTP request name"
            autoFocus
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="api-row">
          <button type="submit" className="api-primary" disabled={!name.trim()}>
            Save request name
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}

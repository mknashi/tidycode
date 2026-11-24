import SecretVisibilityButton from "../SecretVisibilityButton";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createDesktopVault } from "../../services/http/desktopVault";
export default function DesktopVault({
  theme,
  onClose,
  onUse,
  initialName = "",
  initialValue = "",
  initialId = "",
  targetLabel = "",
  vault: provided,
}) {
  const vault = useMemo(() => provided || createDesktopVault(), [provided]),
    dialog = useRef(null),
    alive = useRef(true);
  const catalog = useMemo(() => {
    try {
      return { rows: vault.list(), error: "" };
    } catch (error) {
      return { rows: [], error: error.message };
    }
  }, [vault]);
  const initialEntry = catalog.rows.find((row) => row.id === initialId);
  const [rows, setRows] = useState(catalog.rows),
    [selected, setSelected] = useState(initialEntry?.id || ""),
    [name, setName] = useState(initialEntry?.name || initialName),
    [value, setValue] = useState(initialId ? "" : initialValue),
    [show, setShow] = useState(false),
    [replace, setReplace] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(catalog.error),
    [notice, setNotice] = useState(
      initialId && !initialEntry
        ? "The previously selected credential is no longer in the vault. Choose another credential explicitly."
        : "",
    );
  useEffect(() => {
    alive.current = true;
    dialog.current.showModal();
    return () => {
      alive.current = false;
      dialog.current?.close();
    };
  }, [vault]);
  const run = async (action) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="api-client api-import-modal"
      data-theme={theme}
      aria-label="Desktop credential vault"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <section className="api-import-dialog">
        <div className="api-row api-between">
          <h2>Desktop credential vault</h2>
          <button
            disabled={busy}
            onClick={onClose}
            aria-label="Close credential vault"
          >
            Close
          </button>
        </div>
        <p className="api-small api-muted">
          Values are stored in your OS credential store, separate from
          AI-provider keys. Only names and opaque IDs are kept in the local
          catalog. Saving or deleting here takes effect immediately, even if you
          later cancel the Variables dialog.
        </p>
        {targetLabel && (
          <p className="api-small">
            Target variable: <strong>{targetLabel}</strong>. Select the intended
            environment’s credential.
          </p>
        )}
        <label>
          Saved credential
          <select
            disabled={busy}
            aria-label="Saved credential"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setName(
                rows.find((r) => r.id === e.target.value)?.name || initialName,
              );
              setValue("");
              setShow(false);
              setReplace(false);
              setConfirmDelete(false);
              setError("");
              setNotice("");
            }}
          >
            <option value="">New credential</option>
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input
            aria-label="Vault credential name"
            maxLength={128}
            disabled={busy || !!selected}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Credential value
          <input
            aria-label="Vault credential value"
            type={show ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            value={value}
            placeholder="Literal secret; no {{references}}"
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <div className="api-row">
          <SecretVisibilityButton
            disabled={busy}
            shown={show}
            onToggle={() => setShow((v) => !v)}
            label="value"
          />
          {selected && (
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const secret = await vault.load(selected);
                  if (alive.current) setValue(secret);
                })
              }
            >
              Load for editing
            </button>
          )}
        </div>
        {selected && (
          <label className="api-row">
            <input
              type="checkbox"
              disabled={busy}
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
            />
            Replace the selected OS credential
          </label>
        )}
        <div className="api-row">
          <button
            disabled={busy || !value || (!!selected && !replace)}
            onClick={() =>
              run(async () => {
                const row = await vault.save({
                  id: selected || undefined,
                  name,
                  value,
                  overwrite: replace,
                });
                if (alive.current) {
                  setRows(vault.list());
                  setSelected(row.id);
                  setValue("");
                  setReplace(false);
                  setNotice(
                    "Credential saved in the OS store. Load it explicitly when needed.",
                  );
                }
              })
            }
          >
            Save to OS vault
          </button>
          {selected && onUse && (
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const secret = await vault.load(selected);
                  if (alive.current)
                    onUse(secret, {
                      id: selected,
                      name: rows.find((row) => row.id === selected)?.name,
                    });
                })
              }
            >
              Use in this variable
            </button>
          )}
        </div>
        {selected && (
          <>
            <label className="api-row">
              <input
                type="checkbox"
                disabled={busy}
                checked={confirmDelete}
                onChange={(e) => setConfirmDelete(e.target.checked)}
              />
              Delete the selected credential from the OS vault
            </label>
            <button
              disabled={busy || !confirmDelete}
              onClick={() =>
                run(async () => {
                  await vault.remove(selected);
                  if (alive.current) {
                    setRows(vault.list());
                    setSelected("");
                    setValue("");
                    setName(initialName);
                    setReplace(false);
                    setConfirmDelete(false);
                    setNotice(
                      "Removed from the OS vault. Existing session copies and server-issued tokens are not revoked.",
                    );
                  }
                })
              }
            >
              Delete OS credential
            </button>
          </>
        )}
        <p className="api-small api-muted">
          Nothing loads automatically on startup or Send. “Use in this variable”
          fills the draft only; Apply/Save in Variables is still required.
          Session copies remain until cleared or the app closes. Vault entries
          are excluded from collection exports/backups. Keep the local catalog
          so you can manage entries; clearing app storage can orphan OS-store
          entries.
        </p>
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p role="alert" className="api-warning">
            {error}
          </p>
        )}
      </section>
    </dialog>
  );
}

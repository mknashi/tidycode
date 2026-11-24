import SecretVisibilityButton from "../SecretVisibilityButton";
import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  responseValues,
  variableRows,
} from "../../services/http/responseValues.js";
import { credentialVariable } from "../../services/http/variables.js";

function SaveValue({ entry, client, request, theme, onClose }) {
  const dialog = useRef(null);
  const [scope, setScope] = useState("request");
  const [name, setName] = useState("");
  const [secret, setSecret] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const forcedSecret = entry.secret || credentialVariable(name);
  const exists = variableRows(client.variableSettings, scope, request).some(
    (row) => row.key === name,
  );
  useEffect(() => {
    dialog.current.showModal();
    return () => dialog.current?.close();
  }, []);
  const save = async (persist) => {
    if (/\{\{[^{}]+\}\}/.test(entry.value)) {
      setError(
        "This value contains variable-reference syntax. Copy it and review it in Variables before reuse.",
      );
      return;
    }
    if (persist && scope === "request" && !client.saved[request.id]) {
      setError(
        "Save this request locally first, choose another scope, or apply the variable for this session.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await client.saveResponseVariable(
        scope,
        { key: name, value: entry.value, secret: secret || forcedSecret },
        persist,
        overwrite,
        request,
      );
      onClose(
        persist
          ? "Variable saved locally; secret values remain in memory only."
          : "Variable applied for this session.",
      );
    } catch (e) {
      setError(
        e.message?.startsWith("Variable") || e.message?.startsWith("Confirm")
          ? e.message
          : "Could not save this variable. Check its name and scope, or retry for this session.",
      );
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="api-client api-import-modal"
      data-theme={theme}
      aria-label="Save response value as variable"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <section className="api-import-dialog">
        <div className="api-row api-between">
          <h2>Save response value as variable</h2>
          <button disabled={busy} onClick={() => onClose()}>
            Cancel
          </button>
        </div>
        <p className="api-small">
          Source: <code>{entry.path || "(root)"}</code>. This saves the selected
          value only. No request is sent.
        </p>
        <label>
          Variable name
          <input
            aria-label="Response variable name"
            value={name}
            disabled={busy}
            onChange={(e) => {
              setName(e.target.value);
              setOverwrite(false);
            }}
            autoComplete="off"
          />
        </label>
        <label>
          Scope
          <select
            aria-label="Response variable scope"
            value={scope}
            disabled={busy}
            onChange={(e) => {
              setScope(e.target.value);
              setOverwrite(false);
            }}
          >
            <option value="request">This request</option>
            {request.collectionId && (
              <option value="collection">This collection</option>
            )}
            <option value="global">Global</option>
            {client.variableSettings.environments.map((env) => (
              <option key={env.id} value={"env:" + env.id}>
                {env.name}
              </option>
            ))}
          </select>
        </label>
        {scope === "request" && !client.saved[request.id] && (
          <p className="api-small api-muted">
            This request is not saved locally. Apply for this session, save the
            request first, or choose another scope.
          </p>
        )}
        <p className="api-small api-muted">
          Global → Collection → Environment → Request. Higher scopes override
          lower scopes. Selecting an environment here does not activate it.
        </p>
        <label className="api-row">
          <input
            type="checkbox"
            checked={secret || forcedSecret}
            disabled={busy || forcedSecret}
            onChange={(e) => setSecret(e.target.checked)}
          />
          Secret (value stays in memory)
        </label>
        <p className="api-small api-muted">
          Secrets are selected by default. Non-secret values are readable local
          data when saved. A new environment’s name/definition is also saved if
          selected. This action saves only this variable.
        </p>
        {exists && (
          <label className="api-row">
            <input
              type="checkbox"
              checked={overwrite}
              disabled={busy}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            Replace existing variable in this scope
          </label>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="api-row">
          <button
            disabled={busy || !name || (exists && !overwrite)}
            onClick={() => save(false)}
          >
            Apply for this session
          </button>
          <button
            className="api-primary"
            disabled={busy || !name || (exists && !overwrite)}
            onClick={() => save(true)}
          >
            Save variable locally
          </button>
        </div>
      </section>
    </dialog>
  );
}
export default function ResponseValues({
  source,
  client,
  request,
  theme,
  tooLarge,
}) {
  const parsed = useMemo(
    () =>
      tooLarge
        ? {
            entries: [],
            error: "JSON value actions support complete responses up to 1 MiB.",
          }
        : responseValues(source),
    [source, tooLarge],
  );
  const [path, setPath] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const entry =
    parsed.entries.find((e) => e.path === path) || parsed.entries[0];
  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied to clipboard.");
    } catch {
      setNotice("Could not copy. Select the value text to copy it.");
    }
  };
  return (
    <details className="api-response-values">
      <summary>JSON value actions</summary>
      {parsed.error ? (
        <p className="api-small api-muted">{parsed.error}</p>
      ) : (
        <>
          {parsed.limited && (
            <p className="api-small api-muted">
              Showing a bounded selection of up to 500 JSON nodes and 32 levels.
              Use the raw response for other values.
            </p>
          )}
          <label>
            JSON value
            <select
              aria-label="Selected response JSON path"
              value={entry?.path || ""}
              onChange={(e) => {
                setPath(e.target.value);
                setRevealed(false);
                setNotice("");
              }}
            >
              {parsed.entries.map((e) => (
                <option key={e.path} value={e.path}>
                  {e.path || "(root)"} · {e.type}
                </option>
              ))}
            </select>
          </label>
          {entry && (
            <>
              <p className="api-small api-muted">
                Paths use JSON Pointer. Strings copy as decoded text; other
                values preserve their exact JSON text.
              </p>
              <label>
                Selected value
                <textarea
                  aria-label="Selected response JSON value"
                  rows={3}
                  readOnly
                  value={
                    revealed
                      ? entry.value
                      : "Value hidden — use the eye button to reveal"
                  }
                />
              </label>
              <div className="api-row">
                <SecretVisibilityButton
                  shown={revealed}
                  onToggle={() => setRevealed((v) => !v)}
                  label="value"
                />
                <button onClick={() => copy(entry.value)}>Copy value</button>
                <button onClick={() => copy(entry.path)}>Copy path</button>
                <button
                  disabled={
                    new TextEncoder().encode(entry.value).length > 65536
                  }
                  onClick={() => setSaving(true)}
                >
                  Save as variable
                </button>
              </div>
              {new TextEncoder().encode(entry.value).length > 65536 && (
                <p className="api-small api-muted">
                  Variables support values up to 64 KiB. Select a smaller value.
                </p>
              )}
              {saving && (
                <SaveValue
                  entry={entry}
                  client={client}
                  request={request}
                  theme={theme}
                  onClose={(message) => {
                    setSaving(false);
                    if (message) setNotice(message);
                  }}
                />
              )}
            </>
          )}
        </>
      )}
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}

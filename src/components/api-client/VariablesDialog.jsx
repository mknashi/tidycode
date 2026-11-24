import SecretVisibilityButton from "../SecretVisibilityButton";
import { ShieldCheck } from "lucide-react";
import { createDesktopVault } from "../../services/http/desktopVault";
import DesktopVault from "./DesktopVault";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  credentialVariable,
  newVariable,
} from "../../services/http/variables.js";
export default function VariablesDialog({
  client,
  request,
  theme,
  onClose,
  initialScope,
  createEnvironment = false,
  copyEnvironment,
  hideRequestScopes = false,
}) {
  const ref = useRef(null);
  const [draft, setDraft] = useState(() => {
    const model = structuredClone(client.variableSettings);
    if (copyEnvironment) {
      const source = model.environments.find((e) => e.id === copyEnvironment);
      if (source) {
        const id = crypto.randomUUID();
        model.environments.push({
          ...source,
          id,
          name: `${source.name} copy`,
          variables: source.variables.map((row) => ({
            ...row,
            id: crypto.randomUUID(),
            vaultId: undefined,
            value: row.secret || credentialVariable(row.key) ? "" : row.value,
          })),
        });
        model.activeId = id;
      }
    }
    if (createEnvironment) {
      const id = crypto.randomUUID();
      model.environments.push({
        id,
        name: `Environment ${model.environments.length + 1}`,
        production: false,
        variables: [],
      });
      model.activeId = id;
    }
    return model;
  });
  const [scope, setScope] = useState(
    () => initialScope || (draft.activeId ? "env:" + draft.activeId : "global"),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(new Set());
  const [vaultTarget, setVaultTarget] = useState(null);
  const vaultEntries = useMemo(() => {
    if (client.transport !== "desktop") return [];
    try {
      return createDesktopVault().list();
    } catch {
      return [];
    }
  }, [client.transport, vaultTarget]);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const envId = scope.startsWith("env:") ? scope.slice(4) : null;
  const environment = draft.environments.find((e) => e.id === envId);
  const rows =
    scope === "global"
      ? draft.globals
      : scope === "collection"
        ? draft.collections[request.collectionId] || []
        : scope === "request"
          ? draft.requests[request.id] || []
          : environment?.variables || [];
  const changeRows = (next) =>
    setDraft((d) =>
      scope === "global"
        ? { ...d, globals: next }
        : scope === "collection"
          ? {
              ...d,
              collections: { ...d.collections, [request.collectionId]: next },
            }
          : scope === "request"
            ? { ...d, requests: { ...d.requests, [request.id]: next } }
            : {
                ...d,
                environments: d.environments.map((e) =>
                  e.id === envId ? { ...e, variables: next } : e,
                ),
              },
    );
  const patch = (id, value) =>
    changeRows(rows.map((row) => (row.id === id ? { ...row, ...value } : row)));
  const changeEnvironment = (value) =>
    setDraft((d) => ({
      ...d,
      environments: d.environments.map((e) =>
        e.id === envId ? { ...e, ...value } : e,
      ),
    }));
  const apply = async (persist) => {
    setBusy(true);
    setError("");
    try {
      await client.applyVariables(draft, persist);
      onClose();
    } catch (e) {
      setError(
        e.message?.startsWith("Variable") ||
          e.message?.startsWith("Enabled") ||
          e.message?.startsWith("Give") ||
          e.message?.startsWith("Use at most")
          ? e.message
          : "Could not save variable settings. Your edits are still here; retry or apply for this session.",
      );
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={ref}
      className="api-client api-import-modal"
      data-theme={theme}
      aria-label="Variables and environments"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <section className="api-import-dialog">
        {copyEnvironment && (
          <p className="api-small api-muted">
            Environment copy: secret values are left blank. Review and apply or
            save the copy below.
          </p>
        )}
        <div className="api-row api-between">
          <h2>Variables & environments</h2>
          <button
            disabled={busy}
            onClick={onClose}
            aria-label="Close variables"
          >
            Close
          </button>
        </div>
        <p className="api-muted">
          Use {"{{name}}"} in URLs, headers, authentication, or bodies.
          Precedence: Global → File → Collection → Environment → Request →
          Request block. Higher scopes override lower ones. File and
          request-block declarations are edited in the HTTP source, not saved by
          this dialog.
        </p>
        <div className="api-row">
          <label className="api-variable-scope">
            Edit scope
            <select
              aria-label="Variable scope"
              disabled={busy}
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setRevealed(new Set());
              }}
            >
              <option value="global">Global variables</option>
              {!hideRequestScopes &&
                request.collectionId &&
                client.collections.some(
                  (c) => c.id === request.collectionId,
                ) && <option value="collection">This collection</option>}
              {!hideRequestScopes && (
                <option value="request">This request</option>
              )}
              {draft.environments.map((e) => (
                <option key={e.id} value={"env:" + e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={busy}
            onClick={() => {
              const id = crypto.randomUUID();
              setDraft((d) => ({
                ...d,
                activeId: id,
                environments: [
                  ...d.environments,
                  {
                    id,
                    name: `Environment ${d.environments.length + 1}`,
                    production: false,
                    variables: [],
                  },
                ],
              }));
              setScope("env:" + id);
            }}
          >
            New environment
          </button>
        </div>
        {environment && (
          <div className="api-field-section">
            <label>
              Environment name
              <input
                aria-label="Environment name"
                disabled={busy}
                maxLength={200}
                value={environment.name}
                onChange={(e) => changeEnvironment({ name: e.target.value })}
              />
            </label>
            <label className="api-import-check">
              <input
                type="checkbox"
                disabled={busy}
                checked={environment.production}
                onChange={(e) =>
                  changeEnvironment({ production: e.target.checked })
                }
              />
              Production environment
            </label>
            <button
              disabled={busy}
              onClick={() => {
                setDraft((d) => ({
                  ...d,
                  activeId: d.activeId === envId ? null : d.activeId,
                  environments: d.environments.filter((e) => e.id !== envId),
                }));
                setScope("global");
              }}
            >
              Remove environment
            </button>
          </div>
        )}
        <div className="api-variable-rows">
          {rows.map((row) => {
            const secret = row.secret || credentialVariable(row.key);
            const vaultEntry = vaultEntries.find(
              (entry) => entry.id === row.vaultId,
            );
            return (
              <div key={row.id} className="api-variable-row">
                <input
                  type="checkbox"
                  aria-label="Enable variable"
                  disabled={busy}
                  checked={row.enabled}
                  onChange={(e) => patch(row.id, { enabled: e.target.checked })}
                />
                <input
                  aria-label="Variable name"
                  disabled={busy}
                  placeholder="base_url"
                  value={row.key}
                  onChange={(e) =>
                    patch(row.id, {
                      key: e.target.value,
                      secret: row.secret || credentialVariable(e.target.value),
                    })
                  }
                />
                <div className="api-variable-value">
                  <input
                    aria-label="Variable value"
                    disabled={busy}
                    autoComplete="off"
                    spellCheck={false}
                    type={secret && !revealed.has(row.id) ? "password" : "text"}
                    placeholder={
                      secret
                        ? "Session-only secret"
                        : "Value or {{another_variable}}"
                    }
                    value={row.value}
                    onChange={(e) =>
                      patch(row.id, {
                        value: e.target.value,
                        vaultId: undefined,
                      })
                    }
                  />
                  {secret && (
                    <SecretVisibilityButton
                      disabled={busy}
                      shown={revealed.has(row.id)}
                      onToggle={() =>
                        setRevealed((s) => {
                          const next = new Set(s);
                          next.has(row.id)
                            ? next.delete(row.id)
                            : next.add(row.id);
                          return next;
                        })
                      }
                    />
                  )}
                  {secret && client.transport === "desktop" && (
                    <>
                      <button
                        disabled={busy}
                        aria-label={`Vault for ${row.key || "unnamed variable"}`}
                        className={vaultEntry ? "api-vault-linked" : undefined}
                        data-vault-linked={!!vaultEntry}
                        title={
                          vaultEntry
                            ? `Linked to vault: ${vaultEntry.name}. Loading remains explicit.`
                            : row.vaultId
                              ? "Linked credential is missing from the vault catalog. Choose another explicitly."
                              : "Choose or save a vault credential"
                        }
                        onClick={() =>
                          setVaultTarget({
                            rowId: row.id,
                            name: row.key,
                            value: row.value,
                            vaultId: row.vaultId,
                            label: `${row.key} · ${environment?.name || scope}`,
                          })
                        }
                      >
                        {vaultEntry && (
                          <ShieldCheck size={14} aria-hidden="true" />
                        )}
                        Vault…
                      </button>
                      <button
                        disabled={busy || !row.value}
                        aria-label={`Clear session draft value for ${row.key}`}
                        onClick={() => patch(row.id, { value: "" })}
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>
                <label className="api-import-check">
                  <input
                    type="checkbox"
                    aria-label="Secret variable"
                    disabled={busy || credentialVariable(row.key)}
                    checked={secret}
                    onChange={(e) =>
                      patch(row.id, { secret: e.target.checked })
                    }
                  />
                  Secret
                </label>
                <button
                  disabled={busy}
                  aria-label="Remove variable"
                  onClick={() =>
                    changeRows(rows.filter((v) => v.id !== row.id))
                  }
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <button
          disabled={busy}
          onClick={() => changeRows([...rows, newVariable()])}
        >
          Add variable
        </button>
        <p className="api-muted api-small">
          Non-secret values can be stored as readable local data. Secret values
          stay in memory unless explicitly saved to the desktop OS vault, and
          must be re-entered or explicitly loaded after reload. Credential-like
          names are always secret. Saving keeps their names, not their values.{" "}
          {"{{$uuid}}"} and {"{{$timestamp}}"} generate values per send.
        </p>
        <p className="api-muted api-small">
          Variable substitution is literal in paths, headers, and bodies; JSON
          must remain valid. Query values are URL encoded. Closing this dialog
          discards unapplied changes.
        </p>
        {error && (
          <p role="alert" className="api-warning">
            {error}
          </p>
        )}
        {client.transport === "desktop" && (
          <button disabled={busy} onClick={() => setVaultTarget({})}>
            Manage desktop vault
          </button>
        )}
        {vaultTarget && (
          <DesktopVault
            theme={theme}
            initialName={vaultTarget.name || ""}
            initialValue={vaultTarget.value || ""}
            initialId={vaultTarget.vaultId || ""}
            targetLabel={vaultTarget.label}
            onClose={() => setVaultTarget(null)}
            onUse={
              vaultTarget.rowId
                ? (value, credential) => {
                    patch(vaultTarget.rowId, {
                      value,
                      secret: true,
                      vaultId: credential.id,
                    });
                    setVaultTarget(null);
                    setRevealed(new Set());
                  }
                : undefined
            }
          />
        )}
        <div className="api-row">
          <button
            className="api-primary"
            disabled={busy}
            onClick={() => apply(true)}
          >
            {busy ? "Applying…" : "Save non-secret values locally"}
          </button>
          <button disabled={busy} onClick={() => apply(false)}>
            Apply for this session
          </button>
          <button disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </section>
    </dialog>
  );
}

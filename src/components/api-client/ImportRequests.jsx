import React, { useEffect, useRef, useState } from "react";
import { parseImport, IMPORT_LIMIT } from "../../services/http/importers.js";
import { applyForkOptions } from "../../services/http/fork.js";
import { savedTemplate } from "../../services/http/store.js";
export default function ImportRequests({
  onImport,
  onClose,
  theme,
  initialContent = "",
  initialPreview = null,
}) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const [source, setSource] = useState(initialContent);
  const [format, setFormat] = useState("auto");
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState(initialPreview);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isFork = initialPreview?.format === "fork";
  const [forkOptions, setForkOptions] = useState({
    query: true,
    headers: true,
    body: true,
    response: true,
  });
  const [persist, setPersist] = useState(true);
  const effectivePreview =
    isFork && preview ? applyForkOptions(preview, forkOptions) : preview;
  const fileRef = useRef(null);
  const reads = useRef(0);
  const change = (value) => {
    setSource(value);
    setPreview(null);
    setError("");
  };
  const read = async (file) => {
    if (!file) return;
    const id = ++reads.current;
    setPreview(null);
    setSource("");
    setError("");
    if (file.size > IMPORT_LIMIT) {
      setError("Choose a text file no larger than 10 MiB.");
      return;
    }
    try {
      const value = await file.text();
      if (reads.current !== id) return;
      setFilename(file.name);
      change(value);
    } catch {
      setError("Could not read that file.");
    }
  };
  let canPersist = true;
  let storagePreview = "";
  if (preview) {
    try {
      const records = effectivePreview.requests.map((r) =>
        savedTemplate(r, { query: true, headers: true, body: true }),
      );
      storagePreview = JSON.stringify(
        isFork
          ? {
              requests: records,
              responseSnapshots: effectivePreview.responseSnapshots,
            }
          : records,
        null,
        2,
      );
    } catch {
      canPersist = false;
    }
  }
  const analyze = () => {
    try {
      const result = parseImport(source, format, filename);
      setPreview(result);
      setPersist(true);
      setError("");
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "The import contains malformed fields. Check the selected format and export it again."
          : e instanceof RangeError
            ? "Import is too complex. Reduce its size and retry."
            : e.message,
      );
    }
  };
  return (
    <dialog
      ref={dialogRef}
      className="api-client api-import-modal"
      data-theme={theme}
      aria-label={isFork ? "Fork collection" : "Import API requests"}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <section
        className="api-import-dialog"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="api-row api-between">
          <h2>{isFork ? "Fork collection" : "Import requests"}</h2>
          <button
            disabled={busy}
            onClick={onClose}
            aria-label={isFork ? "Close fork" : "Close import"}
          >
            Close
          </button>
        </div>
        {isFork ? (
          <p className="api-muted">
            Create an independent copy of the current request definitions,
            including unsaved edits. The original collection stays unchanged. No
            requests will be sent. This local fork does not receive upstream
            updates or support merging.
          </p>
        ) : (
          <>
            {" "}
            <p className="api-muted">
              Bring in cURL, Postman Collection v2.1, OpenAPI 3 JSON/YAML, or
              .http files. Importing never sends requests, runs scripts, or
              loads external references.
            </p>
            <label>
              Import format
              <select
                aria-label="Import format"
                value={format}
                disabled={busy}
                onChange={(e) => {
                  setFormat(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="auto">Detect automatically</option>
                <option value="curl">cURL</option>
                <option value="postman">Postman v2.1</option>
                <option value="openapi">OpenAPI 3</option>
                <option value="http">.http</option>
              </select>
            </label>
            <div
              className="api-import-drop"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!busy) read(e.dataTransfer.files[0]);
              }}
            >
              <input
                ref={fileRef}
                type="file"
                aria-label="Choose import file"
                disabled={busy}
                accept=".json,.yaml,.yml,.http,.txt"
                onChange={(e) => read(e.target.files[0])}
              />
              <span className="api-muted api-small">
                Choose a file or drop one here · maximum 10 MiB
              </span>
            </div>
            <label>
              Paste import content
              <textarea
                autoFocus
                aria-label="Import content"
                rows={7}
                spellCheck={false}
                disabled={busy}
                value={source}
                placeholder={"curl https://httpbin.org/get"}
                onChange={(e) => {
                  reads.current++;
                  setFilename("");
                  change(e.target.value);
                }}
              />
            </label>
            <button disabled={busy || !source.trim()} onClick={analyze}>
              Preview import
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="api-warning">
            {error}
          </p>
        )}
        {preview && (
          <div className="api-import-preview">
            <label>
              {isFork ? "Fork name" : "Collection name"}
              <input
                aria-label={isFork ? "Fork name" : "Imported collection name"}
                maxLength={500}
                value={preview.collection.name}
                disabled={busy}
                onChange={(e) =>
                  setPreview({
                    ...preview,
                    collection: { ...preview.collection, name: e.target.value },
                  })
                }
              />
            </label>
            <p>
              <strong>
                {preview.requests.length} requests ·{" "}
                {preview.collection.folders.length} folders
              </strong>
            </p>
            <p>
              Destinations:{" "}
              {preview.hosts.join(", ") || "None (empty collection)"}
            </p>
            {preview.credentials > 0 && (
              <p className="api-warning">
                Detected credential fields in {preview.credentials} requests.
                {isFork
                  ? "Literal authentication credentials and known credential headers are removed from the fork."
                  : "Literal authentication credentials and known credential headers stay in memory and are omitted from local templates."}{" "}
                Arbitrary bodies, paths, query values, and response snapshots
                may still contain secrets.
              </p>
            )}
            {preview.warnings.length > 0 && (
              <ul className="api-import-warnings">
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <div className="api-import-requests">
              {preview.requests.map((r) => (
                <div key={r.id}>
                  <span className="api-method" data-method={r.method}>
                    {r.method}
                  </span>
                  <span>{r.name}</span>
                </div>
              ))}
            </div>
            {isFork && (
              <div className="api-save-options">
                {[
                  ["query", "Copy query values"],
                  ["headers", "Copy other header values"],
                  ["body", "Copy request bodies"],
                  [
                    "response",
                    `Copy response snapshots (${Object.keys(preview.responseSnapshots || {}).length} available)`,
                  ],
                ].map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      disabled={
                        busy ||
                        (key === "response" &&
                          !Object.keys(preview.responseSnapshots || {}).length)
                      }
                      checked={
                        forkOptions[key] &&
                        (key !== "response" ||
                          !!Object.keys(preview.responseSnapshots || {}).length)
                      }
                      onChange={(e) =>
                        setForkOptions((o) => ({
                          ...o,
                          [key]: e.target.checked,
                        }))
                      }
                    />
                    {label}
                  </label>
                ))}
                <p className="api-warning">
                  Copied values and snapshots are readable local data when
                  saved. Bodies can echo credentials. Review the exact data
                  below or choose session-only request content.
                </p>
              </div>
            )}
            <label className="api-import-check">
              <input
                type="checkbox"
                aria-label={
                  isFork
                    ? "Save fork locally"
                    : "Save imported requests locally"
                }
                disabled={busy || !canPersist}
                checked={persist && canPersist}
                onChange={(e) => setPersist(e.target.checked)}
              />
              {isFork ? "Save fork locally" : "Save imported requests locally"}
            </label>
            <p className="api-muted api-small">
              Collection and folder names are saved on this device.{" "}
              {canPersist
                ? "Selected local saving includes request bodies, query values, and other header values as readable data. Deselect to keep request content in memory."
                : "Requests with unresolved base URLs must stay in memory. Fill their URLs and use Save locally later."}
            </p>
            {persist && canPersist && (
              <details>
                <summary>Review exact local request data</summary>
                <textarea
                  aria-label="Imported local storage preview"
                  rows={10}
                  readOnly
                  value={storagePreview}
                />
              </details>
            )}
            <div className="api-row">
              <button
                className="api-primary"
                disabled={busy || !preview.collection.name.trim()}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await onImport(effectivePreview, persist && canPersist);
                    onClose();
                  } catch {
                    setError(
                      "Could not import. Check the request URLs and available local storage, then retry. Nothing was partially imported.",
                    );
                    setBusy(false);
                  }
                }}
              >
                {busy
                  ? isFork
                    ? "Creating fork…"
                    : "Importing…"
                  : isFork
                    ? "Create local fork"
                    : "Import as new collection"}
              </button>
              <button disabled={busy} onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </dialog>
  );
}

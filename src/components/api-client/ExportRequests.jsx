import React, { useEffect, useRef, useState } from "react";
import {
  collectionExport,
  curlExport,
  httpExport,
} from "../../services/http/exporters.js";
export default function ExportRequests({
  collection,
  requests,
  theme,
  onClose,
  initialFormat,
}) {
  const dialog = useRef(null);
  const [format, setFormat] = useState(
    initialFormat || (collection ? "postman" : "curl"),
  );
  const [options, setOptions] = useState({
    query: false,
    headers: false,
    body: false,
  });
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current.showModal();
    return () => dialog.current?.close();
  }, []);
  let content = "",
    problem = "";
  try {
    content =
      format === "http"
        ? httpExport(requests[0], options)
        : format === "curl"
          ? curlExport(requests[0], options)
          : collectionExport(
              collection || { name: requests[0].name, folders: [] },
              collection
                ? requests
                : requests.map((r) => ({ ...r, folderId: null })),
              options,
            );
    if (new TextEncoder().encode(content).length > 2 * 1024 * 1024)
      problem =
        "Export exceeds 2 MiB. Export fewer requests or exclude values.";
  } catch {
    problem =
      "A request has an invalid URL or folder structure. Correct it before exporting.";
  }
  return (
    <dialog
      ref={dialog}
      className="api-client api-import-modal"
      data-theme={theme}
      aria-label="Export API requests"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <section className="api-import-dialog">
        <div className="api-row api-between">
          <h2>Export {collection ? collection.name : "request"}</h2>
          <button onClick={onClose}>Close</button>
        </div>
        <p>
          Review the exact export below. Known credential fields are excluded;
          variable references stay unresolved. Environments, variable values,
          response snapshots, history, assertions, and upload file bytes are not
          included.
        </p>
        {format === "http" && (
          <p className="api-small api-muted">
            File variables and upload bytes are excluded. Basic auth helpers
            must be configured after opening the file.
          </p>
        )}
        <p className="api-small api-muted">
          Values are excluded by default. Included query values, headers, and
          bodies may contain private data. Check URL paths and names too. A cURL
          export is shell code: inspect it before running it, and replace
          variable placeholders manually.
        </p>
        <label>
          Format
          <select
            aria-label="Export format"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            {!collection && (
              <>
                <option value="curl">cURL (POSIX shell)</option>
                <option value="http">HTTP request file</option>
              </>
            )}
            <option value="postman">Postman collection v2.1 (JSON)</option>
          </select>
        </label>
        <div className="api-row">
          {[
            ["query", "Include query values"],
            ["headers", "Include header values"],
            ["body", "Include request bodies"],
          ].map(([key, label]) => (
            <label className="api-row" key={key}>
              <input
                type="checkbox"
                checked={options[key]}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, [key]: e.target.checked }))
                }
              />
              {label}
            </label>
          ))}
        </div>
        {problem ? (
          <p role="alert">{problem}</p>
        ) : (
          <label>
            Export preview
            <textarea
              aria-label="Export preview"
              rows={12}
              readOnly
              value={content}
              spellCheck={false}
            />
          </label>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="api-row">
          <button
            disabled={!!problem}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(content);
                setError("Copied export to clipboard.");
              } catch {
                setError(
                  "Could not copy. Select the preview text or download instead.",
                );
              }
            }}
          >
            Copy export
          </button>
          <button
            className="api-primary"
            disabled={!!problem}
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([content], {
                  type: format === "curl" ? "text/plain" : "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download =
                (collection?.name || requests[0].name || "request")
                  .replace(/[^a-zA-Z0-9_-]/g, "_")
                  .slice(0, 80) +
                (format === "curl"
                  ? ".curl.txt"
                  : format === "http"
                    ? ".http"
                    : ".postman_collection.json");
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Download export
          </button>
        </div>
      </section>
    </dialog>
  );
}

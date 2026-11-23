import React, { useState } from "react";
import { uploadRow, UPLOAD_LIMIT } from "../../services/http/uploads";
export default function UploadBodyEditor({ request, onChange }) {
  const [error, setError] = useState("");
  const rows = request.multipart || [];
  const change = (id, patch) =>
    onChange({
      multipart: rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  return (
    <div className="api-field-section">
      {error && <p role="alert">{error}</p>}
      <p className="api-small api-muted">
        Maximum combined payload: 20 MiB. File bytes stay in memory and must be
        selected again after reload. Files can contain private data; review the
        destination before Send. No upload occurs on selection.
      </p>
      {request.bodyMode === "binary" ? (
        <>
          <label>
            Binary file
            <input
              aria-label="Binary request file"
              type="file"
              onChange={(e) => {
                const file = e.target.files[0];
                if (file && file.size > UPLOAD_LIMIT) {
                  setError(
                    "Choose a file up to 20 MiB. The previous selection is unchanged.",
                  );
                  e.target.value = "";
                  return;
                }
                setError("");
                onChange({ binaryFile: file || null });
              }}
            />
          </label>
          {request.binaryFile ? (
            <div className="api-row">
              <span className="api-small">
                {request.binaryFile.name} · {request.binaryFile.size} bytes
              </span>
              <button onClick={() => onChange({ binaryFile: null })}>
                Clear binary file
              </button>
            </div>
          ) : (
            <p className="api-small">Choose a file up to 20 MiB.</p>
          )}
        </>
      ) : (
        <>
          {rows.map((row, i) => (
            <div className="api-upload-row" key={row.id}>
              <input
                type="checkbox"
                aria-label={`Enable multipart field ${i + 1}`}
                checked={row.enabled}
                onChange={(e) => change(row.id, { enabled: e.target.checked })}
              />
              <input
                aria-label={`Multipart name ${i + 1}`}
                placeholder="Field name"
                value={row.key}
                onChange={(e) => change(row.id, { key: e.target.value })}
              />
              <select
                aria-label={`Multipart type ${i + 1}`}
                value={row.type}
                onChange={(e) =>
                  change(row.id, {
                    type: e.target.value,
                    file: null,
                    value: "",
                  })
                }
              >
                <option value="text">Text</option>
                <option value="file">File</option>
              </select>
              {row.type === "file" ? (
                <label className="api-small">
                  <input
                    aria-label={`Multipart file ${i + 1}`}
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file && file.size > UPLOAD_LIMIT) {
                        setError(
                          "Choose a file up to 20 MiB. The previous selection is unchanged.",
                        );
                        e.target.value = "";
                        return;
                      }
                      setError("");
                      change(row.id, { file: file || null });
                    }}
                  />
                  {row.file
                    ? row.file.name + " · " + row.file.size + " bytes"
                    : "Select a file"}
                </label>
              ) : (
                <input
                  aria-label={`Multipart value ${i + 1}`}
                  placeholder="Value or {{variable}}"
                  value={row.value}
                  onChange={(e) => change(row.id, { value: e.target.value })}
                />
              )}
              <button
                aria-label={`Remove multipart field ${i + 1}`}
                onClick={() =>
                  onChange({ multipart: rows.filter((r) => r.id !== row.id) })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            disabled={rows.length >= 100}
            onClick={() => onChange({ multipart: [...rows, uploadRow()] })}
          >
            Add multipart field
          </button>
          <p className="api-small api-muted">
            Do not set Content-Type manually for multipart; the browser supplies
            its boundary.
          </p>
        </>
      )}
    </div>
  );
}

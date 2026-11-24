import SecretVisibilityButton from "../SecretVisibilityButton";
import React, { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import CodeMirrorEditor from "../CodeMirrorEditor";
import {
  formRows,
  formBody,
  formBodyWarning,
} from "../../services/http/formBody";
import { credentialVariable } from "../../services/http/variables";
export default function FormBodyEditor({
  request,
  onChange,
  theme,
  variablePreview,
}) {
  const [mode, setMode] = useState(() =>
      formRows(request.body, 201).length > 200 ? "raw" : "fields",
    ),
    [rows, setRows] = useState(() => formRows(request.body, 201)),
    [show, setShow] = useState(false);
  const written = useRef(request.body);
  useEffect(() => {
    if (request.body !== written.current) {
      written.current = request.body;
      const next = formRows(request.body, 201);
      setRows(next);
      if (next.length > 200) setMode("raw");
    }
  }, [request.body]);
  const edit = (next) => {
    setRows(next);
    const body = formBody(next);
    written.current = body;
    onChange({ body });
  };
  const warning = formBodyWarning(request.body);
  const contentTypes = request.headers.filter(
    (r) => r.enabled && r.key.trim().toLowerCase() === "content-type",
  );
  const conflict = contentTypes.some(
    (r) =>
      r.value.trim().split(";")[0].toLowerCase() !==
      "application/x-www-form-urlencoded",
  );
  return (
    <div className="api-form-body">
      <div className="api-row api-between">
        <div
          className="api-section-tabs"
          role="group"
          aria-label="Form body editor mode"
        >
          {["fields", "raw"].map((value) => (
            <button
              key={value}
              disabled={value === "fields" && rows.length > 200}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {value === "fields" ? "Fields" : "Raw"}
            </button>
          ))}
        </div>
        {mode === "fields" && (
          <div className="api-row">
            <SecretVisibilityButton
              shown={show}
              onToggle={() => setShow((v) => !v)}
              label="sensitive values"
            />
            <button
              onClick={() =>
                setRows([
                  ...rows,
                  { id: crypto.randomUUID(), key: "", value: "" },
                ])
              }
            >
              <Plus size={14} />
              Add form field
            </button>
          </div>
        )}
      </div>
      {rows.length > 200 && (
        <p className="api-small api-muted">
          Use Raw for bodies with more than 200 fields.
        </p>
      )}
      {conflict && (
        <div className="api-warning" role="status">
          The Content-Type header conflicts with this body.{" "}
          <button
            onClick={() =>
              onChange({
                headers: request.headers.map((r) =>
                  r.key.trim().toLowerCase() === "content-type"
                    ? { ...r, value: "application/x-www-form-urlencoded" }
                    : r,
                ),
              })
            }
          >
            Use form Content-Type
          </button>
        </div>
      )}
      {warning && (
        <p className="api-warning" role="status">
          {warning}
        </p>
      )}
      {mode === "fields" ? (
        <>
          <p className="api-small api-muted">
            Enter plain values or {"{{variables}}"}. Encoding is automatic;
            duplicate keys and empty values are supported.
          </p>
          {!rows.length && (
            <p className="api-small api-muted">
              No form fields yet. Add a field to get started.
            </p>
          )}
          <div className="api-form-rows">
            {rows.map((row) => (
              <div className="api-form-row" key={row.id}>
                <input
                  aria-label="Form field key"
                  placeholder="Key"
                  value={row.key}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) =>
                    edit(
                      rows.map((r) =>
                        r.id === row.id ? { ...r, key: e.target.value } : r,
                      ),
                    )
                  }
                />
                <input
                  aria-label="Form field value"
                  placeholder="Value or {{variable}}"
                  type={
                    !show &&
                    credentialVariable(row.key) &&
                    !/^\{\{[^{}]+\}\}$/.test(row.value)
                      ? "password"
                      : "text"
                  }
                  value={row.value}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) =>
                    edit(
                      rows.map((r) =>
                        r.id === row.id ? { ...r, value: e.target.value } : r,
                      ),
                    )
                  }
                />
                <button
                  aria-label={`Remove form field ${row.key || "unnamed"}`}
                  onClick={() => edit(rows.filter((r) => r.id !== row.id))}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="api-small api-muted">
            Use key=value pairs separated by &amp;, for example{" "}
            {"grant_type=client_credentials&client_id={{Consumer_Key}}"}. Raw
            displays literal sensitive values. Literal +, &amp; and = in values
            must be URL encoded. Variable values are encoded automatically.
          </p>
          <CodeMirrorEditor
            value={request.body}
            onChange={(body) => onChange({ body })}
            language="text"
            variablePreview={variablePreview}
            theme={theme}
            autoFormatOnPaste={false}
            style={{ minHeight: 180 }}
          />
        </>
      )}
    </div>
  );
}

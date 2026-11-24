import { saveResponseBytes } from "../../services/http/saveResponse";
import React, { useMemo, useState } from "react";
import CodeMirrorEditor from "../CodeMirrorEditor";
import ResponseComparison from "./ResponseComparison";
import ResponseValues from "./ResponseValues";
import { AssertionResults } from "./Assertions";
import { restoreResponse } from "../../services/http/store.js";
import { formatPastedDocument } from "../../utils/codemirror/formatOnPaste";
import "./api-client.css";
export default function CodeHttpResponsePane({
  client,
  requestId,
  theme,
  height,
  onHeight,
  onClose,
  onOpenApi,
  onOpenEditor,
}) {
  const [view, setView] = useState("body"),
    [pretty, setPretty] = useState(true),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState("");
  const request =
    client.requests.find((r) => r.id === requestId) ||
    client.saved[requestId]?.request;
  const snapshot = client.saved[requestId]?.response;
  const baseline = useMemo(() => restoreResponse(snapshot), [snapshot]);
  const execution = client.executions[requestId] || {},
    response = execution.response || baseline;
  const content = useMemo(() => {
    if (!response) return { text: "", binary: false };
    const type = response.contentType || "";
    const binary =
      !!type && !/json|xml|text|javascript|form-urlencoded/i.test(type);
    let text = "";
    try {
      text = new TextDecoder(
        type.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] || "utf-8",
        { fatal: true },
      ).decode(response.bytes.subarray(0, 1024 * 1024), {
        stream: response.size > 1024 * 1024,
      });
    } catch {
      return { text: "", binary: true };
    }
    return { text, binary };
  }, [response]);
  return (
    <section
      className="api-client api-code-response"
      data-theme={theme}
      aria-label="HTTP editor response"
      style={{
        height,
        maxHeight: "60vh",
        flex: "0 0 auto",
        display: "flex",
        flexDirection: "column",
        minHeight: 160,
      }}
    >
      <div
        role="separator"
        aria-label="Resize HTTP response"
        aria-orientation="horizontal"
        tabIndex={0}
        className="api-code-response-resize"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.dataset.start = String(e.clientY);
          e.currentTarget.dataset.height = String(height);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            onHeight(
              Math.max(
                160,
                Math.min(
                  700,
                  Number(e.currentTarget.dataset.height) +
                    Number(e.currentTarget.dataset.start) -
                    e.clientY,
                ),
              ),
            );
        }}
        onKeyDown={(e) => {
          if (["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            onHeight(
              e.key === "Home"
                ? 160
                : e.key === "End"
                  ? 600
                  : Math.max(
                      160,
                      Math.min(700, height + (e.key === "ArrowUp" ? 20 : -20)),
                    ),
            );
          }
        }}
      />
      <div
        className="api-row api-between api-code-response-header"
        style={{
          padding: "3px 8px",
          borderBottom: "1px solid var(--api-border)",
        }}
      >
        <div className="api-code-response-heading">
          <strong
            className="api-small"
            style={{ maxWidth: "100%", overflowWrap: "anywhere" }}
          >
            {request?.method} {request?.name || "HTTP response"}
          </strong>
          <p
            role={execution.error ? "alert" : "status"}
            className="api-small api-code-status"
          >
            {execution.pending
              ? "Sending request…"
              : execution.error
                ? execution.error.message
                : execution.notice
                  ? execution.notice
                  : response
                    ? `${response.status} ${response.statusText} · ${Math.round(response.totalMs)} ms · ${response.size} bytes · ${response.environmentName || "No environment"}`
                    : "Select Send to execute this request."}
          </p>
        </div>
        <div className="api-row">
          {execution.pending && (
            <button onClick={() => client.cancel(requestId)}>Cancel</button>
          )}
          <button onClick={onOpenApi}>View in API client</button>
          <button onClick={onClose} aria-label="Close HTTP response">
            Close
          </button>
        </div>
      </div>
      <div
        className="api-code-response-content"
        style={{ overflow: "auto", padding: "4px 8px", minHeight: 0 }}
      >
        {client.transport === "desktop" &&
          request?.desktop?.verifyTls === false && (
            <p className="api-warning api-small">
              TLS verification is disabled for this draft. Review desktop
              Settings before sending.
            </p>
          )}
        {execution.error?.code === "origin" && request && (
          <button
            onClick={() => {
              try {
                client.approveDestination(request);
                setNotice(
                  "Destination approved. Use Send to execute explicitly.",
                );
              } catch {
                setNotice("Review variables and the URL before approving.");
              }
            }}
          >
            Approve destination for this draft
          </button>
        )}
        {response && (
          <>
            {response.savedSnapshot && (
              <p className="api-warning">Saved response, not a fresh result.</p>
            )}
            <div className="api-section-tabs">
              {["body", "headers", "compare", "assertions"].map((value) => (
                <button
                  key={value}
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                >
                  {value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
            {view === "compare" ? (
              <ResponseComparison baseline={baseline} current={response} />
            ) : view === "assertions" ? (
              <AssertionResults results={execution.assertionResults} />
            ) : view === "headers" ? (
              <>
                <p className="api-small api-muted">
                  {client.transport === "desktop"
                    ? "Native response headers. Cookies are not stored or automatically reused."
                    : "Only browser-readable HTTP headers are available."}
                </p>
                <div className="api-header-table">
                  {response.headers.map(([key, value]) => (
                    <div key={key}>
                      <code>{key}</code>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : content.binary ? (
              <p>Binary response. Download to inspect.</p>
            ) : (
              <>
                {response.size > 1024 * 1024 && (
                  <p className="api-warning">
                    Preview limited to 1 MiB; download contains all received
                    bytes.
                  </p>
                )}
                <div className="api-row api-code-response-tools">
                  <button onClick={() => setPretty((v) => !v)}>
                    {pretty ? "Show raw" : "Show pretty"}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(content.text);
                        setNotice("Response copied.");
                      } catch {
                        setNotice("Could not copy response.");
                      }
                    }}
                  >
                    {response.size > 1024 * 1024
                      ? "Copy preview"
                      : "Copy response"}
                  </button>
                  <button
                    onClick={() =>
                      onOpenEditor(
                        content.text,
                        /json/i.test(response.contentType) ? "json" : "text",
                      )
                    }
                  >
                    Open response in editor
                  </button>
                  <label className="api-code-response-search">
                    <input
                      aria-label="Find in HTTP response"
                      placeholder="Find in response…"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                </div>
                <ResponseValues
                  key={`${requestId}-${response.receivedAt}`}
                  source={content.text}
                  tooLarge={response.size > 1024 * 1024}
                  client={client}
                  request={request}
                  theme={theme}
                />
                <CodeMirrorEditor
                  value={
                    pretty ? formatPastedDocument(content.text) : content.text
                  }
                  readOnly
                  searchTerm={search}
                  language={
                    /json/i.test(response.contentType) ? "json" : "text"
                  }
                  theme={theme}
                />
              </>
            )}
            <button
              onClick={async () => {
                try {
                  if (await saveResponseBytes(response.bytes))
                    setNotice("Response bytes saved.");
                } catch {
                  setNotice(
                    "Could not save response bytes. Choose a writable location and retry.",
                  );
                }
              }}
            >
              Download response bytes
            </button>
          </>
        )}
        {notice && <p role="status">{notice}</p>}
      </div>
    </section>
  );
}

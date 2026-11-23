import React, { useMemo, useRef, useState } from "react";
import { compareResponses } from "../../services/http/compare.js";
export default function ResponseComparison({ baseline, current }) {
  const [section, setSection] = useState("body");
  const [index, setIndex] = useState(-1);
  const [notice, setNotice] = useState("");
  const root = useRef(null);
  const comparison = useMemo(
    () => compareResponses(baseline, current, section),
    [baseline, current, section],
  );
  const count =
    comparison.changes?.filter((c) => c.added || c.removed).length || 0;
  const move = (direction) => {
    const next =
      index < 0
        ? direction > 0
          ? 0
          : count - 1
        : (index + direction + count) % count;
    setIndex(next);
    root.current
      ?.querySelectorAll('[data-changed="true"]')
      [next]?.scrollIntoView({ block: "nearest" });
  };
  return (
    <div ref={root} className="api-comparison" aria-label="Response comparison">
      <p className="api-small api-muted">
        Saved snapshot → current response. Comparison never changes either
        response. Save locally with a response snapshot to replace the baseline.
      </p>
      {baseline && (
        <p className="api-small">
          Saved: {new Date(baseline.receivedAt).toLocaleString()} ·{" "}
          {baseline.environmentName || "No environment"}
        </p>
      )}
      {baseline &&
        current &&
        !current.savedSnapshot &&
        !current.copiedSnapshot && (
          <>
            <p className="api-small">
              Current: {new Date(current.receivedAt).toLocaleString()} ·{" "}
              {current.environmentName || "No environment"}
            </p>
            <div className="api-comparison-metadata">
              <span>
                Status: {baseline.status} → {current.status}
              </span>
              <span>
                Size: {baseline.size} → {current.size} bytes
              </span>
              <span>
                Time: {Math.round(baseline.totalMs)} →{" "}
                {Math.round(current.totalMs)} ms
              </span>
            </div>
          </>
        )}
      <div className="api-row">
        <label>
          Compare
          <select
            aria-label="Comparison section"
            value={section}
            onChange={(e) => {
              setSection(e.target.value);
              setIndex(-1);
              setNotice("");
            }}
          >
            <option value="body">Body</option>
            <option value="headers">HTTP headers</option>
          </select>
        </label>
      </div>
      {section === "headers" && (
        <p className="api-small api-muted">
          Compares browser-readable headers. Known credential headers and
          Location are excluded on both sides because saved snapshots omit them.
        </p>
      )}
      {comparison.error ? (
        <p role="status">{comparison.error}</p>
      ) : (
        <>
          <p role="status">
            {comparison.identical
              ? "No changes in " + section + "."
              : "Changes found in " + section + "."}
          </p>
          {comparison.paths !== null && (
            <details>
              <summary>Changed JSON paths ({comparison.paths.length})</summary>
              <p className="api-small api-muted">
                JSON Pointer paths. Body diff below preserves exact text,
                including formatting.
              </p>
              {comparison.paths.length ? (
                <ul>
                  {comparison.paths.map((p) => (
                    <li key={p.path}>
                      <code>{p.path || "(root)"}</code> · {p.type}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  No JSON value changes; text formatting or key order may
                  differ.
                </p>
              )}
            </details>
          )}
          <div className="api-row">
            <button disabled={!count} onClick={() => move(-1)}>
              Previous change
            </button>
            <button disabled={!count} onClick={() => move(1)}>
              Next change
            </button>
            <span className="api-small">
              {index >= 0
                ? `${index + 1} / ${count}`
                : `${count} changed blocks`}
            </span>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    comparison.changes
                      .map((c) =>
                        c.value
                          .split("\n")
                          .map(
                            (line) =>
                              `${c.added ? "+" : c.removed ? "-" : " "}${line}`,
                          )
                          .join("\n"),
                      )
                      .join("\n"),
                  );
                  setNotice("Comparison copied to clipboard.");
                } catch {
                  setNotice("Could not copy comparison.");
                }
              }}
            >
              Copy comparison
            </button>
          </div>
          <div
            className="api-comparison-diff"
            tabIndex={0}
            aria-label="Response differences"
          >
            {comparison.changes.map((change, i) => (
              <pre
                key={i}
                data-changed={!!(change.added || change.removed)}
                data-kind={
                  change.added ? "added" : change.removed ? "removed" : "same"
                }
              >
                <span
                  aria-label={
                    change.added
                      ? "Added"
                      : change.removed
                        ? "Removed"
                        : "Unchanged"
                  }
                >
                  {change.added ? "+ " : change.removed ? "− " : "  "}
                </span>
                {change.value || "(empty)"}
              </pre>
            ))}
          </div>
          {notice && <p role="status">{notice}</p>}
        </>
      )}
    </div>
  );
}

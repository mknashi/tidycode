import React from "react";
import {
  ASSERTION_TYPES,
  newAssertion,
} from "../../services/http/assertions.js";
export function AssertionEditor({ rules = [], onChange }) {
  const patch = (id, changes) =>
    onChange(
      rules.map((rule) => (rule.id === id ? { ...rule, ...changes } : rule)),
    );
  return (
    <div className="api-field-section">
      <p className="api-small api-muted">
        Checks run once after each response. Editing applies to the next send.
        No scripts or automatic follow-up requests run. Expected values may
        contain private data; assertions are included in local saving only when
        selected in the save review.
      </p>
      {rules.map((rule, index) => (
        <div className="api-assertion-row" key={rule.id}>
          <label className="api-row">
            <input
              type="checkbox"
              aria-label={`Enable assertion ${index + 1}`}
              checked={rule.enabled}
              onChange={(e) => patch(rule.id, { enabled: e.target.checked })}
            />
            {index + 1}
          </label>
          <label>
            Check
            <select
              aria-label={`Assertion type ${index + 1}`}
              value={rule.type}
              onChange={(e) =>
                patch(rule.id, {
                  type: e.target.value,
                  target: e.target.value.startsWith("header")
                    ? "Content-Type"
                    : "",
                  expected:
                    e.target.value === "status"
                      ? "200"
                      : e.target.value === "duration"
                        ? "500"
                        : e.target.value === "jsonEquals"
                          ? '"value"'
                          : "json",
                })
              }
            >
              {Object.entries(ASSERTION_TYPES).map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {(rule.type.startsWith("header") || rule.type.startsWith("json")) && (
            <label>
              {rule.type.startsWith("json") ? "JSON Pointer" : "Header name"}
              <input
                aria-label={`Assertion target ${index + 1}`}
                value={rule.target}
                maxLength={512}
                placeholder={
                  rule.type.startsWith("json")
                    ? "/data/id (empty = root)"
                    : "Content-Type"
                }
                onChange={(e) => patch(rule.id, { target: e.target.value })}
              />
            </label>
          )}
          {!["headerExists", "jsonExists"].includes(rule.type) && (
            <label>
              {rule.type === "jsonEquals" ? "Expected JSON scalar" : "Expected"}
              <input
                aria-label={`Assertion expected ${index + 1}`}
                value={rule.expected}
                maxLength={4096}
                placeholder={
                  rule.type === "jsonEquals" ? '"ready", 42, true, or null' : ""
                }
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => patch(rule.id, { expected: e.target.value })}
              />
            </label>
          )}
          <button
            aria-label={`Remove assertion ${index + 1}`}
            onClick={() => onChange(rules.filter((r) => r.id !== rule.id))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        disabled={rules.length >= 50}
        onClick={() => onChange([...rules, newAssertion()])}
      >
        Add assertion
      </button>
      {!rules.length && (
        <p className="api-small api-muted">
          No assertions yet. Add a check for status, a header, a JSON value, or
          duration.
        </p>
      )}
      <p className="api-small api-muted">
        JSON checks use JSON Pointer paths and complete JSON bodies up to 1 MiB,
        500 nodes, and 32 levels. Equality supports strings, numbers, booleans,
        and null. Header checks can only see headers exposed by the browser.
      </p>
    </div>
  );
}
export function AssertionResults({ results }) {
  if (!results)
    return (
      <p className="api-small api-muted">
        Send this request to run its assertions. Saved response snapshots do not
        contain assertion results.
      </p>
    );
  if (!results.length)
    return (
      <p className="api-small api-muted">
        No assertions were configured for the last send. Add them under Request
        → Assertions.
      </p>
    );
  const count = (state) => results.filter((r) => r.state === state).length;
  return (
    <div aria-label="Assertion results">
      <p role="status">
        {count("passed")} passed · {count("failed")} failed · {count("skipped")}{" "}
        skipped
      </p>
      <p className="api-small api-muted">
        Results belong to the last send. Request edits apply on the next send.
        Checks never modify the response.
      </p>
      <ol className="api-assertion-results">
        {results.map((result, i) => (
          <li key={result.id + i} data-state={result.state}>
            <strong>
              {result.state === "passed"
                ? "Pass"
                : result.state === "failed"
                  ? "Fail"
                  : "Skipped"}
            </strong>{" "}
            · {ASSERTION_TYPES[result.type]}{" "}
            {result.target && <code>{result.target}</code>}
            <p>{result.message}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

import React, { useEffect, useRef, useState, useMemo } from "react";
import { parseEnvironments } from "../../services/http/environmentImport";
export default function EnvironmentImport({ client, theme, onClose }) {
  const reads = useRef(0);
  const ref = useRef(null),
    [source, setSource] = useState(""),
    [allSecret, setAllSecret] = useState(true),
    [privateFile, setPrivateFile] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  const preview = useMemo(() => {
    try {
      const names = new Set(
        client.variableSettings.environments.map((env) => env.name),
      );
      const environments = source
        ? parseEnvironments(source, allSecret || privateFile)
        : [];
      for (const env of environments) {
        const original = env.name;
        let index = 1;
        while (names.has(env.name))
          env.name = original.slice(0, 180) + " (imported " + index++ + ")";
        names.add(env.name);
      }
      return { environments };
    } catch (e) {
      return { environments: [], error: e.message };
    }
  }, [source, allSecret, privateFile, client.variableSettings.environments]);
  const apply = async (persist) => {
    setBusy(true);
    try {
      await client.importEnvironments(preview.environments, persist);
      onClose("Environments imported. Select one explicitly before sending.");
    } catch {
      setError("Could not import environments. No partial import was applied.");
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={ref}
      className="api-client api-import-modal"
      data-theme={theme}
      aria-label="Import environments"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <section className="api-import-dialog">
        <div className="api-row api-between">
          <h2>Import environments</h2>
          <button disabled={busy} onClick={() => onClose()}>
            Cancel
          </button>
        </div>
        <p>
          Choose a Postman environment or named JSON environment map. Existing
          values remain unchanged; nothing sends automatically. Imports do not
          activate an environment.
        </p>
        <input
          aria-label="Choose environment file"
          type="file"
          accept=".json"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 1024 * 1024) {
              setError("Choose JSON up to 1 MiB.");
              return;
            }
            const id = ++reads.current;
            try {
              const text = await file.text();
              if (id !== reads.current) return;
              setSource(text);
              setPrivateFile(/private/i.test(file.name));
              setError("");
            } catch {
              setError("Could not read that environment file.");
            }
          }}
        />
        <label>
          Paste JSON
          <textarea
            aria-label="Environment import content"
            rows={5}
            value={source}
            disabled={busy}
            onChange={(e) => {
              reads.current++;
              setSource(e.target.value);
            }}
          />
        </label>
        <label className="api-row">
          <input
            type="checkbox"
            checked={allSecret || privateFile}
            disabled={busy || privateFile}
            onChange={(e) => setAllSecret(e.target.checked)}
          />
          Treat all imported values as secret
        </label>
        <p className="api-small api-muted">
          Private files and credential-like names always remain secret. Secret
          values stay in memory; local saving keeps empty definitions. Other
          saved values are readable local data.
        </p>
        {preview.environments.map((env) => (
          <div key={env.name}>
            <strong>
              {env.name}
              {env.production ? " · Production" : ""}
            </strong>
            <p className="api-small">
              {env.variables
                .map((row) => row.key + (row.secret ? " (secret)" : ""))
                .join(", ")}
            </p>
          </div>
        ))}
        {(preview.error || error) && (
          <p role="alert">{preview.error || error}</p>
        )}
        <div className="api-row">
          <button
            disabled={busy || !preview.environments.length || !!preview.error}
            onClick={() => apply(false)}
          >
            Apply environments for this session
          </button>
          <button
            disabled={busy || !preview.environments.length || !!preview.error}
            onClick={() => apply(true)}
          >
            Save environment definitions locally
          </button>
        </div>
      </section>
    </dialog>
  );
}

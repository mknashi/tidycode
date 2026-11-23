import React, { useRef, useEffect, useState } from "react";
import { runSequence } from "../../services/http/runner";
export default function CollectionRunner({
  client,
  requests,
  title,
  theme,
  onClose,
  onReview,
}) {
  const generation = useRef(0);
  const ref = useRef(null),
    stopped = useRef(false),
    current = useRef(null),
    alive = useRef(true);
  const [selected, setSelected] = useState(new Set(requests.map((r) => r.id))),
    [captures, setCaptures] = useState({}),
    [environment, setEnvironment] = useState(
      client.variableSettings.activeId || "",
    ),
    [stopOnFailure, setStopOnFailure] = useState(true),
    [busy, setBusy] = useState(false),
    [results, setResults] = useState({}),
    [error, setError] = useState("");
  const cancel = () => {
    generation.current++;
    stopped.current = true;
    if (current.current) {
      const id = current.current;
      client.cancel(id);
      setResults((previous) => ({
        ...previous,
        [id]: {
          ...previous[id],
          id,
          state: "cancelled",
          message:
            "Stopped. The server may already have processed the current request.",
        },
      }));
      current.current = null;
    }
    setBusy(false);
  };
  useEffect(() => {
    alive.current = true;
    ref.current.showModal();
    return () => {
      alive.current = false;
      stopped.current = true;
      if (current.current) client.cancel(current.current);
      ref.current?.close();
    };
  }, []);
  const start = async () => {
    const token = ++generation.current;
    stopped.current = false;
    setBusy(true);
    setResults({});
    setError("");
    try {
      const settings = structuredClone(client.variableSettings);
      settings.activeId = environment || null;
      await runSequence({
        steps: requests
          .filter((r) => selected.has(r.id))
          .map((request) => ({ request, capture: captures[request.id] })),
        settings,
        stopOnFailure,
        send: async (request, variables) => {
          current.current = request.id;
          return client.send(request, variables);
        },
        isStopped: () => stopped.current || generation.current !== token,
        onStep: (result) => {
          if (alive.current && generation.current === token)
            setResults((previous) => ({ ...previous, [result.id]: result }));
        },
      });
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      if (generation.current === token) {
        current.current = null;
        if (alive.current) setBusy(false);
      }
    }
  };
  return (
    <dialog
      ref={ref}
      className="api-client api-import-modal"
      data-theme={theme}
      aria-label="Run HTTP requests"
      onCancel={(event) => {
        event.preventDefault();
        if (busy) cancel();
        onClose();
      }}
    >
      <section className="api-import-dialog">
        <div className="api-row api-between">
          <h2>Run {title}</h2>
          <button
            onClick={() => {
              if (busy) cancel();
              onClose();
            }}
          >
            {busy ? "Stop and close" : "Close"}
          </button>
        </div>
        <p>
          Selected requests execute sequentially, including write operations.
          There are no retries. Captures are secret and exist only for this run;
          no variables or request definitions are saved automatically.
        </p>
        <label>
          Environment for this run
          <select
            aria-label="Runner environment"
            disabled={busy}
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
          >
            <option value="">No environment</option>
            {client.variableSettings.environments.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name}
                {env.production ? " · Production" : ""}
              </option>
            ))}
          </select>
        </label>
        {client.variableSettings.environments.find(
          (env) => env.id === environment,
        )?.production && (
          <p className="api-warning">Production environment selected</p>
        )}
        <label className="api-row">
          <input
            type="checkbox"
            checked={stopOnFailure}
            disabled={busy}
            onChange={(e) => setStopOnFailure(e.target.checked)}
          />
          Stop on request, assertion, or capture failure
        </label>
        <div className="api-runner-steps">
          {requests.map((request, i) => (
            <div key={request.id} className="api-runner-step">
              <label className="api-row">
                <input
                  aria-label={`Run step ${i + 1}`}
                  type="checkbox"
                  disabled={busy}
                  checked={selected.has(request.id)}
                  onChange={(e) =>
                    setSelected((old) => {
                      const next = new Set(old);
                      if (e.target.checked) next.add(request.id);
                      else next.delete(request.id);
                      return next;
                    })
                  }
                />
                <strong>
                  {i + 1}. {request.method} {request.name}
                </strong>
              </label>
              <details>
                <summary>Capture a JSON value for following steps</summary>
                <p className="api-small api-muted">
                  Optional. Use a JSON Pointer and variable name, then reference
                  it as {"{{name}}"} in later steps. Captures do not persist.
                </p>
                <div className="api-row">
                  <label>
                    JSON Pointer
                    <input
                      aria-label={`Capture path ${i + 1}`}
                      disabled={busy}
                      placeholder="/token"
                      value={captures[request.id]?.path || ""}
                      onChange={(e) =>
                        setCaptures((old) => ({
                          ...old,
                          [request.id]: {
                            ...old[request.id],
                            path: e.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Variable name
                    <input
                      aria-label={`Capture name ${i + 1}`}
                      disabled={busy}
                      value={captures[request.id]?.name || ""}
                      onChange={(e) =>
                        setCaptures((old) => ({
                          ...old,
                          [request.id]: {
                            ...old[request.id],
                            name: e.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                </div>
                <label className="api-row">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={!!captures[request.id]?.overwrite}
                    onChange={(e) =>
                      setCaptures((old) => ({
                        ...old,
                        [request.id]: {
                          ...old[request.id],
                          overwrite: e.target.checked,
                        },
                      }))
                    }
                  />
                  Allow overriding an existing variable for this run
                </label>
              </details>
              {results[request.id] && (
                <div role="status" data-state={results[request.id].state}>
                  <strong>{results[request.id].state}</strong>
                  {results[request.id].status
                    ? " · HTTP " + results[request.id].status
                    : ""}
                  <p className="api-small">{results[request.id].message}</p>
                  <button
                    disabled={busy}
                    onClick={() => {
                      client.selectEnvironment(environment);
                      client.select(request.id);
                      onClose();
                      onReview?.(request.id);
                    }}
                  >
                    Review request
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="api-row">
          <button
            className="api-primary"
            disabled={busy || !client.ready || !selected.size}
            onClick={start}
          >
            {busy ? "Running…" : "Start selected requests"}
          </button>
          {busy && <button onClick={cancel}>Stop run</button>}
        </div>
      </section>
    </dialog>
  );
}

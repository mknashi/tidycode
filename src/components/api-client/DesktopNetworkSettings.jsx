import React, { useEffect, useRef, useState } from "react";
import SecretVisibilityButton from "../SecretVisibilityButton";
import {
  DEFAULT_DESKTOP_NETWORK,
  validateDesktopNetwork,
} from "../../services/http/desktopNetwork";
export default function DesktopNetworkSettings({ request, client, onChange }) {
  const [draft, setDraft] = useState({
      ...DEFAULT_DESKTOP_NETWORK,
      ...request.desktop,
    }),
    [reviewed, setReviewed] = useState(false),
    [show, setShow] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    setReviewed(false);
  }, [request.url, client.variableSettings]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const patch = (values) => {
    setDraft((old) => ({ ...old, ...values, insecureConfirmed: false }));
    setReviewed(false);
    setNotice("");
    setError("");
  };
  const inspect = () => {
    const result = client.inspectVariables(request);
    if (result.error || !result.request)
      throw Error(
        "Resolve request variables before applying network settings.",
      );
    return result;
  };
  const apply = () => {
    try {
      const result = inspect();
      if ((!draft.verifyTls || draft.proxyUrl || draft.caPem) && !reviewed)
        throw Error(
          "Review and approve these destination-specific settings first.",
        );
      const settings = validateDesktopNetwork(
        {
          ...draft,
          origin: new URL(result.request.url).origin,
          insecureConfirmed: !draft.verifyTls && reviewed,
        },
        result.request.url,
      );
      onChange({ desktop: settings });
      setNotice(
        "Desktop network settings applied for this request and session only.",
      );
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  let destination = "Resolve request variables to review the destination.";
  try {
    const result = inspect();
    destination = result.secretDestination
      ? "Destination is derived from a secret variable (hidden)."
      : new URL(result.request.url).origin;
  } catch {}
  return (
    <section
      className="api-field-section"
      aria-label="Desktop TLS and proxy settings"
    >
      <h2>Desktop TLS & proxy</h2>
      <p className="api-small api-muted">
        Per request, session only. Excluded from saved templates, exports and
        duplicates. Source-file requests retain these settings for their current
        session binding.
      </p>
      <p className="api-small">Destination: {destination}</p>
      <label className="api-row">
        <input
          type="checkbox"
          aria-label="Verify TLS certificates"
          checked={draft.verifyTls}
          onChange={(e) => patch({ verifyTls: e.target.checked })}
        />
        Verify TLS certificates and hostnames
      </label>
      {!draft.verifyTls && (
        <p className="api-warning">
          TLS verification will be disabled for this request’s TLS connections,
          including an HTTPS proxy. Credentials and data can be intercepted.
          Prefer a trusted custom CA.
        </p>
      )}
      <label>
        Custom CA certificates (PEM)
        <input
          aria-label="Custom CA certificate file"
          type="file"
          accept=".pem,.crt"
          onChange={async (e) => {
            const file = e.target.files?.[0],
              id = ++generation.current;
            if (!file) return;
            if (file.size > 131072) {
              setError("CA certificate file exceeds 128 KiB.");
              e.target.value = "";
              return;
            }
            try {
              const pem = await file.text();
              if (id !== generation.current) return;
              if (
                !pem.includes("-----BEGIN CERTIFICATE-----") ||
                pem.includes("PRIVATE KEY")
              )
                throw Error(
                  "Choose a PEM CA certificate bundle without private keys.",
                );
              patch({ caPem: pem });
            } catch {
              if (id === generation.current)
                setError(
                  "Could not read a PEM CA certificate bundle without private keys.",
                );
            }
          }}
        />
      </label>
      {draft.caPem && (
        <div className="api-row">
          <span className="api-small">
            Custom CA configured. Added to system trust for this request only.
          </span>
          <button onClick={() => patch({ caPem: "" })}>Remove custom CA</button>
        </div>
      )}
      <label>
        HTTP(S) proxy URL
        <input
          aria-label="Desktop proxy URL"
          placeholder="http://127.0.0.1:8080"
          value={draft.proxyUrl}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => patch({ proxyUrl: e.target.value })}
        />
      </label>
      <p className="api-small api-muted">
        Blank means direct connection. System/environment proxies are not
        inherited. A configured proxy receives request traffic; choose one you
        trust.
      </p>
      <label>
        Proxy username
        <input
          aria-label="Desktop proxy username"
          placeholder="Literal value or {{variable}}"
          value={draft.proxyUsername}
          autoComplete="off"
          onChange={(e) => patch({ proxyUsername: e.target.value })}
        />
      </label>
      <label>
        Proxy password
        <div className="api-row">
          <input
            aria-label="Desktop proxy password"
            placeholder="Literal value or {{secret_variable}}"
            type={show ? "text" : "password"}
            value={draft.proxyPassword}
            autoComplete="off"
            onChange={(e) => patch({ proxyPassword: e.target.value })}
          />
          <SecretVisibilityButton
            shown={show}
            onToggle={() => setShow((v) => !v)}
            label="proxy password"
          />
        </div>
      </label>
      {(!draft.verifyTls || draft.caPem || draft.proxyUrl) && (
        <label className="api-row">
          <input
            type="checkbox"
            aria-label="Approve desktop network settings"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          I approve these TLS/proxy settings for the current destination. A
          destination change requires review again.
        </label>
      )}
      {error && (
        <p role="alert" className="api-warning">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="api-row">
        <button onClick={apply}>Apply desktop network settings</button>
        <button
          onClick={() => {
            generation.current++;
            setDraft({ ...DEFAULT_DESKTOP_NETWORK });
            setReviewed(false);
            setShow(false);
            setError("");
            setNotice("Reset to verified TLS and direct connection.");
            onChange({ desktop: undefined });
          }}
        >
          Reset network settings
        </button>
      </div>
    </section>
  );
}

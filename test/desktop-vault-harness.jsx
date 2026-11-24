import ApiClientWorkspace from "../src/components/api-client/ApiClientWorkspace";
import { useApiClient } from "../src/hooks/useApiClient";
// Browser-only fixture: simulates the OS bridge without writing real keychain credentials.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import VariablesDialog from "../src/components/api-client/VariablesDialog";
import {
  emptyVariables,
  validateVariables,
} from "../src/services/http/variables";
import "../src/components/api-client/api-client.css";
const secrets = new Map();
window.vaultCalls = [];
window.nativeRequests = [];
window.vaultDenied = false;
window.__TAURI_INTERNALS__ = {
  invoke: async (command, args) => {
    window.vaultCalls.push({ command, id: args.id });
    if (command === "api_http_request") {
      window.nativeRequests.push(args.request);
      return {
        status: 200,
        statusText: "OK",
        headers: [],
        bodyBase64: btoa('{"native":true}'),
        size: 15,
        totalMs: 1,
        headersMs: 1,
        contentType: "application/json",
      };
    }
    if (window.vaultDenied) throw Error("SENSITIVE_KEYCHAIN_ERROR");
    if (command === "api_vault_get") return secrets.get(args.id) ?? null;
    if (command === "api_vault_set") secrets.set(args.id, args.value);
    if (command === "api_vault_delete") secrets.delete(args.id);
  },
};
function Fixture() {
  const [settings, setSettings] = useState(emptyVariables()),
    [open, setOpen] = useState(true);
  window.secretCount = () => secrets.size;
  return (
    <>
      <button onClick={() => setOpen(true)}>Open variables</button>
      {open && (
        <VariablesDialog
          theme="dark"
          request={{ id: "test-request", collectionId: null }}
          client={{
            transport: "desktop",
            variableSettings: settings,
            collections: [],
            applyVariables: async (draft, persist) => {
              setSettings(persist ? validateVariables(draft, true) : draft);
              if (persist)
                localStorage.setItem(
                  "fixture-variable-settings",
                  JSON.stringify(validateVariables(draft, true)),
                );
            },
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
function WorkspaceFixture() {
  const client = useApiClient();
  return (
    <ApiClientWorkspace
      client={client}
      theme="dark"
      visible
      onOpenResponse={() => {}}
    />
  );
}
createRoot(document.getElementById("vault-test-root")).render(
  new URLSearchParams(location.search).has("workspace") ? (
    <WorkspaceFixture />
  ) : (
    <Fixture />
  ),
);

import FormBodyEditor from "./FormBodyEditor";
import {
  apiVariablePreview,
  variableFieldPreview,
} from "../../services/http/variablePreview";
import TestDataGenerator from "./TestDataGenerator";
import { formatPastedDocument as formatHttpBodyText } from "../../utils/codemirror/formatOnPaste";
import CollectionRunner from "./CollectionRunner";
import UploadBodyEditor from "./UploadBodyEditor";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  Send,
  Square,
  Copy,
  FileCode,
  Shield,
  Search,
  Globe,
  Trash2,
} from "lucide-react";
import { savedTemplate, responseSnapshot } from "../../services/http/store.js";
import { isolateHistory } from "@codemirror/commands";
import CodeMirrorEditor from "../CodeMirrorEditor";

import {
  applyQuery,
  DISPLAY_LIMIT,
  newRow,
  queryRows,
} from "../../services/http/request.js";
import { formatService } from "../../services/formatters";
import VariablesDialog from "./VariablesDialog";
import TabActions from "./TabActions";
import EnvironmentMenu from "./EnvironmentMenu";
import SidebarSection from "./SidebarSection";
import CollectionsPanel from "./CollectionsPanel";
import { AssertionEditor, AssertionResults } from "./Assertions";
import ResponseValues from "./ResponseValues";
import ResponseComparison from "./ResponseComparison";
import ExportRequests from "./ExportRequests";
import ImportRequests from "./ImportRequests";
import "./api-client.css";

const sizeLabel = (n) =>
  n < 1024
    ? `${n} B`
    : n < 1024 ** 2
      ? `${(n / 1024).toFixed(1)} KiB`
      : `${(n / 1024 ** 2).toFixed(1)} MiB`;
function KeyValues({ rows, onChange, kind }) {
  const edit = (id, patch) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <div className="api-kvs">
      <div className="api-row api-between">
        <span className="api-muted">
          {kind === "header" ? "Request headers" : "Query parameters"}
        </span>
        <button onClick={() => onChange([...rows, newRow()])}>
          <Plus size={14} /> Add {kind}
        </button>
      </div>
      {rows.length === 0 && (
        <p className="api-muted">
          No {kind === "header" ? "headers" : "query parameters"} yet.
        </p>
      )}
      {rows.map((r) => (
        <div className="api-kv" key={r.id}>
          <input
            type="checkbox"
            checked={r.enabled}
            aria-label={`Enable ${kind}`}
            onChange={(e) => edit(r.id, { enabled: e.target.checked })}
          />
          <input
            aria-label={`${kind} key`}
            placeholder="Key"
            value={r.key}
            onChange={(e) => edit(r.id, { key: e.target.value })}
          />
          <input
            aria-label={`${kind} value`}
            placeholder="Value"
            autoComplete="off"
            spellCheck={false}
            value={r.value}
            onChange={(e) => edit(r.id, { value: e.target.value })}
          />
          <button
            aria-label={`Remove ${kind}`}
            onClick={() => onChange(rows.filter((x) => x.id !== r.id))}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
const defaultSaveOptions = (response) => ({
  query: true,
  headers: true,
  body: true,
  response: !!response && response.bytes.length <= DISPLAY_LIMIT,
  assertions: false,
});

const LAYOUT_KEY = "tidycode-api-layout-v1";
function readLayout() {
  try {
    const value = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}");
    return {
      mode: ["auto", "split", "tabs", "stacked"].includes(value.mode)
        ? value.mode
        : "auto",
      ratio: Number.isFinite(value.ratio)
        ? Math.max(30, Math.min(70, value.ratio))
        : 50,
    };
  } catch {
    return { mode: "auto", ratio: 50 };
  }
}

const SIDEBAR_KEY = "tidycode-api-sidebar-v1";
function readSidebar() {
  try {
    const s = JSON.parse(localStorage.getItem(SIDEBAR_KEY) || "{}");
    return {
      width: Number.isFinite(s.width)
        ? Math.max(200, Math.min(480, s.width))
        : 280,
      saved: s.saved === true,
      history: s.history === true,
      storage: s.storage === true,
      drafts: s.drafts !== false,
      environments: s.environments === true,
    };
  } catch {
    return {
      width: 280,
      saved: false,
      history: false,
      storage: false,
      drafts: true,
      environments: false,
    };
  }
}

export default function ApiClientWorkspace({
  theme,
  onOpenResponse,
  visible = true,
  client,
  aiSettings,
  aiService,
}) {
  const { active: request, execution } = client;
  const resolution = useMemo(
    () => client.inspectVariables(request),
    [request, client.variableSettings],
  );
  const previewVariable = useCallback(
    (key) => apiVariablePreview(request, client.variableSettings, key),
    [
      request.id,
      request.collectionId,
      request.fileVariables,
      request.blockVariables,
      client.variableSettings,
    ],
  );
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [variableContext, setVariableContext] = useState({});
  const openVariables = (context = {}) => {
    setVariableContext(context);
    setNotice("");
    setVariablesOpen(true);
  };
  const [tabMenu, setTabMenu] = useState(null);
  const tabsRef = useRef(null);
  const draggedTab = useRef(null);
  useEffect(() => {
    tabsRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [request.id, client.openRequests.length]);
  const [layoutPreference, setLayoutPreference] = useState(readLayout);
  const [narrow, setNarrow] = useState(true);
  const [sidebar, setSidebar] = useState(readSidebar);
  const [sidebarMax, setSidebarMax] = useState(480);
  const rootRef = useRef(null);
  const sidebarWidth = Math.min(sidebar.width, sidebarMax);
  const updateSidebar = (patch) =>
    setSidebar((old) => {
      const next = { ...old, ...patch };
      try {
        localStorage.setItem(SIDEBAR_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  useEffect(() => {
    if (!rootRef.current) return;
    const observer = new ResizeObserver((entries) =>
      setSidebarMax(
        Math.max(200, Math.min(480, entries[0].contentRect.width - 360)),
      ),
    );
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [client.ready]);
  const [panels, setPanels] = useState({});
  const mainRef = useRef(null);
  const panesRef = useRef(null);
  const layout =
    layoutPreference.mode === "stacked"
      ? "stacked"
      : narrow || layoutPreference.mode === "tabs"
        ? "tabs"
        : "split";
  const activePanel =
    panels[request.id] ||
    (execution.response?.savedSnapshot || execution.response?.copiedSnapshot
      ? "response"
      : "request");
  const choosePanel = (panel) =>
    setPanels((p) => ({ ...p, [request.id]: panel }));
  const updateLayout = (patch) => {
    setLayoutPreference((old) => {
      const next = { ...old, ...patch };
      try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
      } catch {
        /* The layout still works for this session. */
      }
      return next;
    });
  };
  useEffect(() => {
    if (!mainRef.current) return;
    const observer = new ResizeObserver((entries) =>
      setNarrow(entries[0].contentRect.width < 760),
    );
    observer.observe(mainRef.current);
    return () => observer.disconnect();
  }, [client.ready]);
  const [forkPreview, setForkPreview] = useState(null);
  const [exportTarget, setExportTarget] = useState(null);
  const [runTarget, setRunTarget] = useState(null);
  const [testDataTarget, setTestDataTarget] = useState(null);
  const [importSeed, setImportSeed] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [saveConfirm, setSaveConfirm] = useState(false);
  const [saveOptions, setSaveOptions] = useState(() =>
    defaultSaveOptions(null),
  );
  const [saving, setSaving] = useState(false);
  const saveDialogRef = useRef(null);
  useEffect(() => {
    if (saveConfirm) saveDialogRef.current?.querySelector("input")?.focus();
  }, [saveConfirm]);
  const [section, setSection] = useState("params");
  const [view, setView] = useState("pretty");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [clearConfirm, setClearConfirm] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const bodyEditorRef = useRef(null);
  const [responseSearch, setResponseSearch] = useState("");
  const response = execution.response;
  const unfiledDrafts = client.requests.filter(
    (r) =>
      !client.saved[r.id] &&
      !client.collections.some((c) => c.id === r.collectionId) &&
      r.name.toLowerCase().includes(search.toLowerCase()),
  );
  const savedRequests = Object.values(client.saved).filter((record) =>
    (
      client.requests.find((r) => r.id === record.id)?.name ||
      record.request.name
    )
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const patch = (update) => client.update(request.id, update);
  const params = request.params;
  const content = useMemo(() => {
    if (!response)
      return { raw: "", pretty: "", language: "text", binary: false };
    const bytes = response.bytes.subarray(0, DISPLAY_LIMIT);
    const type = response.contentType;
    const binary = !(
      /json|xml|text|javascript|form-urlencoded/.test(type) || !type
    );
    let raw;
    try {
      const charset =
        type.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] || "utf-8";
      raw = new TextDecoder(charset).decode(bytes);
    } catch {
      raw = new TextDecoder().decode(bytes);
    }
    const language = /json/.test(type)
      ? "json"
      : /xml/.test(type)
        ? "xml"
        : "text";
    let pretty = raw;
    if (!binary && response.size <= DISPLAY_LIMIT && language !== "text") {
      try {
        pretty = formatService.format(raw, language).formatted || raw;
      } catch {
        /* Preserve invalid API content. */
      }
    }
    return { raw, pretty, language, binary };
  }, [response]);
  const select = (id) => {
    client.select(id);
    setNotice("");
    setShowToken(false);
    setResponseSearch("");
    setSaveConfirm(false);
  };
  const send = () => {
    setNotice("");
    choosePanel("response");
    client.send(request);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        view === "pretty" ? content.pretty : content.raw,
      );
      setNotice("Response copied to the system clipboard.");
    } catch {
      setNotice("Clipboard unavailable. Select the response text to copy it.");
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([response.bytes], { type: "application/octet-stream" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "response.bin";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  let savePreview = "";
  let saveProblem = "";
  if (saveConfirm) {
    try {
      savePreview = JSON.stringify(
        {
          request: savedTemplate(request, saveOptions),
          response: saveOptions.response ? responseSnapshot(response) : null,
        },
        null,
        2,
      );
    } catch (error) {
      saveProblem = error.message;
    }
  }
  const saveStatus = !client.saved[request.id]
    ? "Memory only"
    : client.isSaved(request)
      ? "Template saved locally · excluded values stay in memory"
      : "Unsaved changes · earlier template saved locally";
  if (!client.ready)
    return (
      <div className="api-client">
        <p role="status">Loading saved API requests…</p>
      </div>
    );
  return (
    <div
      className="api-client"
      ref={rootRef}
      style={{ "--api-sidebar-width": `${sidebarWidth}px` }}
      data-theme={theme}
      data-layout={layout}
      data-production={resolution.environment?.production || false}
      aria-label="API Client workspace"
      onMouseOverCapture={(e) => {
        const field = e.target;
        if (!(field instanceof HTMLInputElement) || field.closest("dialog"))
          return;
        const title = variableFieldPreview(field.value, previewVariable);
        if (title) {
          field.title = title;
          field.dataset.variablePreview = "true";
        } else if (field.dataset.variablePreview) {
          field.removeAttribute("title");
          delete field.dataset.variablePreview;
        }
      }}
      onKeyDownCapture={(e) => {
        if (
          !visible ||
          importOpen ||
          variablesOpen ||
          runTarget ||
          testDataTarget ||
          exportTarget ||
          e.target.closest("dialog[open]")
        )
          return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          e.stopPropagation();
          setSaveOptions(defaultSaveOptions(response));
          setSaveConfirm(true);
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          if (!execution.pending) send();
        }
      }}
    >
      {variablesOpen && (
        <VariablesDialog
          client={client}
          initialScope={variableContext.scope}
          createEnvironment={variableContext.createEnvironment}
          copyEnvironment={variableContext.copyEnvironment}
          request={request}
          theme={theme}
          onClose={() => setVariablesOpen(false)}
        />
      )}
      {importOpen && (
        <ImportRequests
          initialPreview={forkPreview}
          initialContent={importSeed}
          theme={theme}
          onClose={() => {
            setImportOpen(false);
            setForkPreview(null);
          }}
          onImport={async (preview, persist) => {
            await client.importCollection(preview, persist);
            setNotice(
              `${preview.format === "fork" ? "Forked" : "Imported"} ${preview.requests.length} requests without sending. ${persist ? "Reviewed templates saved locally." : "Request content is session-only; save individual requests to keep them."}`,
            );
          }}
        />
      )}
      <aside className="api-sidebar">
        <label className="api-search">
          <Search size={15} />
          <input
            aria-label="Find API requests"
            placeholder="Find a request…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <CollectionsPanel
          onRun={(id) => {
            const collection = client.collections.find((c) => c.id === id);
            const all = [
              ...client.requests,
              ...Object.values(client.saved)
                .filter((r) => !client.requests.some((q) => q.id === r.id))
                .map((r) => r.request),
            ].filter((r) => r.collectionId === id);
            const ordered = [];
            const walk = (parent) => {
              ordered.push(
                ...all.filter((r) => (r.folderId || null) === parent),
              );
              for (const folder of collection.folders.filter(
                (f) => (f.parentId || null) === parent,
              ))
                walk(folder.id);
            };
            walk(null);
            setRunTarget({ title: collection.name, requests: ordered });
          }}
          onExport={(id) => {
            const collection = client.collections.find((c) => c.id === id);
            const requests = [
              ...client.requests,
              ...Object.values(client.saved)
                .filter((r) => !client.requests.some((q) => q.id === r.id))
                .map((r) => r.request),
            ].filter((r) => r.collectionId === id);
            setExportTarget({ collection, requests });
          }}
          client={client}
          search={search}
          onFork={(id) => {
            try {
              setForkPreview(client.previewFork(id));
              setImportSeed("");
              setImportOpen(true);
            } catch (error) {
              setNotice(error.message);
            }
          }}
          onImport={() => {
            setForkPreview(null);
            setImportSeed("");
            setImportOpen(true);
          }}
          onSelect={(id) => {
            client.reopen(id);
            setNotice("Opened collection request without sending.");
            setSaveConfirm(false);
          }}
        />
        {unfiledDrafts.length > 0 && (
          <SidebarSection
            label="Drafts"
            count={unfiledDrafts.length}
            open={sidebar.drafts}
            onChange={(open) => updateSidebar({ drafts: open })}
          >
            <div className="api-request-list">
              {unfiledDrafts.map((r) => (
                <button
                  key={r.id}
                  className="api-request-item"
                  title={r.name}
                  aria-pressed={r.id === request.id}
                  onKeyDown={(e) => {
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                    ) {
                      e.preventDefault();
                      const index = client.openRequests.findIndex(
                        (q) => q.id === r.id,
                      );
                      const next =
                        e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? client.openRequests.length - 1
                            : (index +
                                (e.key === "ArrowRight" ? 1 : -1) +
                                client.openRequests.length) %
                              client.openRequests.length;
                      select(client.openRequests[next].id);
                      tabsRef.current?.children[next]
                        ?.querySelector("button")
                        ?.focus();
                    }
                  }}
                  onClick={() => select(r.id)}
                >
                  <span className="api-method" data-method={r.method}>
                    {r.method}
                  </span>
                  <span className="api-tree-request-name">{r.name}</span>
                </button>
              ))}
            </div>
          </SidebarSection>
        )}
        <SidebarSection
          label="Saved locally"
          count={savedRequests.length}
          open={sidebar.saved}
          onChange={(open) => updateSidebar({ saved: open })}
        >
          {!savedRequests.length && (
            <p className="api-muted api-small">
              Use Save locally to keep a reviewed template on this device.
            </p>
          )}
          {savedRequests.map((record) => (
            <div className="api-saved-row" key={record.id}>
              <button
                className="api-history-item"
                aria-pressed={record.id === request.id}
                onClick={() => {
                  client.reopen(record.id);
                  setNotice(
                    client.saved[record.id]?.response
                      ? "Opened template with its saved response snapshot. No request was sent. Select Send when you want a fresh result."
                      : "Opened request template. No response was saved with it. Select Send to fetch a response; use Save locally → Include last response snapshot to keep one for next time.",
                  );
                }}
              >
                <span
                  className="api-method"
                  data-method={record.request.method}
                >
                  {record.request.method}
                </span>
                <span className="api-tree-request-name">
                  {client.requests.find((r) => r.id === record.id)?.name ||
                    record.request.name}
                </span>
              </button>
              <button
                className="api-remove-saved"
                aria-label={`Remove saved copy of ${record.request.name}`}
                title="Remove saved copy from this device"
                onClick={async () => {
                  try {
                    await client.removeLocal(record.id);
                    setNotice(
                      "Saved copy removed from this device. Open drafts remain in memory.",
                    );
                  } catch {
                    setNotice("Could not remove the saved copy. Please retry.");
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </SidebarSection>
        <SidebarSection
          label="Environments"
          count={client.variableSettings.environments.length}
          open={sidebar.environments}
          onChange={(open) => updateSidebar({ environments: open })}
        >
          <button
            className="api-environment-item"
            aria-label="Use no environment"
            title="Use global, collection, and request variables without environment overrides"
            aria-pressed={!client.variableSettings.activeId}
            onClick={() => client.selectEnvironment("")}
          >
            <span className="api-tree-request-name">No environment</span>
            {!client.variableSettings.activeId && (
              <Check size={14} aria-hidden="true" />
            )}
          </button>
          <p className="api-environment-help api-muted api-small">
            Environments apply variables for a target such as Dev or Prod.
            Without one, global, collection, and request variables still apply.
          </p>
          {client.variableSettings.environments.map((env) => (
            <div className="api-environment-row" key={env.id}>
              <button
                className="api-environment-item"
                key={env.id}
                title={env.name}
                aria-label={`Use environment ${env.name}`}
                aria-pressed={client.variableSettings.activeId === env.id}
                onClick={() => client.selectEnvironment(env.id)}
              >
                <span className="api-tree-request-name">{env.name}</span>
                {client.variableSettings.activeId === env.id && (
                  <Check size={14} aria-hidden="true" />
                )}
                {env.production && (
                  <span className="api-env-prod">Production</span>
                )}
              </button>
              <EnvironmentMenu
                environment={env}
                onCopy={() => openVariables({ copyEnvironment: env.id })}
                onManage={() => openVariables({ scope: `env:${env.id}` })}
                onDelete={async () => {
                  try {
                    await client.removeEnvironment(env.id);
                    setNotice(`Environment deleted. Requests were unchanged.`);
                  } catch {
                    setNotice(
                      "Could not delete the environment. Please retry.",
                    );
                  }
                }}
              />
            </div>
          ))}
          <div className="api-row api-environment-actions">
            <button
              onClick={() => openVariables({ createEnvironment: true })}
              aria-label="Create environment"
            >
              <Plus size={13} /> New
            </button>
            <button
              onClick={() => openVariables()}
              aria-label="Manage environments"
            >
              Manage
            </button>
          </div>
        </SidebarSection>
        <SidebarSection
          label="History"
          count={client.history.length}
          open={sidebar.history}
          onChange={(open) => updateSidebar({ history: open })}
        >
          <p className="api-muted api-small">Session only · metadata only</p>
          {!client.history.length && (
            <p className="api-muted">Completed requests appear here.</p>
          )}
          {client.history.map((h) => (
            <button
              key={h.id}
              className="api-history-item"
              disabled={!client.requests.some((r) => r.id === h.requestId)}
              onClick={() => {
                select(h.requestId);
                setNotice(
                  "Selected the current draft without sending. History contains metadata only, not an earlier request snapshot.",
                );
              }}
            >
              <span className="api-method" data-method={h.method}>
                {h.method}
              </span>
              <span>
                {h.status} · {Math.round(h.totalMs)} ms
                <br />
                <span className="api-small api-muted">
                  {new Date(h.at).toLocaleTimeString()} · {sizeLabel(h.size)}
                </span>
              </span>
            </button>
          ))}
        </SidebarSection>
        <SidebarSection
          label="Storage & privacy"
          open={sidebar.storage}
          onChange={(open) => updateSidebar({ storage: open })}
        >
          <p>
            Unsaved edits, credentials, history, and responses stay in memory.
            Only explicitly saved templates survive reload.
          </p>
          <button onClick={() => setClearConfirm(true)}>
            <Trash2 size={14} /> Clear API data
          </button>
        </SidebarSection>
      </aside>
      <div
        className="api-sidebar-divider"
        role="separator"
        aria-label="Resize API sidebar"
        title="Drag to resize. Double-click to reset."
        aria-orientation="vertical"
        aria-valuemin={200}
        aria-valuemax={sidebarMax}
        aria-valuenow={Math.round(sidebarWidth)}
        tabIndex={0}
        onDoubleClick={() => updateSidebar({ width: 280 })}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            const rect = rootRef.current.getBoundingClientRect();
            updateSidebar({
              width: Math.max(200, Math.min(sidebarMax, e.clientX - rect.left)),
            });
          }
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            updateSidebar({
              width:
                e.key === "Home"
                  ? 200
                  : e.key === "End"
                    ? sidebarMax
                    : Math.max(
                        200,
                        Math.min(
                          sidebarMax,
                          sidebarWidth + (e.key === "ArrowLeft" ? -16 : 16),
                        ),
                      ),
            });
          }
        }}
      />
      {testDataTarget && (
        <TestDataGenerator
          request={testDataTarget.request}
          target={testDataTarget.target}
          theme={theme}
          aiSettings={aiSettings}
          aiService={aiService}
          onClose={() => setTestDataTarget(null)}
          onApply={(text) => {
            const current = client.requests.find(
              (r) => r.id === testDataTarget.request.id,
            );
            if (
              !current ||
              current.body !== testDataTarget.request.body ||
              current.bodyMode !== testDataTarget.request.bodyMode ||
              current.url !== testDataTarget.request.url ||
              JSON.stringify(current.params) !==
                JSON.stringify(testDataTarget.request.params)
            ) {
              setNotice(
                "Request changed. Generate data again for the current draft.",
              );
              setTestDataTarget(null);
              return;
            }
            if (testDataTarget.target === "body") {
              const editor =
                current.id === request.id && current.bodyMode === "json"
                  ? bodyEditorRef.current?.getView()
                  : null;
              if (editor) {
                editor.dispatch({
                  changes: {
                    from: 0,
                    to: editor.state.doc.length,
                    insert: text,
                  },
                  annotations: isolateHistory.of("full"),
                });
              }
              client.update(current.id, {
                bodyMode: "json",
                body: text,
                headers: current.headers.map((row) =>
                  row.key.toLowerCase() === "content-type"
                    ? { ...row, value: "application/json" }
                    : row,
                ),
              });
            } else {
              const values = JSON.parse(text),
                names = new Set(Object.keys(values));
              const params = [
                ...current.params.filter((r) => !names.has(r.key)),
                ...Object.entries(values).map(([key, value]) =>
                  newRow(key, value === null ? "" : String(value)),
                ),
              ];
              client.update(current.id, {
                params,
                url: applyQuery(current.url, params),
              });
            }
            setTestDataTarget(null);
            setNotice(
              "Generated data applied to the draft. Review it before sending.",
            );
          }}
        />
      )}
      {runTarget && (
        <CollectionRunner
          client={client}
          requests={runTarget.requests}
          title={runTarget.title}
          theme={theme}
          onClose={() => setRunTarget(null)}
        />
      )}
      {exportTarget && (
        <ExportRequests
          theme={theme}
          collection={exportTarget.collection}
          requests={exportTarget.requests}
          onClose={() => setExportTarget(null)}
        />
      )}
      <div className="api-main" ref={mainRef}>
        <div className="api-workspace-heading api-row api-between">
          <div>
            <div className="api-row">
              <h1>API Client</h1>
              <span className="api-beta">Beta</span>
            </div>
          </div>
          <div className="api-header-tools">
            <label>
              Environment
              <select
                aria-label="Active environment"
                value={client.variableSettings.activeId || ""}
                onChange={(e) => client.selectEnvironment(e.target.value)}
              >
                <option value="">No environment</option>
                {client.variableSettings.environments.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => openVariables()}>Variables</button>
            {resolution.environment?.production && (
              <span className="api-production-label">Production</span>
            )}
            <span
              className="api-transport"
              title="Browser transport · CORS restrictions apply"
            >
              <Globe size={13} /> Browser
            </span>
          </div>
        </div>
        {client.storageError && (
          <div className="api-status" role="alert">
            {client.storageError}
          </div>
        )}
        <div className="api-tabs-bar">
          <div className="api-tab-navigation">
            {[
              [ChevronsLeft, "First", 0],
              [
                ChevronLeft,
                "Previous",
                Math.max(
                  0,
                  client.openRequests.findIndex((r) => r.id === request.id) - 1,
                ),
              ],
              [
                ChevronRight,
                "Next",
                Math.min(
                  client.openRequests.length - 1,
                  client.openRequests.findIndex((r) => r.id === request.id) + 1,
                ),
              ],
              [ChevronsRight, "Last", client.openRequests.length - 1],
            ].map(([Icon, name, index]) => (
              <button
                key={name}
                title={`${name} request tab`}
                aria-label={`${name} request tab`}
                disabled={client.openRequests[index]?.id === request.id}
                onClick={() => select(client.openRequests[index].id)}
              >
                <Icon size={15} />
              </button>
            ))}
          </div>
          <div
            className="api-row api-tabs"
            ref={tabsRef}
            aria-label="Open API requests"
            onDoubleClick={(e) => {
              if (e.target === e.currentTarget) client.add();
            }}
          >
            {client.openRequests.map((r) => (
              <div
                key={r.id}
                className="api-tab"
                data-active={r.id === request.id}
                onKeyDown={(e) => {
                  if (
                    e.key === "ContextMenu" ||
                    (e.shiftKey && e.key === "F10")
                  ) {
                    e.preventDefault();
                    const box = e.currentTarget.getBoundingClientRect();
                    setTabMenu({
                      id: r.id,
                      x: box.left,
                      y: box.bottom,
                      trigger: e.target,
                    });
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setTabMenu({
                    id: r.id,
                    x: e.clientX,
                    y: e.clientY,
                    trigger: e.currentTarget.querySelector("button"),
                  });
                }}
                draggable
                onDragStart={(e) => {
                  draggedTab.current = r.id;
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  client.reorderTabs(draggedTab.current, r.id);
                  draggedTab.current = null;
                }}
                onDragEnd={() => {
                  draggedTab.current = null;
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    client.close(r.id);
                  }
                }}
              >
                <button
                  aria-pressed={r.id === request.id}
                  onKeyDown={(e) => {
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                    ) {
                      e.preventDefault();
                      const index = client.openRequests.findIndex(
                        (q) => q.id === r.id,
                      );
                      const next =
                        e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? client.openRequests.length - 1
                            : (index +
                                (e.key === "ArrowRight" ? 1 : -1) +
                                client.openRequests.length) %
                              client.openRequests.length;
                      select(client.openRequests[next].id);
                      tabsRef.current?.children[next]
                        ?.querySelector("button")
                        ?.focus();
                    }
                  }}
                  title={r.name}
                  onClick={() => select(r.id)}
                >
                  {r.name}
                </button>
                <button
                  aria-label={`Close ${r.name}`}
                  onClick={() => client.close(r.id)}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          <TabActions
            client={client}
            activeId={request.id}
            context={tabMenu}
            onClose={() => setTabMenu(null)}
          />
          <button
            className="api-new-request"
            aria-label="New API request"
            title="New request"
            onClick={() => {
              client.add();
              setNotice("");
            }}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="api-request-toolbar">
          <label className="api-name-label">
            Request name
            <input
              aria-label="Request name"
              value={request.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </label>
          <label>
            Collection
            <select
              aria-label="Request collection"
              disabled={client.collectionBusy}
              value={
                client.collections.some((c) => c.id === request.collectionId)
                  ? request.collectionId
                  : ""
              }
              onChange={async (e) => {
                try {
                  await client.moveRequest(request.id, e.target.value);
                } catch {
                  setNotice(
                    "Could not move the request. Local storage was unchanged.",
                  );
                }
              }}
            >
              <option value="">Unfiled</option>
              {client.collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {client.collections.some((c) => c.id === request.collectionId) && (
            <label>
              Folder
              <select
                aria-label="Request folder"
                disabled={client.collectionBusy}
                value={request.folderId || ""}
                onChange={async (e) => {
                  try {
                    await client.moveRequest(
                      request.id,
                      request.collectionId,
                      e.target.value || null,
                    );
                  } catch {
                    setNotice(
                      "Could not move the request. Local storage was unchanged.",
                    );
                  }
                }}
              >
                <option value="">Collection root</option>
                {client.collections
                  .find((c) => c.id === request.collectionId)
                  .folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <div className="api-request-actions">
            <button onClick={() => setExportTarget({ requests: [request] })}>
              Export
            </button>
            <button onClick={() => client.add(request)}>
              <Copy size={14} /> Duplicate
            </button>
            <button
              onClick={() => {
                setSaveOptions(defaultSaveOptions(response));
                setSaveConfirm(true);
              }}
            >
              Save locally
            </button>
            {client.saved[request.id] && (
              <button
                onClick={async () => {
                  try {
                    await client.removeLocal(request.id);
                    setNotice(
                      "Local template deleted. The current draft is still in memory.",
                    );
                  } catch {
                    setNotice(
                      "Could not delete the saved template. Please retry.",
                    );
                  }
                }}
              >
                Remove local copy
              </button>
            )}
          </div>
        </div>
        <div className="api-command-bar">
          <form
            className="api-request-bar"
            onSubmit={(e) => {
              e.preventDefault();
              if (!execution.pending) send();
            }}
          >
            <select
              aria-label="HTTP method"
              className="api-method"
              data-method={request.method}
              value={request.method}
              onChange={(e) => patch({ method: e.target.value })}
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map(
                (m) => (
                  <option key={m}>{m}</option>
                ),
              )}
            </select>
            <input
              title={variableFieldPreview(request.url, previewVariable)}
              aria-label="Request URL"
              placeholder="https://api.example.com/resource"
              onPaste={(e) => {
                const content = e.clipboardData.getData("text");
                if (/^\s*curl\s/.test(content)) {
                  e.preventDefault();
                  setForkPreview(null);
                  setImportSeed(content);
                  setImportOpen(true);
                }
              }}
              autoComplete="off"
              spellCheck={false}
              value={request.url}
              onChange={(e) => {
                patch({
                  url: e.target.value,
                  params: queryRows(e.target.value),
                });
              }}
            />
            {execution.pending ? (
              <button
                type="button"
                className="api-primary"
                onClick={(e) => {
                  e.preventDefault();
                  client.cancel(request.id);
                }}
              >
                <Square size={15} /> Cancel
              </button>
            ) : (
              <button type="submit" className="api-primary">
                <Send size={15} /> Send
              </button>
            )}
          </form>
          <div className="api-row api-between api-small api-muted api-request-help">
            <span>
              <Shield size={13} /> {saveStatus} · no automatic retries
            </span>
            <span>Ctrl / ⌘ + Enter to send</span>
          </div>
          {resolution.error?.code === "variables" && (
            <div className="api-variable-error" role="status">
              {resolution.error.message}{" "}
              <button onClick={() => openVariables()}>Define variables</button>
            </div>
          )}
          {resolution.used.length > 0 && (
            <details className="api-variable-inspector">
              <summary>Variables used · {resolution.used.length}</summary>
              <div className="api-variable-inspection">
                {resolution.used.map((v) => (
                  <div key={v.key}>
                    <code>{"{{" + v.key + "}}"}</code>
                    <span>{v.scope}</span>
                    <span>
                      {v.secret ? "Secret · session only" : v.preview}
                    </span>
                  </div>
                ))}
              </div>
              <p className="api-muted api-small">
                Templates stay unchanged. Secret and secret-derived values are
                never shown here.
              </p>
            </details>
          )}
          {(() => {
            try {
              return resolution.secretDestination ? (
                <span className="api-resolved-destination api-small api-muted">
                  Destination uses a secret variable · hidden
                </span>
              ) : resolution.request?.url ? (
                <span className="api-resolved-destination api-small api-muted">
                  Destination: {new URL(resolution.request.url).origin}
                </span>
              ) : null;
            } catch {
              return null;
            }
          })()}
        </div>
        <div className="api-layout-toolbar api-row api-between">
          {layout === "tabs" ? (
            <div
              className="api-pane-tabs"
              role="tablist"
              aria-label="Request and response"
            >
              {["request", "response"].map((panel) => (
                <button
                  key={panel}
                  id={`api-${panel}-tab`}
                  role="tab"
                  aria-controls={`api-${panel}-pane`}
                  aria-selected={activePanel === panel}
                  tabIndex={activePanel === panel ? 0 : -1}
                  onClick={() => choosePanel(panel)}
                  onKeyDown={(e) => {
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                    ) {
                      e.preventDefault();
                      const next =
                        e.key === "Home"
                          ? "request"
                          : e.key === "End"
                            ? "response"
                            : panel === "request"
                              ? "response"
                              : "request";
                      choosePanel(next);
                      document.getElementById(`api-${next}-tab`)?.focus();
                    }
                  }}
                >
                  {panel === "request" ? "Request" : "Response"}
                  {panel === "response" && (
                    <span className="api-small api-muted">
                      {execution.pending
                        ? "Sending…"
                        : execution.error
                          ? "Error"
                          : response
                            ? `${response.status} · ${Math.round(response.totalMs)} ms · ${sizeLabel(response.size)}${response.savedSnapshot ? " · saved" : ""}`
                            : ""}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <span className="api-muted api-small">
              {layout === "stacked"
                ? "Request above response"
                : "Request and response side by side"}
            </span>
          )}
          <label className="api-layout-select">
            Layout
            <select
              aria-label="API layout"
              value={
                narrow && !["tabs", "stacked"].includes(layoutPreference.mode)
                  ? "compact"
                  : layoutPreference.mode
              }
              onChange={(e) => updateLayout({ mode: e.target.value })}
            >
              {narrow &&
                !["tabs", "stacked"].includes(layoutPreference.mode) && (
                  <option value="compact" disabled>
                    Tabs (narrow screen)
                  </option>
                )}
              <option value="auto">Auto</option>
              <option value="split" disabled={narrow}>
                Split
              </option>
              <option value="tabs">Tabs</option>
              <option value="stacked">Stacked</option>
            </select>
          </label>
        </div>
        <div
          className="api-panes"
          data-layout={layout}
          ref={panesRef}
          style={{ "--api-request-share": `${layoutPreference.ratio}%` }}
        >
          <div
            className="api-request-pane"
            id="api-request-pane"
            role={layout === "tabs" ? "tabpanel" : undefined}
            aria-labelledby={layout === "tabs" ? "api-request-tab" : undefined}
            hidden={layout === "tabs" && activePanel !== "request"}
          >
            {layout === "split" && <h2>Request</h2>}
            <div className="api-section-tabs" aria-label="Request sections">
              {[
                "params",
                "headers",
                "auth",
                "body",
                "assertions",
                "settings",
              ].map((s) => (
                <button
                  key={s}
                  aria-pressed={section === s}
                  onClick={() => setSection(s)}
                >
                  {s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            {section === "assertions" && (
              <AssertionEditor
                rules={request.assertions || []}
                onChange={(assertions) => patch({ assertions })}
              />
            )}
            {section === "params" && (
              <>
                <button
                  onClick={() =>
                    setTestDataTarget({
                      request: structuredClone(request),
                      target: "params",
                    })
                  }
                >
                  Generate test data
                </button>
                <KeyValues
                  rows={params}
                  kind="parameter"
                  onChange={(rows) => {
                    const url = applyQuery(request.url, rows);
                    patch({ url, params: rows });
                  }}
                />
              </>
            )}
            {section === "headers" && (
              <KeyValues
                rows={request.headers}
                kind="header"
                onChange={(headers) => patch({ headers })}
              />
            )}
            {section === "auth" && (
              <div className="api-field-section">
                <label>
                  Authentication
                  <select
                    aria-label="Authentication"
                    value={request.auth}
                    onChange={(e) => {
                      patch({ auth: e.target.value });
                      setShowToken(false);
                    }}
                  >
                    <option value="none">No auth</option>
                    <option value="bearer">Bearer token</option>
                    <option value="basic">Basic auth</option>
                    <option value="apikey">API key</option>
                  </select>
                </label>
                {request.auth === "basic" && (
                  <>
                    <label>
                      Username
                      <input
                        aria-label="Basic username"
                        autoComplete="off"
                        spellCheck={false}
                        value={request.username || ""}
                        onChange={(e) => patch({ username: e.target.value })}
                      />
                    </label>
                    <label>
                      Password
                      <input
                        aria-label="Basic password"
                        type={showToken ? "text" : "password"}
                        autoComplete="new-password"
                        spellCheck={false}
                        value={request.password || ""}
                        onChange={(e) => patch({ password: e.target.value })}
                      />
                    </label>
                  </>
                )}
                {request.auth === "apikey" && (
                  <>
                    <label>
                      Key name
                      <input
                        aria-label="API key name"
                        autoComplete="off"
                        value={request.apiKeyName || ""}
                        onChange={(e) => patch({ apiKeyName: e.target.value })}
                      />
                    </label>
                    <label>
                      Key value
                      <input
                        aria-label="API key value"
                        type={showToken ? "text" : "password"}
                        autoComplete="new-password"
                        spellCheck={false}
                        value={request.apiKeyValue || ""}
                        onChange={(e) => patch({ apiKeyValue: e.target.value })}
                      />
                    </label>
                    <label>
                      Add to
                      <select
                        aria-label="API key location"
                        value={request.apiKeyIn || "header"}
                        onChange={(e) => patch({ apiKeyIn: e.target.value })}
                      >
                        <option value="header">Header</option>
                        <option value="query">Query parameter</option>
                      </select>
                    </label>
                    {request.apiKeyIn === "query" && (
                      <p className="api-muted">
                        Query credentials may appear in server and proxy URL
                        logs. Prefer a header when the API supports it.
                      </p>
                    )}
                  </>
                )}
                {["basic", "apikey"].includes(request.auth) && (
                  <>
                    <button onClick={() => setShowToken((s) => !s)}>
                      {showToken ? "Hide" : "Show"} credential
                    </button>
                    <p className="api-muted">
                      Literal credentials stay in memory. Save variable
                      references such as {"{{password}}"} to reuse secret
                      definitions; re-enter secret values after reload.
                    </p>
                  </>
                )}
                {request.auth === "bearer" && (
                  <>
                    <label>
                      Bearer token
                      <input
                        type={showToken ? "text" : "password"}
                        autoComplete="off"
                        spellCheck={false}
                        value={request.token}
                        onChange={(e) => patch({ token: e.target.value })}
                      />
                    </label>
                    <button onClick={() => setShowToken((s) => !s)}>
                      {showToken ? "Hide" : "Show"} token
                    </button>
                    <p className="api-muted">
                      Memory only. Browser cookies are never included. Bearer
                      tokens are not copied when duplicating a request.
                    </p>
                  </>
                )}
              </div>
            )}
            {section === "body" && (
              <div className="api-field-section">
                <div className="api-row api-between">
                  <label>
                    Body type
                    <select
                      aria-label="Body type"
                      value={request.bodyMode}
                      onChange={(e) => patch({ bodyMode: e.target.value })}
                    >
                      <option value="none">None</option>
                      <option value="json">JSON</option>
                      <option value="text">Text</option>
                      <option value="multipart">Multipart form-data</option>
                      <option value="binary">Binary file</option>
                      <option value="form">Form URL encoded</option>
                    </select>
                  </label>
                  <button
                    onClick={() =>
                      setTestDataTarget({
                        request: structuredClone(request),
                        target: "body",
                      })
                    }
                  >
                    Generate test data
                  </button>
                  {request.bodyMode === "json" && (
                    <button
                      onClick={() => {
                        setNotice("");
                        try {
                          JSON.parse(request.body);
                          const formatted = formatHttpBodyText(request.body);
                          const editor = bodyEditorRef.current?.getView();
                          if (editor) {
                            editor.dispatch({
                              changes: {
                                from: 0,
                                to: editor.state.doc.length,
                                insert: formatted,
                              },
                              annotations: isolateHistory.of("full"),
                            });
                            editor.focus();
                          } else patch({ body: formatted });
                          setNotice(
                            "JSON formatted. Use editor undo to restore previous content.",
                          );
                        } catch {
                          setNotice("Invalid JSON. Your content is unchanged.");
                        }
                      }}
                    >
                      Format JSON
                    </button>
                  )}
                </div>
                {["GET", "HEAD"].includes(request.method) && (
                  <p className="api-muted">
                    {request.method} requests do not send a body. Your draft is
                    preserved.
                  </p>
                )}
                {["multipart", "binary"].includes(request.bodyMode) && (
                  <UploadBodyEditor
                    key={request.id}
                    request={request}
                    onChange={patch}
                  />
                )}
                {request.bodyMode === "form" && (
                  <FormBodyEditor
                    key={`form-${request.id}`}
                    request={request}
                    onChange={patch}
                    theme={theme}
                    variablePreview={previewVariable}
                  />
                )}
                {!["none", "multipart", "binary", "form"].includes(
                  request.bodyMode,
                ) && (
                  <CodeMirrorEditor
                    variablePreview={previewVariable}
                    ref={bodyEditorRef}
                    key={`body-${request.id}`}
                    value={request.body}
                    onChange={(body) => patch({ body })}
                    language={request.bodyMode === "json" ? "json" : "text"}
                    theme={theme}
                    autoFormatOnPaste={false}
                    style={{ minHeight: 180 }}
                  />
                )}
              </div>
            )}
            {section === "settings" && (
              <div className="api-field-section">
                <label>
                  Timeout (seconds)
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={request.timeoutMs / 1000}
                    onChange={(e) =>
                      patch({
                        timeoutMs:
                          Math.max(
                            1,
                            Math.min(120, Number(e.target.value) || 30),
                          ) * 1000,
                      })
                    }
                  />
                </label>
                <p className="api-muted">
                  Redirects are blocked to protect custom credentials. TLS
                  verification is controlled by your browser. Responses are
                  limited to 20 MiB; previews to 1 MiB.
                </p>
              </div>
            )}
          </div>
          {layout === "split" && (
            <div
              className="api-pane-divider"
              role="separator"
              aria-label="Resize request and response"
              aria-orientation="vertical"
              aria-valuemin={30}
              aria-valuemax={70}
              aria-valuenow={Math.round(layoutPreference.ratio)}
              tabIndex={0}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                const rect = panesRef.current.getBoundingClientRect();
                updateLayout({
                  ratio: Math.max(
                    30,
                    Math.min(70, ((e.clientX - rect.left) / rect.width) * 100),
                  ),
                });
              }}
              onPointerUp={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onKeyDown={(e) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                ) {
                  e.preventDefault();
                  updateLayout({
                    ratio:
                      e.key === "Home"
                        ? 30
                        : e.key === "End"
                          ? 70
                          : Math.max(
                              30,
                              Math.min(
                                70,
                                layoutPreference.ratio +
                                  (e.key === "ArrowLeft" ? -2 : 2),
                              ),
                            ),
                  });
                }
              }}
            />
          )}
          <div
            className="api-response-pane"
            id="api-response-pane"
            role={layout === "tabs" ? "tabpanel" : undefined}
            aria-labelledby={layout === "tabs" ? "api-response-tab" : undefined}
            hidden={layout === "tabs" && activePanel !== "response"}
          >
            <section className="api-response" aria-label="API response">
              <div className="api-row api-between">
                <h2>Response</h2>
                {response && (
                  <span className="api-small api-muted">
                    {response.environmentName &&
                      `${response.environmentName} · `}
                    {Math.round(response.totalMs)} ms ·{" "}
                    {sizeLabel(response.size)}
                  </span>
                )}
              </div>
              <div
                className="api-status"
                data-state={
                  execution.error
                    ? "error"
                    : execution.pending
                      ? "pending"
                      : response
                        ? response.status >= 400
                          ? "error"
                          : "success"
                        : "idle"
                }
                role={execution.error ? "alert" : "status"}
              >
                {execution.pending ? (
                  "Sending request… You can cancel at any time."
                ) : execution.error ? (
                  execution.error.message
                ) : execution.notice ? (
                  execution.notice
                ) : response ? (
                  <>
                    <strong>
                      {response.status} {response.statusText}
                    </strong>
                    <span className="api-muted">
                      {" "}
                      ·{" "}
                      {response.savedSnapshot || response.copiedSnapshot
                        ? `${response.copiedSnapshot ? "Copied" : "Saved"} snapshot · ${new Date(response.receivedAt).toLocaleString()}`
                        : "HTTP response received"}
                    </span>
                  </>
                ) : (
                  <>
                    {client.saved[request.id]
                      ? "Request template restored. No response snapshot was saved. Select Send to fetch a response."
                      : "Ready when you are. Enter an API URL and select Send."}
                    <span className="api-muted">
                      {" "}
                      {client.saved[request.id]
                        ? " Re-enter any excluded values or credentials before sending. To keep a response after reload, select Include last response snapshot when saving."
                        : "The sample uses httpbin, a third-party endpoint. Only send data you intend to share with that API."}
                    </span>
                  </>
                )}
              </div>
              {execution.error?.code === "origin" && (
                <button
                  onClick={() => {
                    try {
                      client.approveDestination(request);
                      setNotice(
                        "Destination approved for this draft. Select Send to execute the request.",
                      );
                    } catch {
                      setNotice(
                        "Check variable values and the destination URL before approving it.",
                      );
                    }
                  }}
                >
                  Approve destination for this draft
                </button>
              )}
              {response && (
                <>
                  {(response.savedSnapshot || response.copiedSnapshot) && (
                    <p className="api-warning">
                      {response.copiedSnapshot ? "Copied" : "Saved"} response
                      from a previous send, not a fresh API result. It may
                      differ from the current request. Known credential response
                      headers are omitted.
                    </p>
                  )}
                  <div className="api-section-tabs" aria-label="Response views">
                    {["pretty", "raw", "headers", "compare", "assertions"].map(
                      (v) => (
                        <button
                          key={v}
                          aria-pressed={view === v}
                          onClick={() => setView(v)}
                        >
                          {v === "assertions"
                            ? "Assertions"
                            : v === "compare"
                              ? "Compare"
                              : v === "headers"
                                ? "HTTP headers"
                                : v === "pretty"
                                  ? "Body · Pretty"
                                  : "Body · Raw"}
                        </button>
                      ),
                    )}
                  </div>
                  {view === "assertions" ? (
                    <AssertionResults results={execution.assertionResults} />
                  ) : view === "compare" ? (
                    <ResponseComparison
                      key={`${request.id}-${response.receivedAt}-${client.savedResponse?.receivedAt}`}
                      baseline={client.savedResponse}
                      current={response}
                    />
                  ) : view === "headers" ? (
                    <>
                      <p className="api-muted api-small">
                        These are HTTP response headers exposed to this page by
                        your browser. CORS permission headers such as
                        Access-Control-Allow-Origin and Set-Cookie may be hidden
                        here even when the request succeeds.
                      </p>
                      <details className="api-header-help">
                        <summary>Where are the full response headers?</summary>
                        <p>
                          Open browser Developer Tools → Network, send the
                          request, select it, and open Headers → Response
                          Headers. The API can expose additional readable
                          headers with Access-Control-Expose-Headers. A JSON
                          body's “headers” field (such as httpbin's echo)
                          describes the request the server received, not these
                          HTTP response headers.
                        </p>
                      </details>
                      {!response.headers.length && (
                        <p className="api-muted">
                          No response headers were exposed to this page.
                        </p>
                      )}
                      <div className="api-header-table">
                        {response.headers.map(([k, v]) => (
                          <div key={k}>
                            <code>{k}</code>
                            <span>{v}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : content.binary ? (
                    <div className="api-field-section">
                      <p>Binary response · {response.contentType}</p>
                      <p className="api-muted">
                        Download the response to inspect it. Active previews are
                        disabled.
                      </p>
                      <button onClick={download}>Download response</button>
                    </div>
                  ) : (
                    <>
                      {response.size > DISPLAY_LIMIT && (
                        <p className="api-warning">
                          Preview truncated to 1 MiB. Download contains the
                          complete received response.
                        </p>
                      )}
                      <p className="api-muted api-small">
                        Response body ·{" "}
                        {view === "pretty"
                          ? "formatted for reading"
                          : "decoded text"}
                        . Any “headers” object inside this content is part of
                        the body; inspect HTTP headers in the separate tab.
                      </p>
                      <ResponseValues
                        key={`${request.id}-${response.receivedAt}`}
                        tooLarge={response.size > DISPLAY_LIMIT}
                        source={
                          response.size <= DISPLAY_LIMIT ? content.raw : ""
                        }
                        client={client}
                        request={request}
                        theme={theme}
                      />
                      <label className="api-response-search">
                        Find in response
                        <input
                          aria-label="Find in response"
                          placeholder="Search response text…"
                          value={responseSearch}
                          onChange={(e) => setResponseSearch(e.target.value)}
                        />
                      </label>
                      <CodeMirrorEditor
                        key={`${request.id}-${view}`}
                        value={view === "pretty" ? content.pretty : content.raw}
                        readOnly
                        searchTerm={responseSearch}
                        language={view === "pretty" ? content.language : "text"}
                        theme={theme}
                        style={{ minHeight: 220 }}
                      />
                      <div className="api-row api-response-actions">
                        <button onClick={copy}>
                          <Copy size={14} /> Copy{" "}
                          {response.size > DISPLAY_LIMIT
                            ? "preview"
                            : "response"}
                        </button>
                        <button
                          onClick={() =>
                            onOpenResponse(
                              view === "pretty" ? content.pretty : content.raw,
                              content.language,
                            )
                          }
                        >
                          <FileCode size={14} /> Open in editor
                        </button>
                        <button onClick={download}>Download bytes</button>
                      </div>
                      <p className="api-muted api-small">
                        Open in editor creates a temporary editable copy. Use
                        Save in Code to keep it as a file.
                      </p>
                    </>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
        {saveConfirm && (
          <div
            className="api-confirm"
            role="dialog"
            aria-modal="false"
            aria-label="Save API request locally"
            ref={saveDialogRef}
          >
            <strong>Review what will be saved on this device</strong>

            <p>
              Request details and an available response snapshot are selected by
              default. Deselect anything you do not want saved on this device.
              Literal authentication credentials and known credential headers
              are always omitted. Response bodies may still contain echoed
              credentials. There is no cloud sync or automatic saving.
            </p>
            <p className="api-warning">
              Included values are stored as readable local data, not encrypted
              secrets. Paths, custom fields, or bodies may contain credentials
              or personal data. Review the exact preview before saving.
            </p>
            <div className="api-save-options">
              {[
                ["query", "Include query values"],
                ["headers", "Include other header values"],
                ["body", "Include request body"],
                [
                  "assertions",
                  "Include assertions (expected values may contain private data)",
                ],
                [
                  "response",
                  "Include last response snapshot (body, readable headers, status, timing)",
                ],
              ].map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={saveOptions[key]}
                    disabled={
                      saving ||
                      (key === "response" &&
                        (!response || response.bytes.length > DISPLAY_LIMIT))
                    }
                    onChange={(e) =>
                      setSaveOptions((o) => ({ ...o, [key]: e.target.checked }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="api-muted api-small">
              File bytes and file names are never included in local templates;
              reselect uploads after reload. File/block variable values are
              session-only; templates keep their references. Response snapshots
              are optional, stored locally as readable data, and limited to 1
              MiB. Bodies may contain tokens or personal data; review the
              response before including it. Known credential response headers
              are removed. Existing templates cannot recover responses that were
              never saved.
            </p>
            {saveProblem ? (
              <p role="alert">{saveProblem}</p>
            ) : (
              <label>
                Local storage preview
                <textarea
                  aria-label="Local storage preview"
                  readOnly
                  value={savePreview}
                  rows={10}
                />
              </label>
            )}
            <div className="api-row">
              <button
                disabled={saving || !!saveProblem}
                className="api-primary"
                onClick={async () => {
                  setSaving(true);
                  try {
                    await client.saveLocal(request, saveOptions);
                    setSaveConfirm(false);
                    setNotice(
                      "Reviewed template saved locally. Credentials and excluded fields remain session-only.",
                    );
                  } catch {
                    setNotice(
                      "Could not save locally. Your draft is still in memory. Check storage availability and retry.",
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Saving…" : "Save reviewed template"}
              </button>
              <button disabled={saving} onClick={() => setSaveConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {clearConfirm && (
          <div
            className="api-confirm"
            role="dialog"
            aria-modal="false"
            aria-label="Clear API session"
          >
            <strong>
              Clear saved templates, collections, environments, variables,
              drafts, credentials, history, and responses?
            </strong>
            <p>
              This cannot be undone. Copies already opened in the editor or
              downloaded are unaffected.
            </p>
            <div className="api-row">
              <button
                onClick={async () => {
                  try {
                    await client.clear();
                    setSaveConfirm(false);
                    setClearConfirm(false);
                    setNotice("All local API data cleared.");
                  } catch {
                    setNotice(
                      "Could not clear saved API data. Please retry. Your current session is unchanged.",
                    );
                  }
                }}
              >
                Clear all API data
              </button>
              <button onClick={() => setClearConfirm(false)}>
                Keep session
              </button>
            </div>
          </div>
        )}
        <div className="api-notice" role="status">
          {notice || client.variableNotice}
        </div>
      </div>
    </div>
  );
}

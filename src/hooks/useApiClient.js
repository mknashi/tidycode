import { retainExecution } from "../services/http/executionRetention.js";
import {
  evaluateAssertions,
  validateAssertions,
} from "../services/http/assertions.js";
import { assignResponseVariable } from "../services/http/responseValues.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createRequest,
  historySummary,
  prepareRequest,
  HttpError,
} from "../services/http/request.js";
import {
  emptyVariables,
  validateVariables,
  resolveVariables,
} from "../services/http/variables.js";
import { buildForkPreview } from "../services/http/fork.js";
import { sendBrowserRequest } from "../services/http/webTransport.js";

import {
  apiStore,
  savedTemplate,
  templateSignature,
  responseSnapshot,
  restoreResponse,
} from "../services/http/store.js";

export function useApiClient() {
  const [requests, setRequests] = useState(() => [
    createRequest({
      name: "First request",
      url: "https://httpbin.org/get",
    }),
  ]);
  const [variableSettings, setVariableSettings] = useState(emptyVariables);
  const [variableNotice, setVariableNotice] = useState("");
  const [closedIds, setClosedIds] = useState(() => new Set());
  const [collectionBusy, setCollectionBusy] = useState(false);
  const [collections, setCollections] = useState([]);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState({});
  const [storageError, setStorageError] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [executions, setExecutions] = useState({});
  const [history, setHistory] = useState([]);
  const controllers = useRef(new Map());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controllers.current.forEach(({ controller }) => controller.abort());
      controllers.current.clear();
    };
  }, []);
  useEffect(() => {
    let live = true;
    apiStore
      .load()
      .then(
        ({ records, workspace, collections: loadedCollections, variables }) => {
          if (!live) return;
          const byId = Object.fromEntries(records.map((r) => [r.id, r]));
          setSaved(byId);
          setCollections(loadedCollections);
          setVariableSettings(variables);
          const ids = Array.isArray(workspace?.openIds)
            ? workspace.openIds.filter(
                (id) => typeof id === "string" && Object.hasOwn(byId, id),
              )
            : records.map((r) => r.id);
          const restored = [...new Set(ids)].map((id) =>
            createRequest(byId[id].request),
          );
          if (restored.length) setRequests(restored);
          setActiveId(
            typeof workspace?.activeId === "string" ? workspace.activeId : null,
          );
        },
      )
      .catch(() => {
        if (live)
          setStorageError(
            "Saved requests could not be restored. Existing stored data was left untouched. You can continue in memory; reload to retry.",
          );
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);
  const openRequests = requests.filter((r) => !closedIds.has(r.id));
  const savedOpenIds = JSON.stringify(
    openRequests.filter((r) => saved[r.id]).map((r) => r.id),
  );
  useEffect(() => {
    if (!ready || storageError) return;
    apiStore
      .workspace({ openIds: JSON.parse(savedOpenIds), activeId })
      .catch(() =>
        setStorageError(
          "Could not save tab state. Your requests remain in memory.",
        ),
      );
  }, [ready, savedOpenIds, activeId, storageError]);
  const saveLocal = async (request, options) => {
    const record = {
      version: 1,
      id: request.id,
      request: savedTemplate(request, options),
      options,
      response: options.response
        ? responseSnapshot(
            executions[request.id]?.response ||
              restoreResponse(saved[request.id]?.response),
          )
        : null,
    };
    await apiStore.save(record, {
      openIds: openRequests
        .filter((r) => saved[r.id] || r.id === request.id)
        .map((r) => r.id),
      activeId: request.id,
    });
    setSaved((s) => ({ ...s, [request.id]: record }));
    setStorageError("");
  };
  const removeLocal = async (id) => {
    await apiStore.remove(id);
    setSaved((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
  };
  const active =
    openRequests.find((r) => r.id === activeId) ||
    openRequests[0] ||
    requests[0];
  const savedResponse = saved[active.id]?.response;
  const restoredResponse = useMemo(
    () => restoreResponse(savedResponse),
    [savedResponse],
  );
  const update = useCallback(
    (id, patch) =>
      setRequests((rs) =>
        rs.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      ),
    [],
  );
  const add = useCallback((copy, location = {}) => {
    const r = createRequest(
      copy
        ? {
            ...copy,
            id: crypto.randomUUID(),
            name: `${copy.name} copy`,
            token: "",
            username: "",
            password: "",
            apiKeyValue: "",
            auth: "none",
            credentialOrigin: "",
          }
        : location,
    );
    setRequests((rs) => [...rs, r]);
    setActiveId(r.id);
    return r;
  }, []);
  const cancel = useCallback((id) => {
    const running = controllers.current.get(id);
    if (!running) return;
    // Invalidate before abort: even a delayed transport cannot publish a stale success.
    controllers.current.delete(id);
    running.controller.abort();
    setExecutions((es) => ({
      ...es,
      [id]: {
        pending: false,
        error: new HttpError(
          "cancelled",
          "Request cancelled. The server may still have processed it.",
        ),
      },
    }));
  }, []);
  const closeTabs = (tabIds) => {
    const ids = new Set(tabIds);
    if (!ids.size) return;
    for (const id of ids) {
      cancel(id);
      controllers.current.delete(id);
    }
    const remaining = openRequests.filter((r) => !ids.has(r.id));
    const blank = remaining.length ? null : createRequest();
    setRequests((rs) => [
      ...rs.filter((r) => !ids.has(r.id) || r.collectionId),
      ...(blank ? [blank] : []),
    ]);
    setClosedIds((old) => new Set([...old, ...ids]));
    if (blank) setActiveId(blank.id);
    else if (ids.has(activeId)) setActiveId(remaining[0].id);
    setExecutions((es) =>
      Object.fromEntries(Object.entries(es).filter(([id]) => !ids.has(id))),
    );
  };
  const close = (id) => closeTabs([id]);
  const send = useCallback(
    async (request, runtimeSettings = variableSettings) => {
      // Resolve and validate before execution. No credentials are persisted or logged.
      let prepared;
      let resolved;
      try {
        validateAssertions(request.assertions || []);
        const result = resolveVariables(request, runtimeSettings);
        if (result.error) throw result.error;
        resolved = result.request;
        try {
          prepared = prepareRequest(resolved);
        } catch (error) {
          if (error.code === "origin" && result.secretDestination)
            throw new HttpError(
              "origin",
              "The destination changed and its URL uses a secret. Review your variables before approving this destination.",
            );
          throw error;
        }
      } catch (error) {
        setExecutions((es) => ({
          ...es,
          [request.id]: { error, pending: false },
        }));
        return { ok: false, error };
      }
      if (
        !controllers.current.has(request.id) &&
        controllers.current.size >= 4
      ) {
        setExecutions((es) => ({
          ...es,
          [request.id]: {
            pending: false,
            error: new HttpError(
              "limit",
              "Four requests are already running. Cancel one or wait before sending another.",
            ),
          },
        }));
        return {
          ok: false,
          error: new HttpError("limit", "Four requests are already running."),
        };
      }
      cancel(request.id);
      const controller = new AbortController();
      const executionId = crypto.randomUUID();
      controllers.current.set(request.id, { controller, executionId });
      update(request.id, { credentialOrigin: prepared.url.origin });
      const current = () =>
        mounted.current &&
        controllers.current.get(request.id)?.executionId === executionId;
      setExecutions((es) => ({ ...es, [request.id]: { pending: true } }));
      try {
        const response = await sendBrowserRequest(resolved, {
          signal: controller.signal,
        });
        if (!current()) return;
        response.receivedAt = Date.now();
        response.environmentName =
          runtimeSettings.environments.find(
            (e) => e.id === runtimeSettings.activeId,
          )?.name || "No environment";
        const assertionResults = evaluateAssertions(
          request.assertions || [],
          response,
        );
        setExecutions((es) =>
          retainExecution(es, request.id, {
            pending: false,
            response,
            assertionResults,
          }),
        );
        setHistory((h) =>
          [historySummary(request, response), ...h].slice(0, 200),
        );
        return {
          response,
          assertionResults,
          ok:
            response.status < 400 &&
            assertionResults.every((result) => result.state !== "failed"),
        };
      } catch (error) {
        if (current())
          setExecutions((es) => ({
            ...es,
            [request.id]: { pending: false, error },
          }));
        return { ok: false, error };
      } finally {
        if (current()) controllers.current.delete(request.id);
      }
    },
    [cancel, update, variableSettings],
  );
  const clear = useCallback(async () => {
    await apiStore.clear();
    setSaved({});
    setCollections([]);
    setVariableSettings(emptyVariables());
    setVariableNotice("");
    setClosedIds(new Set());
    setStorageError("");
    controllers.current.forEach(({ controller }) => controller.abort());
    controllers.current.clear();
    setRequests([createRequest()]);
    setExecutions({});
    setHistory([]);
    setActiveId(null);
  }, []);
  const organize = async (next, patches = {}) => {
    const records = Object.entries(patches)
      .filter(([id]) => saved[id])
      .map(([id, patch]) => ({
        ...saved[id],
        request: { ...saved[id].request, ...patch },
      }));
    setCollectionBusy(true);
    try {
      await apiStore.organize(next, records);
      setCollections(next);
      setRequests((rs) =>
        rs.map((r) => (patches[r.id] ? { ...r, ...patches[r.id] } : r)),
      );
      setSaved((s) => {
        const copy = { ...s };
        records.forEach((r) => {
          copy[r.id] = r;
        });
        return copy;
      });
    } finally {
      setCollectionBusy(false);
    }
  };
  const moveRequest = async (id, collectionId, folderId = null) =>
    organize(collections, {
      [id]: { collectionId: collectionId || null, folderId },
    });
  const importCollection = async (preview, persist) => {
    preview = {
      ...preview,
      collection: { ...preview.collection, sourceFormat: preview.format },
    };
    const records = persist
      ? preview.requests.map((r) => ({
          version: 1,
          id: r.id,
          request: savedTemplate(r, { query: true, headers: true, body: true }),
          options: {
            query: true,
            headers: true,
            body: true,
            response: !!preview.responseSnapshots?.[r.id],
          },
          response: preview.responseSnapshots?.[r.id] || null,
        }))
      : [];
    const next = [...collections, preview.collection];
    await apiStore.organize(next, records);
    setCollections(next);
    setRequests((rs) => [...rs, ...preview.requests]);
    setClosedIds(
      (ids) => new Set([...ids, ...preview.requests.slice(1).map((r) => r.id)]),
    );
    setSaved((s) => ({
      ...s,
      ...Object.fromEntries(records.map((r) => [r.id, r])),
    }));
    if (!persist && preview.responseSnapshots)
      setExecutions((es) => ({
        ...es,
        ...Object.fromEntries(
          Object.entries(preview.responseSnapshots).map(([id, snapshot]) => [
            id,
            {
              pending: false,
              response: {
                ...restoreResponse(snapshot),
                savedSnapshot: false,
                copiedSnapshot: true,
              },
            },
          ]),
        ),
      }));
    if (preview.requests.length) setActiveId(preview.requests[0].id);
  };
  return {
    requests,
    executions,
    openRequests,
    selectionRevision,
    reorderTabs: (from, to) =>
      setRequests((previous) => {
        if (!from || from === to) return previous;
        const moving = previous.find((r) => r.id === from);
        if (!moving || !previous.some((r) => r.id === to)) return previous;
        const next = previous.filter((r) => r.id !== from);
        next.splice(
          next.findIndex((r) => r.id === to),
          0,
          moving,
        );
        return next;
      }),
    collections,
    collectionBusy,
    organize,
    moveRequest,
    importCollection,
    previewFork: (id) => {
      const collection = collections.find((c) => c.id === id);
      if (!collection) throw new Error("Collection is no longer available.");
      const all = [
        ...requests,
        ...Object.values(saved)
          .filter((r) => !requests.some((q) => q.id === r.id))
          .map((r) => r.request),
      ];
      const responses = Object.fromEntries(
        all.map((r) => [
          r.id,
          executions[r.id]?.response || saved[r.id]?.response,
        ]),
      );
      const preview = buildForkPreview(collection, all, responses);
      if (
        variableSettings.collections[id]?.length ||
        all.some(
          (r) =>
            r.collectionId === id && variableSettings.requests[r.id]?.length,
        )
      )
        preview.warnings.push(
          "Collection/request variable overrides are not copied. Configure these scopes for the fork; global and selected environment variables remain available.",
        );
      return preview;
    },
    variableSettings,
    variableNotice,
    inspectVariables: (request) => resolveVariables(request, variableSettings),
    selectEnvironment: (id) => {
      setVariableSettings((s) => ({ ...s, activeId: id || null }));
      apiStore
        .selectEnvironment(id || null)
        .catch(() =>
          setVariableNotice(
            "Environment selected for this session. Its selection could not be saved locally.",
          ),
        );
    },
    removeEnvironment: async (id) => {
      await apiStore.removeEnvironment(id);
      setVariableSettings((s) => ({
        ...s,
        environments: s.environments.filter((e) => e.id !== id),
        activeId: s.activeId === id ? null : s.activeId,
      }));
    },
    saveResponseVariable: async (
      scope,
      row,
      persist,
      overwrite,
      target = active,
    ) => {
      const next = assignResponseVariable(
        variableSettings,
        scope,
        target,
        row,
        overwrite,
      );
      if (persist)
        await apiStore.responseVariable(
          scope,
          target,
          row,
          overwrite,
          variableSettings.environments.find((e) => "env:" + e.id === scope),
        );
      setVariableSettings(next);
    },
    importEnvironments: async (environments, persist) => {
      const next = validateVariables({
        ...variableSettings,
        environments: [...variableSettings.environments, ...environments],
      });
      if (persist) await apiStore.importEnvironments(environments);
      setVariableSettings(next);
    },
    applyVariables: async (settings, persist) => {
      const clean = validateVariables(settings);
      if (persist) await apiStore.variables(clean);
      setVariableSettings(clean);
      setVariableNotice(
        persist
          ? "Variable settings saved locally. Secret values remain session-only."
          : "Variable settings applied for this session only.",
      );
    },
    approveDestination: (request) => {
      const result = resolveVariables(request, variableSettings);
      if (result.error) throw result.error;
      const url = new URL(result.request.url);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error(
          "Use an HTTP(S) destination without embedded credentials.",
        );
      update(request.id, { credentialOrigin: url.origin });
    },
    ready,
    saved,
    storageError,
    saveLocal,
    removeLocal,
    reopen: (id) => {
      setSelectionRevision((n) => n + 1);
      if (!requests.some((r) => r.id === id) && saved[id])
        setRequests((rs) => [...rs, createRequest(saved[id].request)]);
      setClosedIds((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
      setActiveId(id);
    },
    isSaved: (request) => {
      const record = saved[request.id];
      try {
        return (
          !!record &&
          templateSignature(savedTemplate(request, record.options)) ===
            templateSignature(record.request)
        );
      } catch {
        return false;
      }
    },
    active,
    select: (id) => {
      setSelectionRevision((n) => n + 1);
      setClosedIds((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
      setActiveId(id);
    },
    update,
    add,
    close,
    closeTabs,
    send,
    cancel,
    clear,
    history,
    savedResponse: restoredResponse,
    execution:
      executions[active.id] ||
      (saved[active.id]?.response
        ? {
            pending: false,
            response: restoredResponse,
          }
        : {}),
  };
}

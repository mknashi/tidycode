import HttpOutlineActions from "./HttpOutlineActions";
import React, { useState, useRef, useEffect } from "react";
import { Play, ArrowUpRight, Plus, Search, X } from "lucide-react";
export default function HttpRequestOutline({
  outline,
  error,
  cursorLine,
  theme,
  onJump,
  onOpen,
  onSend,
  onInsert,
  ready = true,
  environments = [],
  activeEnvironment = "",
  onEnvironment,
  onVariables,
  onImportEnvironments,
  onEdit,
  onExtract,
  onRun,
}) {
  const [search, setSearch] = useState("");
  const dark = theme === "dark";
  const matched = outline.filter((item) =>
    `${item.name} ${item.method}`.toLowerCase().includes(search.toLowerCase()),
  );
  const active = outline.find(
    (item) => cursorLine >= item.startLine && cursorLine <= item.endLine,
  );
  const list = useRef(null);
  useEffect(() => {
    list.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active?.blockIndex, search]);
  const button = `inline-flex items-center gap-1 px-1.5 py-1 rounded text-xs ${dark ? "hover:bg-gray-700 text-gray-300" : "hover:bg-gray-200 text-gray-700"}`;
  return (
    <section
      aria-label="HTTP request outline"
      className={`flex flex-col h-full min-h-0 min-w-0 ${dark ? "bg-gray-900 text-gray-200" : "bg-gray-50 text-gray-800"}`}
    >
      <div
        className={`flex items-center justify-between gap-2 px-2 py-1 border-b ${dark ? "border-gray-800" : "border-gray-200"}`}
      >
        <h2 className="text-xs font-semibold">
          HTTP requests <span className="opacity-60">{outline.length}</span>
        </h2>
        <button
          className={button}
          aria-label="Insert HTTP request"
          title="Insert an editable request template"
          onClick={() => {
            setSearch("");
            onInsert();
          }}
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="px-2 pt-2 text-xs flex flex-wrap gap-1">
        <select
          aria-label="Insert HTTP template"
          className={`min-w-0 rounded border px-1 ${dark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"}`}
          value=""
          onChange={(e) => {
            if (e.target.value) {
              setSearch("");
              onInsert(e.target.value);
            }
          }}
        >
          <option value="">Templates…</option>
          <option value="get">GET</option>
          <option value="json">POST JSON</option>
          <option value="form">POST form</option>
          <option value="bearer">Bearer auth</option>
          <option value="multipart">Multipart upload</option>
          <option value="binary">Binary upload</option>
        </select>
        <button
          className={button}
          disabled={!outline.length || !ready}
          onClick={onRun}
        >
          Run file
        </button>
      </div>
      <div className="px-2 py-1 text-xs">
        <label className="flex items-center gap-2">
          <span className="shrink-0 opacity-70">Env</span>
          <select
            aria-label="HTTP editor environment"
            disabled={!ready}
            className={`w-full min-w-0 rounded border px-1 py-1 ${dark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"}`}
            value={activeEnvironment}
            onChange={(e) => onEnvironment(e.target.value)}
          >
            <option value="">No environment</option>
            {environments.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name}
                {env.production ? " · Production" : ""}
              </option>
            ))}
          </select>
        </label>
        {environments.find((env) => env.id === activeEnvironment)
          ?.production && (
          <p className="text-amber-500 font-semibold mt-1">
            Production environment
          </p>
        )}
        <div className="flex flex-wrap gap-1 mt-1">
          <button className={button} disabled={!ready} onClick={onVariables}>
            Variables
          </button>
          <button
            className={button}
            disabled={!ready}
            onClick={onImportEnvironments}
          >
            Import env
          </button>
        </div>
      </div>
      <label
        className={`flex items-center gap-2 mx-2 px-2 py-1 border rounded ${dark ? "border-gray-700" : "border-gray-300"}`}
      >
        <Search size={13} />
        <input
          aria-label="Find HTTP requests in file"
          placeholder="Find a request…"
          className="bg-transparent min-w-0 w-full text-xs outline-none"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div ref={list} className="flex-1 min-h-0 overflow-y-auto px-2 py-1">
        {error && (
          <p role="status" className="text-xs opacity-70">
            {error}
          </p>
        )}
        {!error && !outline.length && (
          <p className="text-xs opacity-70">
            No requests yet. Use + to insert a template, then edit its URL.
            Separate requests with ###.
          </p>
        )}
        {matched.slice(0, 200).map((item) => (
          <div
            key={item.blockIndex}
            data-active={active?.blockIndex === item.blockIndex}
            className={`flex items-center gap-0.5 rounded border ${active?.blockIndex === item.blockIndex ? (dark ? "bg-indigo-500/15 border-indigo-400/40" : "bg-indigo-50 border-indigo-300") : "border-transparent"}`}
          >
            <button
              className={`flex items-center gap-2 flex-1 min-w-0 px-1.5 py-1.5 text-left rounded ${dark ? "hover:bg-gray-800" : "hover:bg-gray-100"}`}
              aria-label={`Go to HTTP request ${item.name}`}
              aria-current={
                active?.blockIndex === item.blockIndex ? "true" : undefined
              }
              onClick={() => onJump(item)}
            >
              <span
                className={`font-mono text-[10px] font-semibold ${item.method === "GET" ? (dark ? "text-emerald-300" : "text-emerald-700") : dark ? "text-blue-300" : "text-blue-700"}`}
              >
                {item.method}
              </span>
              <span
                className="truncate text-xs"
                title={`${item.name} · Line ${item.line}`}
              >
                {item.name}
              </span>
            </button>
            <div className="flex shrink-0 items-center pr-1">
              <HttpOutlineActions
                item={item}
                theme={theme}
                onEdit={onEdit}
                onExtract={onExtract}
              />
              <button
                className={button}
                title={`Open ${item.name} in API client`}
                aria-label={`Open HTTP request ${item.name}`}
                onClick={() => onOpen(item)}
              >
                <ArrowUpRight size={12} />
              </button>
              <button
                className={`${button} ${dark ? "text-indigo-300" : "text-indigo-700"}`}
                title={`Send ${item.name}`}
                aria-label={`Send HTTP request ${item.name}`}
                onClick={() => onSend(item)}
              >
                <Play size={12} />
              </button>
              <button
                className={`${button} hover:text-red-500`}
                title={`Delete ${item.name} from file (Undo to restore)`}
                aria-label={`Delete HTTP request ${item.name}`}
                onClick={() => onEdit(item, "delete")}
              >
                <X size={12} />
              </button>
            </div>
          </div>
        ))}
        {matched.length > 200 && (
          <p className="text-xs opacity-70">
            Showing the first 200 matches. Narrow your search or use the editor
            cursor and toolbar.
          </p>
        )}
        {!error && outline.length > 0 && matched.length === 0 && (
          <p className="text-xs opacity-70">No matching requests.</p>
        )}
      </div>
      <details className="text-xs opacity-70 px-3 pb-2">
        <summary className="cursor-pointer">Help & shortcuts</summary>
        <p className="pt-1 leading-relaxed">
          Select a request to jump to its source. Open reviews it in the API
          client; Send executes once.
          <br />
          Send: Ctrl/⌘ + Alt + R<br />
          Open: Ctrl/⌘ + Alt + O<br />
          Right-click or Shift+F10 for actions at the cursor.
        </p>
      </details>
    </section>
  );
}

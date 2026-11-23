import React, { useEffect, useRef, useState } from "react";
import {
  Plus,
  Upload,
  MoreHorizontal,
  ChevronRight,
  Folder,
} from "lucide-react";
export default function CollectionsPanel({
  client,
  search,
  onSelect,
  onImport,
  onFork,
  onExport,
  onRun,
}) {
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const menuRef = useRef(null);
  const menuTriggerRef = useRef(null);
  const [menu, setMenu] = useState(null);
  const [expanded, setExpanded] = useState(() => {
    try {
      const value = JSON.parse(
        localStorage.getItem("tidycode-api-tree-v1") || "{}",
      );
      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    } catch {
      return {};
    }
  });
  const setOpen = (id, open) =>
    setExpanded((old) => {
      const next = { ...old, [id]: open };
      try {
        localStorage.setItem("tidycode-api-tree-v1", JSON.stringify(next));
      } catch {}
      return next;
    });
  const hideMenu = () => {
    menuRef.current?.hidePopover();
    setMenu(null);
  };
  useEffect(() => {
    const node = menuRef.current;
    const toggle = () => {
      if (!node.matches(":popover-open")) setMenu(null);
    };
    node.addEventListener("toggle", toggle);
    return () => node.removeEventListener("toggle", toggle);
  }, []);
  useEffect(() => {
    if (menu) {
      if (!menuRef.current.matches(":popover-open"))
        menuRef.current.showPopover();
      menuRef.current.querySelector("button")?.focus();
    }
  }, [menu]);
  const showMenu = (event, collection, folder = null) => {
    event.preventDefault();
    event.stopPropagation();
    menuTriggerRef.current = event.currentTarget;
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({
      collection,
      folder,
      left: Math.max(8, Math.min(rect.right - 184, window.innerWidth - 192)),
      top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 258)),
    });
  };
  const activePath = new Set([client.active.collectionId]);
  const activeCollection = client.collections.find(
    (c) => c.id === client.active.collectionId,
  );
  let activeFolder = activeCollection?.folders.find(
    (f) => f.id === client.active.folderId,
  );
  while (activeFolder && !activePath.has(activeFolder.id)) {
    activePath.add(activeFolder.id);
    activeFolder = activeCollection.folders.find(
      (f) => f.id === activeFolder.parentId,
    );
  }
  const activePathKey = JSON.stringify([...activePath].filter(Boolean));
  useEffect(() => {
    // Reveal on selection or reassignment, while allowing manual collapse afterward.
    const path = JSON.parse(activePathKey);
    if (!path.length) return;
    setExpanded((old) => {
      if (path.every((id) => old[id] === true)) return old;
      const next = {
        ...old,
        ...Object.fromEntries(path.map((id) => [id, true])),
      };
      try {
        localStorage.setItem("tidycode-api-tree-v1", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [client.active.id, client.selectionRevision, activePathKey]);
  const isOpen = (id) =>
    search.trim()
      ? true
      : Object.hasOwn(expanded, id)
        ? expanded[id]
        : activePath.has(id);

  const all = [
    ...client.requests,
    ...Object.values(client.saved)
      .filter((r) => !client.requests.some((q) => q.id === r.id))
      .map((r) => r.request),
  ];
  const run = async (action) => {
    setBusy(true);
    setError("");
    try {
      await action();
      setEdit(null);
    } catch {
      setError(
        "Could not update collections. Check local storage and retry. No requests were deleted.",
      );
    } finally {
      setBusy(false);
    }
  };
  const start = (kind, collection = null, folder = null) =>
    setEdit({
      kind,
      collection,
      folder,
      name:
        kind === "rename-collection"
          ? collection.name
          : kind === "rename-folder"
            ? folder.name
            : "",
    });
  const remove = (collection, folder) =>
    run(async () => {
      const patches = {};
      all
        .filter(
          (r) =>
            r.collectionId === collection.id &&
            (!folder || r.folderId === folder.id),
        )
        .forEach(
          (r) =>
            (patches[r.id] = {
              collectionId: folder ? collection.id : null,
              folderId: folder?.parentId || null,
            }),
        );
      const next = folder
        ? client.collections.map((c) =>
            c.id === collection.id
              ? {
                  ...c,
                  folders: c.folders
                    .filter((f) => f.id !== folder.id)
                    .map((f) =>
                      f.parentId === folder.id
                        ? { ...f, parentId: folder.parentId }
                        : f,
                    ),
                }
              : c,
          )
        : client.collections.filter((c) => c.id !== collection.id);
      await client.organize(next, patches);
    });
  const submit = () =>
    run(async () => {
      const name = edit.name.trim();
      if (!name) return;
      let next;
      if (edit.kind === "new-collection")
        next = [
          ...client.collections,
          { id: crypto.randomUUID(), name, folders: [] },
        ];
      else
        next = client.collections.map((c) => {
          if (c.id !== edit.collection.id) return c;
          if (edit.kind === "rename-collection") return { ...c, name };
          if (edit.kind === "rename-folder")
            return {
              ...c,
              folders: c.folders.map((f) =>
                f.id === edit.folder.id ? { ...f, name } : f,
              ),
            };
          return {
            ...c,
            folders: [
              ...c.folders,
              {
                id: crypto.randomUUID(),
                name,
                parentId: edit.folder?.id || null,
              },
            ],
          };
        });
      await client.organize(next);
      for (const c of next) {
        const previous = client.collections.find((p) => p.id === c.id);
        if (!previous) setOpen(c.id, true);
        else
          for (const f of c.folders)
            if (!previous.folders.some((p) => p.id === f.id)) {
              setOpen(c.id, true);
              setOpen(f.id, true);
            }
      }
    });
  const requestButtons = (collection, parent) =>
    all
      .filter(
        (r) =>
          r.collectionId === collection.id &&
          (r.folderId || null) === parent &&
          r.name.toLowerCase().includes(search.toLowerCase()),
      )
      .map((r) => (
        <button
          className="api-history-item"
          key={r.id}
          title={r.name}
          aria-pressed={r.id === client.active.id}
          onClick={() => onSelect(r.id)}
        >
          <span className="api-method" data-method={r.method}>
            {r.method}
          </span>
          <span className="api-tree-request-name">
            {r.name}
            {!client.saved[r.id] && (
              <span
                className="api-session-dot"
                aria-label="Session-only request"
                title="Session-only request"
              >
                {" "}
                ·
              </span>
            )}
          </span>
        </button>
      ));
  const summary = (collection, folder = null) => (
    <summary
      onClick={(e) => {
        e.preventDefault();
        const id = folder?.id || collection.id;
        setOpen(id, !isOpen(id));
      }}
    >
      <ChevronRight className="api-tree-chevron" size={14} aria-hidden="true" />
      {folder && <Folder size={14} aria-hidden="true" />}
      <span className="api-tree-label" title={folder?.name || collection.name}>
        {folder?.name || collection.name}
      </span>
      <button
        className="api-tree-more"
        aria-label={`${folder ? "Folder" : "Collection"} actions for ${folder?.name || collection.name}`}
        aria-haspopup="menu"
        aria-expanded={
          menu?.collection.id === collection.id &&
          (menu.folder?.id || null) === (folder?.id || null)
        }
        onClick={(e) => showMenu(e, collection, folder)}
      >
        <MoreHorizontal size={16} />
      </button>
    </summary>
  );
  const folders = (collection, parent, depth = 0) =>
    depth > 12
      ? null
      : collection.folders
          .filter((f) => f.parentId === parent)
          .map((f) => (
            <details
              key={f.id}
              className="api-folder"
              open={isOpen(f.id)}
              onToggle={(e) => {
                if (
                  e.target === e.currentTarget &&
                  e.currentTarget.open !== isOpen(f.id)
                )
                  setOpen(f.id, e.currentTarget.open);
              }}
            >
              {summary(collection, f)}
              {requestButtons(collection, f.id)}
              {folders(collection, f.id, depth + 1)}
            </details>
          ));
  return (
    <section className="api-collections" aria-label="API collections">
      <div className="api-row api-between">
        <strong>Collections</strong>
        <div className="api-row">
          <button
            aria-label="New collection"
            onClick={() => start("new-collection")}
          >
            <Plus size={14} />
          </button>
          <button aria-label="Import requests" onClick={onImport}>
            <Upload size={14} /> Import
          </button>
        </div>
      </div>
      {!client.collections.length && (
        <p className="api-muted api-small">
          Organize requests into collections, or import existing work.
        </p>
      )}
      {client.collections
        .filter(
          (c) =>
            !search.trim() ||
            c.name.toLowerCase().includes(search.toLowerCase()) ||
            all.some(
              (r) =>
                r.collectionId === c.id &&
                r.name.toLowerCase().includes(search.toLowerCase()),
            ),
        )
        .map((c) => (
          <details
            key={c.id}
            className="api-collection"
            open={isOpen(c.id)}
            onToggle={(e) => {
              if (
                e.target === e.currentTarget &&
                e.currentTarget.open !== isOpen(c.id)
              )
                setOpen(c.id, e.currentTarget.open);
            }}
          >
            {summary(c)}
            {c.forkedFrom && (
              <p className="api-muted api-small">
                Local fork · independent copy
              </p>
            )}
            {requestButtons(c, null)}
            {folders(c, null)}
            {!all.some((r) => r.collectionId === c.id) && (
              <p className="api-muted api-small">No requests yet.</p>
            )}
          </details>
        ))}
      <div
        ref={menuRef}
        popover="auto"
        role="menu"
        aria-label="Collection actions"
        className="api-tree-menu"
        style={menu ? { left: menu.left, top: menu.top } : undefined}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            hideMenu();
            menuTriggerRef.current?.focus();
            return;
          }
          const buttons = [
            ...e.currentTarget.querySelectorAll("button:not(:disabled)"),
          ];
          const index = buttons.indexOf(document.activeElement);
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            buttons[
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? buttons.length - 1
                  : (index +
                      (e.key === "ArrowDown" ? 1 : -1) +
                      buttons.length) %
                    buttons.length
            ]?.focus();
          }
        }}
      >
        {menu && (
          <>
            <button
              role="menuitem"
              disabled={busy || client.collectionBusy}
              aria-label={`New request in ${menu.folder?.name || menu.collection.name}`}
              onClick={() => {
                client.add(null, {
                  collectionId: menu.collection.id,
                  folderId: menu.folder?.id || null,
                });
                hideMenu();
              }}
            >
              New request
            </button>
            <button
              role="menuitem"
              disabled={busy || client.collectionBusy}
              aria-label={
                menu.folder
                  ? `New folder inside ${menu.folder.name}`
                  : `New folder in ${menu.collection.name}`
              }
              onClick={() => {
                start("new-folder", menu.collection, menu.folder);
                hideMenu();
              }}
            >
              New folder
            </button>
            {!menu.folder && (
              <button
                role="menuitem"
                aria-label={`Run collection ${menu.collection.name}`}
                onClick={() => {
                  onRun(menu.collection.id);
                  hideMenu();
                }}
              >
                Run collection
              </button>
            )}
            {!menu.folder && (
              <button
                role="menuitem"
                aria-label={`Export collection ${menu.collection.name}`}
                onClick={() => {
                  onExport(menu.collection.id);
                  hideMenu();
                }}
              >
                Export collection
              </button>
            )}
            {!menu.folder && (
              <button
                role="menuitem"
                disabled={busy || client.collectionBusy}
                aria-label={`Fork collection ${menu.collection.name}`}
                onClick={() => {
                  onFork(menu.collection.id);
                  hideMenu();
                }}
              >
                Fork collection
              </button>
            )}
            <button
              role="menuitem"
              disabled={busy || client.collectionBusy}
              aria-label={`Rename ${menu.folder ? "folder" : "collection"} ${menu.folder?.name || menu.collection.name}`}
              onClick={() => {
                start(
                  menu.folder ? "rename-folder" : "rename-collection",
                  menu.collection,
                  menu.folder,
                );
                hideMenu();
              }}
            >
              Rename
            </button>
            <button
              role="menuitem"
              disabled={busy || client.collectionBusy}
              aria-label={`Remove ${menu.folder ? "folder" : "collection"} ${menu.folder?.name || menu.collection.name}`}
              onClick={() => {
                remove(menu.collection, menu.folder);
                hideMenu();
              }}
            >
              Remove
            </button>
            <span className="api-muted api-small">
              Remove keeps requests in Unfiled.
            </span>
          </>
        )}
      </div>
      {edit && (
        <form
          className="api-collection-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label>
            {edit.kind.includes("collection")
              ? "Collection name"
              : "Folder name"}
            <input
              autoFocus
              maxLength={500}
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
          </label>
          <div className="api-row">
            <button disabled={busy || !edit.name.trim()} type="submit">
              {busy ? "Saving…" : "Save name"}
            </button>
            <button type="button" onClick={() => setEdit(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="api-warning">
          {error}
        </p>
      )}
    </section>
  );
}

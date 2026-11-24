import { isDesktop } from "../../utils/platform.js";
const INDEX = "tidycode-api-vault-index-v1";
const idPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function createDesktopVault({
  native = isDesktop(),
  storage,
  invokeImpl,
} = {}) {
  const store = () => {
    if (!native)
      throw new Error(
        "The OS credential vault is available in the desktop app only.",
      );
    return storage || localStorage;
  };
  const list = () => {
    try {
      const raw = store().getItem(INDEX);
      if (!raw) return [];
      const rows = JSON.parse(raw);
      if (
        !Array.isArray(rows) ||
        rows.length > 200 ||
        rows.some(
          (r) =>
            !idPattern.test(r.id) ||
            typeof r.name !== "string" ||
            !r.name.trim() ||
            r.name.length > 128,
        )
      )
        throw new Error();
      return rows.map(({ id, name }) => ({ id, name }));
    } catch {
      throw new Error(
        "Could not read the desktop vault catalog. Do not clear application storage; credentials may still exist in the OS store.",
      );
    }
  };
  const write = (rows) => {
    try {
      store().setItem(INDEX, JSON.stringify(rows));
    } catch {
      throw new Error(
        "Could not update the local vault catalog. Retry the operation; do not clear application storage.",
      );
    }
  };
  const call = async (command, args) => {
    if (!native)
      throw new Error(
        "The OS credential vault is available in the desktop app only.",
      );
    try {
      const invoke =
        invokeImpl || (await import("@tauri-apps/api/core")).invoke;
      return await invoke(command, args);
    } catch {
      throw new Error(
        "OS credential operation failed or access was denied. No plaintext fallback was used.",
      );
    }
  };
  return {
    list,
    async save({ id, name, value, overwrite = false }) {
      name = name?.trim();
      if (!name || name.length > 128)
        throw new Error("Use a credential name of 1–128 characters.");
      if (
        typeof value !== "string" ||
        !value ||
        new TextEncoder().encode(value).length > 65536
      )
        throw new Error("Use a nonempty credential no larger than 64 KiB.");
      if (value.includes("{{"))
        throw new Error(
          "Store a literal credential, not a variable reference.",
        );
      const rows = list(),
        existing = rows.find((r) => r.id === id);
      if (id && !existing)
        throw new Error("Credential is no longer in the catalog.");
      if (existing && !overwrite)
        throw new Error("Confirm replacing this OS credential.");
      if (
        !existing &&
        rows.some((r) => r.name.toLowerCase() === name.toLowerCase())
      )
        throw new Error(
          "This credential name already exists. Select it to update.",
        );
      if (!existing && rows.length >= 200)
        throw new Error("The vault supports at most 200 credentials.");
      const row = existing || { id: crypto.randomUUID(), name };
      if (!existing) write([...rows, row]); // Confirm catalog storage before committing a keychain entry.
      try {
        await call("api_vault_set", { id: row.id, value });
      } catch (error) {
        if (!existing) {
          try {
            write(list().filter((r) => r.id !== row.id));
          } catch {}
        }
        throw error;
      }
      return row;
    },
    async load(id) {
      if (!list().some((r) => r.id === id))
        throw new Error("Choose an existing credential.");
      const value = await call("api_vault_get", { id });
      if (value === null || value === undefined)
        throw new Error(
          "This credential was not found in the OS store. Delete its catalog entry or save it again.",
        );
      if (
        typeof value !== "string" ||
        new TextEncoder().encode(value).length > 65536
      )
        throw new Error("Stored credential is too large.");
      if (value.includes("{{"))
        throw new Error(
          "Stored credential contains variable references. Use a literal credential.",
        );
      return value;
    },
    async remove(id) {
      if (!list().some((r) => r.id === id))
        throw new Error("Choose an existing credential.");
      await call("api_vault_delete", { id });
      try {
        write(list().filter((r) => r.id !== id));
      } catch {
        throw new Error(
          "OS credential removed, but catalog cleanup failed. Retry deleting this entry.",
        );
      }
    },
  };
}

import { isDesktop } from "../../utils/platform.js";
import { RESPONSE_LIMIT, HttpError } from "./request.js";
export async function saveResponseBytes(
  bytes,
  { native = isDesktop(), saveImpl, writeImpl } = {},
) {
  if (!(bytes instanceof Uint8Array) || bytes.length > RESPONSE_LIMIT)
    throw new HttpError("size", "Response download exceeds the 20 MiB limit.");
  if (native) {
    const save = saveImpl || (await import("@tauri-apps/plugin-dialog")).save;
    const path = await save({
      title: "Save response bytes",
      defaultPath: "response.bin",
    });
    if (!path) return false;
    const write =
      writeImpl ||
      ((filePath, data) =>
        import("@tauri-apps/api/core").then(({ invoke }) =>
          invoke("save_binary_to_path", { filePath, data: Array.from(data) }),
        ));
    await write(path, bytes);
    return true;
  }
  const url = URL.createObjectURL(
      new Blob([bytes], { type: "application/octet-stream" }),
    ),
    link = document.createElement("a");
  link.href = url;
  link.download = "response.bin";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

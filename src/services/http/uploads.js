import { newRow, HttpError } from "./request.js";
export const UPLOAD_LIMIT = 20 * 1024 * 1024;
export function uploadRow() {
  return { ...newRow(), type: "text", file: null };
}
export function savedMultipart(rows = [], include = false) {
  if (!Array.isArray(rows) || rows.length > 100)
    throw new Error("Use at most 100 multipart fields.");
  return rows.map((row) => {
    if (
      typeof row.key !== "string" ||
      row.key.length > 512 ||
      typeof row.value !== "string" ||
      row.value.length > 1024 * 1024
    )
      throw new Error("Invalid multipart field.");
    return {
      id: row.id || crypto.randomUUID(),
      key: row.key,
      type: row.type === "file" ? "file" : "text",
      enabled: row.enabled !== false,
      value: include && row.type !== "file" ? row.value : "",
      file: null,
    };
  });
}
export function uploadBody(request, headers) {
  if (request.bodyMode === "binary") {
    if (!(request.binaryFile instanceof Blob))
      throw new HttpError(
        "validation",
        "Select a binary file before sending. File selections are not restored after reload.",
      );
    if (request.binaryFile.size > UPLOAD_LIMIT)
      throw new HttpError("validation", "Uploads are limited to 20 MiB.");
    if (!headers.has("content-type"))
      headers.set(
        "Content-Type",
        request.binaryFile.type || "application/octet-stream",
      );
    return request.binaryFile;
  }
  if (headers.has("content-type"))
    throw new HttpError(
      "validation",
      "Remove Content-Type from Headers for multipart uploads; the browser generates the boundary.",
    );
  const rows = request.multipart || [];
  if (rows.length > 100)
    throw new HttpError("validation", "Use at most 100 multipart fields.");
  const body = new FormData();
  let size = 0;
  for (const row of rows.filter((r) => r.enabled)) {
    if (!row.key && !row.value && !row.file) continue;
    if (!row.key || row.key.length > 512 || /[\r\n]/.test(row.key))
      throw new HttpError(
        "validation",
        "Multipart fields need names without line breaks.",
      );
    if (row.type === "file") {
      if (!(row.file instanceof Blob))
        throw new HttpError(
          "validation",
          "Reselect every enabled multipart file before sending.",
        );
      size += row.file.size;
      body.append(row.key, row.file, row.file.name || "upload.bin");
    } else {
      size += new TextEncoder().encode(row.value || "").length;
      body.append(row.key, row.value || "");
    }
    if (size > UPLOAD_LIMIT)
      throw new HttpError(
        "validation",
        "Combined upload fields and files are limited to 20 MiB.",
      );
  }
  return body;
}

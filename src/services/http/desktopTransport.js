import { validateDesktopNetwork } from "./desktopNetwork.js";
import { prepareRequest, HttpError, RESPONSE_LIMIT } from "./request.js";
const BODY_LIMIT = 20 * 1024 * 1024;
function base64(bytes) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 32768)
    text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text);
}
function cancelled() {
  return new HttpError(
    "cancelled",
    "Request cancelled. The server may still have processed it.",
  );
}
export async function sendDesktopRequest(
  request,
  { signal, invokeImpl, requestId = crypto.randomUUID() } = {},
) {
  if (signal?.aborted) throw cancelled();
  const prepared = prepareRequest(request, { native: true });
  const network = validateDesktopNetwork(request.desktop, prepared.url.href);
  let bytes;
  if (prepared.body instanceof FormData) {
    const encoded = new Response(prepared.body);
    prepared.headers.set("Content-Type", encoded.headers.get("Content-Type"));
    bytes = new Uint8Array(await encoded.arrayBuffer());
  } else if (prepared.body instanceof Blob)
    bytes = new Uint8Array(await prepared.body.arrayBuffer());
  else if (prepared.body !== undefined)
    bytes = new TextEncoder().encode(prepared.body);
  if (bytes?.length > BODY_LIMIT)
    throw new HttpError(
      "size",
      "Request body exceeds the 20 MiB native transport limit.",
    );
  if (signal?.aborted) throw cancelled();
  const invoke = invokeImpl || (await import("@tauri-apps/api/core")).invoke;
  const abort = () => {
    void invoke("api_http_cancel", { requestId }).catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (signal?.aborted) throw cancelled();
    const result = await invoke("api_http_request", {
      request: {
        requestId,
        url: prepared.url.href,
        method: request.method,
        headers: [...prepared.headers.entries()],
        bodyBase64: bytes ? base64(bytes) : null,
        network,
        timeoutMs: Math.max(100, Math.min(request.timeoutMs || 30000, 120000)),
      },
    });
    if (signal?.aborted) throw cancelled();
    if (
      !result ||
      !Number.isInteger(result.size) ||
      result.size < 0 ||
      result.size > RESPONSE_LIMIT ||
      typeof result.bodyBase64 !== "string" ||
      result.bodyBase64.length > Math.ceil(RESPONSE_LIMIT / 3) * 4
    )
      throw new HttpError("size", "Invalid or oversized native response.");
    const binary = atob(result.bodyBase64),
      body = new Uint8Array(binary.length);
    if (body.length !== result.size)
      throw new HttpError("validation", "Invalid native response size.");
    for (let i = 0; i < binary.length; i++) body[i] = binary.charCodeAt(i);
    return {
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
      bytes: body,
      size: result.size,
      totalMs: result.totalMs,
      headersMs: result.headersMs,
      contentType: result.contentType,
      transport: "desktop",
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const allowed = [
      "validation",
      "network_settings",
      "limit",
      "size",
      "timeout",
      "cancelled",
      "network",
      "internal",
    ];
    const messages = {
      validation: "Native HTTP request validation failed.",
      network_settings:
        "Desktop TLS/proxy settings are invalid or the destination changed. Review Settings or reset network settings.",
      limit: "Four native requests are already running.",
      size: "Native request or response exceeds the 20 MiB limit.",
      timeout: "Request timed out. The server may already have processed it.",
      cancelled: "Request cancelled. The server may still have processed it.",
      network:
        "Native HTTP request failed. Check the destination, network and TLS certificate. The request was not retried.",
      internal:
        "Native HTTP transport is unavailable. Restart or update the desktop app.",
    };
    const code = allowed.includes(error?.code) ? error.code : "internal";
    throw new HttpError(code, messages[code]);
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

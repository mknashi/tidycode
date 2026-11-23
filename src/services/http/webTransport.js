import { HttpError, prepareRequest, RESPONSE_LIMIT } from "./request.js";

/** No fallback or retry: an unreadable response can still represent a processed request. */
export async function sendBrowserRequest(
  request,
  { signal, fetchImpl = fetch, limit = RESPONSE_LIMIT } = {},
) {
  const prepared = prepareRequest(request);
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });
  if (signal?.aborted) controller.abort();
  let timedOut = false;
  const timer = setTimeout(
    () => {
      timedOut = true;
      controller.abort();
    },
    Math.max(100, Math.min(request.timeoutMs || 30000, 120000)),
  );
  const started = performance.now();
  let reader;
  try {
    const response = await fetchImpl(prepared.url.href, {
      method: request.method,
      headers: prepared.headers,
      body: prepared.body,
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      redirect: "error",
    });
    const headersMs = performance.now() - started;
    const chunks = [];
    let size = 0;
    if (response.body) {
      reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          controller.abort();
          await reader.cancel().catch(() => {});
          throw new HttpError(
            "size",
            `Response exceeds the ${Math.round(limit / 1024 / 1024)} MiB receive limit. Download it with another tool.`,
          );
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
      bytes,
      size,
      totalMs: performance.now() - started,
      headersMs,
      contentType: response.headers.get("content-type") || "",
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (controller.signal.aborted)
      throw new HttpError(
        timedOut ? "timeout" : "cancelled",
        timedOut
          ? "Request timed out. It may already have reached the server; resend only when appropriate."
          : "Request cancelled. The server may still have processed it.",
      );
    // Never echo native fetch errors: they can contain URLs or credentials.
    throw new HttpError(
      "network",
      "The browser could not read this response. Possible causes include CORS, a redirect, blocked HTTP, or a network/TLS failure. Check browser developer tools and the API configuration. The request was not retried.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
    reader?.releaseLock();
  }
}

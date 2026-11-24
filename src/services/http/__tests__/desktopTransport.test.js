import test from "node:test";
import assert from "node:assert/strict";
import { createRequest, newRow, prepareRequest } from "../request.js";
import { sendDesktopRequest } from "../desktopTransport.js";
const reply = (bytes, status = 400) => ({
  status,
  statusText: "Bad Request",
  headers: [["set-cookie", "test=synthetic"]],
  bodyBase64: Buffer.from(bytes).toString("base64"),
  size: bytes.length,
  totalMs: 12,
  headersMs: 8,
  contentType: "application/octet-stream",
});
test("native IPC preserves form bytes and non-CORS HTTP errors without browser fetch", async () => {
  const request = createRequest({
    url: "https://example.test/token",
    method: "POST",
    bodyMode: "form",
    body: "grant_type=client_credentials&client_secret=a%2Bb%26c",
  });
  let captured;
  const response = await sendDesktopRequest(request, {
    invokeImpl: async (command, args) => {
      assert.equal(command, "api_http_request");
      captured = args.request;
      return reply([0, 255, 2]);
    },
  });
  assert.equal(
    Buffer.from(captured.bodyBase64, "base64").toString(),
    "grant_type=client_credentials&client_secret=a%2Bb%26c",
  );
  assert.equal(captured.method, "POST");
  assert.equal(response.status, 400);
  assert.deepEqual([...response.bytes], [0, 255, 2]);
  assert.equal(response.headers[0][0], "set-cookie");
  assert.equal(response.transport, "desktop");
});
test("native sends selected uploads and computes multipart boundaries without file path access", async () => {
  const file = new File(["PAYLOAD"], "demo.txt", { type: "text/plain" });
  const binary = createRequest({
    url: "https://example.test/upload",
    method: "POST",
    bodyMode: "binary",
    binaryFile: file,
  });
  await sendDesktopRequest(binary, {
    invokeImpl: async (_, args) => {
      assert.equal(
        Buffer.from(args.request.bodyBase64, "base64").toString(),
        "PAYLOAD",
      );
      return reply([]);
    },
  });
  const multipart = createRequest({
    ...binary,
    bodyMode: "multipart",
    multipart: [
      { id: "f", enabled: true, key: "upload", type: "file", file },
      {
        id: "t",
        enabled: true,
        key: "description",
        type: "text",
        value: "hello",
      },
    ],
  });
  await sendDesktopRequest(multipart, {
    invokeImpl: async (_, args) => {
      const headers = new Headers(args.request.headers),
        body = Buffer.from(args.request.bodyBase64, "base64").toString();
      assert.match(
        headers.get("content-type"),
        /multipart\/form-data; boundary=/,
      );
      assert.ok(body.includes("PAYLOAD"));
      assert.ok(body.includes("hello"));
      return reply([]);
    },
  });
});
test("native cancellation is explicit, pre-abort sends nothing and errors omit sensitive native strings", async () => {
  const request = createRequest({ url: "https://example.test" }),
    controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    () =>
      sendDesktopRequest(request, {
        signal: controller.signal,
        invokeImpl: async () => {
          calls++;
        },
      }),
    (e) => e.code === "cancelled",
  );
  assert.equal(calls, 0);
  const running = new AbortController();
  let started;
  const ready = new Promise((r) => (started = r));
  const commands = [];
  const result = sendDesktopRequest(request, {
    requestId: "execution-test",
    signal: running.signal,
    invokeImpl: (command) => {
      commands.push(command);
      if (command === "api_http_cancel") return Promise.resolve();
      started();
      return new Promise((resolve, reject) =>
        running.signal.addEventListener(
          "abort",
          () => reject({ code: "cancelled", message: "SECRET" }),
          { once: true },
        ),
      );
    },
  });
  await ready;
  running.abort();
  await assert.rejects(
    () => result,
    (e) => e.code === "cancelled" && !e.message.includes("SECRET"),
  );
  assert.deepEqual(commands, ["api_http_request", "api_http_cancel"]);
  await assert.rejects(
    () =>
      sendDesktopRequest(request, {
        invokeImpl: async () => {
          throw { code: "network", message: "https://SECRET@host/path" };
        },
      }),
    (e) => e.code === "network" && !e.message.includes("SECRET"),
  );
});
test("native header exceptions stay scoped and body validation remains shared", () => {
  const request = createRequest({
    url: "https://example.test",
    headers: [
      newRow("Cookie", "synthetic=1"),
      newRow("User-Agent", "TidyCode test"),
    ],
  });
  assert.throws(() => prepareRequest(request), /browser/);
  assert.equal(
    prepareRequest(request, { native: true }).headers.get("cookie"),
    "synthetic=1",
  );
  assert.throws(
    () =>
      prepareRequest(
        { ...request, headers: [newRow("Content-Length", "10")] },
        { native: true },
      ),
    /native transport/,
  );
  assert.throws(
    () =>
      prepareRequest(
        { ...request, method: "POST", bodyMode: "json", body: "invalid" },
        { native: true },
      ),
    /JSON/,
  );
});

test("dispatcher selects native only in desktop and never falls back after failure", async () => {
  const { sendApiRequest, transportKind } = await import("../transport.js");
  const previous = globalThis.window;
  globalThis.window = { __TAURI_INTERNALS__: {}, __PLATFORM_DETECTED__: true };
  try {
    assert.equal(transportKind(), "desktop");
    let calls = 0;
    await assert.rejects(
      () =>
        sendApiRequest(createRequest({ url: "https://example.test" }), {
          invokeImpl: async () => {
            calls++;
            throw { code: "network" };
          },
        }),
      (e) => e.code === "network",
    );
    assert.equal(calls, 1);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
  assert.equal(transportKind(), "browser");
});

test("native download writes exact bytes only after explicit save selection", async () => {
  const { saveResponseBytes } = await import("../saveResponse.js");
  const data = new Uint8Array([0, 255, 1]);
  let writes = 0;
  assert.equal(
    await saveResponseBytes(data, {
      native: true,
      saveImpl: async () => null,
      writeImpl: async () => writes++,
    }),
    false,
  );
  assert.equal(writes, 0);
  assert.equal(
    await saveResponseBytes(data, {
      native: true,
      saveImpl: async () => "/selected/response.bin",
      writeImpl: async (path, bytes) => {
        assert.equal(path, "/selected/response.bin");
        assert.deepEqual(bytes, data);
        writes++;
      },
    }),
    true,
  );
  assert.equal(writes, 1);
});

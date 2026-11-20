# Plan: Postman-style REST API Client

## 1. Goal

Let users build, send, save, and inspect HTTP requests inside TidyCode, without switching to Postman or Insomnia. The client should reuse what the editor already does well:

- CodeMirror for request and response bodies
- The formatters for pretty JSON and XML
- `DiffViewer` for comparing responses
- AI actions (if reinstated) for explaining a response or generating tests

**Out of scope for v1:** team workspaces and cloud sync (sync was just removed), mock servers, monitors, and arbitrary JS pre-request/test scripts.

---

## 2. The deciding constraint: CORS on web

| | Desktop (Tauri) | Web (static nginx) |
|---|---|---|
| Arbitrary hosts | ✅ via Rust `reqwest`, already a dependency in `src-tauri/Cargo.toml` | ❌ blocked unless the target API sends CORS headers |
| Set `Cookie`, `Host`, `User-Agent`, `Origin` | ✅ | ❌ the browser forbids these headers |
| Read `Set-Cookie` and all response headers | ✅ | ❌ only CORS-exposed headers |
| `localhost` / private network | ✅ | ⚠️ mixed-content and private-network-access rules apply |
| Self-signed TLS, proxy, timing breakdown | ✅ | ❌ |

**Recommendation:**
- **Desktop:** full-featured transport through a custom Tauri command.
- **Web:** never rely on the browser alone. Hand requests to an **agent** that isn't bound by CORS when one is available, and fall back to browser `fetch` with a clear diagnosis when none is. Section 2a covers the options and the order to try them.
- **No hosted proxy in v1.** An open proxy on tidycode.ai becomes an SSRF and abuse vector with bandwidth cost.

---

## 2a. Web transport strategy: agents

Postman's web app solves CORS by not sending requests from the page. You choose an agent, or Postman picks one automatically:
- **Cloud Agent:** Postman's servers make the call. Only reaches public APIs.
- **Desktop Agent:** a local app the page talks to over `localhost`.
- **Browser Agent:** plain `fetch`, subject to CORS.

Hoppscotch offers the same choices as a browser extension, a proxy you host yourself, or a desktop app. TidyCode can follow the same model.

### Transports, from no install to most operating effort

| # | Transport | User install | Reach | Our effort and risk |
|---|---|---|---|---|
| A | **Browser `fetch`** | None | APIs that allow browser access, the user's own APIs once they enable CORS, often `localhost` dev servers | Low |
| B | **Desktop app as local agent** | TidyCode desktop | Everything: `localhost`, VPN/intranet, any header, self-signed TLS | Low. Reuses the `http_request` command. Needs strict pairing (below) |
| C | **Browser extension** | One-click from the browser's store | Any host the user grants, most headers, `localhost` | Medium. A separate codebase and store reviews; Safari is harder |
| D | **User-supplied proxy URL** | Runs our Docker image | Whatever the proxy host can reach | Low. We publish an image and host nothing |
| E | **Hosted cloud proxy** | None | Public internet only, never `localhost` or private networks | High. Needs sign-in, rate limits, SSRF protection, privacy notice, running cost |

### Automatic fallback order

```
desktop agent (B) → extension (C) → user proxy (D) → browser fetch (A) + diagnosis
```

`transport.js` checks availability on startup, and again when the user opens the transport picker:
- **B:** `GET http://127.0.0.1:<port>/health` with a short timeout.
- **C:** look for an extension handshake via `window.postMessage`.
- **D:** a proxy URL is set in Settings.

The request bar shows the active transport (for example, "via Desktop agent"), and the user can override it per request.

### A. Browser `fetch` with failure diagnosis
Browsers report a blocked request only as `TypeError: Failed to fetch`. To tell the user what actually happened, the error panel:
1. Classifies the failure:
   - **Mixed content:** an `https` page calling an `http` URL.
   - **Private-network block:** a public page calling `localhost` or a private IP.
   - **Probable CORS block:** retry once with `mode: 'no-cors'`. An opaque success means the host is reachable but doesn't allow browser access.
   - **Network or DNS failure:** the `no-cors` retry also fails.
2. Offers the next step:
   - "Install the extension (fastest)"
   - "Download the desktop app"
   - "Enable CORS on your server", with ready-to-copy CORS snippets for Express, FastAPI, Spring, nginx and ASP.NET.
3. Shows which headers the browser silently dropped (`Cookie`, `Host`, `User-Agent`, `Origin`, …).

### B. Desktop app as local agent
- The desktop app runs an HTTP server bound to **`127.0.0.1` only**, using axum or hyper on a fixed default port with a fallback range. It exposes `/health` and `/request`, and both call the same code as the `http_request` Tauri command.
- **Security is mandatory.** Otherwise any website the user visits could use the agent to reach their private network.
  - Reject any request whose `Origin` isn't `https://www.tidycode.ai`, or `http://localhost:5173` in dev builds.
  - **Pairing:** the first connection triggers an approval prompt in the desktop app ("Allow tidycode.ai to send requests through this app?"). On approval, the app issues a random token that the web app stores and sends as `Authorization: Bearer`. Requests without it are refused.
  - The desktop app shows a "Connected websites" list in Settings, with Revoke buttons. The agent can be switched off entirely.
  - Answer CORS preflight requests only for the allowed origin, and include `Access-Control-Allow-Private-Network: true` so Chrome's private-network rules allow the connection.
- Same response format as the Tauri command, so `desktopTransport.js` and `agentTransport.js` share the parsing code.

### C. Browser extension
- A Manifest V3 extension for Chrome/Edge and Firefox. Its background script makes requests with `fetch`, which extensions can do without CORS limits on hosts they're allowed to access.
- Ask for **optional host permissions per site**, at the moment they're needed, instead of "access all sites" at install time.
- Use `declarativeNetRequest` session rules to set headers the browser normally forbids (`Origin`, `Cookie`, `User-Agent`) for the duration of one request.
- Only `https://www.tidycode.ai` may connect, via `externally_connectable`. Messages follow the same request and response format as transport B.
- Lives in a new `extension/` folder with its own build and store listings.

### D. User-supplied proxy URL
- A Settings field for a proxy URL and optional access token.
- Publish a small image (`tidycode/http-proxy`) with:
  - A token required on every request
  - An optional host allowlist
  - Limits on response size and time
  - No logging of request bodies
- For teams who want web-only access to internal APIs without installing anything per machine.

### E. Hosted cloud proxy (deferred)
Build only if usage data shows real demand from users who haven't installed anything. Minimum requirements:
- Sign-in, or signed short-lived session tokens, plus per-user rate limits.
- Block private, loopback, link-local and cloud-metadata IP ranges, including checks after DNS resolution and after each redirect.
- Response size and time limits, and only the `http`/`https` schemes.
- A privacy notice, because request and response data pass through our servers.

This brings back sign-in and running costs, which conflicts with the recent removal of auth.

---

## 3. Architecture

```
RequestTab (new tab type "request")
 ├─ RequestBar        method ▾ | URL with {{var}} highlighting | Send / Cancel
 ├─ RequestEditor     tabs: Params · Headers · Auth · Body · Settings
 │    └─ KeyValueEditor (enable checkbox, key, value, description)
 │    └─ BodyEditor     none | JSON | text | XML | form-urlencoded | multipart | binary | GraphQL
 └─ ResponseViewer    status · time · size | Pretty · Raw · Headers · Cookies · Timeline
                      └─ reuses CodeMirrorEditor (read-only) + formatService
Sidebar section: Collections · History · Environments (beside TabsExplorer)

services/http/
 ├─ transport.js        send(request, {signal}) → Response; detects available transports, applies fallback order (§2a)
 ├─ desktopTransport.js invoke('http_request'), invoke('cancel_http_request')   (inside the desktop app)
 ├─ agentTransport.js   web → desktop app local agent on 127.0.0.1 (pairing token)
 ├─ extensionTransport.js web → browser extension (postMessage / runtime messaging)
 ├─ proxyTransport.js   web → user-supplied proxy URL
 ├─ webTransport.js     fetch + AbortController
 ├─ diagnoseFailure.js  mixed-content / private-network / CORS / network classification + CORS snippets
 ├─ variables.js        {{var}} resolution, dynamic vars ({{$uuid}}, {{$timestamp}})
 ├─ auth.js             None, Bearer, Basic, API key (header/query), OAuth2 client-credentials (phase 2)
 ├─ curl.js             parse "Paste cURL" ↔ generate cURL
 ├─ codegen.js          export as cURL / fetch / axios / Python requests / Go
 ├─ importers/          postman-v2.1.js, openapi3.js, httpFile.js
 └─ store.js            IndexedDB persistence (collections, environments, history)

src-tauri/src/http_client.rs
 └─ #[tauri::command] http_request(req) → { status, statusText, headers[], body_b64, size, timings, redirects[] }
 └─ #[tauri::command] cancel_http_request(id)
```

### Data model

```ts
Request     { id, name, method, url, params: KV[], headers: KV[], auth: Auth,
              body: { mode, content, formData?: KV[], file?: path },
              settings: { timeoutMs, followRedirects, verifyTls } }
Collection  { id, name, items: (Request | Folder)[], variables: KV[], auth?: Auth }
Environment { id, name, variables: { key, value, secret: boolean }[] }
HistoryItem { id, at, request (resolved, secrets redacted), response summary + body (capped) }
Response    { status, statusText, headers, body (text or base64), size, timings: { total, ttfb? }, redirects }
```

**Variable precedence, low to high:** global, then collection, then environment, then request.

### Storage

- **IndexedDB**, not localStorage, because response bodies and history can be large.
  - Cap history at 200 entries.
  - Cap each stored response body at 1 MB. Keep the full body only in memory for the open tab.
- **Secret variables:** same `secureStorage` caveat as in the AI plan. Use the OS keychain on desktop. Never write secrets into history: store `{{token}}`, not the resolved value.
- **Desktop:** "Save collection to folder" writes plain JSON or `.http` files, so collections can live in git next to the code they test.

---

## 4. Phases

The implementation review in section 9 revises the release sequence and estimates below. Follow section 9 for implementation: select transports before sending, do not automatically replay failed requests or use `no-cors` diagnostic retries, and release the local agent behind its own validation gate.

### Phase 1: MVP (about 1.5–2 weeks)
- New tab type `request`. Add "New Request" to the new-tab menu and a command-palette entry.
- Method, URL, query params (two-way synced with the URL), headers, body (none / JSON / text / form-urlencoded).
- Send and Cancel (AbortController; on desktop, a cancel token in Rust).
- Response viewer:
  - Status pill and time and size
  - Pretty JSON/XML via the existing formatter, plus raw text
  - Headers table
  - Inline image and PDF preview, reusing `PDFViewer` and `SVGViewer`
  - "Open response in new editor tab"
- Desktop Tauri command with timeout, redirect control, and TLS-verify toggle.
- Web: browser `fetch` transport (A) with full failure diagnosis and CORS snippets (§2a).
- Web: desktop-app local agent (B) with origin check, pairing prompt and token, and a "Connected websites" list in the desktop app. Transport indicator in the request bar.
- History list (auto-saved). Click an entry to reopen it as a tab.
- Request tabs survive reload, like notes and todos do today.

### Phase 2: Collections, environments, and auth (about 1.5 weeks)
- Collections sidebar: folders, drag-to-reorder, rename, duplicate, delete.
- Environments: switcher in the request bar, `{{var}}` highlighting and autocomplete in URL/headers/body, hover to see the resolved value, secret masking.
- Auth helpers: Bearer, Basic, API key, inherit-from-collection. Then OAuth2 client-credentials.
- Paste a cURL command into the URL bar to auto-import it. Export to cURL / fetch / Python / axios.
- multipart/form-data with file fields. Binary body (file picker; desktop sends from a path).
- **Browser extension (C)** for Chrome/Edge and Firefox, with per-site optional permissions and header overrides via `declarativeNetRequest`. Allow about 1 extra week, including store review.
- **User-supplied proxy URL (D):** a Settings field plus the published `tidycode/http-proxy` Docker image.

### Phase 3: Importers and editor-native workflows (about 1–1.5 weeks)
- **`.http` file support** (VS Code REST Client / JetBrains format). This is the strongest fit for a text editor:
  - Open any `.http` file, and get a "▶ Send" gutter action above each `###`-separated request.
  - The response opens in a split pane.
  - Files stay plain text and diffable.
- Import a Postman Collection v2.1, an OpenAPI 3 spec (YAML or JSON, generating a collection), and Insomnia (optional).
- Compare two responses, or a response against a saved example, using `DiffViewer`.
- Save example responses on a request.

### Phase 4: Assertions and power features (later)
- **Declarative assertions instead of JS scripts:** `status == 200`, `header Content-Type contains json`, `$.data.id exists`, `time < 500ms`, `$.items.length > 0`. Run them in a collection runner with pass/fail report. Arbitrary user JS (Postman's `pm.*`) would need a sandboxed iframe or worker; defer it.
- Extract a value from a response into a variable (for example `$.token` into `{{token}}`) to chain requests.
- GraphQL mode with schema introspection. WebSocket and SSE tabs.
- Cookie jar (desktop).
- **AI hooks, if the AI plan ships:** "Explain this response", "Generate assertions", "Generate request from description", "Infer JSON Schema from response" (the existing `inferSchemaAction`).

- **Hosted cloud proxy (E):** only if data shows demand. See §2a for the minimum requirements.

**Total through phase 3:** about 5–6 weeks for one developer. That includes the local agent (about 3 days in phase 1) and the extension (about 1 week in phase 2).

---

## 5. Tauri command sketch

```rust
#[derive(Deserialize)]
struct HttpRequest {
    id: String, method: String, url: String,
    headers: Vec<(String, String)>,
    body: Option<HttpBody>,          // Text(String) | Base64(String) | File(PathBuf) | Multipart(Vec<Part>)
    timeout_ms: u64, follow_redirects: bool, verify_tls: bool,
}

#[tauri::command]
async fn http_request(state: State<'_, HttpState>, req: HttpRequest) -> Result<HttpResponse, String>
```

- Build one `reqwest::Client` per (verify_tls, follow_redirects) combination and cache it.
- Register a `CancellationToken` in `HttpState` keyed by `id`, and `tokio::select!` on it.
- Return body bytes as base64 so binary content survives IPC. Cap the in-memory size; offer "save body to file" for large downloads.
- Measure total time and time-to-first-byte with `Instant`.
- Only allow `http`/`https` URL schemes. Reject `file:`.

---

## 6. Files to create or touch

| New | Touch |
|---|---|
| `src/components/api-client/` (RequestTab, RequestBar, KeyValueEditor, BodyEditor, AuthEditor, ResponseViewer, CollectionsPanel, EnvironmentPicker) | `src/TidyCode.jsx`: new tab type, new-tab menu, sidebar section |
| `src/services/http/*` (section 3) | `src/components/CodeMirrorEditor.jsx`: `{{var}}` highlight extension and `.http` gutter "Send" |
| `src/hooks/useApiClient.js` | `src-tauri/src/lib.rs`: register commands |
| `src-tauri/src/http_client.rs` | `src-tauri/Cargo.toml`: `tokio-util` (CancellationToken), `reqwest` features `multipart`, `stream`, `rustls-tls`; `axum` for the local agent |
| `src-tauri/src/local_agent.rs`: 127.0.0.1 server, origin check, pairing, connected websites | Desktop Settings UI: agent on/off, connected websites, revoke |
| `extension/`: MV3 extension (background script, manifest, store assets) | Help content and Welcome page, including a "Why did my request fail?" page |
| `proxy/`: Dockerfile and small proxy server for transport D | |

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Web version feels broken because of CORS | Agent fallback chain (§2a). Clear failure diagnosis with next steps and CORS snippets |
| Local agent lets other websites reach the user's private network | Bind to 127.0.0.1 only, strict `Origin` allowlist, pairing token, user-visible revoke list, agent can be switched off |
| Extension's broad permissions put users off, or store review delays release | Per-site optional permissions requested when needed. The extension is never required, since A and B still work |
| `TidyCode.jsx` grows further (already about 12k lines) | All logic in `api-client/` and `services/http/`. `TidyCode.jsx` only routes tab type `request` to `<RequestTab>` |
| Secrets leak into history or exports | Store unresolved `{{vars}}` in history. Mask secret variables in exports and codegen unless the user opts in |
| Large responses freeze the UI | Cap rendering, offer "open in editor tab" (the WASM large-file path handles multi-MB bodies), stream to file on desktop |

## 8. Open questions
1. Web parity: are browser fetch, the desktop agent, the extension and a user proxy enough? Or will users who install nothing need a hosted proxy (E), which brings back sign-in, rate limiting and cost?
2. Is maintaining a browser extension, with its store listings and reviews, worth it, or should B and D cover the gap?
3. Should `.http` files be the native save format, or JSON collections plus `.http` import/export?
4. Should this ship before or after AI reinstatement? Phase 4's AI hooks depend on it.

---

## 9. Implementation plan following code review

Reviewed against the current repository on November 19, 2026. The architecture is workable, but the first release should be split into smaller milestones, with the local agent behind its own release gate. This section supersedes conflicting transport behavior, release sequencing, and estimates in earlier sections.

### 9.1. Findings and corrections

- **Tab integration requires more than a render branch.** The current serializer in `src/TidyCode.jsx` explicitly selects tab fields and would drop request data. Loading, saving, autosave, formatting, and file actions must recognize request tabs.
- **Secret storage is currently AI-specific.** Reuse encryption and keychain primitives from `src/utils/secureStorage.js` through a namespaced API; do not route API-client credentials through AI settings.
- **Select transport before sending.** Availability checks may choose another transport before execution. Never automatically replay a failed request through another transport: the server may already have processed it. Show the failure and let the user explicitly resend.
- **Remove automatic `no-cors` diagnostic retries.** A retry can send another request without reliably identifying the failure. Browser code cannot reliably distinguish CORS from other network failures. Report likely causes and actionable next steps without claiming certainty. See the [Fetch standard](https://fetch.spec.whatwg.org/).
- **Update local-agent browser assumptions.** Chrome introduced permission-gated local-network access; `Access-Control-Allow-Private-Network` alone is insufficient. Validate connectivity and permission behavior in supported browsers before committing to the agent implementation. See [Chrome 142 release notes](https://developer.chrome.com/release-notes/142).

### 9.2. Milestones and completion criteria

Estimates are engineering days for one developer, including focused validation.

| Milestone | Implementation | Completion criteria | Estimate |
|---|---|---|---|
| **1. Request contracts and persistence** | Define versioned request, response, error, and transport-capability models. Add IndexedDB stores for requests, history, and workspace state. Separate saved definitions from live execution state. | Reload restores request drafts and tab order; existing editor tabs still restore correctly. | 2–3 days |
| **2. Browser vertical slice** | Build `RequestTab`, request bar, editable headers/params, body modes, and response viewer. Implement browser transport, cancellation, timeout, and “Open response in editor.” | Send GET/POST requests to a controlled server; inspect JSON/text/headers; cancel a slow response; show honest browser limitations. | 3–4 days |
| **3. Desktop transport** | Add a shared Rust HTTP execution service, Tauri commands, cancellation registry, redirect policy, TLS setting, and bounded response reads. | Desktop handles non-CORS endpoints, binary responses, timeouts, redirects, and cancellation without leaking request state. | 3–4 days |
| **4. History and release hardening** | Add history sidebar, retention limits, redaction, size caps, preview lifecycle cleanup, and request-tab action guards. | History reopens editable requests; credentials stay out of persisted history; large responses remain bounded. | 2–3 days |
| **5. Collections, variables, and auth** | Add collections/folders, environments, deterministic variable resolution, secret references, Basic/Bearer/API-key auth, and cURL import/export. | Saved requests run against different environments; unresolved variables fail before sending; exports omit secrets by default. | 5–7 days |
| **6. Desktop local agent** | First prove browser connectivity, then add an opt-in loopback server, pairing, token storage, authenticated execution/cancellation, revocation, and Settings UI. | Unpaired, revoked, and disallowed-origin clients cannot execute requests; supported browsers pass pairing and permission tests. | 4–6 days |
| **7. Editor-native workflows** | Add `.http` parsing and send actions, split response view, saved examples, response comparison, then Postman/OpenAPI import. | `.http` files stay plain text; imports report unsupported features; comparisons reuse `DiffViewer`. | 5–7 days |

Ship milestones 1–4 first, followed by collections/auth, then the agent. Keep the extension and proxy as separate follow-on projects, and keep AI hooks outside the critical path.

Estimated delivery: **10–14 working days for the initial desktop/browser client**, or **about 5–7 weeks through milestone 7**, excluding extension stores, a proxy product, OAuth2, and collection runners. These estimates replace the earlier phase estimates.

### 9.3. Implementation decisions

- Keep `TidyCode.jsx` responsible for tab routing and app integration. Put execution and persistence in `src/services/http/` and `src/hooks/useApiClient.js`.
- Preserve query parameters as ordered rows, including duplicate keys and blank values. Avoid rebuilding URLs on every keystroke.
- Give each send a unique execution ID. Cancel on tab close, and ignore stale results after another send.
- Expose transport capabilities explicitly. Browser transport must disable unsupported TLS/header controls and mark unavailable timings or headers.
- Start with proposed limits of **20 MiB received**, **1 MiB rendered**, and **1 MiB per persisted response**, plus the 200-entry history cap. Enforce receive limits while reading rather than after allocating the full response. Clearly mark truncated display and stored content.
- Persist unresolved request definitions. Redact literal authorization, cookies, API keys, sensitive query fields, and response headers. Make response-body history storage optional because responses can contain secrets too.
- Render response HTML/XML as text. Sanitize SVG previews and avoid executing response content. Revoke preview object URLs when responses are replaced or tabs close.

### 9.4. Validation and release gates

Use a local HTTP fixture server with routes for duplicate headers/query keys, redirects, delayed responses, binary content, oversized bodies, and CORS failures.

- **Service tests:** variable precedence and unresolved variables, request serialization, query preservation, redaction, and cancellation races.
- **Rust tests:** timeout and redirect behavior, bounded response reads, cancellation, and registry cleanup after success or failure.
- **Browser checks:** tab restoration, send/cancel behavior, response rendering, history reopening, and existing editor actions with a request tab active.
- **Build checks:** run the web build and desktop compile before each release milestone.
- **Agent release gate:** validate origin and host checks, pairing expiry, authenticated cancellation, token revocation, browser permission denial, and connectivity in supported browsers. The agent ships only after these checks pass.

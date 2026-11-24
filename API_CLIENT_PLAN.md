# Plan: Postman-style REST API Client

## 1. Goal

Let users build, send, save, and inspect HTTP requests inside TidyCode, without switching to Postman or Insomnia. Optimize for a friendly first request, faster debugging, and fewer interruptions between API work and editing code. Product experience requirements and measurable release gates are defined in section 10. The client should reuse what the editor already does well:

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
- **Desktop (final implementation phase):** "Save collection to folder" writes plain JSON or `.http` files, so collections can live in git next to the code they test.

---

## 4. Phases

The implementation review in section 9 revises the release sequence and estimates below. Follow section 9 for implementation: select transports before sending, do not automatically replay failed requests or use `no-cors` diagnostic retries, and release the local agent behind its own validation gate.

### Phase 1: Browser MVP (7–10 working days)
- New tab type `request`. Add "New Request" to the new-tab menu and a command-palette entry.
- Method, URL, query params (two-way synced with the URL), headers, body (none / JSON / text / form-urlencoded).
- Send and Cancel using AbortController.
- Response viewer:
  - Status pill and time and size
  - Pretty JSON/XML via the existing formatter, plus raw text
  - Headers table
  - Inline image and PDF preview, reusing `PDFViewer` and `SVGViewer`
  - "Open response in new editor tab"
- Web: browser `fetch` transport (A) with full failure diagnosis and CORS snippets (§2a).
- Transport indicator in the request bar; browser transport is the initial implementation.
- History list (auto-saved). Click an entry to reopen it as a tab.
- Request tabs survive reload, like notes and todos do today.

### Phase 2: Collections, environments, and auth (about 1.5 weeks)
- Collections sidebar: folders, drag-to-reorder, rename, duplicate, delete.
- Environments: switcher in the request bar, `{{var}}` highlighting and autocomplete in URL/headers/body, hover to see the resolved value, secret masking.
- Auth helpers: Bearer, Basic, API key, inherit-from-collection. Then OAuth2 client-credentials.
- Paste a cURL command into the URL bar to auto-import it. Export to cURL / fetch / Python / axios.
- multipart/form-data with file fields. Binary body using the browser file picker; desktop path-based sending is deferred to the final desktop phase.
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
- **AI hooks, if the AI plan ships:** "Explain this response", "Generate assertions", "Generate request from description", "Infer JSON Schema from response" (the existing `inferSchemaAction`).

- **Hosted cloud proxy (E):** only if data shows demand. See §2a for the minimum requirements.

### Phase 5: Desktop-specific features (final implementation phase)
- Desktop Tauri transport with Rust cancellation, timeout, redirect control, TLS-verify toggle, bounded response reads, and large-download saving.
- OS keychain integration for API-client secrets, path-based binary uploads, and “Save collection to folder” as JSON or `.http` files.
- Desktop cookie jar.
- Desktop-app local agent (B), after validating browser connectivity: origin/host checks, pairing prompt and token, authenticated execution/cancellation, a “Connected websites” list, and revoke controls.
- Keep browser milestones independent of these features; implement desktop transport before the local agent so both reuse the same Rust execution service.

**Delivery estimates:** follow section 9.2. Extension, proxy, and power features remain separately scoped follow-on work; desktop-specific work comes after the browser and editor-native implementation milestones.

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
| **3. History and browser release hardening** | Add history sidebar, retention limits, redaction, size caps, preview lifecycle cleanup, and request-tab action guards. | History reopens editable requests; credentials stay out of persisted history; large responses remain bounded. | 2–3 days |
| **4. Collections, variables, and auth** | Add collections/folders, environments, deterministic variable resolution, secret references, Basic/Bearer/API-key auth, and cURL import/export. Use browser secret storage initially. | Saved requests run against different environments; unresolved variables fail before sending; exports omit secrets by default. | 5–7 days |
| **5. Editor-native workflows** | Add `.http` parsing and send actions, split response view, saved examples, response comparison, then Postman/OpenAPI import. | `.http` files stay plain text; imports report unsupported features; comparisons reuse `DiffViewer`. | 5–7 days |
| **6. Desktop transport and integrations** | Add a shared Rust HTTP execution service, Tauri commands, cancellation registry, redirect policy, TLS setting, and bounded response reads. Add API-client keychain integration, path-based uploads, collection save-to-folder, large-download saving, and desktop cookie jar. | Desktop handles non-CORS endpoints, binary responses, timeouts, redirects, and cancellation without leaking request state; desktop persistence and file operations pass platform checks. | 5–7 days |
| **7. Desktop local agent** | Reuse milestone 6's Rust execution service. First prove browser connectivity, then add an opt-in loopback server, pairing, token storage, authenticated execution/cancellation, revocation, and Settings UI. | Unpaired, revoked, and disallowed-origin clients cannot execute requests; supported browsers pass pairing and permission tests. | 4–6 days |

Ship milestones 1–3 as the initial browser client, then collections/auth and editor-native workflows in milestones 4–5. Complete all desktop-specific work at the end, in milestones 6–7. Keep the extension and proxy as separate follow-on projects, and keep AI hooks outside the critical path.

Estimated delivery: **7–10 working days for the initial browser client**, **17–24 working days through browser/editor milestone 5**, and **26–37 working days (about 5–8 weeks) through milestone 7**. Estimates exclude extension stores, a proxy product, OAuth2, collection runners, and other phase 4 power features. The expanded desktop milestone includes integrations beyond the original transport-only estimate. These estimates replace the earlier phase estimates.

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
- **Rust tests (desktop milestones 6–7):** timeout and redirect behavior, bounded response reads, cancellation, and registry cleanup after success or failure.
- **Browser checks:** tab restoration, send/cancel behavior, response rendering, history reopening, and existing editor actions with a request tab active.
- **Build checks:** run the web build before each release milestone. Add desktop compile and platform integration checks for milestones 6–7; browser milestones do not depend on new desktop functionality.
- **Agent release gate:** validate origin and host checks, pairing expiry, authenticated cancellation, token revocation, browser permission denial, and connectivity in supported browsers. The agent ships only after these checks pass.


---

## 10. User experience and developer productivity requirements

### 10.1. Product ambition

Make everyday API development easier to learn and faster to repeat than the tools developers currently use. Treat this as a hypothesis to validate with task-based comparisons, not an unsupported claim that TidyCode is already better.

Collections, variables, and request scripting are established capabilities in [Postman's documentation](https://learning.postman.com/docs/use/use-collections/create-collections/) and [variable documentation](https://learning.postman.com/latest-v-12/docs/use/send-requests/variables/variables). They are baseline capabilities, not sufficient differentiation. TidyCode's proposed advantage is the connected workflow: send a request, understand its response, find a value, compare a change, and continue editing without losing context.

### 10.2. Experience principles

- **Start immediately.** No account, workspace setup, or collection creation is required to send a request. Show a URL field, method, Send button, and a usable example. Keep advanced settings collapsed until needed.
- **Make the next action obvious.** Use clear labels, useful empty states, inline validation, and contextual help. Avoid introducing transport implementation details into ordinary tasks; explain browser limitations when they affect the request.
- **Preserve work and context.** Autosave drafts, restore tabs, keep request and response side by side, and preserve edits when changing body views or environments. Show save failures and offer recovery/export rather than silently losing changes.
- **Support both keyboard and mouse.** Provide discoverable shortcuts for sending, cancelling, finding requests, and switching environments. Maintain visible focus, labelled controls, screen-reader status announcements, and status indicators that do not depend on color.
- **Be predictable.** Show the active environment and transport, distinguish HTTP errors from execution failures, and never silently modify or resend a request. Preview generated changes and let users accept or undo them.
- **Keep help local and actionable.** Explain what failed and the next useful step. AI is optional; core editing, diagnostics, search, comparison, and reuse must work without it.

### 10.3. Features mapped to implementation milestones

| Developer task | Required experience | Delivery |
|---|---|---|
| Send a first request | Open New Request, paste a URL, and send without setup. Offer a sample request against a controlled CORS-enabled endpoint. Keep method, URL, Send/Cancel, and response status visible. | Milestones 2–3 |
| Edit request details | Editable ordered query/header rows, duplicate support, bulk text paste, and clear validation. Body formatting is explicit and undoable; invalid JSON stays editable. Switching body modes must not discard content without a recoverable draft. | Milestones 2–3 |
| Recover from a failure | Show a concise explanation with relevant actions: correct a URL, inspect authentication, review browser restrictions, or retry explicitly. Preserve the request. Label uncertain network diagnoses as possible causes. | Milestones 2–3 |
| Inspect a response | Pretty/raw views, body search, copy body/header/value, status/time/size, and a clear truncation notice. Keep the received raw bytes separate from formatted views. | Milestones 2–3 |
| Resume earlier work | Search history by method, URL, status, and time. Reopen a request without sending it. Duplicate a request without overwriting the original. | Milestone 3 |
| Bring an existing request | Paste cURL into the URL bar to preview an import. Explain unsupported flags before applying. Never execute the pasted shell command or automatically send it. Provide one-click code export with secrets excluded by default. | Milestone 4 |
| Understand variables and auth | Show unresolved variables inline with an action to define them. Reveal the winning scope and masked resolved value on demand. Explain inherited auth and generated header conflicts before sending. | Milestone 4 |
| Find reusable work | Search collections and requests, use descriptive names and folders, and switch environments without editing URLs. Keep the active environment visible; allow marking production environments with a prominent label. | Milestone 4 |
| Debug changed behavior | Compare a response with a prior run or saved example, navigate changed JSON paths, and copy a focused diff. Any ignore-fields option changes only the comparison view, never the stored response. | Milestone 5 |
| Reuse response data | Select a JSON value to copy its value/path or explicitly save it as a variable, with scope selection, overwrite confirmation, and secret handling. No automatic execution of another request. | Milestone 5; promoted from later power features |
| Verify behavior without scripts | Offer a small assertion builder for status, header, JSON-path existence/equality, and duration. Show pass/fail reasons per response. Keep collection runners and advanced assertion syntax deferred. | Milestone 5; promoted from later power features |
| Stay in the editor | Send from `.http` files, inspect in a split pane, open response text in an editor tab, format it, and compare it without recreating data manually. | Milestone 5; open-in-editor starts in milestone 2 |

The expanded milestone 5 scope (JSON-aware comparison, response-to-variable actions, and basic assertions) needs a fresh estimate after the browser MVP usability review. Earlier estimates are provisional and do not include this additional scope. Desktop-specific work remains last, in milestones 6–7.

### 10.4. Usability and performance release gates

These are proposed targets to measure, not achieved results. Use a controlled local fixture server and record device, browser, response size, and network conditions. Separate app interaction time from server/network latency.

- **First request:** at least four of five developers unfamiliar with TidyCode can send a sample request and locate its response body within 60 seconds, without coaching.
- **Core tasks:** at least four of five can add a header, edit JSON, cancel a slow request, and reopen history without coaching. No participant loses a draft during the test.
- **Reuse tasks:** after milestone 4, at least four of five can import cURL, configure auth, and switch environments. After milestone 5, repeat for comparing responses and reusing a JSON value.
- **Responsiveness:** target p95 visible feedback within 100 ms for Send/Cancel interactions and within 200 ms for local request search in a fixture with 1,000 saved requests. Show pending/cancelling immediately even if transport completion takes longer.
- **Large bodies:** the maximum renderable fixture must remain searchable and cancellable without locking the interface. Validate on a representative lower-powered device; use measured results to decide whether formatting/search needs a worker.
- **Accessibility:** complete the send/edit/inspect/reopen flow by keyboard, verify focus after errors and tab changes, and check status announcements with a screen reader.
- **Data recovery:** reload during editing, simulate storage quota failure, and verify draft recovery, visible save status, and safe export. Confirm history and exports follow secret-handling rules.

### 10.5. Competitive validation and prioritization

Use the same tasks, endpoint fixtures, and participant experience levels to compare TidyCode with Postman and at least one lightweight API client. Record tool versions and include both unfamiliar and experienced users. Measure task completion, active interaction time, errors, help requests, and a short ease-of-use rating. Separate setup time from repeat-use time.

Prioritize the largest observed sources of wasted time. Do not market superiority until repeatable results support it. A feature ships when its end-to-end task is understandable and reliable, rather than merely when its controls exist.

Keep the initial interface focused. Advanced protocols, extension/proxy projects, AI actions, and collection runners remain separately scoped. Browser transport limitations must remain visible in evaluation: usability improvements do not remove CORS restrictions.


---

## 11. Security, privacy, and credential protection

These requirements apply from milestone 1 and gate each feature's release. Desktop mechanisms remain in milestones 6–7. This section supersedes weaker storage, history, or export defaults above.

### 11.1. Threat model and privacy boundary

Protect against accidental credential disclosure, malicious imports/responses, injected page scripts, credential forwarding to the wrong host, and unauthorized use of future agents/proxies. Treat request URLs, query values, bodies, response bodies, and headers as potentially confidential, not just fields named “password.”

- Requests go directly to the selected API through the selected transport. No hosted proxy, cloud sync, or upload of API-client content by default.
- Explicitly exclude API-client records from existing application sync hooks. Never send request/response contents, full URLs, credentials, or environment values to analytics, crash reporting, support bundles, or logs.
- AI actions require an explicit action and a preview of the redacted content and provider destination before transmission. Never attach API-client context to background AI features.
- Explain where data is stored and which party handles a request. A configured proxy receives request credentials and content; disclose that before its first use. Switching transport must not silently move data to a new party.
- Local storage does not guarantee confidentiality against malware, a compromised browser profile, or scripts running in the application origin. Do not describe locally encrypted browser secrets as an isolated vault. [OWASP HTML5 Security](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)

### 11.2. Credential lifecycle and storage

| Data | Default behavior | Optional persistence |
|---|---|---|
| API tokens, passwords, client secrets | Keep in memory for the current page/app session; discard on reload or close. Persist only secret references in request definitions. | Explicit “Remember on this device” choice per secret. Browser: encrypted storage using a non-extractable key, with the limitations below. Desktop: OS keychain in milestone 6. |
| Saved requests and environments | Save templates, secret references, and non-secret configuration. Offer to move credential literals into secret fields before autosaving. | If sensitive literals cannot be safely separated, keep the draft in memory until the user chooses storage behavior. Never silently persist detected credentials. |
| Request/response bodies in history | Do not persist bodies by default. Store a redacted request template and minimal response metadata. | Explicit per-request or collection opt-in, with retention and size limits; explain that body content can include personal data and credentials. |
| Cookies and refreshed auth tokens | No ambient browser cookies by default; token responses stay in memory unless explicitly saved as a secret. | Desktop cookie jar is opt-in and scoped; provide clear/delete controls. |
| Agent/proxy access tokens | Treat as secrets, separate from API credentials. | Explicit persistence using the relevant secret backend; revoke independently. |

- Implement a namespaced secret-store interface (`get`, `set`, `delete`) independent of AI settings. Secret references use stable identifiers; renaming a variable must not orphan its secret.
- Browser encryption reduces casual inspection of stored data; same-origin malicious scripts can still use the decryption key. `sessionStorage` is also script-readable and is not the memory-only mode. Do not automatically inherit the existing AI storage defaults.
- If the keychain or encrypted store is unavailable, fail visibly and offer memory-only operation; never silently downgrade to plaintext. Avoid promising automatic memory zeroization in JavaScript.
- Mask secrets in fields, variable previews, request previews, history, error messages, and code generation. Reveal/copy is explicit. Explain that copying exposes a value to the system clipboard; do not promise reliable clipboard clearing.
- Provide replace/delete controls and show which requests reference a secret. Deleting a local secret does not revoke the credential at its API provider; explain how to rotate/revoke it there.
- Detection is assistance, not a guarantee. Custom header names and arbitrary bodies cannot be reliably classified automatically. Provide explicit sensitive-field marking and a per-request memory-only mode.

### 11.3. Request execution boundaries

- Allow only HTTP/HTTPS; reject URL userinfo credentials and invalid header names/values, including CR/LF injection. Never pass imported text to a shell.
- Default browser fetch to `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, and `cache: 'no-store'`. Cookie use requires an explicit per-request setting where supported; explain browser restrictions. These settings do not control target-server logging or replace CORS.
- Bind saved credentials to approved destination origins, including scheme and port. Require explicit approval before using them with a new origin after URL, variable, environment, or imported configuration changes. Treat legitimate internal APIs as supported destinations, not as globally blocked hosts.
- Default redirects off for authenticated requests. Where a transport can inspect redirects, strip credentials on cross-origin hops and stop HTTPS-to-HTTP downgrade. Browser fetch cannot provide a complete redirect inspection trail; do not promise equivalent credential protection for custom secret headers across automatic redirects. Require a compatible transport or keep redirects off.
- TLS verification stays enabled. Desktop insecure-TLS overrides are explicit, scoped to a request/destination, visibly indicated, and never global defaults. Explain insecure HTTP before sending credentials, with an explicit development exception where needed.
- Apply timeout, redirect-count, receive-size, parsing-depth, import-size, and concurrent-request limits. Cancellation and failure must release resources. Never retry or replay a potentially processed request automatically.

### 11.4. Untrusted content, exports, and application isolation

- Treat imported collections, `.http` files, OpenAPI documents, saved records, and API responses as untrusted. Validate schemas and bound parsing. Do not run imported scripts, execute commands, resolve external schema references over the network, or send requests during import.
- Display imports with a summary of hosts, auth, secrets, unsupported scripts, and remote references before applying. External references require a separate explicit fetch action with normal request protections.
- Keep HTML/XML responses inert. Sanitize SVG and prohibit active content and unsolicited external resource loading. Review PDF/image viewers for network requests and embedded actions before enabling response previews; use text/download fallback when isolation cannot be demonstrated.
- Render names, errors, URLs, and documentation as escaped content. Restrict CSP and third-party scripts in the API-client context; audit same-origin AI, analytics, service workers, and shared components that can access its data. CSP must accommodate user-chosen API destinations without implying that all outbound connections can be narrowly allowlisted.
- Export templates and secret references by default. Show a redacted preview and detected-sensitive-field summary. Including secret values requires explicit confirmation for that export; do not remember it as the default. Apply this to collection files, `.http`, cURL, generated code, examples, diffs, and support bundles.
- “Clear API client data” must remove databases, persisted encryption keys, secret-store entries, remembered tokens, history, examples, cookie jars, and in-memory responses as applicable. Offer granular controls and confirm destructive deletion. Do not promise secure erasure of browser/OS backups or already exported files.

### 11.5. Desktop agent and proxy requirements

- Keep the agent disabled until enabled by the user; bind to loopback only. Validate Host and exact Origin, reject missing/null origins on browser-facing execution routes, and protect against DNS rebinding.
- Authenticate execution and cancellation; separate token identity from the target API's Authorization header. Use short-lived, single-use pairing challenges approved in the desktop UI; rate-limit pairing attempts and never return a paired token from an unauthenticated health endpoint.
- Store only a verifier/hash of high-entropy agent bearer tokens where feasible. Scope grants per paired client; support expiry, rotation, revocation, and immediate invalidation of future requests. Explain and provide cancellation for already running requests.
- Limit request concurrency, body size, response size, time, and allowed operations. Never expose arbitrary file reads, shell execution, or generic Tauri invocation through agent messages. File uploads require separately authorized file selection/handles.
- Extension and proxy transports must meet equivalent authentication and data-handling requirements before shipping. Hosted proxy SSRF protections remain as specified in section 2a, including validation after DNS resolution and each redirect.

### 11.6. Security release gates

- **Milestones 1–3:** test with sentinel secrets in headers, URLs, bodies, and token responses. Inspect localStorage, IndexedDB, history, logs, error reporting, and exports for unintended persistence. Verify memory-only behavior, unavailable-storage handling, clearing data, inert malicious responses, credential-origin binding, and redirect protections.
- **Milestones 4–5:** verify secret precedence without disclosure, auth conflict handling, hostile/oversized imports, no import execution or external-reference auto-fetch, export redaction, and absence of secrets from comparisons/assertion failures. Inspect browser network traffic to confirm no content reaches sync, analytics, or AI services implicitly.
- **Milestones 6–7:** test keychain failures, cookie isolation, insecure TLS scope, unauthorized origins/hosts, pairing replay, token expiry/revocation, cancellation ownership, and agent resource exhaustion. Agent release requires a dedicated security review.
- Add dependency/security scanning appropriate to JavaScript and Rust builds; triage findings before release. Avoid claiming “secure” based solely on automated scans.

Use [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) and [OWASP Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) as review references. Security work is part of each milestone, and its cost must be included when estimates are refreshed.

## 12. Implementation progress

### Browser foundation — first increment

Implemented on `feature/api-client-implementation`:

- API Client activity-bar entry, Home entry, and `?tool=api` launch link.
- Dedicated API workspace with independent request tabs and in-memory drafts that survive switching tools.
- Editable ordered query/header rows; JSON, text, and URL-encoded bodies; bearer authentication; explicit body formatting with undo.
- Browser Fetch transport with cancellation, timeout, receive-size limits, redirect blocking, destination approval, and no retry/fallback execution.
- Read-only response views, search, byte download, copy, and explicit disclosure before opening a potentially persisted editor copy.
- Metadata-only session history; selecting an entry opens the current draft, not a historical snapshot.

This increment deliberately does not persist API requests, credentials, bodies, or history. Reload discards the session. Milestone 1's IndexedDB persistence/restore and the credential-safe autosave UX remain pending, as do collections, environments, import/export, assertions, and all desktop-specific features. API request tabs currently live inside the API workspace; they are not serialized into normal editor tabs. The normal editor receives a response copy only after an explicit user action and storage disclosure.

Validation commands and module boundaries are documented in `src/services/http/README.md`.


### Browser persistence and response clarity — second increment

- Explicit **Save locally** review (also Ctrl/Cmd+S), with an exact storage preview. Query/header values and request bodies default to excluded; optional inclusion requires a user choice and a plaintext-storage disclosure. Bearer tokens, known credential headers, and destination approvals never persist.
- Versioned IndexedDB templates and saved-tab order/selection restoration, with a Saved locally list, local-copy deletion, and full API-data clearing. Unsaved edits remain memory-only; saved snapshots do not automatically change.
- Visible memory/saved/unsaved states and storage-failure handling that preserves drafts and existing local copies. Reload restoration never sends requests.
- Separate **Body · Pretty**, **Body · Raw**, and **HTTP headers** views, with guidance about browser-exposed headers, echo-response bodies, and the complete headers in browser Developer Tools.

This supersedes the first increment's no-persistence limitation. Automatic credential-aware autosave, persistent secret storage, collections, environments, and imports remain pending. This is explicit template saving rather than transparent draft autosave.


### Optional saved responses

Saved request templates may now explicitly include the last response snapshot (up to 1 MiB), with body bytes, browser-readable headers, status, timestamp, and timing. The default remains off. Known credential response headers are omitted, but bodies may echo secrets or personal data; the save review discloses that the snapshot is readable local data. Re-saving with the option off removes an existing snapshot.

Reopening shows a dated **Saved snapshot** with an explicit stale-data notice and never sends a request. Request-only templates display an actionable empty state explaining how to send and save a response. Earlier responses that were not saved cannot be recovered. This supersedes the previous increment's blanket no-response-persistence limitation; history remains memory-only.


### Save-review defaults updated

At the user's request, query values, other header values, and the request body are selected by default when opening Save locally (including Ctrl/Cmd+S). A response snapshot is also selected when one exists and fits the 1 MiB limit; otherwise its option is unchecked and disabled. Users can deselect any option before saving. The explicit review and readable-local-storage disclosure remain. Auth-field bearer tokens and known credential headers are still excluded. This supersedes earlier descriptions of unchecked save-review defaults; saving is still explicit, not automatic.


### Responsive request/response layouts

The browser workspace now offers Auto, Split, and Tabs layouts. Auto defaults to side-by-side panels at sufficient available width and Request/Response tabs on narrower screens. Split has a draggable and keyboard-accessible divider; the layout preference and ratio are remembered independently of request data. Narrow screens use tabs while preserving the wide-screen preference.

Method, URL, and Send/Cancel remain shared above both panels. Sending selects Response to display progress; returning to Request while it runs is respected when the response arrives. The Response tab includes status/time/size. Editors remain mounted to retain drafts and undo history. Saved response snapshots remain clearly marked and reopening them never sends a request.


### One-click response editing

Open in editor now opens a temporary editable response copy immediately, without a confirmation dialog. A brief inline hint and editor banner explain that the copy is memory-only until explicitly saved to a file. Temporary copies are excluded from editor tab persistence and autosave; automatic AI completion/LSP is disabled. Successful explicit file saves convert the copy into a normal editor tab. This replaces the earlier blocking editor-copy storage confirmation.


### Response-copy notification

The temporary-response notice now uses the existing auto-dismissing toast instead of an inline editor banner, so it does not consume editor width. The copy remains session-only until explicit file saving. Toasts announce updates politely to assistive technology.


### Collections and import implementation

Added a local Collections sidebar with nested folders, inline create/rename/remove actions, request creation in collections/folders, and per-request Collection/Folder selectors. Removing collection/folder organization preserves its requests. Membership updates and metadata changes persist atomically; request content is not implicitly re-saved when moving it. Closed collection drafts stay available for this session, and only opened saved requests restore as tabs.

Import review supports cURL, Postman v2.1, OpenAPI 3 JSON/YAML, and a bounded .http subset through file selection, drop, pasted content, or cURL pasted in the URL bar. It previews destinations, request/folder counts, detected credential fields, unresolved variables, and unsupported features. Scripts never execute, external references never load, and imports never send requests. Imports create a new collection rather than overwriting an existing one. Only the first imported request opens as a tab.

Reviewed local saving includes request bodies/query/other header values by default, excluding auth-field tokens and known credential headers. Users can choose session-only request content. Collection/folder names still persist. Unresolved URL templates require session-only import until edited. Import/collection storage is atomic with bounded source size, request/folder counts, nesting, and saved-record totals. Environment resolution remains pending, so sending blocks unresolved variables across URL, auth, headers, and body. See src/services/http/README.md for the compatibility matrix.


### Local collection forks

Collection actions now include Fork. A review creates a named independent copy of current request definitions, including unsaved session edits, with fresh IDs for collections, folders, requests, and key/value rows. Folder hierarchy is remapped. Copy choices cover query values, other header values, bodies, and available response snapshots; users may also choose session-only request content. Defaults remain selected when data is available.

Auth-field bearer tokens, known credential headers, URL userinfo, and destination approvals are excluded. Snapshots remain bounded and dated, with readable-local-storage disclosure because bodies may echo secrets. The source is unchanged and no requests are sent automatically. Fork metadata retains the source collection ID solely for local provenance; upstream synchronization and merging are not implemented. Empty collections can be forked.


### Environments and variable resolution

Added an Environment picker and Variables editor covering Global → Collection → Environment → Request precedence, production labels, enabled entries, masked secrets, explicit reveal, and persistent or session-only apply. Sending resolves a transient copy; request templates do not change. Missing values/cycles/unsupported dynamic variables block execution. Query substitutions encode values safely and preserve duplicate keys. {{$uuid}} and {{$timestamp}} are cached per send. Resolution is bounded.

Non-secret variable values and definitions can be saved locally. Secret values (including credential-like variable names) remain memory-only, restore empty, and are not saved by changing the environment picker. Secret-derived aliases are masked in the inline inspector. Request templates may persist safe credential references such as {{token}}, while literal credential values remain excluded. Variable URL templates can now be saved and imported without expanding them.

Environment changes do not reset destination approvals, so forwarding credentials to a new resolved origin requires explicit approval. Response metadata records the environment used for that send. Imported variable declarations are not automatically copied yet; users define values in Variables. Fork review warns that collection/request scope overrides require configuration in the new fork. These notes supersede previous descriptions of variable resolution being unavailable.


### Sidebar cleanup and resizing

Added a remembered 200–480 px sidebar width (280 px default), pointer dragging, arrow/Home/End keyboard resizing, and double-click reset. Smaller windows constrain width to preserve the workspace; mobile uses a full-width sidebar without a drag handle.

Collection and folder actions now live in compact … menus with keyboard navigation and Escape focus return. Tree rows are single-line with full-name titles. Only the active request's ancestor path opens by default, explicit expansion choices persist, and search expands results. Unfiled saved requests no longer duplicate the Drafts list. Saved locally, History, and Storage & privacy use remembered collapsible sections, closed by default. UI preferences contain only dimensions, IDs, and booleans, not request or credential values.


### Compact workspace controls

Moved New request beside the single-row, horizontally scrolling request tabs. Grouped request name, collection/folder assignment, and save/duplicate actions into a compact wrapping toolbar. Environment selection, Variables, and layout controls now share the workspace header. Split mode no longer reserves a separate layout row.

Added a remembered collapsible Environments sidebar section with selection, creation, and management controls. New environment opens a draft in the existing variables editor; existing local/session-only and secret handling rules apply. Desktop and mobile browser checks cover these flows, tab overflow, toolbar alignment, and section persistence.


### Editor-style request tabs

Request tabs now match Code’s contiguous flat strip with compact titles, hover/focus close controls, a persistent plus button, first/previous/next/last navigation, keyboard navigation, middle-click close, and session drag reordering. Active tabs scroll into view. Layout selection moved from the header to the far right of the Request/Response control row, also available in split view. Browser checks exercise navigation, drag reordering, and selector alignment.


### Environment guidance and saved-copy removal

The environment sidebar explains that no environment means no environment overrides; global, collection, and request scopes still apply. Selected sidebar rows use a subtle tint and inset accent, with a checkmark for environments and a separate keyboard focus indicator. Each Saved locally row has an accessible remove control that deletes its persisted request/snapshot while preserving open in-memory drafts. Errors leave the saved row available for retry. Browser persistence checks verify removal, draft retention, and no network send.


### Environment action menus

Each named environment has a keyboard-accessible ellipsis popover with Copy, Manage, and Delete. Manage selects that environment’s editor scope without changing the active target. Copy opens a reviewed draft with fresh environment/variable IDs and blank secret values, retaining the production label. Delete removes only the targeted persisted environment and its in-memory definition; deleting the active target resets selection. It does not persist unrelated session-only settings or send requests. Browser checks cover all three menu actions.


### Tab close options and selection styling

Added a tab-bar ellipsis and per-tab context menu (including Shift+F10) with Close, Close Others, Close to the Right, and Close All. Batch closing cancels affected executions, preserves saved copies and collection definitions, and leaves one blank request when all tabs close. Menus support keyboard navigation and Escape. Sidebar selection now uses a soft full-row tint and subtle inset outline without a left stripe. Browser checks exercise all four close actions.


### Stacked request/response layout

Added Stacked to Layout: both sections remain visible in a single column, Request above Response. The preference persists across reloads and stays stacked on narrow screens. Auto and Split retain their existing responsive behavior. Browser checks verify section positions, visibility, persistence, and mobile overflow.


### Saved locally includes collection requests

Fixed the Saved locally filter: it now lists every persisted request matching search, including requests assigned to collections. The previous unfiled-only filter made saved collection requests appear missing. The count reflects the matching saved records; expanded/collapsed preference remains unchanged. Regression coverage imports saved collection requests and verifies their saved-list entries before and after reload.


### Reveal selected request in collections

Selecting or reopening a request now expands its collection and all ancestor folders, including when reselecting the already active tab. Moving the active request also reveals its new path. Other branches retain their expansion state, and users can still collapse the active branch until the next selection. Sidebar browser coverage verifies reselection reveals collapsed ancestors without opening unrelated folders.


### Export and portable collection backup

Added Export beside request actions (cURL for POSIX shells or Postman v2.1 JSON) and Export collection in collection menus. Exports use current request drafts plus unopened saved definitions, preserving folder hierarchy and disabled query/header rows in JSON. Postman JSON can be reimported through the existing review flow. Query/header values and bodies are off by default; recognized credential fields are stripped even when query/header values are included, while safe credential references may remain. Exact preview precedes copy/download. Variable expansion never runs. Environments, variable definitions/values, response snapshots, execution state, and history are excluded: this is a request-definition backup, not full workspace restore. Included generic bodies/values, URL paths, and names still require review for private data. Exports are bounded to 2 MiB in the UI.

Validation covers default omissions, recognized credential removal, shell quoting, nested collection reimport, duplicate and disabled parameters, body modes, downloaded bytes, modal behavior, mobile overflow, and no network sends. Next priority remains Basic/API-key authentication controls.


### Basic and API-key authentication controls

Added Basic username/password and API-key name/value with header or query placement alongside Bearer. Active fields resolve variables at Send; generated headers/query credentials never replace draft definitions. Basic validates usernames and UTF-8 encodes credentials. Duplicate generated headers/query keys and browser-forbidden headers block before sending. Query placement warns about URL logs. Literal authentication values remain memory-only across reviewed save, export, fork, and duplicate flows; safe references can persist. Postman/OpenAPI imports and Postman/cURL exports now preserve supported auth controls/references; cURL --user no longer prematurely encodes placeholders. Backward-compatible version-1 defaults cover existing records.

Unit/browser coverage verifies transport fields, conflicts, transient URL behavior, save/reload omission, variable references, exports/forks, and mobile layout. Next planned increment: compare the current response with a saved snapshot.


### Compare live responses with saved snapshots

Added Response → Compare with the saved snapshot as baseline and the current live response as target. Shows saved/current timestamps and environments, status/size/timing, exact UTF-8 body diff, browser-readable header diff, bounded JSON Pointer change summaries, previous/next change controls, and explicit comparison copy. No request is sent and no response is modified. Saving a response explicitly replaces the baseline. Restored or copied snapshots require a fresh send before comparison. Missing baselines explain how to save one.

Uses the same diff library as the existing Code DiffViewer with a dedicated read-only response UI, avoiding unrelated file merge/import controls. Body comparisons are limited to 128 KiB per response and 2,000 combined lines, with bounded diff work and JSON traversal. Binary/non-UTF-8 content and over-limit comparisons are declined explicitly. JSON path summaries are optional and omitted when precision/traversal cannot be trusted; body text remains exact, including BOM and formatting. Header comparison removes known credential/Location headers on both sides to match snapshot omissions. Comparisons remain session-only. Unit/browser checks cover diffs, pointers, limits, credential-header exclusion, snapshot retention, reload guidance, navigation, and mobile overflow.

Next priority: explicit response JSON value/path copy and response-to-variable actions.


### 10 MiB imports and response-to-variable workflows

Raised collection/text import source limit from 2 to 10 MiB for file, drop, and paste, with consistent labels/errors. Retained request/folder/depth and individual saved-record limits. Unit tests exercise a valid 4 MiB collection, exact 10 MiB source, larger byte counts, and multibyte UTF-8. Browser checks import an actual 4 MiB file and reject >10 MiB. Parsing is still synchronous; these fixtures do not establish a universal performance guarantee.

Added collapsible JSON value actions: select a JSON Pointer, reveal/copy decoded strings or exact-source JSON values, copy path, and explicitly save as a scoped variable. Source scanning preserves large integer and decimal lexemes. Selection is bounded (1 MiB, 500 nodes, depth 32) and rejects invalid/ambiguous JSON. Capture defaults to secret, forces known credential paths/names (including secret-bearing composites), confirms overwrite, supports session-only apply, and saves only the chosen variable/definition. No response or request is modified and no automatic send occurs. Secret values stay memory-only; persisted definitions restore empty. Values containing variable-reference syntax require manual review. Unsaved request scopes must use session apply or save the request before persisting. Browser tests verify copy, capture, reuse, overwrite, secret omission, targeted persistence, and mobile layout.

Next priority from the agreed sequence: declarative response assertions (status, headers, JSON values, duration).


### Declarative response assertions

Added Request → Assertions and Response → Assertions. Checks cover status equality, header presence/substring, JSON Pointer existence/scalar equality, and strict duration thresholds. Enabled checks run once after each response; disabled checks report skipped. Results capture the send’s definitions, remain unchanged by later edits, and never modify responses or trigger follow-up requests. No JavaScript, regex execution, collection runner, or templated expected-value expansion is included.

JSON comparison preserves numeric precision and supports equivalent decimal/exponent representations. Work is bounded to 50 rules, expected strings of 4096 characters, JSON Pointer paths of 512 characters, and existing JSON body/node/depth limits. Missing/hidden headers and malformed checks have explicit failures without echoing response values. Local saving includes assertion definitions only via a new review checkbox, off by default because expected values may contain private data; execution results never persist in snapshots. Existing records default to no assertions. Postman/cURL export and local forks omit assertion definitions with disclosure, while duplicating retains definitions without results.

Unit/browser coverage covers pass/fail/skip, precise JSON values, invalid checks, retained last-send results, reviewed persistence/reload, mobile layout, and no additional sends. Next priority from the agreed list: send actions from .http editor files.


### Send requests from HTTP editor files

Added Code toolbar actions for .http/.rest tabs: Open HTTP request transfers the block at the cursor to an unsaved API draft without sending; Send HTTP request uses that block and the shared browser transport once. Parsing uses the live editor document/cursor, supports ### blocks and CRLF, and selects the first request only for a genuine comment/declaration preamble. Empty/unsupported blocks fail instead of silently selecting another request. Warnings, including ignored file declarations and unresolved placeholders, open for review without sending. Scripts/file references are rejected; no file reads or arbitrary code run.

The source file is never modified by API actions. A source editor-tab/block mapping reuses API drafts for repeated actions, preserves destination approvals and app-side collection/assertion configuration, and refreshes request content from the source. This mapping is memory-only; changing block order can change the mapping, so source is always reparsed. API templates require explicit Save locally. Normal Code file persistence remains independent. Selection is bounded to 10 MiB, 100,000 lines, and 10,000 blocks. Added examples/api-client/editor-workflow.http. Unit/browser checks cover selection, live edits, no-send review, repeated sends/draft reuse, unchanged source, script rejection, no automatic API persistence, and mobile.

Next priority from the agreed list: multipart/form-data and binary request uploads. Desktop transport remains last.


### HTTP editor request outline

Replaced the empty structure view for .http/.rest files with HTTP requests: named method/line entries, cursor-based selection, jump-to-source, per-request Open and Send, filtering, and an insert-template action with normal editor undo. Per-row actions re-read the live source and target that row independently of the cursor; changed outline identities require reselection. Inserting only edits source and uses an unresolved base_url placeholder so it cannot send accidentally. Listing is capped to 200 visible matches; selection and source bounds remain shared with the editor request workflow.

HTTP files now use HTTP syntax highlighting and explicit HTTP classification instead of YAML heuristics. Generic data Format/Convert controls are disabled for these source files. The existing panel toggle and resize remain available; HTTP panel width preserves editor space. Unit/browser checks cover shared source ranges, no URL-query leakage in outline metadata, navigation/highlight, row-targeted sends, search, insertion, source retention, and narrow layouts. Responses still open in the API client; an inline response pane is a future enhancement.

## 13. HTTP editor capability roadmap — browser first

Decision recorded November 22, 2026: extend the HTTP editor experience with capabilities supported by the browser now. Implement features that require native networking or operating-system integration when desktop support is extended, after the browser milestones. This section supersedes earlier “next priority” notes where their ordering differs. It is planned work, not a statement of completed JetBrains compatibility.

### 13.1. Interaction model and toolbar cleanup

The HTTP requests outline is now the primary place to discover, navigate, open, and send requests. Remove the redundant **Send HTTP request** and **Open HTTP request** buttons from the Code toolbar. Keep the **Requests** toggle so the outline remains discoverable when hidden. Add keyboard and editor context-menu actions for the request at the cursor; these must continue working with the outline closed.

Selecting a request or moving the cursor highlights/navigates without execution. **Open** reviews a request in the API client; **Send** explicitly executes once. Show which request and environment will run, then pending/cancel/status feedback. Preserve source files, undo history, destination approvals, and the distinction between source content, API drafts, and execution results. Existing warning-to-review behavior remains in place until the relevant syntax is implemented. Never introduce automatic replay or transport fallback.

### 13.2. Browser implementation sequence

| Order | Capability | Implementation and completion criteria |
| --- | --- | --- |
| 1 | Toolbar cleanup and contextual actions | Remove the two duplicate toolbar buttons; retain Requests, add a documented keyboard shortcut and context-menu Open/Send actions. Cursor targeting and hidden-outline behavior pass checks. |
| 2 | Intelligent editing | Complete HTTP methods, common header names, content types, and defined variable references. Surface malformed request lines, header problems, and unresolved references inline with useful explanations. Completion reads local definitions and does not disclose secret values or transmit source content. |
| 3 | Request folding and body-aware editing | Fold individual request blocks and their headers/bodies. Recognize JSON/XML bodies for language-aware editing. Add explicit formatting of the selected body only, preserving values, large-number precision, header order, delimiters, and other requests; formatting is undoable. Generic document-to-YAML/JSON conversion stays disabled for HTTP source. |
| 4 | Response pane beside the source | Show the selected request's result in a resizable Code workspace pane, with status, timing, readable headers, body views, cancellation, assertions, comparison, and value actions. Preserve editing context and reuse existing transport/viewer logic. Responses remain session-only unless explicitly saved, and source text remains unchanged. |
| 5 | Environment controls in Code | Show/select the active environment in the HTTP outline, including a prominent production indicator. Provide variable inspection and unresolved-reference actions. Selection and precedence must match the API client; changing environments does not send requests, persist secret values, or reset destination approval. |
| 6 | File-native variables and reviewed environment imports | Support a documented subset of `@name=value` declarations and explicit environment-file selection/import. Specify file/request/environment/global precedence and duplicate-name behavior before implementation; do not silently change existing collection/environment/request semantics. Review public/private values, mask secrets, and require re-entry after reload. Browser access is limited to explicitly selected files/handles; no arbitrary disk reads. |
| 7 | Request authoring tools | Add templates for common methods, JSON bodies, auth, and uploads; duplicate, rename, reorder, and extract request blocks into a new/downloaded file. Offer locally imported OpenAPI endpoints for completion. Source edits are explicit and undoable, credentials are excluded from reusable templates, and export compatibility is explained. |
| 8 | Browser uploads and advanced execution | Implement multipart/form-data and binary request bodies with browser file selection and bounded previews. Add an explicitly started sequential runner, cancellation/stop-on-failure controls, and reviewed response-to-variable dependencies. Keep browser CORS, redirect, credential, and size limits visible. Do not automatically rerun non-idempotent requests. |

The immediate batch is orders 1–3, followed by the inline response pane. Existing multipart/binary-upload work remains on the browser roadmap; it does not require waiting for desktop transport. New scope needs estimates after a focused design/validation pass; earlier milestone estimates do not cover this entire expansion.

### 13.3. Deferred until desktop support

| Capability | Why native support is needed / planned boundary |
| --- | --- |
| Requests that browser Fetch cannot perform because of CORS or browser-controlled headers | Shared desktop HTTP execution service, with explicit transport choice and the same credential/destination protections. Desktop transport does not remove server authorization or operating-system/network restrictions. |
| Per-request TLS/client-certificate settings and custom trust configuration | Native HTTP/TLS configuration; retain secure defaults and make exceptions explicit. |
| Client-managed cookie jars, proxy settings, and controlled redirect handling | Native networking capabilities beyond the current browser transport. Reassess credential forwarding at every redirect/origin boundary. |
| Path-based uploads, external request-body file references, and project-relative environment discovery | Explicit operating-system file permissions, path validation, and bounded reads. Browser file-picker uploads/imports remain available independently. |
| OS keychain integration and API-client workspace folder persistence | Platform credential/file APIs and explicit lifecycle/access controls. |
| Native large-download streaming and authenticated loopback agent | Desktop storage/network integration, cancellation, pairing, allowed origins, revocation, and platform validation. |

Keep desktop networking and the local agent at the end of implementation, consistent with milestones 6–7. Do not add a hosted proxy merely to simulate desktop parity.

### 13.4. Compatibility scope and separately designed extensions

“Feature complete” should mean completion of a documented capability matrix, not an unqualified claim of supporting every JetBrains HTTP file or protocol. Track each feature as supported, browser-limited, planned, or intentionally unsupported, with import/execution warnings where relevant.

OAuth2, GraphQL authoring, and browser WebSocket workflows are not inherently desktop-only, but need their own product/security design and prioritization after core REST editing. Native gRPC and unrestricted protocol/header behavior are not equivalent to browser WebSocket or gRPC-Web support and must be scoped separately.

JetBrains pre-request/response JavaScript handlers are also not inherently desktop-only. Arbitrary scripting remains deferred pending a separate sandbox, permission, resource-limit, and credential-access design. Do not introduce `eval`, shell execution, or unrestricted file/network access to pursue compatibility. Declarative assertions and explicit value extraction remain the default workflow.

### 13.5. Reference experience and validation

JetBrains documents completion, folding, request formatting, inline documentation, body language support, templates, refactoring, request navigation, and execution from its HTTP editor. Its variable scopes and scripting API are broader than our current supported subset. References reviewed November 22, 2026:

- [JetBrains HTTP Client editor capabilities](https://www.jetbrains.com/help/idea/http-client-in-product-code-editor.html)
- [JetBrains HTTP Client variable model](https://www.jetbrains.com/help/idea/http-client-variables.html)
- [JetBrains HTTP Client scripting reference](https://www.jetbrains.com/help/idea/http-client-reference.html)

Validate every browser increment against live editor content/cursor selection, stale-outline handling, no execution from navigation/completion/formatting, undo/source preservation, secret masking and persistence isolation, correct result-to-request association, responsive layouts, and bounded work on representative files. Keep accessibility and keyboard navigation part of the feature's completion criteria. We do not yet have evidence of feature-use frequency among TidyCode users; use voluntary usability feedback to prioritize further parity rather than treating competitor support as proof of demand.


### 13.6. Priority 1 implemented — contextual HTTP actions

Removed Send HTTP request and Open HTTP request from the Code toolbar. Requests remains the outline toggle, and per-row Open/Send remain available. Added editor-only Ctrl/Cmd+Alt+R (Send) and Ctrl/Cmd+Alt+O (Open), including when the outline is hidden. Auto-repeat is ignored to prevent held keys from replaying requests; AltGraph input and other panels/inputs do not invoke these shortcuts.

HTTP editor right-click targets the clicked source position. Shift+F10/Context Menu key opens the same keyboard-accessible menu at the cursor: Send request, Open in API client, and Show HTTP requests. Escape restores editor focus; arrows/Home/End navigate enabled items. Menu state clears on tab/panel changes. Existing live-source selection, warning-to-review, script rejection, source preservation, and session-only API draft behavior remain. Shortcut instructions live in a compact outline disclosure. Non-HTTP editor context menus remain unchanged.

Browser checks now exercise both modifier families, hidden-outline actions, context-menu targeting/Escape, outline recovery, and held-key suppression alongside prior HTTP editor safeguards. Next browser priority is intelligent completion and inline validation (13.2, order 2), followed by folding/body-aware editing.

### 13.7. Browser priorities 2–8 implemented

Completed the remaining browser sequence as one reviewable batch. Desktop transports, native disk references, custom TLS/cookie/proxy controls, local agent, arbitrary JavaScript handlers, and the separately designed OAuth2/GraphQL/WebSocket extensions remain deferred.

| Priority | Delivered behavior |
| --- | --- |
| 2 — Intelligent editing | Local HTTP method/header/content-type/variable completion, locally imported OpenAPI endpoint suggestions, and inline request URL/header/JSON/unresolved-variable diagnostics. Completion receives definition names/availability, not secret values. Automatic AI/LSP completion is disabled for HTTP source. |
| 3 — Folding/body editing | Request/header/body folding; JSON/XML-aware HTTP body highlighting/indentation; explicit selected-body JSON/XML formatting with ordinary Undo and exact numeric preservation. Surrounding headers, other blocks, and source values remain unchanged. |
| 4 — Inline responses | HTTP sends stay in Code and use a resizable response pane with status, environment, timing/size, cancellation, search, raw/pretty, headers, assertions, saved comparison, value actions, safe editor copies, and byte download. Open still navigates to the API client for review; View in API client selects the same draft/result. A shared client instance supplies both surfaces. |
| 5 — Editor environments | Shared environment selection, production labeling, and Variables access from the outline. Selection never sends or saves secret values, and destination approvals carry forward. |
| 6 — File variables/imports | Literal `@name=value` declarations before the first block (file) and before a block's request (block scope). Explicit environment-file import supports Postman or named JSON maps with bounded nested dotted keys, secret-first review, private-file protection, targeted persistence, and no automatic activation. |
| 7 — Authoring | GET/JSON/form/Bearer/upload templates; per-row rename, duplicate, move up/down, and safe reviewed extraction to a downloaded HTTP file. Source edits are undoable. OpenAPI URL completion indexes newly imported OpenAPI collection definitions locally and strips query values from suggestions. |
| 8 — Uploads/runner | Browser file-picker multipart and binary bodies with a 20 MiB combined payload cap, session-only file selections, and explicit boundary handling. File/collection runners execute reviewed selected steps sequentially, support stop-on-failure/cancellation, and optionally capture bounded JSON values into secret run-only variables for subsequent steps. No retries or automatic starts. |

Variable precedence is now explicitly Global → File → Collection → Environment → API request → Request block. Runner captures are explicitly configured run-only overrides at the final block level; shadowing existing definitions requires a checked override choice. Expected assertion values remain literal, not templates. File/block definitions stay on the transient execution request and do not enter saved API templates. HTTP source is normal plain-text Code content and follows normal editor storage; it is not encrypted secret storage. Use secret API variables or explicitly imported private environment definitions for credentials. Source-to-API draft bindings remain session-only; after reload use source declarations/global/environments or reopen saved API templates independently.

Resource boundaries: editing assistance up to 1 MiB (first 500 request blocks / 100 diagnostic messages), body formatting up to 1 MiB, source actions up to 10 MiB/100,000 lines/10,000 blocks, 200 visible outline matches, up to 200 declarations per file/block scope (4,000 total), values up to 64 KiB, reviewed environment import up to 1 MiB with existing scope limits, up to 200 run steps, and multipart up to 100 fields / 20 MiB combined content. Captured values reject embedded variable-reference syntax. Files, captures, and results never persist automatically. Live execution bodies share a 64 MiB retention budget; older bodies are released with an explicit notice while assertion results remain. Browser limits still apply to every send.

Compatibility corrections found during integration: `### GET users` is treated as a title, not a request line; stale authoring rows require reselection; secret-derived URL changes retain origin approval checks; modal actions do not invoke hidden source shortcuts; Code's toolbar scrolls independently on narrow screens.

Acceptance fixtures and a complete manual checklist are in `examples/api-client/README.md`, `browser-capabilities.http`, `browser-runner.http`, and `browser-environments.example.json`. Automated coverage includes local completion/diagnostics, precise formatting/Undo, folding, shared inline execution, environments and persistence isolation, authoring/extraction, uploads, dependent runs, cancellation, retention, mobile layout, and regression suites. This is the supported browser capability matrix, not a claim of complete JetBrains syntax/protocol parity.

### 13.8 Synthetic request data (implemented)

The API client Body and Params sections now offer a reviewed test-data generator. Local rules support repeatable seeds, normal and boundary cases, explicit empty/null negative cases, nested JSON, primitive enums, common synthetic formats, bounds and record counts. A bounded JSON Schema subset is editable in the dialog; inference copies structure/types, never existing values. Body generation applies JSON; Params generation merges primitive query fields by name. Generation never sends or automatically saves a request.

AI generation uses an explicitly selected configured cloud provider after per-input consent. Only the reviewed schema, instructions, record count and synthetic-data guidance are submitted. Request URLs, headers, credentials, responses and variable/environment values are excluded. Secret scanning guards the supplied input, output is validated locally, variable references are rejected, and there is no fallback to another provider. Private field names and user-entered enum values remain user-reviewed AI input. Local rules remain available without AI. Desktop-local model support, full schema dialects and dataset-driven runner integration remain future work.

Validation includes deterministic rules/bounds/limits, inference privacy, AI structural/format validation, preview/apply/Undo, modal shortcut isolation, explicit consent, mocked provider payload inspection, invalid AI rejection, params application and mobile layout. See examples/api-client/README.md for acceptance steps.

Source workflow: `.http` and `.rest` requests expose body/query data generation in outline ellipsis and editor context menus. The shared generator applies reviewed data directly to the selected source block with one Undo transaction, preserving neighbors, declarations and other headers/query fields. Stale source changes block application; no request execution or API workspace switch occurs.

## 14. Next priorities — queued until current testing is complete

The current testing and feedback cycle comes first. The following is the agreed order for subsequent implementation; these items are planned, not delivered, and should not start until testing is complete.

| Priority | Work | Intended outcome |
| --- | --- | --- |
| 1 | Stabilize the beta | Resolve testing feedback; verify representative large collections, accessibility, credential handling and consistent API/source editor behavior. |
| 2 | Make test-data generation easier | Visual field/rule editor, reusable presets and generation from imported OpenAPI schemas, reducing manual schema authoring. |
| 3 | Data-driven collection runs | Execute reviewed generated datasets or imported JSON/CSV records with per-record assertions and downloadable results. |
| 4 | Improve assertions and reports | Schema validation, richer response comparisons and clear run-level failure summaries. |
| 5 | OAuth 2.0 authentication | Separately designed authorization-code/PKCE flow, explicit token lifecycle and browser limitation guidance. |
| 6 | GraphQL support | Query/variables editing, schema exploration and assertions, with its own bounded browser/security design. |
| 7 | SSE and WebSocket tools | Stream/message inspection with explicit connection, cancellation and resource controls. |

Desktop transport, OS keychain, cookie jars, custom TLS/proxy controls, native file paths and the local agent remain in the final desktop phase. Arbitrary scripting and hosted proxies remain separately scoped. The next productivity workflow after stabilization is test-data generation → data-driven runs → useful reports.

Current testing refinement: variable hover previews are also available in API Client request fields and body editors. Public values follow the same environment/scope resolution as execution; secrets and secret-derived values are masked. Hover never sends a request, mutates source, persists resolved values or invokes AI.

Current testing refinement: Form URL encoded bodies now default to editable key/value Fields with a synchronized Raw view. Rows preserve duplicate keys, blanks, literal reserved characters and readable variable references. Raw input warns about colon-style pairs and line breaks; conflicting explicit Content-Type headers offer a targeted correction. Sensitive literal field values are masked in Fields, while Raw is explicitly the full-body editing view. Bodies over 200 fields use Raw. The canonical portable request body remains a string; neither view switching nor editing sends requests. Native/local-agent work remains deferred.

## 15. Desktop implementation — shared UI and native transport

At the user's request, the desktop phase has started with a native HTTP foundation while retaining the shared API Client workspace, HTTP source outline/editor, request models, variable resolution, collections, assertions, runners, form editing and data-generation UI. Web continues to use browser fetch. Desktop execution routes through Tauri IPC to a new Rust `api_http` engine; no web-to-local agent/listener, cloud proxy or automatic fallback is introduced.

Implemented in this increment: native request/cancel commands, native desktop transport badge and header/settings guidance, form and selected-file body encoding, precise binary response decoding and explicit native save-dialog downloads, readable native HTTP error and redirect responses, explicit Cookie/User-Agent headers, verified TLS defaults, no redirects/retries/proxy/cookie jar, bounded headers/body/response/concurrency/timeout, cancellation-before-start and cancellation during IO. Both Code HTTP files and API workspace/runners reuse this transport. Existing destination-approval and persistence rules remain active. IPC errors omit URLs/credentials and response snapshots retain existing secret-header exclusions.

Validation: Rust local HTTP fixtures cover no-CORS errors and exact binary bytes, returned redirects, validation, cancellation, timeout, response size and concurrency. JS adapter tests cover IPC encoding, form credentials, binary/multipart uploads, error sanitization, cancellation, header policy and dispatch without fallback. Native macOS debug build and browser regression testing are part of acceptance. Cross-platform GUI/installers require later testing. Local acceptance fixtures live in examples/api-client/desktop-native.http and desktop-smoke-server.cjs.

The API credential-vault increment is recorded below. Remaining desktop increments: reviewed TLS/custom-CA and proxy controls; explicit cookie-jar management; native path-based upload and larger-download workflows; then optional paired local-agent mode for web users. These are not included in the transport increment. Native HTTP alone does not make all JetBrains syntax/protocol features available.

### 15.1 Desktop OS credential vault

The next desktop increment adds an API-specific OS vault (macOS Keychain, Windows Credential Manager, Linux Secret Service) under a namespace separate from AI-provider keys. Desktop API Client exposes Vault management; secret-variable rows in the shared Variables dialog expose Vault… and Clear. Explicit Use loads a credential into the chosen draft variable; Apply/Save remains required. There is no startup/send auto-read, automatic persistence, or credential forwarding to another scope. Existing secret masking, destination approval and export omission continue to apply.

Vault Save, confirmed Replace and confirmed Delete take effect immediately, independently of Variables Apply/Cancel. Values live only in the OS store and explicitly loaded session memory. Local catalog metadata contains opaque UUIDs and user-chosen names only; no secret values or associations are added to request backups. OS failures never fall back to plaintext. Catalog writes are checked before a new keychain entry is committed, and denied writes roll back the new catalog entry. Deletion is idempotent when the OS entry is missing. Session copies and server-issued tokens are not revoked by deleting a vault entry. Clear workspace/API data retains the vault and catalog, as disclosed in its confirmation. Clearing all app storage outside that workflow can orphan keychain entries; users should delete entries in Vault first or manage them in the OS store.

Bounds: 200 entries, 128-character labels, literal values up to 64 KiB subject to lower OS-backend limits, UUID-only native identifiers. Native keychain operations run off the UI thread and return sanitized errors. Automated tests use a fake OS bridge, validate persistence isolation and confirmations, and avoid creating real user keychain entries. Actual OS permission prompts and cross-platform behavior remain manual validation items. TLS/proxy/cookie controls and path uploads remain subsequent desktop increments.

Vault selection correction: Use now records the chosen opaque credential ID on the local secret-variable definition, so the dialog reopens on the correct credential name. Applying/saving retains selection metadata while secret values remain omitted. This is metadata only, not a direct vault reference or automatic-read permission. Manual value edits detach the association, copied environments drop it, and missing entries require an explicit new selection. Regression coverage includes switching between two credentials, saving/reopening the variable, and checking that reopening never reads the OS secret.

### 15.2 Desktop request-scoped TLS/custom-CA and proxy controls

Desktop Settings now provides TLS verification, a user-selected PEM CA bundle, an explicit HTTP(S) proxy and masked proxy credentials (literal or secret-variable references). Verification stays on by default; no system/environment proxy is inherited. Changes require Apply. Custom trust, proxies and disabling verification require explicit review; insecure verification disables certificate/hostname checks for the request's TLS connections (including an HTTPS proxy), with a persistent applied-state warning. CA trust is additive to system roots for this request only. No redirects or retries are introduced.

Settings are pinned to the resolved target origin. Target/environment changes reset UI approval and a stale origin prevents execution until reviewed/reset. Existing credential-destination approval remains an independent gate. Proxy URLs cannot embed credentials, paths, query strings or fragments; authentication is handled separately by the native proxy client. PEM bundles are bounded to 128 KiB/16 certificates and reject private keys. Native enforcement repeats the scope/confirmation/URL/size validation independently of frontend checks.

Network settings and proxy credentials remain session-only; saved templates, exports and forks omit them, and request duplication resets them. HTTP-file requests retain reviewed settings on their transient source bindings. No native file paths or global trust stores are read/changed. Cookie-jar controls, mTLS client identities, SOCKS/system proxy selection, PAC/no-proxy rules and local-agent mode remain later desktop work.

Validation includes real local TLS fixtures (default untrusted rejection, custom CA acceptance, subsequent default rejection, confirmed bypass), native explicit proxy forwarding/authentication without target DNS, per-origin guards, no private keys/embedded proxy credentials, secret-variable masking, save/export omission, duplicate reset and narrow layouts. Synthetic test certificates are separate test-only resources with a documented renewal date. Windows/Linux GUI and platform-specific TLS/proxy checks remain manual release gates.

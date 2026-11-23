# API client: browser foundation

Open **API Client** from the activity bar, the Home card, or `/?tool=api`.
This is a browser-only initial slice. It makes real requests through Fetch;
CORS, browser-restricted headers, and browser TLS policy apply. The sample URL
belongs to httpbin, a third-party service, and is never sent automatically.

## Current scope

- Independent request tabs inside the API workspace; drafts survive switching
  to Code/Notes/Tasks. Explicitly saved templates reopen after reload; unsaved edits do not.
- Ordered query rows, duplicate parameters, disabled rows, headers, Bearer/Basic/API-key auth,
  JSON/text/form-urlencoded bodies, explicit JSON formatting with undo.
- Send/cancel, bounded receive size, timeout, origin approval on destination
  changes, and blocked redirects. GET/HEAD preserve but do not send body drafts.
- Read-only Pretty/Raw/Headers views, search, byte download, clipboard copy,
  and a one-click temporary editable copy in Code.
- Session history contains response metadata and a request ID only. Selecting
  history selects the current draft; it does not recreate a historical snapshot.

There is **no API-client cloud sync, analytics, AI integration,
or desktop transport** in
this slice. Do not attach these request objects to existing editor autosave,
notes/tasks sync, AI context, or logging. Response editor copies are session-only: excluded from browser tab persistence and autosave, with automatic AI/LSP disabled. Explicit file saving converts the copy to a normal editor tab.
Use **Save locally** (or Ctrl/Cmd+S) to review an exact template preview before
writing it to IndexedDB. Query/header values and bodies are selected by default in the review; users can deselect them.
Known credential headers and literal authentication values are always removed. Optional included
values are readable local data, not encrypted secrets. Saved templates do not
autosave later edits. Storage failures preserve the draft and previous copy.
**Remove local copy** deletes a template; **Clear API data** clears all local API
templates and the live session. History remains session-only. **Include last response snapshot** is selected by default when a response of up to 1 MiB is available; users can deselect it. Snapshots are limited to
1 MiB, retain raw bytes as base64 plus status/timing/readable headers, and omit
known credential response headers. Bodies may echo credentials; inclusion
requires explicit review and is not a secret-storage mechanism. A snapshot is
clearly dated and never represented as a fresh result. Reloading or opening a
saved template never sends it automatically. Existing request-only templates
cannot recover an earlier response that was not saved.

## Collections and imports

The sidebar supports local collections, nested folders, inline renaming, request
creation in a folder, and moving requests using Collection/Folder selectors.
Removing organization keeps requests in Unfiled; it does not delete their data.
Collection/folder metadata and saved request membership persist locally. Open
tabs are separate from the library: importing opens the first request only.

Use **Import requests** beside Collections. Choose a file, drop it onto the file
area, paste content, or paste cURL into the URL bar to open review. Preview shows
request/folder counts, destination origins, credential detection, unresolved
variables, and compatibility warnings. Nothing executes during preview/import.
Imports always create a new collection with fresh identifiers.

Local saving is selected when URLs can be saved, with an exact storage preview
and readable-data disclosure. Literal authentication values and known credential
headers are omitted from stored requests. Imported credentials can remain in
memory for the current session. Deselect local saving to keep request content
session-only (collection/folder names still persist). URL templates can be saved without resolving their values. Define referenced variables before sending. Requests never send automatically.

| Format | Supported | Explicit limits |
| --- | --- | --- |
| cURL | Literal URL, method, headers, Basic/Bearer header values, JSON/text/form data, GET/HEAD | No shell execution, substitutions, operators, or file reads. Unsupported flags reject the import; redirect/TLS flags produce warnings. |
| Postman v2.1 | Nested folders, request/query/header data, raw/URL-encoded bodies, inherited Bearer/Basic/API-key auth | Scripts/examples/unsupported body modes are skipped with warnings; variables remain unresolved. OAuth2 is not imported. |
| OpenAPI 3 JSON/YAML | Operations, first applicable server, path/query/header examples, JSON/URL-encoded bodies, Bearer/API-key helpers, local references | External references are never fetched. Schema-only JSON bodies start as {}. Advanced parameter serialization and other security schemes require review. |
| .http | Named ### request blocks, methods, literal headers and bodies | Scripts/file references are rejected; variable declarations are not imported. |

Limits: 10 MiB source, 200 requests and folders per import, folder depth 12,
100 collections, and 200 saved requests total. Import plus local saving is a
single IndexedDB transaction: storage/validation failure cannot partially import
a collection. Collection runners and scripts remain outside this increment. Imported Postman/.http variable declarations are not automatically copied; define their values in Variables.

## Environments and variables

Use the **Environment** picker and **Variables** editor. Values resolve at Send
with precedence **Global → Collection → Environment → Request**. The editor
supports named environments, production marking, enabled rows, duplicate-name
validation per scope, secret fields, and a session-only apply action.

**Save non-secret values locally** writes definitions and readable non-secret
values to IndexedDB. Secret values never persist, including credential-like
names. Their definitions restore with empty values. Explicit “Show” reveals a
secret only in the editor. Non-secret aliases that refer to secrets are also
masked in the inline resolution inspector. Selected environment metadata may
persist, but switching environments never saves unapplied variable values.

Substitution applies to URLs, enabled header keys/values, active Bearer/Basic/API-key fields, and sent
bodies. Query values resolve before URL encoding, preserving duplicate keys.
Other contexts use literal substitution; JSON must remain valid. Missing secret
values, missing names, cycles, and expansion limits block execution. Disabled
headers and unused GET/HEAD body drafts do not require variable definitions.
`{{$uuid}}` and `{{$timestamp}}` generate once per send; other dynamic variables
are not supported. Interpolated fields are limited to 2 MiB and combined
expansion work to 4 MiB. Large literal bodies keep their existing behavior.

Saved requests retain templates, not expanded values. Valid variable-only
credential references (for example `{{token}}` or `Bearer {{token}}`) can be
saved; literal credential values are still removed. Resolution uses a transient
request and never replaces its definition. Environment changes preserve the
request's prior destination approval, so using credentials at a new origin
requires explicit approval again. Production environments have a visible label.
Response metadata identifies the environment used for that send.

Collection/request variable scopes are configured separately; fork review warns
when source-local overrides need configuring in the new fork. Global and
selected environment scopes remain available. Non-secret data is not encrypted;
use Secret or session-only apply for sensitive values. This does not provide
isolation against scripts running in the same application origin.

## Local collection forks

Choose **Fork collection** in a collection’s **…** menu to review an independent copy of its current
request definitions, including unsaved session edits and closed saved requests.
The review defaults to copying query/header values, bodies, and available
response snapshots. Users can deselect each category or choose session-only
request content. Auth-field bearer tokens, known credential request headers,
URL userinfo, and destination approvals never carry into the fork. Response
bodies and arbitrary fields can still contain secrets; the review discloses
readable local storage and previews exactly what will be saved.

Every collection, folder, request, and key/value row gets a new ID. Folder
parent relationships are remapped. Snapshots preserve their original timestamp,
are capped at 1 MiB, and are marked as saved/copied rather than fresh results.
The source collection is unchanged. Creating a fork never sends requests.
An empty collection can also be forked. Forks are local copies: there is no
upstream synchronization, hosted sharing, or merge workflow.

## Sidebar layout

Drag the sidebar divider to resize it from 200–480 px (constrained on smaller
windows so the editor remains usable). Arrow keys resize in 16 px steps;
Home/End use the bounds; double-click resets to 280 px. Width is remembered.
Mobile keeps a full-width sidebar and hides the divider.

Collection/folder actions live in their **…** menus. Menus support arrow-key
navigation, Escape, and focus return. Rows truncate long names with full titles
available on hover. The active request's ancestors open by default; other
branches remain collapsed unless explicitly expanded. Search exposes matching
requests across branches. Tree expansion preferences are remembered.

Unfiled drafts and saved requests are separated to avoid duplicate entries.
**Saved locally**, **History**, and **Storage & privacy** are collapsible;
saved/history/storage sections start closed. Section states are remembered.
Only layout dimensions and collapse IDs/booleans are stored as UI preferences,
never request contents or resolved credentials.

## Workspace layouts

**Auto** uses side-by-side request/response panels when the available content
width is at least 760 px and tabs below that. **Split** and **Tabs** are explicit
preferences; narrow screens always use tabs without discarding a saved Split
preference. Only the layout mode and divider ratio are saved in localStorage.
The divider supports dragging and Arrow/Home/End keys. Request editors remain
mounted when hidden so switching panels preserves drafts and undo history.

Method, URL, and Send/Cancel stay in a shared sticky bar. An explicit send selects
Response immediately; returning to Request during execution prevents completion
from interrupting editing. The response tab shows status, duration, and size.
Opening saved responses never sends a request.

## Modules

- `request.js`: versioned definitions, query editing, validation, privacy-safe
  history summaries. Execution state is separate from definitions.
- `webTransport.js`: one attempt, abort propagation, bounded streaming, timeout,
  privacy defaults, sanitized errors. HTTP errors remain inspectable responses.
- `store.js`: explicit, validated template persistence and serialized IndexedDB transactions; credentials and execution state are excluded.
- `useApiClient.js`: session lifecycle and per-request execution IDs. Cancel and
  close invalidate IDs immediately so late responses cannot overwrite state.
- `ApiClientWorkspace.jsx`: UI and editor-copy disclosure. Shared CodeMirror is
  used with AI/LSP disabled and response content is rendered as inert text.

## Validation

Run `npm run test:http` for transport tests using a local HTTP fixture, including
redirect blocking, timeout, cancellation, binary bytes, and receive limits.

For browser integration, start Vite on port 5193, then run:

```sh
npm run dev -- --host 127.0.0.1 --port 5193
# In another terminal, with Playwright available:
PLAYWRIGHT_MODULE=/absolute/path/to/playwright npm run test:api:browser
```

`API_CLIENT_URL` overrides the app URL (include `?tool=api`). `CHROME_PATH`
overrides the executable (default: macOS Google Chrome). Browser tests intercept
the sample API with controlled fixtures; they do not depend on httpbin.
Run `npm run build` for the production web build. Desktop builds are deferred.

### Public sample compatibility

The sample is `https://httpbin.org/get`. On November 20, 2026, a live browser
request from the local app returned HTTP 200. The former Postman Echo sample
returned no `Access-Control-Allow-Origin` header and failed in the browser.
Fixture tests alone cannot detect a public service changing its CORS policy;
verify the sample from a browser before releasing. Public-service availability
is not guaranteed. Never silently switch endpoints or replay failed requests.

### Workspace controls

Create requests with New beside the scrolling tab strip. Request metadata and save actions share a compact toolbar; environment and layout controls live in the header. The collapsible Environments sidebar supports selecting, creating, and managing environments and remembers its expanded state. `test/api-client-compact.cjs` covers these controls and responsive overflow.

## Export and backup

Use Export beside request actions for cURL (POSIX shell) or Postman v2.1 JSON. Use a collection’s ellipsis → Export collection for a portable JSON backup, reimportable through Import requests. Current drafts take precedence over saved definitions. Nested folders and disabled query/header rows roundtrip in JSON; cURL represents enabled, sent fields only. Empty collections can export.

Review the exact preview before copying/downloading. Query/header values and bodies start excluded. Recognized credential header/query fields and literal bearer tokens are omitted; variable references stay unresolved. Included generic values/bodies, names, and URL paths may still contain private data. Exports exclude variable settings, environments, saved responses, history, and execution state. Files are limited to 2 MiB. cURL import accepts --globoff as a no-op so generated commands can be reviewed and imported.

`exporters.test.js` covers safe defaults and format roundtrips; `test/api-client-export.cjs` covers UI review, downloads, collection export, and no automatic sends.

## Authentication controls

Auth supports No auth, Bearer, Basic username/password, and API key with a configurable name and header/query placement. Generated authentication is transient: it never changes request headers or the URL draft. Basic uses UTF-8 encoding, rejects colon/newline usernames and newline passwords, and requires a username. API keys require a name/value, validate browser-controlled header restrictions, encode query values, and warn about URL logs. Generated Authorization conflicts with an enabled Authorization header; API-key conflicts with an existing header (case insensitive) or query parameter (case sensitive) block Send without issuing a request.

Only active authentication fields resolve variables. Literal Basic usernames/passwords and API-key values remain memory-only and are removed from templates, exports, and forks; credential references may persist. Duplicating clears literal auth fields and selects No auth. Old version-1 records remain readable with empty new fields. Postman inherited Basic/API-key and OpenAPI Basic/API-key schemes map to the controls. cURL --user imports to Basic fields without encoding variable placeholders; existing literal Authorization headers still work. Postman export preserves auth type and safe references.

`auth.test.js` verifies generation, UTF-8, conflicts, variable resolution, redaction, and reimport. `test/api-client-auth.cjs` verifies actual intercepted request fields, reload credential omission, duplicate safety, and mobile overflow.

## Response comparison

Save a response with Save locally → Include last response snapshot. After the next send, use Response → Compare. Saved snapshot is the baseline; current live response is the target. Metadata identifies time/environment/status/size/duration. Compare Body or HTTP headers, navigate changed blocks, inspect changed JSON Pointer paths, or explicitly copy the comparison. Saving a new snapshot replaces the baseline; comparison itself never writes data or sends requests. Different request settings/environments may produce the responses being compared.

Uses `diff` with a read-only API-specific view. Exact body comparison supports UTF-8 text up to 128 KiB per side and 2,000 combined lines. Diff processing has a time/edit bound. JSON path traversal is bounded and omits summaries for unsafe integers or excessive depth/work; raw text diff remains available. Binary and oversized bodies receive explicit guidance. Header comparison excludes credential and Location fields from both sides to match snapshot redaction. These controls do not provide named multi-example storage or automatic history snapshots.

`compare.test.js` covers semantics/limits and `test/api-client-compare.cjs` verifies saved/live comparisons, JSON paths, headers, navigation, retention, reload, and mobile.

## Response JSON value actions

In a complete JSON response, expand JSON value actions, choose a JSON Pointer path, then copy the value/path or Save as variable. Values are hidden until explicitly revealed. Strings copy as decoded text; numbers and other JSON preserve exact source text (including integers beyond JavaScript numeric precision). Selection is bounded to complete responses up to 1 MiB, 500 nodes, and 32 levels; invalid/duplicate-key/over-limit JSON receives guidance instead of unreliable paths. The root JSON Pointer is the empty string.

Saving chooses request, collection, global, or a named environment scope. Secrets are on by default; credential-like names/paths (and composites containing them) force secret treatment. Same-scope replacement requires confirmation. Apply for this session never writes storage. Save variable locally writes only this variable, with secret values blank; unrelated session values remain unsaved. A selected session-only environment's definition may be created without its other variables. Request-scope local saves require a saved request. Values containing variable-reference syntax require manual review in Variables instead of automatic capture. Values are limited to 64 KiB. Neither copy nor save sends a request or changes the response.

Imports now accept up to 10 MiB of UTF-8 source by file or paste. Request/folder/depth limits and the 2 MiB individual saved-record limit remain. Larger individual definitions can be reviewed for session-only import. Export size remains 2 MiB; this increment does not raise export or snapshot limits. Boundary/unit and browser file checks cover 4 MiB and 10 MiB cases, not a universal device-performance guarantee.

## Declarative assertions

Request → Assertions configures up to 50 checks. Supported types: status equals, header exists/contains (literal case-sensitive substring), JSON Pointer exists/scalar equals, and total browser response time strictly below a positive millisecond threshold. Enter JSON scalar literals such as `"ready"`, `42`, `true`, or `null`; no scripts, regex, object equality, or expected-value variable substitution is evaluated. JSON uses the bounded exact-source value parser, including precise integer/decimal comparisons. Header availability follows browser CORS rules.

Checks run automatically only as part of an explicit Send. Response → Assertions shows pass/fail/skip with reasons, tied to definitions at that send. Edits affect the next send. Network errors have no results. Results and observed response values never persist. Select Include assertions in the local-save review to retain definitions; it defaults off because expected text may be sensitive. Existing saved version-1 requests restore with no checks. Export/fork currently omit these internal definitions with disclosure; duplicate retains definitions and starts with no response/results.

`assertions.test.js` covers evaluation, limits, exact numeric semantics, redaction, and persistence. `test/api-client-assertions.cjs` covers editing, send results, reviewed save/reload, disabled rules, and mobile behavior.

## HTTP editor workflow

Open a .http or .rest file in Code. Place the cursor inside a ### request block, then choose Open HTTP request (review without sending) or Send HTTP request (one browser send). See examples/api-client/editor-workflow.http. The live editor document is used, including unsaved edits. A comment-only preamble selects the first request; empty/unsupported blocks show an error. Supported syntax follows the existing bounded .http importer: method/URL, headers, and literal body. File variable declarations are not applied. Warnings or unresolved placeholders open for review in the API client without sending; configure Variables and explicitly Send there. Scripts/file references never execute.

The source stays plain text and is not modified. Repeated source-tab/block actions reuse their API draft, refresh source fields, and retain destination approvals, collection membership, timeout, and assertions. Reordering blocks can change this memory-only association. API edits do not write back to the source. API requests remain unsaved until Save locally; ordinary Code file/session persistence is independent. Transport uses existing CORS, timeout, cancellation, variable, origin, and credential rules. Selection limits: 10 MiB source, 100,000 lines, 10,000 blocks.

`editorRequests.test.js` covers selection/security bounds; `test/api-client-http-editor.cjs` verifies Code-to-API integration, live cursor/content, no replay, source preservation, draft reuse, API persistence isolation, and mobile.

### HTTP request outline in Code

The former structure panel becomes HTTP requests for .http/.rest files. Click a name to jump to its line, use Open to review that specific request in the API client, or Send to execute it once. Cursor position highlights the containing request. Search filters method/name; the first 200 matches render. + inserts an editable request template with an unresolved base_url placeholder and supports normal editor undo. Selection and insertion never send. Toolbar cursor actions remain available; hide/show the panel with Requests and resize using the existing divider.

Rows re-read live content before action and reject stale outline identities. Metadata displays names, methods, and line numbers, without URL query values. Files use HTTP syntax highlighting and skip YAML detection/autoformat. Generic data-format/convert actions are disabled for HTTP source. The response continues to open in the API client. `test/api-client-http-outline.cjs` covers outline behavior, explicit row targets, source preservation, search, insertion, and mobile sizing.

### Contextual HTTP actions and shortcuts

The Code toolbar now keeps Requests rather than duplicate Open/Send buttons. Use per-row actions, or focus the .http/.rest source editor and press Ctrl/Cmd+Alt+R to send the request at the cursor or Ctrl/Cmd+Alt+O to open it without sending. These work with the outline hidden. Held-key repeat is ignored. Shortcuts are scoped to the HTTP editor and do not run from the API client or other inputs.

Right-click targets the clicked source position; Shift+F10 or the Context Menu key uses the current cursor. The HTTP menu offers Send request, Open in API client, and Show HTTP requests, with arrow/Home/End navigation and Escape focus return. No matching request disables Open/Send. Normal editor context menus remain available for other file types. See the outline’s Keyboard shortcuts disclosure for reminders.

## Browser editor capability batch

The HTTP outline now includes environment selection, Variables, reviewed environment import, templates, per-row authoring menus, and Run file. Send stays in Code with a resizable response pane; Open/View in API client reuse the same draft/execution through the shared `useApiClient` instance. Both response surfaces reuse comparison, assertions, and value actions. Source text is never changed by navigation/execution, and generated response editor copies remain session-only with AI/LSP disabled.

`httpEditing.js`, `fileVariables.js`, and the CodeMirror HTTP extension provide local completion, diagnostics, request/header/body folding, JSON/XML body language support, and exact selected-body formatting. File/block declarations resolve with precedence Global → File → Collection → Environment → API request → Request block. They remain transient API fields and are dropped by template persistence/export; their original `.http` text follows normal Code file/session storage. No scripts or arbitrary file references execute. Named declaration parsing is cached only in memory and bounded. Generic Convert remains disabled for HTTP source; Format operates on the selected JSON/XML body only.

`environmentImport.js` accepts explicit JSON file/paste input up to 1 MiB: Postman environments or named object maps, nested dotted keys to depth 8, primitive values, and safe numeric values. Private files and credential-like names force secret handling. Existing same-name environments receive reviewed import suffixes. Imports do not activate environments; saved imports write only their new definitions/non-secret values and never persist unrelated session settings.

`uploads.js` constructs FormData/Blob payloads from explicit browser selections. Multipart Content-Type must be left to Fetch for a correct boundary. Names/values can resolve variables; enabled missing files block sending. Upload selections, bytes, and original file names are excluded from request templates, exports, and local forks; reselect after reload. A server response may echo names/content into an explicitly reviewed response snapshot, so inspect snapshots before saving. GET/HEAD never send body drafts. The `# @body multipart` / `# @body binary` template directives select the editor mode without reading paths. Total selected content is limited to 20 MiB and 100 multipart fields.

`runner.js` executes 1–200 reviewed selected definitions in order, with no retries. Captures use exact JSON Pointer values and a secret run-only map, require consent to shadow existing definitions, reject template syntax, and disappear after the run. Stop cancels the current transport and prevents later sends; generation guards prevent an old cancelled run from resuming after another start. Results contain metadata, not captured values. Collection runs use latest drafts plus unopened saved definitions. Origin approval and browser restrictions still apply, including when a run chooses another environment.

`executionRetention.js` limits retained live response bodies to 64 MiB across requests. Released bodies receive an explicit notice; observed assertion results remain. Comparison (128 KiB), value/assertion JSON inspection (1 MiB/500 nodes/depth 32), explicit saving, and import/export limits remain independent. Editing assistance and body formatting are bounded to 1 MiB; diagnostics cover at most 500 blocks/100 messages. See `examples/api-client/README.md` for the acceptance checklist and public demonstration fixtures.

Form bodies resolve variables per field: parse the URL-encoded template, expand each decoded key/value, then serialize. This preserves literal `+`, `&`, `%`, `=` and Unicode in variable-supplied credentials and prevents values from introducing extra form fields. Literal form text still uses normal URL-encoding rules; do not pre-encode variable values. Templates remain unresolved in the editor and persistence. A regression verifies the outgoing browser request with synthetic credentials and a readable HTTP 400.

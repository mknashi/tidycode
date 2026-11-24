# API client sample collections

In Tidy Code, open **API Client → Collections → Import**, choose one of these
Postman v2.1 JSON files, select **Preview import**, then **Import as new collection**.
Importing does not send any requests.

## Start with httpbin Playground

`httpbin-playground.postman_collection.json` needs no environment setup.

| Request | What to try |
| --- | --- |
| GET query parameters | Change Params, disable a row, and inspect duplicate `tag` values. |
| Inspect sent headers | Change `X-Demo-Client`. The JSON body echoes sent request headers; the HTTP headers tab is separate. |
| POST JSON customer | Edit or format the body. The response's `json` field echoes it. |
| POST form values | Inspect the response's `form` field. |
| 404 is an HTTP response | Inspect the 404 status; an empty body is expected. |
| Slow response — try Cancel | Select Send, then Cancel before five seconds elapse. Or set Timeout to 2 seconds. |
| Bearer auth — demo token | Uses a clearly fictional public demonstration token. It is omitted from local templates, so re-enter it in Auth after reload. |

To compare copies, fork the collection and edit a request in the fork. To keep
a response after reload, send it and use Save locally with its response snapshot
selected. The public service may be unavailable or rate-limited; no request is
retried automatically. Never send real credentials or personal data to httpbin.

## Environment Practice

`environment-practice.postman_collection.json` deliberately uses references.
Before sending:

1. Open Variables and create an environment named Practice.
2. Add `base_url` with value `https://httpbin.org`.
3. Add `customer_name` with value `Avery Chen`.
4. Save non-secret values locally, and select Practice in the Environment picker.

Send either request. `{{$uuid}}` and `{{$timestamp}}` generate automatically.
Try overriding `customer_name` in This request to explore scope precedence.
Environment declarations are not imported automatically.

### Send from Code

Open `editor-workflow.http` in Code, place the cursor inside a request, and use **Open HTTP request** to review or **Send HTTP request** to send once. Blocks use `###` separators. Calls go to the public httpbin service and remain subject to browser CORS/network availability. The source file remains unchanged.

## Browser capability acceptance checks

The browser roadmap batch can be tested with `browser-capabilities.http`, `browser-runner.http`, and `browser-environments.example.json`. They use public httpbin with demonstration data; CORS and service availability still apply. Do not send real credentials or private uploads to the sample service.

1. **Editing:** Open `browser-capabilities.http` in Code. Type a method, header prefix, `Content-Type` value, or `{{` to see local completion. Ctrl+Space opens suggestions explicitly. Unknown variables, malformed URLs/headers, and invalid JSON bodies are marked inline. Automatic AI/LSP completion is disabled for HTTP source.
2. **Folding and formatting:** Use gutter fold controls for a request, its headers, or a multiline body. Place the cursor in the JSON/XML block and use Format (or the editor menu's Format request body). Only that body changes, the large integer stays exact, and Undo restores the source. Format is bounded to 1 MiB bodies.
3. **Responses:** Send a request from its outline row or Ctrl/Cmd+Alt+R. Code stays open with a resizable response pane below the editor. Try search, raw/pretty, headers, comparison, assertions, value actions, cancel on a slow request, and View in API client. Open/Ctrl/Cmd+Alt+O still opens for review without sending. There are no duplicate toolbar Send/Open buttons.
4. **Environment selection/import:** Use Import env in the outline. Select `browser-environments.example.json`, review it, and uncheck Treat all imported values as secret only because this fixture is public demo data. Save definitions, then explicitly select Development. Its `name` overrides the file's `@name` on Inspect parameters. Production demo shows a production warning but still points to public httpbin. Private-file imports and credential-like names stay secret; saved secret definitions restore blank.
5. **File variables:** Change `@name` and send with No environment to see the file value used. Add `@name=Block value` between a `###` title and its request to override only that block. Precedence is Global → File → Collection → Environment → API request → Request block. Declarations are plain text in the normal Code file/session; use secret API variables or private environment imports for credentials. API draft associations are session-only, so file/global/environment values are the repeatable source-file workflow after reload.
6. **Authoring:** Try the template selector and each row's … menu: rename, duplicate, move up/down, or extract to a reviewed `.http` download. Source changes support Undo. Extraction starts with values excluded and never includes file bytes or file-variable definitions. Basic helper credentials need configuring after opening an extracted file.
7. **Uploads:** Open an upload example in the API client. Under Body, select files using the browser picker; add multipart text/file fields as needed. Multipart must have no manually supplied Content-Type so the browser sets its boundary. Send to inspect the sample server's result. Combined fields/files are limited to 20 MiB. Save/reload and verify file bytes/names are gone and selection is required again. No upload happens when selecting a file.
8. **Sequential run:** Open `browser-runner.http`, choose Run file, and expand the capture settings on step 1. Set path `/json/token`, name `run_token`; then Start selected requests. Step 2 receives the demo value. Captures are secret and run-only. Test Stop run on a delayed request and stop-on-failure with an error endpoint. A run never starts, retries, or continues after Stop automatically. Collection … → Run collection provides the same reviewed flow for the current collection drafts.

JSON value selection/assertions retain their existing 1 MiB/500-node/depth-32 limits; comparison retains its 128 KiB body limit. Older live response bodies may be released once the shared 64 MiB execution-body budget is reached; the UI explains this rather than presenting an old body as fresh. Saved snapshots and source files are separate from execution retention.

### Generate synthetic request data

1. In API Client, open **Body** or **Params** and click **Generate test data**.
2. Start with **Local rules**. The dialog infers field types from the current JSON body or parameter names, excluding their values. Edit the supported JSON Schema subset shown under **Supported rules**; a sample profile is provided for empty requests.
3. Choose a seed and normal/minimum/maximum scenario. The same settings reproduce the same data. Empty/null scenarios deliberately violate types or bounds for negative tests. With more than one record, the body becomes a JSON array. Params always generate one object of primitive values.
4. Click **Generate preview**. Review the JSON, then **Apply**. Body application replaces the draft body, switches to JSON, and updates existing Content-Type headers to application/json. Existing JSON bodies support editor Undo. Query application replaces matching names and preserves other params.
5. To use **AI**, configure a cloud provider in AI Settings, select it in the dialog, and review the schema and instructions. Explicitly approve sending that input before generating. The request URL, headers, credentials, existing values, responses and environment values are excluded. Field names and manually entered enums/instructions are sent and may be private; review them. Provider errors do not trigger fallback.
6. Generation and Apply never send an API request or save it locally. Review the draft and use Send separately. A GET/HEAD body remains unsent until you choose an appropriate method.

Supported rules are intentionally bounded: 32 KiB schema, 200 fields, depth 8, 100 records, 20 items per array, 10,000 generated values, 256 KiB output. No scripts, external schema references, full JSON Schema/OpenAPI validation, file data or automatic test runs. AI output must be valid JSON matching supported fields, types, enums, bounds, formats and count. Generated variable references are rejected to prevent accidental environment-secret substitution. Generator configuration and previews are session-only; applied data follows normal request saving behavior. AI mode currently supports the configured cloud providers; local rules require no provider or network.

For `.http` / `.rest` files, use the request row’s **… → Generate body data…** or **Generate query data…** in the HTTP requests panel. The same commands are available by right-clicking inside a request block. Choose rules or AI, generate a preview, then Apply directly to the source file. Body application replaces that block’s body, updates its Content-Type and removes stale Content-Length/upload directives. Query application preserves other raw query fields, including variable references. Neighboring requests, authorization headers and file declarations remain intact. Ctrl/⌘+Z restores the source edit. No API workspace switch or automatic send is needed. Normal Code file persistence still applies; save the file to retain the change.

### Form URL encoded editing

Choose **Body → Form URL encoded**. **Fields** is the default: add key/value rows and enter literal values or `{{references}}`; encoding happens automatically. Duplicate keys and empty values are supported. Credential-like literal fields are masked unless explicitly revealed. **Raw** edits the same body as `key=value&other=value`; raw edits appear back in Fields without sending. Raw displays literal credentials, so prefer secret variable references. More than 200 fields use Raw to keep the UI responsive. Colon-style and multiline raw input show guidance instead of silently becoming valid-looking fields. A conflicting explicit Content-Type header shows **Use form Content-Type**; otherwise the transport sets the correct header automatically. Switching views does not send a request, expand variables, or save data. Normal explicit request-save options still govern persistence.

### Desktop native HTTP — first increment

Start the desktop development app with `npm run dev:desktop` (its configured Vite port is 5173). The shared API Client shows **Desktop** instead of **Browser**. Both the workspace and Code `.http`/`.rest` actions use native HTTP automatically; there is no agent installation/pairing step and no localhost server started by the app.

For a local smoke test, run `node examples/api-client/desktop-smoke-server.cjs`, then open `desktop-native.http` in Code. Approve the local HTTP destination if prompted. Verify JSON, the readable synthetic 400 body, returned 302 without following, cancellation/timeout, exact binary download through the native Save dialog (cancellation writes nothing), and response headers including Set-Cookie. Run `/ok` again to confirm Set-Cookie was not automatically reused (`cookieReceived: false`). None of the fixture endpoints set CORS headers. A browser send can fail CORS while the desktop send succeeds; never automatically replay a failed browser POST through another transport.

Desktop defaults: TLS verification enabled; redirects returned without following; no cookie jar, inherited webview cookies, system proxy or retry. Explicit Cookie/User-Agent headers are available in desktop only. Other browser-managed headers remain restricted in this increment. Four concurrent native requests; 20 MiB bodies/responses; 100 ms–120 s timeout; existing preview/retention and destination-approval rules still apply. Native request/response content isn't logged or automatically persisted. Explicit file-picker uploads are supported; the credential vault is described below; native file paths, custom CA/TLS/proxy/cookie controls and web-to-local agent pairing remain future desktop work. This increment was compiled and tested on macOS; Windows/Linux GUI and installer verification remain pending.

Web and desktop reuse the same components and portable import/export formats, but each keeps its own local storage; automatic browser-to-desktop collection or secret synchronization is not included.

### Desktop credential vault

1. In desktop API Client, use **Vault** to manage stored credentials. Or open **Variables**, mark a variable Secret, and click **Vault…** beside it.
2. Give each credential a descriptive environment-specific name (for example `Salesforce Dev Consumer Secret`), enter its literal value and click **Save to OS vault**. No variable references are accepted as stored credential values. Your OS may prompt for permission.
3. To reuse a credential, open Vault… for the intended variable/scope, select the credential, then **Use in this variable**. Review the target label and Apply/Save in Variables. This puts the value in session memory; ordinary variable persistence still omits it. Nothing sends automatically. Reopening the app requires another explicit Load/Use.
4. Updating an entry requires the replacement checkbox. Deleting requires its own confirmation. Vault changes apply immediately, even if the Variables dialog is later cancelled. Deleting from the OS vault does not revoke server tokens or erase existing session copies; clear the variable and Apply, clear workspace data, or close the app as appropriate.
5. Clear API data retains the OS vault and local name/UUID catalog. Delete entries through Vault before clearing all application storage; losing the catalog can orphan OS entries, which may require OS-store management. Browser and desktop vault contents do not sync or enter collection exports.

Only opaque IDs and credential names are kept in local catalog storage, so choose names that are safe to store as metadata. OS errors never fall back to plaintext. Limits are 200 entries, names up to 128 characters and values up to 64 KiB; individual OS credential stores can impose lower limits. Automated vault UI tests use a simulated OS bridge; manually verify actual keychain save/read/denial/delete on each target platform before release.

Vault selection is remembered per secret variable after **Use in this variable**. Applying/saving Variables keeps the opaque credential ID, so reopening selects the right name without reading its secret. The value still requires an explicit Use/Load after restart. Manually editing a variable value detaches that selection; copying an environment drops vault selections to avoid implying a credential choice for the new environment. If the selected credential was deleted, the dialog asks for a new explicit choice.

### Desktop TLS and proxy settings

Open **API Client → Settings → Desktop TLS & proxy**. Settings apply to one request and session; they are not saved/exported or copied when duplicating a request.

- **Default:** verified TLS and a direct connection, with no inherited system/environment proxy, automatic redirect or retry.
- **Custom CA:** choose a PEM `.pem`/`.crt` certificate bundle, review the destination, approve and Apply. This adds trust to that request only; it does not install a system certificate. Maximum 128 KiB/16 certificates; no private keys or client certificates.
- **Development bypass:** uncheck Verify TLS certificates, acknowledge the warning and Apply. This disables certificate and hostname verification for that request's TLS connections, including an HTTPS proxy. Prefer a custom CA. Reset network settings restores verification and direct connection.
- **Proxy:** enter an explicit `http://host:port` or `https://host:port`, optionally add username/password or `{{secret_variable}}` references, approve and Apply. Proxy credentials are not embedded in the URL or exported. Changing the destination/environment requires review again; the regular destination-approval prompt may also appear.
- **HTTP source:** open the block in API Client to configure it. Subsequent sends of that block reuse the reviewed settings while its current source binding exists. Reloading or authoring operations that reset bindings require reconfiguration.

Changes are drafts until Apply. A visible banner reflects applied insecure TLS, and a proxy indicator reflects an applied proxy. SOCKS, system/PAC/no-proxy configuration, mTLS identities and cookie jars are not part of this increment. Synthetic native test fixtures exercise actual TLS and proxy paths; platform-specific GUI/TLS trust behavior still requires Windows/Linux manual testing.

For a synthetic desktop TLS smoke test, run `openssl s_server -accept 8443 -cert src-tauri/tests/fixtures/localhost-test-cert.pem -key src-tauri/tests/fixtures/localhost-test-key.pem -www`, then request `https://localhost:8443/` in the desktop API Client. Default trust must reject it. Select `localhost-test-ca.pem` as the custom CA, review/apply and resend; it should succeed. Reset settings and resend; trust should fail again. These fixtures are test-only: do not install their CA in the system store or use their key outside local testing.

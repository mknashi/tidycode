# Plan: AI Maintenance Fixes

## Context

**Decision:** keep the AI, auth and sync code as it is on `main`. Don't merge `remove-ai-auth-sync`.
- Auth and sync stay inactive in production because the Supabase variables aren't set when the site is built (see `src/services/supabase.js`).
- No reinstatement work is needed.

Two problems in the existing AI code are still worth fixing.

---

## 1. Refresh retired model IDs (about 1–2 days)

**Problem:** the providers have model IDs written into the code, and some of those models have been retired. For example, `ClaudeProvider.js` uses `claude-3-haiku-20240307` for its API key check. Requests to a retired model fail, so the key check and default model choice can break even with a valid key.

**Steps:**
1. Check every place that names a model:
   - `src/services/ai/providers/*.js` (Claude, OpenAI, Gemini, Groq, Mistral, Ollama defaults)
   - The model catalogs in `src/services/AIService.js` (`GROQ_MODELS`, `OPENAI_MODELS`, `CLAUDE_MODELS`, `GEMINI_MODELS`, `MISTRAL_MODELS`, `CEREBRAS_MODELS`, `SAMBANOVA_MODELS`), which `TidyCode.jsx` imports
   - The API key check calls (for example `ClaudeProvider.js:171`)
2. Replace retired IDs with current ones from each provider's model list.
   - Claude: `claude-haiku-5-5` for the key check and lightweight tasks, `claude-sonnet-5-5` as the default, `claude-opus-5-5` as an option.
   - Do the same for each of the other providers.
3. **Move saved selections off retired models:** when loading saved AI settings, if the user's saved model ID is no longer in the catalog, switch to that provider's default and show a one-time notice. Otherwise users who picked a retired model keep getting errors.
4. Confirm that browser calls to Anthropic send the `anthropic-dangerous-direct-browser-access: true` header, in both `ClaudeProvider.js` and `AIService.js`. Without it, CORS blocks the calls on web.
5. **Avoid this next time:** where a provider offers a models endpoint (Anthropic `GET /v1/models`, OpenAI `GET /v1/models`, Groq, Mistral, Gemini), fetch the list after the key is checked and use the built-in list only as a fallback.

**Verify:**
- `npm run test:ai`, then `npm run test:ai:live` with real keys for each provider.
- Manually on web and desktop, for each kept provider: key check, chat, one action, and AI Fix.

---

## 2. Fix API key storage (about 1–2 days)

**Problem:** `src/utils/secureStorage.js` encrypts keys with AES-GCM, but builds the encryption key from a browser fingerprint: user agent, language, timezone offset, colour depth and screen size.
- **It protects almost nothing.** Anyone who can read the page's localStorage can rebuild the same fingerprint and decrypt the keys.
- **Keys get lost.** If the browser updates, the user plugs in another monitor, changes resolution, changes language or crosses timezones (or daylight saving changes), the fingerprint changes. Saved keys then silently fail to decrypt and seem to vanish.

**Steps:**

**Desktop (Tauri)**
1. Add the `keyring` crate to `src-tauri/Cargo.toml`. It uses macOS Keychain, Windows Credential Manager and Linux Secret Service.
2. Add `secret_set(name, value)`, `secret_get(name)` and `secret_delete(name)` commands in `src-tauri/src/lib.rs`, using service name `ai.tidycode`.
3. In `secureStorage.js`, when `isDesktop()`, save and load API keys through these commands instead of localStorage.
4. **One-time move:** on first launch after the update, decrypt any existing keys with the old fingerprint method. If that works, move them to the keychain and delete the localStorage copies.

**Web**
1. Replace the fingerprint-based key with a **random AES key generated once**, saved in IndexedDB as a non-extractable `CryptoKey`.
   - It still only protects against casual inspection, but it no longer breaks when the screen or timezone changes.
2. Offer a choice in AI Settings:
   - **"Remember on this device"** (default): uses the IndexedDB key above.
   - **"This session only"**: keeps keys in sessionStorage; they're cleared when the tab closes.
3. Say plainly in Settings: "Keys are stored only in this browser and sent only to the provider you choose."
4. **Make failures visible:** if decryption fails, show "Your saved API key couldn't be read — please re-enter it" instead of failing silently.
5. **One-time move:** try the old fingerprint method once, re-save with the new key if it works, then remove the old copies.

**Verify:**
- Desktop: save a key, restart the app, and confirm the key is in the OS keychain and missing from localStorage.
- Web: save a key, change screen resolution or zoom, reload, and confirm the key still loads.
- Web: with "This session only", close the tab, reopen it, and confirm the key is gone.
- Upgrade path: install the current build, save keys, upgrade, and confirm the keys move over automatically.

---

**Total:** about 2–4 working days.

---

## Status: implemented (2026-10-27)

Both items are done and covered by `npm run test:ai` (143 tests). Changes from the plan:

- **More Claude call sites were broken than expected.** Every current Claude model accepts only the default sampling settings and returns thinking blocks before its text. So every place that sent `temperature` or read `content[0].text` would fail or return empty text. All of them now go through `src/services/ai/anthropic.js`, including the two Rust commands (`fix_with_claude` and `get_claude_completion`).
- **Claude in the browser was blocked** because the `anthropic-dangerous-direct-browser-access` header was missing. It's now sent everywhere, and inline completions work on web too.
- **Live model lists:** the settings dropdowns merge in each provider's live list once a key is entered (`src/services/ai/modelCatalog.js`). Saved selections are migrated only from a fixed list of retired IDs, so a model picked from a live list is never overwritten.
- **Key storage:** only 3 of the 7 keys were encrypted before, and a failed decryption returned the ciphertext as if it were the key. All 7 are now protected.
- **First-render race:** the first render used to save default settings before the stored ones had loaded, which would have deleted keychain entries. Saving now waits for loading to finish, and saves run one at a time.
- **Linux builds:** `keyring` uses `vendored` and `crypto-rust`, so no system `libdbus` package is needed. Keys still need a running Secret Service daemon (GNOME Keyring or KWallet). Without one, the app falls back to encrypted local storage.

**Still to verify by hand** (needs real keys or a desktop build):
- [ ] A live call to each provider from web and desktop, including `npm run test:ai:live`
- [ ] Desktop: a key saved in Settings appears in the OS keychain (Keychain Access on macOS), and not in localStorage
- [ ] Upgrade from the current release with saved keys: the keys move over without being re-entered

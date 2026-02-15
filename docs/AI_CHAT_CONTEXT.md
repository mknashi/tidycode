# AI Chat - File Context & Token Limits

## How File Context Works

When a user clicks "Include file" in the AI Chat panel, the file content is embedded in the **system prompt** sent to the AI provider. The content is included as a code block within the system message, alongside the user's chat messages.

**Flow:**
1. User toggles "Include file" in `AIChatPanel.jsx`
2. `useAIChat.js` → `buildSystemPrompt()` embeds file content in the system prompt
3. `ProviderManager.streamChat()` routes to the active provider
4. Provider sends the full message array (system + history + user message) to the API

**Key files:**
- `src/hooks/useAIChat.js` — builds system prompt, applies truncation and warnings
- `src/components/AIChatPanel.jsx` — UI toggle for file context
- `src/services/ai/ProviderManager.js` — routes to active provider

## Token Estimation

Tokens are the units AI models use to process text. Different content types tokenize differently:

| Content Type | Characters per Token | Example |
|-------------|---------------------|---------|
| English text | ~4 | Prose, comments |
| Code | ~3-3.5 | Variables, operators are separate tokens |
| JSON/XML | ~3 | Brackets, quotes, colons each consume a token |

The codebase uses a conservative estimate of **4 characters per token** (`CHARS_PER_TOKEN = 4` in `useAIChat.js`).

## Context Window Limits by Provider

### Ollama (Local)
- **Default `num_ctx`:** 2048 tokens (Ollama's built-in default)
- **TidyCode override:** 32,768 tokens (set via `num_ctx` in API options)
- **Model-specific limits:** Varies — e.g., `qwen2.5-coder:7b` supports 32K, `codellama:7b` supports 16K
- **Cost:** Free (runs locally). Only costs are RAM/VRAM usage and inference time.
- **Note:** If `num_ctx` exceeds the model's native limit, Ollama silently caps it. Larger `num_ctx` values require more RAM.

### Cloud Providers

| Provider | Default Context Window | Input Cost (per 1M tokens) |
|----------|----------------------|---------------------------|
| GPT-4o (OpenAI) | 128K tokens | ~$2.50 |
| Claude Sonnet (Anthropic) | 200K tokens | ~$3.00 |
| Groq (Llama/Mixtral) | 128K tokens | ~$0.05 |

Cloud providers don't need a `num_ctx` setting — their context windows are large by default.

## File Context Safeguards

Implemented in `useAIChat.js`:

### Truncation (all providers)
- **Limit:** `MAX_FILE_CONTEXT_CHARS = 100,000` (~25K tokens)
- Files larger than this are truncated to the first 100K characters
- The model is informed that content was truncated
- User sees a warning: *"File too large (~XK tokens). Truncated to ~25K tokens."*

### Cost Warning (cloud providers only)
- **Threshold:** `CLOUD_COST_WARN_CHARS = 20,000` (~5K tokens)
- When file content exceeds this, user sees: *"Including ~XK tokens of file content. This will increase API costs."*
- Local providers (Ollama, TinyLLM) skip this warning since there's no monetary cost

### Cost Examples for Large Files

| File Size | ~Tokens | GPT-4o Cost | Claude Cost | Groq Cost |
|-----------|---------|-------------|-------------|-----------|
| 20 KB | ~5K | ~$0.01 | ~$0.02 | ~$0.0003 |
| 100 KB | ~25K | ~$0.06 | ~$0.08 | ~$0.001 |
| 500 KB | ~125K | ~$0.31 | ~$0.38 | ~$0.006 |
| 1 MB | ~250K | ~$0.63 | ~$0.75 | ~$0.013 |
| 3 MB | ~750K | ~$1.88 | ~$2.25 | ~$0.038 |

**Note:** These are input costs only. Each follow-up message in the same conversation resends the file context, multiplying the cost. Output tokens are billed separately at higher rates.

## Ollama-Specific Details

### CORS Issue (Desktop)
The Tauri webview blocks direct `fetch()` calls from the browser to `localhost:11434` due to CORS. All Ollama HTTP requests are proxied through Tauri Rust commands:

| Tauri Command | Purpose | Used By |
|--------------|---------|---------|
| `ollama_api_get` | GET proxy for `/api/tags` | `validateConfig()`, `getAvailableModels()` |
| `ollama_chat` | Non-streaming POST to `/api/chat` | `complete()`, `chat()` |
| `ollama_chat_stream` | Streaming POST via events | `streamComplete()`, `streamChat()` |

Detection: `isDesktop()` from `src/utils/platform.js` checks for Tauri internals.
Web mode falls back to direct `fetch()` (requires user to set `OLLAMA_ORIGINS`).

### System Prompt for Local Models
Smaller Ollama models (1.5B-3B parameters) tend to respond with "I can't access files" even when file content is provided in the system prompt. The system prompt explicitly instructs:
> "The file content has been provided to you below. You have full access to it — analyze it directly. Do NOT say you cannot access files."

### RAM Requirements
Setting `num_ctx: 32768` increases RAM usage. Approximate requirements:

| Model Size | num_ctx: 2048 | num_ctx: 32768 |
|-----------|---------------|----------------|
| 3B | ~2 GB | ~4 GB |
| 7B | ~4 GB | ~8 GB |
| 13B | ~8 GB | ~14 GB |
| 70B | ~40 GB | ~48 GB |

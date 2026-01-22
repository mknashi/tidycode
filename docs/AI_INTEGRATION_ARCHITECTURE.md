# AI Integration Architecture

## Claude Code & Codex Integration for Tidy Code Desktop

This document outlines the architecture for integrating Claude Code and Codex into Tidy Code's desktop application, providing a flexible system for AI-powered code assistance.

---

## Table of Contents

1. [Current Architecture](#current-architecture)
2. [Proposed Provider Architecture](#proposed-provider-architecture)
3. [AI Actions & Use Cases](#ai-actions--use-cases)
4. [UI Components](#ui-components)
5. [Editor Integration](#editor-integration)
6. [Backend Architecture](#backend-architecture)
7. [Implementation Phases](#implementation-phases)
8. [Configuration](#configuration)

---

## Current Architecture

### Existing AI Providers

Tidy Code currently supports the following AI providers:

| Provider | Type | Authentication | Features |
|----------|------|----------------|----------|
| Groq | Cloud | API Key | Fast inference |
| OpenAI | Cloud | API Key | GPT models |
| Claude | Cloud | API Key | Anthropic models |
| Ollama | Local | None | Local models |
| TinyLLM | Local | None | Lightweight models |

### Key Files

```
src/services/
├── AIService.js           # Web platform AI service
├── AIService.desktop.js   # Desktop platform AI service (Tauri)
├── secureStorage.js       # AES-256-GCM encrypted key storage
└── platform.js            # Platform detection & dynamic imports

src/components/
├── AISettingsModal.jsx    # Provider configuration UI
└── completionSource.js    # CodeMirror completion integration

src/utils/
└── aiCompletionService.js # Completion processing logic
```

### Platform Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
├─────────────────────────────────────────────────────────┤
│                    platform.js                           │
│              (Platform Detection Layer)                  │
├─────────────────┬───────────────────────────────────────┤
│   Web Platform  │         Desktop Platform              │
│   AIService.js  │      AIService.desktop.js             │
│                 │              │                         │
│   fetch() API   │      Tauri Commands                   │
│                 │              │                         │
│                 │      ┌───────▼───────┐                │
│                 │      │  Rust Backend │                │
│                 │      │   (lib.rs)    │                │
│                 │      └───────────────┘                │
└─────────────────┴───────────────────────────────────────┘
```

---

## Proposed Provider Architecture

### Unified Provider Interface

```javascript
// src/services/ai/ProviderInterface.js

/**
 * Base interface for all AI providers
 * All providers must implement these methods
 */
export class AIProvider {
  constructor(config) {
    this.name = config.name;
    this.models = config.models || [];
    this.capabilities = config.capabilities || [];
  }

  /**
   * Generate code completion
   * @param {Object} params - Completion parameters
   * @param {string} params.prompt - The code context/prompt
   * @param {string} params.language - Programming language
   * @param {string} params.model - Model identifier
   * @param {Object} params.options - Additional options
   * @returns {Promise<CompletionResult>}
   */
  async complete(params) {
    throw new Error('complete() must be implemented');
  }

  /**
   * Generate code with streaming response
   * @param {Object} params - Same as complete()
   * @param {Function} onChunk - Callback for each chunk
   * @returns {Promise<void>}
   */
  async streamComplete(params, onChunk) {
    throw new Error('streamComplete() must be implemented');
  }

  /**
   * Chat-based code assistance
   * @param {Array} messages - Conversation history
   * @param {Object} options - Chat options
   * @returns {Promise<ChatResult>}
   */
  async chat(messages, options) {
    throw new Error('chat() must be implemented');
  }

  /**
   * Validate provider configuration
   * @returns {Promise<boolean>}
   */
  async validateConfig() {
    throw new Error('validateConfig() must be implemented');
  }

  /**
   * Get available models for this provider
   * @returns {Promise<Array<ModelInfo>>}
   */
  async getModels() {
    return this.models;
  }
}

/**
 * Completion result structure
 */
export class CompletionResult {
  constructor(data) {
    this.text = data.text;           // Generated code
    this.confidence = data.confidence; // 0-1 confidence score
    this.metadata = data.metadata;    // Provider-specific metadata
  }
}
```

### Claude Code Provider

```javascript
// src/services/ai/providers/ClaudeCodeProvider.js

import { AIProvider, CompletionResult } from '../ProviderInterface';

export class ClaudeCodeProvider extends AIProvider {
  constructor(config) {
    super({
      name: 'Claude Code',
      models: [
        { id: 'claude-3-opus', name: 'Claude 3 Opus', context: 200000 },
        { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', context: 200000 },
        { id: 'claude-3-haiku', name: 'Claude 3 Haiku', context: 200000 },
        { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', context: 200000 },
      ],
      capabilities: [
        'completion',      // Inline code completion
        'chat',            // General Q&A assistance
        'refactor',        // Refactor selection
        'explain',         // Explain code/text
        'review',          // Code review
        'convert',         // Convert between formats (JSON/YAML/XML)
        'infer-schema',    // Generate schema from data
        'summarize-logs',  // Log analysis & summarization
        'generate-tests'   // Test skeleton generation
      ]
    });
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
  }

  async complete({ prompt, language, model, options = {} }) {
    const systemPrompt = this.buildSystemPrompt(language, options);

    const response = await this.makeRequest('/messages', {
      model: model || 'claude-3-5-sonnet-20241022',
      max_tokens: options.maxTokens || 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    });

    return new CompletionResult({
      text: response.content[0].text,
      confidence: this.calculateConfidence(response),
      metadata: {
        model: response.model,
        usage: response.usage,
        stopReason: response.stop_reason
      }
    });
  }

  async streamComplete({ prompt, language, model, options = {} }, onChunk) {
    const systemPrompt = this.buildSystemPrompt(language, options);

    // Use Tauri streaming command for desktop
    if (window.__TAURI__) {
      return this.streamViaTauri({ prompt, language, model, systemPrompt, options }, onChunk);
    }

    // Web fallback with fetch streaming
    return this.streamViaFetch({ prompt, language, model, systemPrompt, options }, onChunk);
  }

  buildSystemPrompt(language, options) {
    return `You are Claude Code, an expert programming assistant.
Language: ${language}
Task: ${options.task || 'code completion'}
Context: Provide concise, production-ready code.
Format: Return only the code without explanations unless asked.`;
  }

  async makeRequest(endpoint, body) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    return response.json();
  }
}
```

### Codex Provider

```javascript
// src/services/ai/providers/CodexProvider.js

import { AIProvider, CompletionResult } from '../ProviderInterface';

export class CodexProvider extends AIProvider {
  constructor(config) {
    super({
      name: 'Codex',
      models: [
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', context: 128000 },
        { id: 'gpt-4o', name: 'GPT-4o', context: 128000 },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', context: 128000 },
      ],
      capabilities: [
        'completion',      // Inline code completion
        'chat',            // General Q&A assistance
        'refactor',        // Refactor selection
        'explain',         // Explain code/text
        'convert',         // Convert between formats
        'infer-schema',    // Generate schema from data
        'summarize-logs',  // Log analysis & summarization
        'generate-tests'   // Test skeleton generation
      ]
    });
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  }

  async complete({ prompt, language, model, options = {} }) {
    const response = await this.makeRequest('/chat/completions', {
      model: model || 'gpt-4o',
      max_tokens: options.maxTokens || 2048,
      messages: [
        { role: 'system', content: this.buildSystemPrompt(language, options) },
        { role: 'user', content: prompt }
      ],
      temperature: options.temperature || 0.2
    });

    return new CompletionResult({
      text: response.choices[0].message.content,
      confidence: this.calculateConfidence(response),
      metadata: {
        model: response.model,
        usage: response.usage,
        finishReason: response.choices[0].finish_reason
      }
    });
  }

  async streamComplete({ prompt, language, model, options = {} }, onChunk) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: model || 'gpt-4o',
        max_tokens: options.maxTokens || 2048,
        stream: true,
        messages: [
          { role: 'system', content: this.buildSystemPrompt(language, options) },
          { role: 'user', content: prompt }
        ]
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices[0]?.delta?.content;
          if (content) onChunk(content);
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }

  buildSystemPrompt(language, options) {
    return `You are Codex, an expert code completion assistant.
Language: ${language}
Provide concise, efficient code completions.
Follow best practices and modern patterns.`;
  }
}
```

### Provider Manager

```javascript
// src/services/ai/ProviderManager.js

import { ClaudeCodeProvider } from './providers/ClaudeCodeProvider';
import { CodexProvider } from './providers/CodexProvider';
import { OllamaProvider } from './providers/OllamaProvider';
import { secureStorage } from '../secureStorage';

export class ProviderManager {
  constructor() {
    this.providers = new Map();
    this.activeProvider = null;
    this.activeModel = null;
  }

  async initialize() {
    // Load saved configuration
    const config = await this.loadConfig();

    // Register available providers
    if (config.claudeCode?.apiKey) {
      this.registerProvider('claude-code', new ClaudeCodeProvider({
        apiKey: config.claudeCode.apiKey
      }));
    }

    if (config.codex?.apiKey) {
      this.registerProvider('codex', new CodexProvider({
        apiKey: config.codex.apiKey
      }));
    }

    // Always register Ollama (no API key needed)
    this.registerProvider('ollama', new OllamaProvider({
      baseUrl: config.ollama?.baseUrl || 'http://localhost:11434'
    }));

    // Set active provider
    if (config.activeProvider && this.providers.has(config.activeProvider)) {
      this.setActiveProvider(config.activeProvider, config.activeModel);
    }
  }

  registerProvider(id, provider) {
    this.providers.set(id, provider);
  }

  setActiveProvider(providerId, modelId) {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }
    this.activeProvider = provider;
    this.activeModel = modelId || provider.models[0]?.id;
  }

  async complete(params) {
    if (!this.activeProvider) {
      throw new Error('No active AI provider configured');
    }
    return this.activeProvider.complete({
      ...params,
      model: params.model || this.activeModel
    });
  }

  async streamComplete(params, onChunk) {
    if (!this.activeProvider) {
      throw new Error('No active AI provider configured');
    }
    return this.activeProvider.streamComplete({
      ...params,
      model: params.model || this.activeModel
    }, onChunk);
  }

  getAvailableProviders() {
    return Array.from(this.providers.entries()).map(([id, provider]) => ({
      id,
      name: provider.name,
      models: provider.models,
      capabilities: provider.capabilities
    }));
  }
}

// Singleton instance
export const providerManager = new ProviderManager();
```

---

## AI Actions & Use Cases

Tidy Code provides targeted AI actions designed to enhance productivity for common text and code editing tasks. These actions are accessible via context menu, keyboard shortcuts, or the command palette.

### Supported Actions

| Action | Description | Input | Output |
|--------|-------------|-------|--------|
| **Explain This** | Explain selected code or text | Selection | Explanation panel |
| **Refactor Selection** | Improve/restructure selected code | Selection | Diff view with suggestions |
| **Convert to YAML** | Convert JSON/XML to YAML format | Selection or full document | Converted content |
| **Infer Schema** | Generate JSON Schema or TypeScript types from data | JSON/XML content | Schema definition |
| **Summarize Logs** | Analyze and summarize log files | Log content | Summary with insights |
| **Generate Test Skeleton** | Create test boilerplate for functions/classes | Code selection | Test file content |

---

### Action: Explain This

Provides clear explanations of selected code or text, useful for understanding unfamiliar code or complex logic.

```javascript
// src/services/ai/actions/explainAction.js

export async function explainAction(selection, context) {
  const prompt = buildExplainPrompt(selection, context);

  return providerManager.complete({
    prompt,
    language: context.language,
    options: {
      task: 'explain',
      maxTokens: 1024,
      temperature: 0.3
    }
  });
}

function buildExplainPrompt(selection, context) {
  return `Explain the following ${context.language || 'code'} in clear, concise terms.
Focus on:
- What it does (purpose)
- How it works (mechanism)
- Any notable patterns or techniques used

Code to explain:
\`\`\`${context.language || ''}
${selection}
\`\`\``;
}
```

**UI Integration:**
- Right-click context menu: "AI > Explain This"
- Keyboard shortcut: `Cmd+Shift+E` (macOS) / `Ctrl+Shift+E` (Windows/Linux)
- Output appears in a collapsible panel below the editor

---

### Action: Refactor Selection

Suggests improvements to selected code while preserving functionality.

```javascript
// src/services/ai/actions/refactorAction.js

export async function refactorAction(selection, context, options = {}) {
  const refactorType = options.type || 'general'; // general, performance, readability, modern
  const prompt = buildRefactorPrompt(selection, context, refactorType);

  return providerManager.complete({
    prompt,
    language: context.language,
    options: {
      task: 'refactor',
      maxTokens: 2048,
      temperature: 0.2
    }
  });
}

function buildRefactorPrompt(selection, context, refactorType) {
  const typeInstructions = {
    general: 'Improve code quality, readability, and maintainability.',
    performance: 'Optimize for better performance while maintaining readability.',
    readability: 'Make the code more readable and self-documenting.',
    modern: 'Update to use modern language features and patterns.'
  };

  return `Refactor the following ${context.language} code.
Goal: ${typeInstructions[refactorType]}

Requirements:
- Preserve the original functionality exactly
- Return only the refactored code without explanations
- Use consistent formatting

Original code:
\`\`\`${context.language}
${selection}
\`\`\``;
}
```

**UI Integration:**
- Right-click context menu: "AI > Refactor Selection"
- Sub-menu options: General, Performance, Readability, Modernize
- Output shows in diff view for easy comparison

---

### Action: Convert to YAML

Converts JSON or XML content to YAML format, leveraging TidyCode's existing format detection.

```javascript
// src/services/ai/actions/convertAction.js

export async function convertToYamlAction(content, context) {
  const sourceFormat = detectFormat(content); // 'json' | 'xml' | 'unknown'

  if (sourceFormat === 'unknown') {
    throw new Error('Unable to detect source format. Content must be valid JSON or XML.');
  }

  const prompt = buildConvertPrompt(content, sourceFormat, 'yaml');

  return providerManager.complete({
    prompt,
    language: 'yaml',
    options: {
      task: 'convert',
      maxTokens: 4096,
      temperature: 0.1 // Low temperature for accurate conversion
    }
  });
}

function buildConvertPrompt(content, sourceFormat, targetFormat) {
  return `Convert the following ${sourceFormat.toUpperCase()} to ${targetFormat.toUpperCase()}.

Requirements:
- Preserve all data exactly
- Use proper ${targetFormat.toUpperCase()} syntax and conventions
- Maintain hierarchical structure
- Return only the converted content, no explanations

Source ${sourceFormat.toUpperCase()}:
\`\`\`${sourceFormat}
${content}
\`\`\``;
}

function detectFormat(content) {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch (e) {
      return 'unknown';
    }
  }
  if (trimmed.startsWith('<')) {
    return 'xml';
  }
  return 'unknown';
}
```

**Supported Conversions:**
| From | To |
|------|-----|
| JSON | YAML |
| XML | YAML |
| JSON | XML |
| YAML | JSON |

**UI Integration:**
- Right-click context menu: "AI > Convert to..." submenu
- Toolbar button in format actions area
- Opens result in new tab or replaces selection

---

### Action: Infer Schema

Generates JSON Schema or TypeScript type definitions from sample data.

```javascript
// src/services/ai/actions/inferSchemaAction.js

export async function inferSchemaAction(content, context, options = {}) {
  const outputFormat = options.format || 'json-schema'; // 'json-schema' | 'typescript' | 'zod'
  const prompt = buildSchemaPrompt(content, outputFormat);

  return providerManager.complete({
    prompt,
    language: outputFormat === 'typescript' ? 'typescript' : 'json',
    options: {
      task: 'infer-schema',
      maxTokens: 4096,
      temperature: 0.2
    }
  });
}

function buildSchemaPrompt(content, outputFormat) {
  const formatInstructions = {
    'json-schema': `Generate a JSON Schema (draft-07) that validates this data.
Include:
- Appropriate types for all fields
- Required fields array
- Description for complex fields
- Pattern validation for strings where applicable (emails, URLs, dates)`,

    'typescript': `Generate TypeScript type definitions for this data.
Include:
- Interface definitions with proper typing
- Optional fields marked with ?
- JSDoc comments for complex fields
- Export statements`,

    'zod': `Generate Zod schema definitions for this data.
Include:
- Proper Zod validators for each field
- Optional/nullable handling
- Custom error messages where helpful
- Export statement`
  };

  return `Analyze the following data and ${formatInstructions[outputFormat]}

Sample data:
\`\`\`json
${content}
\`\`\`

Return only the schema/types, no explanations.`;
}
```

**Output Format Options:**
- JSON Schema (draft-07)
- TypeScript interfaces
- Zod schemas

**UI Integration:**
- Right-click context menu: "AI > Infer Schema..."
- Dialog to select output format
- Result opens in new tab with appropriate language mode
- Integrates with Structure View panel

---

### Action: Summarize Logs

Analyzes log files to extract key insights, errors, and patterns.

```javascript
// src/services/ai/actions/summarizeLogsAction.js

export async function summarizeLogsAction(content, context, options = {}) {
  const analysisType = options.type || 'general'; // 'general' | 'errors' | 'performance' | 'security'
  const prompt = buildLogSummaryPrompt(content, analysisType);

  return providerManager.complete({
    prompt,
    language: 'markdown',
    options: {
      task: 'summarize-logs',
      maxTokens: 2048,
      temperature: 0.3
    }
  });
}

function buildLogSummaryPrompt(content, analysisType) {
  const analysisInstructions = {
    general: `Provide a comprehensive summary including:
- Time range covered
- Key events and their frequency
- Errors or warnings (with counts)
- Notable patterns or anomalies
- Recommendations if applicable`,

    errors: `Focus on error analysis:
- List all unique errors with occurrence counts
- Identify error patterns and potential root causes
- Highlight critical vs non-critical issues
- Suggest investigation priorities`,

    performance: `Analyze performance indicators:
- Response times and latencies
- Throughput patterns
- Resource utilization hints
- Bottleneck indicators
- Performance degradation patterns`,

    security: `Security-focused analysis:
- Authentication/authorization events
- Suspicious patterns or anomalies
- Failed access attempts
- IP addresses or users of interest
- Potential security concerns`
  };

  return `Analyze the following log content and ${analysisInstructions[analysisType]}

Format your response in clear markdown with sections and bullet points.

Log content:
\`\`\`
${content}
\`\`\``;
}
```

**Analysis Types:**
| Type | Focus |
|------|-------|
| General | Overall summary with key events |
| Errors | Error patterns and root causes |
| Performance | Latency, throughput, bottlenecks |
| Security | Auth events, suspicious activity |

**UI Integration:**
- Right-click context menu: "AI > Summarize Logs..."
- Analysis type selector in dialog
- Results panel with collapsible sections
- Option to copy summary to clipboard

---

### Action: Generate Test Skeleton

Creates test boilerplate for selected functions or classes.

```javascript
// src/services/ai/actions/generateTestAction.js

export async function generateTestAction(content, context, options = {}) {
  const framework = options.framework || detectTestFramework(context);
  const prompt = buildTestPrompt(content, context.language, framework);

  return providerManager.complete({
    prompt,
    language: context.language,
    options: {
      task: 'generate-tests',
      maxTokens: 4096,
      temperature: 0.3
    }
  });
}

function buildTestPrompt(content, language, framework) {
  const frameworkExamples = {
    jest: 'Use Jest syntax with describe/it/expect',
    mocha: 'Use Mocha with Chai assertions',
    vitest: 'Use Vitest syntax (similar to Jest)',
    pytest: 'Use pytest with fixtures and assertions',
    unittest: 'Use Python unittest.TestCase',
    go: 'Use Go testing package with t.Run subtests'
  };

  return `Generate a test skeleton for the following ${language} code.

Framework: ${frameworkExamples[framework] || framework}

Requirements:
- Create test cases for all public functions/methods
- Include happy path and edge case tests
- Add descriptive test names
- Include setup/teardown if needed
- Use appropriate mocking patterns
- Add TODO comments for assertions that need implementation

Code to test:
\`\`\`${language}
${content}
\`\`\`

Return only the test code, properly formatted.`;
}

function detectTestFramework(context) {
  // Auto-detect based on project files or language
  const { language, projectFiles } = context;

  if (projectFiles?.includes('jest.config.js')) return 'jest';
  if (projectFiles?.includes('vitest.config.js')) return 'vitest';
  if (projectFiles?.includes('pytest.ini')) return 'pytest';

  // Language defaults
  const defaults = {
    javascript: 'jest',
    typescript: 'jest',
    python: 'pytest',
    go: 'go',
    rust: 'rust'
  };

  return defaults[language] || 'jest';
}
```

**Supported Frameworks:**
| Language | Frameworks |
|----------|------------|
| JavaScript/TypeScript | Jest, Vitest, Mocha |
| Python | pytest, unittest |
| Go | testing package |
| Rust | built-in tests |

**UI Integration:**
- Right-click context menu: "AI > Generate Tests"
- Framework auto-detection with manual override
- Opens test file in new tab
- Suggests appropriate file name (e.g., `*.test.js`, `*_test.py`)

---

### Action Manager

Centralized action dispatcher for all AI operations.

```javascript
// src/services/ai/ActionManager.js

import { explainAction } from './actions/explainAction';
import { refactorAction } from './actions/refactorAction';
import { convertToYamlAction } from './actions/convertAction';
import { inferSchemaAction } from './actions/inferSchemaAction';
import { summarizeLogsAction } from './actions/summarizeLogsAction';
import { generateTestAction } from './actions/generateTestAction';

export class ActionManager {
  constructor(providerManager) {
    this.providerManager = providerManager;
    this.actions = new Map([
      ['explain', explainAction],
      ['refactor', refactorAction],
      ['convert', convertToYamlAction],
      ['infer-schema', inferSchemaAction],
      ['summarize-logs', summarizeLogsAction],
      ['generate-tests', generateTestAction]
    ]);
  }

  async execute(actionId, content, context, options = {}) {
    const action = this.actions.get(actionId);
    if (!action) {
      throw new Error(`Unknown action: ${actionId}`);
    }

    // Check if provider supports this action
    const capabilities = this.providerManager.activeProvider?.capabilities || [];
    if (!capabilities.includes(actionId)) {
      throw new Error(`Current provider does not support: ${actionId}`);
    }

    return action(content, context, options);
  }

  getAvailableActions() {
    const capabilities = this.providerManager.activeProvider?.capabilities || [];
    return Array.from(this.actions.keys()).filter(id => capabilities.includes(id));
  }
}

export const actionManager = new ActionManager(providerManager);
```

---

## UI Components

### Code Suggestion Panel

The `CodeSuggestionPanel` component provides an interface for viewing and editing AI-generated code suggestions.

```jsx
// src/components/CodeSuggestionPanel.jsx

import React, { useState, useCallback } from 'react';
import { Check, X, Edit2, Copy, RefreshCw } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';

export function CodeSuggestionPanel({
  suggestion,
  language,
  onAccept,
  onReject,
  onEdit,
  onRegenerate,
  isLoading
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedCode, setEditedCode] = useState(suggestion);

  const handleAccept = useCallback(() => {
    onAccept(isEditing ? editedCode : suggestion);
    setIsEditing(false);
  }, [suggestion, editedCode, isEditing, onAccept]);

  const handleEdit = useCallback(() => {
    setIsEditing(true);
    setEditedCode(suggestion);
  }, [suggestion]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(suggestion);
  }, [suggestion]);

  return (
    <div className="suggestion-panel">
      <div className="suggestion-header">
        <span className="suggestion-title">AI Suggestion</span>
        <div className="suggestion-actions">
          <button onClick={handleCopy} title="Copy">
            <Copy size={16} />
          </button>
          <button onClick={handleEdit} title="Edit">
            <Edit2 size={16} />
          </button>
          <button onClick={onRegenerate} title="Regenerate" disabled={isLoading}>
            <RefreshCw size={16} className={isLoading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      <div className="suggestion-content">
        {isEditing ? (
          <CodeMirror
            value={editedCode}
            onChange={setEditedCode}
            extensions={[getLanguageExtension(language)]}
            theme="dark"
          />
        ) : (
          <CodeMirror
            value={suggestion}
            readOnly
            extensions={[getLanguageExtension(language)]}
            theme="dark"
          />
        )}
      </div>

      <div className="suggestion-footer">
        <button className="btn-reject" onClick={onReject}>
          <X size={16} /> Reject
        </button>
        <button className="btn-accept" onClick={handleAccept}>
          <Check size={16} /> Accept
        </button>
      </div>
    </div>
  );
}
```

### Provider Selection UI

```jsx
// src/components/AIProviderSelector.jsx

import React from 'react';
import { providerManager } from '../services/ai/ProviderManager';

export function AIProviderSelector({ onSelect }) {
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);

  useEffect(() => {
    setProviders(providerManager.getAvailableProviders());
  }, []);

  const handleProviderChange = (providerId) => {
    const provider = providers.find(p => p.id === providerId);
    setSelectedProvider(provider);
    setSelectedModel(provider?.models[0]?.id);
  };

  const handleModelChange = (modelId) => {
    setSelectedModel(modelId);
    providerManager.setActiveProvider(selectedProvider.id, modelId);
    onSelect?.({ provider: selectedProvider.id, model: modelId });
  };

  return (
    <div className="ai-provider-selector">
      <div className="selector-group">
        <label>AI Provider</label>
        <select
          value={selectedProvider?.id || ''}
          onChange={(e) => handleProviderChange(e.target.value)}
        >
          <option value="">Select Provider</option>
          {providers.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {selectedProvider && (
        <div className="selector-group">
          <label>Model</label>
          <select
            value={selectedModel || ''}
            onChange={(e) => handleModelChange(e.target.value)}
          >
            {selectedProvider.models.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.context.toLocaleString()} tokens)
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
```

### Diff View for Suggestions

```jsx
// src/components/SuggestionDiffView.jsx

import React from 'react';
import { diffLines } from 'diff';

export function SuggestionDiffView({ original, suggested }) {
  const diff = diffLines(original, suggested);

  return (
    <div className="diff-view">
      {diff.map((part, index) => (
        <div
          key={index}
          className={`diff-line ${
            part.added ? 'diff-added' :
            part.removed ? 'diff-removed' :
            'diff-unchanged'
          }`}
        >
          <span className="diff-indicator">
            {part.added ? '+' : part.removed ? '-' : ' '}
          </span>
          <pre>{part.value}</pre>
        </div>
      ))}
    </div>
  );
}
```

### AI Actions Context Menu

```jsx
// src/components/AIActionsMenu.jsx

import React, { useState } from 'react';
import {
  Sparkles,
  MessageSquare,
  RefreshCw,
  FileJson,
  Database,
  FileText,
  TestTube,
  ChevronRight
} from 'lucide-react';
import { actionManager } from '../services/ai/ActionManager';

const AI_ACTIONS = [
  {
    id: 'explain',
    label: 'Explain This',
    icon: MessageSquare,
    shortcut: 'Cmd+Shift+E',
    requiresSelection: true
  },
  {
    id: 'refactor',
    label: 'Refactor Selection',
    icon: RefreshCw,
    shortcut: 'Cmd+Shift+R',
    requiresSelection: true,
    submenu: [
      { id: 'general', label: 'General' },
      { id: 'performance', label: 'Optimize Performance' },
      { id: 'readability', label: 'Improve Readability' },
      { id: 'modern', label: 'Modernize' }
    ]
  },
  {
    id: 'convert',
    label: 'Convert to...',
    icon: FileJson,
    submenu: [
      { id: 'yaml', label: 'YAML' },
      { id: 'json', label: 'JSON' },
      { id: 'xml', label: 'XML' }
    ]
  },
  {
    id: 'infer-schema',
    label: 'Infer Schema',
    icon: Database,
    submenu: [
      { id: 'json-schema', label: 'JSON Schema' },
      { id: 'typescript', label: 'TypeScript Types' },
      { id: 'zod', label: 'Zod Schema' }
    ]
  },
  {
    id: 'summarize-logs',
    label: 'Summarize Logs',
    icon: FileText,
    submenu: [
      { id: 'general', label: 'General Summary' },
      { id: 'errors', label: 'Error Analysis' },
      { id: 'performance', label: 'Performance Analysis' },
      { id: 'security', label: 'Security Analysis' }
    ]
  },
  {
    id: 'generate-tests',
    label: 'Generate Tests',
    icon: TestTube,
    shortcut: 'Cmd+Shift+T',
    requiresSelection: true
  }
];

export function AIActionsMenu({ selection, context, onResult, onClose }) {
  const [loading, setLoading] = useState(null);
  const availableActions = actionManager.getAvailableActions();

  const handleAction = async (actionId, options = {}) => {
    setLoading(actionId);
    try {
      const result = await actionManager.execute(actionId, selection, context, options);
      onResult({ actionId, result, options });
    } catch (error) {
      console.error(`Action ${actionId} failed:`, error);
    } finally {
      setLoading(null);
      onClose?.();
    }
  };

  return (
    <div className="ai-actions-menu">
      <div className="menu-header">
        <Sparkles size={16} />
        <span>AI Actions</span>
      </div>
      <div className="menu-items">
        {AI_ACTIONS.filter(action => availableActions.includes(action.id)).map(action => (
          <AIActionMenuItem
            key={action.id}
            action={action}
            disabled={action.requiresSelection && !selection}
            loading={loading === action.id}
            onSelect={handleAction}
          />
        ))}
      </div>
    </div>
  );
}

function AIActionMenuItem({ action, disabled, loading, onSelect }) {
  const [showSubmenu, setShowSubmenu] = useState(false);
  const Icon = action.icon;

  if (action.submenu) {
    return (
      <div
        className="menu-item has-submenu"
        onMouseEnter={() => setShowSubmenu(true)}
        onMouseLeave={() => setShowSubmenu(false)}
      >
        <Icon size={16} />
        <span>{action.label}</span>
        <ChevronRight size={14} className="submenu-arrow" />
        {showSubmenu && (
          <div className="submenu">
            {action.submenu.map(sub => (
              <button
                key={sub.id}
                className="submenu-item"
                onClick={() => onSelect(action.id, { type: sub.id, format: sub.id })}
              >
                {sub.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      className={`menu-item ${disabled ? 'disabled' : ''}`}
      disabled={disabled || loading}
      onClick={() => onSelect(action.id)}
    >
      {loading ? <RefreshCw size={16} className="spinning" /> : <Icon size={16} />}
      <span>{action.label}</span>
      {action.shortcut && <kbd>{action.shortcut}</kbd>}
    </button>
  );
}
```

### AI Results Panel

```jsx
// src/components/AIResultsPanel.jsx

import React, { useState } from 'react';
import { X, Copy, Check, FileDown, RefreshCw } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { SuggestionDiffView } from './SuggestionDiffView';

export function AIResultsPanel({
  actionId,
  result,
  original,
  language,
  onApply,
  onRegenerate,
  onClose,
  isLoading
}) {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState('result'); // 'result' | 'diff'

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenInNewTab = () => {
    // Dispatch event to open in new tab
    window.dispatchEvent(new CustomEvent('tidycode:open-new-tab', {
      detail: { content: result.text, language }
    }));
  };

  const showDiffView = ['refactor', 'convert'].includes(actionId);

  return (
    <div className="ai-results-panel">
      <div className="panel-header">
        <h3>{getActionTitle(actionId)}</h3>
        <div className="panel-actions">
          {showDiffView && (
            <div className="view-toggle">
              <button
                className={viewMode === 'result' ? 'active' : ''}
                onClick={() => setViewMode('result')}
              >
                Result
              </button>
              <button
                className={viewMode === 'diff' ? 'active' : ''}
                onClick={() => setViewMode('diff')}
              >
                Diff
              </button>
            </div>
          )}
          <button onClick={handleCopy} title="Copy to clipboard">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
          <button onClick={handleOpenInNewTab} title="Open in new tab">
            <FileDown size={16} />
          </button>
          <button onClick={onRegenerate} disabled={isLoading} title="Regenerate">
            <RefreshCw size={16} className={isLoading ? 'spinning' : ''} />
          </button>
          <button onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="panel-content">
        {viewMode === 'diff' && showDiffView ? (
          <SuggestionDiffView original={original} suggested={result.text} />
        ) : (
          <CodeMirror
            value={result.text}
            readOnly
            extensions={[getLanguageExtension(language)]}
            theme="dark"
          />
        )}
      </div>

      {['refactor', 'convert', 'generate-tests', 'infer-schema'].includes(actionId) && (
        <div className="panel-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => onApply(result.text)}>
            {actionId === 'generate-tests' ? 'Open in New Tab' : 'Apply Changes'}
          </button>
        </div>
      )}
    </div>
  );
}

function getActionTitle(actionId) {
  const titles = {
    'explain': 'Explanation',
    'refactor': 'Refactored Code',
    'convert': 'Converted Content',
    'infer-schema': 'Generated Schema',
    'summarize-logs': 'Log Summary',
    'generate-tests': 'Generated Tests'
  };
  return titles[actionId] || 'AI Result';
}
```

---

## Editor Integration

### Keybindings

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Trigger completion | `Cmd+Space` | `Ctrl+Space` |
| Accept suggestion | `Tab` | `Tab` |
| Reject suggestion | `Escape` | `Escape` |
| Next suggestion | `Alt+]` | `Alt+]` |
| Previous suggestion | `Alt+[` | `Alt+[` |
| Open suggestion panel | `Cmd+Shift+Space` | `Ctrl+Shift+Space` |
| **AI Actions** | | |
| Explain This | `Cmd+Shift+E` | `Ctrl+Shift+E` |
| Refactor Selection | `Cmd+Shift+R` | `Ctrl+Shift+R` |
| Generate Tests | `Cmd+Shift+T` | `Ctrl+Shift+T` |
| Open AI Actions Menu | `Cmd+Shift+A` | `Ctrl+Shift+A` |

### CodeMirror Integration

```javascript
// src/services/ai/editorIntegration.js

import { keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { providerManager } from './ProviderManager';

export function createAICompletionExtension(options = {}) {
  return [
    // Ghost text state field
    ghostTextStateField,

    // Ghost text decoration
    ghostTextDecoration,

    // Keybindings
    Prec.highest(keymap.of([
      {
        key: 'Mod-Space',
        run: (view) => {
          triggerCompletion(view);
          return true;
        }
      },
      {
        key: 'Tab',
        run: (view) => {
          if (hasGhostText(view)) {
            acceptGhostText(view);
            return true;
          }
          return false;
        }
      },
      {
        key: 'Escape',
        run: (view) => {
          if (hasGhostText(view)) {
            clearGhostText(view);
            return true;
          }
          return false;
        }
      }
    ]))
  ];
}

async function triggerCompletion(view) {
  const state = view.state;
  const pos = state.selection.main.head;
  const doc = state.doc.toString();

  // Get context around cursor
  const beforeCursor = doc.slice(Math.max(0, pos - 2000), pos);
  const afterCursor = doc.slice(pos, Math.min(doc.length, pos + 500));

  // Detect language from file extension or content
  const language = detectLanguage(view);

  try {
    const result = await providerManager.complete({
      prompt: buildCompletionPrompt(beforeCursor, afterCursor),
      language,
      options: { task: 'inline-completion' }
    });

    if (result.text) {
      showGhostText(view, pos, result.text);
    }
  } catch (error) {
    console.error('AI completion error:', error);
  }
}
```

---

## Backend Architecture

### Tauri Commands (Rust)

```rust
// src-tauri/src/ai.rs

use serde::{Deserialize, Serialize};
use tauri::Window;

#[derive(Debug, Serialize, Deserialize)]
pub struct CompletionRequest {
    pub provider: String,
    pub model: String,
    pub prompt: String,
    pub language: String,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompletionResponse {
    pub text: String,
    pub model: String,
    pub usage: TokenUsage,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamChunk {
    pub text: String,
    pub done: bool,
}

#[tauri::command]
pub async fn ai_complete(request: CompletionRequest) -> Result<CompletionResponse, String> {
    match request.provider.as_str() {
        "claude-code" => claude_complete(request).await,
        "codex" => openai_complete(request).await,
        "ollama" => ollama_complete(request).await,
        _ => Err(format!("Unknown provider: {}", request.provider)),
    }
}

#[tauri::command]
pub async fn ai_stream_complete(
    window: Window,
    request: CompletionRequest,
) -> Result<(), String> {
    let event_name = format!("ai-stream-{}", uuid::Uuid::new_v4());

    // Spawn streaming task
    tauri::async_runtime::spawn(async move {
        match request.provider.as_str() {
            "claude-code" => {
                stream_claude(&window, &event_name, request).await
            }
            "codex" => {
                stream_openai(&window, &event_name, request).await
            }
            _ => Ok(())
        }
    });

    Ok(())
}

async fn stream_claude(
    window: &Window,
    event_name: &str,
    request: CompletionRequest,
) -> Result<(), String> {
    // Implementation for streaming Claude responses
    // Emits chunks via window.emit(event_name, chunk)
    Ok(())
}
```

### Streaming Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              CodeSuggestionPanel                     │   │
│  │                     │                                │   │
│  │            onChunk callback                          │   │
│  │                     ▲                                │   │
│  └─────────────────────┼────────────────────────────────┘   │
│                        │                                     │
│            Tauri Event Listener                              │
│            window.listen('ai-stream-xxx')                   │
├────────────────────────┼────────────────────────────────────┤
│                        │                                     │
│            Tauri IPC Layer                                   │
│                        │                                     │
├────────────────────────┼────────────────────────────────────┤
│                        ▼                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Rust Backend (lib.rs)                   │   │
│  │                     │                                │   │
│  │         window.emit('ai-stream-xxx', chunk)         │   │
│  │                     ▲                                │   │
│  │         ┌───────────┴───────────┐                   │   │
│  │         │   Streaming HTTP      │                   │   │
│  │         │   (reqwest + SSE)     │                   │   │
│  │         └───────────────────────┘                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   AI Provider   │
                    │   (Claude/GPT)  │
                    └─────────────────┘
```

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Create provider interface and base classes
- [ ] Implement ClaudeCodeProvider
- [ ] Implement CodexProvider
- [ ] Create ProviderManager singleton
- [ ] Update secure storage for multiple API keys

### Phase 2: AI Actions Core
- [ ] Implement ActionManager class
- [ ] Create explainAction implementation
- [ ] Create refactorAction implementation
- [ ] Create convertAction implementation (JSON/XML/YAML)
- [ ] Create inferSchemaAction implementation
- [ ] Create summarizeLogsAction implementation
- [ ] Create generateTestAction implementation
- [ ] Add action-specific prompt templates

### Phase 3: UI Components
- [ ] Build CodeSuggestionPanel component
- [ ] Create AIProviderSelector component
- [ ] Implement SuggestionDiffView
- [ ] Build AIActionsMenu (context menu)
- [ ] Create AIResultsPanel component
- [ ] Add provider settings to AISettingsModal
- [ ] Create suggestion history panel

### Phase 4: Editor Integration
- [ ] Implement ghost text for inline suggestions
- [ ] Add keybinding system for AI actions
- [ ] Create completion trigger logic
- [ ] Build context extraction utilities
- [ ] Integrate context menu with CodeMirror
- [ ] Implement multi-cursor suggestion support

### Phase 5: Backend (Rust/Tauri)
- [ ] Add ai.rs module with Tauri commands
- [ ] Implement streaming for Claude API
- [ ] Implement streaming for OpenAI API
- [ ] Add request caching layer
- [ ] Implement rate limiting

### Phase 6: Polish & Testing
- [ ] Add loading states and animations
- [ ] Implement error handling and retry logic
- [ ] Add usage tracking and analytics
- [ ] Write unit and integration tests
- [ ] Performance optimization
- [ ] Accessibility improvements for AI panels

---

## Configuration

### Environment Variables

```bash
# .env (development)
VITE_CLAUDE_API_KEY=sk-ant-...
VITE_OPENAI_API_KEY=sk-...
VITE_OLLAMA_BASE_URL=http://localhost:11434
```

### User Settings Schema

```json
{
  "ai": {
    "activeProvider": "claude-code",
    "activeModel": "claude-3-5-sonnet-20241022",
    "providers": {
      "claude-code": {
        "enabled": true,
        "defaultModel": "claude-3-5-sonnet-20241022"
      },
      "codex": {
        "enabled": true,
        "defaultModel": "gpt-4o"
      },
      "ollama": {
        "enabled": true,
        "baseUrl": "http://localhost:11434",
        "defaultModel": "codellama"
      }
    },
    "completion": {
      "triggerMode": "manual",
      "debounceMs": 300,
      "maxTokens": 2048,
      "temperature": 0.2
    },
    "ui": {
      "showGhostText": true,
      "showConfidence": true,
      "panelPosition": "right"
    }
  }
}
```

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2025-01-07 | 0.1.0 | Initial architecture document |
| 2025-01-07 | 0.2.0 | Added AI Actions & Use Cases section with 6 targeted actions: Explain This, Refactor Selection, Convert to YAML, Infer Schema, Summarize Logs, Generate Test Skeleton. Added AIActionsMenu and AIResultsPanel UI components. Updated implementation phases. |

---

## Notes

- API keys are stored using AES-256-GCM encryption via `secureStorage.js`
- Desktop app uses Tauri commands for streaming to avoid CORS issues
- Web version falls back to direct fetch with proper headers
- Ghost text rendering uses CodeMirror decorations for performance
- Consider implementing request caching to reduce API costs

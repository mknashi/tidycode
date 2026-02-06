/**
 * AI Provider Interface
 *
 * Base class that all AI providers must extend.
 * Provides a unified interface for code completion, chat, and various AI actions.
 *
 * @example
 * class MyProvider extends AIProvider {
 *   constructor(config) {
 *     super({
 *       name: 'My Provider',
 *       models: [{ id: 'model-1', name: 'Model 1', context: 8000 }],
 *       capabilities: ['completion', 'chat', 'explain']
 *     });
 *   }
 *   async complete(params) { ... }
 * }
 */

/**
 * Supported AI capabilities that providers can implement
 */
export const AI_CAPABILITIES = {
  COMPLETION: 'completion',           // Inline code completion
  CHAT: 'chat',                       // Conversational AI
  STREAM: 'stream',                   // Streaming responses
  EXPLAIN: 'explain',                 // Explain code/text
  REFACTOR: 'refactor',               // Refactor code
  CONVERT: 'convert',                 // Convert between formats (JSON/YAML/XML)
  INFER_SCHEMA: 'infer-schema',       // Generate schema from data
  SUMMARIZE_LOGS: 'summarize-logs',   // Log analysis & summarization
  GENERATE_TESTS: 'generate-tests',   // Test skeleton generation
  FIX_SYNTAX: 'fix-syntax',           // Fix JSON/XML syntax errors
  TRANSFORM_TEXT: 'transform-text',   // Text transformations (rewrite, summarize, etc.)
  VISION: 'vision',                   // Image/visual understanding
  CODE_EXECUTION: 'code-execution',   // Execute code (sandboxed)
};

/**
 * Completion result structure
 */
export class CompletionResult {
  /**
   * @param {Object} data - Result data
   * @param {string} data.text - Generated text/code
   * @param {number} [data.confidence] - Confidence score (0-1)
   * @param {Object} [data.metadata] - Provider-specific metadata
   * @param {Object} [data.usage] - Token usage information
   */
  constructor(data) {
    this.text = data.text;
    this.confidence = data.confidence ?? null;
    this.metadata = data.metadata ?? {};
    this.usage = data.usage ?? null;
  }
}

/**
 * Chat message structure
 */
export class ChatMessage {
  /**
   * @param {string} role - Message role ('system', 'user', 'assistant')
   * @param {string} content - Message content
   */
  constructor(role, content) {
    this.role = role;
    this.content = content;
  }

  static system(content) {
    return new ChatMessage('system', content);
  }

  static user(content) {
    return new ChatMessage('user', content);
  }

  static assistant(content) {
    return new ChatMessage('assistant', content);
  }
}

/**
 * Model information structure
 */
export class ModelInfo {
  /**
   * @param {Object} data - Model data
   * @param {string} data.id - Model identifier for API calls
   * @param {string} data.name - Human-readable name
   * @param {number} [data.contextWindow] - Maximum context window in tokens
   * @param {string} [data.description] - Model description
   * @param {boolean} [data.isDefault] - Whether this is the default model
   * @param {boolean} [data.supportsVision] - Whether model supports vision/images
   * @param {boolean} [data.supportsStreaming] - Whether model supports streaming
   * @param {string} [data.releaseDate] - Model release date
   * @param {string} [data.status] - Model status ('stable', 'preview', 'deprecated')
   */
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.contextWindow = data.contextWindow ?? 4096;
    this.description = data.description ?? '';
    this.isDefault = data.isDefault ?? false;
    this.supportsVision = data.supportsVision ?? false;
    this.supportsStreaming = data.supportsStreaming ?? true;
    this.releaseDate = data.releaseDate ?? null;
    this.status = data.status ?? 'stable';
  }
}

/**
 * Provider configuration structure
 */
export class ProviderConfig {
  /**
   * @param {Object} data - Configuration data
   * @param {string} data.name - Provider display name
   * @param {string} data.id - Provider identifier
   * @param {Array<ModelInfo>} [data.models] - Available models
   * @param {Array<string>} [data.capabilities] - Supported capabilities
   * @param {string} [data.baseUrl] - API base URL
   * @param {string} [data.apiVersion] - API version string
   * @param {boolean} [data.requiresApiKey] - Whether API key is required
   * @param {string} [data.apiKeyPrefix] - Expected API key prefix (e.g., 'sk-')
   * @param {string} [data.apiKeyUrl] - URL to get API key
   * @param {string} [data.docsUrl] - Documentation URL
   */
  constructor(data) {
    this.name = data.name;
    this.id = data.id;
    this.models = (data.models || []).map(m => m instanceof ModelInfo ? m : new ModelInfo(m));
    this.capabilities = data.capabilities || [];
    this.baseUrl = data.baseUrl || null;
    this.apiVersion = data.apiVersion || null;
    this.requiresApiKey = data.requiresApiKey ?? true;
    this.apiKeyPrefix = data.apiKeyPrefix || null;
    this.apiKeyUrl = data.apiKeyUrl || null;
    this.docsUrl = data.docsUrl || null;
  }
}

/**
 * Base AI Provider class
 * All provider implementations must extend this class
 */
export class AIProvider {
  /**
   * @param {ProviderConfig|Object} config - Provider configuration
   */
  constructor(config) {
    this.config = config instanceof ProviderConfig ? config : new ProviderConfig(config);
    this.apiKey = null;
    this.selectedModel = null;
    this._initialized = false;
  }

  /**
   * Get provider name
   * @returns {string}
   */
  get name() {
    return this.config.name;
  }

  /**
   * Get provider ID
   * @returns {string}
   */
  get id() {
    return this.config.id;
  }

  /**
   * Get available models
   * @returns {Array<ModelInfo>}
   */
  get models() {
    return this.config.models;
  }

  /**
   * Get supported capabilities
   * @returns {Array<string>}
   */
  get capabilities() {
    return this.config.capabilities;
  }

  /**
   * Get API base URL
   * @returns {string|null}
   */
  get baseUrl() {
    return this.config.baseUrl;
  }

  /**
   * Check if provider requires API key
   * @returns {boolean}
   */
  get requiresApiKey() {
    return this.config.requiresApiKey;
  }

  /**
   * Initialize the provider with API key
   * @param {Object} options - Initialization options
   * @param {string} [options.apiKey] - API key
   * @param {string} [options.model] - Default model to use
   * @param {string} [options.baseUrl] - Override base URL
   * @returns {Promise<void>}
   */
  async initialize(options = {}) {
    if (options.apiKey) {
      this.apiKey = options.apiKey;
    }
    if (options.model) {
      this.selectedModel = options.model;
    }
    if (options.baseUrl) {
      this.config.baseUrl = options.baseUrl;
    }
    this._initialized = true;
  }

  /**
   * Check if provider is initialized and ready
   * @returns {boolean}
   */
  isReady() {
    if (this.requiresApiKey && !this.apiKey) {
      return false;
    }
    return this._initialized;
  }

  /**
   * Check if provider supports a capability
   * @param {string} capability - Capability to check
   * @returns {boolean}
   */
  hasCapability(capability) {
    return this.capabilities.includes(capability);
  }

  /**
   * Get the default model
   * @returns {ModelInfo|null}
   */
  getDefaultModel() {
    return this.models.find(m => m.isDefault) || this.models[0] || null;
  }

  /**
   * Get model by ID
   * @param {string} modelId - Model identifier
   * @returns {ModelInfo|null}
   */
  getModel(modelId) {
    return this.models.find(m => m.id === modelId) || null;
  }

  /**
   * Get the currently selected model ID
   * @returns {string}
   */
  getCurrentModelId() {
    return this.selectedModel || this.getDefaultModel()?.id || this.models[0]?.id;
  }

  /**
   * Validate API key format
   * @param {string} apiKey - API key to validate
   * @returns {boolean}
   */
  validateApiKeyFormat(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }
    if (this.config.apiKeyPrefix) {
      return apiKey.startsWith(this.config.apiKeyPrefix) && apiKey.length > 20;
    }
    return apiKey.length > 10;
  }

  /**
   * Validate provider configuration by making a test API call
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  async validateConfig() {
    throw new Error('validateConfig() must be implemented by subclass');
  }

  /**
   * Generate code/text completion
   * @param {Object} params - Completion parameters
   * @param {string} params.prompt - The prompt/context
   * @param {string} [params.language] - Programming language
   * @param {string} [params.model] - Model to use
   * @param {number} [params.maxTokens] - Maximum tokens to generate
   * @param {number} [params.temperature] - Sampling temperature (0-1)
   * @param {string} [params.task] - Task type for context
   * @param {Object} [params.options] - Additional provider-specific options
   * @returns {Promise<CompletionResult>}
   */
  async complete(params) {
    throw new Error('complete() must be implemented by subclass');
  }

  /**
   * Generate completion with streaming response
   * @param {Object} params - Same as complete()
   * @param {Function} onChunk - Callback for each chunk: (text: string, done: boolean) => void
   * @returns {Promise<CompletionResult>} - Final complete result
   */
  async streamComplete(params, onChunk) {
    throw new Error('streamComplete() must be implemented by subclass');
  }

  /**
   * Chat-based interaction
   * @param {Array<ChatMessage>} messages - Conversation history
   * @param {Object} [options] - Chat options
   * @param {string} [options.model] - Model to use
   * @param {number} [options.maxTokens] - Maximum tokens
   * @param {number} [options.temperature] - Sampling temperature
   * @returns {Promise<CompletionResult>}
   */
  async chat(messages, options = {}) {
    throw new Error('chat() must be implemented by subclass');
  }

  /**
   * Stream chat response
   * @param {Array<ChatMessage>} messages - Conversation history
   * @param {Function} onChunk - Callback for each chunk
   * @param {Object} [options] - Chat options
   * @returns {Promise<CompletionResult>}
   */
  async streamChat(messages, onChunk, options = {}) {
    throw new Error('streamChat() must be implemented by subclass');
  }

  /**
   * Build system prompt for a specific task
   * @param {string} task - Task type
   * @param {Object} context - Task context
   * @returns {string}
   */
  buildSystemPrompt(task, context = {}) {
    const basePrompt = `You are an expert programming assistant.`;

    const taskPrompts = {
      'completion': `${basePrompt} Provide concise, production-ready code completions.`,
      'explain': `${basePrompt} Explain code clearly and concisely.`,
      'refactor': `${basePrompt} Refactor code to improve quality while preserving functionality.`,
      'fix-syntax': `${basePrompt} Fix syntax errors in the provided content.`,
      'convert': `${basePrompt} Convert content between formats accurately.`,
      'infer-schema': `${basePrompt} Generate accurate schemas from data.`,
      'summarize-logs': `${basePrompt} Analyze and summarize log content.`,
      'generate-tests': `${basePrompt} Generate comprehensive test cases.`,
    };

    let prompt = taskPrompts[task] || basePrompt;

    if (context.language) {
      prompt += `\nLanguage: ${context.language}`;
    }

    return prompt;
  }

  /**
   * Extract code/content from AI response (removes markdown code blocks, etc.)
   * @param {string} text - Raw response text
   * @param {string} [expectedFormat] - Expected format ('json', 'xml', 'yaml', etc.)
   * @returns {string}
   */
  extractContent(text, expectedFormat = null) {
    let result = text.trim();

    // Remove markdown code block markers
    if (result.includes('```')) {
      const lines = result.split('\n');
      const codeLines = [];
      let inCodeBlock = false;

      for (const line of lines) {
        if (line.trim().startsWith('```')) {
          inCodeBlock = !inCodeBlock;
        } else if (inCodeBlock) {
          codeLines.push(line);
        }
      }

      if (codeLines.length > 0) {
        result = codeLines.join('\n');
      }
    }

    // Format-specific extraction
    if (expectedFormat === 'json') {
      const startMatch = result.match(/[{\[]/);
      if (startMatch) {
        const startIdx = startMatch.index;
        const startChar = startMatch[0];
        const endChar = startChar === '{' ? '}' : ']';
        let depth = 0;
        let endIdx = startIdx;

        for (let i = startIdx; i < result.length; i++) {
          if (result[i] === startChar) depth++;
          else if (result[i] === endChar) {
            depth--;
            if (depth === 0) {
              endIdx = i + 1;
              break;
            }
          }
        }

        if (endIdx > startIdx) {
          result = result.substring(startIdx, endIdx);
        }
      }
    } else if (expectedFormat === 'xml') {
      const firstTag = result.indexOf('<');
      const lastTag = result.lastIndexOf('>');
      if (firstTag !== -1 && lastTag !== -1 && lastTag > firstTag) {
        result = result.substring(firstTag, lastTag + 1);
      }
    }

    return result.trim();
  }

  /**
   * Make HTTP request to provider API
   * Override in subclass for custom handling
   * @param {string} endpoint - API endpoint
   * @param {Object} body - Request body
   * @param {Object} [options] - Request options
   * @returns {Promise<Object>}
   */
  async makeRequest(endpoint, body, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = this.getRequestHeaders(options);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } catch (networkError) {
      throw new Error(this._classifyNetworkError(networkError));
    }

    if (!response.ok) {
      const error = await this.parseErrorResponse(response);
      throw new Error(this._classifyHttpError(response.status, error));
    }

    return response.json();
  }

  /**
   * Get headers for API request
   * Override in subclass for provider-specific headers
   * @param {Object} [options] - Additional options
   * @returns {Object}
   */
  getRequestHeaders(options = {}) {
    return {
      'Content-Type': 'application/json',
      ...options.headers,
    };
  }

  /**
   * Parse error response from API
   * @param {Response} response - Fetch response
   * @returns {Promise<string>}
   */
  async parseErrorResponse(response) {
    try {
      const data = await response.json();
      return data.error?.message || data.message || `API error: ${response.status}`;
    } catch {
      return `API error: ${response.status} ${response.statusText}`;
    }
  }

  /**
   * Classify a network-level fetch error into a user-friendly message.
   * @param {Error} error - The network error from fetch()
   * @returns {string}
   * @private
   */
  _classifyNetworkError(error) {
    const msg = error.message || '';
    if (error.name === 'AbortError') {
      return `Request to ${this.name} was cancelled or timed out.`;
    }
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('CORS') || msg.includes('Load failed')) {
      return `Network error connecting to ${this.name}. This is likely a browser CORS restriction or an invalid API key. Check your API key in AI Settings, or try Groq which has better browser CORS support.`;
    }
    return `Could not reach ${this.name}: ${msg}`;
  }

  /**
   * Classify an HTTP status error into a user-friendly message.
   * @param {number} status - HTTP status code
   * @param {string} rawMessage - Raw error message from parseErrorResponse
   * @returns {string}
   * @private
   */
  _classifyHttpError(status, rawMessage) {
    if (status === 401 || status === 403) {
      return `Authentication failed for ${this.name}. Please check your API key in AI Settings.`;
    }
    if (status === 429) {
      return `Rate limit exceeded for ${this.name}. Please wait a moment and try again.`;
    }
    if (status >= 500) {
      return `${this.name} is experiencing issues (${status}). Please try again later.`;
    }
    return rawMessage;
  }

  /**
   * Clean up resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    this._initialized = false;
  }
}

export default AIProvider;

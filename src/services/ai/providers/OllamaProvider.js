/**
 * Ollama Provider (Local)
 *
 * Supports running AI models locally via Ollama.
 * https://ollama.com/
 */

import {
  AIProvider,
  CompletionResult,
  ModelInfo,
  AI_CAPABILITIES,
} from '../ProviderInterface.js';

/**
 * Common Ollama models (fetched dynamically when available)
 */
const DEFAULT_OLLAMA_MODELS = [
  // Qwen models (recommended for coding)
  new ModelInfo({
    id: 'qwen2.5-coder:7b',
    name: 'Qwen 2.5 Coder 7B',
    contextWindow: 32768,
    description: 'Excellent for code generation',
    isDefault: true,
    supportsVision: false,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'qwen2.5-coder:1.5b',
    name: 'Qwen 2.5 Coder 1.5B',
    contextWindow: 32768,
    description: 'Fast and lightweight coder',
    supportsVision: false,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'qwen2.5:7b',
    name: 'Qwen 2.5 7B',
    contextWindow: 128000,
    description: 'General purpose model',
    supportsVision: false,
    status: 'stable',
  }),

  // Llama models
  new ModelInfo({
    id: 'llama3.2:latest',
    name: 'Llama 3.2',
    contextWindow: 128000,
    description: 'Latest Llama model',
    supportsVision: false,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'llama3.1:8b',
    name: 'Llama 3.1 8B',
    contextWindow: 128000,
    description: 'Efficient Llama model',
    supportsVision: false,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'llama3.1:70b',
    name: 'Llama 3.1 70B',
    contextWindow: 128000,
    description: 'Large Llama model',
    supportsVision: false,
    status: 'stable',
  }),

  // CodeLlama
  new ModelInfo({
    id: 'codellama:7b',
    name: 'CodeLlama 7B',
    contextWindow: 16384,
    description: 'Code-specialized Llama',
    supportsVision: false,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'codellama:13b',
    name: 'CodeLlama 13B',
    contextWindow: 16384,
    description: 'Larger CodeLlama',
    supportsVision: false,
    status: 'stable',
  }),

  // DeepSeek Coder
  new ModelInfo({
    id: 'deepseek-coder-v2:latest',
    name: 'DeepSeek Coder V2',
    contextWindow: 128000,
    description: 'Advanced code model',
    supportsVision: false,
    status: 'stable',
  }),

  // Mistral/Mixtral
  new ModelInfo({
    id: 'mistral:7b',
    name: 'Mistral 7B',
    contextWindow: 32768,
    description: 'Efficient general model',
    supportsVision: false,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'mixtral:8x7b',
    name: 'Mixtral 8x7B',
    contextWindow: 32768,
    description: 'Mixture of experts',
    supportsVision: false,
    status: 'stable',
  }),

  // Phi models (Microsoft)
  new ModelInfo({
    id: 'phi3:medium',
    name: 'Phi-3 Medium',
    contextWindow: 128000,
    description: 'Microsoft Phi-3',
    supportsVision: false,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'phi3:mini',
    name: 'Phi-3 Mini',
    contextWindow: 128000,
    description: 'Lightweight Phi-3',
    supportsVision: false,
    status: 'stable',
  }),

  // Gemma (Google)
  new ModelInfo({
    id: 'gemma2:9b',
    name: 'Gemma 2 9B',
    contextWindow: 8192,
    description: 'Google Gemma 2',
    supportsVision: false,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'gemma2:2b',
    name: 'Gemma 2 2B',
    contextWindow: 8192,
    description: 'Lightweight Gemma',
    supportsVision: false,
    status: 'stable',
  }),

  // Vision models
  new ModelInfo({
    id: 'llava:13b',
    name: 'LLaVA 13B',
    contextWindow: 4096,
    description: 'Vision-language model',
    supportsVision: true,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'llava:7b',
    name: 'LLaVA 7B',
    contextWindow: 4096,
    description: 'Smaller vision model',
    supportsVision: true,
    status: 'stable',
  }),
];

/**
 * Ollama Provider
 */
export class OllamaProvider extends AIProvider {
  constructor(config = {}) {
    super({
      name: 'Ollama',
      id: 'ollama',
      models: DEFAULT_OLLAMA_MODELS,
      capabilities: [
        AI_CAPABILITIES.COMPLETION,
        AI_CAPABILITIES.CHAT,
        AI_CAPABILITIES.STREAM,
        AI_CAPABILITIES.EXPLAIN,
        AI_CAPABILITIES.REFACTOR,
        AI_CAPABILITIES.CONVERT,
        AI_CAPABILITIES.INFER_SCHEMA,
        AI_CAPABILITIES.SUMMARIZE_LOGS,
        AI_CAPABILITIES.GENERATE_TESTS,
        AI_CAPABILITIES.FIX_SYNTAX,
        AI_CAPABILITIES.TRANSFORM_TEXT,
      ],
      baseUrl: config.baseUrl || 'http://localhost:11434',
      requiresApiKey: false, // Ollama runs locally
      apiKeyUrl: null,
      docsUrl: 'https://ollama.com/library',
    });

    // Track available models from the local Ollama instance
    this._availableModels = [];
  }

  /**
   * Get request headers for Ollama API
   */
  getRequestHeaders(options = {}) {
    return {
      'Content-Type': 'application/json',
      ...options.headers,
    };
  }

  /**
   * Check if Ollama is running and get available models
   */
  async validateConfig() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });

      if (!response.ok) {
        return { valid: false, error: 'Ollama is not responding' };
      }

      const data = await response.json();
      this._availableModels = data.models || [];

      return {
        valid: true,
        models: this._availableModels.map(m => m.name),
      };
    } catch (error) {
      return {
        valid: false,
        error: `Cannot connect to Ollama at ${this.baseUrl}. Is Ollama running?`,
      };
    }
  }

  /**
   * Get models available on the local Ollama instance
   */
  async getAvailableModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });

      if (!response.ok) {
        return this.models; // Fall back to default models
      }

      const data = await response.json();
      this._availableModels = data.models || [];

      // Convert to ModelInfo format
      return this._availableModels.map(m => new ModelInfo({
        id: m.name,
        name: m.name,
        contextWindow: 4096, // Default, actual varies by model
        description: `${(m.size / 1e9).toFixed(1)} GB`,
        status: 'stable',
      }));
    } catch {
      return this.models;
    }
  }

  /**
   * Check if a specific model is available locally
   */
  async isModelAvailable(modelId) {
    await this.validateConfig();
    return this._availableModels.some(m => m.name === modelId);
  }

  /**
   * Pull a model from Ollama library
   */
  async pullModel(modelId, onProgress) {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify({ name: modelId, stream: true }),
    });

    if (!response.ok) {
      throw new Error(`Failed to pull model: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (onProgress) {
              onProgress({
                status: parsed.status,
                completed: parsed.completed,
                total: parsed.total,
              });
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Generate completion using Ollama
   */
  async complete(params) {
    const {
      prompt,
      language,
      model,
      maxTokens = 2048,
      temperature = 0.2,
      task = 'completion',
      options = {},
    } = params;

    const systemPrompt = options.systemPrompt || this.buildSystemPrompt(task, { language });

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify({
        model: model || this.getCurrentModelId(),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        options: {
          num_predict: maxTokens,
          temperature,
        },
        stream: false,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const error = await this.parseErrorResponse(response);
      throw new Error(error);
    }

    const data = await response.json();
    const text = data.message?.content || '';

    return new CompletionResult({
      text: options.extractFormat ? this.extractContent(text, options.extractFormat) : text,
      confidence: 0.8, // Local models don't provide confidence
      metadata: {
        model: data.model,
        doneReason: data.done_reason,
      },
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
    });
  }

  /**
   * Stream completion using Ollama
   */
  async streamComplete(params, onChunk) {
    const {
      prompt,
      language,
      model,
      maxTokens = 2048,
      temperature = 0.2,
      task = 'completion',
      options = {},
    } = params;

    const systemPrompt = options.systemPrompt || this.buildSystemPrompt(task, { language });

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify({
        model: model || this.getCurrentModelId(),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        options: {
          num_predict: maxTokens,
          temperature,
        },
        stream: true,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const error = await this.parseErrorResponse(response);
      throw new Error(error);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            const content = parsed.message?.content;
            if (content) {
              fullText += content;
              onChunk(content, false);
            }
            if (parsed.done) {
              onChunk('', true);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return new CompletionResult({
      text: fullText,
      metadata: { streamed: true },
    });
  }

  /**
   * Chat with Ollama
   */
  async chat(messages, options = {}) {
    const {
      model,
      maxTokens = 2048,
      temperature = 0.7,
    } = options;

    const ollamaMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify({
        model: model || this.getCurrentModelId(),
        messages: ollamaMessages,
        options: {
          num_predict: maxTokens,
          temperature,
        },
        stream: false,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const error = await this.parseErrorResponse(response);
      throw new Error(error);
    }

    const data = await response.json();

    return new CompletionResult({
      text: data.message?.content || '',
      metadata: {
        model: data.model,
      },
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
    });
  }

  /**
   * Stream chat with Ollama
   */
  async streamChat(messages, onChunk, options = {}) {
    const {
      model,
      maxTokens = 2048,
      temperature = 0.7,
    } = options;

    const ollamaMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify({
        model: model || this.getCurrentModelId(),
        messages: ollamaMessages,
        options: {
          num_predict: maxTokens,
          temperature,
        },
        stream: true,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const error = await this.parseErrorResponse(response);
      throw new Error(error);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            const content = parsed.message?.content;
            if (content) {
              fullText += content;
              onChunk(content, false);
            }
            if (parsed.done) {
              onChunk('', true);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return new CompletionResult({ text: fullText });
  }

  /**
   * Parse error response from Ollama API
   */
  async parseErrorResponse(response) {
    try {
      const data = await response.json();
      return data.error || `Ollama error: ${response.status}`;
    } catch {
      return `Ollama error: ${response.status} ${response.statusText}`;
    }
  }
}

export default OllamaProvider;

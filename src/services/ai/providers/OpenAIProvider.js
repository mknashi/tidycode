/**
 * OpenAI Provider
 *
 * Supports GPT-4, GPT-4o, GPT-5, and future OpenAI models.
 * https://platform.openai.com/docs/api-reference/chat/create
 */

import {
  AIProvider,
  CompletionResult,
  ModelInfo,
  AI_CAPABILITIES,
} from '../ProviderInterface.js';

/**
 * OpenAI model definitions
 */
const OPENAI_MODELS = [
  // GPT-5 models (next generation - placeholder for future)
  new ModelInfo({
    id: 'gpt-5',
    name: 'GPT-5',
    contextWindow: 256000,
    description: 'Most advanced GPT model (when available)',
    supportsVision: true,
    status: 'preview',
  }),
  new ModelInfo({
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    contextWindow: 128000,
    description: 'Efficient GPT-5 variant (when available)',
    supportsVision: true,
    status: 'preview',
  }),

  // GPT-4o models (current flagship)
  new ModelInfo({
    id: 'gpt-4o',
    name: 'GPT-4o',
    contextWindow: 128000,
    description: 'Most capable current model, multimodal',
    isDefault: true,
    supportsVision: true,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    contextWindow: 128000,
    description: 'Fast and cost-effective',
    supportsVision: true,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'gpt-4o-2024-11-20',
    name: 'GPT-4o (Nov 2024)',
    contextWindow: 128000,
    description: 'GPT-4o snapshot from November 2024',
    supportsVision: true,
    status: 'stable',
  }),

  // GPT-4 Turbo
  new ModelInfo({
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    contextWindow: 128000,
    description: 'GPT-4 Turbo with vision',
    supportsVision: true,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'gpt-4-turbo-preview',
    name: 'GPT-4 Turbo Preview',
    contextWindow: 128000,
    description: 'Latest GPT-4 Turbo preview',
    supportsVision: false,
    status: 'preview',
  }),

  // GPT-4 base
  new ModelInfo({
    id: 'gpt-4',
    name: 'GPT-4',
    contextWindow: 8192,
    description: 'Original GPT-4 model',
    supportsVision: false,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'gpt-4-32k',
    name: 'GPT-4 32K',
    contextWindow: 32768,
    description: 'GPT-4 with extended context',
    supportsVision: false,
    status: 'stable',
  }),

  // GPT-3.5 models
  new ModelInfo({
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    contextWindow: 16385,
    description: 'Fast and economical',
    supportsVision: false,
    status: 'stable',
  }),

  // O1 reasoning models
  new ModelInfo({
    id: 'o1-preview',
    name: 'O1 Preview',
    contextWindow: 128000,
    description: 'Advanced reasoning model',
    supportsVision: false,
    status: 'preview',
  }),
  new ModelInfo({
    id: 'o1-mini',
    name: 'O1 Mini',
    contextWindow: 128000,
    description: 'Fast reasoning model',
    supportsVision: false,
    status: 'preview',
  }),
];

/**
 * OpenAI Provider
 */
export class OpenAIProvider extends AIProvider {
  constructor(config = {}) {
    super({
      name: 'OpenAI',
      id: 'openai',
      models: OPENAI_MODELS,
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
        AI_CAPABILITIES.VISION,
      ],
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      requiresApiKey: true,
      apiKeyPrefix: 'sk-',
      apiKeyUrl: 'https://platform.openai.com/api-keys',
      docsUrl: 'https://platform.openai.com/docs/api-reference',
    });

    if (config.apiKey) {
      this.apiKey = config.apiKey;
    }

    // Organization ID (optional)
    this.organizationId = config.organizationId || null;
  }

  /**
   * Get request headers for OpenAI API
   */
  getRequestHeaders(options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      ...options.headers,
    };

    if (this.organizationId) {
      headers['OpenAI-Organization'] = this.organizationId;
    }

    return headers;
  }

  /**
   * Validate API key by making a simple request
   */
  async validateConfig() {
    if (!this.apiKey) {
      return { valid: false, error: 'API key is required' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.getRequestHeaders(),
      });

      if (response.ok) {
        return { valid: true };
      }

      const error = await this.parseErrorResponse(response);
      return { valid: false, error };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Generate completion using OpenAI
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

    const response = await this.makeRequest('/chat/completions', {
      model: model || this.getCurrentModelId(),
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    });

    const text = response.choices?.[0]?.message?.content || '';

    return new CompletionResult({
      text: options.extractFormat ? this.extractContent(text, options.extractFormat) : text,
      confidence: this.calculateConfidence(response),
      metadata: {
        model: response.model,
        finishReason: response.choices?.[0]?.finish_reason,
      },
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : null,
    });
  }

  /**
   * Stream completion using OpenAI
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

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify({
        model: model || this.getCurrentModelId(),
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
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
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              onChunk('', true);
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullText += content;
                onChunk(content, false);
              }
            } catch {
              // Skip invalid JSON
            }
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
   * Chat with OpenAI
   */
  async chat(messages, options = {}) {
    const {
      model,
      maxTokens = 2048,
      temperature = 0.7,
    } = options;

    // Convert to OpenAI format
    const openaiMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const response = await this.makeRequest('/chat/completions', {
      model: model || this.getCurrentModelId(),
      max_tokens: maxTokens,
      temperature,
      messages: openaiMessages,
    });

    return new CompletionResult({
      text: response.choices?.[0]?.message?.content || '',
      metadata: {
        model: response.model,
        finishReason: response.choices?.[0]?.finish_reason,
      },
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : null,
    });
  }

  /**
   * Stream chat with OpenAI
   */
  async streamChat(messages, onChunk, options = {}) {
    const {
      model,
      maxTokens = 2048,
      temperature = 0.7,
    } = options;

    const openaiMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify({
        model: model || this.getCurrentModelId(),
        max_tokens: maxTokens,
        temperature,
        messages: openaiMessages,
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
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              onChunk('', true);
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullText += content;
                onChunk(content, false);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return new CompletionResult({ text: fullText });
  }

  /**
   * Calculate confidence score based on response
   */
  calculateConfidence(response) {
    const finishReason = response.choices?.[0]?.finish_reason;
    if (finishReason === 'stop') return 0.9;
    if (finishReason === 'length') return 0.6;
    if (finishReason === 'content_filter') return 0.3;
    return 0.7;
  }
}

export default OpenAIProvider;

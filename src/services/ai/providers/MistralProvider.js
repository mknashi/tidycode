/**
 * Mistral Provider
 *
 * Supports Mistral AI models including Mixtral and Codestral.
 * https://docs.mistral.ai/api/
 */

import {
  AIProvider,
  CompletionResult,
  ModelInfo,
  AI_CAPABILITIES,
} from '../ProviderInterface.js';

/**
 * Mistral model definitions
 */
const MISTRAL_MODELS = [
  // Mistral Large models
  new ModelInfo({
    id: 'mistral-large-latest',
    name: 'Mistral Large',
    contextWindow: 128000,
    description: 'Most capable Mistral model',
    isDefault: true,
    supportsVision: false,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'mistral-large-2411',
    name: 'Mistral Large (Nov 2024)',
    contextWindow: 128000,
    description: 'Mistral Large snapshot',
    supportsVision: false,
    status: 'stable',
  }),

  // Pixtral models (vision)
  new ModelInfo({
    id: 'pixtral-large-latest',
    name: 'Pixtral Large',
    contextWindow: 128000,
    description: 'Multimodal model with vision',
    supportsVision: true,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'pixtral-12b-2409',
    name: 'Pixtral 12B',
    contextWindow: 128000,
    description: 'Efficient vision model',
    supportsVision: true,
    status: 'stable',
  }),

  // Mistral Medium/Small
  new ModelInfo({
    id: 'mistral-medium-latest',
    name: 'Mistral Medium',
    contextWindow: 32000,
    description: 'Balanced performance',
    supportsVision: false,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'mistral-small-latest',
    name: 'Mistral Small',
    contextWindow: 32000,
    description: 'Fast and efficient',
    supportsVision: false,
    status: 'stable',
  }),

  // Codestral (code-specialized)
  new ModelInfo({
    id: 'codestral-latest',
    name: 'Codestral',
    contextWindow: 32000,
    description: 'Optimized for code generation',
    supportsVision: false,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'codestral-mamba-latest',
    name: 'Codestral Mamba',
    contextWindow: 256000,
    description: 'Long-context code model',
    supportsVision: false,
    status: 'stable',
  }),

  // Ministral (lightweight)
  new ModelInfo({
    id: 'ministral-8b-latest',
    name: 'Ministral 8B',
    contextWindow: 128000,
    description: 'Lightweight and fast',
    supportsVision: false,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'ministral-3b-latest',
    name: 'Ministral 3B',
    contextWindow: 128000,
    description: 'Smallest Mistral model',
    supportsVision: false,
    status: 'stable',
  }),

  // Open models
  new ModelInfo({
    id: 'open-mistral-nemo',
    name: 'Mistral Nemo',
    contextWindow: 128000,
    description: 'Open-weight model',
    supportsVision: false,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'open-mixtral-8x22b',
    name: 'Mixtral 8x22B',
    contextWindow: 64000,
    description: 'Large mixture of experts',
    supportsVision: false,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'open-mixtral-8x7b',
    name: 'Mixtral 8x7B',
    contextWindow: 32000,
    description: 'Efficient mixture of experts',
    supportsVision: false,
    status: 'stable',
  }),
];

/**
 * Mistral Provider
 */
export class MistralProvider extends AIProvider {
  constructor(config = {}) {
    super({
      name: 'Mistral',
      id: 'mistral',
      models: MISTRAL_MODELS,
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
      baseUrl: config.baseUrl || 'https://api.mistral.ai/v1',
      requiresApiKey: true,
      apiKeyPrefix: null, // Mistral keys don't have a standard prefix
      apiKeyUrl: 'https://console.mistral.ai/api-keys/',
      docsUrl: 'https://docs.mistral.ai/api/',
    });

    if (config.apiKey) {
      this.apiKey = config.apiKey;
    }
  }

  /**
   * Validate API key format for Mistral
   */
  validateApiKeyFormat(apiKey) {
    // Mistral API keys are typically 32 characters
    return apiKey && apiKey.length >= 20;
  }

  /**
   * Get request headers for Mistral API
   */
  getRequestHeaders(options = {}) {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      ...options.headers,
    };
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
   * Generate completion using Mistral
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
   * Stream completion using Mistral
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
   * Chat with Mistral
   */
  async chat(messages, options = {}) {
    const {
      model,
      maxTokens = 2048,
      temperature = 0.7,
    } = options;

    const mistralMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const response = await this.makeRequest('/chat/completions', {
      model: model || this.getCurrentModelId(),
      max_tokens: maxTokens,
      temperature,
      messages: mistralMessages,
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
   * Stream chat with Mistral
   */
  async streamChat(messages, onChunk, options = {}) {
    const {
      model,
      maxTokens = 2048,
      temperature = 0.7,
    } = options;

    const mistralMessages = messages.map(m => ({
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
        messages: mistralMessages,
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
    if (finishReason === 'model_length') return 0.5;
    return 0.7;
  }
}

export default MistralProvider;

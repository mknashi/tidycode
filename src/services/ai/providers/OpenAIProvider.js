/**
 * OpenAI Provider
 *
 * Supports the GPT-5 family and other OpenAI chat models.
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
  new ModelInfo({
    id: 'gpt-5.5',
    name: 'GPT-5.5',
    contextWindow: 400000,
    description: 'Most capable model for complex coding tasks',
    isDefault: true,
    supportsVision: true,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'gpt-5.4-mini',
    name: 'GPT-5.4 Mini',
    contextWindow: 400000,
    description: 'Fast and cost-effective',
    supportsVision: true,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'gpt-5.4-nano',
    name: 'GPT-5.4 Nano',
    contextWindow: 400000,
    description: 'Fastest and cheapest',
    status: 'stable',
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
   * Check if a model accepts only the default temperature (o-series, GPT-5 family)
   */
  isReasoningModel(modelId) {
    const id = (modelId || this.getCurrentModelId() || '').toLowerCase();
    return /^(o\d|gpt-5)/.test(id) || id.startsWith('codex');
  }

  /**
   * Build request body with correct parameters for the model
   */
  buildRequestBody(modelId, maxTokens, temperature, messages, extra = {}) {
    const model = modelId || this.getCurrentModelId();
    const body = {
      model,
      max_completion_tokens: maxTokens,
      messages,
      ...extra,
    };
    if (!this.isReasoningModel(model)) {
      body.temperature = temperature;
    }
    return body;
  }

  /**
   * Make a fetch request with automatic retry if temperature is rejected
   */
  async fetchWithRetry(url, options, requestBody) {
    const response = await fetch(url, options);

    if (!response.ok && requestBody.temperature !== undefined) {
      const errorData = await response.json().catch(() => null);
      const errorMsg = errorData?.error?.message || '';
      if (errorMsg.toLowerCase().includes('temperature')) {
        const retryBody = { ...requestBody };
        delete retryBody.temperature;
        const retryResponse = await fetch(url, {
          ...options,
          body: JSON.stringify(retryBody),
        });
        return retryResponse;
      }
      throw new Error(errorData?.error?.message || `OpenAI API error: ${response.status}`);
    }

    return response;
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

    const response = await this.makeRequest('/chat/completions',
      this.buildRequestBody(model, maxTokens, temperature, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ])
    );

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

    const requestBody = this.buildRequestBody(model, maxTokens, temperature, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ], { stream: true });

    const fetchOptions = {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify(requestBody),
      signal: options.signal,
    };

    const response = await this.fetchWithRetry(`${this.baseUrl}/chat/completions`, fetchOptions, requestBody);

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
  /**
   * Convert multimodal content to OpenAI format
   * @private
   */
  _convertContent(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return content;

    // Strip _anthropic metadata, keep OpenAI-compatible parts
    return content.map(part => {
      if (part.type === 'image_url') {
        return { type: 'image_url', image_url: part.image_url };
      }
      if (part.type === 'text') {
        return { type: 'text', text: part.text };
      }
      return part;
    });
  }

  async chat(messages, options = {}) {
    const {
      model,
      maxTokens = 2048,
      temperature = 0.7,
    } = options;

    // Convert to OpenAI format
    const openaiMessages = messages.map(m => ({
      role: m.role,
      content: this._convertContent(m.content),
    }));

    const response = await this.makeRequest('/chat/completions',
      this.buildRequestBody(model, maxTokens, temperature, openaiMessages)
    );

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
      content: this._convertContent(m.content),
    }));

    const requestBody = this.buildRequestBody(model, maxTokens, temperature, openaiMessages, { stream: true });
    const fetchOptions = {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify(requestBody),
      signal: options.signal,
    };

    const response = await this.fetchWithRetry(`${this.baseUrl}/chat/completions`, fetchOptions, requestBody);

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

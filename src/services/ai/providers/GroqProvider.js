/**
 * Groq Provider
 *
 * Supports fast inference on various open-source models.
 * https://console.groq.com/docs/quickstart
 */

import {
  AIProvider,
  CompletionResult,
  ModelInfo,
  AI_CAPABILITIES,
} from '../ProviderInterface.js';

/**
 * Groq model definitions
 */
const GROQ_MODELS = [
  // Llama 3.3 models
  new ModelInfo({
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B',
    contextWindow: 128000,
    description: 'Most capable Llama model, versatile',
    isDefault: true,
    supportsVision: false,
    status: 'stable',
  }),

  // Llama 3.2 models
  new ModelInfo({
    id: 'llama-3.2-90b-vision-preview',
    name: 'Llama 3.2 90B Vision',
    contextWindow: 8192,
    description: 'Vision-capable Llama model',
    supportsVision: true,
    status: 'preview',
  }),
  new ModelInfo({
    id: 'llama-3.2-11b-vision-preview',
    name: 'Llama 3.2 11B Vision',
    contextWindow: 8192,
    description: 'Smaller vision model',
    supportsVision: true,
    status: 'preview',
  }),
  new ModelInfo({
    id: 'llama-3.2-3b-preview',
    name: 'Llama 3.2 3B',
    contextWindow: 8192,
    description: 'Fast and lightweight',
    supportsVision: false,
    status: 'preview',
  }),
  new ModelInfo({
    id: 'llama-3.2-1b-preview',
    name: 'Llama 3.2 1B',
    contextWindow: 8192,
    description: 'Fastest Llama model',
    supportsVision: false,
    status: 'preview',
  }),

  // Llama 3.1 models
  new ModelInfo({
    id: 'llama-3.1-70b-versatile',
    name: 'Llama 3.1 70B',
    contextWindow: 128000,
    description: 'Large context Llama 3.1',
    supportsVision: false,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B',
    contextWindow: 128000,
    description: 'Fast Llama 3.1',
    supportsVision: false,
    status: 'stable',
  }),

  // Mixtral models
  new ModelInfo({
    id: 'mixtral-8x7b-32768',
    name: 'Mixtral 8x7B',
    contextWindow: 32768,
    description: 'Mixture of experts model',
    supportsVision: false,
    status: 'stable',
  }),

  // Gemma models
  new ModelInfo({
    id: 'gemma2-9b-it',
    name: 'Gemma 2 9B',
    contextWindow: 8192,
    description: 'Google Gemma 2 instruction-tuned',
    supportsVision: false,
    status: 'stable',
  }),

  // DeepSeek models
  new ModelInfo({
    id: 'deepseek-r1-distill-llama-70b',
    name: 'DeepSeek R1 Distill 70B',
    contextWindow: 8192,
    description: 'DeepSeek reasoning model',
    supportsVision: false,
    status: 'preview',
  }),
];

/**
 * Groq Provider
 */
export class GroqProvider extends AIProvider {
  constructor(config = {}) {
    super({
      name: 'Groq',
      id: 'groq',
      models: GROQ_MODELS,
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
      baseUrl: config.baseUrl || 'https://api.groq.com/openai/v1',
      requiresApiKey: true,
      apiKeyPrefix: 'gsk_',
      apiKeyUrl: 'https://console.groq.com/keys',
      docsUrl: 'https://console.groq.com/docs/quickstart',
    });

    if (config.apiKey) {
      this.apiKey = config.apiKey;
    }
  }

  /**
   * Get request headers for Groq API (OpenAI-compatible)
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
   * Generate completion using Groq (OpenAI-compatible)
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
   * Stream completion using Groq
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
   * Chat with Groq
   */
  async chat(messages, options = {}) {
    const {
      model,
      maxTokens = 2048,
      temperature = 0.7,
    } = options;

    const groqMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const response = await this.makeRequest('/chat/completions', {
      model: model || this.getCurrentModelId(),
      max_tokens: maxTokens,
      temperature,
      messages: groqMessages,
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
   * Stream chat with Groq
   */
  async streamChat(messages, onChunk, options = {}) {
    const {
      model,
      maxTokens = 2048,
      temperature = 0.7,
    } = options;

    const groqMessages = messages.map(m => ({
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
        messages: groqMessages,
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
    return 0.7;
  }
}

export default GroqProvider;

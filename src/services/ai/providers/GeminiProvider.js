/**
 * Gemini Provider (Google)
 *
 * Supports Gemini 1.5, Gemini 2.0, and future Google AI models.
 * https://ai.google.dev/gemini-api/docs
 */

import {
  AIProvider,
  CompletionResult,
  ModelInfo,
  AI_CAPABILITIES,
} from '../ProviderInterface.js';

/**
 * Gemini model definitions
 */
const GEMINI_MODELS = [
  // Gemini 2.0 models (latest)
  new ModelInfo({
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    contextWindow: 1000000,
    description: 'Fast and versatile, 1M token context',
    isDefault: true,
    supportsVision: true,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'gemini-2.0-flash-thinking',
    name: 'Gemini 2.0 Flash Thinking',
    contextWindow: 1000000,
    description: 'Enhanced reasoning capabilities',
    supportsVision: true,
    status: 'preview',
  }),
  new ModelInfo({
    id: 'gemini-2.0-pro',
    name: 'Gemini 2.0 Pro',
    contextWindow: 2000000,
    description: 'Most capable Gemini 2.0 model',
    supportsVision: true,
    status: 'preview',
  }),

  // Gemini 1.5 models
  new ModelInfo({
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    contextWindow: 2000000,
    description: '2M token context, highly capable',
    supportsVision: true,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'gemini-1.5-pro-latest',
    name: 'Gemini 1.5 Pro (Latest)',
    contextWindow: 2000000,
    description: 'Latest Gemini 1.5 Pro version',
    supportsVision: true,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    contextWindow: 1000000,
    description: 'Fast and efficient',
    supportsVision: true,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'gemini-1.5-flash-8b',
    name: 'Gemini 1.5 Flash 8B',
    contextWindow: 1000000,
    description: 'Smaller, faster Flash variant',
    supportsVision: true,
    status: 'stable',
  }),

  // Gemini 1.0 models (legacy)
  new ModelInfo({
    id: 'gemini-1.0-pro',
    name: 'Gemini 1.0 Pro',
    contextWindow: 32768,
    description: 'Legacy Gemini Pro model',
    supportsVision: false,
    status: 'stable',
  }),
];

/**
 * Gemini Provider
 */
export class GeminiProvider extends AIProvider {
  constructor(config = {}) {
    super({
      name: 'Gemini',
      id: 'gemini',
      models: GEMINI_MODELS,
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
        AI_CAPABILITIES.CODE_EXECUTION, // Gemini supports code execution
      ],
      baseUrl: config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
      requiresApiKey: true,
      apiKeyPrefix: 'AI', // Gemini keys often start with AIza...
      apiKeyUrl: 'https://aistudio.google.com/app/apikey',
      docsUrl: 'https://ai.google.dev/gemini-api/docs',
    });

    if (config.apiKey) {
      this.apiKey = config.apiKey;
    }
  }

  /**
   * Validate API key format for Gemini
   */
  validateApiKeyFormat(apiKey) {
    // Gemini API keys are typically 39 characters and start with 'AIza'
    return apiKey && apiKey.length >= 30;
  }

  /**
   * Build API URL with model and action
   */
  buildUrl(model, action = 'generateContent') {
    const url = `${this.baseUrl}/models/${model}:${action}?key=${this.apiKey}`;
    // Use SSE format for streaming endpoints for better browser compatibility
    if (action === 'streamGenerateContent') {
      return `${url}&alt=sse`;
    }
    return url;
  }

  /**
   * Check if a model supports systemInstruction
   * (Thinking / experimental reasoning models do not)
   */
  supportsSystemInstruction(modelId) {
    return !modelId || !modelId.includes('thinking');
  }

  /**
   * Build the request body for Gemini API calls
   */
  buildRequestBody(contents, { systemPrompt, maxTokens, temperature, modelId }) {
    const body = {
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
      },
    };

    // Only include systemInstruction when supported and when we have a valid prompt
    if (systemPrompt && this.supportsSystemInstruction(modelId)) {
      body.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    return body;
  }

  /**
   * Get request headers for Gemini API
   */
  getRequestHeaders(options = {}) {
    return {
      'Content-Type': 'application/json',
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
      const response = await fetch(
        `${this.baseUrl}/models?key=${this.apiKey}`,
        { method: 'GET' }
      );

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
   * Convert messages to Gemini format
   */
  convertToGeminiFormat(messages) {
    return messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
  }

  /**
   * Generate completion using Gemini
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
    const modelId = model || this.getCurrentModelId();

    const contents = [{ role: 'user', parts: [{ text: prompt }] }];
    const body = this.buildRequestBody(contents, { systemPrompt, maxTokens, temperature, modelId });

    const response = await fetch(this.buildUrl(modelId, 'generateContent'), {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const error = await this.parseErrorResponse(response);
      throw new Error(error);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return new CompletionResult({
      text: options.extractFormat ? this.extractContent(text, options.extractFormat) : text,
      confidence: this.calculateConfidence(data),
      metadata: {
        model: modelId,
        finishReason: data.candidates?.[0]?.finishReason,
        safetyRatings: data.candidates?.[0]?.safetyRatings,
      },
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
      } : null,
    });
  }

  /**
   * Stream completion using Gemini
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
    const modelId = model || this.getCurrentModelId();

    const contents = [{ role: 'user', parts: [{ text: prompt }] }];
    const body = this.buildRequestBody(contents, { systemPrompt, maxTokens, temperature, modelId });

    const response = await fetch(this.buildUrl(modelId, 'streamGenerateContent'), {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const error = await this.parseErrorResponse(response);
      throw new Error(error);
    }

    return this._readSSEStream(response, onChunk);
  }

  /**
   * Read an SSE stream response from Gemini and emit chunks
   * @param {Response} response - Fetch response with SSE body
   * @param {Function} onChunk - Callback (text, isDone)
   * @returns {Promise<CompletionResult>}
   * @private
   */
  async _readSSEStream(response, onChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // SSE format: lines starting with "data: " contain the JSON payload
          let jsonStr = trimmed;
          if (trimmed.startsWith('data: ')) {
            jsonStr = trimmed.slice(6);
          } else {
            // Also handle raw JSON array streaming (non-SSE fallback)
            jsonStr = trimmed.replace(/^,?\s*/, '');
            if (jsonStr.startsWith('[') || jsonStr === ']') continue;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (text) {
              fullText += text;
              onChunk(text, false);
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }

      onChunk('', true);
    } finally {
      reader.releaseLock();
    }

    return new CompletionResult({
      text: fullText,
      metadata: { streamed: true },
    });
  }

  /**
   * Chat with Gemini
   */
  async chat(messages, options = {}) {
    const {
      model,
      maxTokens = 2048,
      temperature = 0.7,
      systemPrompt,
    } = options;

    const modelId = model || this.getCurrentModelId();
    const geminiMessages = this.convertToGeminiFormat(messages);

    // Extract system message
    const systemMessage = messages.find(m => m.role === 'system');
    const system = systemPrompt || systemMessage?.content || 'You are a helpful assistant.';

    const body = this.buildRequestBody(geminiMessages, {
      systemPrompt: system, maxTokens, temperature, modelId,
    });

    const response = await fetch(this.buildUrl(modelId, 'generateContent'), {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const error = await this.parseErrorResponse(response);
      throw new Error(error);
    }

    const data = await response.json();

    return new CompletionResult({
      text: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      metadata: {
        model: modelId,
        finishReason: data.candidates?.[0]?.finishReason,
      },
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
      } : null,
    });
  }

  /**
   * Stream chat with Gemini
   */
  async streamChat(messages, onChunk, options = {}) {
    const {
      model,
      maxTokens = 2048,
      temperature = 0.7,
      systemPrompt,
    } = options;

    const modelId = model || this.getCurrentModelId();
    const geminiMessages = this.convertToGeminiFormat(messages);

    const systemMessage = messages.find(m => m.role === 'system');
    const system = systemPrompt || systemMessage?.content || 'You are a helpful assistant.';

    const body = this.buildRequestBody(geminiMessages, {
      systemPrompt: system, maxTokens, temperature, modelId,
    });

    const response = await fetch(this.buildUrl(modelId, 'streamGenerateContent'), {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const error = await this.parseErrorResponse(response);
      throw new Error(error);
    }

    return this._readSSEStream(response, onChunk);
  }

  /**
   * Calculate confidence score based on response
   */
  calculateConfidence(response) {
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === 'STOP') return 0.9;
    if (finishReason === 'MAX_TOKENS') return 0.6;
    if (finishReason === 'SAFETY') return 0.3;
    if (finishReason === 'RECITATION') return 0.5;
    return 0.7;
  }

  /**
   * Parse error response from Gemini API
   */
  async parseErrorResponse(response) {
    try {
      const data = await response.json();
      return data.error?.message || `Gemini API error: ${response.status}`;
    } catch {
      return `Gemini API error: ${response.status} ${response.statusText}`;
    }
  }
}

export default GeminiProvider;

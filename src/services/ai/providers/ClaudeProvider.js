/**
 * Claude Provider (Anthropic)
 *
 * Supports Claude 3.x and Claude 4.x models.
 * https://docs.anthropic.com/claude/reference/messages_post
 */

import {
  AIProvider,
  CompletionResult,
  ModelInfo,
  AI_CAPABILITIES,
} from '../ProviderInterface.js';

/**
 * Claude model definitions
 */
const CLAUDE_MODELS = [
  // Claude 4 models (next generation)
  new ModelInfo({
    id: 'claude-4-opus',
    name: 'Claude 4 Opus',
    contextWindow: 200000,
    description: 'Most capable Claude 4 model for complex tasks',
    supportsVision: true,
    status: 'preview',
  }),
  new ModelInfo({
    id: 'claude-4-sonnet',
    name: 'Claude 4 Sonnet',
    contextWindow: 200000,
    description: 'Balanced Claude 4 model',
    supportsVision: true,
    status: 'preview',
  }),

  // Claude 3.5 models
  new ModelInfo({
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    contextWindow: 200000,
    description: 'Best balance of intelligence and speed',
    isDefault: true,
    supportsVision: true,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    contextWindow: 200000,
    description: 'Fast and efficient for simple tasks',
    supportsVision: true,
    status: 'stable',
  }),

  // Claude 3 models
  new ModelInfo({
    id: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    contextWindow: 200000,
    description: 'Most capable Claude 3 model',
    supportsVision: true,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'claude-3-sonnet-20240229',
    name: 'Claude 3 Sonnet',
    contextWindow: 200000,
    description: 'Balanced Claude 3 model',
    supportsVision: true,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    contextWindow: 200000,
    description: 'Fast Claude 3 model',
    supportsVision: true,
    status: 'stable',
  }),
];

/**
 * Claude AI Provider
 */
export class ClaudeProvider extends AIProvider {
  constructor(config = {}) {
    super({
      name: 'Claude',
      id: 'claude',
      models: CLAUDE_MODELS,
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
      baseUrl: config.baseUrl || 'https://api.anthropic.com/v1',
      apiVersion: '2023-06-01',
      requiresApiKey: true,
      apiKeyPrefix: 'sk-ant-',
      apiKeyUrl: 'https://console.anthropic.com/settings/keys',
      docsUrl: 'https://docs.anthropic.com/claude/reference',
    });

    if (config.apiKey) {
      this.apiKey = config.apiKey;
    }
  }

  /**
   * Get request headers for Anthropic API
   */
  getRequestHeaders(options = {}) {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': this.config.apiVersion,
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
      // Make a minimal request to validate the key
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: this.getRequestHeaders(),
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
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
   * Generate completion using Claude
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

    const response = await this.makeRequest('/messages', {
      model: model || this.getCurrentModelId(),
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content?.[0]?.text || '';

    return new CompletionResult({
      text: options.extractFormat ? this.extractContent(text, options.extractFormat) : text,
      confidence: this.calculateConfidence(response),
      metadata: {
        model: response.model,
        stopReason: response.stop_reason,
      },
      usage: response.usage ? {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      } : null,
    });
  }

  /**
   * Stream completion using Claude
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

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify({
        model: model || this.getCurrentModelId(),
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
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
    let usage = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === 'content_block_delta') {
                const text = parsed.delta?.text || '';
                if (text) {
                  fullText += text;
                  onChunk(text, false);
                }
              } else if (parsed.type === 'message_delta') {
                usage = parsed.usage;
              } else if (parsed.type === 'message_stop') {
                onChunk('', true);
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
      usage: usage ? {
        promptTokens: usage.input_tokens,
        completionTokens: usage.output_tokens,
        totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
      } : null,
    });
  }

  /**
   * Chat with Claude
   */
  async chat(messages, options = {}) {
    const {
      model,
      maxTokens = 2048,
      temperature = 0.7,
      systemPrompt,
    } = options;

    // Convert messages to Anthropic format
    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role,
        content: m.content,
      }));

    // Extract system message
    const systemMessage = messages.find(m => m.role === 'system');
    const system = systemPrompt || systemMessage?.content || 'You are a helpful assistant.';

    const response = await this.makeRequest('/messages', {
      model: model || this.getCurrentModelId(),
      max_tokens: maxTokens,
      temperature,
      system,
      messages: anthropicMessages,
    });

    return new CompletionResult({
      text: response.content?.[0]?.text || '',
      metadata: {
        model: response.model,
        stopReason: response.stop_reason,
      },
      usage: response.usage ? {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      } : null,
    });
  }

  /**
   * Stream chat with Claude
   */
  async streamChat(messages, onChunk, options = {}) {
    const {
      model,
      maxTokens = 2048,
      temperature = 0.7,
      systemPrompt,
    } = options;

    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    const systemMessage = messages.find(m => m.role === 'system');
    const system = systemPrompt || systemMessage?.content || 'You are a helpful assistant.';

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify({
        model: model || this.getCurrentModelId(),
        max_tokens: maxTokens,
        temperature,
        system,
        messages: anthropicMessages,
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
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.type === 'content_block_delta') {
                const text = parsed.delta?.text || '';
                if (text) {
                  fullText += text;
                  onChunk(text, false);
                }
              } else if (parsed.type === 'message_stop') {
                onChunk('', true);
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
    // Claude doesn't provide confidence scores directly
    // We estimate based on stop reason
    const stopReason = response.stop_reason;
    if (stopReason === 'end_turn') return 0.9;
    if (stopReason === 'stop_sequence') return 0.85;
    if (stopReason === 'max_tokens') return 0.6;
    return 0.7;
  }
}

export default ClaudeProvider;

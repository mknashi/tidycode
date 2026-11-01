/**
 * Claude Provider (Anthropic)
 *
 * Built-in list of current models; the settings UI adds the live list from
 * GET /v1/models. https://docs.anthropic.com/claude/reference/messages_post
 */

import {
  AIProvider,
  CompletionResult,
  ModelInfo,
  AI_CAPABILITIES,
} from '../ProviderInterface.js';
import {
  ANTHROPIC_API_URL,
  ANTHROPIC_VERSION,
  anthropicHeaders,
  claudeMaxTokens,
  extractClaudeText,
} from '../anthropic.js';

/**
 * Claude model definitions
 */
const CLAUDE_MODELS = [
  new ModelInfo({
    id: 'claude-opus-5-5',
    name: 'Claude Opus 5.5',
    contextWindow: 1000000,
    description: 'Most capable model for complex coding tasks',
    supportsVision: true,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'claude-sonnet-5-5',
    name: 'Claude Sonnet 5.5',
    contextWindow: 1000000,
    description: 'Excellent balance of intelligence and speed for coding',
    isDefault: true,
    supportsVision: true,
    status: 'stable',
  }),
  new ModelInfo({
    id: 'claude-haiku-5-5',
    name: 'Claude Haiku 5.5',
    contextWindow: 1000000,
    description: 'Fast and efficient for quick coding tasks',
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
      baseUrl: config.baseUrl || ANTHROPIC_API_URL,
      apiVersion: ANTHROPIC_VERSION,
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
      ...anthropicHeaders(this.apiKey),
      ...options.headers,
    };
  }

  /**
   * Validate API key by listing models (free, and doesn't depend on any
   * one model still being served)
   */
  async validateConfig() {
    if (!this.apiKey) {
      return { valid: false, error: 'API key is required' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/models?limit=1`, {
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
   * Generate completion using Claude
   */
  async complete(params) {
    const {
      prompt,
      language,
      model,
      maxTokens = 2048,
      task = 'completion',
      options = {},
    } = params;

    const systemPrompt = options.systemPrompt || this.buildSystemPrompt(task, { language });

    const response = await this.makeRequest('/messages', {
      model: model || this.getCurrentModelId(),
      max_tokens: claudeMaxTokens(maxTokens),
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = extractClaudeText(response);

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
      task = 'completion',
      options = {},
    } = params;

    const systemPrompt = options.systemPrompt || this.buildSystemPrompt(task, { language });

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify({
        model: model || this.getCurrentModelId(),
        max_tokens: claudeMaxTokens(maxTokens),
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

              if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                const text = parsed.delta.text || '';
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
      systemPrompt,
    } = options;

    // Convert messages to Anthropic format
    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role,
        content: this._convertContent(m.content),
      }));

    // Extract system message
    const systemMessage = messages.find(m => m.role === 'system');
    const system = systemPrompt || systemMessage?.content || 'You are a helpful assistant.';

    const response = await this.makeRequest('/messages', {
      model: model || this.getCurrentModelId(),
      max_tokens: claudeMaxTokens(maxTokens),
      system,
      messages: anthropicMessages,
    });

    return new CompletionResult({
      text: extractClaudeText(response),
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
   * Convert multimodal content array to Anthropic format
   * @private
   */
  _convertContent(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return content;

    // Convert OpenAI-style content parts to Anthropic format
    return content.map(part => {
      if (part._anthropic) {
        // Use the pre-built Anthropic format
        return part._anthropic;
      }
      if (part.type === 'image_url' && part.image_url?.url) {
        const url = part.image_url.url;
        if (url.startsWith('data:')) {
          const match = url.match(/^data:(image\/\w+);base64,(.+)$/);
          if (match) {
            return {
              type: 'image',
              source: { type: 'base64', media_type: match[1], data: match[2] },
            };
          }
        }
        return { type: 'image', source: { type: 'url', url } };
      }
      if (part.type === 'text') {
        return { type: 'text', text: part.text };
      }
      return part;
    });
  }

  /**
   * Stream chat with Claude
   */
  async streamChat(messages, onChunk, options = {}) {
    const {
      model,
      maxTokens = 2048,
      systemPrompt,
    } = options;

    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: this._convertContent(m.content) }));

    const systemMessage = messages.find(m => m.role === 'system');
    const system = systemPrompt || systemMessage?.content || 'You are a helpful assistant.';

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify({
        model: model || this.getCurrentModelId(),
        max_tokens: claudeMaxTokens(maxTokens),
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
              if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                const text = parsed.delta.text || '';
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

/**
 * Provider Manager
 *
 * Singleton that manages all AI providers, handles configuration,
 * and provides a unified interface for AI operations.
 */

import { AI_CAPABILITIES } from './ProviderInterface.js';
import { ClaudeProvider } from './providers/ClaudeProvider.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { GeminiProvider } from './providers/GeminiProvider.js';
import { GroqProvider } from './providers/GroqProvider.js';
import { MistralProvider } from './providers/MistralProvider.js';
import { OllamaProvider } from './providers/OllamaProvider.js';
import { scanForSecrets, truncateContent, isLocalProvider } from './privacyGuard.js';

/**
 * Provider registry with constructors
 */
const PROVIDER_REGISTRY = {
  claude: ClaudeProvider,
  openai: OpenAIProvider,
  gemini: GeminiProvider,
  groq: GroqProvider,
  mistral: MistralProvider,
  ollama: OllamaProvider,
};

/**
 * Provider Manager class
 */
export class ProviderManager {
  constructor() {
    /**
     * Map of provider ID to provider instance
     * @type {Map<string, import('./ProviderInterface.js').AIProvider>}
     */
    this.providers = new Map();

    /**
     * Currently active provider
     * @type {import('./ProviderInterface.js').AIProvider|null}
     */
    this.activeProvider = null;

    /**
     * Currently active model ID
     * @type {string|null}
     */
    this.activeModel = null;

    /**
     * Configuration loaded from storage
     * @type {Object}
     */
    this.config = {};

    /**
     * Initialization state
     * @type {boolean}
     */
    this._initialized = false;

    /**
     * Event listeners
     * @type {Map<string, Set<Function>>}
     */
    this._listeners = new Map();

    /**
     * Privacy guard configuration
     */
    this.privacyConfig = {
      enableScanning: true,
      scanAction: 'warn', // 'warn' | 'redact' | 'block'
      maxContextChars: 0, // 0 = unlimited
    };
  }

  /**
   * Update privacy configuration
   * @param {Object} config - Partial privacy config to merge
   */
  setPrivacyConfig(config) {
    this.privacyConfig = { ...this.privacyConfig, ...config };
  }

  /**
   * Apply privacy guard (scanning + truncation) to a text string.
   * Skips processing for local providers (ollama, tinyllm).
   * @param {string} text - Content to guard
   * @returns {string} Processed text
   * @throws {Error} With 'PRIVACY_WARNING:' prefix if secrets detected in warn mode
   * @private
   */
  _applyPrivacyGuard(text) {
    if (!text || typeof text !== 'string') return text;

    // Local providers never send data externally — skip all guards
    if (this.activeProvider && isLocalProvider(this.activeProvider.id)) {
      return text;
    }

    // Apply truncation first
    let processed = truncateContent(text, this.privacyConfig.maxContextChars);

    // Scan for secrets if enabled
    if (this.privacyConfig.enableScanning) {
      const findings = scanForSecrets(processed);
      if (findings.length > 0) {
        const action = this.privacyConfig.scanAction;
        if (action === 'warn') {
          throw new Error('PRIVACY_WARNING:' + JSON.stringify(findings));
        }
        if (action === 'block') {
          throw new Error('Content contains sensitive data and was blocked from being sent.');
        }
      }
    }

    return processed;
  }

  /**
   * Process completion params through privacy guard.
   * @private
   */
  _processParams(params) {
    if (!params.prompt) return params;
    return { ...params, prompt: this._applyPrivacyGuard(params.prompt) };
  }

  /**
   * Process chat messages through privacy guard.
   * @private
   */
  _processMessages(messages) {
    return messages.map(msg => {
      if ((msg.role === 'system' || msg.role === 'user') && msg.content) {
        return { ...msg, content: this._applyPrivacyGuard(msg.content) };
      }
      return msg;
    });
  }

  /**
   * Initialize the provider manager with configuration
   * @param {Object} config - Configuration object
   * @param {Object} [config.providers] - Provider-specific configurations
   * @param {string} [config.activeProvider] - ID of the active provider
   * @param {string} [config.activeModel] - ID of the active model
   * @returns {Promise<void>}
   */
  async initialize(config = {}) {
    this.config = config;

    // Register all available providers
    for (const [id, ProviderClass] of Object.entries(PROVIDER_REGISTRY)) {
      const providerConfig = config.providers?.[id] || {};
      const provider = new ProviderClass(providerConfig);

      // Initialize provider if it has an API key, or if it doesn't require
      // one but was explicitly included in the config (e.g. Ollama when selected)
      const hasExplicitConfig = config.providers?.[id] && Object.keys(config.providers[id]).length > 0;
      if (providerConfig.apiKey || (!provider.requiresApiKey && hasExplicitConfig)) {
        await provider.initialize({
          apiKey: providerConfig.apiKey,
          model: providerConfig.defaultModel,
          baseUrl: providerConfig.baseUrl,
        });
      }

      this.providers.set(id, provider);
    }

    // Set active provider
    if (config.activeProvider && this.providers.has(config.activeProvider)) {
      this.setActiveProvider(config.activeProvider, config.activeModel);
    }

    this._initialized = true;
    this._emit('initialized', { providers: this.getAvailableProviders() });
  }

  /**
   * Check if the manager is initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this._initialized;
  }

  /**
   * Register a custom provider
   * @param {string} id - Provider ID
   * @param {import('./ProviderInterface.js').AIProvider} provider - Provider instance
   */
  registerProvider(id, provider) {
    this.providers.set(id, provider);
    this._emit('providerRegistered', { id, provider });
  }

  /**
   * Unregister a provider
   * @param {string} id - Provider ID
   */
  unregisterProvider(id) {
    const provider = this.providers.get(id);
    if (provider) {
      provider.cleanup();
      this.providers.delete(id);

      // If this was the active provider, clear it
      if (this.activeProvider?.id === id) {
        this.activeProvider = null;
        this.activeModel = null;
      }

      this._emit('providerUnregistered', { id });
    }
  }

  /**
   * Get a provider by ID
   * @param {string} id - Provider ID
   * @returns {import('./ProviderInterface.js').AIProvider|null}
   */
  getProvider(id) {
    return this.providers.get(id) || null;
  }

  /**
   * Set the active provider
   * @param {string} providerId - Provider ID
   * @param {string} [modelId] - Optional model ID
   * @throws {Error} If provider not found
   */
  setActiveProvider(providerId, modelId = null) {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider "${providerId}" not found`);
    }

    this.activeProvider = provider;
    this.activeModel = modelId || provider.getDefaultModel()?.id || null;

    if (modelId) {
      provider.selectedModel = modelId;
    }

    this._emit('activeProviderChanged', {
      providerId,
      modelId: this.activeModel,
    });
  }

  /**
   * Set the active model for the current provider
   * @param {string} modelId - Model ID
   * @throws {Error} If no active provider
   */
  setActiveModel(modelId) {
    if (!this.activeProvider) {
      throw new Error('No active provider');
    }

    this.activeModel = modelId;
    this.activeProvider.selectedModel = modelId;

    this._emit('activeModelChanged', { modelId });
  }

  /**
   * Get list of available providers with their info
   * @returns {Array<Object>}
   */
  getAvailableProviders() {
    return Array.from(this.providers.entries()).map(([id, provider]) => ({
      id,
      name: provider.name,
      models: provider.models,
      capabilities: provider.capabilities,
      requiresApiKey: provider.requiresApiKey,
      isReady: provider.isReady(),
      isActive: this.activeProvider?.id === id,
      apiKeyUrl: provider.config.apiKeyUrl,
      docsUrl: provider.config.docsUrl,
    }));
  }

  /**
   * Get providers that support a specific capability
   * @param {string} capability - Capability from AI_CAPABILITIES
   * @returns {Array<Object>}
   */
  getProvidersWithCapability(capability) {
    return this.getAvailableProviders().filter(p =>
      p.capabilities.includes(capability) && p.isReady
    );
  }

  /**
   * Get the current active provider info
   * @returns {Object|null}
   */
  getActiveProviderInfo() {
    if (!this.activeProvider) return null;

    return {
      id: this.activeProvider.id,
      name: this.activeProvider.name,
      model: this.activeModel,
      modelInfo: this.activeProvider.getModel(this.activeModel),
      capabilities: this.activeProvider.capabilities,
      isReady: this.activeProvider.isReady(),
    };
  }

  /**
   * Check if a capability is available with the current provider
   * @param {string} capability - Capability to check
   * @returns {boolean}
   */
  hasCapability(capability) {
    return this.activeProvider?.hasCapability(capability) || false;
  }

  /**
   * Generate completion using the active provider
   * @param {Object} params - Completion parameters
   * @returns {Promise<import('./ProviderInterface.js').CompletionResult>}
   * @throws {Error} If no active provider
   */
  async complete(params) {
    this._ensureActiveProvider();
    const processed = this._processParams(params);
    return this.activeProvider.complete({
      ...processed,
      model: processed.model || this.activeModel,
    });
  }

  /**
   * Stream completion using the active provider
   * @param {Object} params - Completion parameters
   * @param {Function} onChunk - Callback for each chunk
   * @returns {Promise<import('./ProviderInterface.js').CompletionResult>}
   */
  async streamComplete(params, onChunk) {
    this._ensureActiveProvider();
    const processed = this._processParams(params);
    return this.activeProvider.streamComplete({
      ...processed,
      model: processed.model || this.activeModel,
    }, onChunk);
  }

  /**
   * Chat using the active provider
   * @param {Array} messages - Chat messages
   * @param {Object} [options] - Chat options
   * @returns {Promise<import('./ProviderInterface.js').CompletionResult>}
   */
  async chat(messages, options = {}) {
    this._ensureActiveProvider();
    const processed = this._processMessages(messages);
    return this.activeProvider.chat(processed, {
      ...options,
      model: options.model || this.activeModel,
    });
  }

  /**
   * Stream chat using the active provider
   * @param {Array} messages - Chat messages
   * @param {Function} onChunk - Callback for each chunk
   * @param {Object} [options] - Chat options
   * @returns {Promise<import('./ProviderInterface.js').CompletionResult>}
   */
  async streamChat(messages, onChunk, options = {}) {
    this._ensureActiveProvider();
    const processed = this._processMessages(messages);
    return this.activeProvider.streamChat(processed, onChunk, {
      ...options,
      model: options.model || this.activeModel,
    });
  }

  /**
   * Validate the active provider's configuration
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  async validateActiveProvider() {
    this._ensureActiveProvider();
    return this.activeProvider.validateConfig();
  }

  /**
   * Configure a provider with API key and settings
   * @param {string} providerId - Provider ID
   * @param {Object} config - Configuration
   * @param {string} [config.apiKey] - API key
   * @param {string} [config.defaultModel] - Default model
   * @param {string} [config.baseUrl] - Custom base URL
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  async configureProvider(providerId, config) {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return { valid: false, error: `Provider "${providerId}" not found` };
    }

    await provider.initialize(config);

    // Validate the configuration
    const result = await provider.validateConfig();

    this._emit('providerConfigured', { providerId, valid: result.valid });

    return result;
  }

  /**
   * Update configuration and persist
   * @param {Object} newConfig - New configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this._emit('configUpdated', this.config);
  }

  /**
   * Get current configuration
   * @returns {Object}
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Subscribe to events
   * @param {string} event - Event name
   * @param {Function} callback - Event handler
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);

    return () => {
      this._listeners.get(event)?.delete(callback);
    };
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {any} data - Event data
   * @private
   */
  _emit(event, data) {
    this._listeners.get(event)?.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event handler for "${event}":`, error);
      }
    });
  }

  /**
   * Ensure there's an active provider
   * @throws {Error} If no active provider
   * @private
   */
  _ensureActiveProvider() {
    if (!this.activeProvider) {
      throw new Error('No active AI provider configured. Please select a provider in settings.');
    }
    if (!this.activeProvider.isReady()) {
      throw new Error(`Provider "${this.activeProvider.name}" is not ready. Please check your API key.`);
    }
  }

  /**
   * Clean up all providers
   * @returns {Promise<void>}
   */
  async cleanup() {
    for (const provider of this.providers.values()) {
      await provider.cleanup();
    }
    this.providers.clear();
    this.activeProvider = null;
    this.activeModel = null;
    this._initialized = false;
  }
}

/**
 * Singleton instance
 */
export const providerManager = new ProviderManager();

/**
 * Helper to get provider manager instance
 * @returns {ProviderManager}
 */
export function getProviderManager() {
  return providerManager;
}

export default ProviderManager;

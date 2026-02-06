/**
 * AI Services Module
 *
 * Unified AI provider architecture for Tidy Code.
 * Supports multiple AI providers with a consistent interface.
 *
 * @example
 * import { providerManager, AI_CAPABILITIES } from './services/ai';
 *
 * // Initialize with config
 * await providerManager.initialize({
 *   providers: {
 *     openai: { apiKey: 'sk-...' },
 *     claude: { apiKey: 'sk-ant-...' },
 *   },
 *   activeProvider: 'openai',
 * });
 *
 * // Use the active provider
 * const result = await providerManager.complete({
 *   prompt: 'Write a function to sort an array',
 *   language: 'javascript',
 * });
 */

// Core interfaces and utilities
export {
  AIProvider,
  CompletionResult,
  ChatMessage,
  ModelInfo,
  ProviderConfig,
  AI_CAPABILITIES,
} from './ProviderInterface.js';

// Provider Manager
import { providerManager as _providerManager } from './ProviderManager.js';

export {
  ProviderManager,
  providerManager,
  getProviderManager,
} from './ProviderManager.js';

// Individual Providers
export { ClaudeProvider } from './providers/ClaudeProvider.js';
export { OpenAIProvider } from './providers/OpenAIProvider.js';
export { GeminiProvider } from './providers/GeminiProvider.js';
export { GroqProvider } from './providers/GroqProvider.js';
export { MistralProvider } from './providers/MistralProvider.js';
export { OllamaProvider } from './providers/OllamaProvider.js';

// Actions
export {
  ActionManager,
  ActionResult,
  ActionContext,
  ACTION_IDS,
  actionManager,
  // Explain
  explainAction,
  explainActionStream,
  EXPLANATION_LEVELS,
  AUDIENCE_TYPES,
  // Refactor
  refactorAction,
  refactorActionStream,
  REFACTOR_TYPES,
  getRefactorTypes,
  // Convert
  convertAction,
  SUPPORTED_FORMATS,
  detectFormat,
  getConversionOptions,
  validateFormat,
  // Schema
  inferSchemaAction,
  SCHEMA_FORMATS,
  getSchemaFormats,
  // Logs
  summarizeLogsAction,
  summarizeLogsActionStream,
  ANALYSIS_TYPES,
  getAnalysisTypes,
  // Tests
  generateTestAction,
  generateTestActionStream,
  TEST_FRAMEWORKS,
  TEST_TYPES,
  getTestFrameworks,
  getTestTypes,
} from './actions/index.js';

// Privacy Guard
export {
  scanForSecrets,
  redactSecrets,
  truncateContent,
  isLocalProvider,
  LOCAL_PROVIDERS,
  SECRET_PATTERNS,
} from './privacyGuard.js';

/**
 * Provider IDs for reference
 */
export const PROVIDER_IDS = {
  CLAUDE: 'claude',
  OPENAI: 'openai',
  GEMINI: 'gemini',
  GROQ: 'groq',
  MISTRAL: 'mistral',
  OLLAMA: 'ollama',
};

/**
 * Quick helper to initialize and get ready provider
 * @param {Object} config - Configuration
 * @returns {Promise<import('./ProviderManager.js').ProviderManager>}
 */
export async function initializeAI(config) {
  const { providerManager } = await import('./ProviderManager.js');
  await providerManager.initialize(config);
  return providerManager;
}

/**
 * Default export - the provider manager singleton
 */
export default _providerManager;

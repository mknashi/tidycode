/**
 * AI Providers
 *
 * Export all provider implementations.
 */

export { ClaudeProvider } from './ClaudeProvider.js';
export { OpenAIProvider } from './OpenAIProvider.js';
export { GeminiProvider } from './GeminiProvider.js';
export { GroqProvider } from './GroqProvider.js';
export { MistralProvider } from './MistralProvider.js';
export { OllamaProvider } from './OllamaProvider.js';

/**
 * Provider map for dynamic instantiation
 */
export const providers = {
  claude: () => import('./ClaudeProvider.js').then(m => m.ClaudeProvider),
  openai: () => import('./OpenAIProvider.js').then(m => m.OpenAIProvider),
  gemini: () => import('./GeminiProvider.js').then(m => m.GeminiProvider),
  groq: () => import('./GroqProvider.js').then(m => m.GroqProvider),
  mistral: () => import('./MistralProvider.js').then(m => m.MistralProvider),
  ollama: () => import('./OllamaProvider.js').then(m => m.OllamaProvider),
};

/**
 * Get all provider classes
 */
export function getAllProviders() {
  return {
    ClaudeProvider,
    OpenAIProvider,
    GeminiProvider,
    GroqProvider,
    MistralProvider,
    OllamaProvider,
  };
}

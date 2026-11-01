/**
 * Shared request helpers for the Anthropic Messages API.
 *
 * Current Claude models think before answering, accept only the default
 * sampling settings, and return thinking blocks ahead of the text. Every
 * Claude call site goes through these helpers so they all handle that.
 */

export const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1';
export const ANTHROPIC_VERSION = '2023-06-01';

// Thinking tokens count toward max_tokens, so small caps can leave no room
// for the answer itself.
const MIN_MAX_TOKENS = 16000;

// Models that accept output_config.effort
const EFFORT_MODEL_PATTERN = /^claude-(opus|sonnet|haiku|fable)-5/;

/**
 * Request headers for browser or desktop fetch calls.
 * @param {string} apiKey
 */
export function anthropicHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    // Without this the API rejects requests from browser origins (CORS)
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

/**
 * Raise a caller's max_tokens to leave room for thinking.
 * @param {number} [maxTokens]
 */
export function claudeMaxTokens(maxTokens) {
  return Math.max(maxTokens || 0, MIN_MAX_TOKENS);
}

/**
 * output_config for a lower or higher effort level, when the model supports it.
 * @param {string} model
 * @param {'low'|'medium'|'high'|'xhigh'|'max'} effort
 * @returns {Object} Fields to spread into the request body
 */
export function claudeEffort(model, effort) {
  return EFFORT_MODEL_PATTERN.test(model || '') ? { output_config: { effort } } : {};
}

/**
 * Join the text blocks of a Messages API response, skipping thinking blocks.
 * @param {Object} response - Parsed Messages API response
 * @returns {string}
 */
export function extractClaudeText(response) {
  return (response?.content || [])
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');
}

/**
 * Auto-Select Provider/Model
 *
 * Picks the best provider and model based on content size and action type.
 * Uses context-fit as the primary criterion with speed as a tiebreaker.
 */

/**
 * Speed tier rankings (lower = faster)
 */
const SPEED_TIERS = {
  groq: 1,
  cerebras: 1,
  sambanova: 1,
  ollama: 2,
  gemini: 3,
  openai: 3,
  claude: 3,
  mistral: 3,
};

/**
 * Rough chars-to-tokens ratio (conservative: ~4 chars per token)
 */
const CHARS_PER_TOKEN = 4;

/**
 * Auto-select the best provider and model for a given context.
 *
 * @param {Object} context
 * @param {number} context.contentLength - Total character count of content being sent
 * @param {string} [context.actionId] - Action being performed (optional)
 * @param {Array} context.availableProviders - From providerManager.getAvailableProviders(), already filtered to isReady
 * @returns {{ providerId: string, modelId: string, reason: string } | null}
 */
export function autoSelectProvider({ contentLength = 0, actionId, availableProviders }) {
  if (!availableProviders || availableProviders.length === 0) return null;

  if (availableProviders.length === 1) {
    const p = availableProviders[0];
    const defaultModel = p.models?.find(m => m.isDefault) || p.models?.[0];
    return {
      providerId: p.id,
      modelId: defaultModel?.id || '',
      reason: 'Only available provider',
    };
  }

  const estimatedTokens = Math.ceil(contentLength / CHARS_PER_TOKEN);
  // Add headroom for system prompt + response
  const requiredWindow = estimatedTokens + 2000;

  let bestCandidate = null;
  let bestScore = -Infinity;

  for (const provider of availableProviders) {
    if (!provider.models || provider.models.length === 0) continue;

    // Find the best model for this provider:
    // Prefer smallest context window that still fits the content
    let bestModel = null;
    let bestModelScore = -Infinity;

    for (const model of provider.models) {
      const window = model.contextWindow || 4096;
      const fits = window >= requiredWindow;
      // Score: prefer tight fit (smaller excess) when it fits,
      // or largest window when nothing fits
      let modelScore;
      if (fits) {
        // Tight fit is better: score decreases with excess capacity
        modelScore = 1000000 - (window - requiredWindow);
      } else {
        // Doesn't fit: prefer larger window (but always worse than fitting)
        modelScore = window - 1000000;
      }

      if (modelScore > bestModelScore) {
        bestModelScore = modelScore;
        bestModel = model;
      }
    }

    if (!bestModel) continue;

    // Provider score = model fit score + speed tiebreaker
    const speedTier = SPEED_TIERS[provider.id] || 3;
    const speedBonus = (4 - speedTier) * 100; // fast=300, local=200, standard=100
    const providerScore = bestModelScore + speedBonus;

    if (providerScore > bestScore) {
      bestScore = providerScore;
      bestCandidate = {
        providerId: provider.id,
        modelId: bestModel.id,
        reason: buildReason(contentLength, bestModel, provider),
      };
    }
  }

  return bestCandidate;
}

/**
 * Build a human-readable reason string
 */
function buildReason(contentLength, model, provider) {
  const sizeLabel = contentLength > 100000
    ? `${Math.round(contentLength / 1000)}K chars`
    : contentLength > 1000
      ? `${Math.round(contentLength / 1000)}K chars`
      : `${contentLength} chars`;

  const windowLabel = model.contextWindow >= 1000000
    ? `${(model.contextWindow / 1000000).toFixed(1)}M`
    : `${Math.round(model.contextWindow / 1000)}K`;

  return `${provider.name} ${model.name} (${windowLabel} ctx) for ${sizeLabel}`;
}

/**
 * Count how many providers have API keys configured.
 * @param {Object} aiSettings
 * @returns {number}
 */
export function getConfiguredProviderCount(aiSettings) {
  if (!aiSettings) return 0;
  let count = 0;
  if (aiSettings.groqApiKey) count++;
  if (aiSettings.openaiApiKey) count++;
  if (aiSettings.claudeApiKey) count++;
  if (aiSettings.geminiApiKey) count++;
  if (aiSettings.mistralApiKey) count++;
  if (aiSettings.cerebrasApiKey) count++;
  if (aiSettings.sambanovaApiKey) count++;
  // Ollama doesn't need an API key but is desktop-only
  return count;
}

/**
 * Whether we should suggest configuring more providers.
 * @param {Object} aiSettings
 * @returns {boolean}
 */
export function shouldSuggestMoreProviders(aiSettings) {
  return getConfiguredProviderCount(aiSettings) <= 1;
}

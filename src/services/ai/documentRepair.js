import { chromeNanoProvider } from './providers/ChromeBuiltInProvider.js';
import { checkNanoRepairInput, validateNanoRepair } from './jsonRepairGuard.js';
import { aiService } from '../AIService.js';
import { scanForSecrets } from './privacyGuard.js';

const CLOUD_REPAIR_PROVIDERS = [
  ['groq', 'Groq'], ['openai', 'OpenAI'], ['claude', 'Claude'], ['gemini', 'Gemini'],
  ['mistral', 'Mistral'], ['cerebras', 'Cerebras'], ['sambanova', 'SambaNova'],
];
export function repairPreference(settings) {
  return settings.repairFallback === 'stop' ? 'stop' : 'offer';
}
export function repairOffers(settings, desktop = false) {
  const offers = CLOUD_REPAIR_PROVIDERS.filter(([id]) => Boolean(settings[`${id}ApiKey`])).map(([id, name]) => ({ id, name, local: false }));
  if (desktop && settings.provider === 'ollama') offers.unshift({ id: 'ollama', name: 'Ollama', local: true });
  return offers.sort((a, b) => Number(b.id === settings.provider) - Number(a.id === settings.provider));
}
// No provider selection can change this first step into a network operation.
export async function repairWithRules(content, details, service = aiService) {
  if (!['JSON', 'XML'].includes(details.type)) throw new Error('Local Auto-fix supports JSON and XML.');
  const fixed = await service.fixWithTinyLLM(content, details, { allowPartial: false });
  if (!fixed || !service.isValidContent(fixed, details.type)) throw new Error('Auto-fix could not produce a valid document.');
  return fixed;
}
// Called only by the named provider button after a failed rules attempt.
export async function repairWithProvider(content, details, settings, providerId, { desktopService, onProgress, service = aiService } = {}) {
  if (repairPreference(settings) === 'stop') throw new Error('AI repair is disabled. Only local rules will be used.');
  const offer = repairOffers(settings, Boolean(desktopService)).find(item => item.id === providerId);
  if (!offer) throw new Error('Configure this repair provider in AI Settings first.');
  if (!offer.local && scanForSecrets(content).length) throw new Error('Sensitive data detected. Remove credentials from the document before sending it to cloud AI.');
  const fixed = offer.local
    ? await desktopService.fixWithOllama(content, details, settings.ollamaModel, onProgress)
    : await service.fix(content, details, { ...settings, provider: providerId }, onProgress, { skipAutoFix: true });
  if (!fixed || !service.isValidContent(fixed, details.type)) throw new Error('The proposed repair is not valid. The document has not been changed.');
  return fixed;
}

// Local fallback after rules fail. Never downloads a model or dispatches to cloud.
export async function repairWithNano(content, details, settings, { provider = chromeNanoProvider, signal } = {}) {
  if (repairPreference(settings) === 'stop') throw new Error('AI repair is disabled. Only local rules will be used.');
  if (settings.provider !== 'chrome-nano') throw new Error('Select Private AI to use on-device JSON repair.');
  checkNanoRepairInput(content, details.type);
  if (!provider.isReady()) await provider.initialize();
  if (!provider.isReady()) throw new Error('Private AI is not ready. Open AI Settings to prepare the model, then retry.');
  const result = await provider.repairJSON(content, { signal });
  if (result.metadata?.wasCut) throw new Error('Private AI repair requires the complete document. Sampled output was rejected.');
  return validateNanoRepair(content, result.text);
}

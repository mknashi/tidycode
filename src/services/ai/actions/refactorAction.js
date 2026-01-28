/**
 * Refactor Action
 *
 * Suggests improvements to selected code while preserving functionality.
 * Supports different refactoring goals: general, performance, readability, modern.
 */

import { providerManager } from '../ProviderManager.js';
import { ActionResult } from './ActionManager.js';

/**
 * Refactor type instructions
 */
export const REFACTOR_TYPES = {
  general: {
    name: 'General',
    instruction: 'Improve code quality, readability, and maintainability.',
    focus: [
      'Better naming for variables and functions',
      'Improved code structure',
      'Reduced complexity',
      'Better error handling',
    ],
  },
  performance: {
    name: 'Performance',
    instruction: 'Optimize for better performance while maintaining readability.',
    focus: [
      'Algorithm efficiency',
      'Reduced memory usage',
      'Fewer iterations',
      'Caching opportunities',
    ],
  },
  readability: {
    name: 'Readability',
    instruction: 'Make the code more readable and self-documenting.',
    focus: [
      'Clear variable names',
      'Logical code organization',
      'Simplified control flow',
      'Appropriate comments where needed',
    ],
  },
  modern: {
    name: 'Modernize',
    instruction: 'Update to use modern language features and patterns.',
    focus: [
      'Modern syntax (arrow functions, destructuring, etc.)',
      'Current best practices',
      'New language features',
      'Modern APIs',
    ],
  },
  security: {
    name: 'Security',
    instruction: 'Improve code security and fix potential vulnerabilities.',
    focus: [
      'Input validation',
      'Secure defaults',
      'Proper error handling',
      'Avoiding common vulnerabilities',
    ],
  },
  dry: {
    name: 'DRY (Don\'t Repeat Yourself)',
    instruction: 'Reduce code duplication and improve reusability.',
    focus: [
      'Extract common functionality',
      'Create reusable functions',
      'Remove duplicated logic',
      'Use appropriate abstractions',
    ],
  },
};

/**
 * Build prompt for refactor action
 * @param {string} content - Content to refactor
 * @param {Object} context - Action context
 * @param {string} refactorType - Type of refactoring
 * @returns {string}
 */
function buildRefactorPrompt(content, context, refactorType) {
  const typeConfig = REFACTOR_TYPES[refactorType] || REFACTOR_TYPES.general;

  const focusPoints = typeConfig.focus.map(f => `- ${f}`).join('\n');

  return `Refactor the following ${context.language || 'code'}.

Goal: ${typeConfig.instruction}

Focus areas:
${focusPoints}

Requirements:
1. Preserve the original functionality exactly
2. Return ONLY the refactored code without explanations
3. Use consistent formatting
4. Keep the same function/class signatures unless improvement is clear

Original code:
\`\`\`${context.language || ''}
${content}
\`\`\`

Refactored code:`;
}

/**
 * Refactor action handler
 * @param {import('./ActionManager.js').ActionContext} context - Action context
 * @param {Object} options - Action options
 * @param {string} [options.type] - Refactor type: 'general', 'performance', 'readability', 'modern', 'security', 'dry'
 * @param {boolean} [options.preserveComments] - Whether to preserve existing comments
 * @returns {Promise<ActionResult>}
 */
export async function refactorAction(context, options = {}) {
  const content = context.getText();

  if (!content || content.trim().length === 0) {
    return ActionResult.failure('refactor', 'No content to refactor');
  }

  const { type = 'general', preserveComments = true } = options;

  let prompt = buildRefactorPrompt(content, context, type);

  if (preserveComments) {
    prompt += '\n\nPreserve meaningful comments from the original code.';
  }

  try {
    const result = await providerManager.complete({
      prompt,
      language: context.language,
      task: 'refactor',
      options: {
        maxTokens: 4096,
        temperature: 0.2,
        extractFormat: context.language === 'json' ? 'json' : null,
      },
    });

    // Extract code from response (remove markdown code blocks if present)
    let refactoredCode = result.text;
    if (refactoredCode.includes('```')) {
      const match = refactoredCode.match(/```(?:\w+)?\n?([\s\S]*?)```/);
      if (match) {
        refactoredCode = match[1].trim();
      }
    }

    return ActionResult.success('refactor', refactoredCode, {
      language: context.language,
      refactorType: type,
      originalLength: content.length,
      refactoredLength: refactoredCode.length,
      usage: result.usage,
    });
  } catch (error) {
    return ActionResult.failure('refactor', error.message);
  }
}

/**
 * Stream refactor action
 * @param {import('./ActionManager.js').ActionContext} context - Action context
 * @param {Function} onChunk - Callback for each chunk
 * @param {Object} options - Action options
 * @returns {Promise<ActionResult>}
 */
export async function refactorActionStream(context, onChunk, options = {}) {
  const content = context.getText();

  if (!content || content.trim().length === 0) {
    return ActionResult.failure('refactor', 'No content to refactor');
  }

  const { type = 'general' } = options;
  const prompt = buildRefactorPrompt(content, context, type);

  try {
    const result = await providerManager.streamComplete(
      {
        prompt,
        language: context.language,
        task: 'refactor',
        options: {
          maxTokens: 4096,
          temperature: 0.2,
        },
      },
      onChunk
    );

    return ActionResult.success('refactor', result.text, {
      language: context.language,
      refactorType: type,
      streamed: true,
    });
  } catch (error) {
    return ActionResult.failure('refactor', error.message);
  }
}

/**
 * Get available refactor types
 * @returns {Array<Object>}
 */
export function getRefactorTypes() {
  return Object.entries(REFACTOR_TYPES).map(([id, config]) => ({
    id,
    name: config.name,
    description: config.instruction,
  }));
}

export default refactorAction;

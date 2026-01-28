/**
 * Explain Action
 *
 * Provides clear explanations of selected code or text.
 * Useful for understanding unfamiliar code or complex logic.
 */

import { providerManager } from '../ProviderManager.js';
import { ActionResult } from './ActionManager.js';

/**
 * Explanation detail levels
 */
export const EXPLANATION_LEVELS = {
  brief: {
    name: 'Brief',
    description: '2-3 sentences summary',
    instruction: 'Keep the explanation brief and to the point (2-3 sentences max).',
  },
  normal: {
    name: 'Normal',
    description: 'Standard explanation with key details',
    instruction: '',
  },
  detailed: {
    name: 'Detailed',
    description: 'In-depth explanation with examples',
    instruction: 'Provide a detailed explanation with examples where helpful.',
  },
  comprehensive: {
    name: 'Comprehensive',
    description: 'Complete analysis with context and implications',
    instruction: 'Provide a comprehensive analysis including context, implications, and related concepts.',
  },
};

/**
 * Target audience types
 */
export const AUDIENCE_TYPES = {
  beginner: {
    name: 'Beginner',
    description: 'New to programming',
    instruction: 'Explain for someone new to programming. Avoid jargon or explain technical terms.',
  },
  intermediate: {
    name: 'Intermediate',
    description: 'Familiar with programming basics',
    instruction: '',
  },
  expert: {
    name: 'Expert',
    description: 'Deep technical knowledge',
    instruction: 'Assume the reader has deep technical knowledge. Focus on nuances and advanced concepts.',
  },
};

/**
 * Build prompt for explain action
 * @param {string} content - Content to explain
 * @param {Object} context - Action context
 * @returns {string}
 */
function buildExplainPrompt(content, context) {
  const languageHint = context.language ? `This is ${context.language} code.` : '';

  return `Explain the following ${context.language || 'code/text'} in clear, concise terms.

${languageHint}

Focus on:
- What it does (purpose)
- How it works (mechanism)
- Any notable patterns, techniques, or potential issues

Content to explain:
\`\`\`${context.language || ''}
${content}
\`\`\`

Provide a clear, well-structured explanation. Use bullet points or numbered lists where appropriate.`;
}

/**
 * Explain action handler
 * @param {import('./ActionManager.js').ActionContext} context - Action context
 * @param {Object} options - Action options
 * @param {string} [options.detail] - Detail level: 'brief', 'normal', 'detailed'
 * @param {string} [options.audience] - Target audience: 'beginner', 'intermediate', 'expert'
 * @returns {Promise<ActionResult>}
 */
export async function explainAction(context, options = {}) {
  const content = context.getText();

  if (!content || content.trim().length === 0) {
    return ActionResult.failure('explain', 'No content to explain');
  }

  const { detail = 'normal', audience = 'intermediate' } = options;

  // Customize prompt based on options
  let prompt = buildExplainPrompt(content, context);

  if (detail === 'brief') {
    prompt += '\n\nKeep the explanation brief and to the point (2-3 sentences max).';
  } else if (detail === 'detailed') {
    prompt += '\n\nProvide a detailed explanation with examples where helpful.';
  }

  if (audience === 'beginner') {
    prompt += '\n\nExplain for someone new to programming. Avoid jargon or explain technical terms.';
  } else if (audience === 'expert') {
    prompt += '\n\nAssume the reader has deep technical knowledge. Focus on nuances and advanced concepts.';
  }

  try {
    const result = await providerManager.complete({
      prompt,
      language: context.language,
      task: 'explain',
      options: {
        maxTokens: detail === 'detailed' ? 2048 : 1024,
        temperature: 0.3,
      },
    });

    return ActionResult.success('explain', result.text, {
      language: context.language,
      contentLength: content.length,
      detail,
      audience,
      usage: result.usage,
    });
  } catch (error) {
    return ActionResult.failure('explain', error.message);
  }
}

/**
 * Stream explain action
 * @param {import('./ActionManager.js').ActionContext} context - Action context
 * @param {Function} onChunk - Callback for each chunk
 * @param {Object} options - Action options
 * @returns {Promise<ActionResult>}
 */
export async function explainActionStream(context, onChunk, options = {}) {
  const content = context.getText();

  if (!content || content.trim().length === 0) {
    return ActionResult.failure('explain', 'No content to explain');
  }

  const prompt = buildExplainPrompt(content, context);

  try {
    const result = await providerManager.streamComplete(
      {
        prompt,
        language: context.language,
        task: 'explain',
        options: {
          maxTokens: 1024,
          temperature: 0.3,
        },
      },
      onChunk
    );

    return ActionResult.success('explain', result.text, {
      language: context.language,
      streamed: true,
    });
  } catch (error) {
    return ActionResult.failure('explain', error.message);
  }
}

export default explainAction;

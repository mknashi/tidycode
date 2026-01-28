/**
 * Convert Action
 *
 * Converts content between different formats: JSON, YAML, XML, TOML.
 */

import { providerManager } from '../ProviderManager.js';
import { ActionResult } from './ActionManager.js';

/**
 * Supported formats
 */
export const SUPPORTED_FORMATS = {
  json: {
    name: 'JSON',
    extensions: ['.json'],
    mimeTypes: ['application/json'],
  },
  yaml: {
    name: 'YAML',
    extensions: ['.yaml', '.yml'],
    mimeTypes: ['application/x-yaml', 'text/yaml'],
  },
  xml: {
    name: 'XML',
    extensions: ['.xml'],
    mimeTypes: ['application/xml', 'text/xml'],
  },
  toml: {
    name: 'TOML',
    extensions: ['.toml'],
    mimeTypes: ['application/toml'],
  },
};

/**
 * Detect format from content
 * @param {string} content - Content to analyze
 * @returns {string|null} - Format id or null if unknown
 */
export function detectFormat(content) {
  const trimmed = content.trim();

  // JSON detection
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON, might be something else
    }
  }

  // XML detection
  if (trimmed.startsWith('<') && trimmed.includes('>')) {
    // Check for XML declaration or root element
    if (trimmed.startsWith('<?xml') || /<[a-zA-Z][\w-]*/.test(trimmed)) {
      return 'xml';
    }
  }

  // YAML detection (basic heuristics)
  if (
    (trimmed.includes(': ') || trimmed.includes(':\n')) &&
    !trimmed.startsWith('{') &&
    !trimmed.startsWith('<')
  ) {
    // Check for YAML-like structure
    const lines = trimmed.split('\n');
    const yamlLikeLines = lines.filter(
      line => /^[\s]*[\w-]+:/.test(line) || /^[\s]*-\s/.test(line)
    );
    if (yamlLikeLines.length > lines.length * 0.3) {
      return 'yaml';
    }
  }

  // TOML detection
  if (trimmed.includes('[') && /^\[[\w.-]+\]/m.test(trimmed)) {
    const lines = trimmed.split('\n');
    const tomlLikeLines = lines.filter(
      line => /^\[[\w.-]+\]/.test(line.trim()) || /^[\w-]+\s*=/.test(line.trim())
    );
    if (tomlLikeLines.length > 0) {
      return 'toml';
    }
  }

  return null;
}

/**
 * Build prompt for convert action
 * @param {string} content - Content to convert
 * @param {string} sourceFormat - Source format
 * @param {string} targetFormat - Target format
 * @returns {string}
 */
function buildConvertPrompt(content, sourceFormat, targetFormat) {
  const sourceInfo = SUPPORTED_FORMATS[sourceFormat];
  const targetInfo = SUPPORTED_FORMATS[targetFormat];

  return `Convert the following ${sourceInfo?.name || sourceFormat.toUpperCase()} to ${targetInfo?.name || targetFormat.toUpperCase()}.

Requirements:
1. Preserve all data exactly
2. Use proper ${targetInfo?.name || targetFormat.toUpperCase()} syntax and conventions
3. Maintain hierarchical structure
4. Use appropriate indentation (2 spaces)
5. Return ONLY the converted content, no explanations

Source ${sourceInfo?.name || sourceFormat.toUpperCase()}:
\`\`\`${sourceFormat}
${content}
\`\`\`

Converted ${targetInfo?.name || targetFormat.toUpperCase()}:`;
}

/**
 * Convert action handler
 * @param {import('./ActionManager.js').ActionContext} context - Action context
 * @param {Object} options - Action options
 * @param {string} options.targetFormat - Target format: 'json', 'yaml', 'xml', 'toml'
 * @param {string} [options.sourceFormat] - Source format (auto-detected if not provided)
 * @returns {Promise<ActionResult>}
 */
export async function convertAction(context, options = {}) {
  const content = context.getText();

  if (!content || content.trim().length === 0) {
    return ActionResult.failure('convert', 'No content to convert');
  }

  const { targetFormat, sourceFormat: providedSourceFormat } = options;

  if (!targetFormat) {
    return ActionResult.failure('convert', 'Target format is required');
  }

  if (!SUPPORTED_FORMATS[targetFormat]) {
    return ActionResult.failure('convert', `Unsupported target format: ${targetFormat}`);
  }

  // Detect source format if not provided
  const sourceFormat = providedSourceFormat || detectFormat(content);

  if (!sourceFormat) {
    return ActionResult.failure(
      'convert',
      'Unable to detect source format. Please specify the source format.'
    );
  }

  if (sourceFormat === targetFormat) {
    return ActionResult.failure('convert', `Content is already in ${targetFormat} format`);
  }

  const prompt = buildConvertPrompt(content, sourceFormat, targetFormat);

  try {
    const result = await providerManager.complete({
      prompt,
      language: targetFormat,
      task: 'convert',
      options: {
        maxTokens: 8192,
        temperature: 0.1, // Low temperature for accurate conversion
        extractFormat: targetFormat === 'json' ? 'json' : targetFormat === 'xml' ? 'xml' : null,
      },
    });

    // Extract content from response
    let convertedContent = result.text;

    // Remove markdown code blocks if present
    if (convertedContent.includes('```')) {
      const match = convertedContent.match(/```(?:\w+)?\n?([\s\S]*?)```/);
      if (match) {
        convertedContent = match[1].trim();
      }
    }

    return ActionResult.success('convert', convertedContent, {
      sourceFormat,
      targetFormat,
      sourceLength: content.length,
      targetLength: convertedContent.length,
      usage: result.usage,
    });
  } catch (error) {
    return ActionResult.failure('convert', error.message);
  }
}

/**
 * Get conversion options for a given source format
 * @param {string} sourceFormat - Source format
 * @returns {Array<string>} - Available target formats
 */
export function getConversionOptions(sourceFormat) {
  return Object.keys(SUPPORTED_FORMATS).filter(f => f !== sourceFormat);
}

/**
 * Validate content against a format
 * @param {string} content - Content to validate
 * @param {string} format - Expected format
 * @returns {{valid: boolean, error?: string}}
 */
export function validateFormat(content, format) {
  const trimmed = content.trim();

  switch (format) {
    case 'json':
      try {
        JSON.parse(trimmed);
        return { valid: true };
      } catch (error) {
        return { valid: false, error: error.message };
      }

    case 'xml':
      if (!trimmed.startsWith('<')) {
        return { valid: false, error: 'XML must start with <' };
      }
      // Basic XML validation (could be enhanced)
      const openTags = trimmed.match(/<[a-zA-Z][\w-]*/g) || [];
      const closeTags = trimmed.match(/<\/[a-zA-Z][\w-]*/g) || [];
      if (openTags.length === 0) {
        return { valid: false, error: 'No valid XML tags found' };
      }
      return { valid: true };

    case 'yaml':
    case 'toml':
      // Basic validation - just check it's not empty
      return { valid: trimmed.length > 0 };

    default:
      return { valid: false, error: `Unknown format: ${format}` };
  }
}

export default convertAction;

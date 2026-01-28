/**
 * Infer Schema Action
 *
 * Generates schemas from sample data: JSON Schema, TypeScript types, or Zod schemas.
 */

import { providerManager } from '../ProviderManager.js';
import { ActionResult } from './ActionManager.js';

/**
 * Schema output formats
 */
export const SCHEMA_FORMATS = {
  'json-schema': {
    name: 'JSON Schema',
    description: 'JSON Schema (draft-07) for validation',
    language: 'json',
    extension: '.schema.json',
  },
  typescript: {
    name: 'TypeScript',
    description: 'TypeScript interface definitions',
    language: 'typescript',
    extension: '.d.ts',
  },
  zod: {
    name: 'Zod',
    description: 'Zod schema for runtime validation',
    language: 'typescript',
    extension: '.schema.ts',
  },
  yup: {
    name: 'Yup',
    description: 'Yup schema for form validation',
    language: 'typescript',
    extension: '.schema.ts',
  },
  'io-ts': {
    name: 'io-ts',
    description: 'io-ts codecs for TypeScript',
    language: 'typescript',
    extension: '.codec.ts',
  },
};

/**
 * Build prompt for schema inference
 * @param {string} content - Sample data
 * @param {string} outputFormat - Output format
 * @param {Object} options - Additional options
 * @returns {string}
 */
function buildSchemaPrompt(content, outputFormat, options = {}) {
  const formatConfig = SCHEMA_FORMATS[outputFormat];
  const { typeName = 'GeneratedType', strict = true } = options;

  const formatInstructions = {
    'json-schema': `Generate a JSON Schema (draft-07) that validates this data.

Include:
- Appropriate types for all fields
- "required" array listing required fields
- "description" for complex fields
- Pattern validation for strings where applicable (emails, URLs, dates, UUIDs)
- Enum constraints where values appear limited
- Minimum/maximum for numbers if patterns are visible`,

    typescript: `Generate TypeScript type definitions for this data.

Include:
- Interface definitions with proper typing
- Optional fields marked with ?
- JSDoc comments for complex fields
- Nested interfaces for complex objects
- Array types where applicable
- Union types if values suggest multiple possibilities
- Export statements
- Use "${typeName}" as the main type name`,

    zod: `Generate Zod schema definitions for this data.

Include:
- Proper Zod validators for each field (z.string(), z.number(), etc.)
- Optional/nullable handling with .optional() or .nullable()
- String refinements (.email(), .url(), .uuid()) where applicable
- Array schemas with .array()
- Object schemas with z.object()
- Custom error messages for important validations
- Export statement
- Use "${typeName}Schema" as the schema name
- Include type inference: type ${typeName} = z.infer<typeof ${typeName}Schema>`,

    yup: `Generate Yup schema definitions for this data.

Include:
- Proper Yup validators (yup.string(), yup.number(), etc.)
- Required/optional handling
- String validations (.email(), .url()) where applicable
- Nested object schemas
- Array schemas
- Export statement`,

    'io-ts': `Generate io-ts codec definitions for this data.

Include:
- Proper codecs (t.string, t.number, t.type, etc.)
- Optional fields with t.partial
- Intersection types where needed
- Array codecs with t.array
- Export statement`,
  };

  return `Analyze the following data and generate ${formatConfig.name} definitions.

${formatInstructions[outputFormat]}

${strict ? 'Be strict with types - prefer specific types over "any" or "unknown".' : 'Allow flexibility with types where data is ambiguous.'}

Sample data:
\`\`\`json
${content}
\`\`\`

Return ONLY the ${formatConfig.name} code, no explanations.`;
}

/**
 * Infer schema action handler
 * @param {import('./ActionManager.js').ActionContext} context - Action context
 * @param {Object} options - Action options
 * @param {string} [options.format='json-schema'] - Output format
 * @param {string} [options.typeName='GeneratedType'] - Name for the generated type
 * @param {boolean} [options.strict=true] - Whether to be strict with types
 * @returns {Promise<ActionResult>}
 */
export async function inferSchemaAction(context, options = {}) {
  const content = context.getText();

  if (!content || content.trim().length === 0) {
    return ActionResult.failure('infer-schema', 'No content to analyze');
  }

  const { format = 'json-schema', typeName = 'GeneratedType', strict = true } = options;

  if (!SCHEMA_FORMATS[format]) {
    return ActionResult.failure('infer-schema', `Unsupported format: ${format}`);
  }

  // Try to parse as JSON to validate input
  let parsedData;
  try {
    parsedData = JSON.parse(content.trim());
  } catch {
    // Content might be YAML or other format - let AI handle it
    parsedData = null;
  }

  const prompt = buildSchemaPrompt(content, format, { typeName, strict });
  const formatConfig = SCHEMA_FORMATS[format];

  try {
    const result = await providerManager.complete({
      prompt,
      language: formatConfig.language,
      task: 'infer-schema',
      options: {
        maxTokens: 4096,
        temperature: 0.2,
      },
    });

    // Extract code from response
    let schemaCode = result.text;

    // Remove markdown code blocks if present
    if (schemaCode.includes('```')) {
      const match = schemaCode.match(/```(?:\w+)?\n?([\s\S]*?)```/);
      if (match) {
        schemaCode = match[1].trim();
      }
    }

    return ActionResult.success('infer-schema', schemaCode, {
      format,
      formatName: formatConfig.name,
      language: formatConfig.language,
      extension: formatConfig.extension,
      typeName,
      inputLength: content.length,
      usage: result.usage,
    });
  } catch (error) {
    return ActionResult.failure('infer-schema', error.message);
  }
}

/**
 * Get available schema formats
 * @returns {Array<Object>}
 */
export function getSchemaFormats() {
  return Object.entries(SCHEMA_FORMATS).map(([id, config]) => ({
    id,
    ...config,
  }));
}

export default inferSchemaAction;

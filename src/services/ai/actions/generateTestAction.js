/**
 * Generate Test Action
 *
 * Generates unit tests for code using AI.
 */

import { providerManager } from '../ProviderManager.js';
import { ActionResult } from './ActionManager.js';

/**
 * Test frameworks configuration
 */
export const TEST_FRAMEWORKS = {
  jest: {
    name: 'Jest',
    description: 'JavaScript testing framework with built-in assertions',
    languages: ['javascript', 'typescript', 'jsx', 'tsx'],
    extension: '.test.js',
  },
  vitest: {
    name: 'Vitest',
    description: 'Vite-native testing framework',
    languages: ['javascript', 'typescript', 'jsx', 'tsx'],
    extension: '.test.ts',
  },
  mocha: {
    name: 'Mocha + Chai',
    description: 'Flexible testing with Chai assertions',
    languages: ['javascript', 'typescript'],
    extension: '.spec.js',
  },
  pytest: {
    name: 'Pytest',
    description: 'Python testing framework',
    languages: ['python'],
    extension: '_test.py',
  },
  unittest: {
    name: 'Python unittest',
    description: 'Python built-in testing module',
    languages: ['python'],
    extension: '_test.py',
  },
  go: {
    name: 'Go testing',
    description: 'Go standard library testing',
    languages: ['go'],
    extension: '_test.go',
  },
  rust: {
    name: 'Rust tests',
    description: 'Rust built-in testing',
    languages: ['rust'],
    extension: '.rs',
  },
  junit: {
    name: 'JUnit 5',
    description: 'Java testing framework',
    languages: ['java'],
    extension: 'Test.java',
  },
  rspec: {
    name: 'RSpec',
    description: 'Ruby testing framework',
    languages: ['ruby'],
    extension: '_spec.rb',
  },
  phpunit: {
    name: 'PHPUnit',
    description: 'PHP testing framework',
    languages: ['php'],
    extension: 'Test.php',
  },
};

/**
 * Test types
 */
export const TEST_TYPES = {
  unit: {
    name: 'Unit Tests',
    description: 'Test individual functions/methods in isolation',
    instruction: `Generate unit tests that:
- Test each function/method individually
- Mock dependencies and external calls
- Cover happy paths and edge cases
- Test boundary conditions
- Include assertion messages`,
  },
  integration: {
    name: 'Integration Tests',
    description: 'Test how components work together',
    instruction: `Generate integration tests that:
- Test interactions between components
- Verify data flow between modules
- Test API contracts
- Include setup/teardown for shared state`,
  },
  edge: {
    name: 'Edge Case Tests',
    description: 'Focus on edge cases and error handling',
    instruction: `Generate edge case tests that:
- Test null/undefined inputs
- Test empty arrays/objects
- Test maximum/minimum values
- Test invalid inputs
- Test error conditions and exceptions
- Test concurrent/async edge cases`,
  },
  snapshot: {
    name: 'Snapshot Tests',
    description: 'Test output consistency',
    instruction: `Generate snapshot tests that:
- Capture component/output state
- Test rendering consistency
- Include meaningful snapshot descriptions`,
  },
};

/**
 * Detect language from content or context
 * @param {string} content - Code content
 * @param {string} [language] - Explicit language
 * @returns {string}
 */
function detectLanguage(content, language) {
  if (language) return language.toLowerCase();

  // Simple language detection heuristics
  if (content.includes('import React') || content.includes('from "react"')) {
    return content.includes(': ') ? 'tsx' : 'jsx';
  }
  if (content.includes('interface ') || content.includes(': string') || content.includes(': number')) {
    return 'typescript';
  }
  if (content.includes('def ') && content.includes(':')) {
    return 'python';
  }
  if (content.includes('func ') && content.includes('package ')) {
    return 'go';
  }
  if (content.includes('fn ') && content.includes('let mut')) {
    return 'rust';
  }
  if (content.includes('public class') || content.includes('public static void')) {
    return 'java';
  }
  if (content.includes('<?php') || content.includes('function ') && content.includes('$')) {
    return 'php';
  }
  if (content.includes('def ') && content.includes('end')) {
    return 'ruby';
  }

  return 'javascript';
}

/**
 * Get best framework for language
 * @param {string} language - Programming language
 * @param {string} [preferred] - Preferred framework
 * @returns {string}
 */
function getBestFramework(language, preferred) {
  if (preferred && TEST_FRAMEWORKS[preferred]) {
    return preferred;
  }

  const langLower = language.toLowerCase();

  // Map languages to default frameworks
  const languageDefaults = {
    javascript: 'jest',
    typescript: 'jest',
    jsx: 'jest',
    tsx: 'jest',
    python: 'pytest',
    go: 'go',
    rust: 'rust',
    java: 'junit',
    ruby: 'rspec',
    php: 'phpunit',
  };

  return languageDefaults[langLower] || 'jest';
}

/**
 * Build prompt for test generation
 * @param {string} content - Code content
 * @param {string} framework - Test framework
 * @param {string} testType - Type of tests
 * @param {Object} options - Additional options
 * @returns {string}
 */
function buildTestPrompt(content, framework, testType, options = {}) {
  const frameworkConfig = TEST_FRAMEWORKS[framework];
  const typeConfig = TEST_TYPES[testType] || TEST_TYPES.unit;
  const { coverage = 'comprehensive', functionName } = options;

  let targetInstruction = '';
  if (functionName) {
    targetInstruction = `Focus specifically on testing the "${functionName}" function/method.\n\n`;
  }

  const coverageInstruction = coverage === 'minimal'
    ? 'Generate a minimal set of tests covering the main functionality.'
    : coverage === 'comprehensive'
      ? 'Generate comprehensive tests with good coverage of all code paths.'
      : 'Generate exhaustive tests covering every possible scenario.';

  return `Generate ${frameworkConfig.name} tests for the following code.

${typeConfig.instruction}

${targetInstruction}${coverageInstruction}

Requirements:
- Use ${frameworkConfig.name} syntax and conventions
- Include descriptive test names that explain what is being tested
- Group related tests using describe/context blocks where appropriate
- Add setup/teardown if needed
- Include comments explaining complex test logic
- Follow testing best practices for ${frameworkConfig.name}

Code to test:
\`\`\`
${content}
\`\`\`

Return ONLY the test code, ready to run. Include necessary imports.`;
}

/**
 * Generate test action handler
 * @param {import('./ActionManager.js').ActionContext} context - Action context
 * @param {Object} options - Action options
 * @param {string} [options.framework] - Test framework to use
 * @param {string} [options.testType='unit'] - Type of tests to generate
 * @param {string} [options.coverage='comprehensive'] - Coverage level
 * @param {string} [options.functionName] - Specific function to test
 * @returns {Promise<ActionResult>}
 */
export async function generateTestAction(context, options = {}) {
  const content = context.getText();

  if (!content || content.trim().length === 0) {
    return ActionResult.failure('generate-tests', 'No code to generate tests for');
  }

  const language = detectLanguage(content, context.getLanguage());
  const {
    framework = getBestFramework(language, options.framework),
    testType = 'unit',
    coverage = 'comprehensive',
    functionName,
  } = options;

  if (!TEST_FRAMEWORKS[framework]) {
    return ActionResult.failure('generate-tests', `Unsupported framework: ${framework}`);
  }

  if (!TEST_TYPES[testType]) {
    return ActionResult.failure('generate-tests', `Unknown test type: ${testType}`);
  }

  const prompt = buildTestPrompt(content, framework, testType, { coverage, functionName });
  const frameworkConfig = TEST_FRAMEWORKS[framework];

  try {
    const result = await providerManager.complete({
      prompt,
      language: frameworkConfig.languages[0],
      task: 'generate-tests',
      options: {
        maxTokens: 4096,
        temperature: 0.3,
      },
    });

    // Extract code from response
    let testCode = result.text;

    // Remove markdown code blocks if present
    if (testCode.includes('```')) {
      const match = testCode.match(/```(?:\w+)?\n?([\s\S]*?)```/);
      if (match) {
        testCode = match[1].trim();
      }
    }

    // Count test cases (approximate)
    const testCountPatterns = [
      /\bit\s*\(/g,           // Jest/Mocha it()
      /\btest\s*\(/g,         // Jest test()
      /\bdef test_/g,         // Python
      /\bfunc Test/g,         // Go
      /\b#\[test\]/g,         // Rust
      /\b@Test/g,             // JUnit
      /\bit\s+['"]|do$/gm,    // RSpec
    ];

    let testCount = 0;
    testCountPatterns.forEach(pattern => {
      const matches = testCode.match(pattern);
      if (matches) testCount += matches.length;
    });

    return ActionResult.success('generate-tests', testCode, {
      framework,
      frameworkName: frameworkConfig.name,
      testType,
      testTypeName: TEST_TYPES[testType].name,
      language,
      extension: frameworkConfig.extension,
      coverage,
      testCount,
      targetFunction: functionName || null,
      usage: result.usage,
    });
  } catch (error) {
    return ActionResult.failure('generate-tests', error.message);
  }
}

/**
 * Stream generate test action
 * @param {import('./ActionManager.js').ActionContext} context - Action context
 * @param {Function} onChunk - Callback for each chunk
 * @param {Object} options - Action options
 * @returns {Promise<ActionResult>}
 */
export async function generateTestActionStream(context, onChunk, options = {}) {
  const content = context.getText();

  if (!content || content.trim().length === 0) {
    return ActionResult.failure('generate-tests', 'No code to generate tests for');
  }

  const language = detectLanguage(content, context.getLanguage());
  const {
    framework = getBestFramework(language, options.framework),
    testType = 'unit',
    coverage = 'comprehensive',
    functionName,
  } = options;

  const prompt = buildTestPrompt(content, framework, testType, { coverage, functionName });
  const frameworkConfig = TEST_FRAMEWORKS[framework];

  try {
    const result = await providerManager.streamComplete(
      {
        prompt,
        language: frameworkConfig.languages[0],
        task: 'generate-tests',
        options: {
          maxTokens: 4096,
          temperature: 0.3,
        },
      },
      onChunk
    );

    return ActionResult.success('generate-tests', result.text, {
      framework,
      testType,
      language,
      streamed: true,
    });
  } catch (error) {
    return ActionResult.failure('generate-tests', error.message);
  }
}

/**
 * Get available test frameworks
 * @param {string} [language] - Filter by language
 * @returns {Array<Object>}
 */
export function getTestFrameworks(language) {
  const frameworks = Object.entries(TEST_FRAMEWORKS).map(([id, config]) => ({
    id,
    ...config,
  }));

  if (language) {
    const langLower = language.toLowerCase();
    return frameworks.filter(f => f.languages.includes(langLower));
  }

  return frameworks;
}

/**
 * Get available test types
 * @returns {Array<Object>}
 */
export function getTestTypes() {
  return Object.entries(TEST_TYPES).map(([id, config]) => ({
    id,
    name: config.name,
    description: config.description,
  }));
}

export default generateTestAction;

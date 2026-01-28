/**
 * AI Actions Tests
 *
 * Unit tests for all AI actions.
 */

import { TestSuite, assert } from './testUtils.js';
import {
  ActionManager,
  ActionResult,
  ActionContext,
  ACTION_IDS,
} from '../actions/ActionManager.js';
import { EXPLANATION_LEVELS, AUDIENCE_TYPES } from '../actions/explainAction.js';
import { REFACTOR_TYPES, getRefactorTypes } from '../actions/refactorAction.js';
import { SUPPORTED_FORMATS, detectFormat, getConversionOptions } from '../actions/convertAction.js';
import { SCHEMA_FORMATS, getSchemaFormats } from '../actions/inferSchemaAction.js';
import { ANALYSIS_TYPES, getAnalysisTypes } from '../actions/summarizeLogsAction.js';
import { TEST_FRAMEWORKS, TEST_TYPES, getTestFrameworks, getTestTypes } from '../actions/generateTestAction.js';

/**
 * ActionResult Tests
 */
export const actionResultTests = new TestSuite('ActionResult');

actionResultTests.test('should create success result', () => {
  const result = ActionResult.success('test-action', 'output text', { extra: 'data' });

  assert.ok(result.success);
  assert.equal(result.actionId, 'test-action');
  assert.equal(result.text, 'output text');
  assert.equal(result.metadata.extra, 'data');
  assert.equal(result.error, null);
});

actionResultTests.test('should create failure result', () => {
  const result = ActionResult.failure('test-action', 'Something went wrong');

  assert.ok(!result.success);
  assert.equal(result.actionId, 'test-action');
  assert.equal(result.error, 'Something went wrong');
  assert.equal(result.text, '');
});

actionResultTests.test('should include timestamp', () => {
  const before = Date.now();
  const result = ActionResult.success('test', 'output');
  const after = Date.now();

  assert.ok(result.timestamp >= before);
  assert.ok(result.timestamp <= after);
});

/**
 * ActionContext Tests
 */
export const actionContextTests = new TestSuite('ActionContext');

actionContextTests.test('should create context with content', () => {
  const ctx = new ActionContext({
    content: 'sample text',
    language: 'javascript',
  });

  assert.equal(ctx.getText(), 'sample text');
  assert.equal(ctx.language, 'javascript');
});

actionContextTests.test('should create context with selection', () => {
  const ctx = new ActionContext({
    content: 'full content',
    selection: 'selected text',
    fileName: '/test/file.js',
  });

  assert.equal(ctx.getText(), 'selected text'); // getText prefers selection
  assert.equal(ctx.selection, 'selected text');
  assert.equal(ctx.fileName, '/test/file.js');
});

actionContextTests.test('should handle empty context', () => {
  const ctx = new ActionContext({});

  assert.equal(ctx.getText(), '');
  assert.equal(ctx.language, '');
  assert.equal(ctx.fileName, '');
});

actionContextTests.test('should check hasSelection', () => {
  const ctxWithSelection = new ActionContext({ selection: 'some text' });
  const ctxWithoutSelection = new ActionContext({ content: 'content only' });

  assert.ok(ctxWithSelection.hasSelection());
  assert.ok(!ctxWithoutSelection.hasSelection());
});

/**
 * ActionManager Tests
 */
export const actionManagerTests = new TestSuite('ActionManager');

actionManagerTests.test('should create new instance', () => {
  const manager = new ActionManager();
  assert.ok(manager);
  assert.ok(manager.actions instanceof Map);
});

actionManagerTests.test('should register action', () => {
  const manager = new ActionManager();
  const mockAction = async () => ActionResult.success('test', 'done');

  manager.registerAction('test', mockAction);
  assert.ok(manager.actions.has('test'));
});

actionManagerTests.test('should get registered action', () => {
  const manager = new ActionManager();
  const mockAction = async () => ActionResult.success('test', 'done');

  manager.registerAction('test', mockAction);
  const retrieved = manager.actions.get('test');
  assert.equal(retrieved, mockAction);
});

actionManagerTests.test('should unregister action', () => {
  const manager = new ActionManager();
  manager.registerAction('test', async () => {});

  assert.ok(manager.actions.has('test'));
  manager.unregisterAction('test');
  assert.ok(!manager.actions.has('test'));
});

actionManagerTests.test('should execute action', async () => {
  const manager = new ActionManager();
  const mockAction = async (ctx, opts) => {
    return ActionResult.success('test', `processed: ${ctx.getText()}`);
  };

  manager.registerAction('test', mockAction);
  const result = await manager.execute('test', { content: 'hello' });

  assert.ok(result.success);
  assert.equal(result.text, 'processed: hello');
});

actionManagerTests.test('should handle action execution error', async () => {
  const manager = new ActionManager();
  const failingAction = async () => {
    throw new Error('Action failed');
  };

  manager.registerAction('failing', failingAction);
  const result = await manager.execute('failing', { content: 'test' });

  assert.ok(!result.success);
  assert.ok(result.error.includes('Action failed'));
});

actionManagerTests.test('should return error for unknown action', async () => {
  const manager = new ActionManager();
  const result = await manager.execute('unknown', { content: 'test' });

  assert.ok(!result.success);
  assert.ok(result.error.includes('Unknown action'));
});

actionManagerTests.test('should maintain action history', async () => {
  const manager = new ActionManager();
  manager.registerAction('test', async (ctx) => ActionResult.success('test', 'done'));

  await manager.execute('test', { content: 'hello' });
  await manager.execute('test', { content: 'world' });

  const history = manager.getHistory();
  assert.equal(history.length, 2);
});

/**
 * ACTION_IDS Tests
 */
export const actionIdsTests = new TestSuite('ACTION_IDS');

actionIdsTests.test('should have all required action IDs', () => {
  assert.equal(ACTION_IDS.EXPLAIN, 'explain');
  assert.equal(ACTION_IDS.REFACTOR, 'refactor');
  assert.equal(ACTION_IDS.CONVERT, 'convert');
  assert.equal(ACTION_IDS.INFER_SCHEMA, 'infer-schema');
  assert.equal(ACTION_IDS.SUMMARIZE_LOGS, 'summarize-logs');
  assert.equal(ACTION_IDS.GENERATE_TESTS, 'generate-tests');
});

/**
 * Explain Action Config Tests
 */
export const explainConfigTests = new TestSuite('Explain Action Configuration');

explainConfigTests.test('should have all explanation levels', () => {
  assert.hasProperty(EXPLANATION_LEVELS, 'brief');
  assert.hasProperty(EXPLANATION_LEVELS, 'detailed');
  assert.hasProperty(EXPLANATION_LEVELS, 'comprehensive');

  assert.hasProperty(EXPLANATION_LEVELS.brief, 'name');
  assert.hasProperty(EXPLANATION_LEVELS.brief, 'description');
  assert.hasProperty(EXPLANATION_LEVELS.brief, 'instruction');
});

explainConfigTests.test('should have all audience types', () => {
  assert.hasProperty(AUDIENCE_TYPES, 'beginner');
  assert.hasProperty(AUDIENCE_TYPES, 'intermediate');
  assert.hasProperty(AUDIENCE_TYPES, 'expert');

  assert.hasProperty(AUDIENCE_TYPES.beginner, 'name');
  assert.hasProperty(AUDIENCE_TYPES.beginner, 'instruction');
});

/**
 * Refactor Action Config Tests
 */
export const refactorConfigTests = new TestSuite('Refactor Action Configuration');

refactorConfigTests.test('should have all refactor types', () => {
  assert.hasProperty(REFACTOR_TYPES, 'general');
  assert.hasProperty(REFACTOR_TYPES, 'performance');
  assert.hasProperty(REFACTOR_TYPES, 'readability');
  assert.hasProperty(REFACTOR_TYPES, 'modern');
  assert.hasProperty(REFACTOR_TYPES, 'security');
  assert.hasProperty(REFACTOR_TYPES, 'dry');
});

refactorConfigTests.test('getRefactorTypes should return array', () => {
  const types = getRefactorTypes();
  assert.ok(Array.isArray(types));
  assert.greaterThan(types.length, 0);

  const first = types[0];
  assert.hasProperty(first, 'id');
  assert.hasProperty(first, 'name');
  assert.hasProperty(first, 'description');
});

/**
 * Convert Action Config Tests
 */
export const convertConfigTests = new TestSuite('Convert Action Configuration');

convertConfigTests.test('should have all supported formats', () => {
  assert.hasProperty(SUPPORTED_FORMATS, 'json');
  assert.hasProperty(SUPPORTED_FORMATS, 'yaml');
  assert.hasProperty(SUPPORTED_FORMATS, 'xml');
  assert.hasProperty(SUPPORTED_FORMATS, 'toml');
});

convertConfigTests.test('detectFormat should detect JSON', () => {
  assert.equal(detectFormat('{"key": "value"}'), 'json');
  assert.equal(detectFormat('[1, 2, 3]'), 'json');
});

convertConfigTests.test('detectFormat should detect YAML', () => {
  assert.equal(detectFormat('key: value\nother: data'), 'yaml');
});

convertConfigTests.test('detectFormat should detect XML', () => {
  assert.equal(detectFormat('<root><item>value</item></root>'), 'xml');
  assert.equal(detectFormat('<?xml version="1.0"?><doc/>'), 'xml');
});

convertConfigTests.test('detectFormat should detect TOML', () => {
  assert.equal(detectFormat('[section]\nkey = "value"'), 'toml');
});

convertConfigTests.test('getConversionOptions should return array', () => {
  const options = getConversionOptions('json');
  assert.ok(Array.isArray(options));
  assert.greaterThan(options.length, 0);
  assert.ok(!options.includes('json')); // Should not include source format
  assert.includes(options, 'yaml');
  assert.includes(options, 'xml');
});

/**
 * Schema Action Config Tests
 */
export const schemaConfigTests = new TestSuite('Schema Action Configuration');

schemaConfigTests.test('should have all schema formats', () => {
  assert.hasProperty(SCHEMA_FORMATS, 'json-schema');
  assert.hasProperty(SCHEMA_FORMATS, 'typescript');
  assert.hasProperty(SCHEMA_FORMATS, 'zod');
  assert.hasProperty(SCHEMA_FORMATS, 'yup');
  assert.hasProperty(SCHEMA_FORMATS, 'io-ts');
});

schemaConfigTests.test('schema formats should have required properties', () => {
  Object.values(SCHEMA_FORMATS).forEach(format => {
    assert.hasProperty(format, 'name');
    assert.hasProperty(format, 'description');
    assert.hasProperty(format, 'language');
    assert.hasProperty(format, 'extension');
  });
});

schemaConfigTests.test('getSchemaFormats should return array', () => {
  const formats = getSchemaFormats();
  assert.ok(Array.isArray(formats));
  assert.greaterThan(formats.length, 0);
});

/**
 * Summarize Logs Action Config Tests
 */
export const logsConfigTests = new TestSuite('Summarize Logs Action Configuration');

logsConfigTests.test('should have all analysis types', () => {
  assert.hasProperty(ANALYSIS_TYPES, 'general');
  assert.hasProperty(ANALYSIS_TYPES, 'errors');
  assert.hasProperty(ANALYSIS_TYPES, 'performance');
  assert.hasProperty(ANALYSIS_TYPES, 'security');
  assert.hasProperty(ANALYSIS_TYPES, 'timeline');
});

logsConfigTests.test('analysis types should have required properties', () => {
  Object.values(ANALYSIS_TYPES).forEach(type => {
    assert.hasProperty(type, 'name');
    assert.hasProperty(type, 'description');
    assert.hasProperty(type, 'instruction');
  });
});

logsConfigTests.test('getAnalysisTypes should return array', () => {
  const types = getAnalysisTypes();
  assert.ok(Array.isArray(types));
  assert.equal(types.length, Object.keys(ANALYSIS_TYPES).length);
});

/**
 * Generate Test Action Config Tests
 */
export const testGenConfigTests = new TestSuite('Generate Test Action Configuration');

testGenConfigTests.test('should have all test frameworks', () => {
  assert.hasProperty(TEST_FRAMEWORKS, 'jest');
  assert.hasProperty(TEST_FRAMEWORKS, 'vitest');
  assert.hasProperty(TEST_FRAMEWORKS, 'mocha');
  assert.hasProperty(TEST_FRAMEWORKS, 'pytest');
  assert.hasProperty(TEST_FRAMEWORKS, 'go');
  assert.hasProperty(TEST_FRAMEWORKS, 'rust');
  assert.hasProperty(TEST_FRAMEWORKS, 'junit');
});

testGenConfigTests.test('test frameworks should have required properties', () => {
  Object.values(TEST_FRAMEWORKS).forEach(framework => {
    assert.hasProperty(framework, 'name');
    assert.hasProperty(framework, 'description');
    assert.hasProperty(framework, 'languages');
    assert.hasProperty(framework, 'extension');
    assert.ok(Array.isArray(framework.languages));
  });
});

testGenConfigTests.test('should have all test types', () => {
  assert.hasProperty(TEST_TYPES, 'unit');
  assert.hasProperty(TEST_TYPES, 'integration');
  assert.hasProperty(TEST_TYPES, 'edge');
  assert.hasProperty(TEST_TYPES, 'snapshot');
});

testGenConfigTests.test('getTestFrameworks should return array', () => {
  const frameworks = getTestFrameworks();
  assert.ok(Array.isArray(frameworks));
  assert.greaterThan(frameworks.length, 0);
});

testGenConfigTests.test('getTestFrameworks should filter by language', () => {
  const jsFrameworks = getTestFrameworks('javascript');
  assert.ok(jsFrameworks.length > 0);

  jsFrameworks.forEach(f => {
    assert.ok(f.languages.includes('javascript'));
  });

  const pyFrameworks = getTestFrameworks('python');
  assert.ok(pyFrameworks.length > 0);

  pyFrameworks.forEach(f => {
    assert.ok(f.languages.includes('python'));
  });
});

testGenConfigTests.test('getTestTypes should return array', () => {
  const types = getTestTypes();
  assert.ok(Array.isArray(types));
  assert.equal(types.length, Object.keys(TEST_TYPES).length);
});

// Export all test suites
export const allSuites = [
  actionResultTests,
  actionContextTests,
  actionManagerTests,
  actionIdsTests,
  explainConfigTests,
  refactorConfigTests,
  convertConfigTests,
  schemaConfigTests,
  logsConfigTests,
  testGenConfigTests,
];

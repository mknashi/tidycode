/**
 * AI Actions Module
 *
 * Exports all AI actions and the action manager.
 */

// Core
export {
  ActionManager,
  ActionResult,
  ActionContext,
  ACTION_IDS,
  actionManager,
} from './ActionManager.js';

// Actions
export {
  explainAction,
  explainActionStream,
  EXPLANATION_LEVELS,
  AUDIENCE_TYPES,
} from './explainAction.js';

export {
  refactorAction,
  refactorActionStream,
  REFACTOR_TYPES,
  getRefactorTypes,
} from './refactorAction.js';

export {
  convertAction,
  SUPPORTED_FORMATS,
  detectFormat,
  getConversionOptions,
  validateFormat,
} from './convertAction.js';

export {
  inferSchemaAction,
  SCHEMA_FORMATS,
  getSchemaFormats,
} from './inferSchemaAction.js';

export {
  summarizeLogsAction,
  summarizeLogsActionStream,
  ANALYSIS_TYPES,
  getAnalysisTypes,
} from './summarizeLogsAction.js';

export {
  generateTestAction,
  generateTestActionStream,
  TEST_FRAMEWORKS,
  TEST_TYPES,
  getTestFrameworks,
  getTestTypes,
} from './generateTestAction.js';

// Default export - the action manager instance
export default actionManager;

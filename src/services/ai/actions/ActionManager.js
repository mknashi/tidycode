/**
 * Action Manager
 *
 * Centralized dispatcher for all AI actions.
 * Manages action registration, execution, and provides a unified interface.
 */

import { providerManager } from '../ProviderManager.js';
import { AI_CAPABILITIES } from '../ProviderInterface.js';

/**
 * Action IDs
 */
export const ACTION_IDS = {
  EXPLAIN: 'explain',
  REFACTOR: 'refactor',
  CONVERT: 'convert',
  INFER_SCHEMA: 'infer-schema',
  SUMMARIZE_LOGS: 'summarize-logs',
  GENERATE_TESTS: 'generate-tests',
  FIX_SYNTAX: 'fix-syntax',
  TRANSFORM_TEXT: 'transform-text',
};

/**
 * Action metadata
 */
export const ACTION_METADATA = {
  [ACTION_IDS.EXPLAIN]: {
    id: ACTION_IDS.EXPLAIN,
    name: 'Explain This',
    description: 'Explain selected code or text',
    capability: AI_CAPABILITIES.EXPLAIN,
    requiresSelection: true,
    icon: 'MessageSquare',
    shortcut: 'Cmd+Shift+E',
  },
  [ACTION_IDS.REFACTOR]: {
    id: ACTION_IDS.REFACTOR,
    name: 'Refactor Selection',
    description: 'Improve or restructure selected code',
    capability: AI_CAPABILITIES.REFACTOR,
    requiresSelection: true,
    icon: 'RefreshCw',
    shortcut: 'Cmd+Shift+R',
    options: ['general', 'performance', 'readability', 'modern'],
  },
  [ACTION_IDS.CONVERT]: {
    id: ACTION_IDS.CONVERT,
    name: 'Convert Format',
    description: 'Convert between JSON, YAML, and XML',
    capability: AI_CAPABILITIES.CONVERT,
    requiresSelection: false,
    icon: 'FileJson',
    options: ['json', 'yaml', 'xml'],
  },
  [ACTION_IDS.INFER_SCHEMA]: {
    id: ACTION_IDS.INFER_SCHEMA,
    name: 'Infer Schema',
    description: 'Generate schema from data',
    capability: AI_CAPABILITIES.INFER_SCHEMA,
    requiresSelection: false,
    icon: 'Database',
    options: ['json-schema', 'typescript', 'zod'],
  },
  [ACTION_IDS.SUMMARIZE_LOGS]: {
    id: ACTION_IDS.SUMMARIZE_LOGS,
    name: 'Summarize Logs',
    description: 'Analyze and summarize log content',
    capability: AI_CAPABILITIES.SUMMARIZE_LOGS,
    requiresSelection: false,
    icon: 'FileText',
    options: ['general', 'errors', 'performance', 'security'],
  },
  [ACTION_IDS.GENERATE_TESTS]: {
    id: ACTION_IDS.GENERATE_TESTS,
    name: 'Generate Tests',
    description: 'Create test boilerplate for code',
    capability: AI_CAPABILITIES.GENERATE_TESTS,
    requiresSelection: true,
    icon: 'TestTube',
    shortcut: 'Cmd+Shift+T',
  },
  [ACTION_IDS.FIX_SYNTAX]: {
    id: ACTION_IDS.FIX_SYNTAX,
    name: 'Fix Syntax',
    description: 'Fix JSON/XML syntax errors',
    capability: AI_CAPABILITIES.FIX_SYNTAX,
    requiresSelection: false,
    icon: 'Wrench',
  },
  [ACTION_IDS.TRANSFORM_TEXT]: {
    id: ACTION_IDS.TRANSFORM_TEXT,
    name: 'Transform Text',
    description: 'Rewrite, summarize, or improve text',
    capability: AI_CAPABILITIES.TRANSFORM_TEXT,
    requiresSelection: true,
    icon: 'Wand',
    options: ['rewrite', 'summarize', 'expand', 'fix-grammar', 'professional'],
  },
};

/**
 * Action result structure
 */
export class ActionResult {
  /**
   * @param {Object} data - Result data
   * @param {string} data.actionId - Action that was executed
   * @param {boolean} data.success - Whether action succeeded
   * @param {string} [data.text] - Generated text/code
   * @param {string} [data.error] - Error message if failed
   * @param {Object} [data.metadata] - Additional metadata
   */
  constructor(data) {
    this.actionId = data.actionId;
    this.success = data.success;
    this.text = data.text || '';
    this.error = data.error || null;
    this.metadata = data.metadata || {};
    this.timestamp = Date.now();
  }

  static success(actionId, text, metadata = {}) {
    return new ActionResult({ actionId, success: true, text, metadata });
  }

  static failure(actionId, error, metadata = {}) {
    return new ActionResult({ actionId, success: false, error, metadata });
  }
}

/**
 * Action context passed to action handlers
 */
export class ActionContext {
  /**
   * @param {Object} data - Context data
   * @param {string} [data.content] - Full document content
   * @param {string} [data.selection] - Selected text
   * @param {string} [data.language] - Programming language
   * @param {string} [data.fileName] - File name
   * @param {number} [data.cursorLine] - Current cursor line
   * @param {Object} [data.errorDetails] - Error details for fix actions
   */
  constructor(data = {}) {
    this.content = data.content || '';
    this.selection = data.selection || '';
    this.language = data.language || '';
    this.fileName = data.fileName || '';
    this.cursorLine = data.cursorLine || 0;
    this.errorDetails = data.errorDetails || null;
  }

  /**
   * Get the text to operate on (selection or full content)
   */
  getText() {
    return this.selection || this.content;
  }

  /**
   * Check if there's a selection
   */
  hasSelection() {
    return this.selection && this.selection.length > 0;
  }
}

/**
 * Action Manager class
 */
export class ActionManager {
  constructor() {
    /**
     * Registered action handlers
     * @type {Map<string, Function>}
     */
    this.actions = new Map();

    /**
     * Action execution history
     * @type {Array<ActionResult>}
     */
    this.history = [];

    /**
     * Maximum history size
     */
    this.maxHistorySize = 50;

    /**
     * Event listeners
     * @type {Map<string, Set<Function>>}
     */
    this._listeners = new Map();
  }

  /**
   * Register an action handler
   * @param {string} actionId - Action ID
   * @param {Function} handler - Action handler function
   */
  registerAction(actionId, handler) {
    this.actions.set(actionId, handler);
  }

  /**
   * Unregister an action
   * @param {string} actionId - Action ID
   */
  unregisterAction(actionId) {
    this.actions.delete(actionId);
  }

  /**
   * Execute an action
   * @param {string} actionId - Action to execute
   * @param {ActionContext|Object} context - Execution context
   * @param {Object} [options] - Action options
   * @returns {Promise<ActionResult>}
   */
  async execute(actionId, context, options = {}) {
    const handler = this.actions.get(actionId);
    if (!handler) {
      return ActionResult.failure(actionId, `Unknown action: ${actionId}`);
    }

    // Check if provider supports this action
    const metadata = ACTION_METADATA[actionId];
    if (metadata?.capability && !providerManager.hasCapability(metadata.capability)) {
      return ActionResult.failure(
        actionId,
        `Current provider does not support: ${metadata.name}`
      );
    }

    // Ensure context is ActionContext
    const ctx = context instanceof ActionContext ? context : new ActionContext(context);

    // Check if selection is required
    if (metadata?.requiresSelection && !ctx.hasSelection()) {
      return ActionResult.failure(actionId, 'This action requires a text selection');
    }

    this._emit('actionStart', { actionId, context: ctx, options });

    try {
      const result = await handler(ctx, options);

      // Ensure result is ActionResult
      const actionResult = result instanceof ActionResult
        ? result
        : ActionResult.success(actionId, result.text || result, result.metadata);

      this._addToHistory(actionResult);
      this._emit('actionComplete', { actionId, result: actionResult });

      return actionResult;
    } catch (error) {
      const errorResult = ActionResult.failure(actionId, error.message);
      this._addToHistory(errorResult);
      this._emit('actionError', { actionId, error });
      return errorResult;
    }
  }

  /**
   * Execute action with streaming
   * @param {string} actionId - Action to execute
   * @param {ActionContext|Object} context - Execution context
   * @param {Function} onChunk - Callback for each chunk
   * @param {Object} [options] - Action options
   * @returns {Promise<ActionResult>}
   */
  async executeStream(actionId, context, onChunk, options = {}) {
    // For now, delegate to execute with streaming option
    return this.execute(actionId, context, { ...options, stream: true, onChunk });
  }

  /**
   * Get available actions based on current provider capabilities
   * @returns {Array<Object>}
   */
  getAvailableActions() {
    return Object.values(ACTION_METADATA).filter(meta => {
      // Check if action is registered
      if (!this.actions.has(meta.id)) return false;

      // Check if provider supports it
      if (meta.capability) {
        return providerManager.hasCapability(meta.capability);
      }

      return true;
    });
  }

  /**
   * Get action metadata
   * @param {string} actionId - Action ID
   * @returns {Object|null}
   */
  getActionMetadata(actionId) {
    return ACTION_METADATA[actionId] || null;
  }

  /**
   * Get action history
   * @param {number} [limit] - Max items to return
   * @returns {Array<ActionResult>}
   */
  getHistory(limit = this.maxHistorySize) {
    return this.history.slice(-limit);
  }

  /**
   * Clear action history
   */
  clearHistory() {
    this.history = [];
    this._emit('historyCleared');
  }

  /**
   * Add result to history
   * @param {ActionResult} result
   * @private
   */
  _addToHistory(result) {
    this.history.push(result);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * Subscribe to events
   * @param {string} event - Event name
   * @param {Function} callback - Event handler
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
    return () => this._listeners.get(event)?.delete(callback);
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {any} data - Event data
   * @private
   */
  _emit(event, data) {
    this._listeners.get(event)?.forEach(cb => {
      try {
        cb(data);
      } catch (error) {
        console.error(`Error in action event handler for "${event}":`, error);
      }
    });
  }
}

/**
 * Singleton instance
 */
export const actionManager = new ActionManager();

export default ActionManager;

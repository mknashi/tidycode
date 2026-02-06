/**
 * useAIActions Hook
 *
 * Encapsulates all AI action state and logic for Phase 3 UI integration.
 * Bridges the existing aiSettings format to the new provider architecture.
 * Supports progressive streaming for actions with streaming variants.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  providerManager,
  actionManager,
  ActionContext,
  ACTION_IDS,
  explainAction,
  refactorAction,
  convertAction,
  inferSchemaAction,
  summarizeLogsAction,
  generateTestAction,
  explainActionStream,
  refactorActionStream,
  summarizeLogsActionStream,
  generateTestActionStream,
  isLocalProvider,
} from '../services/ai/index.js';
import { autoSelectProvider } from '../services/ai/autoSelect.js';

/** Session-level flag so privacy toast only fires once per page load */
let _actionsPrivacyToastShown = false;

/**
 * Register all action handlers with the action manager
 */
function registerActions() {
  actionManager.registerAction(ACTION_IDS.EXPLAIN, explainAction);
  actionManager.registerAction(ACTION_IDS.REFACTOR, refactorAction);
  actionManager.registerAction(ACTION_IDS.CONVERT, convertAction);
  actionManager.registerAction(ACTION_IDS.INFER_SCHEMA, inferSchemaAction);
  actionManager.registerAction(ACTION_IDS.SUMMARIZE_LOGS, summarizeLogsAction);
  actionManager.registerAction(ACTION_IDS.GENERATE_TESTS, generateTestAction);
}

/**
 * Streaming action variants keyed by action ID
 */
const STREAM_ACTIONS = {
  [ACTION_IDS.EXPLAIN]: explainActionStream,
  [ACTION_IDS.REFACTOR]: refactorActionStream,
  [ACTION_IDS.SUMMARIZE_LOGS]: summarizeLogsActionStream,
  [ACTION_IDS.GENERATE_TESTS]: generateTestActionStream,
};

/**
 * Map old aiSettings format to new provider config
 * @param {Object} aiSettings - Existing settings from TidyCode
 * @returns {Object} Config for providerManager.initialize()
 */
function buildProviderConfig(aiSettings) {
  const providers = {};

  if (aiSettings.groqApiKey) {
    providers.groq = {
      apiKey: aiSettings.groqApiKey,
      defaultModel: aiSettings.groqModel,
    };
  }
  if (aiSettings.openaiApiKey) {
    providers.openai = {
      apiKey: aiSettings.openaiApiKey,
      defaultModel: aiSettings.openaiModel,
    };
  }
  if (aiSettings.claudeApiKey) {
    providers.claude = {
      apiKey: aiSettings.claudeApiKey,
      defaultModel: aiSettings.claudeModel,
    };
  }
  if (aiSettings.geminiApiKey) {
    providers.gemini = {
      apiKey: aiSettings.geminiApiKey,
      defaultModel: aiSettings.geminiModel,
    };
  }
  if (aiSettings.mistralApiKey) {
    providers.mistral = {
      apiKey: aiSettings.mistralApiKey,
      defaultModel: aiSettings.mistralModel,
    };
  }
  if (aiSettings.cerebrasApiKey) {
    providers.cerebras = {
      apiKey: aiSettings.cerebrasApiKey,
      defaultModel: aiSettings.cerebrasModel,
    };
  }
  if (aiSettings.sambanovaApiKey) {
    providers.sambanova = {
      apiKey: aiSettings.sambanovaApiKey,
      defaultModel: aiSettings.sambanovaModel,
    };
  }

  // Ollama doesn't require an API key — always register if selected
  if (aiSettings.provider === 'ollama') {
    providers.ollama = {
      defaultModel: aiSettings.ollamaModel,
    };
  }

  // Map old provider name to new provider ID
  const providerMap = {
    groq: 'groq',
    openai: 'openai',
    claude: 'claude',
    gemini: 'gemini',
    mistral: 'mistral',
    cerebras: 'cerebras',
    sambanova: 'sambanova',
    ollama: 'ollama',
  };

  return {
    providers,
    activeProvider: providerMap[aiSettings.provider] || null,
  };
}

/**
 * Custom hook for AI actions integration
 * @param {Object} params
 * @param {Object} params.aiSettings - Current AI settings from TidyCode state
 * @param {Array} params.tabs - All editor tabs
 * @param {number|string} params.activeTabId - Currently active tab ID
 * @param {Function} params.setTabs - Tab state setter
 * @param {Function} params.setActiveTabId - Active tab ID setter
 * @param {Object} params.nextIdRef - Ref for next tab ID
 * @param {Function} [params.showTransientMessage] - Toast notification function
 */
export function useAIActions({
  aiSettings,
  tabs,
  activeTabId,
  setTabs,
  setActiveTabId,
  nextIdRef,
  showTransientMessage,
}) {
  const activeTab = tabs?.find(t => t.id === activeTabId) || null;
  // Provider initialization state
  const [providerInitialized, setProviderInitialized] = useState(false);
  const initializingRef = useRef(false);

  // AI actions menu state
  const [actionsMenuPos, setActionsMenuPos] = useState(null);
  const [selectedText, setSelectedText] = useState('');
  const [selectionRange, setSelectionRange] = useState(null); // { from, to }

  // Action execution state
  const [actionResult, setActionResult] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [lastAction, setLastAction] = useState(null);

  // Streaming state
  const streamingTextRef = useRef('');
  const streamThrottleRef = useRef(null);

  // Results panel state
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [resultsPanelHeight, setResultsPanelHeight] = useState(250);

  // Suggestion state (for refactor/convert)
  const [suggestion, setSuggestion] = useState(null);
  const [showDiff, setShowDiff] = useState(false);

  /**
   * Initialize provider manager from aiSettings
   */
  useEffect(() => {
    const initProvider = async () => {
      if (initializingRef.current) return;
      if (!aiSettings || !aiSettings.provider) return;

      initializingRef.current = true;
      try {
        const config = buildProviderConfig(aiSettings);

        // Only initialize if we have an active provider with credentials
        if (config.activeProvider && Object.keys(config.providers).length > 0) {
          await providerManager.initialize(config);
          providerManager.setPrivacyConfig({
            maxContextChars: aiSettings.maxContextChars || 0,
          });
          registerActions();
          setProviderInitialized(true);
        }
      } catch (error) {
        console.error('Failed to initialize AI provider:', error);
        setProviderInitialized(false);
      } finally {
        initializingRef.current = false;
      }
    };

    initProvider();
  }, [
    aiSettings?.provider,
    aiSettings?.groqApiKey,
    aiSettings?.openaiApiKey,
    aiSettings?.claudeApiKey,
    aiSettings?.geminiApiKey,
    aiSettings?.mistralApiKey,
    aiSettings?.cerebrasApiKey,
    aiSettings?.sambanovaApiKey,
    aiSettings?.ollamaModel,
  ]);

  /**
   * Execute an AI action with streaming when available
   */
  const executeAction = useCallback(
    async (actionId, options = {}, selectionOverride) => {
      if (!providerInitialized) {
        if (showTransientMessage) {
          showTransientMessage('AI provider not configured. Open AI Settings first.', 'error');
        }
        return null;
      }

      // One-time privacy notice for cloud providers
      if (!_actionsPrivacyToastShown && aiSettings?.provider && !isLocalProvider(aiSettings.provider)) {
        _actionsPrivacyToastShown = true;
        showTransientMessage?.(`Content will be sent to ${aiSettings.provider} for processing. Sensitive data (API keys, tokens, passwords) will be detected and blocked automatically.`, 'warn');
      }

      const selection = selectionOverride !== undefined ? selectionOverride : selectedText;

      // Auto-select best provider/model when multiple are available
      try {
        const readyProviders = providerManager.getAvailableProviders().filter(p => p.isReady);
        if (readyProviders.length > 1) {
          const contentLength = (activeTab?.content || '').length + (selection || '').length;
          const best = autoSelectProvider({
            contentLength,
            actionId,
            availableProviders: readyProviders,
          });
          if (best && best.providerId !== providerManager.activeProvider?.id) {
            providerManager.setActiveProvider(best.providerId, best.modelId);
          }
        }
      } catch (autoErr) {
        console.warn('Auto-select provider failed, using current:', autoErr);
      }

      setActionLoading(true);
      setActionError(null);
      setActionResult(null);
      setShowResultsPanel(true);
      setLastAction({ actionId, options });

      const context = new ActionContext({
        content: activeTab?.content || '',
        selection: selection || '',
        language: activeTab?.language || '',
        fileName: activeTab?.title || '',
      });

      // Try streaming variant first
      const streamFn = STREAM_ACTIONS[actionId];
      if (streamFn) {
        return executeWithStreaming(streamFn, actionId, context, options, selection);
      }

      // Fallback to non-streaming execution
      try {
        const result = await actionManager.execute(actionId, context, options);
        setActionResult(result);

        if (!result.success) {
          setActionError(result.error);
        }

        return result;
      } catch (err) {
        if (err.message?.startsWith('PRIVACY_WARNING:')) {
          try {
            const findings = JSON.parse(err.message.slice('PRIVACY_WARNING:'.length));
            const types = [...new Set(findings.map(f => f.type))].join(', ');
            setActionError(`Sensitive data detected (${types}). Review your content before sending to AI.`);
          } catch {
            setActionError('Sensitive data detected in your content. Review before sending.');
          }
        } else {
          setActionError(err.message);
        }
        return null;
      } finally {
        setActionLoading(false);
      }
    },
    [providerInitialized, activeTab, selectedText, selectionRange, showTransientMessage, aiSettings]
  );

  /**
   * Execute an action with progressive streaming
   */
  const executeWithStreaming = useCallback(
    async (streamFn, actionId, context, options, selection) => {
      streamingTextRef.current = '';

      const onChunk = (text, isDone) => {
        if (isDone) return;
        streamingTextRef.current += text;

        // Throttle UI updates to ~60ms to avoid excessive re-renders
        if (!streamThrottleRef.current) {
          streamThrottleRef.current = setTimeout(() => {
            streamThrottleRef.current = null;
            setActionResult({
              actionId,
              text: streamingTextRef.current,
              success: true,
              streaming: true,
            });
          }, 60);
        }
      };

      try {
        const result = await streamFn(context, onChunk, options);

        // Clear any pending throttle and set final result
        if (streamThrottleRef.current) {
          clearTimeout(streamThrottleRef.current);
          streamThrottleRef.current = null;
        }

        setActionResult(result);

        if (!result.success) {
          setActionError(result.error);
        }

        // For refactor, populate suggestion for inline panel
        if (actionId === ACTION_IDS.REFACTOR && result.success) {
          setSuggestion({
            actionId,
            originalCode: selection || activeTab?.content || '',
            suggestedCode: result.text,
            language: context.language,
            metadata: result.metadata,
            selectionRange: selectionRange,
          });
        }

        return result;
      } catch (err) {
        if (streamThrottleRef.current) {
          clearTimeout(streamThrottleRef.current);
          streamThrottleRef.current = null;
        }
        if (err.message?.startsWith('PRIVACY_WARNING:')) {
          try {
            const findings = JSON.parse(err.message.slice('PRIVACY_WARNING:'.length));
            const types = [...new Set(findings.map(f => f.type))].join(', ');
            setActionError(`Sensitive data detected (${types}). Review your content before sending to AI.`);
          } catch {
            setActionError('Sensitive data detected in your content. Review before sending.');
          }
        } else {
          setActionError(err.message);
        }
        return null;
      } finally {
        setActionLoading(false);
        streamingTextRef.current = '';
      }
    },
    [activeTab, selectionRange]
  );

  /**
   * Regenerate the last action
   */
  const regenerate = useCallback(async () => {
    if (!lastAction) return;
    return executeAction(lastAction.actionId, lastAction.options);
  }, [lastAction, executeAction]);

  /**
   * Accept AI suggestion and apply to editor
   */
  const acceptSuggestion = useCallback(
    (content) => {
      if (!activeTab) return;

      // Strip markdown code fences if present (safety net)
      let cleanContent = content;
      if (cleanContent.includes('```')) {
        const match = cleanContent.match(/```(?:\w+)?\n?([\s\S]*?)```/);
        if (match) {
          cleanContent = match[1].trim();
        }
      }

      setTabs((prevTabs) =>
        prevTabs.map((t) => {
          if (t.id !== activeTab.id) return t;

          let newContent = cleanContent;

          // If we have a selection range, splice the new content into the
          // original file at the selection position instead of replacing everything
          const range = suggestion?.selectionRange;
          if (range && range.from != null && range.to != null && t.content) {
            newContent =
              t.content.slice(0, range.from) +
              cleanContent +
              t.content.slice(range.to);
          }

          return { ...t, content: newContent, isModified: true };
        })
      );

      setSuggestion(null);
      setShowResultsPanel(false);
      setActionResult(null);

      if (showTransientMessage) {
        showTransientMessage('AI suggestion applied', 'success');
      }
    },
    [activeTab, setTabs, showTransientMessage, suggestion]
  );

  /**
   * Open AI result in a new tab
   */
  const openInNewTab = useCallback(
    (content, title) => {
      if (!nextIdRef?.current) return;

      const newTabId = nextIdRef.current;
      nextIdRef.current += 1;

      const newTab = {
        id: newTabId,
        title: title || 'AI Result',
        content: content,
        isModified: true,
        filePath: null,
      };

      setTabs((currentTabs) => [...currentTabs, newTab]);
      setActiveTabId(newTabId);
    },
    [setTabs, setActiveTabId, nextIdRef]
  );

  /**
   * Close results panel and clear state
   */
  const closeResults = useCallback(() => {
    setShowResultsPanel(false);
    setActionResult(null);
    setActionError(null);
    setSuggestion(null);
    setShowDiff(false);
  }, []);

  /**
   * Open AI actions menu at a position
   */
  const openActionsMenu = useCallback((position, selection, range) => {
    setSelectedText(selection || '');
    setSelectionRange(range || null);
    setActionsMenuPos(position);
  }, []);

  /**
   * Close AI actions menu
   */
  const closeActionsMenu = useCallback(() => {
    setActionsMenuPos(null);
  }, []);

  return {
    // Provider state
    providerInitialized,

    // Actions menu
    actionsMenuPos,
    selectedText,
    openActionsMenu,
    closeActionsMenu,

    // Action execution
    executeAction,
    regenerate,
    actionResult,
    actionLoading,
    actionError,
    lastAction,

    // Results panel
    showResultsPanel,
    setShowResultsPanel,
    resultsPanelHeight,
    setResultsPanelHeight,

    // Suggestion
    suggestion,
    setSuggestion,
    showDiff,
    setShowDiff,

    // Actions
    acceptSuggestion,
    openInNewTab,
    closeResults,
  };
}

export default useAIActions;

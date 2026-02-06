/**
 * AIResultsPanel Component
 *
 * Resizable panel below the editor that displays results from AI actions.
 * Shows formatted results with action buttons (copy, open in new tab, regenerate, etc.).
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  X,
  Copy,
  Check,
  FileDown,
  RefreshCw,
  GitCompare,
  Sparkles,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { ACTION_IDS } from '../services/ai/actions/ActionManager.js';
import SuggestionDiffView from './SuggestionDiffView.jsx';
import AIProviderSelector from './AIProviderSelector.jsx';

/**
 * Title mapping for action types
 */
const ACTION_TITLES = {
  [ACTION_IDS.EXPLAIN]: 'Explanation',
  [ACTION_IDS.REFACTOR]: 'Refactored Code',
  [ACTION_IDS.CONVERT]: 'Converted Content',
  [ACTION_IDS.INFER_SCHEMA]: 'Generated Schema',
  [ACTION_IDS.SUMMARIZE_LOGS]: 'Log Summary',
  [ACTION_IDS.GENERATE_TESTS]: 'Generated Tests',
};

/**
 * Actions that show a diff toggle
 */
const DIFF_ACTIONS = [ACTION_IDS.REFACTOR];

/**
 * Actions that show accept/apply button (replaces selection in current tab)
 */
const APPLY_ACTIONS = [ACTION_IDS.REFACTOR];

/**
 * Actions that show "open in new tab" in the footer
 */
const NEW_TAB_ACTIONS = [ACTION_IDS.GENERATE_TESTS, ACTION_IDS.INFER_SCHEMA, ACTION_IDS.CONVERT];

export default function AIResultsPanel({
  theme = 'dark',
  result = null,
  isLoading = false,
  error = null,
  originalContent = '',
  onClose,
  onCopy,
  onOpenInNewTab,
  onRegenerate,
  onAccept,
  showDiff = false,
  onToggleDiff,
  height = 250,
  onHeightChange,
  currentProvider = '',
  currentModel = '',
  onProviderChange,
  onModelChange,
  refreshKey = 0,
}) {
  const isDark = theme === 'dark';
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const actionId = result?.actionId || '';
  const title = ACTION_TITLES[actionId] || 'AI Result';
  const canDiff = DIFF_ACTIONS.includes(actionId);
  const canApply = APPLY_ACTIONS.includes(actionId);
  const isNewTab = NEW_TAB_ACTIONS.includes(actionId);

  // Handle copy to clipboard
  const handleCopy = useCallback(async () => {
    if (!result?.text) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onCopy?.();
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [result, onCopy]);

  // Handle open in new tab
  const handleOpenInNewTab = useCallback(() => {
    if (!result?.text) return;
    let suffix = '.txt';
    if (actionId === ACTION_IDS.GENERATE_TESTS) {
      suffix = `.test.${result.metadata?.extension || 'js'}`;
    } else if (actionId === ACTION_IDS.INFER_SCHEMA) {
      suffix = `.schema.${result.metadata?.extension || 'ts'}`;
    } else if (actionId === ACTION_IDS.CONVERT) {
      const ext = result.metadata?.targetFormat || 'txt';
      suffix = `.${ext}`;
    }
    onOpenInNewTab?.(result.text, `AI Result${suffix}`);
  }, [result, actionId, onOpenInNewTab]);

  // Resize drag handling
  const handleDragStart = useCallback(
    (e) => {
      e.preventDefault();
      startYRef.current = e.clientY;
      startHeightRef.current = height;
      dragRef.current = true;

      const handleDragMove = (e) => {
        if (!dragRef.current) return;
        const delta = startYRef.current - e.clientY;
        const newHeight = Math.max(100, Math.min(600, startHeightRef.current + delta));
        onHeightChange?.(newHeight);
      };

      const handleDragEnd = () => {
        dragRef.current = false;
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };

      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
    },
    [height, onHeightChange]
  );

  // Reset copied state when result changes
  useEffect(() => {
    setCopied(false);
  }, [result]);

  // Scroll to top when a new (non-streaming) result arrives; auto-scroll to bottom during streaming
  useEffect(() => {
    if (!scrollRef.current) return;
    if (result?.streaming) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    } else {
      scrollRef.current.scrollTop = 0;
    }
  }, [result]);

  const bgColor = isDark ? 'bg-gray-900' : 'bg-white';
  const borderColor = isDark ? 'border-gray-700' : 'border-gray-200';
  const headerBg = isDark ? 'bg-gray-800' : 'bg-gray-100';
  const textColor = isDark ? 'text-gray-200' : 'text-gray-800';
  const mutedColor = isDark ? 'text-gray-400' : 'text-gray-500';
  const btnClasses = isDark
    ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200';
  const codeBg = isDark ? 'bg-gray-950' : 'bg-gray-50';
  const isStreaming = isLoading && result?.text;

  return (
    <div
      className={`flex flex-col border-t ${borderColor} ${bgColor}`}
      style={{ height }}
    >
      {/* Resize Handle */}
      <div
        className={`h-1 cursor-ns-resize ${isDark ? 'hover:bg-blue-500/30' : 'hover:bg-blue-300/30'}`}
        onMouseDown={handleDragStart}
      />

      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-1.5 border-b ${borderColor} ${headerBg}`}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span className={`text-xs font-medium ${textColor}`}>{title}</span>
          {isLoading && (
            <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
          )}
          {result?.metadata?.analysisType && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'}`}>
              {result.metadata.analysisTypeName || result.metadata.analysisType}
            </span>
          )}
          <AIProviderSelector
            theme={theme}
            currentProvider={currentProvider}
            currentModel={currentModel}
            onProviderChange={onProviderChange}
            onModelChange={onModelChange}
            disabled={isLoading}
            refreshKey={refreshKey}
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1">
          {/* Copy */}
          <button
            onClick={handleCopy}
            disabled={!result?.text || isStreaming}
            className={`p-1 rounded ${btnClasses}`}
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Open in New Tab */}
          <button
            onClick={handleOpenInNewTab}
            disabled={!result?.text || isStreaming}
            className={`p-1 rounded ${btnClasses}`}
            title="Open in new tab"
          >
            <FileDown className="w-3.5 h-3.5" />
          </button>

          {/* Diff Toggle */}
          {canDiff && (
            <button
              onClick={onToggleDiff}
              disabled={!result?.text}
              className={`p-1 rounded ${
                showDiff
                  ? 'text-blue-400 bg-blue-400/10'
                  : btnClasses
              }`}
              title="Toggle diff view"
            >
              <GitCompare className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Regenerate */}
          <button
            onClick={onRegenerate}
            disabled={isLoading}
            className={`p-1 rounded ${btnClasses}`}
            title="Regenerate"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
            />
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className={`p-1 rounded ${btnClasses}`}
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        {/* Error State */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-900/20 text-red-400 text-xs">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{error}</span>
            <button
              onClick={onRegenerate}
              className="ml-auto text-red-300 hover:text-red-200 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && !result && (
          <div className="flex items-center justify-center gap-2 p-8">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            <span className={`text-sm ${mutedColor}`}>Processing...</span>
          </div>
        )}

        {/* Diff View */}
        {showDiff && result?.text && (
          <div className="p-2">
            <SuggestionDiffView
              theme={theme}
              original={originalContent}
              suggested={result.text}
              maxHeight={height - 100}
            />
          </div>
        )}

        {/* Result View */}
        {!showDiff && result?.text && (
          <pre className={`p-3 text-xs leading-5 font-mono whitespace-pre-wrap break-words ${codeBg} ${textColor}`}>
            {result.text}
            {isStreaming && (
              <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle bg-blue-400 animate-pulse rounded-sm" />
            )}
          </pre>
        )}

        {/* Empty State */}
        {!isLoading && !result && !error && (
          <div className={`flex items-center justify-center p-8 text-xs ${mutedColor}`}>
            No results yet. Use the AI Actions menu (⇧⌘A) to get started.
          </div>
        )}
      </div>

      {/* Footer - Action Buttons (hidden while streaming) */}
      {result?.success && !isLoading && (canApply || isNewTab) && (
        <div
          className={`flex items-center justify-end gap-2 px-3 py-2 border-t ${borderColor} ${headerBg}`}
        >
          <button
            onClick={onClose}
            className={`px-3 py-1 text-xs rounded ${
              isDark
                ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200'
            }`}
          >
            Cancel
          </button>

          {canApply && (
            <button
              onClick={() => onAccept?.(result.text)}
              className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500"
            >
              Apply Changes
            </button>
          )}

          {isNewTab && (
            <button
              onClick={handleOpenInNewTab}
              className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500"
            >
              Open in New Tab
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * CodeSuggestionPanel Component
 *
 * Floating panel for displaying AI code suggestions with accept/reject/edit/regenerate.
 * Used for refactor and convert results as an inline overlay.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Check,
  X,
  Edit2,
  RefreshCw,
  GitCompare,
  Copy,
  Loader2,
} from 'lucide-react';
import SuggestionDiffView from './SuggestionDiffView.jsx';

export default function CodeSuggestionPanel({
  theme = 'dark',
  suggestion = null,
  isLoading = false,
  onAccept,
  onReject,
  onEdit,
  onRegenerate,
}) {
  const isDark = theme === 'dark';
  const [isEditing, setIsEditing] = useState(false);
  const [editedCode, setEditedCode] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const [copied, setCopied] = useState(false);
  const editRef = useRef(null);

  // Reset state when suggestion changes
  useEffect(() => {
    if (suggestion) {
      setEditedCode(suggestion.suggestedCode || '');
      setIsEditing(false);
      setShowDiff(false);
      setCopied(false);
    }
  }, [suggestion]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
    }
  }, [isEditing]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!suggestion) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isEditing) {
          setIsEditing(false);
        } else {
          onReject?.();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [suggestion, isEditing, onReject]);

  const handleAccept = useCallback(() => {
    if (isEditing) {
      onEdit?.(editedCode);
    } else {
      onAccept?.();
    }
  }, [isEditing, editedCode, onAccept, onEdit]);

  const handleCopy = useCallback(async () => {
    const text = isEditing ? editedCode : suggestion?.suggestedCode;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [isEditing, editedCode, suggestion]);

  if (!suggestion) return null;

  const bgColor = isDark ? 'bg-gray-800' : 'bg-white';
  const borderColor = isDark ? 'border-gray-700' : 'border-gray-200';
  const textColor = isDark ? 'text-gray-200' : 'text-gray-800';
  const mutedColor = isDark ? 'text-gray-400' : 'text-gray-500';
  const headerBg = isDark ? 'bg-gray-750' : 'bg-gray-50';
  const codeBg = isDark ? 'bg-gray-900' : 'bg-gray-50';
  const btnClasses = isDark
    ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200';

  const actionLabel =
    suggestion.actionId === 'refactor' ? 'Refactored' :
    suggestion.actionId === 'convert' ? 'Converted' :
    'Suggestion';

  return (
    <div
      className={`rounded-lg border shadow-xl overflow-hidden ${borderColor} ${bgColor}`}
      style={{ maxWidth: '600px', maxHeight: '500px' }}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 border-b ${borderColor}`}
      >
        <span className={`text-xs font-medium ${textColor}`}>
          {actionLabel} Code
          {isLoading && (
            <Loader2 className="inline w-3 h-3 ml-1.5 text-blue-400 animate-spin" />
          )}
        </span>

        {/* Header Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className={`p-1 rounded ${btnClasses}`}
            title="Copy"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`p-1 rounded ${
              isEditing ? 'text-blue-400 bg-blue-400/10' : btnClasses
            }`}
            title={isEditing ? 'Stop editing' : 'Edit suggestion'}
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setShowDiff(!showDiff)}
            className={`p-1 rounded ${
              showDiff ? 'text-blue-400 bg-blue-400/10' : btnClasses
            }`}
            title="Toggle diff"
          >
            <GitCompare className="w-3.5 h-3.5" />
          </button>

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
        </div>
      </div>

      {/* Content */}
      <div className="overflow-auto" style={{ maxHeight: '380px' }}>
        {/* Diff View */}
        {showDiff && !isEditing && (
          <div className="p-2">
            <SuggestionDiffView
              theme={theme}
              original={suggestion.originalCode}
              suggested={suggestion.suggestedCode}
              maxHeight={300}
            />
          </div>
        )}

        {/* Edit Mode */}
        {isEditing && (
          <textarea
            ref={editRef}
            value={editedCode}
            onChange={(e) => setEditedCode(e.target.value)}
            className={`w-full p-3 text-xs font-mono leading-5 resize-none border-0 focus:outline-none ${codeBg} ${textColor}`}
            style={{ minHeight: '200px' }}
            spellCheck={false}
          />
        )}

        {/* Code View */}
        {!showDiff && !isEditing && (
          <pre
            className={`p-3 text-xs font-mono leading-5 whitespace-pre-wrap break-words ${codeBg} ${textColor}`}
          >
            {suggestion.suggestedCode}
          </pre>
        )}
      </div>

      {/* Footer */}
      <div
        className={`flex items-center justify-between px-3 py-2 border-t ${borderColor}`}
      >
        <span className={`text-[10px] ${mutedColor}`}>
          {isEditing ? 'Editing • Press Escape to cancel' : 'Press Escape to reject'}
        </span>

        <div className="flex items-center gap-2">
          <button
            onClick={onReject}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded ${
              isDark
                ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200'
            }`}
          >
            <X className="w-3 h-3" />
            Reject
          </button>

          <button
            onClick={handleAccept}
            disabled={isLoading}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
          >
            <Check className="w-3 h-3" />
            {isEditing ? 'Apply Edit' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * AIChatPanel Component
 *
 * Resizable bottom panel for multi-turn AI chat conversations.
 * Supports streaming responses, code block rendering, and file context attachment.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  MessageSquare,
  Loader2,
  X,
  Trash2,
  Send,
  Square,
  FileCode,
  AlertCircle,
  User,
  Bot,
  Copy,
  Check,
  FileDown,
  Play,
  Shield,
} from 'lucide-react';
import AIProviderSelector from './AIProviderSelector.jsx';

/**
 * Render message content with code block detection and per-block actions.
 * Splits on triple-backtick fences; code segments render as <pre> with
 * Copy/Apply/New Tab buttons; text segments render as <p>.
 */
function MessageContent({
  content,
  codeBg,
  textColor,
  showActions = false,
  activeFileName,
  onApplyBlock,
  onOpenInNewTab,
  btnClasses,
  isDark,
}) {
  const [copiedBlock, setCopiedBlock] = useState(null);
  const copyBlockTimerRef = useRef(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (copyBlockTimerRef.current) clearTimeout(copyBlockTimerRef.current);
    };
  }, []);

  if (!content) return null;

  const handleCopyBlock = async (code, blockIdx) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedBlock(blockIdx);
      if (copyBlockTimerRef.current) clearTimeout(copyBlockTimerRef.current);
      copyBlockTimerRef.current = setTimeout(() => {
        copyBlockTimerRef.current = null;
        setCopiedBlock(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy code block:', err);
    }
  };

  // Split by triple-backtick fences (with optional language tag)
  const parts = content.split(/(```[\s\S]*?```)/g);
  let blockIdx = 0;

  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const currentBlockIdx = blockIdx++;
      // Strip fences and extract language tag
      const inner = part.slice(3, -3);
      const newlineIdx = inner.indexOf('\n');
      const lang = newlineIdx >= 0 ? inner.slice(0, newlineIdx).trim() : '';
      const code = newlineIdx >= 0 ? inner.slice(newlineIdx + 1) : inner;

      return (
        <div key={i} className="my-1">
          {lang && (
            <div className={`text-[10px] px-2 py-0.5 rounded-t ${codeBg} ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {lang}
            </div>
          )}
          <pre
            className={`p-2 ${lang ? 'rounded-b' : 'rounded'} text-xs leading-5 font-mono whitespace-pre-wrap break-words ${codeBg}`}
          >
            {code}
          </pre>
          {showActions && code.trim() && (
            <div className="flex items-center gap-1 mt-0.5">
              {/* Copy code block */}
              <button
                onClick={() => handleCopyBlock(code, currentBlockIdx)}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${btnClasses}`}
                title="Copy code"
              >
                {copiedBlock === currentBlockIdx ? (
                  <>
                    <Check className="w-3 h-3 text-green-400" />
                    <span className="text-green-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
              {/* Apply to active file */}
              {activeFileName && onApplyBlock && (
                <button
                  onClick={() => onApplyBlock(code)}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${btnClasses}`}
                  title={`Replace content in ${activeFileName}`}
                >
                  <Play className="w-3 h-3" />
                  <span>Apply to {activeFileName}</span>
                </button>
              )}
              {/* Open in new tab */}
              {onOpenInNewTab && (
                <button
                  onClick={() => {
                    const ext = lang || 'txt';
                    onOpenInNewTab(code, `Chat Code.${ext}`);
                  }}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${btnClasses}`}
                  title="Open in new tab"
                >
                  <FileDown className="w-3 h-3" />
                  <span>New Tab</span>
                </button>
              )}
            </div>
          )}
        </div>
      );
    }

    if (!part.trim()) return null;

    return (
      <p key={i} className={`text-xs leading-5 whitespace-pre-wrap break-words ${textColor}`}>
        {part}
      </p>
    );
  });
}

export default function AIChatPanel({
  theme = 'dark',
  messages = [],
  isStreaming = false,
  error = null,
  onSend,
  onAbort,
  onClear,
  onClose,
  onRetry,
  height = 300,
  onHeightChange,
  activeFileName = '',
  onApplyCode,
  onOpenInNewTab,
  currentProvider = '',
  currentModel = '',
  availableModels = [],
  onProviderChange,
  onModelChange,
  refreshKey = 0,
  providerName = '',
}) {
  const isDark = theme === 'dark';
  const [input, setInput] = useState('');
  const [includeFileContent, setIncludeFileContent] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null); // index of message with copy feedback
  const [copiedAll, setCopiedAll] = useState(false);
  const [showPrivacyConsent, setShowPrivacyConsent] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const dragRef = useRef(null);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const dragCleanupRef = useRef(null);
  const copyTimerRef = useRef(null);
  const copyAllTimerRef = useRef(null);

  // Theme classes (matching AIResultsPanel)
  const bgColor = isDark ? 'bg-gray-900' : 'bg-white';
  const borderColor = isDark ? 'border-gray-700' : 'border-gray-200';
  const headerBg = isDark ? 'bg-gray-800' : 'bg-gray-100';
  const textColor = isDark ? 'text-gray-200' : 'text-gray-800';
  const mutedColor = isDark ? 'text-gray-400' : 'text-gray-500';
  const btnClasses = isDark
    ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200';
  const codeBg = isDark ? 'bg-gray-950' : 'bg-gray-50';

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when panel opens or streaming completes
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isStreaming) {
      inputRef.current?.focus();
    }
  }, [isStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (copyAllTimerRef.current) clearTimeout(copyAllTimerRef.current);
    };
  }, []);

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
        const newHeight = Math.max(150, Math.min(600, startHeightRef.current + delta));
        onHeightChange?.(newHeight);
      };

      const handleDragEnd = () => {
        dragRef.current = false;
        dragCleanupRef.current = null;
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };

      // Store cleanup so unmount can remove listeners
      dragCleanupRef.current = () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };

      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
    },
    [height, onHeightChange]
  );

  // Send message
  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    onSend?.(input.trim(), includeFileContent);
    setInput('');
  }, [input, isStreaming, includeFileContent, onSend]);

  // Handle keyboard in textarea
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Copy a single message
  const handleCopyMessage = useCallback(async (content, index) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        copyTimerRef.current = null;
        setCopiedIndex(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  // Copy entire conversation
  const handleCopyAll = useCallback(async () => {
    const text = messages
      .map((msg) => `${msg.role === 'user' ? 'You' : 'AI'}: ${msg.content}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      if (copyAllTimerRef.current) clearTimeout(copyAllTimerRef.current);
      copyAllTimerRef.current = setTimeout(() => {
        copyAllTimerRef.current = null;
        setCopiedAll(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [messages]);

  const userBubbleBg = isDark ? 'bg-blue-600/20' : 'bg-blue-50';
  const assistantBubbleBg = isDark ? 'bg-gray-800' : 'bg-gray-100';
  const inputBg = isDark ? 'bg-gray-800' : 'bg-gray-50';
  const inputBorder = isDark ? 'border-gray-600' : 'border-gray-300';

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
          <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
          <span className={`text-xs font-medium ${textColor}`}>AI Chat</span>
          <AIProviderSelector
            theme={theme}
            currentProvider={currentProvider}
            currentModel={currentModel}
            onProviderChange={onProviderChange}
            onModelChange={onModelChange}
            disabled={isStreaming}
            refreshKey={refreshKey}
          />
          {isStreaming && (
            <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Copy All */}
          <button
            onClick={handleCopyAll}
            disabled={messages.length === 0 || isStreaming}
            className={`p-1 rounded ${btnClasses}`}
            title="Copy entire conversation"
          >
            {copiedAll ? (
              <Check className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Clear History */}
          <button
            onClick={onClear}
            disabled={messages.length === 0 || isStreaming}
            className={`p-1 rounded ${btnClasses}`}
            title="Clear conversation"
          >
            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Message List */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {/* Empty State */}
        {messages.length === 0 && !error && (
          <div className={`flex items-center justify-center h-full text-xs ${mutedColor}`}>
            Start a conversation. Use ⇧⌘L to toggle this panel.
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          const isLastAssistant =
            !isUser && index === messages.length - 1 && isStreaming;

          return (
            <div
              key={msg.id || index}
              className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {/* Assistant avatar */}
              {!isUser && (
                <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${isDark ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
                  <Bot className="w-3 h-3 text-purple-400" />
                </div>
              )}

              {/* Message bubble */}
              <div className="max-w-[80%]">
                <div
                  className={`rounded-lg px-3 py-2 ${
                    isUser ? userBubbleBg : assistantBubbleBg
                  }`}
                >
                  {isUser ? (
                    <p className={`text-xs leading-5 whitespace-pre-wrap break-words ${textColor}`}>
                      {msg.content}
                    </p>
                  ) : (
                    <>
                      <MessageContent
                        content={msg.content}
                        codeBg={codeBg}
                        textColor={textColor}
                        showActions={!isLastAssistant}
                        activeFileName={activeFileName}
                        onApplyBlock={onApplyCode}
                        onOpenInNewTab={onOpenInNewTab}
                        btnClasses={btnClasses}
                        isDark={isDark}
                      />
                      {isLastAssistant && (
                        <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle bg-blue-400 animate-pulse rounded-sm" />
                      )}
                      {!msg.content && isLastAssistant && (
                        <span className="inline-block w-1.5 h-3.5 bg-blue-400 animate-pulse rounded-sm" />
                      )}
                    </>
                  )}
                </div>
                {/* Copy button below each message */}
                {msg.content && !isLastAssistant && (
                  <div className={`mt-0.5 ${isUser ? 'text-right' : 'text-left'}`}>
                    <button
                      onClick={() => handleCopyMessage(msg.content, index)}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${btnClasses}`}
                      title="Copy message"
                    >
                      {copiedIndex === index ? (
                        <>
                          <Check className="w-3 h-3 text-green-400" />
                          <span className="text-green-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* User avatar */}
              {isUser && (
                <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${isDark ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                  <User className="w-3 h-3 text-blue-400" />
                </div>
              )}
            </div>
          );
        })}

        {/* Error Banner */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded bg-red-900/20 text-red-400 text-xs">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{error}</span>
            {onRetry && (
              <button
                onClick={onRetry}
                className="ml-auto text-red-300 hover:text-red-200 underline flex-shrink-0"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className={`border-t ${borderColor} ${headerBg}`}>
        {/* Context Toggle Row */}
        <div className="flex items-center gap-2 px-3 py-1">
          <button
            onClick={() => {
              if (!includeFileContent) {
                // Turning ON — check privacy consent for non-local providers
                const isLocal = ['ollama', 'tinyllm'].includes(providerName);
                const acknowledged = localStorage.getItem('tidycode-ai-privacy-acknowledged');
                if (!isLocal && !acknowledged) {
                  setShowPrivacyConsent(true);
                  return;
                }
              }
              setIncludeFileContent((prev) => !prev);
            }}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
              includeFileContent
                ? 'bg-blue-400/10 text-blue-400'
                : `${mutedColor} ${isDark ? 'hover:text-gray-300' : 'hover:text-gray-600'}`
            }`}
            title={
              includeFileContent
                ? `File content of "${activeFileName}" will be included`
                : 'Click to include current file content as context'
            }
          >
            <FileCode className="w-3 h-3" />
            <span>
              {includeFileContent && activeFileName
                ? `Include ${activeFileName}`
                : 'Include file'}
            </span>
          </button>
        </div>

        {/* Input Row */}
        <div className="flex items-end gap-2 px-3 pb-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder={isStreaming ? 'Waiting for response...' : 'Ask something... (Enter to send, Shift+Enter for newline)'}
            rows={1}
            className={`flex-1 resize-none rounded px-3 py-1.5 text-xs ${textColor} ${inputBg} border ${inputBorder} focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDark ? 'placeholder:text-gray-400' : 'placeholder:text-gray-500'}`}
            style={{ maxHeight: '96px', minHeight: '32px' }}
            onInput={(e) => {
              // Auto-resize textarea
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px';
            }}
          />

          {/* Send / Stop Button */}
          {isStreaming ? (
            <button
              onClick={onAbort}
              className="flex-shrink-0 p-1.5 rounded bg-red-600 text-white hover:bg-red-500"
              title="Stop generating"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className={`flex-shrink-0 p-1.5 rounded ${
                input.trim()
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : `${isDark ? 'bg-gray-700 text-gray-500' : 'bg-gray-200 text-gray-400'}`
              }`}
              title="Send message"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Privacy Consent Modal */}
      {showPrivacyConsent && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 rounded-lg">
          <div className={`mx-4 p-4 rounded-lg shadow-xl max-w-sm ${
            isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
          }`}>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-5 h-5 text-yellow-500" />
              <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                Privacy Notice
              </h3>
            </div>
            <p className={`text-xs leading-relaxed mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Your file content will be sent to <strong>{providerName || 'the cloud AI provider'}</strong> for
              processing. Code and file contents will leave your device via their API.
            </p>
            <p className={`text-xs mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Sensitive data (API keys, tokens, passwords) is automatically detected and blocked before sending.
              For fully private AI, use Ollama (local) in AI Settings.
            </p>
            <label className={`flex items-center gap-2 mb-4 text-xs cursor-pointer ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="rounded"
              />
              Don&apos;t show this again
            </label>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowPrivacyConsent(false);
                  setDontShowAgain(false);
                }}
                className={`px-3 py-1.5 rounded text-xs ${
                  isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (dontShowAgain) {
                    localStorage.setItem('tidycode-ai-privacy-acknowledged', 'true');
                  }
                  setShowPrivacyConsent(false);
                  setDontShowAgain(false);
                  setIncludeFileContent(true);
                }}
                className="px-3 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-500"
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

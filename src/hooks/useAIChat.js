/**
 * useAIChat Hook
 *
 * Manages multi-turn chat conversation state with streaming support.
 * Uses the existing providerManager.streamChat() infrastructure.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { providerManager, ChatMessage, isLocalProvider } from '../services/ai/index.js';

/** Session-level flag so privacy toast only fires once per page load */
let _privacyToastShown = false;

// ~4 chars per token is a rough estimate for most text
const CHARS_PER_TOKEN = 4;
// Max file content to include in context (characters)
const MAX_FILE_CONTEXT_CHARS = 100000; // ~25K tokens
// Threshold for showing cost warning on cloud providers (characters)
const CLOUD_COST_WARN_CHARS = 20000; // ~5K tokens

/**
 * Estimate token count from character length
 */
function estimateTokens(charCount) {
  return Math.ceil(charCount / CHARS_PER_TOKEN);
}

/**
 * Build a context-aware system prompt
 * @param {Object} activeTab - Current editor tab
 * @param {string} selectedText - Currently selected text
 * @param {boolean} includeFileContent - Whether to include full file content
 * @returns {{ prompt: string, fileContextInfo: { included: boolean, truncated: boolean, originalSize: number, includedSize: number } }}
 */
function buildSystemPrompt(activeTab, selectedText, includeFileContent) {
  let prompt = 'You are a helpful coding assistant integrated into the TidyCode editor.';
  const fileContextInfo = { included: false, truncated: false, originalSize: 0, includedSize: 0 };

  if (activeTab?.title) {
    prompt += `\n\nThe user is currently editing a file named "${activeTab.title}"`;
    if (activeTab.language) {
      prompt += ` (language: ${activeTab.language})`;
    }
    prompt += '.';
  }

  if (includeFileContent && activeTab?.content) {
    let fileContent = activeTab.content;
    fileContextInfo.included = true;
    fileContextInfo.originalSize = fileContent.length;

    if (fileContent.length > MAX_FILE_CONTEXT_CHARS) {
      fileContent = fileContent.slice(0, MAX_FILE_CONTEXT_CHARS);
      fileContextInfo.truncated = true;
    }

    fileContextInfo.includedSize = fileContent.length;

    prompt += `\n\nThe file content has been provided to you below. You have full access to it — analyze it directly. Do NOT say you cannot access files.`;
    if (fileContextInfo.truncated) {
      prompt += ` Note: The file was too large to include in full. Only the first ${Math.round(MAX_FILE_CONTEXT_CHARS / 1000)}K characters are shown.`;
    }
    prompt += `\n\nFile content of "${activeTab.title}":\n\`\`\`\n${fileContent}\n\`\`\``;
  }

  if (selectedText) {
    prompt += `\n\nThe user has the following text selected:\n\`\`\`\n${selectedText}\n\`\`\``;
  }

  return { prompt, fileContextInfo };
}

/**
 * Custom hook for AI chat integration
 * @param {Object} params
 * @param {Object} params.aiSettings - Current AI settings
 * @param {Object} params.activeTab - Currently active tab
 * @param {string} params.selectedText - Currently selected text
 * @param {boolean} params.providerInitialized - Whether provider is ready (from useAIActions)
 * @param {Function} [params.showTransientMessage] - Toast notification function
 * @param {Function} params.setTabs - Tab state setter
 * @param {Function} params.setActiveTabId - Active tab ID setter
 * @param {Object} params.nextIdRef - Ref for next tab ID
 */
export function useAIChat({
  aiSettings,
  activeTab,
  selectedText,
  providerInitialized,
  showTransientMessage,
  setTabs,
  setActiveTabId,
  nextIdRef,
}) {
  // Conversation state
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);

  // Panel state
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [chatPanelHeight, setChatPanelHeight] = useState(300);

  // Message ID counter
  const nextMsgIdRef = useRef(1);

  // Keep a ref in sync with messages so sendMessage always has the latest
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Retry: store last sent message params
  const lastSentRef = useRef(null);

  // Streaming refs
  const abortControllerRef = useRef(null);
  const streamingTextRef = useRef('');
  const streamThrottleRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (streamThrottleRef.current) {
        clearTimeout(streamThrottleRef.current);
      }
    };
  }, []);

  /**
   * Send a message and get a streaming response
   * @param {string} userText - The user's message
   * @param {boolean} includeFileContent - Whether to include full file content in context
   */
  const sendMessage = useCallback(
    async (userText, includeFileContent = false) => {
      if (!userText.trim() || isStreaming) return;

      if (!providerInitialized) {
        showTransientMessage?.('AI provider not configured. Open AI Settings first.', 'error');
        return;
      }

      // One-time privacy notice for cloud providers
      if (!_privacyToastShown && aiSettings?.provider && !isLocalProvider(aiSettings.provider)) {
        _privacyToastShown = true;
        showTransientMessage?.(`Your messages are sent to ${aiSettings.provider} for processing. Sensitive data (API keys, tokens, passwords) will be detected and blocked automatically.`, 'warn');
      }

      // Store for retry
      lastSentRef.current = { userText: userText.trim(), includeFileContent };

      const { prompt: systemPrompt, fileContextInfo } = buildSystemPrompt(activeTab, selectedText, includeFileContent);

      // Warn about large file context
      if (fileContextInfo.included) {
        const isLocal = isLocalProvider(aiSettings?.provider);
        const tokenEstimate = estimateTokens(fileContextInfo.includedSize);

        if (fileContextInfo.truncated) {
          const originalTokens = estimateTokens(fileContextInfo.originalSize);
          showTransientMessage?.(
            `File too large (~${Math.round(originalTokens / 1000)}K tokens). Truncated to ~${Math.round(tokenEstimate / 1000)}K tokens.`,
            'warn'
          );
        } else if (!isLocal && fileContextInfo.originalSize > CLOUD_COST_WARN_CHARS) {
          showTransientMessage?.(
            `Including ~${Math.round(tokenEstimate / 1000)}K tokens of file content. This will increase API costs.`,
            'warn'
          );
        }
      }

      const userMsg = { ...ChatMessage.user(userText.trim()), id: nextMsgIdRef.current++ };
      const assistantPlaceholder = { ...ChatMessage.assistant(''), id: nextMsgIdRef.current++ };

      // Build API messages from the ref (always up-to-date) before updating state
      const currentMessages = messagesRef.current;
      const apiMessages = [
        ChatMessage.system(systemPrompt),
        ...currentMessages,
        userMsg,
      ];
      setMessages([...currentMessages, userMsg, assistantPlaceholder]);

      setIsStreaming(true);
      setError(null);
      streamingTextRef.current = '';

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const onChunk = (text, done) => {
        if (done) return;
        streamingTextRef.current += text;

        // Throttle UI updates to ~60ms
        if (!streamThrottleRef.current) {
          streamThrottleRef.current = setTimeout(() => {
            streamThrottleRef.current = null;
            const currentText = streamingTextRef.current;
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = { ...last, content: currentText };
              return copy;
            });
          }, 60);
        }
      };

      try {
        const result = await providerManager.streamChat(apiMessages, onChunk, {
          signal: abortController.signal,
        });

        // Clear any pending throttle and set final text
        if (streamThrottleRef.current) {
          clearTimeout(streamThrottleRef.current);
          streamThrottleRef.current = null;
        }

        const finalText = result?.text || streamingTextRef.current;
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = { ...last, content: finalText };
          return copy;
        });
      } catch (err) {
        // Clear any pending throttle
        if (streamThrottleRef.current) {
          clearTimeout(streamThrottleRef.current);
          streamThrottleRef.current = null;
        }

        if (err.name === 'AbortError') {
          // Keep partial text on abort
          const partialText = streamingTextRef.current;
          if (partialText) {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = { ...last, content: partialText + '\n\n_(response cancelled)_' };
              return copy;
            });
          } else {
            // Remove empty placeholder
            setMessages((prev) => prev.slice(0, -1));
          }
        } else if (err.message?.startsWith('PRIVACY_WARNING:')) {
          // Sensitive data detected by privacy guard
          try {
            const findings = JSON.parse(err.message.slice('PRIVACY_WARNING:'.length));
            const types = [...new Set(findings.map(f => f.type))].join(', ');
            showTransientMessage?.(`Sensitive data detected (${types}). Review your content before sending.`, 'warn');
          } catch {
            showTransientMessage?.('Sensitive data detected in your content. Review before sending.', 'warn');
          }
          // Remove empty placeholder
          setMessages((prev) => prev.slice(0, -1));
        } else {
          setError(err.message);
          // Remove empty placeholder on error
          setMessages((prev) => prev.slice(0, -1));
        }
      } finally {
        setIsStreaming(false);
        streamingTextRef.current = '';
        abortControllerRef.current = null;
      }
    },
    [isStreaming, providerInitialized, activeTab, selectedText, showTransientMessage, aiSettings]
  );

  /**
   * Abort the current streaming response
   */
  const abortResponse = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  /**
   * Clear conversation history
   */
  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  /**
   * Retry the last failed message
   */
  const retryLastMessage = useCallback(() => {
    if (!lastSentRef.current) return;
    const { userText, includeFileContent } = lastSentRef.current;
    // Remove the failed user message so sendMessage re-adds it
    setMessages((prev) => {
      // Find and remove the last user message (the one that failed)
      const lastUserIdx = prev.findLastIndex((m) => m.role === 'user');
      if (lastUserIdx >= 0) {
        return [...prev.slice(0, lastUserIdx), ...prev.slice(lastUserIdx + 1)];
      }
      return prev;
    });
    setError(null);
    sendMessage(userText, includeFileContent);
  }, [sendMessage]);

  /**
   * Apply a code block to the active editor tab (replaces full content)
   */
  const applyCodeToEditor = useCallback(
    (code) => {
      if (!activeTab) {
        showTransientMessage?.('No file open to apply code to.', 'error');
        return;
      }
      setTabs((prevTabs) =>
        prevTabs.map((t) => {
          if (t.id !== activeTab.id) return t;
          return { ...t, content: code, isModified: true };
        })
      );
      showTransientMessage?.(`Code applied to ${activeTab.title}`, 'success');
    },
    [activeTab, setTabs, showTransientMessage]
  );

  /**
   * Open a code block in a new editor tab
   */
  const openCodeInNewTab = useCallback(
    (code, title) => {
      if (!nextIdRef?.current) return;
      const newTabId = nextIdRef.current;
      nextIdRef.current += 1;

      const newTab = {
        id: newTabId,
        title: title || 'Chat Code',
        content: code,
        isModified: true,
        filePath: null,
      };

      setTabs((currentTabs) => [...currentTabs, newTab]);
      setActiveTabId(newTabId);
    },
    [setTabs, setActiveTabId, nextIdRef]
  );

  return {
    // Conversation
    messages,
    isStreaming,
    error,

    // Panel
    showChatPanel,
    setShowChatPanel,
    chatPanelHeight,
    setChatPanelHeight,

    // Actions
    sendMessage,
    abortResponse,
    clearHistory,
    retryLastMessage,
    applyCodeToEditor,
    openCodeInNewTab,

    // Context info
    activeFileName: activeTab?.title || '',
  };
}

export default useAIChat;

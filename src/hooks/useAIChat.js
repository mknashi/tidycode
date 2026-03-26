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
// Context compacting thresholds (in characters)
const COMPACTION_THRESHOLD_CHARS = 80000; // ~20K tokens — trigger compaction
const COMPACTION_KEEP_RECENT = 6; // Keep the last N messages verbatim

/**
 * Estimate token count from character length
 */
function estimateTokens(charCount) {
  return Math.ceil(charCount / CHARS_PER_TOKEN);
}

/**
 * Compact older conversation messages into a summary to stay within context limits.
 * Keeps the most recent messages verbatim and replaces older ones with a condensed summary.
 * @param {Array} messages - Full message history (user/assistant, no system)
 * @returns {{ compacted: Array, wasCompacted: boolean }}
 */
function compactConversation(messages) {
  const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  if (totalChars <= COMPACTION_THRESHOLD_CHARS || messages.length <= COMPACTION_KEEP_RECENT) {
    return { compacted: messages, wasCompacted: false };
  }

  const keepCount = Math.min(COMPACTION_KEEP_RECENT, messages.length);
  const olderMessages = messages.slice(0, messages.length - keepCount);
  const recentMessages = messages.slice(messages.length - keepCount);

  // Build a brief summary of older messages
  const summaryParts = [];
  for (const msg of olderMessages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    // Truncate each older message to keep summary compact
    const truncated = msg.content?.length > 300
      ? msg.content.slice(0, 300) + '...'
      : msg.content || '';
    summaryParts.push(`${role}: ${truncated}`);
  }

  const summaryMsg = {
    role: 'assistant',
    content: `[Previous conversation summary — ${olderMessages.length} messages compacted]\n\n${summaryParts.join('\n\n')}`,
    id: -1,
  };

  return { compacted: [summaryMsg, ...recentMessages], wasCompacted: true };
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
// localStorage key for chat session history
const CHAT_SESSIONS_KEY = 'tidycode-chat-sessions';
const MAX_SAVED_SESSIONS = 20;

/**
 * Load saved chat sessions from localStorage
 * @returns {Array<{ id: string, title: string, messages: Array, createdAt: string, updatedAt: string }>}
 */
function loadSessions() {
  try {
    const raw = localStorage.getItem(CHAT_SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Persist chat sessions to localStorage
 */
function saveSessions(sessions) {
  try {
    localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(sessions.slice(0, MAX_SAVED_SESSIONS)));
  } catch {
    // localStorage may be full — silently fail
  }
}

/**
 * Derive a short title from the first user message
 */
function deriveSessionTitle(messages) {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser?.content) return 'New Chat';
  const text = firstUser.content.trim();
  return text.length > 50 ? text.slice(0, 50) + '...' : text;
}

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

  // Session management
  const [sessions, setSessions] = useState(() => loadSessions());
  const [activeSessionId, setActiveSessionId] = useState(null);

  // Message ID counter
  const nextMsgIdRef = useRef(1);

  // Keep a ref in sync with messages so sendMessage always has the latest
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Auto-save current session when messages change
  useEffect(() => {
    if (!activeSessionId || messages.length === 0) return;
    setSessions(prev => {
      const updated = prev.map(s =>
        s.id === activeSessionId
          ? { ...s, messages, title: deriveSessionTitle(messages), updatedAt: new Date().toISOString() }
          : s
      );
      saveSessions(updated);
      return updated;
    });
  }, [messages, activeSessionId]);

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
    async (userText, includeFileContent = false, images = []) => {
      if ((!userText.trim() && images.length === 0) || isStreaming) return;

      if (!providerInitialized) {
        showTransientMessage?.('AI provider not configured. Open AI Settings first.', 'error');
        return;
      }

      // Auto-create a session if none is active
      if (!activeSessionId) {
        const newId = `session-${Date.now()}`;
        const session = {
          id: newId,
          title: 'New Chat',
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setSessions(prev => {
          const updated = [session, ...prev].slice(0, MAX_SAVED_SESSIONS);
          saveSessions(updated);
          return updated;
        });
        setActiveSessionId(newId);
      }

      // One-time privacy notice for cloud providers
      if (!_privacyToastShown && aiSettings?.provider && !isLocalProvider(aiSettings.provider)) {
        _privacyToastShown = true;
        showTransientMessage?.(`Your messages are sent to ${aiSettings.provider} for processing. Sensitive data (API keys, tokens, passwords) will be detected and blocked automatically.`, 'warn');
      }

      // Store for retry
      lastSentRef.current = { userText: userText.trim(), includeFileContent, images };

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

      const userMsg = {
        ...ChatMessage.user(userText.trim() || '(image attached)'),
        id: nextMsgIdRef.current++,
        images: images.length > 0 ? images : undefined,
      };
      const assistantPlaceholder = { ...ChatMessage.assistant(''), id: nextMsgIdRef.current++ };

      // Build API messages from the ref (always up-to-date) before updating state
      const currentMessages = messagesRef.current;

      // Compact older messages if conversation is getting long
      const { compacted, wasCompacted } = compactConversation([...currentMessages, userMsg]);
      if (wasCompacted) {
        showTransientMessage?.('Context compacted to fit within model limits.', 'info');
      }

      // Build API messages, converting images to multimodal content format
      const apiMessages = [
        ChatMessage.system(systemPrompt),
        ...compacted.map(msg => {
          if (msg.images && msg.images.length > 0) {
            // Convert to multimodal content array for vision APIs
            const contentParts = [];
            for (const img of msg.images) {
              const base64Data = img.dataUrl.split(',')[1];
              contentParts.push({
                type: 'image_url',
                image_url: { url: img.dataUrl },
                // Also include source format for Claude API
                _anthropic: {
                  type: 'image',
                  source: { type: 'base64', media_type: img.type || 'image/png', data: base64Data },
                },
              });
            }
            if (msg.content && msg.content !== '(image attached)') {
              contentParts.push({ type: 'text', text: msg.content });
            }
            return { ...msg, content: contentParts };
          }
          return msg;
        }),
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
    [isStreaming, providerInitialized, activeTab, selectedText, showTransientMessage, aiSettings, activeSessionId]
  );

  /**
   * Abort the current streaming response
   */
  const abortResponse = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  /**
   * Start a new chat session (saves current one if it has messages)
   */
  const newSession = useCallback(() => {
    // Save current session if it has content
    if (messages.length > 0 && activeSessionId) {
      setSessions(prev => {
        const updated = prev.map(s =>
          s.id === activeSessionId
            ? { ...s, messages, title: deriveSessionTitle(messages), updatedAt: new Date().toISOString() }
            : s
        );
        saveSessions(updated);
        return updated;
      });
    }

    const newId = `session-${Date.now()}`;
    const session = {
      id: newId,
      title: 'New Chat',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setSessions(prev => {
      const updated = [session, ...prev].slice(0, MAX_SAVED_SESSIONS);
      saveSessions(updated);
      return updated;
    });
    setActiveSessionId(newId);
    setMessages([]);
    setError(null);
    nextMsgIdRef.current = 1;
  }, [messages, activeSessionId]);

  /**
   * Clear conversation history (alias that also resets session)
   */
  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
    setActiveSessionId(null);
    nextMsgIdRef.current = 1;
  }, []);

  /**
   * Load a previously saved session
   */
  const loadSession = useCallback((sessionId) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    // Save current session first
    if (messages.length > 0 && activeSessionId) {
      setSessions(prev => {
        const updated = prev.map(s =>
          s.id === activeSessionId
            ? { ...s, messages, title: deriveSessionTitle(messages), updatedAt: new Date().toISOString() }
            : s
        );
        saveSessions(updated);
        return updated;
      });
    }

    setActiveSessionId(sessionId);
    setMessages(session.messages || []);
    setError(null);
    nextMsgIdRef.current = Math.max(1, ...(session.messages || []).map(m => (m.id || 0) + 1));
  }, [sessions, messages, activeSessionId]);

  /**
   * Delete a saved session
   */
  const deleteSession = useCallback((sessionId) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== sessionId);
      saveSessions(updated);
      return updated;
    });
    // If we deleted the active session, clear the chat
    if (sessionId === activeSessionId) {
      setMessages([]);
      setError(null);
      setActiveSessionId(null);
    }
  }, [activeSessionId]);

  /**
   * Retry the last failed message
   */
  const retryLastMessage = useCallback(() => {
    if (!lastSentRef.current) return;
    const { userText, includeFileContent, images } = lastSentRef.current;
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
    sendMessage(userText, includeFileContent, images || []);
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

    // Session management
    sessions,
    activeSessionId,
    newSession,
    loadSession,
    deleteSession,

    // Context info
    activeFileName: activeTab?.title || '',
  };
}

export default useAIChat;

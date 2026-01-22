/**
 * AI-powered intelligent code completion service
 * Provides context-aware suggestions using AI models (Groq, OpenAI, Claude)
 */

import { AI_PROVIDERS, GROQ_MODELS, OPENAI_MODELS, CLAUDE_MODELS } from '../../services/AIService';

class AICompletionService {
  constructor() {
    this.cache = new Map(); // Cache for completion results
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.pendingRequests = new Map(); // Track pending requests to avoid duplicates
    this.enabled = false; // AI completions disabled by default
    this.settings = null;
  }

  /**
   * Initialize AI completion service with settings
   */
  initialize(settings) {
    if (!settings) return;

    this.enabled = settings.enableAICompletions || false;
    this.settings = settings;
  }

  /**
   * Check if AI completions are enabled and configured
   */
  isEnabled() {
    if (!this.enabled || !this.settings) return false;

    const { provider, groqApiKey, openaiApiKey, claudeApiKey } = this.settings;

    // Check if provider has API key
    if (provider === AI_PROVIDERS.GROQ && !groqApiKey) return false;
    if (provider === AI_PROVIDERS.OPENAI && !openaiApiKey) return false;
    if (provider === 'claude' && !claudeApiKey) return false;

    return true;
  }

  /**
   * Extract context around cursor position
   */
  extractContext(doc, pos, maxLines = 20) {
    const line = doc.lineAt(pos);
    const lineNumber = doc.lines;
    const currentLineNum = line.number;

    // Get lines before cursor (up to maxLines)
    const startLine = Math.max(1, currentLineNum - maxLines);
    const endLine = Math.min(lineNumber, currentLineNum + Math.floor(maxLines / 4));

    let beforeContext = '';
    let afterContext = '';

    // Get lines before with bounds checking
    for (let i = startLine; i < currentLineNum; i++) {
      // Validate line number is within document bounds
      if (i >= 1 && i <= lineNumber) {
        try {
          const l = doc.line(i);
          beforeContext += l.text + '\n';
        } catch (error) {
          console.warn(`[AI Completion] Failed to read line ${i}:`, error);
          break;
        }
      }
    }

    // Get current line up to cursor
    const currentLineText = line.text;
    const posInLine = pos - line.from;
    beforeContext += currentLineText.substring(0, posInLine);

    // Get rest of current line
    afterContext = currentLineText.substring(posInLine);

    // Get a few lines after with bounds checking
    for (let i = currentLineNum + 1; i <= endLine; i++) {
      // Validate line number is within document bounds
      if (i >= 1 && i <= lineNumber) {
        try {
          const l = doc.line(i);
          afterContext += '\n' + l.text;
        } catch (error) {
          console.warn(`[AI Completion] Failed to read line ${i}:`, error);
          break;
        }
      }
    }

    return {
      before: beforeContext.trim(),
      after: afterContext.trim(),
      currentLine: currentLineText,
      posInLine
    };
  }

  /**
   * Build AI completion prompt
   */
  buildPrompt(context, language) {
    const { before, after } = context;

    return `You are an expert ${language} code completion assistant. Given the code context, suggest the next 1-3 words that would logically complete the current line.

Instructions:
1. Only suggest code completions, not explanations
2. Keep suggestions short (1-3 words max)
3. Return only valid ${language} code
4. If multiple options exist, return the most common/likely one
5. Return ONLY the completion text, nothing else

Code before cursor:
\`\`\`${language}
${before}
\`\`\`

Code after cursor:
\`\`\`${language}
${after}
\`\`\`

Completion (1-3 words only):`;
  }

  /**
   * Generate cache key
   */
  getCacheKey(context, language) {
    const key = `${language}:${context.before.slice(-200)}:${context.after.slice(0, 50)}`;
    return key;
  }

  /**
   * Get completion from Groq
   */
  async getGroqCompletion(prompt, apiKey, model) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a code completion assistant. Return only the completion text, no explanations or markdown.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 50, // Keep completions short
        top_p: 0.9
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || '';
  }

  /**
   * Get completion from OpenAI
   */
  async getOpenAICompletion(prompt, apiKey, model) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a code completion assistant. Return only the completion text, no explanations or markdown.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 50,
        top_p: 0.9
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || '';
  }

  /**
   * Get completion from Claude (via Tauri backend to avoid CORS)
   */
  async getClaudeCompletion(prompt, apiKey, model) {
    // Check if running in Tauri - try multiple API paths
    const tauriPresence = {
      hasTauri: !!window.__TAURI__,
      hasTauriInvoke: !!window.__TAURI_INVOKE__,
      hasCore: !!window.__TAURI__?.core,
      hasInvoke: !!window.__TAURI__?.core?.invoke,
      hasInternals: !!window.__TAURI_INTERNALS__
    };
    console.log('[aiCompletionService] Checking for Tauri:', tauriPresence);

    // Try different Tauri API paths (varies by version)
    let invoke = window.__TAURI__?.core?.invoke ||
                 window.__TAURI__?.tauri?.invoke ||
                 window.__TAURI__?.invoke ||
                 window.__TAURI_INVOKE__;

    // Fallback: if Tauri internals are present but no invoke is on window yet, dynamically import it
    if (!invoke && tauriPresence.hasInternals) {
      try {
        const tauriCore = await import('@tauri-apps/api/core');
        invoke = tauriCore?.invoke;
        console.log('[aiCompletionService] Loaded invoke via @tauri-apps/api/core');
      } catch (error) {
        console.warn('[aiCompletionService] Failed to load @tauri-apps/api/core invoke', error);
      }
    }

    if (typeof invoke === 'function') {
      console.log('[aiCompletionService] Found Tauri invoke function, calling get_claude_completion');
      try {
        const result = await invoke('get_claude_completion', {
          prompt,
          apiKey,
          model
        });
        console.log('[aiCompletionService] Claude completion result:', result?.substring(0, 50));
        return result;
      } catch (error) {
        console.error('[aiCompletionService] Claude API error:', error);
        throw new Error(`Claude API error: ${error}`);
      }
    }

    // Browser fallback - will likely fail due to CORS
    console.error('[aiCompletionService] Tauri not detected, cannot call Claude API');
    throw new Error('Claude API requires desktop app due to browser CORS restrictions');
  }

  /**
   * Get AI-powered completion suggestions
   */
  async getSuggestions(doc, pos, language) {
    if (!this.isEnabled()) {
      return [];
    }

    // Extract context
    const context = this.extractContext(doc, pos);

    // Don't suggest if we're at the beginning or in whitespace only
    if (!context.before.trim() || context.before.trim().length < 3) {
      return [];
    }

    // Check cache
    const cacheKey = this.getCacheKey(context, language);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.suggestions;
    }

    // Check if request already pending
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    // Create promise for this request
    const requestPromise = this._fetchSuggestions(context, language, cacheKey);
    this.pendingRequests.set(cacheKey, requestPromise);

    try {
      const suggestions = await requestPromise;
      return suggestions;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Internal method to fetch suggestions
   */
  async _fetchSuggestions(context, language, cacheKey) {
    const { provider, groqApiKey, groqModel, openaiApiKey, openaiModel, claudeApiKey, claudeModel } = this.settings;

    try {
      const prompt = this.buildPrompt(context, language);
      let completionText = '';

      // Get completion from appropriate provider
      if (provider === AI_PROVIDERS.GROQ) {
        completionText = await this.getGroqCompletion(
          prompt,
          groqApiKey,
          groqModel || GROQ_MODELS['llama-3.3-70b'].id
        );
      } else if (provider === AI_PROVIDERS.OPENAI) {
        completionText = await this.getOpenAICompletion(
          prompt,
          openaiApiKey,
          openaiModel || OPENAI_MODELS['gpt-4o-mini'].id
        );
      } else if (provider === 'claude') {
        completionText = await this.getClaudeCompletion(
          prompt,
          claudeApiKey,
          claudeModel || CLAUDE_MODELS['claude-3-5-haiku'].id
        );
      }

      // Clean up completion text
      completionText = this._cleanCompletion(completionText);

      // Create suggestions
      const suggestions = completionText ? [{
        label: completionText,
        type: 'ai',
        detail: 'AI suggestion',
        info: `Powered by ${provider.toUpperCase()}`,
        boost: 100 // High priority for AI suggestions
      }] : [];

      // Cache results
      this.cache.set(cacheKey, {
        suggestions,
        timestamp: Date.now()
      });

      // Clean old cache entries
      this._cleanCache();

      return suggestions;
    } catch (error) {
      console.error('AI completion error:', error);
      return [];
    }
  }

  /**
   * Clean completion text
   */
  _cleanCompletion(text) {
    if (!text) return '';

    // Remove markdown code blocks
    text = text.replace(/```[\s\S]*?```/g, '');
    text = text.replace(/`([^`]+)`/g, '$1');

    // Remove common prefixes
    text = text.replace(/^(completion:|suggestion:|next:)\s*/i, '');

    // Trim and limit to reasonable length
    text = text.trim();
    if (text.length > 50) {
      // Take first logical chunk (up to first space after 30 chars)
      const spaceIdx = text.indexOf(' ', 30);
      if (spaceIdx > 0) {
        text = text.substring(0, spaceIdx);
      } else {
        text = text.substring(0, 50);
      }
    }

    return text;
  }

  /**
   * Clean old cache entries
   */
  _cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cached completions
   */
  clearCache() {
    this.cache.clear();
    this.pendingRequests.clear();
  }

  /**
   * Update settings
   */
  updateSettings(settings) {
    this.initialize(settings);
    this.clearCache(); // Clear cache when settings change
  }
}

// Export singleton instance
export const aiCompletionService = new AICompletionService();

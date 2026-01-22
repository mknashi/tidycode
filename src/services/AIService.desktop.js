import { invoke } from '@tauri-apps/api/core';
import { AI_PROVIDERS, GROQ_MODELS, OPENAI_MODELS, CLAUDE_MODELS } from './AIService.js';

/**
 * Desktop AI Service supporting both Ollama (local) and cloud providers
 */

// Available Ollama models for desktop
export const OLLAMA_MODELS = {
  'llama3.1:8b': {
    id: 'llama3.1:8b',
    name: 'Llama 3.1 8B',
    size: '4.7 GB',
    speed: 'Fast',
    description: 'Best for large files (128K context)'
  },
  'qwen2.5-coder:7b': {
    id: 'qwen2.5-coder:7b',
    name: 'Qwen2.5 Coder 7B',
    size: '4.7 GB',
    speed: 'Medium',
    description: 'High quality code generation'
  },
  'qwen2.5-coder:3b': {
    id: 'qwen2.5-coder:3b',
    name: 'Qwen2.5 Coder 3B',
    size: '2 GB',
    speed: 'Fast',
    description: 'Balanced performance'
  },
  'qwen2.5-coder:1.5b': {
    id: 'qwen2.5-coder:1.5b',
    name: 'Qwen2.5 Coder 1.5B',
    size: '1 GB',
    speed: 'Very Fast',
    description: 'Fast, small files only'
  },
  'deepseek-r1:8b': {
    id: 'deepseek-r1:8b',
    name: 'DeepSeek R1 8B',
    size: '4.9 GB',
    speed: 'Medium',
    description: 'Reasoning model (not for large files)'
  },
  'codellama:7b': {
    id: 'codellama:7b',
    name: 'CodeLlama 7B',
    size: '3.8 GB',
    speed: 'Medium',
    description: 'Meta\'s code model'
  },
  'llama3.2:3b': {
    id: 'llama3.2:3b',
    name: 'Llama 3.2 3B',
    size: '2 GB',
    speed: 'Fast',
    description: 'General purpose'
  }
};

export { GROQ_MODELS, OPENAI_MODELS, CLAUDE_MODELS };

export class DesktopAIService {
  constructor() {
    this.ollamaAvailable = null;
    this.availableModels = [];
    this.tinyLLMEngine = null; // For TinyLLM support
  }

  /**
   * Check if Ollama is installed and running
   */
  async checkOllamaStatus() {
    try {
      const status = await invoke('check_ollama_status');
      this.ollamaAvailable = status.available;
      this.availableModels = status.models || [];
      return status;
    } catch (error) {
      console.error('Failed to check Ollama status:', error);
      return {
        available: false,
        error: error.toString(),
        models: []
      };
    }
  }

  /**
   * Check if a specific model is available locally
   */
  async isModelAvailable(modelId) {
    try {
      return await invoke('check_model_available', { model: modelId });
    } catch (error) {
      console.error(`Failed to check model ${modelId}:`, error);
      return false;
    }
  }

  /**
   * Pull/download an Ollama model
   */
  async pullModel(modelId, onProgress) {
    try {
      if (onProgress) {
        onProgress({
          progress: 0,
          text: `Downloading ${modelId}...`,
          timeElapsed: 0
        });
      }

      const result = await invoke('pull_ollama_model', { model: modelId });

      if (onProgress) {
        onProgress({
          progress: 100,
          text: 'Model downloaded successfully',
          timeElapsed: 0
        });
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to pull model: ${error}`);
    }
  }

  /**
   * Get list of downloaded models
   */
  async getDownloadedModels() {
    const status = await this.checkOllamaStatus();
    return status.models || [];
  }

  /**
   * Build prompt for fixing errors
   */
  buildFixPrompt(content, errorDetails) {
    const errorList = errorDetails.allErrors
      ?.map(e => `Line ${e.line}: ${e.message}`)
      .join('\n') || errorDetails.message;

    return `You are a ${errorDetails.type} syntax error fixer. Your task is to fix ONLY the syntax errors in the provided content.

Errors found:
${errorList}

Content to fix:
${content}

Instructions:
1. Fix ONLY the syntax errors listed above
2. Preserve all data and structure
3. Do not add explanations or comments
4. Return ONLY the complete corrected ${errorDetails.type}
5. Ensure the output is valid ${errorDetails.type}

Fixed ${errorDetails.type}:`;
  }

  /**
   * Fix with Ollama (local)
   */
  async fixWithOllama(content, errorDetails, modelId, onProgress) {
    // Check if model is available
    const isAvailable = await this.isModelAvailable(modelId);
    if (!isAvailable) {
      throw new Error(
        `Model ${modelId} not found. Please download it first from AI Settings.`
      );
    }

    try {
      if (onProgress) {
        onProgress({
          progress: 50,
          text: 'Processing with Ollama...',
          timeElapsed: 0
        });
      }

      // Invoke Rust backend to fix with Ollama
      const fixed = await invoke('fix_with_ollama', {
        content,
        errorDetails: JSON.stringify(errorDetails),
        model: modelId
      });

      if (onProgress) {
        onProgress({
          progress: 100,
          text: 'Fixed successfully',
          timeElapsed: 0
        });
      }

      return fixed.trim();
    } catch (error) {
      throw new Error(`Ollama fix failed: ${error}`);
    }
  }

  /**
   * Extract complete JSON/XML content intelligently
   */
  extractContent(text, errorType) {
    const trimmed = text.trim();

    if (errorType === 'JSON') {
      // Find first { or [
      const startMatch = trimmed.match(/[{\[]/);
      if (!startMatch) return trimmed;

      const startIdx = startMatch.index;
      const startChar = startMatch[0];
      const endChar = startChar === '{' ? '}' : ']';

      // Find matching closing brace
      let depth = 0;
      let endIdx = startIdx;
      for (let i = startIdx; i < trimmed.length; i++) {
        if (trimmed[i] === startChar) depth++;
        else if (trimmed[i] === endChar) {
          depth--;
          if (depth === 0) {
            endIdx = i + 1;
            break;
          }
        }
      }

      if (endIdx > startIdx) {
        return trimmed.substring(startIdx, endIdx);
      }
    } else if (errorType === 'XML') {
      // For XML, find first < and last >
      const firstTag = trimmed.indexOf('<');
      const lastTag = trimmed.lastIndexOf('>');
      if (firstTag !== -1 && lastTag !== -1 && lastTag > firstTag) {
        return trimmed.substring(firstTag, lastTag + 1);
      }
    }

    return trimmed;
  }

  /**
   * Fix with Groq API
   */
  async fixWithGroq(content, errorDetails, apiKey, model) {
    if (!apiKey) {
      throw new Error('Groq API key is required');
    }

    try {
      const fixed = await invoke('fix_with_groq', {
        content,
        errorDetails: JSON.stringify(errorDetails),
        apiKey,
        model
      });
      return fixed.trim();
    } catch (error) {
      throw new Error(`Groq API error: ${error}`);
    }
  }

  /**
   * Fix with OpenAI API
   */
  async fixWithOpenAI(content, errorDetails, apiKey, model) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    try {
      const fixed = await invoke('fix_with_openai', {
        content,
        errorDetails: JSON.stringify(errorDetails),
        apiKey,
        model
      });
      return fixed.trim();
    } catch (error) {
      throw new Error(`OpenAI API error: ${error}`);
    }
  }

  /**
   * Fix with Claude API
   */
  async fixWithClaude(content, errorDetails, apiKey, model) {
    if (!apiKey) {
      throw new Error('Claude API key is required');
    }

    try {
      const fixed = await invoke('fix_with_claude', {
        content,
        errorDetails: JSON.stringify(errorDetails),
        apiKey,
        model
      });
      return fixed.trim();
    } catch (error) {
      throw new Error(`Claude API error: ${error}`);
    }
  }

  /**
   * Fix with TinyLLM (browser-based, no API key needed)
   * Same implementation as web version - works in Tauri webview
   */
  async fixWithTinyLLM(content, errorDetails) {
    try {
      // Initialize TinyLLM with useAI: false to use rule-based fixing only
      const { InferenceEngine } = await import('tinyllm');

      if (!this.tinyLLMEngine) {
        this.tinyLLMEngine = new InferenceEngine({
          useAI: false, // Disable AI model loading (weights not available yet)
          maxRetries: 3
        });

        console.log('[TinyLLM Desktop] Initializing engine with rule-based fixing...');
        const status = await this.tinyLLMEngine.initialize();
        console.log('[TinyLLM Desktop] Engine initialized:', {
          aiEnabled: status.aiEnabled,
          vocabSize: status.vocabSize
        });
      }

      console.log('[TinyLLM Desktop] Input content:', content);
      console.log('[TinyLLM Desktop] Error details:', errorDetails);

      let result;
      if (errorDetails.type === 'JSON') {
        result = await this.tinyLLMEngine.fixJSON(content);
      } else if (errorDetails.type === 'XML') {
        result = await this.tinyLLMEngine.fixXML(content);
      } else {
        throw new Error(`TinyLLM only supports JSON and XML files. Current type: ${errorDetails.type}`);
      }

      console.log('[TinyLLM Desktop] Result:', {
        success: result?.success,
        method: result?.method || 'rules',
        fixesApplied: result?.fixes?.length || 0,
        canTryAI: result?.canTryAI || false
      });

      if (result?.fixes?.length > 0) {
        console.log('[TinyLLM Desktop] Fixes applied:', result.fixes);
      }

      if (result && result.success && result.fixed) {
        console.log(`[TinyLLM Desktop] ✓ Successfully fixed using ${result.method || 'rule-based'} approach`);
        return result.fixed.trim();
      } else if (result && result.fixed) {
        console.log('[TinyLLM Desktop] ⚠ Partial fix applied (validation may still fail)');
        return result.fixed.trim();
      } else {
        const errorMsg = result?.errors?.map(e => e.message).join(', ') || 'Unknown error';

        if (result?.canTryAI) {
          console.warn('[TinyLLM Desktop] ⚠ Complex errors detected. AI mode would help but model weights are not available yet.');
          console.warn('[TinyLLM Desktop] Tip: Consider using Groq, OpenAI, Claude, or Ollama providers for complex fixes.');
        }

        throw new Error(`TinyLLM could not fix the content: ${errorMsg}`);
      }
    } catch (error) {
      console.error('[TinyLLM Desktop] Exception:', error);
      throw new Error(`TinyLLM error: ${error.message}`);
    }
  }

  /**
   * Main fix function - routes to appropriate provider
   */
  async fix(content, errorDetails, settings, onProgress) {
    const { provider, ollamaModel, groqApiKey, groqModel, openaiApiKey, openaiModel, claudeApiKey, claudeModel } = settings;

    try {
      // TinyLLM mode (browser-based, JSON/XML only, no API key)
      if (provider === AI_PROVIDERS.TINYLLM) {
        return await this.fixWithTinyLLM(content, errorDetails);
      }

      // Ollama (local) mode
      if (provider === 'ollama') {
        const modelId = ollamaModel || 'deepseek-r1:8b';
        return await this.fixWithOllama(content, errorDetails, modelId, onProgress);
      }

      if (onProgress) {
        onProgress({
          progress: 50,
          text: 'Processing with AI...',
          timeElapsed: 0
        });
      }

      // Groq mode
      if (provider === AI_PROVIDERS.GROQ) {
        return await this.fixWithGroq(content, errorDetails, groqApiKey, groqModel);
      }

      // OpenAI mode
      if (provider === AI_PROVIDERS.OPENAI) {
        return await this.fixWithOpenAI(content, errorDetails, openaiApiKey, openaiModel);
      }

      // Claude mode
      if (provider === AI_PROVIDERS.CLAUDE) {
        return await this.fixWithClaude(content, errorDetails, claudeApiKey, claudeModel);
      }

      throw new Error('Invalid AI provider');
    } catch (error) {
      throw error;
    }
  }

  /**
   * Cleanup
   */
  async cleanup() {
    return Promise.resolve();
  }

  /**
   * Get system info
   */
  getSystemInfo() {
    return {
      platform: 'desktop',
      aiProvider: 'ollama + cloud',
      contextWindow: '8k-200k (model dependent)',
      requiresInternet: 'Optional (Ollama is local)',
      privacyLevel: 'Full privacy with Ollama',
      performance: 'Native (fastest with Ollama)'
    };
  }
}

// Export singleton instance
export const desktopAIService = new DesktopAIService();

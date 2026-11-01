import { ANTHROPIC_API_URL, anthropicHeaders, claudeMaxTokens, extractClaudeText } from './ai/anthropic.js';

// AI Provider types
export const AI_PROVIDERS = {
  TINYLLM: 'tinyllm', // Lightweight browser-based model for JSON/XML only
  GROQ: 'groq',
  OPENAI: 'openai',
  CLAUDE: 'claude',
  GEMINI: 'gemini',
  MISTRAL: 'mistral',
  CEREBRAS: 'cerebras', // Free: 1M tokens/day, no credit card
  SAMBANOVA: 'sambanova', // Free tier available
  OLLAMA: 'ollama', // Desktop only - fully local, no data leaves device
};

// Built-in model lists. These are fallbacks: when a provider key is set, the
// settings UI merges in the provider's live list (see ai/modelCatalog.js).

// Groq models
export const GROQ_MODELS = {
  'openai/gpt-oss-120b': {
    id: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B',
    description: 'Fast and capable'
  },
  'openai/gpt-oss-20b': {
    id: 'openai/gpt-oss-20b',
    name: 'GPT-OSS 20B',
    description: 'Lightweight and very fast'
  }
};

// OpenAI models
export const OPENAI_MODELS = {
  'gpt-5.4-mini': {
    id: 'gpt-5.4-mini',
    name: 'GPT-5.4 Mini',
    description: 'Fast and cost-effective'
  },
  'gpt-5.5': {
    id: 'gpt-5.5',
    name: 'GPT-5.5',
    description: 'Most capable'
  },
  'gpt-5.4-nano': {
    id: 'gpt-5.4-nano',
    name: 'GPT-5.4 Nano',
    description: 'Fastest and cheapest'
  }
};

// Claude models
export const CLAUDE_MODELS = {
  'claude-haiku-5-5': {
    id: 'claude-haiku-5-5',
    name: 'Claude Haiku 5.5',
    description: 'Fast and efficient'
  },
  'claude-sonnet-5-5': {
    id: 'claude-sonnet-5-5',
    name: 'Claude Sonnet 5.5',
    description: 'Balanced intelligence'
  },
  'claude-opus-5-5': {
    id: 'claude-opus-5-5',
    name: 'Claude Opus 5.5',
    description: 'Most capable'
  }
};

// Gemini models (aliases that Google keeps pointed at the current release)
export const GEMINI_MODELS = {
  'gemini-flash-latest': {
    id: 'gemini-flash-latest',
    name: 'Gemini Flash (latest)',
    description: 'Fast and versatile'
  },
  'gemini-flash-lite-latest': {
    id: 'gemini-flash-lite-latest',
    name: 'Gemini Flash-Lite (latest)',
    description: 'Fastest and cheapest'
  }
};

// Mistral models
export const MISTRAL_MODELS = {
  'mistral-large-latest': {
    id: 'mistral-large-latest',
    name: 'Mistral Large',
    description: 'Most capable'
  },
  'mistral-small-latest': {
    id: 'mistral-small-latest',
    name: 'Mistral Small',
    description: 'Fast and efficient'
  },
  'codestral-latest': {
    id: 'codestral-latest',
    name: 'Codestral',
    description: 'Code-optimized'
  }
};

// Cerebras models
export const CEREBRAS_MODELS = {
  'gpt-oss-120b': {
    id: 'gpt-oss-120b',
    name: 'GPT-OSS 120B',
    description: 'Fast and capable'
  }
};

// SambaNova models (free tier)
export const SAMBANOVA_MODELS = {
  'Meta-Llama-3.3-70B-Instruct': {
    id: 'Meta-Llama-3.3-70B-Instruct',
    name: 'Llama 3.3 70B',
    description: 'Fast and capable'
  }
};

// Model used when the user hasn't picked one
export const DEFAULT_MODELS = {
  groq: GROQ_MODELS['openai/gpt-oss-120b'].id,
  openai: OPENAI_MODELS['gpt-5.4-mini'].id,
  claude: CLAUDE_MODELS['claude-haiku-5-5'].id,
  gemini: GEMINI_MODELS['gemini-flash-latest'].id,
  mistral: MISTRAL_MODELS['mistral-large-latest'].id,
  cerebras: CEREBRAS_MODELS['gpt-oss-120b'].id,
  sambanova: SAMBANOVA_MODELS['Meta-Llama-3.3-70B-Instruct'].id,
};

class AIService {
  constructor() {
    // No state needed for API-only service
    this.tinyLLMEngine = null;
  }

  // Check if an OpenAI model is a reasoning model that doesn't support temperature
  // Covers o1, o3, o4-mini, and future o-series models
  isOpenAIReasoningModel(model) {
    const id = (model || '').toLowerCase();
    return /^(o\d|gpt-5)/.test(id);
  }

  // Build OpenAI request body with correct parameters for the model
  buildOpenAIRequestBody(model, messages, temperature, maxTokens, extra = {}) {
    const body = {
      model,
      messages,
      max_completion_tokens: maxTokens,
      ...extra,
    };
    if (!this.isOpenAIReasoningModel(model)) {
      body.temperature = temperature;
    }
    return body;
  }

  // Make an OpenAI API request with automatic retry if temperature is rejected
  async fetchOpenAI(url, apiKey, requestBody) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    // If the error is about temperature, retry without it
    if (!response.ok && requestBody.temperature !== undefined) {
      const errorData = await response.json().catch(() => null);
      const errorMsg = errorData?.error?.message || '';
      if (errorMsg.toLowerCase().includes('temperature')) {
        const retryBody = { ...requestBody };
        delete retryBody.temperature;
        const retryResponse = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(retryBody)
        });
        if (!retryResponse.ok) {
          const retryError = await retryResponse.json().catch(() => ({ error: { message: 'Unknown error' } }));
          throw new Error(retryError.error?.message || `OpenAI API error: ${retryResponse.status}`);
        }
        return retryResponse;
      }
      throw new Error(errorData?.error?.message || `OpenAI API error: ${response.status}`);
    }

    return response;
  }

  // Build prompt for fixing JSON/XML errors
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

  // Extract complete JSON/XML content intelligently
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

  // Fix with Groq API
  async fixWithGroq(content, errorDetails, apiKey, model = DEFAULT_MODELS.groq) {
    if (!apiKey) {
      throw new Error('Groq API key is required');
    }

    const prompt = this.buildFixPrompt(content, errorDetails);

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
            content: `You are a ${errorDetails.type} syntax error fixing assistant. Only output valid ${errorDetails.type}, nothing else.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 16000
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(error.error?.message || `Groq API error: ${response.status}`);
    }

    const data = await response.json();
    let fixed = data.choices[0]?.message?.content || '';

    // Remove markdown code block markers but preserve content
    if (fixed.includes('```')) {
      const lines = fixed.split('\n');
      const codeLines = [];
      let inCodeBlock = false;

      for (const line of lines) {
        if (line.trim().startsWith('```')) {
          inCodeBlock = !inCodeBlock;
        } else if (inCodeBlock) {
          codeLines.push(line);
        }
      }

      if (codeLines.length > 0) {
        fixed = codeLines.join('\n');
      } else {
        fixed = lines.filter(line => !line.trim().startsWith('```')).join('\n');
      }
    }

    // Extract complete JSON/XML content
    fixed = this.extractContent(fixed, errorDetails.type);

    return fixed.trim();
  }

  // Fix with OpenAI API
  async fixWithOpenAI(content, errorDetails, apiKey, model = DEFAULT_MODELS.openai) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    const prompt = this.buildFixPrompt(content, errorDetails);

    const requestBody = this.buildOpenAIRequestBody(model, [
        {
          role: 'system',
          content: `You are a ${errorDetails.type} syntax error fixing assistant. Only output valid ${errorDetails.type}, nothing else.`
        },
        {
          role: 'user',
          content: prompt
        }
      ], 0.1, 16000);

    const response = await this.fetchOpenAI('https://api.openai.com/v1/chat/completions', apiKey, requestBody);

    const data = await response.json();
    let fixed = data.choices[0]?.message?.content || '';

    // Remove markdown code block markers but preserve content
    if (fixed.includes('```')) {
      const lines = fixed.split('\n');
      const codeLines = [];
      let inCodeBlock = false;

      for (const line of lines) {
        if (line.trim().startsWith('```')) {
          inCodeBlock = !inCodeBlock;
        } else if (inCodeBlock) {
          codeLines.push(line);
        }
      }

      if (codeLines.length > 0) {
        fixed = codeLines.join('\n');
      } else {
        fixed = lines.filter(line => !line.trim().startsWith('```')).join('\n');
      }
    }

    // Extract complete JSON/XML content
    fixed = this.extractContent(fixed, errorDetails.type);

    return fixed.trim();
  }

  // Fix with Claude API
  async fixWithClaude(content, errorDetails, apiKey, model = DEFAULT_MODELS.claude) {
    if (!apiKey) {
      throw new Error('Claude API key is required');
    }

    const prompt = this.buildFixPrompt(content, errorDetails);

    try {
      const response = await fetch(`${ANTHROPIC_API_URL}/messages`, {
        method: 'POST',
        headers: anthropicHeaders(apiKey),
        body: JSON.stringify({
          model,
          max_tokens: claudeMaxTokens(16000),
          system: `You are a ${errorDetails.type} syntax error fixing assistant. Only output valid ${errorDetails.type}, nothing else.`,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Claude API error: ${response.status}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error?.message || errorData.message || errorMessage;
        } catch (e) {
          // If we can't parse the error, use the text
          if (errorText) errorMessage = `${errorMessage} - ${errorText.substring(0, 200)}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      let fixed = extractClaudeText(data);

      // Remove markdown code block markers but preserve content
      if (fixed.includes('```')) {
        const lines = fixed.split('\n');
        const codeLines = [];
        let inCodeBlock = false;

        for (const line of lines) {
          if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
          } else if (inCodeBlock) {
            codeLines.push(line);
          }
        }

        if (codeLines.length > 0) {
          fixed = codeLines.join('\n');
        } else {
          fixed = lines.filter(line => !line.trim().startsWith('```')).join('\n');
        }
      }

      // Extract complete JSON/XML content
      fixed = this.extractContent(fixed, errorDetails.type);

      return fixed.trim();
    } catch (error) {
      // fetch throws TypeError only when the request never completed (offline, blocked, DNS)
      if (error instanceof TypeError) {
        throw new Error(`Could not reach the Claude API: ${error.message}`);
      }
      throw error;
    }
  }

  // Whether fixed content actually parses, so a non-fix isn't presented as one
  isValidContent(text, type) {
    if (type === 'JSON') {
      try {
        JSON.parse(text);
        return true;
      } catch {
        return false;
      }
    }
    if (type === 'XML' && typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      return !doc.getElementsByTagName('parsererror').length;
    }
    return true;
  }

  // Fix with TinyLLM (browser-based, no API key needed). Only content that parses counts
  // as fixed; with allowPartial, an improved but still invalid result is returned too.
  async fixWithTinyLLM(content, errorDetails, { allowPartial = false } = {}) {
    try {
      // Initialize TinyLLM with useAI: false to use rule-based fixing only
      // Note: Pre-trained model weights are not yet publicly available in the tinyllm package
      // The engine will use intelligent rule-based fixing with auto-fallback support
      const { InferenceEngine } = await import('tinyllm');

      if (!this.tinyLLMEngine) {
        this.tinyLLMEngine = new InferenceEngine({
          useAI: false, // Disable AI model loading (weights not available yet)
          maxRetries: 3
        });

        console.log('[TinyLLM] Initializing engine with rule-based fixing...');
        const status = await this.tinyLLMEngine.initialize();
        console.log('[TinyLLM] Engine initialized:', {
          aiEnabled: status.aiEnabled,
          vocabSize: status.vocabSize
        });
      }

      console.log('[TinyLLM] Input content:', content);
      console.log('[TinyLLM] Error details:', errorDetails);

      let result;
      if (errorDetails.type === 'JSON') {
        // Call fixJSON without useAI parameter (uses config default)
        result = await this.tinyLLMEngine.fixJSON(content);
      } else if (errorDetails.type === 'XML') {
        // Call fixXML without useAI parameter (uses config default)
        result = await this.tinyLLMEngine.fixXML(content);
      } else {
        throw new Error(`TinyLLM only supports JSON and XML files. Current type: ${errorDetails.type}`);
      }

      console.log('[TinyLLM] Result:', {
        success: result?.success,
        method: result?.method || 'rules',
        fixesApplied: result?.fixes?.length || 0,
        canTryAI: result?.canTryAI || false
      });

      if (result?.fixes?.length > 0) {
        console.log('[TinyLLM] Fixes applied:', result.fixes);
      }

      // TinyLLM returns: { success, fixed, original, fixes, data, errors, method, canTryAI }
      const isValid = Boolean(result?.fixed) && this.isValidContent(result.fixed, errorDetails.type);
      if (result && result.success && isValid) {
        console.log(`[TinyLLM] ✓ Successfully fixed using ${result.method || 'rule-based'} approach`);
        console.log('[TinyLLM] FULL FIXED CONTENT:', result.fixed);
        console.log('[TinyLLM] First 500 chars:', result.fixed.substring(0, 500));
        console.log('[TinyLLM] Contains \\b character codes:', result.fixed.includes('\\b'));
        console.log('[TinyLLM] Sample quotes check:', result.fixed.match(/"[^"]*"/g)?.slice(0, 5));
        return result.fixed.trim();
      } else if (allowPartial && result?.fixed && result.fixed.trim() !== content.trim()) {
        // Return the fixed version even if not fully successful (best effort)
        console.log('[TinyLLM] ⚠ Partial fix applied (validation may still fail)');
        console.log('[TinyLLM] PARTIAL FIXED CONTENT:', result.fixed);
        console.log('[TinyLLM] First 500 chars:', result.fixed.substring(0, 500));
        console.log('[TinyLLM] Contains \\b character codes:', result.fixed.includes('\\b'));
        return result.fixed.trim();
      } else {
        // Fixing failed completely
        const errorMsg = result?.errors?.map(e => e.message).join(', ') || 'Unknown error';

        if (result?.canTryAI) {
          console.warn('[TinyLLM] ⚠ Complex errors detected. AI mode would help but model weights are not available yet.');
          console.warn('[TinyLLM] Tip: Consider using Groq, OpenAI, or Claude providers for complex fixes.');
        }

        throw new Error(`TinyLLM could not fix the content: ${errorMsg}`);
      }
    } catch (error) {
      console.error('[TinyLLM] Exception:', error);
      throw new Error(`TinyLLM error: ${error.message}`);
    }
  }

  // Fix with OpenAI-compatible API (Gemini excluded - uses different format)
  async fixWithOpenAICompatible(content, errorDetails, apiKey, model, baseUrl, providerName) {
    if (!apiKey) throw new Error(`${providerName} API key is required`);

    const prompt = this.buildFixPrompt(content, errorDetails);
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: `You are a ${errorDetails.type} syntax error fixing assistant. Only output valid ${errorDetails.type}, nothing else.` },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 16000
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(error.error?.message || `${providerName} API error: ${response.status}`);
    }

    const data = await response.json();
    let fixed = data.choices[0]?.message?.content || '';
    if (fixed.includes('```')) {
      const lines = fixed.split('\n');
      const codeLines = [];
      let inCodeBlock = false;
      for (const line of lines) {
        if (line.trim().startsWith('```')) { inCodeBlock = !inCodeBlock; }
        else if (inCodeBlock) { codeLines.push(line); }
      }
      fixed = codeLines.length > 0 ? codeLines.join('\n') : lines.filter(l => !l.trim().startsWith('```')).join('\n');
    }
    fixed = this.extractContent(fixed, errorDetails.type);
    return fixed.trim();
  }

  // Fix with Gemini API (different format)
  async fixWithGemini(content, errorDetails, apiKey, model = DEFAULT_MODELS.gemini) {
    if (!apiKey) throw new Error('Gemini API key is required');

    const prompt = this.buildFixPrompt(content, errorDetails);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `You are a ${errorDetails.type} syntax error fixing assistant. Only output valid ${errorDetails.type}, nothing else.\n\n${prompt}` }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 16000 }
        })
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(error.error?.message || `Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    let fixed = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (fixed.includes('```')) {
      const lines = fixed.split('\n');
      const codeLines = [];
      let inCodeBlock = false;
      for (const line of lines) {
        if (line.trim().startsWith('```')) { inCodeBlock = !inCodeBlock; }
        else if (inCodeBlock) { codeLines.push(line); }
      }
      fixed = codeLines.length > 0 ? codeLines.join('\n') : lines.filter(l => !l.trim().startsWith('```')).join('\n');
    }
    fixed = this.extractContent(fixed, errorDetails.type);
    return fixed.trim();
  }

  // Main fix function
  async fix(content, errorDetails, settings, onProgress) {
    const { provider, groqApiKey, groqModel, openaiApiKey, openaiModel, claudeApiKey, claudeModel,
            geminiApiKey, geminiModel, mistralApiKey, mistralModel,
            cerebrasApiKey, cerebrasModel, sambanovaApiKey, sambanovaModel } = settings;

    if (onProgress) {
      onProgress({
        progress: 50,
        text: 'Processing with AI...',
        timeElapsed: 0
      });
    }

    try {
      // Always try TinyLLM first for JSON/XML — it's fast, browser-based, and requires no API key.
      // Fall back to the configured provider only if TinyLLM fails.
      if (errorDetails.type === 'JSON' || errorDetails.type === 'XML') {
        try {
          // Partial fixes only when TinyLLM is the chosen provider; otherwise the provider gets a turn
          return await this.fixWithTinyLLM(content, errorDetails, { allowPartial: provider === AI_PROVIDERS.TINYLLM });
        } catch (tinyErr) {
          console.warn('[AI Fix] TinyLLM failed, falling back to configured provider:', tinyErr.message);
          // If the user explicitly chose TinyLLM and it failed, there is no fallback — rethrow.
          if (provider === AI_PROVIDERS.TINYLLM) {
            throw tinyErr;
          }
          if (onProgress) {
            onProgress({ progress: 65, text: `TinyLLM failed, trying ${provider}...`, timeElapsed: 0 });
          }
          // Otherwise fall through to the configured provider below.
        }
      }

      // TinyLLM selected but type is not JSON/XML — let fixWithTinyLLM throw the descriptive error.
      if (provider === AI_PROVIDERS.TINYLLM) {
        return await this.fixWithTinyLLM(content, errorDetails);
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

      // Gemini mode
      if (provider === AI_PROVIDERS.GEMINI) {
        return await this.fixWithGemini(content, errorDetails, geminiApiKey, geminiModel);
      }

      // Mistral mode (OpenAI-compatible)
      if (provider === AI_PROVIDERS.MISTRAL) {
        return await this.fixWithOpenAICompatible(content, errorDetails, mistralApiKey,
          mistralModel || DEFAULT_MODELS.mistral,
          'https://api.mistral.ai/v1', 'Mistral');
      }

      // Cerebras mode (OpenAI-compatible, free)
      if (provider === AI_PROVIDERS.CEREBRAS) {
        return await this.fixWithOpenAICompatible(content, errorDetails, cerebrasApiKey,
          cerebrasModel || DEFAULT_MODELS.cerebras,
          'https://api.cerebras.ai/v1', 'Cerebras');
      }

      // SambaNova mode (OpenAI-compatible, free)
      if (provider === AI_PROVIDERS.SAMBANOVA) {
        return await this.fixWithOpenAICompatible(content, errorDetails, sambanovaApiKey,
          sambanovaModel || DEFAULT_MODELS.sambanova,
          'https://api.sambanova.ai/v1', 'SambaNova');
      }

      throw new Error('Invalid AI provider');
    } catch (error) {
      throw error;
    }
  }

  // Helper: call an OpenAI-compatible chat completions endpoint
  async _chatComplete(baseUrl, apiKey, model, systemPrompt, userPrompt, providerName) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(error.error?.message || `${providerName} API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || '';
  }

  // Transform text with AI (for notes editor)
  async transformText(text, action, settings) {
    const { provider, groqApiKey, groqModel, openaiApiKey, openaiModel, claudeApiKey, claudeModel,
            geminiApiKey, geminiModel, mistralApiKey, mistralModel,
            cerebrasApiKey, cerebrasModel, sambanovaApiKey, sambanovaModel } = settings;

    // TinyLLM doesn't support text transformation (JSON/XML only)
    if (provider === AI_PROVIDERS.TINYLLM) {
      throw new Error('TinyLLM only supports fixing JSON and XML files. Text transformation is not available. Please select a different AI provider for notes features.');
    }

    const prompts = {
      rewrite: `Rewrite the following text to be clearer and more concise while maintaining the original meaning:\n\n${text}`,
      rephrase: `Rephrase the following text using different words while keeping the same meaning:\n\n${text}`,
      improve: `Improve the following text by making it more professional and well-structured:\n\n${text}`,
      summarize: `Summarize the following text concisely:\n\n${text}`,
      expand: `Expand on the following text with more details and examples:\n\n${text}`,
      'fix-grammar': `Fix any grammar and spelling errors in the following text:\n\n${text}`
    };

    const prompt = prompts[action] || `Process the following text:\n\n${text}`;

    try {
      // Groq mode
      if (provider === AI_PROVIDERS.GROQ) {
        if (!groqApiKey) throw new Error('Groq API key is required');

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: groqModel || DEFAULT_MODELS.groq,
            messages: [
              {
                role: 'system',
                content: 'You are a helpful writing assistant. Output only the transformed text, no explanations.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 4000
          })
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
          throw new Error(error.error?.message || `Groq API error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content?.trim() || text;
      }

      // OpenAI mode
      if (provider === AI_PROVIDERS.OPENAI) {
        if (!openaiApiKey) throw new Error('OpenAI API key is required');

        const effectiveModel = openaiModel || DEFAULT_MODELS.openai;
        const requestBody = this.buildOpenAIRequestBody(effectiveModel, [
            {
              role: 'system',
              content: 'You are a helpful writing assistant. Output only the transformed text, no explanations.'
            },
            {
              role: 'user',
              content: prompt
            }
          ], 0.7, 4000);

        const response = await this.fetchOpenAI('https://api.openai.com/v1/chat/completions', openaiApiKey, requestBody);

        const data = await response.json();
        return data.choices[0]?.message?.content?.trim() || text;
      }

      // Claude mode
      if (provider === AI_PROVIDERS.CLAUDE) {
        if (!claudeApiKey) throw new Error('Claude API key is required');

        try {
          const response = await fetch(`${ANTHROPIC_API_URL}/messages`, {
            method: 'POST',
            headers: anthropicHeaders(claudeApiKey),
            body: JSON.stringify({
              model: claudeModel || DEFAULT_MODELS.claude,
              max_tokens: claudeMaxTokens(4000),
              system: 'You are a helpful writing assistant. Output only the transformed text, no explanations.',
              messages: [
                {
                  role: 'user',
                  content: prompt
                }
              ]
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `Claude API error: ${response.status}`;
            try {
              const errorData = JSON.parse(errorText);
              errorMessage = errorData.error?.message || errorData.message || errorMessage;
            } catch (e) {
              if (errorText) errorMessage = `${errorMessage} - ${errorText.substring(0, 200)}`;
            }
            throw new Error(errorMessage);
          }

          const data = await response.json();
          return extractClaudeText(data).trim() || text;
        } catch (error) {
          if (error instanceof TypeError) {
            throw new Error(`Could not reach the Claude API: ${error.message}`);
          }
          throw error;
        }
      }

      // Gemini mode
      if (provider === AI_PROVIDERS.GEMINI) {
        if (!geminiApiKey) throw new Error('Gemini API key is required');

        const model = geminiModel || DEFAULT_MODELS.gemini;
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `You are a helpful writing assistant. Output only the transformed text, no explanations.\n\n${prompt}` }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 4000 }
            })
          }
        );

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
          throw new Error(error.error?.message || `Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;
      }

      // Mistral mode (OpenAI-compatible)
      if (provider === AI_PROVIDERS.MISTRAL) {
        if (!mistralApiKey) throw new Error('Mistral API key is required');
        const sysPrompt = 'You are a helpful writing assistant. Output only the transformed text, no explanations.';
        return await this._chatComplete('https://api.mistral.ai/v1', mistralApiKey,
          mistralModel || DEFAULT_MODELS.mistral, sysPrompt, prompt, 'Mistral') || text;
      }

      // Cerebras mode (OpenAI-compatible, free)
      if (provider === AI_PROVIDERS.CEREBRAS) {
        if (!cerebrasApiKey) throw new Error('Cerebras API key is required');
        const sysPrompt = 'You are a helpful writing assistant. Output only the transformed text, no explanations.';
        return await this._chatComplete('https://api.cerebras.ai/v1', cerebrasApiKey,
          cerebrasModel || DEFAULT_MODELS.cerebras, sysPrompt, prompt, 'Cerebras') || text;
      }

      // SambaNova mode (OpenAI-compatible, free)
      if (provider === AI_PROVIDERS.SAMBANOVA) {
        if (!sambanovaApiKey) throw new Error('SambaNova API key is required');
        const sysPrompt = 'You are a helpful writing assistant. Output only the transformed text, no explanations.';
        return await this._chatComplete('https://api.sambanova.ai/v1', sambanovaApiKey,
          sambanovaModel || DEFAULT_MODELS.sambanova, sysPrompt, prompt, 'SambaNova') || text;
      }

      throw new Error('Invalid AI provider');
    } catch (error) {
      throw error;
    }
  }

  // Cleanup (no-op for API-only service)
  async cleanup() {
    return Promise.resolve();
  }
}

// Export singleton instance
export const aiService = new AIService();

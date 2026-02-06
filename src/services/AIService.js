// AI Provider types
export const AI_PROVIDERS = {
  TINYLLM: 'tinyllm', // Lightweight browser-based model for JSON/XML only
  GROQ: 'groq',
  OPENAI: 'openai',
  CLAUDE: 'claude', // Available in desktop mode (CORS restrictions apply in browser)
  GEMINI: 'gemini',
  MISTRAL: 'mistral',
  CEREBRAS: 'cerebras', // Free: 1M tokens/day, no credit card
  SAMBANOVA: 'sambanova', // Free tier available
  OLLAMA: 'ollama', // Desktop only - fully local, no data leaves device
};

// Groq models
export const GROQ_MODELS = {
  'llama-3.3-70b': {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B',
    description: 'Fast and capable'
  },
  'mixtral-8x7b': {
    id: 'mixtral-8x7b-32768',
    name: 'Mixtral 8x7B',
    description: 'Balanced performance'
  }
};

// OpenAI models
export const OPENAI_MODELS = {
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Fast and cost-effective'
  },
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Most capable current model'
  },
  'gpt-5': {
    id: 'gpt-5',
    name: 'GPT-5',
    description: 'Next-gen model (256K context)'
  },
  'gpt-5-mini': {
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    description: 'Efficient GPT-5 variant'
  },
  'o1-preview': {
    id: 'o1-preview',
    name: 'O1 Preview',
    description: 'Advanced reasoning'
  },
  'o1-mini': {
    id: 'o1-mini',
    name: 'O1 Mini',
    description: 'Fast reasoning'
  }
};

// Claude models
export const CLAUDE_MODELS = {
  'claude-3-5-haiku': {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    description: 'Fast and efficient'
  },
  'claude-3-5-sonnet': {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    description: 'Balanced intelligence'
  }
};

// Gemini models
export const GEMINI_MODELS = {
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    description: 'Fast and versatile'
  },
  'gemini-2.0-pro': {
    id: 'gemini-2.0-pro',
    name: 'Gemini 2.0 Pro',
    description: 'Most capable'
  },
  'gemini-1.5-pro': {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    description: '2M context'
  },
  'gemini-1.5-flash': {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    description: 'Fast and efficient'
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

// Cerebras models (free: 1M tokens/day)
export const CEREBRAS_MODELS = {
  'llama-3.3-70b': {
    id: 'llama-3.3-70b',
    name: 'Llama 3.3 70B',
    description: 'Fast and capable'
  },
  'llama3.1-8b': {
    id: 'llama3.1-8b',
    name: 'Llama 3.1 8B',
    description: 'Lightweight and fast'
  }
};

// SambaNova models (free tier)
export const SAMBANOVA_MODELS = {
  'Meta-Llama-3.3-70B-Instruct': {
    id: 'Meta-Llama-3.3-70B-Instruct',
    name: 'Llama 3.3 70B',
    description: 'Fast and capable'
  },
  'Meta-Llama-3.1-405B-Instruct': {
    id: 'Meta-Llama-3.1-405B-Instruct',
    name: 'Llama 3.1 405B',
    description: 'Most powerful open model'
  },
  'Meta-Llama-3.1-8B-Instruct': {
    id: 'Meta-Llama-3.1-8B-Instruct',
    name: 'Llama 3.1 8B',
    description: 'Lightweight and fast'
  }
};

class AIService {
  constructor() {
    // No state needed for API-only service
    this.tinyLLMEngine = null;
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
  async fixWithGroq(content, errorDetails, apiKey, model = GROQ_MODELS['llama-3.3-70b'].id) {
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
  async fixWithOpenAI(content, errorDetails, apiKey, model = OPENAI_MODELS['gpt-4o-mini'].id) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    const prompt = this.buildFixPrompt(content, errorDetails);

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
      throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
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

  // Fix with Claude API
  async fixWithClaude(content, errorDetails, apiKey, model = CLAUDE_MODELS['claude-3-5-haiku'].id) {
    if (!apiKey) {
      throw new Error('Claude API key is required');
    }

    const prompt = this.buildFixPrompt(content, errorDetails);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          max_tokens: 16000,
          system: `You are a ${errorDetails.type} syntax error fixing assistant. Only output valid ${errorDetails.type}, nothing else.`,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1
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
      let fixed = data.content[0]?.text || '';

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
      // Network error or fetch failed
      if (error.message.includes('Claude API error')) {
        throw error; // Re-throw API errors
      }
      // This is a network-level error (CORS, connection failed, etc.)
      // Claude API has CORS restrictions in browsers
      throw new Error(`Browser CORS restriction: Claude API cannot be called directly from web browsers. Please use the desktop app for Claude AI features, or switch to Groq/OpenAI providers which support browser access.`);
    }
  }

  // Fix with TinyLLM (browser-based, no API key needed)
  async fixWithTinyLLM(content, errorDetails) {
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
      if (result && result.success && result.fixed) {
        console.log(`[TinyLLM] ✓ Successfully fixed using ${result.method || 'rule-based'} approach`);
        console.log('[TinyLLM] FULL FIXED CONTENT:', result.fixed);
        console.log('[TinyLLM] First 500 chars:', result.fixed.substring(0, 500));
        console.log('[TinyLLM] Contains \\b character codes:', result.fixed.includes('\\b'));
        console.log('[TinyLLM] Sample quotes check:', result.fixed.match(/"[^"]*"/g)?.slice(0, 5));
        return result.fixed.trim();
      } else if (result && result.fixed) {
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
  async fixWithGemini(content, errorDetails, apiKey, model = GEMINI_MODELS['gemini-2.0-flash'].id) {
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
      // TinyLLM mode (browser-based, JSON/XML only, no API key)
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
          mistralModel || MISTRAL_MODELS['mistral-large-latest'].id,
          'https://api.mistral.ai/v1', 'Mistral');
      }

      // Cerebras mode (OpenAI-compatible, free)
      if (provider === AI_PROVIDERS.CEREBRAS) {
        return await this.fixWithOpenAICompatible(content, errorDetails, cerebrasApiKey,
          cerebrasModel || CEREBRAS_MODELS['llama-3.3-70b'].id,
          'https://api.cerebras.ai/v1', 'Cerebras');
      }

      // SambaNova mode (OpenAI-compatible, free)
      if (provider === AI_PROVIDERS.SAMBANOVA) {
        return await this.fixWithOpenAICompatible(content, errorDetails, sambanovaApiKey,
          sambanovaModel || SAMBANOVA_MODELS['Meta-Llama-3.3-70B-Instruct'].id,
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
            model: groqModel || GROQ_MODELS['llama-3.3-70b'].id,
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

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: openaiModel || OPENAI_MODELS['gpt-4o-mini'].id,
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
          throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content?.trim() || text;
      }

      // Claude mode
      if (provider === AI_PROVIDERS.CLAUDE) {
        if (!claudeApiKey) throw new Error('Claude API key is required');

        try {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': claudeApiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: claudeModel || CLAUDE_MODELS['claude-3-5-haiku'].id,
              max_tokens: 4000,
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
          return data.content[0]?.text?.trim() || text;
        } catch (error) {
          if (error.message.includes('Claude API error')) {
            throw error;
          }
          throw new Error(`Browser CORS restriction: Claude API cannot be called directly from web browsers. Please use the desktop app for Claude AI features, or switch to Groq/OpenAI providers.`);
        }
      }

      // Gemini mode
      if (provider === AI_PROVIDERS.GEMINI) {
        if (!geminiApiKey) throw new Error('Gemini API key is required');

        const model = geminiModel || GEMINI_MODELS['gemini-2.0-flash'].id;
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
          mistralModel || MISTRAL_MODELS['mistral-large-latest'].id, sysPrompt, prompt, 'Mistral') || text;
      }

      // Cerebras mode (OpenAI-compatible, free)
      if (provider === AI_PROVIDERS.CEREBRAS) {
        if (!cerebrasApiKey) throw new Error('Cerebras API key is required');
        const sysPrompt = 'You are a helpful writing assistant. Output only the transformed text, no explanations.';
        return await this._chatComplete('https://api.cerebras.ai/v1', cerebrasApiKey,
          cerebrasModel || CEREBRAS_MODELS['llama-3.3-70b'].id, sysPrompt, prompt, 'Cerebras') || text;
      }

      // SambaNova mode (OpenAI-compatible, free)
      if (provider === AI_PROVIDERS.SAMBANOVA) {
        if (!sambanovaApiKey) throw new Error('SambaNova API key is required');
        const sysPrompt = 'You are a helpful writing assistant. Output only the transformed text, no explanations.';
        return await this._chatComplete('https://api.sambanova.ai/v1', sambanovaApiKey,
          sambanovaModel || SAMBANOVA_MODELS['Meta-Llama-3.3-70B-Instruct'].id, sysPrompt, prompt, 'SambaNova') || text;
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

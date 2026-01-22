import React, { useState, useEffect } from 'react';
import { X, Sparkles, Cloud, Check, AlertCircle, Monitor, ExternalLink, CheckCircle, XCircle } from 'lucide-react';
import { AI_PROVIDERS, GROQ_MODELS, OPENAI_MODELS, CLAUDE_MODELS } from '../services/AIService';
import { LSP_SERVERS } from '../services/LSPService';

// Default Ollama models (will be replaced if desktop version is available)
const DEFAULT_OLLAMA_MODELS = {
  'qwen2.5-coder:1.5b': {
    id: 'qwen2.5-coder:1.5b',
    name: 'Qwen2.5 Coder 1.5B (Recommended)',
    size: '1 GB',
    speed: 'Very Fast'
  },
  'qwen2.5-coder:3b': {
    id: 'qwen2.5-coder:3b',
    name: 'Qwen2.5 Coder 3B',
    size: '2 GB',
    speed: 'Fast'
  }
};

const DEFAULT_LSP_CONFIG = Object.keys(LSP_SERVERS).reduce((acc, lang) => {
  acc[lang] = { mode: 'bundled', customCommand: '' };
  return acc;
}, {});

const AISettingsModal = ({ settings, onSave, onClose, theme, isDesktop, desktopAIService, onTriggerSetupWizard }) => {
  const [localSettings, setLocalSettings] = useState({
    enableLSP: settings.enableLSP ?? false,
    lspConfig: { ...DEFAULT_LSP_CONFIG, ...(settings?.lspConfig || {}) },
    ...settings
  });
  const [showGroqApiKey, setShowGroqApiKey] = useState(false);
  const [showOpenAIApiKey, setShowOpenAIApiKey] = useState(false);
  const [showClaudeApiKey, setShowClaudeApiKey] = useState(false);
  const [ollamaModels, setOllamaModels] = useState(DEFAULT_OLLAMA_MODELS);
  const [checkingModel, setCheckingModel] = useState(false);

  // API key validation states
  const [groqApiKeyStatus, setGroqApiKeyStatus] = useState(null); // null, 'valid', 'invalid'
  const [openaiApiKeyStatus, setOpenaiApiKeyStatus] = useState(null);
  const [claudeApiKeyStatus, setClaudeApiKeyStatus] = useState(null);
  const [validatingApiKey, setValidatingApiKey] = useState(false);

  // Sync incoming settings so toggling between web/desktop keeps defaults
  useEffect(() => {
    setLocalSettings(prev => ({
      ...prev,
      ...settings,
      enableLSP: settings.enableLSP ?? prev.enableLSP ?? false,
      lspConfig: { ...DEFAULT_LSP_CONFIG, ...(settings?.lspConfig || {}) }
    }));
  }, [settings]);

  // Load Ollama models only if desktop
  useEffect(() => {
    if (isDesktop) {
      // Use dynamic import with full path to avoid build-time resolution
      import(/* @vite-ignore */ '../services/AIService.desktop.js').then(module => {
        setOllamaModels(module.OLLAMA_MODELS);
      }).catch(err => {
        console.warn('Failed to load Ollama models:', err);
      });
    }
  }, [isDesktop]);

  // Check if selected Ollama model is available
  const handleOllamaModelChange = async (newModelId) => {
    console.log('[AISettingsModal] Model changed to:', newModelId);
    setLocalSettings({ ...localSettings, ollamaModel: newModelId });

    // Check if model is available
    if (isDesktop && desktopAIService) {
      console.log('[AISettingsModal] Checking model availability...');
      setCheckingModel(true);
      try {
        const isAvailable = await desktopAIService.isModelAvailable(newModelId);
        console.log('[AISettingsModal] Model available:', isAvailable);

        if (!isAvailable && onTriggerSetupWizard) {
          // Model not available - trigger setup wizard
          console.log('[AISettingsModal] Triggering setup wizard for:', newModelId);
          onClose();
          onTriggerSetupWizard(newModelId);
        } else if (!isAvailable) {
          console.warn('[AISettingsModal] Model not available but no setup wizard callback');
        }
      } catch (error) {
        console.error('Failed to check model availability:', error);
      } finally {
        setCheckingModel(false);
      }
    } else {
      console.log('[AISettingsModal] Not desktop or no AI service');
    }
  };

  // API key validation - basic format checks
  const validateApiKeyFormat = (key, provider) => {
    if (!key || key.trim() === '') return null;

    switch (provider) {
      case 'groq':
        // Groq keys start with 'gsk_'
        return key.startsWith('gsk_') && key.length > 20 ? 'valid' : 'invalid';
      case 'openai':
        // OpenAI keys start with 'sk-'
        return key.startsWith('sk-') && key.length > 20 ? 'valid' : 'invalid';
      case 'claude':
        // Claude keys start with 'sk-ant-'
        return key.startsWith('sk-ant-') && key.length > 20 ? 'valid' : 'invalid';
      default:
        return null;
    }
  };

  // Handle API key changes with validation
  const handleGroqApiKeyChange = (value) => {
    setLocalSettings({ ...localSettings, groqApiKey: value });
    setGroqApiKeyStatus(validateApiKeyFormat(value, 'groq'));
  };

  const handleOpenAIApiKeyChange = (value) => {
    setLocalSettings({ ...localSettings, openaiApiKey: value });
    setOpenaiApiKeyStatus(validateApiKeyFormat(value, 'openai'));
  };

  const handleClaudeApiKeyChange = (value) => {
    setLocalSettings({ ...localSettings, claudeApiKey: value });
    setClaudeApiKeyStatus(validateApiKeyFormat(value, 'claude'));
  };

  // Open API key page in browser
  const openApiKeyPage = async (provider) => {
    const urls = {
      groq: 'https://console.groq.com/keys',
      openai: 'https://platform.openai.com/api-keys',
      claude: 'https://console.anthropic.com/settings/keys'
    };

    const url = urls[provider];
    if (!url) return;

    if (isDesktop || window?.__TAURI__) {
      const shellOpen = window?.__TAURI__?.shell?.open;
      if (typeof shellOpen === 'function') {
        try {
          console.info('[AISettingsModal] Opening via tauri.shell.open');
          await shellOpen(url);
          return;
        } catch (error) {
          console.warn('[AISettingsModal] Failed via tauri.shell.open', error);
        }
      }

      const tauriCoreInvoke = window?.__TAURI__?.core?.invoke;
      if (typeof tauriCoreInvoke === 'function') {
        try {
          console.info('[AISettingsModal] Opening via tauri.core.invoke plugin:shell|open');
          await tauriCoreInvoke('plugin:shell|open', { path: url });
          return;
        } catch (error) {
          console.warn('[AISettingsModal] Failed via tauri.core.invoke', error);
        }
      }

      const tauriInvokeV1 = window?.__TAURI__?.invoke;
      if (typeof tauriInvokeV1 === 'function') {
        try {
          console.info('[AISettingsModal] Opening via tauri.invoke plugin:shell|open');
          await tauriInvokeV1('plugin:shell|open', { path: url });
          return;
        } catch (error) {
          console.warn('[AISettingsModal] Failed via tauri.invoke v1', error);
        }
      }

      const tauriInvokeLegacy = window?.__TAURI_INVOKE__;
      if (typeof tauriInvokeLegacy === 'function') {
        try {
          console.info('[AISettingsModal] Opening via __TAURI_INVOKE__ plugin:shell|open');
          await tauriInvokeLegacy('plugin:shell|open', { path: url });
          return;
        } catch (error) {
          console.warn('[AISettingsModal] Failed via __TAURI_INVOKE__', error);
        }
      }

      // Additional fallback for older shell command name
      const tauriShellInvoke = window?.__TAURI__?.core?.invoke;
      if (typeof tauriShellInvoke === 'function') {
        try {
          console.info('[AISettingsModal] Opening via tauri.core.invoke shell:open');
          await tauriShellInvoke('shell:open', { path: url });
          return;
        } catch (error) {
          console.warn('[AISettingsModal] Failed via tauri.core.invoke shell:open', error);
        }
      }
    }

    console.info('[AISettingsModal] Falling back to window.open for API key link');
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (opened) return;

    // Try anchor click fallback (helps bypass some blockers)
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer noopener';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    // If still blocked, copy to clipboard and show alert
    // NEVER use window.location.href as it replaces the entire app!
    try {
      navigator.clipboard.writeText(url);
      alert(`Unable to open browser automatically.\n\nThe API key URL has been copied to your clipboard:\n\n${url}\n\nPlease paste it in your browser.`);
    } catch (err) {
      // If clipboard fails, just show the URL
      alert(`Unable to open browser automatically.\n\nPlease manually open this URL in your browser:\n\n${url}`);
      console.warn('[AISettingsModal] Failed to copy to clipboard; URL:', url);
    }
  };

  const updateLspConfig = (language, changes) => {
    const nextConfig = {
      ...(localSettings.lspConfig || {}),
      [language]: {
        mode: localSettings.lspConfig?.[language]?.mode || 'bundled',
        customCommand: localSettings.lspConfig?.[language]?.customCommand || '',
        ...changes
      }
    };
    setLocalSettings({ ...localSettings, lspConfig: nextConfig });
  };

  const renderLspConfigRow = (language) => {
    const config = localSettings.lspConfig?.[language] || { mode: 'bundled', customCommand: '' };
    const mode = config.mode || 'bundled';
    const server = LSP_SERVERS[language];

    return (
      <div key={language} className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-800/50 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className={`text-sm font-semibold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                {server?.name || language} ({language})
              </p>
              <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                Server: {server?.serverName}
              </p>
            </div>
            <select
              value={mode}
              onChange={(e) => updateLspConfig(language, { mode: e.target.value })}
              className={`text-sm px-2 py-1 rounded border ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
            >
              <option value="bundled">Use bundled</option>
              <option value="system">Use system PATH</option>
              <option value="custom">Custom command/path</option>
            </select>
          </div>

          {mode === 'custom' && (
            <div className="flex flex-col gap-1">
              <label className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                Custom command or absolute path
              </label>
              <input
                type="text"
                value={config.customCommand || ''}
                onChange={(e) => updateLspConfig(language, { customCommand: e.target.value })}
                placeholder={server?.bundledPath || server?.serverName}
                className={`w-full text-sm px-2 py-1 rounded border ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        className={`w-full max-w-2xl rounded-lg shadow-2xl ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${
          theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-2">
            <Sparkles className={`w-6 h-6 ${
              theme === 'dark' ? 'text-purple-400' : 'text-purple-600'
            }`} />
            <h2 className={`text-xl font-bold ${
              theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
            }`}>
              AI Fix Settings
            </h2>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded transition-colors ${
              theme === 'dark'
                ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Provider Selection */}
          <div>
            <label className={`block text-sm font-semibold mb-3 ${
              theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
            }`}>
              AI Provider
            </label>

            <div className="space-y-3">
              {/* TinyLLM Mode */}
              <label className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                localSettings.provider === AI_PROVIDERS.TINYLLM
                  ? theme === 'dark'
                    ? 'border-purple-500 bg-purple-900/20'
                    : 'border-purple-500 bg-purple-50'
                  : theme === 'dark'
                    ? 'border-gray-700 hover:border-gray-600'
                    : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="radio"
                  name="provider"
                  value={AI_PROVIDERS.TINYLLM}
                  checked={localSettings.provider === AI_PROVIDERS.TINYLLM}
                  onChange={(e) => setLocalSettings({ ...localSettings, provider: e.target.value })}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    <span className={`font-semibold ${
                      theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                    }`}>
                      TinyLLM
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                      Free
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                      No API Key
                    </span>
                  </div>
                  <p className={`text-sm mt-1 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    Browser-based AI • JSON & XML only • 2-5MB model • 50-100ms processing
                  </p>
                  <p className={`text-xs mt-1 ${
                    theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600'
                  }`}>
                    ⚠️ XML/JSON files only. Notes AI features not available with this provider.
                  </p>
                </div>
              </label>

              {/* Groq Mode */}
              <label className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                localSettings.provider === AI_PROVIDERS.GROQ
                  ? theme === 'dark'
                    ? 'border-purple-500 bg-purple-900/20'
                    : 'border-purple-500 bg-purple-50'
                  : theme === 'dark'
                    ? 'border-gray-700 hover:border-gray-600'
                    : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="radio"
                  name="provider"
                  value={AI_PROVIDERS.GROQ}
                  checked={localSettings.provider === AI_PROVIDERS.GROQ}
                  onChange={(e) => setLocalSettings({ ...localSettings, provider: e.target.value })}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Cloud className="w-5 h-5" />
                    <span className={`font-semibold ${
                      theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                    }`}>
                      Groq
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                      Recommended
                    </span>
                  </div>
                  <p className={`text-sm mt-1 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    Fast cloud inference • Requires API key • Free tier available
                  </p>
                </div>
              </label>

              {/* OpenAI Mode */}
              <label className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                localSettings.provider === AI_PROVIDERS.OPENAI
                  ? theme === 'dark'
                    ? 'border-purple-500 bg-purple-900/20'
                    : 'border-purple-500 bg-purple-50'
                  : theme === 'dark'
                    ? 'border-gray-700 hover:border-gray-600'
                    : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="radio"
                  name="provider"
                  value={AI_PROVIDERS.OPENAI}
                  checked={localSettings.provider === AI_PROVIDERS.OPENAI}
                  onChange={(e) => setLocalSettings({ ...localSettings, provider: e.target.value })}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    <span className={`font-semibold ${
                      theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                    }`}>
                      OpenAI
                    </span>
                  </div>
                  <p className={`text-sm mt-1 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    Most capable models • Requires API key • Pay per use
                  </p>
                </div>
              </label>

              {/* Claude Mode - Desktop only (CORS restrictions in browser) */}
              {isDesktop && (
                <label className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  localSettings.provider === AI_PROVIDERS.CLAUDE
                    ? theme === 'dark'
                      ? 'border-purple-500 bg-purple-900/20'
                      : 'border-purple-500 bg-purple-50'
                    : theme === 'dark'
                      ? 'border-gray-700 hover:border-gray-600'
                      : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input
                    type="radio"
                    name="provider"
                    value={AI_PROVIDERS.CLAUDE}
                    checked={localSettings.provider === AI_PROVIDERS.CLAUDE}
                    onChange={(e) => setLocalSettings({ ...localSettings, provider: e.target.value })}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Cloud className="w-5 h-5" />
                      <span className={`font-semibold ${
                        theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                      }`}>
                        Claude
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                        Desktop
                      </span>
                    </div>
                    <p className={`text-sm mt-1 ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      Advanced reasoning • Requires API key • Pay per use
                    </p>
                  </div>
                </label>
              )}
            </div>
          </div>

          {/* Groq Settings */}
          {localSettings.provider === AI_PROVIDERS.GROQ && (
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-semibold mb-3 ${
                  theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
                }`}>
                  Groq API Key
                </label>

                {/* Get API Key Button */}
                <button
                  type="button"
                  onClick={() => openApiKeyPage('groq')}
                  className={`w-full mb-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded border-2 border-dashed transition-colors ${
                    theme === 'dark'
                      ? 'border-purple-500/50 bg-purple-900/20 hover:bg-purple-900/30 text-purple-300'
                      : 'border-purple-400/50 bg-purple-50 hover:bg-purple-100 text-purple-700'
                  }`}
                >
                  <ExternalLink className="w-4 h-4" />
                  <span className="font-medium">Get API Key from Groq</span>
                </button>

                <div className="relative">
                  <input
                    type={showGroqApiKey ? 'text' : 'password'}
                    value={localSettings.groqApiKey || ''}
                    onChange={(e) => handleGroqApiKeyChange(e.target.value)}
                    placeholder="Paste your Groq API key (gsk_...)"
                    className={`w-full px-4 py-2 pr-20 rounded border ${
                      groqApiKeyStatus === 'valid'
                        ? theme === 'dark'
                          ? 'border-green-500 bg-gray-700 text-gray-200'
                          : 'border-green-500 bg-white text-gray-900'
                        : groqApiKeyStatus === 'invalid'
                          ? theme === 'dark'
                            ? 'border-red-500 bg-gray-700 text-gray-200'
                            : 'border-red-500 bg-white text-gray-900'
                          : theme === 'dark'
                            ? 'bg-gray-700 border-gray-600 text-gray-200'
                            : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />

                  {/* Validation Icon */}
                  {groqApiKeyStatus && (
                    <div className="absolute right-16 top-1/2 -translate-y-1/2">
                      {groqApiKeyStatus === 'valid' ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowGroqApiKey(!showGroqApiKey)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded ${
                      theme === 'dark' ? 'text-gray-400 hover:bg-gray-600' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {showGroqApiKey ? 'Hide' : 'Show'}
                  </button>
                </div>

                {groqApiKeyStatus === 'valid' && (
                  <p className="text-xs mt-2 text-green-500 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    API key format looks correct
                  </p>
                )}
                {groqApiKeyStatus === 'invalid' && (
                  <p className="text-xs mt-2 text-red-500 flex items-center gap-1">
                    <XCircle className="w-3 h-3" />
                    Invalid key format. Groq keys start with 'gsk_'
                  </p>
                )}
              </div>

              <div>
                <label className={`block text-sm font-semibold mb-3 ${
                  theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
                }`}>
                  Groq Model
                </label>
                <select
                  value={localSettings.groqModel || GROQ_MODELS['llama-3.3-70b'].id}
                  onChange={(e) => setLocalSettings({ ...localSettings, groqModel: e.target.value })}
                  className={`w-full px-4 py-2 rounded border ${
                    theme === 'dark'
                      ? 'bg-gray-700 border-gray-600 text-gray-200'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  {Object.entries(GROQ_MODELS).map(([key, model]) => (
                    <option key={key} value={model.id}>
                      {model.name} - {model.description}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* OpenAI Settings */}
          {localSettings.provider === AI_PROVIDERS.OPENAI && (
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-semibold mb-3 ${
                  theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
                }`}>
                  OpenAI API Key
                </label>

                {/* Get API Key Button */}
                <button
                  type="button"
                  onClick={() => openApiKeyPage('openai')}
                  className={`w-full mb-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded border-2 border-dashed transition-colors ${
                    theme === 'dark'
                      ? 'border-purple-500/50 bg-purple-900/20 hover:bg-purple-900/30 text-purple-300'
                      : 'border-purple-400/50 bg-purple-50 hover:bg-purple-100 text-purple-700'
                  }`}
                >
                  <ExternalLink className="w-4 h-4" />
                  <span className="font-medium">Get API Key from OpenAI</span>
                </button>

                <div className="relative">
                  <input
                    type={showOpenAIApiKey ? 'text' : 'password'}
                    value={localSettings.openaiApiKey || ''}
                    onChange={(e) => handleOpenAIApiKeyChange(e.target.value)}
                    placeholder="Paste your OpenAI API key (sk-...)"
                    className={`w-full px-4 py-2 pr-20 rounded border ${
                      openaiApiKeyStatus === 'valid'
                        ? theme === 'dark'
                          ? 'border-green-500 bg-gray-700 text-gray-200'
                          : 'border-green-500 bg-white text-gray-900'
                        : openaiApiKeyStatus === 'invalid'
                          ? theme === 'dark'
                            ? 'border-red-500 bg-gray-700 text-gray-200'
                            : 'border-red-500 bg-white text-gray-900'
                          : theme === 'dark'
                            ? 'bg-gray-700 border-gray-600 text-gray-200'
                            : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />

                  {/* Validation Icon */}
                  {openaiApiKeyStatus && (
                    <div className="absolute right-16 top-1/2 -translate-y-1/2">
                      {openaiApiKeyStatus === 'valid' ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowOpenAIApiKey(!showOpenAIApiKey)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded ${
                      theme === 'dark' ? 'text-gray-400 hover:bg-gray-600' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {showOpenAIApiKey ? 'Hide' : 'Show'}
                  </button>
                </div>

                {openaiApiKeyStatus === 'valid' && (
                  <p className="text-xs mt-2 text-green-500 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    API key format looks correct
                  </p>
                )}
                {openaiApiKeyStatus === 'invalid' && (
                  <p className="text-xs mt-2 text-red-500 flex items-center gap-1">
                    <XCircle className="w-3 h-3" />
                    Invalid key format. OpenAI keys start with 'sk-'
                  </p>
                )}
              </div>

              <div>
                <label className={`block text-sm font-semibold mb-3 ${
                  theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
                }`}>
                  OpenAI Model
                </label>
                <select
                  value={localSettings.openaiModel || OPENAI_MODELS['gpt-4o-mini'].id}
                  onChange={(e) => setLocalSettings({ ...localSettings, openaiModel: e.target.value })}
                  className={`w-full px-4 py-2 rounded border ${
                    theme === 'dark'
                      ? 'bg-gray-700 border-gray-600 text-gray-200'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  {Object.entries(OPENAI_MODELS).map(([key, model]) => (
                    <option key={key} value={model.id}>
                      {model.name} - {model.description}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Claude Settings - Desktop only */}
          {isDesktop && localSettings.provider === AI_PROVIDERS.CLAUDE && (
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-semibold mb-3 ${
                  theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
                }`}>
                  Claude API Key
                </label>

                <button
                  type="button"
                  onClick={() => openApiKeyPage('claude')}
                  className={`w-full mb-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded border-2 border-dashed transition-colors ${
                    theme === 'dark'
                      ? 'border-purple-500/50 bg-purple-900/20 hover:bg-purple-900/30 text-purple-300'
                      : 'border-purple-400/50 bg-purple-50 hover:bg-purple-100 text-purple-700'
                  }`}
                >
                  <ExternalLink className="w-4 h-4" />
                  <span className="font-medium">Get API Key from Anthropic</span>
                </button>

                <div className="relative">
                  <input
                    type={showClaudeApiKey ? 'text' : 'password'}
                    value={localSettings.claudeApiKey || ''}
                    onChange={(e) => handleClaudeApiKeyChange(e.target.value)}
                    placeholder="Paste your Claude API key (sk-ant-...)"
                    className={`w-full px-4 py-2 pr-20 rounded border ${
                      claudeApiKeyStatus === 'valid'
                        ? theme === 'dark'
                          ? 'border-green-500 bg-gray-700 text-gray-200'
                          : 'border-green-500 bg-white text-gray-900'
                        : claudeApiKeyStatus === 'invalid'
                          ? theme === 'dark'
                            ? 'border-red-500 bg-gray-700 text-gray-200'
                            : 'border-red-500 bg-white text-gray-900'
                          : theme === 'dark'
                            ? 'bg-gray-700 border-gray-600 text-gray-200'
                            : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />

                  {claudeApiKeyStatus && (
                    <div className="absolute right-16 top-1/2 -translate-y-1/2">
                      {claudeApiKeyStatus === 'valid' ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowClaudeApiKey(!showClaudeApiKey)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded ${
                      theme === 'dark' ? 'text-gray-400 hover:bg-gray-600' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {showClaudeApiKey ? 'Hide' : 'Show'}
                  </button>
                </div>

                {claudeApiKeyStatus === 'valid' && (
                  <p className="text-xs mt-2 text-green-500 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    API key format looks correct
                  </p>
                )}
                {claudeApiKeyStatus === 'invalid' && (
                  <p className="text-xs mt-2 text-red-500 flex items-center gap-1">
                    <XCircle className="w-3 h-3" />
                    Invalid key format. Claude keys start with 'sk-ant-'
                  </p>
                )}
              </div>

              <div>
                <label className={`block text-sm font-semibold mb-3 ${
                  theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
                }`}>
                  Claude Model
                </label>
                <select
                  value={localSettings.claudeModel || CLAUDE_MODELS['claude-3-5-haiku'].id}
                  onChange={(e) => setLocalSettings({ ...localSettings, claudeModel: e.target.value })}
                  className={`w-full px-4 py-2 rounded border ${
                    theme === 'dark'
                      ? 'bg-gray-700 border-gray-600 text-gray-200'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  {Object.entries(CLAUDE_MODELS).map(([key, model]) => (
                    <option key={key} value={model.id}>
                      {model.name} - {model.description}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* AI Completions Toggle */}
          <div className={`border-t pt-6 ${
            theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <label className="flex items-start gap-4 cursor-pointer">
              <input
                type="checkbox"
                checked={localSettings.enableAICompletions || false}
                onChange={(e) => setLocalSettings({ ...localSettings, enableAICompletions: e.target.checked })}
                className="mt-1 w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${
                    theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                  }`}>
                    Enable AI-Powered Code Completions
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
                    Beta
                  </span>
                </div>
                <p className={`text-sm mt-1 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  Get context-aware code suggestions when you press Ctrl+Space.
                  AI completions appear at the top of the suggestion list marked with a ✨ icon.
                </p>
                <p className={`text-xs mt-2 ${
                  theme === 'dark' ? 'text-gray-500' : 'text-gray-500'
                }`}>
                  Note: AI completions only trigger on manual completion (Ctrl+Space), not while typing.
                  This helps reduce API costs and latency.
                </p>
              </div>
            </label>
          </div>

          {/* LSP (Language Server Protocol) Settings - Desktop only */}
          {isDesktop && (
            <div className={`border-t pt-6 ${
              theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <label className="flex items-start gap-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.enableLSP || false}
                  onChange={(e) => setLocalSettings({ ...localSettings, enableLSP: e.target.checked })}
                  className="mt-1 w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${
                      theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                    }`}>
                      Enable Language Server Protocol (LSP)
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                      Desktop • Experimental
                    </span>
                  </div>
                  <p className={`text-sm mt-1 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    Get IDE-like features: advanced autocomplete, hover documentation, diagnostics, go-to-definition, and more.
                  </p>
                  <p className={`text-xs mt-2 ${
                    theme === 'dark' ? 'text-gray-500' : 'text-gray-500'
                  }`}>
                    Supported languages: JavaScript/TypeScript, Python, Rust, Java, C/C++, PHP
                  </p>
                  <p className={`text-xs mt-1 ${
                    theme === 'dark' ? 'text-gray-500' : 'text-gray-500'
                  }`}>
                    Choose bundled, system PATH, or a custom path per language below.
                  </p>
                </div>
              </label>

              {localSettings.enableLSP && (
                <div className="mt-4 space-y-3">
                  <div className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-800'}`}>
                    Configure how each language server is resolved. Bundled uses the LSP binaries packaged with the app; system uses PATH; custom lets you point to a specific executable.
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {Object.keys(LSP_SERVERS).map(lang => renderLspConfigRow(lang))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Privacy Notice */}
          <div className={`p-4 rounded-lg ${
            theme === 'dark' ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200'
          }`}>
            <div className="flex items-start gap-2">
              <AlertCircle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
              }`} />
              <div>
                <p className={`text-sm font-semibold ${
                  theme === 'dark' ? 'text-blue-300' : 'text-blue-900'
                }`}>
                  Privacy & Security
                </p>
                <p className={`text-xs mt-1 ${
                  theme === 'dark' ? 'text-blue-400' : 'text-blue-700'
                }`}>
                  <strong>Cloud AI:</strong> Your content will be sent to the provider's servers for processing.
                  <br />
                  <strong>API Keys:</strong> Encrypted before storage using AES-256-GCM. Keys never leave your device.
                  <br />
                  <strong>Completions:</strong> Code context (up to ~20 lines) is sent when you manually trigger AI completions.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-3 p-6 border-t ${
          theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded transition-colors ${
              theme === 'dark'
                ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
            }`}
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-4 py-2 rounded transition-colors ${
              theme === 'dark'
                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                : 'bg-purple-500 hover:bg-purple-600 text-white'
            }`}
          >
            <Check className="w-4 h-4" />
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default AISettingsModal;

import React, { useState, useEffect } from 'react';
import { X, Download, CheckCircle, AlertCircle, ExternalLink, RefreshCw, Monitor } from 'lucide-react';

const OllamaSetupWizard = ({ onClose, onComplete, theme, desktopAIService, defaultModel }) => {
  const [step, setStep] = useState('checking'); // checking, not-installed, installing, completed
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [selectedModel, setSelectedModel] = useState(defaultModel || 'llama3.1:8b');
  const [isChecking, setIsChecking] = useState(false);

  const models = {
    'llama3.1:8b': {
      name: 'Llama 3.1 8B',
      size: '4.7 GB',
      speed: 'Fast',
      description: 'Best for large files (128K context)',
      recommended: true
    },
    'qwen2.5-coder:7b': {
      name: 'Qwen2.5 Coder 7B',
      size: '4.7 GB',
      speed: 'Medium',
      description: 'High quality code generation',
      recommended: false
    },
    'qwen2.5-coder:3b': {
      name: 'Qwen2.5 Coder 3B',
      size: '2 GB',
      speed: 'Fast',
      description: 'Balanced performance',
      recommended: false
    },
    'qwen2.5-coder:1.5b': {
      name: 'Qwen2.5 Coder 1.5B',
      size: '1 GB',
      speed: 'Very Fast',
      description: 'Fast, small files only',
      recommended: false
    },
    'deepseek-r1:8b': {
      name: 'DeepSeek R1 8B',
      size: '4.9 GB',
      speed: 'Medium',
      description: 'Reasoning model (not for large files)',
      recommended: false
    },
    'codellama:7b': {
      name: 'CodeLlama 7B',
      size: '3.8 GB',
      speed: 'Medium',
      description: 'Meta\'s code model',
      recommended: false
    },
    'llama3.2:3b': {
      name: 'Llama 3.2 3B',
      size: '2 GB',
      speed: 'Fast',
      description: 'General purpose',
      recommended: false
    }
  };

  // Check Ollama status on mount
  useEffect(() => {
    checkOllamaStatus();
  }, []);

  const checkOllamaStatus = async () => {
    console.log('[OllamaSetupWizard] Checking Ollama status, defaultModel:', defaultModel);
    setIsChecking(true);
    try {
      const status = await desktopAIService.checkOllamaStatus();
      setOllamaStatus(status);
      console.log('[OllamaSetupWizard] Ollama status:', status);

      if (status.available) {
        // If a defaultModel was provided, check if that specific model is available
        if (defaultModel) {
          const isModelAvailable = status.models && status.models.includes(defaultModel);
          console.log('[OllamaSetupWizard] Default model available:', isModelAvailable);
          if (!isModelAvailable) {
            // Specific model not available, go to model selection to download it
            console.log('[OllamaSetupWizard] Going to no-models step to download', defaultModel);
            setStep('no-models');
            return;
          }
        }

        // Check if at least one model is available
        if (status.models && status.models.length > 0) {
          console.log('[OllamaSetupWizard] Models available, going to completed');
          setStep('completed');
        } else {
          console.log('[OllamaSetupWizard] No models available, going to no-models');
          setStep('no-models');
        }
      } else {
        console.log('[OllamaSetupWizard] Ollama not available, going to not-installed');
        setStep('not-installed');
      }
    } catch (error) {
      console.error('Failed to check Ollama status:', error);
      setStep('not-installed');
    } finally {
      setIsChecking(false);
    }
  };

  const handleDownloadModel = async () => {
    setStep('downloading');
    try {
      await desktopAIService.pullModel(selectedModel, (progress) => {
        console.log('Download progress:', progress);
      });
      setStep('completed');
    } catch (error) {
      console.error('Failed to download model:', error);
      alert(`Failed to download model: ${error.message}`);
      setStep('no-models');
    }
  };

  const handleComplete = () => {
    onComplete();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className={`w-full max-w-2xl rounded-lg shadow-2xl ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${
          theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-3">
            <Monitor className={`w-6 h-6 ${
              theme === 'dark' ? 'text-green-400' : 'text-green-600'
            }`} />
            <h2 className={`text-xl font-bold ${
              theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
            }`}>
              Desktop AI Setup
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
        <div className="p-6">
          {/* Step 1: Checking */}
          {step === 'checking' && (
            <div className="text-center py-8">
              <RefreshCw className={`w-16 h-16 mx-auto mb-4 animate-spin ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`} />
              <h3 className={`text-lg font-semibold mb-2 ${
                theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
              }`}>
                Checking Ollama Installation...
              </h3>
              <p className={`text-sm ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Please wait while we detect Ollama on your system
              </p>
            </div>
          )}

          {/* Step 2: Ollama Not Installed */}
          {step === 'not-installed' && (
            <div className="space-y-6">
              <div className={`p-4 rounded-lg border-2 ${
                theme === 'dark'
                  ? 'bg-yellow-900/20 border-yellow-600'
                  : 'bg-yellow-50 border-yellow-400'
              }`}>
                <div className="flex items-start gap-3">
                  <AlertCircle className={`w-6 h-6 flex-shrink-0 ${
                    theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600'
                  }`} />
                  <div>
                    <h3 className={`font-semibold mb-1 ${
                      theme === 'dark' ? 'text-yellow-300' : 'text-yellow-900'
                    }`}>
                      Ollama Not Found
                    </h3>
                    <p className={`text-sm ${
                      theme === 'dark' ? 'text-yellow-400' : 'text-yellow-700'
                    }`}>
                      Ollama is required to use Desktop AI features. It provides fast, private, local AI processing.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className={`font-semibold ${
                  theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
                }`}>
                  Installation Steps:
                </h4>

                <ol className={`space-y-3 text-sm ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  <li className="flex items-start gap-3">
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      theme === 'dark'
                        ? 'bg-purple-600 text-white'
                        : 'bg-purple-500 text-white'
                    }`}>
                      1
                    </span>
                    <div>
                      <strong>Download Ollama</strong>
                      <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                        Visit ollama.ai and download the installer for your operating system
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start gap-3">
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      theme === 'dark'
                        ? 'bg-purple-600 text-white'
                        : 'bg-purple-500 text-white'
                    }`}>
                      2
                    </span>
                    <div>
                      <strong>Install Ollama</strong>
                      <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                        Run the installer and follow the setup instructions
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start gap-3">
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      theme === 'dark'
                        ? 'bg-purple-600 text-white'
                        : 'bg-purple-500 text-white'
                    }`}>
                      3
                    </span>
                    <div>
                      <strong>Verify Installation</strong>
                      <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                        Click "Check Again" below to verify Ollama is running
                      </p>
                    </div>
                  </li>
                </ol>

                <div className="flex gap-3 pt-4">
                  <a
                    href="https://ollama.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded font-medium transition-colors ${
                      theme === 'dark'
                        ? 'bg-purple-600 hover:bg-purple-700 text-white'
                        : 'bg-purple-500 hover:bg-purple-600 text-white'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    Download Ollama
                    <ExternalLink className="w-4 h-4" />
                  </a>

                  <button
                    onClick={checkOllamaStatus}
                    disabled={isChecking}
                    className={`px-4 py-3 rounded font-medium transition-colors ${
                      theme === 'dark'
                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                    } ${isChecking ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: No Models Installed */}
          {step === 'no-models' && (
            <div className="space-y-6">
              <div className={`p-4 rounded-lg ${
                theme === 'dark' ? 'bg-green-900/20' : 'bg-green-50'
              }`}>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                  <div>
                    <h3 className={`font-semibold mb-1 ${
                      theme === 'dark' ? 'text-green-300' : 'text-green-900'
                    }`}>
                      Ollama Detected!
                    </h3>
                    <p className={`text-sm ${
                      theme === 'dark' ? 'text-green-400' : 'text-green-700'
                    }`}>
                      Now let's download an AI model to get started.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className={`font-semibold mb-3 ${
                  theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
                }`}>
                  Choose a Model:
                </h4>

                <div className="space-y-3">
                  {Object.entries(models).map(([id, model]) => (
                    <label
                      key={id}
                      className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedModel === id
                          ? theme === 'dark'
                            ? 'border-purple-500 bg-purple-900/20'
                            : 'border-purple-500 bg-purple-50'
                          : theme === 'dark'
                            ? 'border-gray-700 hover:border-gray-600'
                            : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="model"
                        value={id}
                        checked={selectedModel === id}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${
                            theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                          }`}>
                            {model.name}
                          </span>
                          {model.recommended && (
                            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400 font-medium">
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className={`text-xs mt-1 ${
                          theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          {model.description}
                        </p>
                        <p className={`text-xs mt-1 ${
                          theme === 'dark' ? 'text-gray-500' : 'text-gray-500'
                        }`}>
                          {model.size} • {model.speed}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>

                <button
                  onClick={handleDownloadModel}
                  className={`w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 rounded font-medium transition-colors ${
                    theme === 'dark'
                      ? 'bg-purple-600 hover:bg-purple-700 text-white'
                      : 'bg-purple-500 hover:bg-purple-600 text-white'
                  }`}
                >
                  <Download className="w-4 h-4" />
                  Download {models[selectedModel].name}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Downloading */}
          {step === 'downloading' && (
            <div className="text-center py-8">
              <Download className={`w-16 h-16 mx-auto mb-4 animate-pulse ${
                theme === 'dark' ? 'text-purple-400' : 'text-purple-500'
              }`} />
              <h3 className={`text-lg font-semibold mb-2 ${
                theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
              }`}>
                Downloading {models[selectedModel].name}...
              </h3>
              <p className={`text-sm ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}>
                This may take a few minutes depending on your connection
              </p>
              <div className={`mt-4 px-8 ${
                theme === 'dark' ? 'text-gray-500' : 'text-gray-500'
              }`}>
                <p className="text-xs">
                  Size: {models[selectedModel].size}
                </p>
              </div>
            </div>
          )}

          {/* Step 5: Completed */}
          {step === 'completed' && (
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
              <h3 className={`text-lg font-semibold mb-2 ${
                theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
              }`}>
                Setup Complete!
              </h3>
              <p className={`text-sm mb-6 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Desktop AI is ready to use. You can now enjoy fast, private, local AI processing.
              </p>

              {ollamaStatus?.models && ollamaStatus.models.length > 0 && (
                <div className={`mb-6 p-4 rounded-lg ${
                  theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
                }`}>
                  <p className={`text-sm font-semibold mb-2 ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Available Models:
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {ollamaStatus.models.map((model, idx) => (
                      <span
                        key={idx}
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          theme === 'dark'
                            ? 'bg-purple-600 text-white'
                            : 'bg-purple-500 text-white'
                        }`}
                      >
                        {model}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleComplete}
                className={`px-6 py-3 rounded font-medium transition-colors ${
                  theme === 'dark'
                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                    : 'bg-purple-500 hover:bg-purple-600 text-white'
                }`}
              >
                Start Using Desktop AI
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OllamaSetupWizard;

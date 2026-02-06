/**
 * AIProviderSelector Component
 *
 * Compact dropdown for selecting AI provider and model.
 * Used in AIResultsPanel header and optionally in AISettingsModal.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Cpu, Check } from 'lucide-react';
import { providerManager } from '../services/ai/index.js';

export default function AIProviderSelector({
  theme = 'dark',
  currentProvider = '',
  currentModel = '',
  onProviderChange,
  onModelChange,
  compact = false,
  disabled = false,
  className = '',
  refreshKey = 0,
  autoSelected = false,
}) {
  const isDark = theme === 'dark';
  const [providerOpen, setProviderOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [providers, setProviders] = useState([]);
  const [models, setModels] = useState([]);
  const providerRef = useRef(null);
  const modelRef = useRef(null);

  // Load available providers (re-fetch when refreshKey changes)
  useEffect(() => {
    try {
      const available = providerManager.getAvailableProviders();
      setProviders((available || []).filter((p) => p.isReady));
    } catch {
      setProviders([]);
    }
  }, [refreshKey]);

  // Load models when provider changes
  useEffect(() => {
    if (!currentProvider) {
      setModels([]);
      return;
    }

    const loadModels = async () => {
      try {
        const provider = providerManager.getProvider(currentProvider);
        if (!provider) {
          setModels([]);
          return;
        }

        // For Ollama, fetch only downloaded models dynamically
        if (currentProvider === 'ollama' && typeof provider.getAvailableModels === 'function') {
          try {
            const availableModels = await provider.getAvailableModels();
            if (availableModels && availableModels.length > 0) {
              setModels(availableModels);
              return;
            }
          } catch (err) {
            console.warn('[AIProviderSelector] Failed to fetch Ollama models:', err);
          }
        }

        // Fall back to config models for other providers
        if (provider.config?.models) {
          setModels(provider.config.models);
        } else {
          setModels([]);
        }
      } catch {
        setModels([]);
      }
    };

    loadModels();
  }, [currentProvider, refreshKey]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (providerRef.current && !providerRef.current.contains(e.target)) {
        setProviderOpen(false);
      }
      if (modelRef.current && !modelRef.current.contains(e.target)) {
        setModelOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleProviderSelect = useCallback(
    (providerId) => {
      setProviderOpen(false);
      if (onProviderChange) onProviderChange(providerId);
    },
    [onProviderChange]
  );

  const handleModelSelect = useCallback(
    (modelId) => {
      setModelOpen(false);
      if (onModelChange) onModelChange(modelId);
    },
    [onModelChange]
  );

  const currentProviderInfo = providers.find((p) => p.id === currentProvider);
  const currentModelInfo = models.find((m) => m.id === currentModel);

  const dropdownClasses = isDark
    ? 'bg-gray-800 border-gray-700 text-gray-200 shadow-lg'
    : 'bg-white border-gray-300 text-gray-800 shadow-lg';

  const buttonClasses = isDark
    ? 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'
    : 'bg-gray-100 border-gray-300 text-gray-800 hover:bg-gray-200';

  const itemHoverClasses = isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Provider Dropdown */}
      <div className="relative" ref={providerRef}>
        <button
          onClick={() => !disabled && setProviderOpen(!providerOpen)}
          disabled={disabled}
          className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded border ${buttonClasses} ${
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          <Cpu className="w-3 h-3" />
          <span>{currentProviderInfo?.name || 'Select Provider'}</span>
          {autoSelected && (
            <span className="text-[9px] px-1 py-0 rounded bg-purple-500/20 text-purple-400">Auto</span>
          )}
          <ChevronDown className="w-3 h-3" />
        </button>

        {providerOpen && (
          <div
            className={`absolute top-full left-0 mt-1 min-w-[160px] rounded border z-50 py-1 ${dropdownClasses}`}
          >
            {providers.map((provider) => (
              <button
                key={provider.id}
                onClick={() => handleProviderSelect(provider.id)}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between ${itemHoverClasses}`}
              >
                <span>{provider.name}</span>
                {provider.id === currentProvider && (
                  <Check className="w-3 h-3 text-blue-400" />
                )}
              </button>
            ))}
            {providers.length === 0 && (
              <div className="px-3 py-1.5 text-xs text-gray-500">
                No providers available
              </div>
            )}
          </div>
        )}
      </div>

      {/* Model Dropdown */}
      {!compact && currentProvider && (
        <div className="relative" ref={modelRef}>
          <button
            onClick={() => !disabled && setModelOpen(!modelOpen)}
            disabled={disabled}
            className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded border ${buttonClasses} ${
              disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
          >
            <span className="max-w-[140px] truncate">
              {currentModelInfo?.name || currentModel || 'Select Model'}
            </span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {modelOpen && (
            <div
              className={`absolute top-full left-0 mt-1 min-w-[200px] max-h-[240px] overflow-y-auto rounded border z-50 py-1 ${dropdownClasses}`}
            >
              {models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleModelSelect(model.id)}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 ${itemHoverClasses}`}
                >
                  <span className="truncate">{model.name}</span>
                  <div className="flex items-center gap-1">
                    {model.contextWindow && (
                      <span className="text-gray-500 text-[10px] whitespace-nowrap">
                        {Math.round(model.contextWindow / 1000)}K
                      </span>
                    )}
                    {model.id === currentModel && (
                      <Check className="w-3 h-3 text-blue-400" />
                    )}
                  </div>
                </button>
              ))}
              {models.length === 0 && (
                <div className="px-3 py-1.5 text-xs text-gray-500">
                  No models available
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

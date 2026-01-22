import React from 'react';
import { X } from 'lucide-react';
import { HelpContent } from './HelpContent';

export const HelpModal = ({ isOpen, onClose, contentType, theme }) => {
  if (!isOpen || !contentType) return null;

  const helpData = HelpContent[contentType];
  if (!helpData) return null;

  const Icon = helpData.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-4xl max-h-[85vh] rounded-xl shadow-2xl border overflow-hidden ${
          theme === 'dark'
            ? 'bg-gray-900/95 border-gray-800'
            : 'bg-white border-gray-200'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`sticky top-0 z-10 px-6 py-4 border-b backdrop-blur-sm ${
          theme === 'dark'
            ? 'bg-gray-900/95 border-gray-800'
            : 'bg-white/95 border-gray-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                theme === 'dark' ? 'bg-blue-900/30' : 'bg-blue-100'
              }`}>
                <Icon size={24} className={theme === 'dark' ? 'text-blue-400' : 'text-blue-600'} />
              </div>
              <h2 className={`text-xl font-bold ${
                theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
              }`}>
                {helpData.title}
              </h2>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${
                theme === 'dark'
                  ? 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'
                  : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
              }`}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className={`overflow-y-auto px-6 py-6 ${
          theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
        }`}
        style={{ maxHeight: 'calc(85vh - 80px)' }}
        >
          {helpData.content(theme)}
        </div>
      </div>
    </div>
  );
};

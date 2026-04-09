import React, { useEffect, useRef } from 'react';
import { X, FileCode, StickyNote, HardDrive, Cloud } from 'lucide-react';

/** GitHub mark as inline SVG */
function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  );
}

export function AuthModal({ onClose, initGoogleButton, onSignInGitHub }) {
  const googleBtnRef = useRef(null);

  useEffect(() => {
    if (!googleBtnRef.current || !initGoogleButton) return;
    initGoogleButton(
      googleBtnRef.current,
      onClose,      // onSuccess — close modal once signed in
      console.error // onError
    );
  }, [initGoogleButton, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-sm p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-white"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Title */}
        <div className="text-center mb-5">
          <div className="text-xl font-bold text-white tracking-tight mb-1">Sync your notes</div>
          <p className="text-sm text-gray-400">Sign in to access your notes from any browser or device</p>
        </div>

        {/* What syncs vs what stays local */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-indigo-950/60 border border-indigo-800/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Cloud className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wide">Synced</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-300">
              <StickyNote className="w-3 h-3 text-indigo-400 shrink-0" />
              Notes &amp; folders
            </div>
          </div>
          <div className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wide">Always local</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-300 mb-1">
              <FileCode className="w-3 h-3 text-emerald-400 shrink-0" />
              Files &amp; code
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-300">
              <FileCode className="w-3 h-3 text-emerald-400 shrink-0" />
              Editor settings
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 mb-5 text-center">
          Sync is <span className="text-white font-medium">opt-in</span> — TidyCode works fully without an account. Nothing is uploaded unless you sign in.
        </p>

        {/* Google button — rendered by GSI into this div */}
        <div
          ref={googleBtnRef}
          className="w-full flex justify-center mb-3"
          style={{ minHeight: '44px' }}
        />

        {/* GitHub fallback */}
        <button
          onClick={onSignInGitHub}
          className="w-full flex items-center justify-center gap-3 bg-gray-800 hover:bg-gray-700 text-white font-medium text-sm py-2.5 px-4 rounded-lg border border-gray-700 transition-colors"
        >
          <GitHubIcon />
          Continue with GitHub
        </button>

        <p className="text-center text-xs text-gray-600 mt-4">
          Your notes are stored per account. No data is shared with third parties.
        </p>
      </div>
    </div>
  );
}

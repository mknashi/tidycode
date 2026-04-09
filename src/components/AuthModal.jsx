import React, { useEffect, useRef } from 'react';
import { X, Check, FileCode, StickyNote, CheckSquare, HardDrive, Cloud } from 'lucide-react';

const SyncRow = ({ icon: Icon, label, synced }) => (
  <div className="flex items-center gap-2 text-xs py-1">
    <Icon className={`w-3.5 h-3.5 shrink-0 ${synced ? 'text-indigo-400' : 'text-gray-500'}`} />
    <span className={synced ? 'text-gray-200' : 'text-gray-500'}>{label}</span>
    <span className="ml-auto">
      {synced
        ? <Check className="w-3.5 h-3.5 text-emerald-400" />
        : <X className="w-3.5 h-3.5 text-gray-600" />}
    </span>
  </div>
);

export function AuthModal({ onClose, initGoogleButton }) {
  const googleBtnRef = useRef(null);

  useEffect(() => {
    if (!googleBtnRef.current || !initGoogleButton) return;
    initGoogleButton(googleBtnRef.current, onClose, console.error);
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
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <Cloud className="w-4 h-4 text-indigo-400" />
            <span className="text-base font-bold text-white">Sync your notes &amp; tasks</span>
          </div>
          <p className="text-xs text-gray-400">Sign in to access them from any browser or device. Everything else stays on your device.</p>
        </div>

        {/* What syncs / what doesn't */}
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg px-4 py-3 mb-5 space-y-0.5">
          <SyncRow icon={StickyNote}   label="Notes &amp; folders"  synced={true} />
          <SyncRow icon={CheckSquare}  label="Tasks &amp; lists"    synced={true} />
          <div className="border-t border-gray-700/50 my-2" />
          <SyncRow icon={FileCode}     label="Files &amp; code"     synced={false} />
          <SyncRow icon={HardDrive}    label="Editor settings"      synced={false} />
        </div>

        <p className="text-xs text-gray-500 mb-5 text-center">
          Sync is <span className="text-white font-medium">opt-in</span> — TidyCode works fully without an account.
        </p>

        {/* Google button — rendered by GSI into this div */}
        <div
          ref={googleBtnRef}
          className="w-full flex justify-center"
          style={{ minHeight: '44px' }}
        />
      </div>
    </div>
  );
}

import React, { lazy, Suspense, forwardRef } from 'react';
import { isDesktop } from '../utils/platform';

// Lazy load TerminalPanel only when needed (desktop mode)
const TerminalPanel = lazy(() => import('./TerminalPanel'));

/**
 * TerminalPanelWrapper Component
 * Conditionally loads TerminalPanel only in desktop mode
 * This prevents xterm.js from being bundled in web builds
 */
const TerminalPanelWrapper = forwardRef((props, ref) => {
  // Only render terminal in desktop mode
  if (!isDesktop()) {
    return (
      <div className={`flex items-center justify-center h-full ${
        props.theme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-gray-50 text-gray-600'
      }`}>
        <p>Terminal is only available in desktop mode</p>
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div className={`flex items-center justify-center h-full ${
        props.theme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-gray-50 text-gray-600'
      }`}>
        <p>Loading terminal...</p>
      </div>
    }>
      <TerminalPanel ref={ref} {...props} />
    </Suspense>
  );
});

TerminalPanelWrapper.displayName = 'TerminalPanelWrapper';

export default TerminalPanelWrapper;

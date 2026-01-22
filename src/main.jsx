import React from 'react'
import ReactDOM from 'react-dom/client'
import TidyCode from './TidyCode.jsx'
import './index.css'

// Initialize Tauri API if running in desktop mode
// This ensures window.__TAURI__ is available before React renders
if (window.__TAURI_INTERNALS__) {
  import('@tauri-apps/api').then(() => {
    console.log('[Tauri] API initialized');
  }).catch(err => {
    console.warn('[Tauri] Failed to initialize API:', err);
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TidyCode />
  </React.StrictMode>,
)

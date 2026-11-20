import React from 'react';
import { useChromeNanoStatus } from '../hooks/useChromeNanoStatus.js';

export default function PrivateAIStatus({ compact = false }) {
  const { state, progress, reason, startDownload, retry, cancel } = useChromeNanoStatus();
  const pending = ['initializing', 'downloading', 'stalled'].includes(state);
  if (compact && !pending) return null;
  return <div className="text-xs space-y-2 p-2 rounded border border-current/20" role="status" aria-live="polite">
    <p>Private AI: {state === 'ready' ? 'Ready — runs on this device' : state.replaceAll('-', ' ')}</p>
    {reason && <p>{reason}</p>}
    {state === 'needs-download' && <>
      <p>Chrome downloads a model of approximately 4 GB. Allow 22 GB free disk space and use an unmetered connection. Content processed by this model stays on this device.</p>
      <button type="button" className="underline" onClick={() => startDownload().catch(() => {})}>Download / prepare Private AI</button>
    </>}
    {pending && <><progress className="w-full" max="1" value={progress} aria-label="Model download progress" /><button type="button" className="underline" onClick={cancel}>Cancel</button></>}
    {['stalled', 'error'].includes(state) && <>
      <button type="button" className="underline ml-2" onClick={() => retry().catch(() => {})}>Retry</button>
      <button type="button" className="underline ml-2" onClick={() => navigator.clipboard.writeText('chrome://on-device-internals').catch(() => {})}>Copy diagnostics address</button>
      <p>For Chrome diagnostics, paste <code>chrome://on-device-internals</code> into the address bar.</p>
    </>}
    {!compact && <p>Model downloads and updates are managed automatically by Chrome. If an update interrupts a request, prepare Private AI again if prompted, then retry your request.</p>}
    {!compact && <p>Supports brief explanations, log summaries and short text chat, including grammar correction. Small-JSON repair is experimental; XML repair is not enabled. Cloud processing requires choosing a cloud provider explicitly.</p>}
  </div>;
}

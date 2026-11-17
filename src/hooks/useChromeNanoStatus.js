import { useEffect, useSyncExternalStore } from 'react';
import { chromeNanoProvider } from '../services/ai/providers/ChromeBuiltInProvider.js';

export function useChromeNanoStatus() {
  const status = useSyncExternalStore(chromeNanoProvider.status.subscribe, chromeNanoProvider.status.getSnapshot);
  useEffect(() => {
    chromeNanoProvider.initialize();
    const refresh = () => { if (document.visibilityState === 'visible') void chromeNanoProvider.refreshAvailability(); };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => { document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  return { ...status, startDownload: () => chromeNanoProvider.startDownload(), retry: () => chromeNanoProvider.retry(), cancel: () => chromeNanoProvider.cancel() };
}

/**
 * Opens a URL in the default browser or new tab
 * Works across Tauri desktop and web environments
 */
export const openUrl = async (url) => {
  if (!url) return;

  // Try Tauri shell methods (desktop)
  if (window?.__TAURI_INTERNALS__) {
    // Try using __TAURI_INTERNALS__.invoke (Tauri v2)
    const tauriInternals = window.__TAURI_INTERNALS__;
    if (typeof tauriInternals?.invoke === 'function') {
      try {
        console.info('[openUrl] Opening via __TAURI_INTERNALS__.invoke plugin:shell|open');
        await tauriInternals.invoke('plugin:shell|open', { url });
        return;
      } catch (error) {
        console.warn('[openUrl] Failed via __TAURI_INTERNALS__.invoke with url param', error);
        try {
          console.info('[openUrl] Retrying with path param');
          await tauriInternals.invoke('plugin:shell|open', { path: url });
          return;
        } catch (error2) {
          console.warn('[openUrl] Failed via __TAURI_INTERNALS__.invoke with path param', error2);
        }
      }
    }
  }

  if (window?.__TAURI__) {
    // Try tauri.shell.open
    const shellOpen = window?.__TAURI__?.shell?.open;
    if (typeof shellOpen === 'function') {
      try {
        console.info('[openUrl] Opening via tauri.shell.open');
        await shellOpen(url);
        return;
      } catch (error) {
        console.warn('[openUrl] Failed via tauri.shell.open', error);
      }
    }

    // Try tauri.core.invoke plugin:shell|open
    const tauriCoreInvoke = window?.__TAURI__?.core?.invoke;
    if (typeof tauriCoreInvoke === 'function') {
      try {
        console.info('[openUrl] Opening via tauri.core.invoke plugin:shell|open with url');
        await tauriCoreInvoke('plugin:shell|open', { url });
        return;
      } catch (error) {
        console.warn('[openUrl] Failed via tauri.core.invoke with url param', error);
        try {
          console.info('[openUrl] Retrying with path param');
          await tauriCoreInvoke('plugin:shell|open', { path: url });
          return;
        } catch (error2) {
          console.warn('[openUrl] Failed via tauri.core.invoke with path param', error2);
        }
      }
    }

    // Try tauri.invoke (v1)
    const tauriInvokeV1 = window?.__TAURI__?.invoke;
    if (typeof tauriInvokeV1 === 'function') {
      try {
        console.info('[openUrl] Opening via tauri.invoke plugin:shell|open');
        await tauriInvokeV1('plugin:shell|open', { url });
        return;
      } catch (error) {
        console.warn('[openUrl] Failed via tauri.invoke v1 with url param', error);
        try {
          await tauriInvokeV1('plugin:shell|open', { path: url });
          return;
        } catch (error2) {
          console.warn('[openUrl] Failed via tauri.invoke v1 with path param', error2);
        }
      }
    }

    // Try __TAURI_INVOKE__ (legacy)
    const tauriInvokeLegacy = window?.__TAURI_INVOKE__;
    if (typeof tauriInvokeLegacy === 'function') {
      try {
        console.info('[openUrl] Opening via __TAURI_INVOKE__ plugin:shell|open');
        await tauriInvokeLegacy('plugin:shell|open', { url });
        return;
      } catch (error) {
        console.warn('[openUrl] Failed via __TAURI_INVOKE__ with url param', error);
        try {
          await tauriInvokeLegacy('plugin:shell|open', { path: url });
          return;
        } catch (error2) {
          console.warn('[openUrl] Failed via __TAURI_INVOKE__ with path param', error2);
        }
      }
    }
  }

  // Fallback to window.open for web or if Tauri methods fail
  console.info('[openUrl] Falling back to window.open');
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (opened) return;

  // Try anchor click fallback (helps bypass some popup blockers)
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.click();
};

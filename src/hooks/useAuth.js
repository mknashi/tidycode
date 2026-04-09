import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/**
 * Lazily loads the Google Sign-In (GSI) script.
 * Resolves immediately if it's already loaded.
 */
function loadGSI() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) { resolve(); return; }
    const existing = document.getElementById('gsi-script');
    if (existing) {
      existing.addEventListener('load', resolve);
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id = 'gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * Manages Supabase auth session and exposes sign-in / sign-out helpers.
 *
 * Google sign-in uses the GSI library with signInWithIdToken — the OAuth
 * consent screen stays on your own domain, never redirecting through Supabase.
 *
 * GitHub sign-in still uses the Supabase OAuth redirect flow.
 *
 * When Supabase is not configured (missing env vars) the hook returns
 * { session: null, user: null, loading: false } and all actions are no-ops.
 */
export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  /**
   * Renders Google's official sign-in button into `containerEl`.
   * When the user completes sign-in, Supabase receives the ID token directly
   * — no redirect to supabase.co, so Google's consent screen shows TidyCode.
   *
   * @param {HTMLElement} containerEl - div to render the button into
   * @param {() => void} onSuccess    - called after successful sign-in
   * @param {(err: Error) => void} onError
   */
  const initGoogleButton = useCallback(async (containerEl, onSuccess, onError) => {
    if (!isSupabaseConfigured || !GOOGLE_CLIENT_ID || !containerEl) return;
    try {
      await loadGSI();
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          const { error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: credential,
          });
          if (error) { onError?.(error); } else { onSuccess?.(); }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      window.google.accounts.id.renderButton(containerEl, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: containerEl.offsetWidth || 320,
      });
    } catch (err) {
      onError?.(err);
    }
  }, []);

  const signInWithGitHub = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.origin }
    });
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    // Cancel any pending One Tap prompt
    if (window.google?.accounts?.id) {
      window.google.accounts.id.cancel();
    }
    await supabase.auth.signOut();
  }, []);

  return {
    session,
    user: session?.user ?? null,
    loading,
    initGoogleButton,
    signInWithGitHub,
    signOut,
    isConfigured: isSupabaseConfigured,
  };
}

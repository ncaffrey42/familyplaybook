/**
 * Native OAuth deep-link bridge.
 *
 * In a WebView, Supabase OAuth (Google/Facebook/Discord/Apple) can't complete
 * with a normal web redirect — the provider bounces back to a custom URL
 * scheme (familyplaybook://auth/callback?code=…). This module listens for that
 * deep link via the Capacitor App plugin and exchanges the code for a session.
 *
 * Entirely web-safe: `initNativeAuth` returns immediately on web (isNative()
 * is false), so importing/calling it in main.jsx has zero effect on the
 * browser/Docker build.
 */
import { supabase } from '@/lib/supabaseClient';
import { isNative } from '@/lib/native';
import { addBreadcrumb } from '@/lib/errorLogger';

let registered = false;

/** Register the appUrlOpen handler once. No-op on web. */
export async function initNativeAuth() {
  if (!isNative() || registered) return;
  registered = true;

  // Dynamically imported so the web bundle never pulls the native plugin.
  const { App } = await import('@capacitor/app');

  App.addListener('appUrlOpen', async ({ url }) => {
    if (!url || !url.includes('auth/callback')) return;
    addBreadcrumb('nativeAuth: appUrlOpen', { url });
    try {
      // PKCE flow: the deep link carries ?code=…
      const parsed = new URL(url);
      const code = parsed.searchParams.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        return;
      }
      // Implicit flow fallback: tokens in the fragment
      const hash = url.split('#')[1];
      if (hash) {
        const params = new URLSearchParams(hash);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
        }
      }
    } catch (err) {
      addBreadcrumb('nativeAuth: session exchange failed', { message: err.message });
      console.error('[nativeAuth] session exchange failed:', err);
    }
  });
}

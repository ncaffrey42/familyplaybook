import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config — wraps the SAME Vite `dist/` build the web/Docker deploy
 * serves. The native shells are additive: `npm run build` still produces the
 * web bundle untouched; `npx cap sync` copies that bundle into ios/ and
 * android/. Nothing here changes docker-compose or the web deployment.
 */
const config: CapacitorConfig = {
  appId: 'com.familyplaybook.app',
  appName: 'Family Playbook',
  webDir: 'dist',

  // Custom URL scheme for OAuth deep-links back into the app (see
  // src/lib/nativeAuth.js and the Supabase redirect-URL setup in
  // MOBILE_BUILD.md). The web build ignores this entirely.
  ios: {
    scheme: 'familyplaybook',
  },
  android: {
    // allowMixedContent stays false — everything is HTTPS (Supabase/Stripe).

    // Native plugins compiled into the Android app. RevenueCat is deliberately
    // left out: its current Capacitor-6-compatible release bundles Play
    // Billing Library 7.1.1, and since 2026-08-31 Google Play requires 8.0+
    // for new apps. Billing 8 only ships in @revenuecat/purchases-capacitor
    // 10+, which needs Capacitor 7. With VITE_ENABLE_IAP=false the JS side
    // never touches the plugin, so excluding it costs nothing today.
    // Re-add it (and migrate to Capacitor 7) when store billing goes live —
    // see REVENUECAT_SETUP.md. iOS still includes every installed plugin.
    includePlugins: [
      '@capacitor/app',
      '@capacitor/browser',
      '@capacitor/camera',
      '@capacitor/filesystem',
      '@capacitor/keyboard',
      '@capacitor/splash-screen',
      '@capacitor/status-bar',
    ],
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#FAF9F6',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'DARK', // dark text on the light app chrome
      backgroundColor: '#FAF9F6',
    },
    Keyboard: {
      resize: 'native',
    },
  },
};

export default config;

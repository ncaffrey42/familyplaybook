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

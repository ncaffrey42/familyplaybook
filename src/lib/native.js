/**
 * Thin, web-safe wrapper around Capacitor platform detection.
 *
 * `@capacitor/core` is bundled on web too, but `Capacitor.isNativePlatform()`
 * returns false there, so every native-only branch guarded by `isNative()`
 * simply no-ops in the browser and the Docker/web build behaves exactly as
 * before.
 */
import { Capacitor } from '@capacitor/core';

export const isNative = () => Capacitor.isNativePlatform();
export const nativePlatform = () => Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

/**
 * The custom-scheme deep link OAuth providers redirect back to inside the
 * native app. Must match capacitor.config.ts (ios.scheme) and the Supabase
 * dashboard's Additional Redirect URLs (see MOBILE_BUILD.md).
 */
export const NATIVE_AUTH_REDIRECT = 'familyplaybook://auth/callback';

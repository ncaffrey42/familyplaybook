/**
 * RevenueCat native IAP bootstrap.
 *
 * Entirely native + flag guarded: on web, or when VITE_ENABLE_IAP is off,
 * every export no-ops, so the Stripe web flow and the Docker build are
 * unaffected. The RevenueCat SDK is dynamically imported so its native module
 * never enters the web bundle.
 *
 * app_user_id is set to the Supabase user id, which is what the
 * revenuecat-webhook maps back to user_billing.
 */
import { isNative, nativePlatform } from '@/lib/native';

export const IAP_ENABLED = import.meta.env.VITE_ENABLE_IAP === 'true';

/** IAP is only live on a real device with the feature flag on. */
export const iapActive = () => IAP_ENABLED && isNative();

let configured = false;

async function sdk() {
  const mod = await import('@revenuecat/purchases-capacitor');
  return mod.Purchases;
}

/**
 * Configure RevenueCat with the platform API key and identify the user.
 * Call after auth resolves. Safe to call repeatedly.
 */
export async function initRevenueCat(userId) {
  if (!iapActive() || !userId) return;
  try {
    const Purchases = await sdk();
    const apiKey =
      nativePlatform() === 'ios'
        ? import.meta.env.VITE_REVENUECAT_IOS_KEY
        : import.meta.env.VITE_REVENUECAT_ANDROID_KEY;
    if (!apiKey) {
      console.warn('[revenuecat] No API key for platform', nativePlatform());
      return;
    }
    if (!configured) {
      await Purchases.configure({ apiKey, appUserID: userId });
      configured = true;
    } else {
      await Purchases.logIn({ appUserID: userId });
    }
  } catch (err) {
    console.error('[revenuecat] init failed:', err);
  }
}

/** Log the user out of RevenueCat (on sign-out). */
export async function logoutRevenueCat() {
  if (!iapActive() || !configured) return;
  try {
    const Purchases = await sdk();
    await Purchases.logOut();
  } catch (err) {
    console.error('[revenuecat] logout failed:', err);
  }
}

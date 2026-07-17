/**
 * Native IAP purchase actions via RevenueCat, mapped to our plan_key / interval
 * model. No-ops (and returns empty offerings) on web or when IAP is off, so the
 * SubscriptionScreen can call these unconditionally and fall back to Stripe.
 *
 * The purchase itself is confirmed by the store; entitlements land in
 * user_billing via the RevenueCat webhook. After a purchase we ask the caller
 * to wait for that billing update (same pattern as Stripe checkout).
 */
import { useState, useCallback } from 'react';
import { iapActive } from '@/lib/revenuecat';
import { useToast } from '@/components/ui/use-toast';

async function sdk() {
  const mod = await import('@revenuecat/purchases-capacitor');
  return mod.Purchases;
}

export function useNativePurchases() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  /** Fetch the current offering's packages, or [] when IAP isn't active. */
  const getPackages = useCallback(async () => {
    if (!iapActive()) return [];
    try {
      const Purchases = await sdk();
      const offerings = await Purchases.getOfferings();
      return offerings?.current?.availablePackages ?? [];
    } catch (err) {
      console.error('[iap] getOfferings failed:', err);
      return [];
    }
  }, []);

  /**
   * Purchase a package. Returns { success } and lets the caller wait for the
   * webhook-driven billing update. A user cancel is a benign no-op.
   */
  const purchasePackage = useCallback(async (pkg) => {
    if (!iapActive() || !pkg) return { success: false };
    setLoading(true);
    try {
      const Purchases = await sdk();
      await Purchases.purchasePackage({ aPackage: pkg });
      return { success: true };
    } catch (err) {
      if (err?.code === 'PURCHASE_CANCELLED' || err?.userCancelled) {
        return { success: false, cancelled: true };
      }
      console.error('[iap] purchase failed:', err);
      toast({ title: 'Purchase failed', description: err?.message || 'Please try again.', variant: 'destructive' });
      return { success: false };
    } finally {
      setLoading(false);
    }
  }, [toast]);

  /**
   * Purchase the store package matching a plan_key + interval. Products must be
   * named so their identifier contains the plan and interval (e.g.
   * "fp_couple_monthly", "fp_family_yearly") — see REVENUECAT_SETUP.md.
   */
  const purchasePlan = useCallback(async (planKey, interval) => {
    if (!iapActive()) return { success: false };
    const packages = await getPackages();
    const yearWords = /year|annual|yr/i;
    const monthWords = /month|mo\b/i;
    const match = packages.find((p) => {
      const id = (p?.product?.identifier || p?.identifier || '').toLowerCase();
      const planOk = id.includes(planKey);
      const intervalOk = interval === 'year' ? yearWords.test(id) : monthWords.test(id);
      return planOk && intervalOk;
    });
    if (!match) {
      toast({ title: 'Unavailable', description: 'That plan isn’t available for purchase right now.', variant: 'destructive' });
      return { success: false };
    }
    return purchasePackage(match);
  }, [getPackages, purchasePackage, toast]);

  /** Restore prior purchases — required by App Store guideline 3.1.1. */
  const restorePurchases = useCallback(async () => {
    if (!iapActive()) return { success: false };
    setLoading(true);
    try {
      const Purchases = await sdk();
      const info = await Purchases.restorePurchases();
      const hasActive = Object.keys(info?.customerInfo?.entitlements?.active ?? {}).length > 0;
      toast({
        title: hasActive ? 'Purchases restored' : 'Nothing to restore',
        description: hasActive ? 'Your subscription is active again.' : 'No previous purchases were found for this account.',
      });
      return { success: hasActive };
    } catch (err) {
      console.error('[iap] restore failed:', err);
      toast({ title: 'Restore failed', description: err?.message || 'Please try again.', variant: 'destructive' });
      return { success: false };
    } finally {
      setLoading(false);
    }
  }, [toast]);

  /** Open the store's native "manage subscriptions" screen (cancel/change). */
  const manageSubscriptions = useCallback(async () => {
    if (!iapActive()) return;
    try {
      const Purchases = await sdk();
      await Purchases.showManageSubscriptions();
    } catch (err) {
      console.error('[iap] manage subscriptions failed:', err);
      toast({ title: 'Unavailable', description: 'Open your device Settings to manage your subscription.', variant: 'destructive' });
    }
  }, [toast]);

  return { getPackages, purchasePackage, purchasePlan, restorePurchases, manageSubscriptions, loading };
}

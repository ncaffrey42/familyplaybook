import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/use-toast';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Subscription state
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [priceId, setPriceId] = useState(null);
  const [planKey, setPlanKey] = useState('free');
  const [billingInterval, setBillingInterval] = useState(null);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  
  const { toast } = useToast();
  const isInitialized = useRef(false);

  // Helper to clear all auth-related state
  const clearAuthState = useCallback(() => {
      console.log("🧹 Clearing auth state...");
      setSession(null);
      setUser(null);
      setProfile(null);
      setSubscriptionStatus(null);
      setPriceId(null);
      setPlanKey('free');
      setBillingInterval(null);
      setCurrentPeriodEnd(null);
      setCancelAtPeriodEnd(false);
      
      try {
        // Clear Supabase tokens from local storage to prevent stale session loops
        const projectId = supabase.supabaseUrl?.split('//')[1]?.split('.')[0] || 'sb';
        const storageKey = `sb-${projectId}-auth-token`;
        
        localStorage.removeItem(storageKey);
        localStorage.removeItem('sb-access-token');
        localStorage.removeItem('sb-refresh-token');
        
        // Aggressive cleanup for any other sb- tokens
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                localStorage.removeItem(key);
            }
        });
      } catch (e) {
          console.warn("Error clearing local storage:", e);
      }
  }, []);

  const refreshProfile = useCallback(async (currentUser = user) => {
    // 1. Validate session existence first to ensure we have a valid token
    const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !currentSession) {
        console.warn("No active session found during profile refresh. Clearing state.");
        clearAuthState();
        return null;
    }

    const targetUser = currentUser || currentSession.user;
    
    if (!targetUser) {
        clearAuthState();
        return null;
    };

    try {
        console.log("🔄 Refreshing profile and billing data for:", targetUser.email);
        const [profileRes, billingRes] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', targetUser.id).maybeSingle(),
            supabase.from('user_billing').select('*').eq('user_id', targetUser.id).maybeSingle()
        ]);

        const billingData = billingRes.data || {};
        const profileData = profileRes.data || {};
        
        setProfile(profileData);
        
        const newStatus = billingData.subscription_status || 'free';
        const newPlanKey = billingData.plan_key || 'free';
        
        console.log("📊 Latest Billing Data:", { 
            newStatus, 
            newPlanKey, 
            interval: billingData.billing_interval,
            cancelAtPeriodEnd: billingData.cancel_at_period_end 
        });

        setSubscriptionStatus(newStatus);
        setPriceId(billingData.price_id);
        setPlanKey(newPlanKey);
        setBillingInterval(billingData.billing_interval);
        setCurrentPeriodEnd(billingData.current_period_end);
        setCancelAtPeriodEnd(billingData.cancel_at_period_end || false);
        
        return { profile: profileData, billing: billingData };
    } catch (error) {
        console.error("Error refreshing profile:", error);
        return null;
    }
  }, [user, clearAuthState]);

  /**
   * Waits for the user_billing realtime channel to deliver a matching update,
   * then refreshes the auth profile. Falls back after timeoutMs if no event
   * arrives (e.g. webhook is slow or the tab was backgrounded).
   */
  const waitForSubscriptionUpdate = useCallback((targetPlan = null, timeoutMs = 30000) => {
    if (!user) return Promise.resolve(false);

    return new Promise((resolve) => {
      let settled = false;

      const settle = async (success) => {
        if (settled) return;
        settled = true;
        clearTimeout(timerId);
        await supabase.removeChannel(channel);
        await refreshProfile(user);
        resolve(success);
      };

      const timerId = setTimeout(() => settle(false), timeoutMs);

      const channel = supabase
        .channel(`billing-wait-${user.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'user_billing', filter: `user_id=eq.${user.id}` },
          (payload) => {
            const row = payload.new;
            const isActive = row?.subscription_status === 'active' || row?.subscription_status === 'trialing';
            const isMatch = targetPlan ? (isActive && row?.plan_key === targetPlan) : isActive;
            if (isMatch) settle(true);
          },
        )
        .subscribe();
    });
  }, [user, refreshProfile]);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        // 1. Get Session first
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
           console.warn("Session retrieval error:", sessionError.message);
           // If session is invalid/malformed, clear it immediately
           if (mounted) clearAuthState();
           return;
        } 
        
        if (currentSession) {
           // 2. Validate Session with getUser
           // This is critical: getSession() only checks local storage structure/expiry.
           // getUser() hits the Supabase Auth server to verify the token hasn't been revoked.
           const { data: { user: validUser }, error: userError } = await supabase.auth.getUser();
           
           if (userError) {
               console.warn("User validation failed:", userError.message);
               
               // Handle 403 session_not_found specifically
               if (userError.status === 403 || userError.code === 'session_not_found' || userError.message?.includes('session_not_found')) {
                   console.log("Session invalid on server. Clearing local state.");
                   // Do NOT call signOut() here if the session is already gone on server, 
                   // just clear local state to avoid 403 loops.
                   if (mounted) clearAuthState();
               } else {
                   // For other errors, try a graceful sign out
                   await supabase.auth.signOut().catch(err => console.warn("Signout cleanup error:", err));
                   if (mounted) clearAuthState();
               }
           } else if (mounted) {
               // 3. Session is valid and confirmed by server
               setSession(currentSession);
               setUser(validUser);
               await refreshProfile(validUser);
           }
        } else {
            // No session found
            if (mounted) {
                setLoading(false);
                // Ensure clean state
                if (user || session) clearAuthState();
            }
        }
      } catch (error) {
        console.error("Auth initialization fatal error:", error);
        if (mounted) clearAuthState();
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (!isInitialized.current) {
        initializeAuth();
        isInitialized.current = true;
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (mounted) {
        console.log(`Auth event: ${event}`);
        
        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
           clearAuthState();
           setLoading(false);
           return;
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
            setSession(newSession);
            const currentUser = newSession?.user ?? null;
            
            setUser(prevUser => {
                if (prevUser?.id === currentUser?.id && prevUser?.email === currentUser?.email) {
                    return prevUser;
                }
                return currentUser;
            });
            
            if (currentUser) {
                await refreshProfile(currentUser);
            }
        }
        
        setLoading(false);
      }
    });
    
    // REALTIME SUBSCRIPTION
    let billingSubscription;
    if (user) {
         console.log("📡 Subscribing to realtime billing updates for:", user.id);
         billingSubscription = supabase
            .channel('public:user_billing')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'user_billing', filter: `user_id=eq.${user.id}` }, 
                (payload) => {
                    console.log("🔔 Realtime billing update received!", payload);
                    
                    const newRow = payload.new;
                    if (newRow) {
                        setSubscriptionStatus(newRow.subscription_status);
                        setPriceId(newRow.price_id);
                        setPlanKey(newRow.plan_key);
                        setBillingInterval(newRow.billing_interval);
                        setCurrentPeriodEnd(newRow.current_period_end);
                        setCancelAtPeriodEnd(newRow.cancel_at_period_end || false);
                        
                        // Notify user if meaningful change
                        if (payload.old && payload.old.plan_key !== newRow.plan_key) {
                             toast({ title: "Plan Updated", description: `You are now on the ${newRow.plan_key} plan.` });
                        }
                    }
                }
            )
            .subscribe((status) => {
                 if (status === 'SUBSCRIBED') {
                     console.log("✅ Connected to billing updates channel");
                 }
            });
    }

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
      if (billingSubscription) supabase.removeChannel(billingSubscription);
    };
  }, [user, clearAuthState, refreshProfile, toast]);

  const getRedirectUrl = (path = '/auth/callback') => {
    let url = window.location.origin;
    url = url.replace(/\/$/, '');
    return `${url}${path}`;
  };

  const isPremium = (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') && 
                    (planKey === 'couple' || planKey === 'family');

  const value = {
    session,
    user,
    profile,
    loading,
    subscriptionStatus,
    priceId,
    planKey,
    billingInterval,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    isPremium,
    refreshProfile,
    waitForSubscriptionUpdate,
    signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) toast({ variant: "destructive", title: "Sign in Failed", description: error.message });
        return { data, error };
    },
    signUp: async (email, password, options = {}) => {
        const finalOptions = { ...options, emailRedirectTo: options.emailRedirectTo || getRedirectUrl() };
        const { data, error } = await supabase.auth.signUp({ email, password, options: finalOptions });
        if (error) toast({ variant: "destructive", title: "Sign up Failed", description: error.message });
        return { data, error };
    },
    signInWithGoogle: async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: getRedirectUrl(), queryParams: { access_type: 'offline', prompt: 'consent' } }
        });
        if (error) toast({ variant: "destructive", title: "Google Sign In Failed", description: error.message });
        return { error };
    },
    signInWithFacebook: async () => {
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'facebook', options: { redirectTo: getRedirectUrl() } });
        if (error) toast({ variant: "destructive", title: "Facebook Sign In Failed", description: error.message });
        return { error };
    },
    signInWithDiscord: async () => {
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: getRedirectUrl() } });
        if (error) toast({ variant: "destructive", title: "Discord Sign In Failed", description: error.message });
        return { error };
    },
    signInWithOtp: async (email) => {
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: getRedirectUrl(),
                data: {
                  subject: "Your Family Playbook Login Link ✨",
                  heading: "Welcome Back!",
                  message: "Click below to sign in."
                }
            }
        });
        if (error) toast({ variant: "destructive", title: "Magic Link Failed", description: error.message });
        return { error };
    },
    resetPasswordForEmail: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: getRedirectUrl('/update-password') });
        if (error) toast({ variant: "destructive", title: "Reset Failed", description: error.message });
        return { error };
    },
    updatePassword: async (newPassword) => {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) toast({ variant: "destructive", title: "Update Failed", description: error.message });
        else toast({ variant: "success", title: "Password Updated", description: "Your password has been changed." });
        return { error };
    },
    signOut: async () => {
      try {
        // Check if we have a valid session locally before attempting network call
        // This prevents unnecessary 403 errors if the session is already dead
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        
        if (existingSession) {
            const { error } = await supabase.auth.signOut();
            if (error) {
                // Ignore session_not_found errors during logout, as we are clearing state anyway
                if (!error.message?.includes('session_not_found')) {
                    console.error("Supabase signOut error:", error);
                }
            }
        }
      } catch (err) {
          console.warn("Sign out exception:", err);
      } finally {
          // Always clear local state regardless of API result
          clearAuthState();
      }
      return { error: null };
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
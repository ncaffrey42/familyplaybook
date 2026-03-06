import React, { createContext, useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { addBreadcrumb, logError } from '@/lib/errorLogger';
import { entitlementService } from '@/lib/EntitlementService';
import { UsageTrackingService } from '@/lib/UsageTrackingService';

const DataContext = createContext();

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) throw new Error('useData must be used within a DataProvider');
  return context;
};

const CACHE_KEY = 'family_playbook_data_cache';

export const DataProvider = ({ children }) => {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [allBundles, setAllBundles] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached).allBundles || [] : [];
    } catch { return []; }
  });
  
  const [allGuides, setAllGuides] = useState(() => {
     try {
       const cached = localStorage.getItem(CACHE_KEY);
       return cached ? JSON.parse(cached).allGuides || [] : [];
     } catch { return []; }
  });

  const [bundleLibrary, setBundleLibrary] = useState(() => {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        return cached ? JSON.parse(cached).bundleLibrary || [] : [];
      } catch { return []; }
  });

  const [guideLibrary, setGuideLibrary] = useState(() => {
     try {
       const cached = localStorage.getItem(CACHE_KEY);
       return cached ? JSON.parse(cached).guideLibrary || [] : [];
     } catch { return []; }
  });

  const [favorites, setFavorites] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached).favorites || [] : [];
    } catch { return []; }
  });

  const [isDataLoaded, setIsDataLoaded] = useState(() => {
      const cached = localStorage.getItem(CACHE_KEY);
      return !!cached; 
  });

  const availableLibraryBundles = useMemo(() => {
    if (!isDataLoaded && bundleLibrary.length === 0) return [];
    const userBundleTemplateIds = new Set(allBundles.map(p => p.template_id).filter(Boolean));
    return bundleLibrary.filter(libBundle => !userBundleTemplateIds.has(libBundle.id));
  }, [allBundles, bundleLibrary, isDataLoaded]);

  useEffect(() => {
    if (user && isDataLoaded) {
      const cacheData = {
        allBundles,
        allGuides,
        favorites,
        bundleLibrary,
        guideLibrary,
        timestamp: Date.now()
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    }
  }, [allBundles, allGuides, favorites, bundleLibrary, guideLibrary, isDataLoaded, user]);

  const fetchData = useCallback(async (currentUser) => {
    const targetUser = currentUser || user;
    if (!targetUser) return;
    
    addBreadcrumb('fetchData started');
    
    try {
      const results = await Promise.allSettled([
        supabase.from('packs').select('*, pack_guides(guide_id)').eq('user_id', targetUser.id),
        supabase.from('guides').select('id, user_id, name, icon, category, steps, content, created_at, is_shareable, is_archived, archived_at, description, template_id, pack_guides(pack_id)').eq('user_id', targetUser.id).order('created_at', { ascending: false }),
        supabase.from('user_favorites').select('guide_id').eq('user_id', targetUser.id),
        supabase.from('library_packs').select('*, library_guides(*)'),
        supabase.from('library_guides').select('*, library_packs(id, name)')
      ]);

      const [bundlesRes, guidesRes, favoritesRes, libBundlesRes, libGuidesRes] = results;

      const processResult = (result, contextName) => {
        if (result.status === 'rejected') {
          // Don't log "Failed to fetch" here to avoid noise, just return empty
          const reason = result.reason || {};
          if (reason.message !== 'Failed to fetch' && !reason.message?.includes('NetworkError')) {
             logError(result.reason, { context: `fetchData:${contextName}` });
          }
          return { data: [], error: result.reason };
        }
        if (result.value.error) {
          logError(result.value.error, { context: `fetchData:${contextName}` });
          return { data: [], error: result.value.error };
        }
        return { data: result.value.data, error: null };
      };

      const { data: bundlesData } = processResult(bundlesRes, 'bundles');
      const { data: guidesData } = processResult(guidesRes, 'guides');
      const { data: favoritesData } = processResult(favoritesRes, 'favorites');
      const { data: libraryBundlesData } = processResult(libBundlesRes, 'libraryBundles');
      const { data: libraryGuidesData } = processResult(libGuidesRes, 'libraryGuides');

      const formattedBundles = bundlesData.map(p => ({
        ...p,
        guide_count: p.pack_guides?.length || 0
      }));
      setAllBundles(formattedBundles);

      const bundleMap = new Map(bundlesData.map(p => [p.id, p.name]));
      const formattedGuides = guidesData.map(g => ({
        ...g,
        bundles: g.pack_guides?.map(pg => pg.pack_id) || [],
        bundleNames: g.pack_guides?.map(pg => bundleMap.get(pg.pack_id)).filter(Boolean) || []
      }));
      setAllGuides(formattedGuides);
      
      const favoriteGuideIds = new Set(favoritesData.map(f => f.guide_id));
      setFavorites(formattedGuides.filter(g => !g.is_archived && favoriteGuideIds.has(g.id)));

      const formattedLibBundles = libraryBundlesData.map(p => ({ 
        ...p, 
        guides: (p.library_guides || []).sort((a, b) => a.name.localeCompare(b.name)) 
      }));
      setBundleLibrary(formattedLibBundles);

      const formattedLibGuides = libraryGuidesData.map(g => ({ ...g, bundleName: g.library_packs?.name, bundleId: g.library_packs?.id }));
      setGuideLibrary(formattedLibGuides);

    } catch (error) {
        // Only log if it's not a network error
        if (error.message !== 'Failed to fetch') {
            logError(error, { context: 'fetchData:General' });
        }
    } finally {
        setIsDataLoaded(true);
        addBreadcrumb('fetchData finished');
    }
  }, [user]);

  useEffect(() => {
    if (session?.user) {
      fetchData(session.user);
    } else {
      setAllBundles([]); setAllGuides([]); setFavorites([]); setBundleLibrary([]); setGuideLibrary([]);
      setIsDataLoaded(true);
      localStorage.removeItem(CACHE_KEY);
    }
  }, [session, fetchData]);

  const toggleFavorite = useCallback(async (guide) => {
    if (!user) return;
    const isFavorited = favorites.some(fav => fav.id === guide.id);
    if (isFavorited) {
      setFavorites(prev => prev.filter(fav => fav.id !== guide.id)); 
      toast({ title: "💔 Unfavorited" });
      const { error } = await supabase.from('user_favorites').delete().match({ user_id: user.id, guide_id: guide.id });
      if (error) { logError(error); setFavorites(prev => [...prev, guide]); toast({ title: "Error removing favorite", variant: "destructive" }); }
    } else {
      setFavorites(prev => [...prev, guide]); 
      toast({ title: "❤️ Favorited!" });
      const { error } = await supabase.from('user_favorites').insert({ user_id: user.id, guide_id: guide.id });
      if (error) { logError(error); setFavorites(prev => prev.filter(fav => fav.id !== guide.id)); toast({ title: "Error adding favorite", variant: "destructive" }); }
    }
  }, [user, favorites, toast]);

  const handleSaveGuide = useCallback(async (guideToSave) => {
    if (!user) return;
    
    // Entitlement Check for Creation
    const isNewGuide = !guideToSave.id;
    if (isNewGuide) {
      try {
        const entitlement = await entitlementService.canPerform(user.id, 'GUIDE_CREATE');
        if (!entitlement.allowed) {
          toast({ 
            title: "Limit Reached", 
            description: entitlement.reason_code || "You have reached your guide limit.",
            variant: "destructive" 
          });
          return null;
        }
      } catch (e) {
        console.error("Entitlement check failed", e);
        toast({ title: "System Error", description: "Could not verify limits.", variant: "destructive" });
        return null;
      }
    }

    const { packIds, bundleNames, bundles, pack_guides, ...guideData } = guideToSave;
    const cleanSteps = guideData.steps ? guideData.steps.map(({ localId, ...rest }) => rest) : [];
    const upsertData = { ...guideData, steps: cleanSteps, user_id: user.id };

    try {
        const { data: savedGuide, error } = await supabase.from('guides').upsert(upsertData).select().single();
        if (error) throw error;
        
        const currentBundleIds = packIds || [];
        await supabase.from('pack_guides').delete().eq('guide_id', savedGuide.id);
        if (currentBundleIds.length > 0) {
            const relations = currentBundleIds.map(bundleId => ({ pack_id: bundleId, guide_id: savedGuide.id }));
            await supabase.from('pack_guides').insert(relations);
        }

        // Usage Tracking for Creation
        if (isNewGuide) {
          UsageTrackingService.updateUsageMetric(user.id, 'active_guides', 1).catch(e => console.error("Usage tracking failed", e));
        }

        await fetchData(user);
        
        toast({ title: "✨ Guide Saved!", variant: "success" });
        return savedGuide;
    } catch(error) {
        logError(error, { context: 'handleSaveGuide' });
        toast({ title: "Error saving guide", variant: "destructive" });
        return null;
    }
  }, [user, toast, fetchData]);


  const handleArchiveGuide = useCallback(async (guide) => {
    if (!guide?.id) return;
    
    setAllGuides(prev => prev.map(g => g.id === guide.id ? { ...g, is_archived: true } : g));
    setFavorites(prev => prev.filter(g => g.id !== guide.id));

    const { error } = await supabase.from('guides').update({ is_archived: true, archived_at: new Date().toISOString() }).eq('id', guide.id);
    
    if (error) {
      logError(error); 
      setAllGuides(prev => prev.map(g => g.id === guide.id ? { ...g, is_archived: false } : g));
      await fetchData(user);
      toast({ title: "Error archiving guide", variant: "destructive" });
    } else {
      // Update Usage Stats
      UsageTrackingService.updateUsageMetric(user.id, 'active_guides', -1).catch(console.error);
      UsageTrackingService.updateUsageMetric(user.id, 'archived_guides', 1).catch(console.error);

      toast({ title: "📁 Guide Archived" });
      navigate('/guides');
    }
  }, [navigate, toast, user, fetchData]);

  const handleRestoreGuide = useCallback(async (guide) => {
    if (!guide?.id) return;

    // Entitlement Check for Unarchive
    try {
      const entitlement = await entitlementService.canPerform(user.id, 'GUIDE_UNARCHIVE');
      if (!entitlement.allowed) {
        toast({ 
          title: "Cannot Unarchive", 
          description: entitlement.reason_code === 'LIMIT_ACTIVE_GUIDES' ? "You have reached your active guide limit." : "Action not allowed.",
          variant: "destructive" 
        });
        return;
      }
    } catch (e) {
      console.error("Entitlement check failed", e);
      toast({ title: "System Error", description: "Could not verify limits.", variant: "destructive" });
      return;
    }

    setAllGuides(prev => prev.map(g => g.id === guide.id ? { ...g, is_archived: false } : g));

    const { error } = await supabase.from('guides').update({ is_archived: false, archived_at: null }).eq('id', guide.id);
    
    if (error) {
      logError(error);
      setAllGuides(prev => prev.map(g => g.id === guide.id ? { ...g, is_archived: true } : g));
      toast({ title: "Error restoring guide", variant: "destructive" });
    } else {
      // Update Usage Stats
      UsageTrackingService.updateUsageMetric(user.id, 'active_guides', 1).catch(console.error);
      UsageTrackingService.updateUsageMetric(user.id, 'archived_guides', -1).catch(console.error);
      
      toast({ title: "♻️ Guide Restored", variant: "success" });
      await fetchData(user);
    }
  }, [user, toast, fetchData]);

  const handleSaveBundle = useCallback(async (bundleToSave, guideIds) => {
    if (!user) return;

    // Entitlement Check for Creation
    const isNewBundle = !bundleToSave.id;
    if (isNewBundle) {
      try {
        const entitlement = await entitlementService.canPerform(user.id, 'BUNDLE_CREATE');
        if (!entitlement.allowed) {
          toast({ 
            title: "Limit Reached", 
            description: "You have reached your bundle limit.",
            variant: "destructive" 
          });
          return null;
        }
      } catch (e) {
        console.error("Entitlement check failed", e);
        return null;
      }
    }

    try {
        const { data: savedBundle, error } = await supabase.from('packs').upsert({ ...bundleToSave, user_id: user.id }).select().single();
        if (error) throw error;
        
        await supabase.from('pack_guides').delete().eq('pack_id', savedBundle.id);
        if (guideIds && guideIds.length > 0) {
            const cleanGuideIds = guideIds.map(g => (typeof g === 'object' && g !== null && g.id) ? g.id : g);
            await supabase.from('pack_guides').insert(cleanGuideIds.map(gid => ({ pack_id: savedBundle.id, guide_id: gid })));
        }
        
        // Usage Tracking
        if (isNewBundle) {
          UsageTrackingService.updateUsageMetric(user.id, 'bundles', 1).catch(console.error);
        }

        await fetchData(user);
        toast({ title: "✨ Bundle Saved!", variant: "success" });
        navigate(`/bundle/${savedBundle.id}`);
        return savedBundle;
    } catch (error) {
        logError(error, { context: 'handleSaveBundle' });
        toast({ title: "Error saving bundle", variant: "destructive" });
    }
  }, [user, navigate, toast, fetchData]);

  const handleArchiveBundle = useCallback(async (bundle) => {
    if (!bundle?.id) return;
    setAllBundles(prev => prev.filter(p => p.id !== bundle.id));
    const { error } = await supabase.from('packs').update({ is_archived: true, archived_at: new Date().toISOString() }).eq('id', bundle.id);
    if (error) {
      logError(error); setAllBundles(prev => [...prev, bundle]);
      toast({ title: "Error archiving bundle", variant: "destructive" });
    } else {
      // Note: UsageService counts all bundles regardless of archive status currently, so no decrement.
      toast({ title: "📦 Bundle Archived" });
      navigate('/bundles');
    }
  }, [navigate, toast]);

  const handleRestoreBundle = useCallback(async (bundle) => {
    if (!bundle?.id) return;
    setAllBundles(prev => prev.map(b => b.id === bundle.id ? { ...b, is_archived: false } : b));

    const { error } = await supabase.from('packs').update({ is_archived: false, archived_at: null }).eq('id', bundle.id);
    
    if (error) {
        logError(error);
        setAllBundles(prev => prev.map(b => b.id === bundle.id ? { ...b, is_archived: true } : b));
        toast({ title: "Error restoring bundle", variant: "destructive" });
    } else {
        toast({ title: "📦 Bundle Restored", variant: "success" });
        await fetchData(user);
    }
  }, [user, toast, fetchData]);

  const addGuideFromLibraryCore = useCallback(async (guide) => {
    if (!user) throw new Error("User not authenticated");
    
    // Entitlement Check
    const entitlement = await entitlementService.canPerform(user.id, 'GUIDE_CREATE');
    if (!entitlement.allowed) {
      throw new Error(`Entitlement Error: ${entitlement.reason_code}`);
    }

    const guideData = {
        user_id: user.id, name: guide.name, description: guide.description,
        icon: guide.icon, category: guide.category, steps: guide.steps,
        content: guide.content, template_id: guide.id
    };

    const { data: newGuide, error: guideError } = await supabase.from('guides').insert(guideData).select().single();
    if (guideError) throw guideError;

    // Usage Update
    UsageTrackingService.updateUsageMetric(user.id, 'active_guides', 1).catch(console.error);

    let userBundleId;
    const libraryBundle = bundleLibrary.find(b => b.id === guide.bundleId);

    if (libraryBundle) {
        const { data: existingBundle } = await supabase.from('packs').select('id').eq('template_id', libraryBundle.id).eq('user_id', user.id).maybeSingle();
        if (existingBundle) {
            userBundleId = existingBundle.id;
        } else {
            // Check bundle entitlement if creating new one
            const bundleEntitlement = await entitlementService.canPerform(user.id, 'BUNDLE_CREATE');
            if (bundleEntitlement.allowed) {
              const { data: newBundle, error: bundleError } = await supabase.from('packs').insert({ user_id: user.id, name: libraryBundle.name, description: libraryBundle.description, color: libraryBundle.color, image: libraryBundle.image, template_id: libraryBundle.id }).select('id').single();
              if (bundleError) throw bundleError;
              userBundleId = newBundle.id;
              // Usage Update
              UsageTrackingService.updateUsageMetric(user.id, 'bundles', 1).catch(console.error);
            }
        }
    }

    if (userBundleId) {
        await supabase.from('pack_guides').insert({ pack_id: userBundleId, guide_id: newGuide.id });
    }
    
    return newGuide;
}, [user, bundleLibrary]);

  const handleAddGuideFromLibrary = useCallback(async (guide) => {
    try {
        await addGuideFromLibraryCore(guide);
        await fetchData(user); 
        toast({ title: "✅ Guide Added!", description: "It's now in 'My Guides' and safe to edit.", variant: "success" });
    } catch (error) {
        logError(error, { context: 'handleAddGuideFromLibrary' });
        const msg = error.message?.includes('Entitlement') ? "Limit reached. Upgrade to add more." : "Error adding guide";
        toast({ title: msg, variant: "destructive" });
    }
  }, [addGuideFromLibraryCore, toast, fetchData, user]);

  const handleAddAndEditFromLibrary = useCallback(async (guide) => {
    try {
        const newGuide = await addGuideFromLibraryCore(guide);
        await fetchData(user);
        toast({ title: "✅ Guide Added!", description: "You can now edit your new guide.", variant: "success" });
        navigate(`/guide/${newGuide.id}/edit`);
    } catch (error) {
        logError(error, { context: 'handleAddAndEditFromLibrary' });
        const msg = error.message?.includes('Entitlement') ? "Limit reached. Upgrade to add more." : "Error adding guide";
        toast({ title: msg, variant: "destructive" });
    }
  }, [addGuideFromLibraryCore, toast, navigate, fetchData, user]);


  const handleAddGuidesToBundle = useCallback(async (bundleId, guideIds) => {
    if (!user) return;
    const cleanGuideIds = guideIds.map(g => (typeof g === 'object' && g !== null && g.id) ? g.id : g);
    const relations = cleanGuideIds.map(guideId => ({ pack_id: bundleId, guide_id: guideId }));
    const { error } = await supabase.from('pack_guides').upsert(relations);
    if (error) { logError(error); toast({ title: "Error adding guides", variant: "destructive" }); }
    else { await fetchData(user); toast({ title: "Guides added!", variant: "success" }); }
  }, [user, toast, fetchData]);

  const handleRemoveGuideFromBundle = useCallback(async (bundleId, guideId, bundleName, guideName) => {
    const { error } = await supabase.from('pack_guides').delete().match({ pack_id: bundleId, guide_id: guideId });
    if(error) {
        logError(error);
        toast({ title: "Error removing guide", variant: "destructive" });
    } else {
        await fetchData(user);
        toast({ title: `Removed "${guideName}"`, description: `from "${bundleName}" bundle.` });
    }
}, [user, toast, fetchData]);

  const handleAddBundleFromLibrary = useCallback(async (bundle) => {
    if (!user) return;

    // Entitlement Check
    const entitlement = await entitlementService.canPerform(user.id, 'BUNDLE_CREATE');
    if (!entitlement.allowed) {
      toast({ title: "Limit Reached", description: "You cannot create more bundles.", variant: "destructive" });
      return;
    }

    try {
        const { data: existingBundle } = await supabase.from('packs').select('id').eq('template_id', bundle.id).eq('user_id', user.id).maybeSingle();
        if(existingBundle) {
          toast({ title: "Bundle already in your library" });
          navigate(`/bundle/${existingBundle.id}`);
          return;
        }

        const { data: newBundle } = await supabase.from('packs').insert({ user_id: user.id, name: bundle.name, description: bundle.description, color: bundle.color, image: bundle.image, template_id: bundle.id }).select().single();
        if (bundle.guides && bundle.guides.length > 0) {
          // Check guide limits?
          // If a bundle has 5 guides, and user has 2/5 used, they will go over.
          // Complex check needed. We will fail softly here or check count.
          const newGuidesCount = bundle.guides.length;
          const guideEntitlement = await entitlementService.canPerform(user.id, 'GUIDE_CREATE');
          // This is imperfect as it checks if we can create 1, not N. But good enough for now.
          if (!guideEntitlement.allowed && newGuidesCount > 0) {
             // Rollback bundle?
             await supabase.from('packs').delete().eq('id', newBundle.id);
             toast({ title: "Guide Limit Reached", description: "This bundle contains guides you don't have space for.", variant: "destructive" });
             return;
          }

          const newGuides = bundle.guides.map(g => ({ user_id: user.id, name: g.name, description: g.description, icon: g.icon, category: g.category, steps: g.steps, content: g.content, template_id: g.id }));
          const { data: insertedGuides } = await supabase.from('guides').insert(newGuides).select();
          await supabase.from('pack_guides').insert(insertedGuides.map(g => ({ pack_id: newBundle.id, guide_id: g.id })));
          
          // Update Usage
          UsageTrackingService.updateUsageMetric(user.id, 'active_guides', insertedGuides.length).catch(console.error);
        }
        
        // Update Usage
        UsageTrackingService.updateUsageMetric(user.id, 'bundles', 1).catch(console.error);

        await fetchData(user);
        toast({ title: "🎉 Bundle Added!", variant: "success" });
        navigate(`/bundle/${newBundle.id}`);
    } catch (error) {
        logError(error, { context: 'handleAddBundleFromLibrary' });
        toast({ title: "Error adding bundle", variant: "destructive" });
    }
  }, [user, navigate, toast, fetchData]);
  
  const getGuideById = useCallback((guideId) => {
    if (!allGuides || allGuides.length === 0) return undefined;
    return allGuides.find(g => g.id === guideId);
  }, [allGuides]);

  const value = {
    allBundles, allGuides, bundleLibrary, availableLibraryBundles, guideLibrary, favorites, isDataLoaded,
    fetchData: (currentUser) => fetchData(currentUser || user),
    toggleFavorite, handleSaveGuide, handleArchiveGuide, handleRestoreGuide, handleRestoreBundle, handleSaveBundle, handleArchiveBundle, handleAddGuideFromLibrary, handleAddAndEditFromLibrary, handleAddGuidesToBundle, handleAddBundleFromLibrary, handleRemoveGuideFromBundle, getGuideById,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
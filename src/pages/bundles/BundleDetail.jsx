import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit, Share2, Plus, Frown, FileText, BookPlus, Archive, Loader2, RefreshCw, Download, Lock, MoreVertical, Trash2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AddGuidesToBundleModal from '@/components/AddGuidesToBundleModal';
import { Helmet } from 'react-helmet';
import BundleImage from '@/components/BundleImage';
import PageHeader from '@/components/PageHeader';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { logError } from '@/lib/errorLogger';
import GuideIcon from '@/components/GuideIcon';
import ReadOnlyUpgradeModal from '@/components/ReadOnlyUpgradeModal';

const BundleDetail = ({ bundle: propBundle, guides: propGuides }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    allBundles, 
    allGuides, 
    bundleLibrary,
    handleAddGuidesToBundle,
    handleRemoveGuideFromBundle,
    handleAddBundleFromLibrary,
    handleDeleteBundle,
    isDataLoaded,
    fetchData
  } = useData();
  const { user } = useAuth();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [aiAssembled, setAiAssembled] = useState(!!location.state?.aiAssembled);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isReadOnlyModalOpen, setIsReadOnlyModalOpen] = useState(false);
  const [readOnlyReturnTo, setReadOnlyReturnTo] = useState(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Determine view mode based on URL path
  const isLibraryView = location.pathname.includes('/library/');

  // Resolution Logic
  let bundle, guides;

  if (isLibraryView) {
    // Look in public library data
    // Use bundleLibrary (full list) instead of availableLibraryBundles to ensure we find it even if user has it
    bundle = bundleLibrary.find(b => String(b.id) === String(id));
    // Library bundles usually have guides nested or joined in the library_packs query
    guides = bundle?.guides || []; 
  } else {
    // Look in user's private data
    bundle = propBundle || allBundles.find(b => String(b.id) === String(id));
    guides = propGuides || allGuides.filter(g => g.bundles && g.bundles.includes(bundle?.id));
    // Render in the bundle's curated order when positions exist (AI-assembled
    // bundles set them); guides without a position sort last, stably.
    if (bundle && guides && !propGuides) {
      guides = [...guides].sort((a, b) =>
        (a.bundlePositions?.[bundle.id] ?? Number.MAX_SAFE_INTEGER) -
        (b.bundlePositions?.[bundle.id] ?? Number.MAX_SAFE_INTEGER)
      );
    }
  }

  // Debug Logging for Routing/Data Issues
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.group('BundleDetail Debug Info');
      console.log('View Mode:', isLibraryView ? 'Library (Public)' : 'User (Private)');
      console.log('URL Parameter (id):', id);
      console.log('Is Data Loaded:', isDataLoaded);
      console.log('Data Sources Checked:', isLibraryView ? 'bundleLibrary' : 'allBundles');
      console.log('Resolved Bundle:', bundle);
      console.log('Resolved Guides Count:', guides?.length);
      console.groupEnd();
    }
  }, [id, isDataLoaded, isLibraryView, bundle, guides]);

  // Handle Loading State
  if (!bundle && !isDataLoaded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#FAF9F6] dark:bg-gray-950">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground font-medium">Loading bundle data...</p>
      </div>
    );
  }

  // Handle Not Found State
  if (!bundle) {
    console.warn(`[BundleDetail] 404 - Bundle not found. ID: ${id}, Mode: ${isLibraryView ? 'Library' : 'User'}`);
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#FAF9F6] dark:bg-gray-950 px-6 text-center">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl max-w-md w-full"
        >
          <Frown size={64} className="mx-auto text-gray-300 dark:text-gray-600 mb-6" />
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3">
            {isLibraryView ? "Library Bundle Not Found" : "Bundle Not Found"}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            We couldn't find this bundle. It may have been deleted, or you might be looking in the wrong place.
          </p>
          <div className="flex flex-col gap-3">
             <Button onClick={() => navigate(isLibraryView ? '/bundles' : '/bundles')} className="w-full">
               Return to Bundles
             </Button>
             <Button variant="outline" onClick={() => fetchData(user)} className="w-full">
               <RefreshCw size={16} className="mr-2" /> Refresh Data
             </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  const isReadOnly = !!bundle?.is_read_only && !isLibraryView;
  // Family members see shared bundles but only the owner can share or delete
  // them (RLS enforces this server-side; the UI hides the affordances).
  const isOwner = !bundle?.is_shared_with_me;
  const gateReadOnly = (returnToOverride = null) => {
    if (isReadOnly) {
      setReadOnlyReturnTo(returnToOverride);
      setIsReadOnlyModalOpen(true);
      return true;
    }
    return false;
  };

  const handleConfirmDelete = async () => {
    if (!bundle?.id) return;
    setIsDeleting(true);
    const ok = await handleDeleteBundle(bundle.id);
    setIsDeleting(false);
    if (ok) {
      setIsDeleteOpen(false);
      navigate('/bundles');
    }
  };

  const handleShare = async () => {
    if (!user || !guides) return;
    if (gateReadOnly()) return;
    try {
      const guideIds = guides.map(g => g.id);
      if (guideIds.length > 0) {
        const { error: updateGuidesError } = await supabase.from('guides').update({ is_shareable: true }).in('id', guideIds);
        if (updateGuidesError) throw updateGuidesError;
      }
      
      const { data: existingLinks } = await supabase.from('shared_links').select('guide_id').in('guide_id', guideIds);
      const existingLinkIds = new Set(existingLinks.map(l => l.guide_id));
      const linksToCreate = guideIds.filter(id => !existingLinkIds.has(id)).map(guideId => ({ user_id: user.id, guide_id: guideId, bundle_id: bundle.id }));

      if (linksToCreate.length > 0) {
          const { error: createLinksError } = await supabase.from('shared_links').insert(linksToCreate);
          if (createLinksError) throw createLinksError;
      }

      const { data: shareData, error: shareError } = await supabase.from('shared_links').insert({ user_id: user.id, bundle_id: bundle.id, guide_id: null }).select().single();
      if (shareError) throw shareError;
      
      const shareId = shareData.id;
      navigate(`/share/${shareId}`, { state: { fromBundleId: bundle.id } });

    } catch (error) {
      logError(error, { context: 'Bundle Sharing' });
      toast({ title: "Oops! Sharing failed.", description: "Could not create a share link. Please try again.", variant: "destructive" });
    }
  };

  const handleToggleFab = () => {
    if (gateReadOnly()) return;
    setIsFabOpen(prev => !prev);
  };
  
  const handleGuideClick = (guide) => {
    // For library guides, we might want to view them in a read-only mode or just show details
    if (isLibraryView) {
      navigate(`/library/guide/${guide.id}`);
    } else {
      navigate(`/guide/${guide.id}`);
    }
  };

  const siteUrl = "https://familyplaybook.app";
  const ogImage = bundle.image || "/icon-192x192.png";

  return (
    <>
      <Helmet>
        <title>{`${bundle.name} - Family Playbook`}</title>
        <meta name="description" content={bundle.description || `View the guides inside the ${bundle.name} bundle.`} />
        <meta property="og:title" content={`${bundle.name} - Family Playbook`} />
        <meta property="og:description" content={bundle.description || `View the guides inside the ${bundle.name} bundle.`} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:url" content={`${siteUrl}/bundle/${bundle.id}`} />
      </Helmet>
      <div className="min-h-screen bg-[#FAF9F6] dark:bg-gray-950 pb-40">
        {!isLibraryView && (
          <AddGuidesToBundleModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            allGuides={allGuides}
            guidesInBundle={guides}
            onAddGuides={(guideIds) => {
              const ids = guideIds.map(g => (typeof g === 'object' && g !== null && g.id) ? g.id : g);
              handleAddGuidesToBundle(bundle.id, ids);
            }}
          />
        )}
        <ReadOnlyUpgradeModal
          isOpen={isReadOnlyModalOpen}
          onClose={() => setIsReadOnlyModalOpen(false)}
          resourceType="bundle"
          returnTo={readOnlyReturnTo}
        />
        
        <header
          className="px-[22px] pt-6 pb-6 text-white"
          style={{ background: bundle.color || '#C25065' }}
        >
          <PageHeader title="" onBack={() => navigate('/guides?segment=bundles')}>
            {isLibraryView ? (
              // Library Actions
               <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => handleAddBundleFromLibrary(bundle)} 
                className="rounded-full bg-white dark:bg-gray-800 shadow-sm text-brand-blue"
                title="Add to My Collection"
               >
                 <Download size={20} />
               </Button>
            ) : (
              // User Actions
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { if (!gateReadOnly(`/bundle/${bundle.id}/edit`)) navigate(`/bundle/${bundle.id}/edit`); }}
                  className="rounded-full bg-white dark:bg-gray-800 shadow-sm text-gray-800 dark:text-gray-100"
                >
                  <Edit size={20} />
                </Button>
                {isOwner && (
                  <Button variant="ghost" size="icon" onClick={handleShare} className="rounded-full bg-white dark:bg-gray-800 shadow-sm text-gray-800 dark:text-gray-100"><Share2 size={20} /></Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full bg-white dark:bg-gray-800 shadow-sm text-gray-800 dark:text-gray-100" aria-label="More actions">
                      <MoreVertical size={20} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { if (!gateReadOnly(`/bundle/${bundle.id}/edit`)) navigate(`/bundle/${bundle.id}/edit`); }}>
                      <Edit size={16} className="mr-2" /> Edit Bundle
                    </DropdownMenuItem>
                    {isOwner && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setIsDeleteOpen(true)} className="text-red-600 focus:text-red-600 dark:text-red-400">
                          <Trash2 size={16} className="mr-2" /> Delete Bundle
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </PageHeader>
  
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="mt-3">
            <h1 className="font-display font-semibold text-[27px] leading-[1.2] text-white">{bundle.name}</h1>
            <p className="text-[14.5px] mt-1" style={{ color: 'rgba(255,255,255,.8)' }}>
              {guides.length} {guides.length === 1 ? 'guide' : 'guides'}
              {bundle.description ? ` · ${bundle.description}` : ''}
            </p>

            {isLibraryView && (
              <Button
                onClick={() => handleAddBundleFromLibrary(bundle)}
                className="mt-4 rounded-full bg-white text-mulberry font-bold hover:bg-white/90"
              >
                <Download size={16} className="mr-2" /> Add to My Bundles
              </Button>
            )}
          </motion.div>
        </header>

        {/* Actions row */}
        {!isLibraryView && (
          <div className="px-[22px] mt-4 mb-2 flex gap-2.5">
            {isOwner && (
              <button
                onClick={handleShare}
                className="flex-1 h-11 rounded-full bg-raspberry hover:bg-raspberry-hover text-cream font-bold text-[15px] transition-colors"
              >
                Share with a helper
              </button>
            )}
            <button
              onClick={() => { if (!gateReadOnly(`/bundle/${bundle.id}/edit`)) navigate(`/bundle/${bundle.id}/edit`); }}
              className={`h-11 px-6 rounded-full bg-blush text-blush-copy font-bold text-[15px] ${isOwner ? '' : 'flex-1'}`}
            >
              Edit
            </button>
          </div>
        )}

        {isReadOnly && isOwner && (
          <div className="mx-6 mb-6 -mt-2 flex items-start gap-3 rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-4">
            <Lock size={18} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">This bundle is read-only</p>
              <p className="text-sm text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                You're over your plan's bundle limit. Upgrade to edit it, or delete it to get back under your limit.
              </p>
            </div>
            <div className="ml-2 flex flex-shrink-0 items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsDeleteOpen(true)}
                className="border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200"
              >
                Delete
              </Button>
              <Button size="sm" onClick={() => setIsReadOnlyModalOpen(true)}>
                Upgrade
              </Button>
            </div>
          </div>
        )}
        {isReadOnly && !isOwner && (
          <div className="mx-6 mb-6 -mt-2 flex items-start gap-3 rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 p-4">
            <Lock size={18} className="mt-0.5 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />
            <p className="flex-1 text-sm text-indigo-900 dark:text-indigo-200">
              <span className="font-semibold">Shared with you — view only.</span>{' '}
              Only the owner (or members they invite as editors) can make changes.
            </p>
          </div>
        )}
        {aiAssembled && (
          <div className="mx-6 mb-6 -mt-2 flex items-start gap-3 rounded-2xl border border-purple-200 dark:border-purple-900 bg-purple-50 dark:bg-purple-950/40 p-4">
            <Sparkles size={18} className="mt-0.5 flex-shrink-0 text-purple-600 dark:text-purple-400" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-purple-900 dark:text-purple-200">AI assembled this bundle for you</p>
              <p className="mt-0.5 text-purple-800/80 dark:text-purple-300/80">
                Add or remove any guide, then share it with the button above. Emergency guides are listed first.
              </p>
            </div>
            <button onClick={() => setAiAssembled(false)} className="text-purple-400 hover:text-purple-600" aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        )}

        <AlertDialog open={isDeleteOpen} onOpenChange={(open) => { if (!open) setIsDeleteOpen(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this bundle?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes “{bundle?.name}”. The guides inside it
                are kept. This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Keep bundle</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleConfirmDelete(); }}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {isDeleting ? <Loader2 className="animate-spin h-4 w-4" /> : 'Delete bundle'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <main className="px-[22px]">
          {guides.length > 0 ? (
            <div className="space-y-2.5">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-raspberry mt-3 mb-1">
                In order
              </div>
              {guides.map((guide, index) => (
                <div key={guide.id} className="bg-card rounded-lg border border-card-border shadow-card px-4 py-[15px] transition-all hover:border-hover-border hover:-translate-y-px flex items-center gap-3">
                  <span className="w-4 flex-shrink-0 text-[13px] font-bold text-chevron">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div onClick={() => handleGuideClick(guide)} className="flex-1 flex items-center gap-3.5 cursor-pointer min-w-0">
                    <GuideIcon category={guide.category} size={42} dot={15} />
                    <div className="min-w-0">
                      <h3 className="font-bold text-[16.5px] text-mulberry dark:text-foreground truncate">{guide.name}</h3>
                      <p className="text-[13.5px] text-muted-copy">{guide.category}</p>
                    </div>
                  </div>
                  {!isLibraryView && (
                    isReadOnly ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => { e.stopPropagation(); setIsReadOnlyModalOpen(true); }}
                        aria-label="Remove from bundle (read-only — upgrade required)"
                      >
                        <Archive size={18} />
                      </Button>
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={(e) => e.stopPropagation()}><Archive size={18} /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove from bundle?</AlertDialogTitle>
                            <AlertDialogDescription>This will remove "{guide.name}" from "{bundle.name}", but it will remain in your library.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => handleRemoveGuideFromBundle(bundle.id, guide.id, bundle.name, guide.name)}>Remove</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-lg border border-card-border p-8 text-center mt-6">
              <h2 className="font-display font-semibold text-[18px] text-mulberry dark:text-foreground mb-1">Nothing in this bundle yet.</h2>
              {!isLibraryView && (
                <Button
                  onClick={() => { if (!gateReadOnly()) setIsModalOpen(true); }}
                  className="mt-3 rounded-full bg-raspberry hover:bg-raspberry-hover text-cream font-bold"
                >
                  Add guides
                </Button>
              )}
            </div>
          )}
        </main>
        
        {/* Floating Action Button - Only for User Bundles */}
        {!isLibraryView && (
          <div className="fixed bottom-28 right-6 z-40">
            <AnimatePresence>
              {isFabOpen && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.2, ease: "easeInOut" }} className="flex flex-col items-center gap-4 mb-4">
                  <motion.button onClick={() => { setIsModalOpen(true); setIsFabOpen(false); }} className="w-14 h-14 rounded-full bg-gradient-to-br from-[#FFB88C] to-[#FFD166] flex items-center justify-center shadow-lg" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} title="Add Existing Guide"><BookPlus size={24} color="white" strokeWidth={2.5} /></motion.button>
                  <motion.button onClick={() => { navigate('/guides/create', { state: { bundles: [bundle.id] } }); setIsFabOpen(false); }} className="w-14 h-14 rounded-full bg-gradient-to-br from-[#5CA9E9] to-[#7BC47F] flex items-center justify-center shadow-lg" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} title="Create New Guide"><Plus size={28} color="white" strokeWidth={2.5} /></motion.button>
                </motion.div>
              )}
            </AnimatePresence>
            <motion.button onClick={handleToggleFab} animate={{ rotate: isFabOpen ? 45 : 0 }} className="w-16 h-16 rounded-full bg-gray-800 dark:bg-gray-100 flex items-center justify-center shadow-lg" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}><Plus size={28} className="text-white dark:text-gray-800" strokeWidth={3} /></motion.button>
          </div>
        )}
      </div>
    </>
  );
};

export default BundleDetail;
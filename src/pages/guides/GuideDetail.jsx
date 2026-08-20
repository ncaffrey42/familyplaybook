import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Share2, CheckCircle2, Circle, Heart, Pencil, Copy, Loader2, MoreVertical, Download, Package, Plus, Lock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';
import { Helmet } from 'react-helmet';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PageHeader from '@/components/PageHeader';
import { logError } from '@/lib/errorLogger';
import { loadProgress, saveProgress, pruneProgress } from '@/lib/checklistProgress';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import GuideIcon from '@/components/GuideIcon';
import HeartMark from '@/components/HeartMark';
import { entitlementService } from '@/services/EntitlementService';
import { UsageTrackingService } from '@/services/UsageTrackingService';
import AddGuidesToBundleModal from '@/components/AddGuidesToBundleModal';
import ReadOnlyUpgradeModal from '@/components/ReadOnlyUpgradeModal';
import { Badge } from "@/components/ui/badge";
import { isVideoUrl } from '@/lib/utils';

const StepMedia = ({ url }) => {
  if (!url) return null;
  const isVideo = isVideoUrl(url);
  return (
    <div className="mt-4 rounded-lg overflow-hidden shadow-sm">
      {isVideo ? (
        <video src={url} controls className="w-full h-auto" />
      ) : (
        <img className="w-full h-auto object-cover" alt="Step media" src={url} />
      )}
    </div>
  );
};

const GuideDetail = ({ guide: propGuide }) => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { 
    getGuideById, 
    allGuides,
    guideLibrary, 
    favorites, 
    toggleFavorite, 
    fetchData,
    handleAddGuideFromLibrary,
    handleAddAndEditFromLibrary,
    handleDeleteGuide,
    allBundles
  } = useData();
  
  const { toast } = useToast();
  const { user } = useAuth();
  const [checkedSteps, setCheckedSteps] = useState([]);
  const [isSharing, setIsSharing] = useState(false);
  const [isBundleModalOpen, setIsBundleModalOpen] = useState(false);
  const [isReadOnlyModalOpen, setIsReadOnlyModalOpen] = useState(false);
  const [readOnlyReturnTo, setReadOnlyReturnTo] = useState(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Resolution Logic
  const isLibraryView = location.pathname.includes('/library/');
  
  // Resolve guide based on view mode
  let guide = propGuide;
  if (!guide && id) {
    if (isLibraryView) {
      // Look up in public library data
      guide = guideLibrary.find(g => String(g.id) === String(id));
    } else {
      // Look up in user's private data
      guide = allGuides.find(g => String(g.id) === String(id));
    }
  }

  // Debug Logging
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.group('GuideDetail Debug');
      console.log('ID:', id);
      console.log('Mode:', isLibraryView ? 'Library' : 'User');
      console.log('Resolved Guide:', guide);
      console.groupEnd();
    }
  }, [id, isLibraryView, guide]);
  
  // Add null/undefined checks for guide and favorites before accessing properties
  const isFavorited = guide && favorites && Array.isArray(favorites) 
    ? favorites.some(fav => fav && fav.id === guide.id) 
    : false;

  const steps = (guide && Array.isArray(guide.steps)) ? guide.steps.map((step, index) => ({...step, id: step.id || index})) : [];
  const content = guide ? guide.content : null;
  const bundleId = new URLSearchParams(window.location.search).get('bundleId');

  // Checklist progress survives a backgrounded app, and resets on its own
  // tomorrow. Library previews aren't a checklist you're working through, so
  // they neither load nor save.
  const progressScope = !isLibraryView && guide?.id ? `guide:${guide.id}` : null;

  useEffect(() => { pruneProgress(); }, []);

  useEffect(() => {
    setCheckedSteps(progressScope ? loadProgress(progressScope) : []);
  }, [progressScope]);

  useEffect(() => {
    if (progressScope) saveProgress(progressScope, checkedSteps);
  }, [progressScope, checkedSteps]);

  const toggleStep = (stepId) => {
    if (isLibraryView) return; // Disable toggling in library view
    setCheckedSteps(prev =>
      prev.includes(stepId)
        ? prev.filter(id => id !== stepId)
        : [...prev, stepId]
    );
  };

  const isReadOnly = !!guide?.is_read_only && !isLibraryView;
  // Family members see shared guides but only the owner can share or delete
  // them (RLS enforces this server-side; the UI hides the affordances).
  const isOwner = !guide?.is_shared_with_me;
  const gateReadOnly = (returnToOverride = null) => {
    if (isReadOnly) {
      setReadOnlyReturnTo(returnToOverride);
      setIsReadOnlyModalOpen(true);
      return true;
    }
    return false;
  };

  const handleConfirmDelete = async () => {
    if (!guide?.id) return;
    setIsDeleting(true);
    const ok = await handleDeleteGuide(guide.id);
    setIsDeleting(false);
    if (ok) {
      setIsDeleteOpen(false);
      navigate('/guides');
    }
  };

  const handleShare = async () => {
    if (!user || !user.id || !guide || isLibraryView) return;
    if (gateReadOnly()) return;
    setIsSharing(true);
    try {
        const { error: updateError } = await supabase.from('guides').update({ is_shareable: true }).eq('id', guide.id);
        if (updateError) throw updateError;
      
        const { data: existingLink } = await supabase.from('shared_links').select('id').eq('guide_id', guide.id).maybeSingle();

        let shareId;
        if (existingLink) {
            shareId = existingLink.id;
        } else {
            const { data: shareData, error: shareError } = await supabase.from('shared_links').insert({ user_id: user.id, guide_id: guide.id, bundle_id: bundleId || null }).select().single();
            if (shareError) throw shareError;
            shareId = shareData.id;
        }
        await fetchData();
        navigate(`/share-manage/${shareId}`, { state: { fromGuideId: guide.id, fromBundleId: bundleId } });

    } catch (error) {
        logError(error, { context: 'Guide Sharing V2' });
        toast({ title: "Oops! Sharing failed.", description: "Could not create a share link.", variant: "destructive" });
    } finally {
        setIsSharing(false);
    }
  };

  const handleFavoriteClick = () => {
    if (guide && !isLibraryView) {
      toggleFavorite(guide);
    }
  };
  
  const handleEdit = () => {
    if (!guide || !guide.id || isLibraryView) return;
    if (gateReadOnly(`/guide/${guide.id}/edit`)) return;
    navigate(`/guide/${guide.id}/edit`);
  };

  const handleDuplicate = async () => {
    if (!user || !user.id || !guide) return;

    // Entitlement Check for Duplicate (which is a Create action)
    try {
      const entitlement = await entitlementService.canPerform(user.id, 'GUIDE_CREATE');
      if (!entitlement.allowed) {
        toast({ 
          title: "Limit Reached", 
          description: entitlement.reason_code || "You cannot create more guides.", 
          variant: "destructive" 
        });
        return;
      }
    } catch (e) {
      return;
    }

    const { id, created_at, ...guideToCopy } = guide;
    const newGuide = {
      ...guideToCopy,
      name: `${guide.name} (Copy)`,
      user_id: user.id,
      is_shareable: false,
    };
    
    const { data: savedGuide, error } = await supabase.from('guides').insert(newGuide).select().single();

    if (error) {
      logError(error);
      toast({ title: "Error duplicating guide", description: error.message, variant: "destructive" });
    } else {
      UsageTrackingService.updateUsageMetric(user.id, 'active_guides', 1).catch(console.error);
      await fetchData();
      toast({ title: "✨ Guide Duplicated!", description: `A copy of "${guide.name}" has been created.` });
      if (savedGuide && savedGuide.id) {
        navigate(`/guide/${savedGuide.id}`);
      }
    }
  };

  const handleUpdateBundles = async (selectedBundles) => {
    if (!user || !guide || isLibraryView) return;
    
    // selectedBundles is array of bundle objects
    const newBundleIds = selectedBundles.map(b => b.id);
    
    try {
        // Perform update: Delete old associations -> Insert new ones
        const { error: deleteError } = await supabase.from('pack_guides').delete().eq('guide_id', guide.id);
        if (deleteError) throw deleteError;
        
        if (newBundleIds.length > 0) {
           const { error: insertError } = await supabase.from('pack_guides').insert(newBundleIds.map(pid => ({ pack_id: pid, guide_id: guide.id })));
           if (insertError) throw insertError;
        }
        
        await fetchData(user);
        
        // Custom toast handling for smooth fade out
        const { id: toastId, dismiss } = toast({ 
          title: "Bundle Updated", 
          description: "Guide bundle assignment saved.",
          duration: 1500, // Short duration
        });

        // Trigger smooth dismiss after delay
        setTimeout(() => {
          dismiss();
        }, 1500);

    } catch (error) {
        logError(error, { context: 'UpdateGuideBundles' });
        toast({ title: "Update Failed", description: "Could not update bundle assignment.", variant: "destructive" });
    }
  };

  if (!guide) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">
              {isLibraryView ? "Library Guide Not Found" : "Guide Not Found"}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              It may have been deleted or you might be looking in the wrong place.
            </p>
            <Button onClick={() => navigate(isLibraryView ? '/guides' : '/guides')}>Return to Library</Button>
        </div>
      </div>
    );
  }

  const siteUrl = "https://familyplaybook.app";
  const ogImage = (content?.image) || "/icon-192x192.png";
  const ogDescription = guide.description || `Step-by-step guide for "${guide.name}".`;
  
  // Calculate assigned bundles for display
  const assignedBundles = guide.bundles ? allBundles.filter(b => guide.bundles.includes(b.id)) : [];
  const assignedBundleName = assignedBundles.length > 0 ? assignedBundles[0].name : null;
  const multipleBundles = assignedBundles.length > 1;

  return (
    <>
      <Helmet>
        <title>{`${guide.name} - Family Playbook`}</title>
        <meta name="description" content={ogDescription} />
        <meta property="og:title" content={`${guide.name} - Family Playbook`} />
        <meta property="og:description" content={ogDescription} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:url" content={`${siteUrl}/guide/${guide.id}`} />
      </Helmet>
      <div className="min-h-screen bg-[#FAF9F6] dark:bg-gray-950 pb-28">
        {!isLibraryView && (
            <AddGuidesToBundleModal
                isOpen={isBundleModalOpen}
                onClose={() => setIsBundleModalOpen(false)}
                isManagingGuidePacks={true}
                allBundles={allBundles}
                initialSelectedBundleIds={guide.bundles || []}
                onSave={handleUpdateBundles}
            />
        )}
        <ReadOnlyUpgradeModal
          isOpen={isReadOnlyModalOpen}
          onClose={() => setIsReadOnlyModalOpen(false)}
          resourceType="guide"
          returnTo={readOnlyReturnTo}
        />

        <header className="bg-cream dark:bg-background px-[22px] pt-6 pb-6">
          <PageHeader title="" onBack={() => navigate(-1)}>
            {isLibraryView ? (
              // Library View Actions
              <div className="flex gap-2">
                 <Button 
                   variant="outline"
                   size="sm"
                   onClick={() => handleAddAndEditFromLibrary(guide)}
                   className="rounded-full bg-white/50 border-primary/20 text-primary dark:bg-gray-800/50 dark:text-white"
                 >
                   Customize
                 </Button>
                 <Button 
                   size="sm"
                   onClick={() => handleAddGuideFromLibrary(guide)}
                   className="rounded-full bg-primary text-primary-foreground shadow-sm"
                 >
                   <Download size={16} className="mr-2"/> Add to My Guides
                 </Button>
              </div>
            ) : (
              // User View Actions
              <div className="flex items-center gap-2">
                <div className="hidden md:flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={handleEdit} className="rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm" aria-label="Edit">
                    <Pencil size={20} className="text-gray-500 dark:text-gray-400" />
                  </Button>
                  {/* Pin toggle — the brand heart-route mark IS the pin control */}
                  <Button variant="ghost" size="icon" onClick={handleFavoriteClick} className="rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm" aria-label={isFavorited ? 'Unpin' : 'Pin'}>
                      <HeartMark
                        size={20}
                        stroke={isFavorited ? '#C25065' : '#D8B9C4'}
                        fill={isFavorited ? 'rgba(194,80,101,.12)' : 'none'}
                      />
                  </Button>
                  {isOwner && (
                    <Button variant="ghost" size="icon" onClick={handleShare} disabled={isSharing} className="rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm" aria-label="Share">
                      {isSharing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Share2 size={20} />}
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm" aria-label="More actions">
                        <MoreVertical size={20} className="text-gray-500 dark:text-gray-400" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleDuplicate}><Copy size={16} className="mr-2"/> Duplicate</DropdownMenuItem>
                      {isOwner && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setIsDeleteOpen(true)} className="text-red-600 focus:text-red-600 dark:text-red-400">
                            <Trash2 size={16} className="mr-2"/> Delete Guide
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="md:hidden">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
                          <MoreVertical size={20} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleEdit}><Pencil size={16} className="mr-2"/> Edit Guide</DropdownMenuItem>
                        <DropdownMenuItem onClick={handleFavoriteClick}>
                            <Heart size={16} className={`mr-2 ${isFavorited ? 'text-red-500 fill-red-500' : ''}`} /> {isFavorited ? 'Unfavorite' : 'Favorite'}
                        </DropdownMenuItem>
                        {isOwner && (
                          <DropdownMenuItem onClick={handleShare} disabled={isSharing}>
                              {isSharing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 size={16} className="mr-2"/>} Share
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={handleDuplicate}><Copy size={16} className="mr-2"/> Duplicate</DropdownMenuItem>
                        {isOwner && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setIsDeleteOpen(true)} className="text-red-600 focus:text-red-600 dark:text-red-400">
                                <Trash2 size={16} className="mr-2"/> Delete Guide
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                </div>
              </div>
            )}
          </PageHeader>
  
          <div className="flex items-center gap-4">
            <GuideIcon category={guide.category} size={48} dot={17} />
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-semibold text-[25px] leading-[1.2] text-mulberry dark:text-foreground truncate">{guide.name}</h1>
              <p className="text-[13.5px] text-muted-copy mt-0.5">
                {!isLibraryView && steps.length > 0
                  ? `${checkedSteps.length} of ${steps.length} done`
                  : guide.category}
              </p>
              
              {!isLibraryView && (
                  <div
                    className="flex items-center gap-2 mt-2 cursor-pointer group"
                    onClick={() => { if (!gateReadOnly()) setIsBundleModalOpen(true); }}
                  >
                    {assignedBundles.length > 0 ? (
                        <Badge variant="outline" className="bg-white/50 hover:bg-white/80 transition-colors border-gray-400/30 text-gray-700 dark:text-gray-300 gap-1 pl-1.5">
                            <Package size={12} />
                            {multipleBundles ? `${assignedBundles.length} Bundles` : assignedBundleName}
                            <Pencil size={10} className="ml-1 opacity-50 group-hover:opacity-100" />
                        </Badge>
                    ) : (
                        <Badge variant="secondary" className="bg-white/30 hover:bg-white/60 transition-colors text-gray-600 dark:text-gray-400 gap-1 pl-1.5">
                            <Plus size={12} /> Add to Bundle
                        </Badge>
                    )}
                  </div>
              )}
              
              {isLibraryView && <p className="text-xs text-primary font-medium mt-1 uppercase tracking-wide">Library Preview</p>}
            </div>
          </div>
        </header>

        {isReadOnly && (
          <div className="mx-6 mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-4">
            <Lock size={18} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">This guide is read-only</p>
              <p className="text-sm text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                You're over your plan's guide limit. Upgrade to edit it, or delete it to get back under your limit.
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

        <AlertDialog open={isDeleteOpen} onOpenChange={(open) => { if (!open) setIsDeleteOpen(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this guide?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes “{guide?.name}”, including its steps and
                media. This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Keep guide</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleConfirmDelete(); }}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {isDeleting ? <Loader2 className="animate-spin h-4 w-4" /> : 'Delete guide'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <main className="px-[22px] py-5 space-y-5">
          {/* Progress bar — 7px, meter track, raspberry fill */}
          {!isLibraryView && steps.length > 0 && (
            <div className="h-[7px] bg-meter-track rounded-full overflow-hidden">
              <div
                className="h-full bg-raspberry rounded-full"
                style={{ width: `${(checkedSteps.length / steps.length) * 100}%`, transition: 'width .3s ease' }}
              />
            </div>
          )}

          {/* Optional intro — blush block */}
          {(guide.description || content?.description || content?.intro) && (
            <section className="bg-blush rounded-lg p-4">
              <p className="text-[14.5px] leading-[1.6] whitespace-pre-wrap" style={{ color: '#7A4A38' }}>
                {content?.intro || guide.description || content?.description}
              </p>
            </section>
          )}

          {/* One card holds every step */}
          {steps.length > 0 && (
            <section>
              <div className="bg-card rounded-lg border border-card-border shadow-card overflow-hidden">
                {steps.map((step, index) => {
                  const isChecked = checkedSteps.includes(step.id) && !isLibraryView;
                  return (
                    <div
                      key={step.id}
                      onClick={() => !isLibraryView && toggleStep(step.id)}
                      role={isLibraryView ? undefined : 'button'}
                      className={`flex items-start gap-3.5 px-4 py-4 ${index > 0 ? 'border-t border-row-divider' : ''} ${!isLibraryView ? 'cursor-pointer' : ''} ${isChecked ? 'bg-cream' : ''}`}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {isLibraryView ? (
                          <span className="w-[26px] h-[26px] rounded-full bg-halo-raspberry text-raspberry text-[12px] flex items-center justify-center font-bold">{index + 1}</span>
                        ) : (
                          <span
                            className={`w-[26px] h-[26px] rounded-full flex items-center justify-center transition-colors ${
                              isChecked ? 'bg-raspberry' : 'border-2 border-checkbox-ring bg-transparent'
                            }`}
                          >
                            {isChecked && <CheckCircle2 size={16} className="text-white" strokeWidth={3} />}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-bold text-[16px] ${isChecked ? 'text-muted-copy line-through' : 'text-mulberry dark:text-foreground'}`}>
                          {step.title}
                        </h3>
                        {step.content && (
                          <p className={`text-[14px] leading-[1.55] mt-0.5 ${isChecked ? 'text-muted-copy line-through' : ''}`} style={isChecked ? {} : { color: '#7A5A68' }}>
                            {step.content}
                          </p>
                        )}
                        <StepMedia url={step.mediaUrl} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Mark all done / Start over */}
              {!isLibraryView && (
                checkedSteps.length === steps.length ? (
                  <button
                    onClick={() => setCheckedSteps([])}
                    className="mt-4 w-full h-11 rounded-full bg-blush text-blush-copy font-bold text-[15px]"
                  >
                    Start over
                  </button>
                ) : (
                  <button
                    onClick={() => setCheckedSteps(steps.map((s) => s.id))}
                    className="mt-4 w-full h-11 rounded-full bg-raspberry hover:bg-raspberry-hover text-cream font-bold text-[15px] transition-colors"
                  >
                    Mark all done
                  </button>
                )
              )}

              {/* Completion block */}
              {checkedSteps.length === steps.length && steps.length > 0 && !isLibraryView && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mt-4 bg-blush rounded-lg p-5 text-center"
                >
                  <h3 className="font-display font-semibold text-[19px] text-mulberry">All done.</h3>
                  <p className="text-[14px] mt-1 text-blush-copy">
                    Anyone you share this with sees the same steps, checked off fresh.
                  </p>
                </motion.div>
              )}
            </section>
          )}
        </main>
      </div>
    </>
  );
};

export default GuideDetail;
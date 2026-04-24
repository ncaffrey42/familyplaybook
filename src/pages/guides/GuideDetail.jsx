import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Share2, CheckCircle2, Circle, Heart, Pencil, Copy, Archive, Loader2, MoreVertical, Download, Package, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';
import { Helmet } from 'react-helmet';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PageHeader from '@/components/PageHeader';
import { logError } from '@/lib/errorLogger';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import GuideIcon from '@/components/GuideIcon';
import { entitlementService } from '@/services/EntitlementService';
import { UsageTrackingService } from '@/services/UsageTrackingService';
import AddGuidesToBundleModal from '@/components/AddGuidesToBundleModal';
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
    handleArchiveGuide,
    handleAddGuideFromLibrary,
    handleAddAndEditFromLibrary,
    allBundles
  } = useData();
  
  const { toast } = useToast();
  const { user } = useAuth();
  const [checkedSteps, setCheckedSteps] = useState([]);
  const [isSharing, setIsSharing] = useState(false);
  const [isBundleModalOpen, setIsBundleModalOpen] = useState(false);

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

  const toggleStep = (stepId) => {
    if (isLibraryView) return; // Disable toggling in library view
    setCheckedSteps(prev =>
      prev.includes(stepId)
        ? prev.filter(id => id !== stepId)
        : [...prev, stepId]
    );
  };

  const handleShare = async () => {
    if (!user || !user.id || !guide || isLibraryView) return;
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
        navigate(`/share/${shareId}`, { state: { fromGuideId: guide.id, fromBundleId: bundleId } });

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
    if (guide && guide.id && !isLibraryView) {
      navigate(`/guide/${guide.id}/edit`);
    }
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

  const handleArchive = async () => {
    if (guide && !isLibraryView) {
      await handleArchiveGuide(guide);
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

        <header className="bg-gradient-to-br from-[#5CA9E9]/20 to-[#7BC47F]/20 dark:from-[#5CA9E9]/10 dark:to-[#7BC47F]/10 p-6 pb-8">
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
                  <Button variant="ghost" size="icon" onClick={handleFavoriteClick} className="rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm" aria-label="Favorite">
                      <Heart size={20} className={isFavorited ? 'text-red-500 fill-red-500' : 'text-gray-500 dark:text-gray-400'} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={handleShare} disabled={isSharing} className="rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm" aria-label="Share">
                    {isSharing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Share2 size={20} />}
                  </Button>
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
                        <DropdownMenuItem onClick={handleShare} disabled={isSharing}>
                            {isSharing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 size={16} className="mr-2"/>} Share
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleDuplicate}><Copy size={16} className="mr-2"/> Duplicate</DropdownMenuItem>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <div className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-red-500 w-full">
                                    <Archive size={16} className="mr-2"/> Archive
                                </div>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>Archive this guide?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Archiving "{guide.name}" will remove it from your active guides.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                </div>
              </div>
            )}
          </PageHeader>
  
          <div className="flex items-center gap-4">
            <GuideIcon iconName={guide.icon} category={guide.category} />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 truncate">{guide.name}</h1>
              {guide.category && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{guide.category}</p>}
              
              {!isLibraryView && (
                  <div 
                    className="flex items-center gap-2 mt-2 cursor-pointer group"
                    onClick={() => setIsBundleModalOpen(true)}
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
  
        <main className="p-6 space-y-6">
          {(guide.description || content?.description) && (
             <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-card">
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{content?.intro || guide.description || content?.description}</p>
            </motion.section>
          )}

          {steps.length > 0 && (
            <section>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Instructions</h2>
                  {!isLibraryView && <span className="text-sm font-semibold text-[#5CA9E9]">{checkedSteps.length}/{steps.length} completed</span>}
                </div>
                {!isLibraryView && (
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${(checkedSteps.length / steps.length) * 100}%` }} className="h-full bg-gradient-to-r from-[#7BC47F] to-[#5CA9E9]" />
                  </div>
                )}
              </div>
  
              <div className="space-y-3">
                {steps.map((step, index) => {
                  const isChecked = checkedSteps.includes(step.id);
                  return (
                    <motion.div 
                      key={step.id} 
                      initial={{ opacity: 0, x: -20 }} 
                      animate={{ opacity: 1, x: 0 }} 
                      transition={{ delay: index * 0.1 }} 
                      onClick={() => toggleStep(step.id)}
                      className={`bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card ${!isLibraryView ? 'hover:shadow-soft cursor-pointer' : ''} transition-all duration-300 ${isChecked && !isLibraryView ? 'bg-gradient-to-r from-[#7BC47F]/10 to-[#5CA9E9]/10 dark:from-[#7BC47F]/5 dark:to-[#5CA9E9]/5' : ''}`}
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 mt-1">
                          {isLibraryView ? (
                             <span className="w-6 h-6 rounded-full bg-[#5CA9E9] text-white text-xs flex items-center justify-center font-semibold">{index + 1}</span>
                          ) : (
                             isChecked ? <CheckCircle2 size={24} className="text-[#7BC47F]" /> : <Circle size={24} className="text-gray-300 dark:text-gray-600" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-gray-800 dark:text-gray-100">{step.title}</h3>
                          </div>
                          <p className={`text-gray-700 dark:text-gray-300 ${!isLibraryView ? 'pl-0' : ''} ${isChecked && !isLibraryView ? 'line-through opacity-60' : ''}`}>{step.content}</p>
                          <StepMedia url={step.mediaUrl} />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
  
              {checkedSteps.length === steps.length && steps.length > 0 && !isLibraryView && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-6 bg-gradient-to-r from-[#7BC47F] to-[#5CA9E9] rounded-2xl p-6 text-center text-white">
                  <div className="text-4xl mb-2">🎉</div>
                  <h3 className="text-xl font-bold mb-1">Great Job!</h3>
                  <p className="text-sm opacity-90">You've completed all steps!</p>
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
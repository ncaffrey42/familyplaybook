import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit, Share2, Plus, Frown, FileText, BookPlus, Archive, Loader2, RefreshCw, Download } from 'lucide-react';
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
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { logError } from '@/lib/errorLogger';
import GuideIcon from '@/components/GuideIcon';

const BundleDetail = ({ bundle: propBundle, guides: propGuides }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    allBundles, 
    allGuides, 
    bundleLibrary,
    handleAddGuidesToBundle, 
    handleArchiveBundle, 
    handleRemoveGuideFromBundle, 
    handleAddBundleFromLibrary,
    isDataLoaded, 
    fetchData 
  } = useData();
  const { user } = useAuth();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);

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

  const handleShare = async () => {
    if (!user || !guides) return;
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

  const handleToggleFab = () => setIsFabOpen(prev => !prev);
  
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
        
        <header className="p-6">
          <PageHeader title="" onBack={() => navigate('/bundles')}>
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
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full bg-white dark:bg-gray-800 shadow-sm text-gray-800 dark:text-gray-100"><Archive size={20} /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Archive this bundle?</AlertDialogTitle>
                      <AlertDialogDescription>This will move "{bundle.name}" to the archive. You can restore it later.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleArchiveBundle(bundle)}>Archive</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="ghost" size="icon" onClick={() => navigate(`/bundle/${bundle.id}/edit`)} className="rounded-full bg-white dark:bg-gray-800 shadow-sm text-gray-800 dark:text-gray-100"><Edit size={20} /></Button>
                <Button variant="ghost" size="icon" onClick={handleShare} className="rounded-full bg-white dark:bg-gray-800 shadow-sm text-gray-800 dark:text-gray-100"><Share2 size={20} /></Button>
              </>
            )}
          </PageHeader>
  
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center text-center mb-8">
            <div className="w-48 h-32 rounded-3xl mb-4 overflow-hidden shadow-soft bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
              <BundleImage imageUrl={bundle.image} bundleName={bundle.name} bundleColor={bundle.color} className="w-full h-full object-cover"/>
            </div>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">{bundle.name}</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1 max-w-md">{bundle.description}</p>
            <div className="flex items-center gap-4 mt-4 text-sm text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-1.5"><FileText size={16} /><span>{guides.length} guides</span></div>
            </div>
            
            {isLibraryView && (
              <Button 
                onClick={() => handleAddBundleFromLibrary(bundle)}
                className="mt-6 bg-gradient-to-r from-brand-blue to-brand-green text-white shadow-lg"
              >
                <Download size={18} className="mr-2" /> Add to My Bundles
              </Button>
            )}
          </motion.div>
        </header>

        <main className="px-6">
          {guides.length > 0 ? (
            <div className="space-y-3">
              {guides.map((guide, index) => (
                <motion.div key={guide.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.1 }} className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card hover:shadow-soft transition-all duration-300 flex items-center gap-4">
                  <div onClick={() => handleGuideClick(guide)} className="flex-1 flex items-center gap-4 cursor-pointer">
                    <GuideIcon iconName={guide.icon} category={guide.category} />
                    <div>
                      <h3 className="font-semibold text-gray-800 dark:text-gray-200">{guide.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{guide.category}</p>
                    </div>
                  </div>
                  {!isLibraryView && (
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
                  )}
                </motion.div>
              ))}
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mt-20">
              <Frown size={48} className="mx-auto text-gray-400 dark:text-gray-500 mb-4" />
              <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200 mb-2">No Guides in this Bundle</h2>
              {!isLibraryView && (
                <>
                  <p className="text-gray-500 dark:text-gray-400 mb-6">Add a guide to get started!</p>
                  <Button onClick={() => setIsModalOpen(true)} className="bg-gradient-to-r from-[#5CA9E9] to-[#7BC47F] text-white">Add Guides</Button>
                </>
              )}
            </motion.div>
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
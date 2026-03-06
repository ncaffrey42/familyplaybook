import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit, Share2, Plus, Frown, FileText, BookPlus, Archive, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AddGuidesToPackModal from '@/components/AddGuidesToPackModal';
import { Helmet } from 'react-helmet';
import { useDraggableFab } from '@/hooks/useDraggableFab';
import PackImage from '@/components/PackImage';
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
import { useNavigation } from '@/hooks/useNavigation';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { logError } from '@/lib/errorLogger';

/**
 * Renders the detail view for a specific bundle.
 * Displays bundle information, a list of its guides, and actions
 * like editing, archiving, or adding new guides.
 */
const PackDetail = ({ pack, guides, allGuides, onAddGuidesToPack, onArchivePack }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const { isDragging, fabProps } = useDraggableFab();
  const handleNavigate = useNavigation();
  const { handleRemoveGuideFromPack, fetchData } = useData();
  const { user } = useAuth();
  const { toast } = useToast();

  if (!pack) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#FAF9F6] dark:bg-gray-950">
        <p className="text-gray-600 dark:text-gray-400">Bundle not found. Please go back.</p>
      </div>
    );
  }

  const handleShare = async () => {
    if (!user || !guides) return;
    try {
      // Step 1: Mark all guides in the bundle as shareable
      const guideIds = guides.map(g => g.id);
      if (guideIds.length > 0) {
        const { error: updateGuidesError } = await supabase
          .from('guides')
          .update({ is_shareable: true })
          .in('id', guideIds);
        if (updateGuidesError) throw updateGuidesError;
      }
      
      // Step 2: Ensure share links exist for all guides in the bundle
      const { data: existingLinks } = await supabase
        .from('shared_links')
        .select('guide_id')
        .in('guide_id', guideIds);
      
      const existingLinkIds = new Set(existingLinks.map(l => l.guide_id));
      const linksToCreate = guideIds
        .filter(id => !existingLinkIds.has(id))
        .map(guideId => ({
            user_id: user.id,
            guide_id: guideId,
            bundle_id: pack.id,
        }));

      if (linksToCreate.length > 0) {
          const { error: createLinksError } = await supabase.from('shared_links').insert(linksToCreate);
          if (createLinksError) throw createLinksError;
      }

      // Step 3: Create a share link for the bundle itself
      const { data: shareData, error: shareError } = await supabase
        .from('shared_links')
        .insert({
          user_id: user.id,
          bundle_id: pack.id,
          guide_id: null,
        })
        .select()
        .single();
      
      if (shareError) throw shareError;
      
      await fetchData();
      const shareId = shareData.id;
      handleNavigate('shareScreen', { shareId }, { state: { fromBundleId: pack.id } });

    } catch (error) {
      logError(error, { context: 'Bundle Sharing' });
      toast({
        title: "Oops! Sharing failed.",
        description: "Could not create a share link for this bundle. Please try again.",
        variant: "destructive",
      });
    }
  };


  // Handler for adding guides from the modal.
  const handleAddGuides = (guideIds) => {
    // Ensure we pass UUIDs, not objects
    const ids = guideIds.map(g => (typeof g === 'object' && g !== null && g.id) ? g.id : g);
    onAddGuidesToPack(pack.id, ids);
  };

  // Handler for archiving the entire bundle.
  const handleArchiveClick = () => {
    onArchivePack(pack);
  };

  // Toggles the Floating Action Button (FAB) menu open/closed.
  const handleToggleFab = () => {
    if (!isDragging) { // Prevent opening menu while dragging the FAB.
      setIsFabOpen(prev => !prev);
    }
  };

  const siteUrl = "https://familyplaybook.app";
  const ogImage = pack.image || "https://horizons-cdn.hostinger.com/ffc35e06-ea36-451f-a031-de31af4f5e18/80f125d4a7ccd5e3527e55a703f6454a.png";

  return (
    <>
      <Helmet>
        <title>{`${pack.name} - Family Playbook`}</title>
        <meta name="description" content={pack.description || `View the guides inside the ${pack.name} bundle.`} />
        <meta property="og:title" content={`${pack.name} - Family Playbook`} />
        <meta property="og:description" content={pack.description || `View the guides inside the ${pack.name} bundle.`} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:url" content={`${siteUrl}/pack/${pack.id}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${pack.name} - Family Playbook`} />
        <meta name="twitter:description" content={pack.description || `View the guides inside the ${pack.name} bundle.`} />
        <meta name="twitter:image" content={ogImage} />
      </Helmet>
      <div className="min-h-screen bg-[#FAF9F6] dark:bg-gray-950 pb-40">
        {/* Modal for adding existing guides to this bundle */}
        <AddGuidesToPackModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          allGuides={allGuides}
          guidesInPack={guides}
          onAddGuides={handleAddGuides}
        />
        <div className="p-6">
          <PageHeader title="" onBack={() => handleNavigate('packs')}>
            {/* Header actions: Archive, Edit, Share */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full bg-white dark:bg-gray-800 shadow-sm text-gray-800 dark:text-gray-100">
                  <Archive size={20} />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive this bundle?</AlertDialogTitle>
                  <AlertDialogDescription>This will move "{pack.name}" to the archive. You can restore it later.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleArchiveClick}>Archive</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleNavigate('editPack', { packId: pack.id })}
              className="rounded-full bg-white dark:bg-gray-800 shadow-sm text-gray-800 dark:text-gray-100"
            >
              <Edit size={20} />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleShare} className="rounded-full bg-white dark:bg-gray-800 shadow-sm text-gray-800 dark:text-gray-100">
              <Share2 size={20} />
            </Button>
          </PageHeader>
  
          {/* Bundle header section with image, title, and description */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center text-center mb-8"
          >
            <div className="w-48 h-32 rounded-3xl mb-4 overflow-hidden shadow-soft bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
              <PackImage imageUrl={pack.image} packName={pack.name} packColor={pack.color} className="w-full h-full object-cover"/>
            </div>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">{pack.name}</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1 max-w-md">{pack.description}</p>
            <div className="flex items-center gap-4 mt-4 text-sm text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-1.5">
                <FileText size={16} />
                <span>{guides.length} guides</span>
              </div>
            </div>
          </motion.div>
  
          {/* List of guides in the bundle */}
          {guides.length > 0 ? (
            <div className="space-y-3">
              {guides.map((guide, index) => (
                <motion.div
                  key={guide.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card hover:shadow-soft transition-all duration-300 flex items-center gap-4"
                >
                  <div onClick={() => handleNavigate('guideDetail', { guideId: guide.id, bundleId: pack.id })} className="flex-1 flex items-center gap-4 cursor-pointer">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#5CA9E9]/20 to-[#7BC47F]/20 flex items-center justify-center text-2xl flex-shrink-0">{guide.icon}</div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-800 dark:text-gray-200">{guide.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{guide.category}</p>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={(e) => e.stopPropagation()}>
                        <Archive size={18} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove from bundle?</AlertDialogTitle>
                        <AlertDialogDescription>This will remove "{guide.name}" from "{pack.name}", but it will remain in your library.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => handleRemoveGuideFromPack(pack.id, guide.id, pack.name, guide.name)}>Remove</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </motion.div>
              ))}
            </div>
          ) : (
            // Empty state shown when there are no guides in the bundle
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mt-20"
            >
              <Frown size={48} className="mx-auto text-gray-400 dark:text-gray-500 mb-4" />
              <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200 mb-2">No Guides in this Bundle</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6">Add a guide to get started!</p>
               <Button onClick={() => setIsModalOpen(true)} className="bg-gradient-to-r from-[#5CA9E9] to-[#7BC47F] text-white">Add Guides</Button>
            </motion.div>
          )}
        </div>
        
        {/* Draggable Floating Action Button (FAB) for adding guides */}
        <motion.div {...fabProps} style={{ ...fabProps.style, position: 'fixed', touchAction: 'none' }}>
          <AnimatePresence>
            {isFabOpen && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="flex flex-col items-center gap-4 mb-4"
              >
                {/* FAB option: Add an existing guide */}
                <motion.button
                  onClick={() => { setIsModalOpen(true); setIsFabOpen(false); }}
                  className="w-14 h-14 rounded-full bg-gradient-to-br from-[#FFB88C] to-[#FFD166] flex items-center justify-center shadow-lg"
                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} title="Add Existing Guide"
                >
                  <BookPlus size={24} color="white" strokeWidth={2.5} />
                </motion.button>
                {/* FAB option: Create a new guide */}
                <motion.button
                  onClick={() => { handleNavigate('createGuide', { guide: { packs: [pack.id] } }); setIsFabOpen(false); }}
                  className="w-14 h-14 rounded-full bg-gradient-to-br from-[#5CA9E9] to-[#7BC47F] flex items-center justify-center shadow-lg"
                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} title="Create New Guide"
                >
                  <Plus size={28} color="white" strokeWidth={2.5} />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Main FAB button to toggle the menu */}
          <motion.button
            onTap={handleToggleFab}
            animate={{ rotate: isFabOpen ? 45 : 0, scale: isDragging ? 1.2 : 1 }}
            className="w-16 h-16 rounded-full bg-gray-800 dark:bg-gray-100 flex items-center justify-center shadow-lg"
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            <Plus size={28} className="text-white dark:text-gray-800" strokeWidth={3} />
          </motion.button>
        </motion.div>
      </div>
    </>
  );
};

export default PackDetail;
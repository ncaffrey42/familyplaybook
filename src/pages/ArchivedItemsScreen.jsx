import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Trash2, Undo, Image as ImageIcon, FileText, Frown, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';
import { useData } from '@/contexts/DataContext';
import { Helmet } from 'react-helmet';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from '@/components/PageHeader';
import { useNavigation } from '@/hooks/useNavigation';
import GuideIcon from '@/components/GuideIcon';

const ArchivedItemsScreen = () => {
  const { toast } = useToast();
  const handleNavigate = useNavigation();
  const [isProcessing, setIsProcessing] = useState(false);
  const { allBundles, allGuides, fetchData, handleRestoreGuide, handleRestoreBundle } = useData();

  const bundles = allBundles.filter(p => p.is_archived);
  const guides = allGuides.filter(g => g.is_archived);

  const onRestoreBundle = async (bundle) => {
    setIsProcessing(true);
    await handleRestoreBundle(bundle);
    setIsProcessing(false);
  };

  const onRestoreGuide = async (guide) => {
    setIsProcessing(true);
    await handleRestoreGuide(guide);
    setIsProcessing(false);
  };

  const handleEmptyTrash = async (type) => {
    setIsProcessing(true);
    if (type === 'bundles') {
      const bundleIdsToDelete = bundles.map(p => p.id);
      if (bundleIdsToDelete.length === 0) { setIsProcessing(false); return; }
      
      await supabase.from('pack_guides').delete().in('pack_id', bundleIdsToDelete);
      const { error } = await supabase.from('packs').delete().in('id', bundleIdsToDelete);

      if (error) toast({ title: "Error deleting bundles", description: error.message, variant: "destructive" });
      else {
        toast({ title: "🗑️ Bundles Deleted", description: "All archived bundles have been permanently deleted." });
        await fetchData();
      }
    } else if (type === 'guides') {
      const guideIdsToDelete = guides.map(g => g.id);
      if (guideIdsToDelete.length === 0) { setIsProcessing(false); return; }

      await supabase.from('pack_guides').delete().in('guide_id', guideIdsToDelete);
      await supabase.from('user_favorites').delete().in('guide_id', guideIdsToDelete);
      const { error } = await supabase.from('guides').delete().in('id', guideIdsToDelete);

      if (error) toast({ title: "Error deleting guides", description: error.message, variant: "destructive" });
      else {
        toast({ title: "🗑️ Guides Deleted", description: "All archived guides have been permanently deleted." });
        await fetchData();
      }
    }
    setIsProcessing(false);
  };
  
  const getDaysInArchive = (archivedAt) => {
    if (!archivedAt) return 0;
    const now = new Date();
    const archivedDate = new Date(archivedAt);
    const diffTime = Math.abs(now - archivedDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const renderEmptyState = (itemType) => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center mt-20"
    >
      <Frown size={48} className="mx-auto text-gray-400 dark:text-gray-500 mb-4" />
      <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200 mb-2">Archive is Empty</h2>
      <p className="text-gray-500 dark:text-gray-400">Archived {itemType} will appear here.</p>
    </motion.div>
  );

  const siteUrl = "https://familyplaybook.app";
  const defaultImage = "/icon-192x192.png";

  return (
    <>
      <Helmet>
          <title>Archive - Family Playbook</title>
          <meta name="description" content="View and manage your archived bundles and guides. Restore or permanently delete items." />
          <meta property="og:title" content="Archive - Family Playbook" />
          <meta property="og:description" content="View and manage your archived bundles and guides. Restore or permanently delete items." />
          <meta property="og:image" content={defaultImage} />
          <meta property="og:url" content={`${siteUrl}/archived`} />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="Archive - Family Playbook" />
          <meta name="twitter:description" content="View and manage your archived bundles and guides. Restore or permanently delete items." />
          <meta name="twitter:image" content={defaultImage} />
      </Helmet>
      <div className="min-h-screen bg-[#FAF9F6] dark:bg-gray-950 pb-24">
        <div className="p-6">
          <PageHeader title="Archive" onBack={() => handleNavigate('account')} />
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-6">Items in the archive will be automatically deleted after 30 days.</p>

          <Tabs defaultValue="bundles" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-secondary rounded-2xl p-1">
              <TabsTrigger value="bundles" className="flex items-center gap-2 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-soft">
                <Package size={20} />
                <span className="text-sm font-semibold">Bundles ({bundles.length})</span>
              </TabsTrigger>
              <TabsTrigger value="guides" className="flex items-center gap-2 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-soft">
                <FileText size={20} />
                <span className="text-sm font-semibold">Guides ({guides.length})</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="bundles" className="mt-6">
              {bundles && bundles.length > 0 ? (
                <>
                  <div className="flex justify-end mb-4">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" disabled={isProcessing}>
                                <Trash2 size={16} className="mr-2" />
                                Empty Bundle Archive
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                This will permanently delete all {bundles.length} archived bundles. This action cannot be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleEmptyTrash('bundles')} disabled={isProcessing} className="bg-red-500 hover:bg-red-600">
                                    {isProcessing ? 'Deleting...' : 'Delete All'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <div className="space-y-3">
                    {bundles.map((bundle, index) => (
                      <motion.div
                        key={bundle.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card flex items-center gap-4"
                      >
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                            {bundle.image ? (
                                <img alt={bundle.name} className="w-full h-full object-cover" src={bundle.image} />
                            ) : (
                                <ImageIcon size={24} className="text-gray-400 dark:text-gray-500" />
                            )}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-800 dark:text-gray-200">{bundle.name}</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Archived {getDaysInArchive(bundle.archived_at)} days ago
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => onRestoreBundle(bundle)} disabled={isProcessing}>
                            <Undo className="text-green-500"/>
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                </>
              ) : renderEmptyState('bundles')}
            </TabsContent>
            <TabsContent value="guides" className="mt-6">
              {guides && guides.length > 0 ? (
                <>
                  <div className="flex justify-end mb-4">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" disabled={isProcessing}>
                                <Trash2 size={16} className="mr-2" />
                                Empty Guide Archive
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                This will permanently delete all {guides.length} archived guides. This action cannot be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleEmptyTrash('guides')} disabled={isProcessing} className="bg-red-500 hover:bg-red-600">
                                    {isProcessing ? 'Deleting...' : 'Delete All'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <div className="space-y-3">
                    {guides.map((guide, index) => (
                      <motion.div
                        key={guide.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card flex items-center gap-4"
                      >
                         <GuideIcon iconName={guide.icon} category={guide.category} className="w-14 h-14" size={28} />
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-800 dark:text-gray-200">{guide.name}</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Archived {getDaysInArchive(guide.archived_at)} days ago
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => onRestoreGuide(guide)} disabled={isProcessing}>
                            <Undo className="text-green-500"/>
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                </>
              ) : renderEmptyState('guides')}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
};

export default ArchivedItemsScreen;
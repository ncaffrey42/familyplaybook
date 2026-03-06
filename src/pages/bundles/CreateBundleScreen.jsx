import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, X, Trash2 } from 'lucide-react';
import EntitlementGuard from '@/components/EntitlementGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { Helmet } from 'react-helmet';
import PageHeader from '@/components/PageHeader';
import { useParams, useNavigate } from 'react-router-dom';
import { useData } from '@/contexts/DataContext';
import ImageUpload from '@/components/ImageUpload';
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
import AddGuidesToBundleModal from '@/components/AddGuidesToBundleModal';
import { cn } from '@/lib/utils';
import { BundleImage } from '@/components/BundleImage';
import GuideIcon from '@/components/GuideIcon';

const colorOptions = ['#FFDDC1', '#FFABAB', '#FFC3A0', '#FF677D', '#D4A5A5', '#88B04B', '#F7CAC9', '#92A8D1', '#034F84', '#F7786B', '#C94C4C', '#B3A369', '#C06C84', '#6C5B7B', '#355C7D'];

const CreateBundleScreen = ({ bundle: propBundle }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { allGuides, allBundles, handleSaveBundle, handleArchiveBundle } = useData();

  // Find bundle from context if in edit mode (has ID), or use prop
  const bundle = propBundle || (id ? allBundles.find(b => b.id === id) : null);
  const isEditing = !!bundle;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(colorOptions[0]);
  const [image, setImage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddGuidesModal, setShowAddGuidesModal] = useState(false);
  const [selectedGuideIds, setSelectedGuideIds] = useState([]);

  useEffect(() => {
    if (bundle) {
      setName(bundle.name || '');
      setDescription(bundle.description || '');
      setColor(bundle.color || colorOptions[0]);
      setImage(bundle.image || '');
      // Find guides that are already in this bundle
      const guidesInThisBundle = allGuides.filter(g => g.bundles && g.bundles.includes(bundle.id)).map(g => g.id);
      setSelectedGuideIds(guidesInThisBundle);
    }
  }, [bundle, allGuides]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Name is required", description: "Please enter a name for your bundle.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const bundleData = { id: bundle?.id, name, description, color, image };
      await handleSaveBundle(bundleData, selectedGuideIds);
      // Navigation is handled in DataContext's handleSaveBundle
    } catch (error) {
      console.error("Failed to save bundle:", error);
      toast({ title: "Error", description: `Failed to ${isEditing ? 'update' : 'create'} bundle.`, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddGuides = (guidesToAddIds) => {
    setSelectedGuideIds(prev => [...new Set([...prev, ...guidesToAddIds])]);
    setShowAddGuidesModal(false);
  };

  const handleRemoveGuide = (guideId) => {
    setSelectedGuideIds(prev => prev.filter(id => id !== guideId));
    toast({ title: "Guide unlinked", description: "The guide will be removed from the bundle when you save." });
  };

  const selectedGuides = allGuides.filter(g => selectedGuideIds.includes(g.id));

  // If editing an invalid ID, redirect or show error
  if (id && !bundle && allBundles.length > 0) {
     return (
        <div className="flex flex-col items-center justify-center min-h-screen">
           <h2 className="text-xl font-bold mb-4">Bundle not found</h2>
           <Button onClick={() => navigate('/bundles')}>Return to Bundles</Button>
        </div>
     );
  }

  return (
    <>
      <Helmet>
        <title>{isEditing ? `Edit: ${name}` : "Create Bundle"} - Family Playbook</title>
        <meta name="description" content={isEditing ? `Edit details for "${name}".` : "Create a new bundle to organize your guides."} />
      </Helmet>
      <div className="min-h-screen bg-background pb-28">
        <div className="p-6">
          <PageHeader title={isEditing ? "Edit Bundle" : "Create New Bundle"} onBack={() => isEditing ? navigate(`/bundle/${bundle.id}`) : navigate('/bundles')}>
            {isEditing && (
              <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10"><Trash2 size={24} /></Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This action will archive your bundle "{name}".</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleArchiveBundle(bundle)} className="bg-destructive hover:bg-destructive/90">Archive</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </PageHeader>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-6">
            <div>
              <Label htmlFor="bundleName" className="text-lg font-semibold text-foreground mb-2 block">Bundle Name</Label>
              <Input id="bundleName" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Morning Routine" />
            </div>
            <div>
              <Label htmlFor="bundleDescription" className="text-lg font-semibold text-foreground mb-2 block">Description (Optional)</Label>
              <Textarea id="bundleDescription" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A brief description of this bundle" />
            </div>
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-soft flex-shrink-0"><BundleImage imageUrl={image} bundleName={name} bundleColor={color} /></div>
              <div className="flex-grow">
                <Label className="text-lg font-semibold text-foreground mb-2 block">Bundle Color</Label>
                <div className="grid grid-cols-5 gap-2">
                  {colorOptions.map((c) => (<motion.div key={c} className={cn("w-10 h-10 rounded-full cursor-pointer border-2 border-transparent", color === c && "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background")} style={{ backgroundColor: c }} onClick={() => setColor(c)} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} />))}
                </div>
              </div>
            </div>
            <div>
              <Label className="text-lg font-semibold text-foreground mb-2 block">Bundle Image</Label>
              <ImageUpload imageUrl={image} onImageUpload={setImage} folder="bundle_images" aspectRatio={16 / 9} />
            </div>
            <div>
              <Label className="text-lg font-semibold text-foreground mb-2 block">Guides in this Bundle</Label>
              <div className="space-y-3">
                {selectedGuides.length > 0 ? selectedGuides.map(guide => (
                  <motion.div key={guide.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between bg-card p-3 rounded-xl shadow-sm">
                    <div className="flex items-center gap-3">
                      <GuideIcon iconName={guide.icon} category={guide.category} className="w-10 h-10" size={20} />
                      <span className="font-medium text-foreground">{guide.name}</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleRemoveGuide(guide.id)} className="text-muted-foreground hover:text-destructive"><X size={20} /></Button>
                  </motion.div>
                )) : (<p className="text-muted-foreground text-sm italic">No guides added yet. Click below to add some!</p>)}
                <Button onClick={() => setShowAddGuidesModal(true)} variant="outline" className="w-full border-primary text-primary hover:bg-primary/10 transition-colors rounded-xl py-3"><Plus size={20} className="mr-2" /> Add Guides</Button>
              </div>
            </div>
            <EntitlementGuard action="BUNDLE_CREATE" skip={isEditing}>
              <Button onClick={handleSave} disabled={isSubmitting} className="w-full bg-gradient-to-r from-brand-blue to-brand-green text-white font-bold py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300">
                {isSubmitting ? (isEditing ? "Updating..." : "Creating...") : (isEditing ? "Save Changes" : "Create Bundle")}
              </Button>
            </EntitlementGuard>
          </motion.div>
        </div>
      </div>
      <AddGuidesToBundleModal isOpen={showAddGuidesModal} onClose={() => setShowAddGuidesModal(false)} onAddGuides={(newGuides) => handleAddGuides(newGuides.map(g => g.id))} allGuides={allGuides} guidesInBundle={selectedGuides} />
    </>
  );
};

export default CreateBundleScreen;
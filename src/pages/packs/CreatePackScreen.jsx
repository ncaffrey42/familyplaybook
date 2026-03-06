import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, X, Package, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { Helmet } from 'react-helmet';
import PageHeader from '@/components/PageHeader';
import { useNavigation } from '@/hooks/useNavigation';
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
import AddGuidesToPackModal from '@/components/AddGuidesToPackModal';
import { cn } from '@/lib/utils';
import { PackImage } from '@/components/PackImage';

const colorOptions = [
  '#FFDDC1', '#FFABAB', '#FFC3A0', '#FF677D', '#D4A5A5', '#88B04B', '#F7CAC9', '#92A8D1', '#034F84', '#F7786B',
  '#C94C4C', '#B3A369', '#C06C84', '#6C5B7B', '#355C7D', '#F67280', '#C06C84', '#FF8C94', '#8B5F65', '#D67BFF'
];

/**
 * A screen for creating a new bundle or editing an existing one.
 * It handles form inputs for name, description, color, image, and associated guides.
 */
const CreatePackScreen = ({ pack, onSavePack, onDataChange }) => {
  // State for form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(colorOptions[0]);
  const [image, setImage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddGuidesModal, setShowAddGuidesModal] = useState(false);
  const [selectedGuideIds, setSelectedGuideIds] = useState([]); // Stores IDs of guides

  const handleNavigate = useNavigation();
  const { allGuides, handleRemoveGuideFromPack } = useData();

  const isEditing = !!pack;

  useEffect(() => {
    if (pack) {
      setName(pack.name || '');
      setDescription(pack.description || '');
      setColor(pack.color || colorOptions[0]);
      setImage(pack.image || '');
      setSelectedGuideIds(pack.guide_ids || []);
    }
  }, [pack]);

  // Main save handler for both creating and updating a bundle
  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "Name is required",
        description: "Please enter a name for your bundle.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const packData = {
        id: pack?.id,
        name,
        description,
        color,
        image,
        guide_ids: selectedGuideIds,
      };
      await onSavePack(packData);
      // Toast and navigation are handled within onSavePack in DataContext
    } catch (error) {
      console.error("Failed to save bundle:", error);
      toast({
        title: "Error",
        description: `Failed to ${isEditing ? 'update' : 'create'} bundle. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler for archiving a bundle (soft delete)
  const handleDeletePack = async () => {
    if (!pack?.id) return;
    setIsSubmitting(true);
    try {
      await onSavePack({ ...pack, is_archived: true });
      if (onDataChange) onDataChange();
      handleNavigate('packs');
    } catch (error) {
      console.error("Failed to archive bundle:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddGuides = (guidesToAdd) => {
    const newGuideIds = guidesToAdd.map(g => g.id);
    setSelectedGuideIds(prev => [...new Set([...prev, ...newGuideIds])]);
    setShowAddGuidesModal(false);
  };

  const handleRemoveGuide = (guideId) => {
    setSelectedGuideIds(prev => prev.filter(id => id !== guideId));
    toast({
      title: "Guide removed from list",
      description: "The guide will be removed from the bundle when you save.",
    });
  };

  const selectedGuides = allGuides.filter(g => selectedGuideIds.includes(g.id));

  const siteUrl = "https://familyplaybook.app";
  const defaultImage = "/icon-192x192.png";

  return (
    <>
      <Helmet>
        <title>{isEditing ? `Edit Bundle: ${pack.name}` : "Create New Bundle"} - Family Playbook</title>
        <meta name="description" content={isEditing ? `Edit details for the bundle "${pack.name}".` : "Create a new bundle to organize your guides."} />
      </Helmet>
      <div className="min-h-screen bg-background pb-28">
        <div className="p-6">
          <PageHeader
            title={isEditing ? "Edit Bundle" : "Create New Bundle"}
            onBack={() => isEditing ? handleNavigate('packDetail', { pack: pack }) : handleNavigate('packs')}
          >
            {isEditing && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-100 dark:hover:bg-red-900">
                    <Trash2 size={24} />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>This action will archive your bundle "{name}". It will no longer appear in your active bundles but can be restored from the archived section.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeletePack} className="bg-red-500 hover:bg-red-600 text-white">Archive Bundle</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </PageHeader>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-6">
            <div>
              <Label htmlFor="packName" className="text-lg font-semibold text-foreground mb-2 block">Bundle Name</Label>
              <Input id="packName" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Morning Routine, Babysitter Info" className="bg-card border-border text-foreground focus:border-primary focus:ring-primary"/>
            </div>

            <div>
              <Label htmlFor="packDescription" className="text-lg font-semibold text-foreground mb-2 block">Description (Optional)</Label>
              <Textarea id="packDescription" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A brief description of this bundle's purpose" className="bg-card border-border text-foreground focus:border-primary focus:ring-primary min-h-[100px]"/>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-soft flex-shrink-0">
                  <PackImage imageUrl={image} packName={name} packColor={color} className="w-full h-full object-cover" />
              </div>
              <div className="flex-grow">
                <Label className="text-lg font-semibold text-foreground mb-2 block">Bundle Color</Label>
                <div className="grid grid-cols-5 gap-2">
                  {colorOptions.map((c) => (
                    <motion.div key={c} className={cn("w-10 h-10 rounded-full cursor-pointer border-2 border-transparent transition-all duration-200", color === c && "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background")} style={{ backgroundColor: c }} onClick={() => setColor(c)} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} />
                  ))}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-lg font-semibold text-foreground mb-2 block">Bundle Image</Label>
              <ImageUpload imageUrl={image} onImageUpload={setImage} folder="pack_images" aspectRatio={16 / 9} />
            </div>

            <div>
              <Label className="text-lg font-semibold text-foreground mb-2 block">Guides in this Bundle</Label>
              <div className="space-y-3">
                {selectedGuides.length > 0 ? (
                  selectedGuides.map(guide => (
                    <motion.div key={guide.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between bg-card p-3 rounded-xl shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-xl flex-shrink-0">{guide.icon}</div>
                        <span className="font-medium text-foreground">{guide.name}</span>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveGuide(guide.id)} className="text-muted-foreground hover:text-red-500">
                        <X size={20} />
                      </Button>
                    </motion.div>
                  ))
                ) : ( <p className="text-muted-foreground text-sm italic">No guides added yet. Click below to add some!</p> )}
                <Button onClick={() => setShowAddGuidesModal(true)} variant="outline" className="w-full border-primary text-primary hover:bg-primary/10 transition-colors rounded-xl py-3">
                  <Plus size={20} className="mr-2" /> Add Guides
                </Button>
              </div>
            </div>

            <Button onClick={handleSave} disabled={isSubmitting} className="w-full bg-gradient-to-r from-brand-purple to-brand-pink text-white font-bold py-3 rounded-xl shadow-lg hover:from-brand-purple/90 hover:to-brand-pink/90 transition-all duration-300">
              {isSubmitting ? (isEditing ? "Updating..." : "Creating...") : (isEditing ? "Save Changes" : "Create Bundle")}
            </Button>
          </motion.div>
        </div>
      </div>

      <AddGuidesToPackModal 
        isOpen={showAddGuidesModal} 
        onClose={() => setShowAddGuidesModal(false)} 
        onAddGuides={handleAddGuides}
        allGuides={allGuides}
        guidesInPack={selectedGuides}
      />
    </>
  );
};

export default CreatePackScreen;
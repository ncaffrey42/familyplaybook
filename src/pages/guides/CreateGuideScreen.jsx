import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, GripVertical, X, Image, Video, Loader2, Trash2, Check } from 'lucide-react';
import EntitlementGuard from '@/components/EntitlementGuard';
import { useEntitlements } from '@/contexts/EntitlementContext';
import { useLimitNotification } from '@/contexts/LimitNotificationContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { v4 as uuidv4 } from 'uuid';
import { useNavigation } from '@/hooks/useNavigation';
import { useLocation, useParams } from 'react-router-dom';
import { useData } from '@/contexts/DataContext';
import MediaUpload from '@/components/MediaUpload';
import GuideIconPicker from '@/components/GuideIconPicker';
import GuideIcon from '@/components/GuideIcon';
import ArchiveGuideModal from '@/components/ArchiveGuideModal';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CreateGuideScreen = ({ pack: propPack }) => {
  const onNavigate = useNavigation();
  const location = useLocation();
  const { guideId } = useParams();
  const { getGuideById, isDataLoaded, handleSaveGuide, handleArchiveGuide, allBundles } = useData();
  const { checkEntitlement } = useEntitlements();
  const { showLimitNotification } = useLimitNotification();

  // Determine pack from props or location state
  const initialPack = propPack || location.state?.pack || location.state?.bundle;

  const [guideName, setGuideName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('How To');
  const [icon, setIcon] = useState('FileText');
  const [steps, setSteps] = useState([{ id: uuidv4(), text: '', image_url: '', video_url: '' }]);
  const [isShareable, setIsShareable] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedBundleId, setSelectedBundleId] = useState(initialPack?.id || 'none');
  
  // Archiving state
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  // Track which step is currently having media uploaded
  const [activeMediaStepId, setActiveMediaStepId] = useState(null);

  // Populate form if editing
  useEffect(() => {
    if (guideId && isDataLoaded && getGuideById) {
      const guide = getGuideById(guideId);
      if (guide) {
        setGuideName(guide.name);
        setDescription(guide.description || '');
        setCategory(guide.category || 'How To');
        setIcon(guide.icon || 'FileText');
        
        // Transform database steps to form steps
        const formattedSteps = (guide.steps && guide.steps.length > 0) 
          ? guide.steps.map(s => ({
              ...s,
              id: s.id || uuidv4(),
              text: s.content || s.text || '',
              image_url: s.image_url || '',
              video_url: s.video_url || ''
            }))
          : [{ id: uuidv4(), text: '', image_url: '', video_url: '' }];
          
        setSteps(formattedSteps);
        setIsShareable(guide.is_shareable);
        
        // Populate bundle if exists
        if (guide.bundles && guide.bundles.length > 0) {
            setSelectedBundleId(guide.bundles[0]);
        }
      }
    }
  }, [guideId, getGuideById, isDataLoaded]);

  // Update selectedBundleId if initialPack changes (e.g. navigation)
  useEffect(() => {
      if (initialPack?.id) {
          setSelectedBundleId(initialPack.id);
      }
  }, [initialPack]);

  const addStep = () => {
    setSteps([...steps, { id: uuidv4(), text: '', image_url: '', video_url: '' }]);
  };

  const removeStep = (id) => {
    if (steps.length > 1) {
      setSteps(steps.filter(step => step.id !== id));
    }
  };

  const updateStep = (id, field, value) => {
    setSteps(steps.map(step => step.id === id ? { ...step, [field]: value } : step));
  };

  const handleMediaUpload = (stepId, url, type) => {
    setSteps(prevSteps => prevSteps.map(step => {
        if (step.id !== stepId) return step;
        
        // If type is null/false, it means we are clearing/resetting via the MediaUpload component
        if (!type) {
             return step;
        }
        
        return {
            ...step,
            image_url: type === 'image' ? url : '',
            video_url: type === 'video' ? url : ''
        };
    }));
    setActiveMediaStepId(null);
  };

  const handleRemoveMedia = (stepId, type) => {
    setSteps(prevSteps => prevSteps.map(step => {
        if (step.id !== stepId) return step;
        return {
            ...step,
            image_url: type === 'image' ? '' : step.image_url,
            video_url: type === 'video' ? '' : step.video_url
        };
    }));
  };

  const toggleMediaUpload = (stepId) => {
    setActiveMediaStepId(activeMediaStepId === stepId ? null : stepId);
  };

  const handleSave = async () => {
    if (!guideName.trim()) {
      toast({
        title: "Oops!",
        description: "Please enter a guide name",
        variant: "destructive",
      });
      return;
    }

    // Secondary enforcement for new guides: catches direct-URL navigation that
    // bypasses the EntitlementGuard wrapper on the save button.
    if (!guideId) {
      const check = await checkEntitlement('GUIDE_CREATE');
      if (!check.allowed) {
        showLimitNotification(check.reason_code, check.current, check.limit, check.upgrade_suggestion);
        return;
      }
    }

    setIsSaving(true);

    try {
      const stepsToSave = steps.map(({ text, ...rest }) => ({
        ...rest,
        content: text
      }));

      const guideData = {
        name: guideName,
        description: description,
        category: category,
        icon: icon,
        steps: stepsToSave,
        is_shareable: isShareable,
        ...(guideId && { id: guideId }),
        packIds: selectedBundleId && selectedBundleId !== 'none' ? [selectedBundleId] : []
      };

      const savedGuide = await handleSaveGuide(guideData);

      if (savedGuide) {
        if (selectedBundleId && selectedBundleId !== 'none') {
          onNavigate('bundleDetail', { bundleId: selectedBundleId });
        } else {
          onNavigate('guides');
        }
      }
    } catch (error) {
      console.error("Failed to save guide:", error);
      toast({ title: "Error", description: "Could not save guide. Please try again.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleArchive = async () => {
    if (!guideId) return;
    setIsArchiving(true);
    try {
        await handleArchiveGuide({ id: guideId });
    } catch (error) {
        console.error("Archive failed", error);
        toast({ title: "Error", description: "Failed to archive guide.", variant: "destructive" });
        setIsArchiving(false);
        setIsArchiveModalOpen(false);
    }
  };

  const handleBack = () => {
    if (initialPack) {
      onNavigate('bundleDetail', { bundleId: initialPack.id });
    } else {
      onNavigate('back');
    }
  };

  if (guideId && !isDataLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6]">
        <Loader2 className="h-8 w-8 animate-spin text-[#5CA9E9]" />
      </div>
    );
  }

  const categoryOptions = [
    { id: 'How To', label: 'How To', color: 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200', activeColor: 'bg-blue-500 text-white border-blue-600' },
    { id: 'Find It', label: 'Find It', color: 'bg-green-100 text-green-700 hover:bg-green-200 border-green-200', activeColor: 'bg-green-500 text-white border-green-600' },
    { id: 'Reference', label: 'Reference', color: 'bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200', activeColor: 'bg-purple-500 text-white border-purple-600' },
  ];

  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-24">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="rounded-full"
            >
              <ArrowLeft size={24} />
            </Button>
            <h1 className="text-2xl font-bold text-gray-800">{guideId ? 'Edit Guide' : 'Create Guide'}</h1>
          </div>
          
          {guideId && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsArchiveModalOpen(true)}
              className="rounded-full text-red-500 hover:text-red-600 hover:bg-red-50"
            >
              <X size={24} />
            </Button>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Header Section: Icon + Title + Category */}
          <div className="bg-white rounded-2xl p-4 shadow-card space-y-4">
             <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <GuideIconPicker 
                    icon={icon} 
                    setIcon={setIcon} 
                    trigger={
                      <button className="w-16 h-16 rounded-2xl bg-gray-50 hover:bg-gray-100 border-2 border-dashed border-gray-200 flex items-center justify-center transition-all group">
                         <GuideIcon iconName={icon} category={category} size={32} className="w-12 h-12" />
                      </button>
                    }
                  />
                </div>
                <div className="flex-grow">
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Guide Name</label>
                  <input
                    type="text"
                    value={guideName}
                    onChange={(e) => setGuideName(e.target.value)}
                    placeholder="e.g., Bedtime Routine"
                    className="w-full h-10 bg-transparent text-lg font-bold text-gray-800 placeholder-gray-300 focus:outline-none border-b-2 border-transparent focus:border-[#5CA9E9] transition-colors"
                  />
                </div>
             </div>

             <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Guide Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {categoryOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setCategory(opt.id)}
                      className={cn(
                        "py-2 px-1 rounded-xl text-sm font-semibold transition-all border-2 flex items-center justify-center gap-1",
                        category === opt.id ? opt.activeColor : `${opt.color} border-transparent bg-opacity-50`
                      )}
                    >
                      {category === opt.id && <Check size={14} />}
                      {opt.label}
                    </button>
                  ))}
                </div>
             </div>
          </div>
          
          {/* Bundle Selection Section */}
          <div className="bg-white rounded-2xl p-4 shadow-card">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Add to Bundle (Optional)</label>
            <Select value={selectedBundleId} onValueChange={setSelectedBundleId}>
              <SelectTrigger className="w-full h-12 rounded-xl bg-gray-50 border-gray-200">
                <SelectValue placeholder="Select a bundle..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Bundle</SelectItem>
                {allBundles.length > 0 ? (
                    allBundles.map(bundle => (
                        <SelectItem key={bundle.id} value={bundle.id}>{bundle.name}</SelectItem>
                    ))
                ) : (
                    <div className="p-2 text-sm text-gray-500 text-center">No bundles created yet</div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe what this guide is about..."
              className="w-full min-h-[80px] px-4 py-3 rounded-2xl bg-white border-2 border-gray-200 focus-visible:ring-0 focus-visible:border-[#5CA9E9] focus:outline-none transition-colors shadow-card resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-semibold text-gray-700">Steps</label>
              <Button
                onClick={addStep}
                size="sm"
                variant="outline"
                className="rounded-full"
              >
                <Plus size={16} className="mr-1" />
                Add Step
              </Button>
            </div>

            <div className="space-y-3">
              {steps.map((step, index) => (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white rounded-2xl p-4 shadow-card"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex items-center gap-2 mt-3">
                      <GripVertical size={20} className="text-gray-400 cursor-move" />
                      <span className="w-6 h-6 rounded-full bg-[#5CA9E9] text-white text-xs flex items-center justify-center font-semibold">
                        {index + 1}
                      </span>
                    </div>
                    <div className="flex-1 space-y-3">
                      <textarea
                        value={step.text}
                        onChange={(e) => updateStep(step.id, 'text', e.target.value)}
                        placeholder="Describe this step..."
                        className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 focus:border-[#5CA9E9] focus:outline-none transition-colors resize-none"
                        rows="2"
                      />
                      
                      {/* Media Preview Section */}
                      {step.image_url && (
                        <div className="relative mt-2 w-full h-48 rounded-xl overflow-hidden border border-gray-100 group">
                          <img 
                            src={step.image_url} 
                            alt={`Step ${index + 1}`} 
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                             <Button 
                               variant="destructive" 
                               size="sm" 
                               onClick={() => handleRemoveMedia(step.id, 'image')}
                               className="flex items-center gap-2"
                             >
                               <Trash2 size={16} /> Remove Image
                             </Button>
                          </div>
                        </div>
                      )}

                      {step.video_url && (
                        <div className="relative mt-2 w-full h-48 rounded-xl overflow-hidden border border-gray-100 bg-black group">
                          <video 
                            src={step.video_url} 
                            className="w-full h-full object-cover"
                            controls={false}
                          />
                           <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                             <Button 
                               variant="destructive" 
                               size="sm" 
                               onClick={() => handleRemoveMedia(step.id, 'video')}
                               className="flex items-center gap-2"
                             >
                               <Trash2 size={16} /> Remove Video
                             </Button>
                          </div>
                        </div>
                      )}

                      {/* Media Upload Component */}
                      {activeMediaStepId === step.id && !step.image_url && !step.video_url && (
                        <div className="mt-2">
                            <MediaUpload 
                                guideId={guideId} 
                                currentMedia={null} 
                                onUpload={(url, type) => handleMediaUpload(step.id, url, type)}
                            />
                        </div>
                      )}

                      {/* Add Buttons */}
                      {!step.image_url && !step.video_url && activeMediaStepId !== step.id && (
                          <div className="flex gap-2 mt-2">
                            <button 
                                onClick={() => toggleMediaUpload(step.id)}
                                className="text-xs text-gray-500 hover:text-[#5CA9E9] flex items-center gap-1 transition-colors"
                            >
                              <Image size={14} />
                              Add Image
                            </button>
                            <button 
                                onClick={() => toggleMediaUpload(step.id)}
                                className="text-xs text-gray-500 hover:text-[#5CA9E9] flex items-center gap-1 transition-colors"
                            >
                              <Video size={14} />
                              Add Video
                            </button>
                          </div>
                      )}
                    </div>
                    {steps.length > 1 && (
                      <button
                        onClick={() => removeStep(step.id)}
                        className="mt-2 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X size={20} />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">Make Shareable</h3>
                <p className="text-sm text-gray-500">Anyone with the link can view</p>
              </div>
              <button
                onClick={() => setIsShareable(!isShareable)}
                className={`w-14 h-8 rounded-full transition-all ${
                  isShareable ? 'bg-[#7BC47F]' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-6 h-6 bg-white rounded-full shadow-sm transition-transform ${
                    isShareable ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <EntitlementGuard action="GUIDE_CREATE" skip={!!guideId}>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full h-14 text-lg font-semibold rounded-2xl bg-gradient-to-r from-[#5CA9E9] to-[#7BC47F] hover:shadow-lg transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                guideId ? 'Update Guide' : 'Save Guide'
              )}
            </Button>
          </EntitlementGuard>

          {guideId && (
             <Button
                variant="destructive"
                onClick={() => setIsArchiveModalOpen(true)}
                className="w-full h-14 mt-4 text-lg font-semibold rounded-2xl shadow-sm hover:shadow-md transition-all bg-red-500 hover:bg-red-600 text-white"
             >
                <Trash2 className="mr-2 h-5 w-5" />
                Archive Guide
             </Button>
          )}
        </motion.div>
      </div>
      
      <ArchiveGuideModal 
        isOpen={isArchiveModalOpen}
        onClose={setIsArchiveModalOpen}
        onConfirm={handleArchive}
        isArchiving={isArchiving}
      />
    </div>
  );
};

export default CreateGuideScreen;
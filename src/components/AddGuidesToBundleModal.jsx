import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import GuideIcon from '@/components/GuideIcon';

const AddGuidesToBundleModal = ({ 
  isOpen, 
  onClose, 
  onSave,
  allBundles = [], 
  initialSelectedBundleIds = [],
  isManagingGuidePacks,
  allGuides, // for "add guides to bundle" mode
  guidesInBundle, // for "add guides to bundle" mode
  onAddGuides // for "add guides to bundle" mode
}) => {
  // Ensure we default to empty array if prop is undefined to avoid uncontrolled errors
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Only reset/initialize when the modal opens.
  useEffect(() => {
    if (isOpen) {
      if (isManagingGuidePacks) {
        setSelectedIds(initialSelectedBundleIds || []);
      } else {
        setSelectedIds([]);
      }
      setSearchTerm('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleToggle = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(currentId => currentId !== id) : [...prev, id]
    );
  };
  
  const handleSave = () => {
    if (isManagingGuidePacks) {
      const selectedBundles = allBundles.filter(bundle => selectedIds.includes(bundle.id));
      onSave(selectedBundles);
    } else { // "add guides to bundle" mode
        if (selectedIds.length === 0) {
            toast({
              title: "No guides selected",
              description: "Please pick at least one guide to add.",
              variant: "destructive",
            });
            return;
        }
        const guidesToAdd = allGuides.filter(g => selectedIds.includes(g.id));
        onAddGuides(guidesToAdd);
    }
    onClose();
  };
  
  const handleClose = () => {
    onClose();
  };
  
  // Determine title and items based on the mode
  let title = '';
  let items = [];
  let buttonText = '';
  let placeholderText = '';
  let noItemsText = '';
  
  if (isManagingGuidePacks) {
    title = 'Select Bundles for this Guide';
    buttonText = `Set ${selectedIds.length > 0 ? selectedIds.length : ''} Bundle(s)`;
    placeholderText = 'Search your bundles...';
    noItemsText = "You haven't created any bundles yet.";
    items = allBundles.filter(b => b.name.toLowerCase().includes(searchTerm.toLowerCase()));
  } else {
    title = 'Add Guides to Bundle';
    buttonText = `Add ${selectedIds.length > 0 ? selectedIds.length : ''} Guide(s)`;
    placeholderText = 'Search available guides...';
    noItemsText = 'Looks like all your guides are already in this bundle!';
    const guidesInBundleIds = (guidesInBundle || []).map(g => g.id);
    items = (allGuides || [])
      .filter(g => g && !guidesInBundleIds.includes(g.id))
      .filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="bg-card rounded-3xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-border flex items-center justify-between flex-shrink-0">
              <h2 className="text-xl font-bold text-foreground">{title}</h2>
              <Button variant="ghost" size="icon" onClick={handleClose} className="rounded-full">
                <X size={24} />
              </Button>
            </div>
            
            <div className="p-6 space-y-4 flex-1 overflow-hidden flex flex-col">
              <div className="relative flex-shrink-0">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
                <input
                  type="text"
                  placeholder={placeholderText}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-12 pl-12 pr-4 rounded-xl bg-secondary border-2 border-transparent focus:border-primary focus:outline-none transition-colors text-foreground"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-border dark:scrollbar-thumb-border scrollbar-track-transparent">
                {items.length > 0 ? items.map(item => (
                  <div
                    key={item.id}
                    onClick={(e) => {
                      // Prevent bubbling to avoid double-triggers
                      e.stopPropagation();
                      handleToggle(item.id);
                    }}
                    className="flex items-center gap-4 p-3 rounded-2xl cursor-pointer hover:bg-secondary transition-colors"
                  >
                    <Checkbox
                      checked={selectedIds.includes(item.id)}
                      onCheckedChange={() => handleToggle(item.id)}
                      // CRITICAL: Stop propagation here so the click doesn't bubble 
                      // to the parent div's onClick, which would toggle it again (canceling it out).
                      onClick={(e) => e.stopPropagation()}
                      id={`item-${item.id}`}
                      className="rounded-md"
                    />
                    <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
                        {isManagingGuidePacks ? (
                            <span className="text-2xl">📦</span>
                        ) : (
                            <GuideIcon iconName={item.icon} category={item.category} size={24} />
                        )}
                    </div>
                    <div className="flex-grow min-w-0">
                      <p className="font-semibold text-foreground truncate">{item.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{item.category || `${item.guide_count || 0} guides`}</p>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">{noItemsText}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-secondary/50 border-t border-border flex justify-end flex-shrink-0">
              <Button
                onClick={handleSave}
                className="bg-primary text-primary-foreground font-bold py-3 px-6 rounded-xl"
                disabled={!isManagingGuidePacks && selectedIds.length === 0}
              >
                {buttonText}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AddGuidesToBundleModal;
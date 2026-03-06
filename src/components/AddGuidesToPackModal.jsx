import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Checkbox } from '@/components/ui/checkbox';

const AddGuidesToPackModal = ({ isOpen, onClose, allGuides = [], guidesInPack = [], onAddGuides }) => {
  const [selectedGuides, setSelectedGuides] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  // When the modal opens, reset the state.
  useEffect(() => {
    if (isOpen) {
      setSelectedGuides([]);
      setSearchTerm('');
    }
  }, [isOpen]);

  const guidesInPackIds = guidesInPack.map(g => g.id);

  const availableGuides = allGuides
    .filter(g => g && !guidesInPackIds.includes(g.id)) // Ensure guide object exists
    .filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleToggleGuide = (guideId) => {
    setSelectedGuides(prev =>
      prev.includes(guideId) ? prev.filter(id => id !== guideId) : [...prev, guideId]
    );
  };

  const handleAdd = () => {
    if (selectedGuides.length === 0) {
      toast({
        title: "No guides selected",
        description: "Please pick at least one guide to add.",
        variant: "destructive",
      });
      return;
    }
    const guidesToAdd = allGuides.filter(g => selectedGuides.includes(g.id));
    onAddGuides(guidesToAdd);
    toast({
      title: "Guides Added!",
      description: `You've added ${guidesToAdd.length} new guide(s) to the pack.`,
      variant: 'success'
    });
    onClose();
  };
  
  const handleClose = () => {
    onClose();
  };

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
            className="bg-card rounded-3xl w-full max-w-lg shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">Add Guides to Pack</h2>
              <Button variant="ghost" size="icon" onClick={handleClose} className="rounded-full">
                <X size={24} />
              </Button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
                <input
                  type="text"
                  placeholder="Search available guides..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-12 pl-12 pr-4 rounded-xl bg-secondary border-2 border-transparent focus:border-primary focus:outline-none transition-colors text-foreground"
                />
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-border dark:scrollbar-thumb-border scrollbar-track-transparent">
                {availableGuides.length > 0 ? availableGuides.map(guide => (
                  <div
                    key={guide.id}
                    onClick={() => handleToggleGuide(guide.id)}
                    className="flex items-center gap-4 p-3 rounded-2xl cursor-pointer hover:bg-secondary transition-colors"
                  >
                    <Checkbox
                      checked={selectedGuides.includes(guide.id)}
                      onCheckedChange={() => handleToggleGuide(guide.id)}
                      id={`guide-${guide.id}`}
                      className="rounded-md"
                    />
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-xl flex-shrink-0">
                      {guide.icon}
                    </div>
                    <div className="flex-grow">
                      <p className="font-semibold text-foreground">{guide.name}</p>
                      <p className="text-sm text-muted-foreground">{guide.category}</p>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">Looks like all your guides are already in this pack!</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-secondary/50 border-t border-border flex justify-end">
              <Button
                onClick={handleAdd}
                className="bg-primary text-primary-foreground font-bold py-3 px-6 rounded-xl"
                disabled={selectedGuides.length === 0}
              >
                Add {selectedGuides.length > 0 ? `${selectedGuides.length} ` : ''}Guide(s)
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AddGuidesToPackModal;
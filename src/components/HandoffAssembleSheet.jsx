import React, { useState } from 'react';
import { Loader2, Sparkles, Baby, Users, Home, PawPrint, Plane } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useData } from '@/contexts/DataContext';
import { toFunctionError } from '@/hooks/useSubscription';
import { cn } from '@/lib/utils';

const OCCASIONS = [
  { id: 'babysitter', label: 'Babysitter', icon: Baby },
  { id: 'family', label: 'Grandparents', icon: Users },
  { id: 'housesitter', label: 'House-sitter', icon: Home },
  { id: 'petsitter', label: 'Pet-sitter', icon: PawPrint },
  { id: 'travel', label: "We're away", icon: Plane },
];

/**
 * Handoff assembly sheet: pick an occasion (+ optional note), AI curates the
 * user's existing guides into a new shareable bundle, then we navigate to that
 * bundle for review.
 */
const HandoffAssembleSheet = ({ isOpen, onClose }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { fetchData } = useData();
  const [occasion, setOccasion] = useState('babysitter');
  const [note, setNote] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const close = () => { if (!isGenerating) { setNote(''); setOccasion('babysitter'); onClose(); } };

  const handleAssemble = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('assemble-handoff-bundle', {
        body: { occasion, note: note.trim() || undefined },
      });
      if (error) throw await toFunctionError(error);
      if (data?.error) throw Object.assign(new Error(data.error), { code: data.code });

      // Refresh so the new bundle is in context, then open it for review.
      await fetchData();
      if (typeof data.free_remaining === 'number') {
        toast({
          title: 'Bundle assembled!',
          description: `${data.free_remaining} free AI generation${data.free_remaining === 1 ? '' : 's'} left.`,
        });
      }
      onClose();
      navigate(`/bundle/${data.bundle_id}`, { state: { aiAssembled: true } });
    } catch (err) {
      console.error('Handoff assemble error:', err);
      const needsUpgrade = err.code === 'upgrade_required';
      toast({
        title: needsUpgrade ? 'Upgrade to keep going'
          : err.code === 'no_guides' ? 'No guides yet' : 'Could not assemble',
        description: err.message,
        variant: 'destructive',
        // The free taste runs out here — give it somewhere to go rather than
        // dead-ending on the message.
        action: needsUpgrade ? (
          <ToastAction altText="See plans" onClick={() => { onClose(); navigate('/plans'); }}>
            See plans
          </ToastAction>
        ) : undefined,
      });
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isGenerating ? 'Assembling your handoff…' : 'Assemble a handoff bundle'}</DialogTitle>
          <DialogDescription>
            {isGenerating
              ? 'Picking the right guides and putting them in order.'
              : "Who's taking over? We'll gather the guides they need into a bundle you can share."}
          </DialogDescription>
        </DialogHeader>

        {isGenerating ? (
          <div className="flex justify-center py-10">
            <div className="w-24 h-24 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-purple-600 animate-pulse" />
            </div>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-3 gap-2">
              {OCCASIONS.map((o) => {
                const Icon = o.icon;
                const active = occasion === o.id;
                return (
                  <button
                    key={o.id}
                    onClick={() => setOccasion(o.id)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 text-xs font-semibold transition-all',
                      active
                        ? 'border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300'
                    )}
                  >
                    <Icon size={22} />
                    {o.label}
                  </button>
                );
              })}
            </div>

            <div>
              <label htmlFor="handoffassemblesheet-field" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
                Anything they should know? <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <Textarea id="handoffassemblesheet-field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Kids have a dentist appointment at 4pm; the dog can't have the back stairs."
                className="min-h-[72px] bg-white text-gray-900 placeholder-gray-400 border-2 border-gray-200 focus-visible:border-[#5CA9E9] focus-visible:ring-0 resize-none"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={close} disabled={isGenerating}>Cancel</Button>
          <Button onClick={handleAssemble} disabled={isGenerating}>
            {isGenerating
              ? <><Loader2 className="animate-spin mr-2 h-4 w-4" /> Assembling…</>
              : <><Sparkles className="mr-2 h-4 w-4" /> Assemble bundle</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HandoffAssembleSheet;

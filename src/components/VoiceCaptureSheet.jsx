import React, { useState, useEffect, useCallback } from 'react';
import { Mic, Square, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { toFunctionError } from '@/hooks/useSubscription';
import { mapDraftToForm } from '@/lib/aiDraft';
import { cn } from '@/lib/utils';

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Voice-to-Guide capture sheet: record up to 3 minutes of natural speech,
 * send it to the voice-to-guide edge function, and hand the resulting draft
 * (mapped to CreateGuideScreen's form shape) to `onDraft`.
 */
const VoiceCaptureSheet = ({ isOpen, onClose, onDraft }) => {
  const { toast } = useToast();
  const { isRecording, elapsed, error, start, stop, cancel, maxSeconds } = useVoiceRecorder();
  const [isGenerating, setIsGenerating] = useState(false);

  // Auto-start recording when the sheet opens.
  useEffect(() => {
    if (isOpen && !isRecording && !isGenerating) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleClose = useCallback(() => {
    cancel();
    setIsGenerating(false);
    onClose();
  }, [cancel, onClose]);

  const handleStopAndGenerate = async () => {
    const blob = await stop();
    if (!blob || blob.size === 0) {
      toast({ title: 'Nothing recorded', description: 'Try again and speak after the mic appears.', variant: 'destructive' });
      handleClose();
      return;
    }

    setIsGenerating(true);
    try {
      const form = new FormData();
      // Name must reflect the real container (iOS Safari records mp4, not
      // webm) — the server keys Whisper's decoder off the extension.
      const ext = (blob.type || '').includes('mp4') ? 'm4a' : 'webm';
      form.append('audio', blob, `recording.${ext}`);
      const { data, error: fnError } = await supabase.functions.invoke('voice-to-guide', { body: form });
      if (fnError) throw await toFunctionError(fnError);
      if (data?.error) throw Object.assign(new Error(data.error), { code: data.code });

      const draft = mapDraftToForm(data.guide);
      if (!draft) throw new Error("We couldn't structure that into a guide — try describing one task at a time.");

      if (typeof data.free_remaining === 'number') {
        toast({
          title: 'Guide drafted!',
          description: `${data.free_remaining} free AI generation${data.free_remaining === 1 ? '' : 's'} left — upgrade for daily AI.`,
        });
      }
      onDraft({ ...draft, transcript: data.transcript });
      handleClose();
    } catch (err) {
      console.error('Voice-to-guide error:', err);
      toast({
        title: err.code === 'upgrade_required' ? 'Upgrade to keep going' : 'Could not create guide',
        description: err.message,
        variant: 'destructive',
      });
      setIsGenerating(false);
      handleClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="text-center">
        <DialogHeader>
          <DialogTitle>{isGenerating ? 'Structuring your guide…' : 'Dictate your guide'}</DialogTitle>
          <DialogDescription>
            {isGenerating
              ? 'Turning what you said into steps. This takes a few seconds.'
              : 'Talk naturally — what it is, the steps, where things are. Up to 3 minutes.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-6">
          {isGenerating ? (
            <div className="w-24 h-24 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-purple-600 animate-pulse" />
            </div>
          ) : (
            <div className={cn(
              'w-24 h-24 rounded-full flex items-center justify-center transition-colors',
              isRecording ? 'bg-red-100 dark:bg-red-900/40 animate-pulse' : 'bg-gray-100 dark:bg-gray-800'
            )}>
              <Mic className={cn('w-10 h-10', isRecording ? 'text-red-500' : 'text-gray-400')} />
            </div>
          )}

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400 max-w-xs">{error}</p>
          ) : !isGenerating && (
            <p className="font-mono text-2xl tabular-nums text-gray-700 dark:text-gray-200">
              {fmt(elapsed)} <span className="text-sm text-gray-400">/ {fmt(maxSeconds)}</span>
            </p>
          )}
        </div>

        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={handleClose} disabled={isGenerating}>Cancel</Button>
          <Button onClick={handleStopAndGenerate} disabled={!isRecording || isGenerating}>
            {isGenerating
              ? <><Loader2 className="animate-spin mr-2 h-4 w-4" /> Generating…</>
              : <><Square className="mr-2 h-4 w-4 fill-current" /> Stop &amp; create guide</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VoiceCaptureSheet;

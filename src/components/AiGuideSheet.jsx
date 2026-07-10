import React, { useState, useEffect, useCallback } from 'react';
import { Mic, Square, Loader2, Sparkles, Type } from 'lucide-react';
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
import { supabase } from '@/lib/supabaseClient';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { toFunctionError } from '@/hooks/useSubscription';
import { mapDraftToForm } from '@/lib/aiDraft';
import { cn } from '@/lib/utils';

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * AI guide creation sheet with two input modes:
 *   - Speak: record up to 3 min → Whisper → structured draft
 *   - Type: describe the guide in words → structured draft (skips Whisper)
 * Both hit the voice-to-guide edge function and hand the resulting draft
 * (mapped to CreateGuideScreen's form shape) to `onDraft`.
 */
const AiGuideSheet = ({ isOpen, onClose, onDraft }) => {
  const { toast } = useToast();
  const { isRecording, elapsed, error, start, stop, cancel, maxSeconds } = useVoiceRecorder();
  const [mode, setMode] = useState('voice'); // 'voice' | 'text'
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Auto-start recording when the sheet opens in voice mode.
  useEffect(() => {
    if (isOpen && mode === 'voice' && !isRecording && !isGenerating) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode]);

  const resetAndClose = useCallback(() => {
    cancel();
    setIsGenerating(false);
    setPrompt('');
    setMode('voice');
    onClose();
  }, [cancel, onClose]);

  // Hand a successful edge-function response to the parent.
  const applyResponse = (data) => {
    const draft = mapDraftToForm(data.guide);
    if (!draft) throw new Error("We couldn't structure that into a guide — try describing one task at a time.");
    if (typeof data.free_remaining === 'number') {
      toast({
        title: 'Guide drafted!',
        description: `${data.free_remaining} free AI generation${data.free_remaining === 1 ? '' : 's'} left — upgrade for daily AI.`,
      });
    }
    onDraft({ ...draft, transcript: data.transcript, source: data.source });
    resetAndClose();
  };

  const handleError = (err) => {
    console.error('AI guide error:', err);
    toast({
      title: err.code === 'upgrade_required' ? 'Upgrade to keep going' : 'Could not create guide',
      description: err.message,
      variant: 'destructive',
    });
    setIsGenerating(false);
  };

  const switchMode = (next) => {
    if (isGenerating) return;
    if (next === 'text') cancel();
    setMode(next);
  };

  const handleVoiceGenerate = async () => {
    const blob = await stop();
    if (!blob || blob.size === 0) {
      toast({ title: 'Nothing recorded', description: 'Try again and speak after the mic appears.', variant: 'destructive' });
      resetAndClose();
      return;
    }
    setIsGenerating(true);
    try {
      const form = new FormData();
      const ext = (blob.type || '').includes('mp4') ? 'm4a' : 'webm';
      form.append('audio', blob, `recording.${ext}`);
      const { data, error: fnError } = await supabase.functions.invoke('voice-to-guide', { body: form });
      if (fnError) throw await toFunctionError(fnError);
      if (data?.error) throw Object.assign(new Error(data.error), { code: data.code });
      applyResponse(data);
    } catch (err) {
      handleError(err);
      resetAndClose();
    }
  };

  const handleTextGenerate = async () => {
    if (prompt.trim().length < 10) {
      toast({ title: 'Add a little more', description: 'Describe the guide in a sentence or two.', variant: 'destructive' });
      return;
    }
    setIsGenerating(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('voice-to-guide', {
        body: { prompt: prompt.trim() },
      });
      if (fnError) throw await toFunctionError(fnError);
      if (data?.error) throw Object.assign(new Error(data.error), { code: data.code });
      applyResponse(data);
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetAndClose(); }}>
      <DialogContent className="text-center">
        <DialogHeader>
          <DialogTitle>{isGenerating ? 'Structuring your guide…' : 'Create a guide with AI'}</DialogTitle>
          <DialogDescription>
            {isGenerating
              ? 'Turning this into clear steps. A few seconds.'
              : 'Speak it or type it — we draft the title, steps, and category for you to review.'}
          </DialogDescription>
        </DialogHeader>

        {!isGenerating && (
          <div className="mx-auto inline-flex rounded-full bg-gray-100 dark:bg-gray-800 p-1">
            <button
              onClick={() => switchMode('voice')}
              className={cn('flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all',
                mode === 'voice' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500')}
            >
              <Mic size={15} /> Speak
            </button>
            <button
              onClick={() => switchMode('text')}
              className={cn('flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all',
                mode === 'text' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500')}
            >
              <Type size={15} /> Type
            </button>
          </div>
        )}

        {isGenerating ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-24 h-24 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-purple-600 animate-pulse" />
            </div>
          </div>
        ) : mode === 'voice' ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className={cn('w-24 h-24 rounded-full flex items-center justify-center transition-colors',
              isRecording ? 'bg-red-100 dark:bg-red-900/40 animate-pulse' : 'bg-gray-100 dark:bg-gray-800')}>
              <Mic className={cn('w-10 h-10', isRecording ? 'text-red-500' : 'text-gray-400')} />
            </div>
            {error ? (
              <p className="text-sm text-red-600 dark:text-red-400 max-w-xs">{error}</p>
            ) : (
              <p className="font-mono text-2xl tabular-nums text-gray-700 dark:text-gray-200">
                {fmt(elapsed)} <span className="text-sm text-gray-400">/ {fmt(maxSeconds)}</span>
              </p>
            )}
          </div>
        ) : (
          <div className="py-4">
            <Textarea
              autoFocus
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. How to run the dishwasher: add a pod to the door, pick the Normal cycle, press start. Spare pods are under the sink."
              className="min-h-[120px] bg-white text-gray-900 placeholder-gray-400 border-2 border-gray-200 focus-visible:border-[#5CA9E9] focus-visible:ring-0 resize-none text-left"
            />
          </div>
        )}

        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={resetAndClose} disabled={isGenerating}>Cancel</Button>
          {mode === 'voice' ? (
            <Button onClick={handleVoiceGenerate} disabled={!isRecording || isGenerating}>
              {isGenerating
                ? <><Loader2 className="animate-spin mr-2 h-4 w-4" /> Generating…</>
                : <><Square className="mr-2 h-4 w-4 fill-current" /> Stop &amp; create guide</>}
            </Button>
          ) : (
            <Button onClick={handleTextGenerate} disabled={isGenerating || prompt.trim().length < 10}>
              {isGenerating
                ? <><Loader2 className="animate-spin mr-2 h-4 w-4" /> Generating…</>
                : <><Sparkles className="mr-2 h-4 w-4" /> Create guide</>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AiGuideSheet;

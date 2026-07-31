import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThumbsUp, ThumbsDown, X, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import HeartMark from '@/components/HeartMark';
import {
  FEEDBACK_EVENT,
  submitFeedback,
  shouldAskForReview,
  recordThumbsUp,
  markReviewAsked,
  openStoreReview,
} from '@/lib/feedback';

const QUESTIONS = {
  bubble: 'How’s Family Playbook feeling?',
  setup: 'All set up — how was that?',
  first_action: 'You made your first guide! How did it go?',
};

/**
 * Persistent feedback affordance + the one-question sheet.
 *
 * The 44px bubble sits bottom-LEFT (the raspberry create-FAB owns the
 * bottom-right) above the tab bar. Checkpoint prompts arrive via the
 * FEEDBACK_EVENT window event and open the same sheet with different copy.
 * Everything is dismissible and never blocks navigation.
 */
const FeedbackBubble = () => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('bubble');
  const [rating, setRating] = useState(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [askReview, setAskReview] = useState(false);

  // Checkpoint prompts open the sheet with their own question.
  useEffect(() => {
    const onCheckpoint = (e) => {
      setKind(e.detail?.kind || 'bubble');
      setRating(null);
      setMessage('');
      setAskReview(false);
      setOpen(true);
    };
    window.addEventListener(FEEDBACK_EVENT, onCheckpoint);
    return () => window.removeEventListener(FEEDBACK_EVENT, onCheckpoint);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setAskReview(false);
    setRating(null);
    setMessage('');
    setKind('bubble');
  }, []);

  const handleSend = async (chosenRating) => {
    const finalRating = chosenRating ?? rating;
    if (!finalRating && !message.trim()) return;
    setSending(true);
    try {
      await submitFeedback({ kind, rating: finalRating, message });
      if (finalRating === 'up') {
        recordThumbsUp();
        if (shouldAskForReview()) {
          markReviewAsked();
          setAskReview(true); // swap the sheet to the gentle review ask
          setSending(false);
          return;
        }
      }
      toast({ title: 'Thank you!', description: 'Every note makes the playbook better.' });
      close();
    } catch (err) {
      console.error('[feedback]', err);
      toast({ title: 'Could not send', description: 'Please try again in a moment.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* The bubble */}
      <motion.button
        aria-label="Send feedback"
        onClick={() => { setKind('bubble'); setOpen(true); }}
        whileTap={{ scale: 0.94 }}
        className="fixed left-[18px] bottom-[110px] z-40 w-11 h-11 rounded-full bg-card border border-card-border shadow-card flex items-center justify-center"
      >
        <HeartMark size={22} stroke="#C25065" />
      </motion.button>

      {/* The sheet */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={close}
              className="fixed inset-0 bg-mulberry/30 z-50"
            />
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-cream dark:bg-card rounded-t-[22px] px-[22px] pt-5 pb-safe"
            >
              <div className="pb-7">
                <div className="flex items-start justify-between mb-1">
                  {askReview ? (
                    <h2 className="font-display font-semibold text-[20px] text-mulberry dark:text-foreground pr-4">
                      Enjoying Family Playbook?
                    </h2>
                  ) : (
                    <h2 className="font-display font-semibold text-[20px] text-mulberry dark:text-foreground pr-4">
                      {QUESTIONS[kind]}
                    </h2>
                  )}
                  <button onClick={close} aria-label="Close" className="p-1 -mr-1 text-muted-copy">
                    <X size={20} />
                  </button>
                </div>

                {askReview ? (
                  <>
                    <p className="text-[14.5px] text-body-copy dark:text-muted-foreground mb-5">
                      A quick review really helps other families find it.
                    </p>
                    <button
                      onClick={async () => { await openStoreReview(); toast({ title: 'Thank you!' }); close(); }}
                      className="w-full h-12 rounded-full bg-raspberry hover:bg-raspberry-hover text-cream font-bold text-[15px]"
                    >
                      Leave a review
                    </button>
                    <button onClick={close} className="w-full mt-3 text-[13.5px] font-bold text-muted-copy">
                      Maybe later
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex gap-3 my-4">
                      {[['up', ThumbsUp], ['down', ThumbsDown]].map(([val, Icon]) => (
                        <button
                          key={val}
                          aria-label={val === 'up' ? 'Thumbs up' : 'Thumbs down'}
                          onClick={() => setRating(rating === val ? null : val)}
                          className={`flex-1 h-14 rounded-lg border flex items-center justify-center transition-all ${
                            rating === val
                              ? val === 'up'
                                ? 'bg-raspberry border-raspberry text-cream'
                                : 'bg-mulberry border-mulberry text-cream'
                              : 'bg-card border-card-border text-muted-copy'
                          }`}
                        >
                          <Icon size={24} />
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Anything to add? (optional)"
                      rows={2}
                      className="w-full rounded-lg border border-card-border bg-card p-3 text-[14.5px] text-mulberry dark:text-foreground placeholder:text-placeholder-copy focus:outline-none focus:border-raspberry resize-none"
                    />
                    <button
                      onClick={() => handleSend(null)}
                      disabled={sending || (!rating && !message.trim())}
                      className="w-full h-12 mt-4 rounded-full bg-raspberry hover:bg-raspberry-hover text-cream font-bold text-[15px] disabled:opacity-40 flex items-center justify-center"
                    >
                      {sending ? <Loader2 size={18} className="animate-spin" /> : 'Send'}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default FeedbackBubble;

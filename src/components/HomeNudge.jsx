import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useData } from '@/contexts/DataContext';
import { useToast } from '@/components/ui/use-toast';
import { detectGaps } from '@/lib/gapDetection';
import {
  pickFreshnessCandidate, cadenceAllows, markPrompted, staleSinceLabel, SNOOZE_DAYS,
} from '@/lib/freshness';
import { FRESHNESS_ENABLED, GAP_NUDGE_ENABLED } from '@/lib/featureFlags';

/**
 * At most ONE quiet nudge on Home, ever:
 *   1. a gap card ("your playbook has a gap") — completeness first
 *   2. else a freshness card ("is this still accurate?") — max every 2 weeks
 * Both dismissible; dismissals stored server-side so no device re-asks.
 */
const HomeNudge = () => {
  const { user } = useAuth();
  const { allGuides, fetchData } = useData();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [dismissals, setDismissals] = useState(null); // null = loading
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [freshnessShown, setFreshnessShown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    supabase
      .from('user_dismissals')
      .select('kind, key, dismissed_at')
      .eq('user_id', user.id)
      .then(({ data }) => { if (!cancelled) setDismissals(data || []); });
    return () => { cancelled = true; };
  }, [user]);

  const gap = useMemo(() => {
    if (!GAP_NUDGE_ENABLED || !dismissals) return null;
    const covered = new Set(dismissals.filter((d) => d.kind === 'gap_covered').map((d) => d.key));
    return detectGaps(allGuides, covered)[0] || null;
  }, [dismissals, allGuides]);

  const freshness = useMemo(() => {
    if (!FRESHNESS_ENABLED || !dismissals || gap) return null;
    if (!freshnessShown && !cadenceAllows()) return null;
    const activeSnoozes = new Set(
      dismissals
        .filter((d) => d.kind === 'freshness_snooze')
        .filter((d) => Date.now() - new Date(d.dismissed_at).getTime() < SNOOZE_DAYS * 864e5)
        .map((d) => d.key)
    );
    return pickFreshnessCandidate(allGuides, activeSnoozes);
  }, [dismissals, allGuides, gap, freshnessShown]);

  // Stamp the biweekly cadence the moment a freshness card actually renders.
  useEffect(() => {
    if (freshness && !freshnessShown) { markPrompted(); setFreshnessShown(true); }
  }, [freshness, freshnessShown]);

  const dismiss = async (kind, key) => {
    setBusy(true);
    const { error } = await supabase
      .from('user_dismissals')
      .upsert({ user_id: user.id, kind, key, dismissed_at: new Date().toISOString() }, { onConflict: 'user_id,kind,key' });
    setBusy(false);
    if (!error) setDismissals((prev) => [...(prev || []).filter((d) => !(d.kind === kind && d.key === key)), { kind, key, dismissed_at: new Date().toISOString() }]);
  };

  const confirmFresh = async (guide) => {
    setBusy(true);
    const { error } = await supabase
      .from('guides')
      .update({ last_confirmed_at: new Date().toISOString() })
      .eq('id', guide.id);
    setBusy(false);
    setHidden(true);
    if (!error) {
      toast({ title: 'Thanks!', description: `“${guide.name}” is marked up to date.` });
      fetchData();
    }
  };

  if (hidden || (!gap && !freshness)) return null;

  if (gap) {
    return (
      <div className="mb-7 bg-card rounded-lg border border-card-border shadow-card p-4">
        <div className="flex items-start gap-3.5">
          <span className="w-[34px] h-[34px] rounded-full bg-halo-apricot flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="w-3 h-3 rounded-full bg-apricot" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[15px] text-mulberry dark:text-foreground">Your playbook has a gap</div>
            <p className="text-[13.5px] text-muted-copy mt-0.5">
              There’s {gap.prompt} — the kind of thing a helper needs most.
            </p>
            <div className="flex gap-2.5 mt-3">
              <button
                onClick={() => navigate('/guide/new', { state: { starterTemplate: gap.starter } })}
                className="h-9 px-4 rounded-full bg-raspberry hover:bg-raspberry-hover text-cream font-bold text-[13.5px]"
              >
                Add it
              </button>
              <button
                onClick={() => dismiss('gap_covered', gap.key)}
                disabled={busy}
                className="h-9 px-4 rounded-full bg-blush text-blush-copy font-bold text-[13.5px]"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : 'We’re covered'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-7 bg-blush/60 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[15px] text-mulberry dark:text-foreground">Still accurate?</div>
          <p className="text-[13.5px] text-blush-copy mt-0.5">
            “{freshness.name}” hasn’t changed since {staleSinceLabel(freshness)}.
          </p>
          <div className="flex gap-2.5 mt-3">
            <button
              onClick={() => confirmFresh(freshness)}
              disabled={busy}
              className="h-9 px-4 rounded-full bg-raspberry hover:bg-raspberry-hover text-cream font-bold text-[13.5px]"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : 'Still right'}
            </button>
            <button
              onClick={() => navigate(`/guide/${freshness.id}/edit`)}
              className="h-9 px-4 rounded-full bg-card border border-card-border text-mulberry dark:text-foreground font-bold text-[13.5px]"
            >
              Update it
            </button>
          </div>
        </div>
        <button
          aria-label="Not now"
          onClick={() => { dismiss('freshness_snooze', freshness.id); setHidden(true); }}
          className="p-1 text-muted-copy flex-shrink-0"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default HomeNudge;

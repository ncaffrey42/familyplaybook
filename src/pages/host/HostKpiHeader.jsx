import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

/**
 * The "is everything running?" glance (docs/platform/HOST_SHELL.md §4).
 *
 * Constraint: NO new analytics infrastructure. Every number below is a query
 * against a table that already exists — no counters, no events, no rollups.
 *
 *   Active properties  → packs        (a property IS a bundle, per Prompt 9's
 *                                      one-bundle-per-property convention)
 *   Live guest links   → shared_links (not expired)
 *   Answered this week → ask_playbook_usage, question_count - refusal_count
 *
 * Each KPI resolves independently and falls back to "—" on error, so an
 * unapplied migration costs one dash rather than an empty header or a crash.
 * That matters today: ask_playbook_usage only exists after migration
 * 20240129, which has not been applied.
 */

const Kpi = ({ label, value, hint }) => (
  <div className="flex-1 min-w-0">
    <div className="font-display font-semibold text-[26px] leading-none text-cream tabular-nums">
      {value === null ? '—' : value}
    </div>
    <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-apricot truncate">
      {label}
    </div>
    {hint && (
      <div className="text-[11.5px] mt-0.5 truncate" style={{ color: 'rgba(253,248,243,.55)' }}>
        {hint}
      </div>
    )}
  </div>
);

const HostKpiHeader = () => {
  const { user } = useAuth();
  const [properties, setProperties] = useState(null);
  const [liveLinks, setLiveLinks] = useState(null);
  const [answered, setAnswered] = useState(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    // Independent on purpose: one failing query must not blank the others.
    const loadProperties = async () => {
      const { count, error } = await supabase
        .from('packs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      if (!cancelled && !error) setProperties(count ?? 0);
    };

    const loadLiveLinks = async () => {
      const { count, error } = await supabase
        .from('shared_links')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
      if (!cancelled && !error) setLiveLinks(count ?? 0);
    };

    // Needs migration 20240129 (unapplied). Errors here are expected for now
    // and are swallowed into a "—" rather than surfaced as a broken header.
    const loadAnswered = async () => {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const { data, error } = await supabase
        .from('ask_playbook_usage')
        .select('question_count, refusal_count')
        .gte('hour_bucket', since);
      if (cancelled || error) return;
      // Answered = asked minus refused. The raw question count would flatter
      // the feature — twenty refusals would read the same as twenty answers.
      const total = (data ?? []).reduce(
        (sum, r) => sum + Math.max(0, (r.question_count ?? 0) - (r.refusal_count ?? 0)),
        0,
      );
      setAnswered(total);
    };

    loadProperties();
    loadLiveLinks();
    loadAnswered();
    return () => { cancelled = true; };
  }, [user]);

  return (
    <header className="bg-mulberry px-[22px] pt-14 pb-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-apricot">
          Your places
        </div>
        <div className="flex items-start gap-5 mt-3">
          <Kpi label="Properties" value={properties} />
          <Kpi label="Live links" value={liveLinks} />
          <Kpi label="Answered" value={answered} hint="last 7 days" />
        </div>
      </div>
    </header>
  );
};

export default HostKpiHeader;

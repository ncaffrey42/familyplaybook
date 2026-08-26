import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePlanLimits } from '@/hooks/usePlanLimits';
import GuideIcon from '@/components/GuideIcon';
import HomeNudge from '@/components/HomeNudge';
import { describeWindow } from '@/lib/shareWindows';

/**
 * Brand v1 Home: answer "what do I need right now" in one screen.
 * Greeting + avatar → share card → pinned guides → bundles carousel →
 * usage nudge (only past 50% of the plan cap).
 */

const SectionLabel = ({ children }) => (
  <div className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-raspberry">
    {children}
  </div>
);

const GuideRow = ({ guide, onClick }) => (
  <button
    onClick={onClick}
    className="w-full bg-card rounded-lg border border-card-border shadow-card px-4 py-[15px] flex items-center gap-3.5 text-left transition-all hover:border-hover-border hover:-translate-y-px"
  >
    <GuideIcon category={guide.category} size={42} dot={15} />
    <div className="flex-1 min-w-0">
      <div className="font-bold text-[16.5px] text-mulberry dark:text-foreground truncate">
        {guide.name}
      </div>
      <div className="text-[13.5px] text-muted-copy truncate">
        {guide.category || 'Guide'}
        {Array.isArray(guide.steps) && guide.steps.length > 0 && ` · ${guide.steps.length} ${guide.steps.length === 1 ? 'step' : 'steps'}`}
      </div>
    </div>
  </button>
);

const HomeScreen = () => {
  const navigate = useNavigate();
  const { user, profile, planKey } = useAuth();
  const { allGuides, allBundles, favorites, isDataLoaded } = useData();
  const limits = usePlanLimits();

  // The soonest-closing live link with a window on it — "Ana is sitting".
  // A link with no expiry is an always-on share, not a scheduled handoff, so
  // it never claims the card.
  const [handoff, setHandoff] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return undefined;
    supabase
      .from('shared_links')
      .select('id, recipient_name, expires_at, guide_id, bundle_id, guides(name), packs(name)')
      .eq('user_id', user.id)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: true })
      .limit(1)
      .then(({ data }) => {
        if (!cancelled) setHandoff((data && data[0]) || null);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning,' : hour < 18 ? 'Good afternoon,' : 'Good evening,';
  const familyName = profile?.full_name || user?.email?.split('@')[0] || 'your family';
  const initial = (profile?.full_name || user?.email || 'F')[0].toUpperCase();

  // Pinned first, most recently updated after — max 4 rows.
  const pinnedIds = useMemo(() => new Set((favorites || []).map((f) => f.id)), [favorites]);
  const homeGuides = useMemo(() => {
    const mine = (allGuides || []).filter((g) => !g.is_shared_with_me);
    const ranked = [...mine].sort((a, b) => {
      const pin = (pinnedIds.has(b.id) ? 1 : 0) - (pinnedIds.has(a.id) ? 1 : 0);
      if (pin !== 0) return pin;
      return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
    });
    return ranked.slice(0, 4);
  }, [allGuides, pinnedIds]);

  const guideCount = (allGuides || []).filter((g) => !g.is_shared_with_me).length;
  const bundles = (allBundles || []).slice(0, 8);

  const handoffFirstName = (handoff?.recipient_name || '').trim().split(' ')[0] || '';
  const handoffItemName = handoff?.packs?.name || handoff?.guides?.name || 'Your playbook';
  const handoffLabel = useMemo(() => {
    if (!handoff?.expires_at) return '';
    const expiry = new Date(handoff.expires_at);
    const now = new Date();
    const endsToday =
      expiry.getFullYear() === now.getFullYear() &&
      expiry.getMonth() === now.getMonth() &&
      expiry.getDate() === now.getDate();
    return `${endsToday ? 'Tonight' : 'Live now'} · ${describeWindow(handoff)}`;
  }, [handoff]);

  // Usage nudge only past 50% of the cap (and only when the plan has a cap).
  const guideCap = limits?.active_guides ?? null;
  const showNudge = guideCap != null && guideCount / guideCap >= 0.5;
  const nearCap = guideCap != null && guideCount / guideCap >= 0.9;
  const planName = planKey ? planKey.charAt(0).toUpperCase() + planKey.slice(1) : 'Free';

  return (
    <>
      <Helmet>
        <title>Home - Family Playbook</title>
      </Helmet>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="min-h-screen bg-cream dark:bg-background px-[22px] pt-[58px] pb-32"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-[26px]">
          <div>
            <div className="text-[16px] text-muted-copy">{greeting}</div>
            <h1 className="font-display font-semibold text-[30px] leading-[1.15] text-mulberry dark:text-foreground">
              {familyName}
            </h1>
          </div>
          <button
            onClick={() => navigate('/account')}
            className="w-[38px] h-[38px] rounded-full bg-mulberry text-cream flex items-center justify-center font-bold text-[15px] mt-1"
            aria-label="Account"
          >
            {initial}
          </button>
        </div>

        {/* Share card — the live-handoff variant when a timed link is open,
            the generic invitation otherwise. */}
        <div className="relative overflow-hidden bg-mulberry rounded-2xl p-5 mb-7">
          <div
            className="absolute -top-8 -right-8 w-[110px] h-[110px] rounded-full"
            style={{ background: 'rgba(253,248,243,.06)' }}
          />
          <div className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-apricot">
            {handoff ? handoffLabel : 'One link, everything they need'}
          </div>
          <div className="font-display font-semibold text-[20px] leading-[1.25] text-cream mt-1.5">
            {handoff
              ? handoffFirstName
                ? `${handoffFirstName} has your playbook`
                : `${handoffItemName} is shared`
              : 'Share your playbook'}
          </div>
          <p className="text-[14px] leading-[1.55] mt-1" style={{ color: 'rgba(253,248,243,.72)' }}>
            {handoff
              ? `${handoffItemName} — live ${describeWindow(handoff)}. ${
                  handoffFirstName ? `${handoffFirstName} sees` : 'They see'
                } only what's in it.`
              : 'A sitter, a grandparent, a house-guest — send one link and they see exactly what you choose. No app on their end.'}
          </p>
          <div className="flex gap-2.5 mt-4">
            <button
              onClick={() => navigate(handoff ? `/share-manage/${handoff.id}` : '/share-center')}
              className="flex-1 h-11 rounded-full bg-raspberry hover:bg-raspberry-hover text-cream font-bold text-[15px] transition-colors"
            >
              {handoff
                ? handoffFirstName
                  ? `${handoffFirstName}'s link`
                  : 'Open the link'
                : 'Share a link'}
            </button>
            <button
              onClick={() =>
                navigate(
                  handoff?.bundle_id
                    ? `/bundle/${handoff.bundle_id}`
                    : handoff?.guide_id
                      ? `/guide/${handoff.guide_id}`
                      : '/guides?segment=bundles'
                )
              }
              className="h-11 px-5 rounded-full font-bold text-[15px] text-cream transition-colors"
              style={{ background: 'rgba(253,248,243,.12)' }}
            >
              Review
            </button>
          </div>
        </div>

        <HomeNudge />

        {/* Your guides */}
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Your guides</SectionLabel>
          <button
            onClick={() => navigate('/guides')}
            className="text-[13px] font-bold text-raspberry"
          >
            All {guideCount}
          </button>
        </div>
        <div className="space-y-2.5 mb-7">
          {!isDataLoaded && (allGuides || []).length === 0 ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="h-[70px] rounded-lg bg-blush/60 animate-pulse" />
            ))
          ) : homeGuides.length > 0 ? (
            homeGuides.map((g) => (
              <GuideRow key={g.id} guide={g} onClick={() => navigate(`/guide/${g.id}`)} />
            ))
          ) : (
            <div className="bg-card rounded-lg border border-card-border p-6 text-center">
              <p className="font-display font-semibold text-[17px] text-mulberry dark:text-foreground">
                Write your first guide.
              </p>
              <button
                onClick={() => navigate('/guide/new')}
                className="mt-3 h-10 px-5 rounded-full bg-raspberry hover:bg-raspberry-hover text-cream font-bold text-[14px]"
              >
                Start with one thing
              </button>
            </div>
          )}
        </div>

        {/* Bundles carousel */}
        {bundles.length > 0 && (
          <>
            <div className="mb-3">
              <SectionLabel>Bundles</SectionLabel>
            </div>
            <div className="-mx-[22px] px-[22px] flex gap-3 overflow-x-auto scrollbar-hide mb-7">
              {bundles.map((b) => (
                <button
                  key={b.id}
                  onClick={() => navigate(`/bundle/${b.id}`)}
                  className="flex-shrink-0 w-[158px] bg-card rounded-lg border border-card-border shadow-card overflow-hidden text-left transition-all hover:border-hover-border hover:-translate-y-px"
                >
                  <div className="h-[30px]" style={{ background: b.color || '#C25065' }} />
                  <div className="p-3.5">
                    <div className="font-bold text-[15px] text-mulberry dark:text-foreground truncate">
                      {b.name}
                    </div>
                    <div className="text-[12.5px] text-muted-copy mt-0.5">
                      {b.guide_count ?? 0} {b.guide_count === 1 ? 'guide' : 'guides'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Usage nudge */}
        {showNudge && (
          <div className="bg-blush rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="text-[14px] font-bold text-blush-copy">
                {guideCount} of {guideCap} guides on {planName}
              </div>
              <button
                onClick={() => navigate('/plans')}
                className="text-[13.5px] font-bold text-raspberry"
              >
                See plans
              </button>
            </div>
            <div
              className="h-1.5 rounded-full mt-2.5 overflow-hidden"
              style={{ background: 'rgba(138,90,69,.18)' }}
            >
              <div
                className={`h-full rounded-full transition-all duration-300 ${nearCap ? 'bg-coral' : 'bg-raspberry'}`}
                style={{ width: `${Math.min((guideCount / guideCap) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </motion.div>
    </>
  );
};

export default HomeScreen;

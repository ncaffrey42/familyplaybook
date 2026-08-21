import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Plus } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { useData } from '@/contexts/DataContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import GuideIcon from '@/components/GuideIcon';
import BundleGlyph from '@/components/BundleGlyph';
import HeartMark from '@/components/HeartMark';
import { searchGuides, searchBundles } from '@/lib/searchUtils';

/**
 * Brand v1 Guides screen — one place for everything the family has written.
 * Segmented control: Guides / Bundles / Library. Reads ?segment= and ?chip=
 * so the retired /library, /bundles and /favorites routes land in the right
 * view.
 */

const SEGMENTS = ['guides', 'bundles', 'library'];
const CHIPS = ['All', 'How To', 'Find It', 'Reference', 'Pinned'];

const HEADERS = {
  guides: (n) => ({ title: 'Guides', sub: `${n} ${n === 1 ? 'guide' : 'guides'} · newest first` }),
  bundles: () => ({ title: 'Bundles', sub: 'Group guides for a sitter, a season, a trip.' }),
  library: () => ({ title: 'Library', sub: 'Ready-made guides you can copy and edit.' }),
};

const GuideRow = ({ guide, onClick, right }) => (
  <div
    onClick={onClick}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => e.key === 'Enter' && onClick()}
    className="w-full bg-card rounded-lg border border-card-border shadow-card px-4 py-[15px] flex items-center gap-3.5 text-left cursor-pointer transition-all hover:border-hover-border hover:-translate-y-px"
  >
    <GuideIcon category={guide.category} size={42} glyph={19} />
    <div className="flex-1 min-w-0">
      <div className="font-bold text-[16.5px] text-mulberry dark:text-foreground truncate">
        {guide.name}
      </div>
      <div className="text-[13.5px] text-muted-copy truncate">
        {guide.category || 'Guide'}
        {Array.isArray(guide.steps) && guide.steps.length > 0 && ` · ${guide.steps.length} ${guide.steps.length === 1 ? 'step' : 'steps'}`}
        {guide.is_shared_with_me && ' · Shared with you'}
      </div>
    </div>
    {right}
  </div>
);

const EmptyState = ({ line, actionLabel, onAction }) => (
  <div className="bg-card rounded-lg border border-card-border p-8 text-center">
    <div className="flex justify-center mb-3">
      <HeartMark size={44} stroke="#D8B9C4" />
    </div>
    <p className="font-display font-semibold text-[18px] text-mulberry dark:text-foreground">{line}</p>
    {actionLabel && (
      <button
        onClick={onAction}
        className="mt-4 h-10 px-5 rounded-full bg-raspberry hover:bg-raspberry-hover text-cream font-bold text-[14px]"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

const GuidesLibrary = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const {
    allGuides, allBundles, guideLibrary, favorites,
    handleAddGuideFromLibrary, isDataLoaded,
  } = useData();

  const segment = SEGMENTS.includes(params.get('segment')) ? params.get('segment') : 'guides';
  const chipParam = (params.get('chip') || '').toLowerCase();
  const initialChip = chipParam === 'pinned' ? 'Pinned' : 'All';
  const [chip, setChip] = useState(initialChip);
  const [searchTerm, setSearchTerm] = useState('');

  // Keep chip in sync when arriving via /favorites redirect after mount.
  useEffect(() => {
    if (chipParam === 'pinned') setChip('Pinned');
  }, [chipParam]);

  const setSegment = (s) => {
    const next = new URLSearchParams(params);
    if (s === 'guides') next.delete('segment');
    else next.set('segment', s);
    setParams(next, { replace: true });
    setSearchTerm('');
  };

  const pinnedIds = useMemo(() => new Set((favorites || []).map((f) => f.id)), [favorites]);

  const myGuides = useMemo(() => {
    let list = allGuides || [];
    if (chip === 'Pinned') list = list.filter((g) => pinnedIds.has(g.id));
    else if (chip !== 'All') list = list.filter((g) => g.category === chip);
    if (searchTerm) list = searchGuides(list, searchTerm);
    return [...list].sort(
      (a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)
    );
  }, [allGuides, chip, pinnedIds, searchTerm]);

  const bundles = useMemo(() => {
    let list = allBundles || [];
    if (searchTerm) list = searchBundles(list, searchTerm);
    return list;
  }, [allBundles, searchTerm]);

  const libraryGuides = useMemo(() => {
    let list = guideLibrary || [];
    if (searchTerm) list = searchGuides(list, searchTerm);
    return list;
  }, [guideLibrary, searchTerm]);

  const header = HEADERS[segment]((allGuides || []).length);

  return (
    <>
      <Helmet>
        <title>Guides - Family Playbook</title>
      </Helmet>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="min-h-screen bg-cream dark:bg-background pb-[100px]"
      >
        {/* Sticky header */}
        <div
          className="sticky top-0 z-30 px-[22px] pt-[56px] pb-3 border-b border-card-border"
          style={{ background: 'rgba(253,248,243,.95)', backdropFilter: 'blur(12px)' }}
        >
          <h1 className="font-display font-semibold text-[29px] leading-[1.15] text-mulberry">
            {header.title}
          </h1>
          <p className="text-[14.5px] text-muted-copy mt-0.5">{header.sub}</p>

          {/* Segmented control */}
          <div className="mt-4 bg-blush rounded-full p-1 flex">
            {SEGMENTS.map((s) => (
              <button
                key={s}
                onClick={() => setSegment(s)}
                className={`flex-1 h-9 rounded-full text-[14px] font-bold capitalize transition-colors ${
                  segment === s ? 'bg-cream text-mulberry' : 'text-muted-copy'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-placeholder-copy" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={segment === 'library' ? 'Search the library' : 'Search your playbook'}
              className="w-full h-11 pl-10 pr-4 rounded-full bg-card border border-card-border text-[14.5px] text-mulberry placeholder:text-placeholder-copy focus:outline-none focus:border-raspberry"
            />
          </div>

          {/* Filter chips (guides segment only) */}
          {segment === 'guides' && (
            <div className="mt-3 -mx-[22px] px-[22px] flex gap-2 overflow-x-auto scrollbar-hide">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  onClick={() => setChip(c)}
                  className={`flex-shrink-0 h-8 px-3.5 rounded-full text-[13px] font-bold transition-colors ${
                    chip === c
                      ? 'bg-mulberry text-cream'
                      : 'bg-card border border-card-border text-body-copy'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="px-[22px] pt-4 space-y-2.5">
          {segment === 'guides' && (
            !isDataLoaded && myGuides.length === 0 ? (
              [...Array(4)].map((_, i) => <div key={i} className="h-[70px] rounded-lg bg-blush/60 animate-pulse" />)
            ) : myGuides.length === 0 ? (
              <EmptyState
                line={
                  searchTerm
                    ? `Nothing matches “${searchTerm}”.`
                    : chip === 'Pinned'
                      ? 'Nothing pinned yet.'
                      : 'Write your first guide.'
                }
                actionLabel={searchTerm ? null : chip === 'Pinned' ? 'See all guides' : 'Start with one thing'}
                onAction={() => (chip === 'Pinned' ? setChip('All') : navigate('/guide/new'))}
              />
            ) : (
              myGuides.map((g) => (
                <GuideRow key={g.id} guide={g} onClick={() => navigate(`/guide/${g.id}`)} />
              ))
            )
          )}

          {segment === 'bundles' && (
            bundles.length === 0 ? (
              <EmptyState
                line={searchTerm ? `Nothing matches “${searchTerm}”.` : 'Group guides into a bundle.'}
                actionLabel={searchTerm ? null : 'New bundle'}
                onAction={() => navigate('/bundles/create')}
              />
            ) : (
              <>
                {bundles.map((b) => (
                  <div
                    key={b.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/bundle/${b.id}`)}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/bundle/${b.id}`)}
                    className="bg-card rounded-lg border border-card-border shadow-card overflow-hidden cursor-pointer transition-all hover:border-hover-border hover:-translate-y-px"
                  >
                    <div className="h-[34px] flex items-center px-3.5" style={{ background: b.color || '#C25065' }}><BundleGlyph size={16} /></div>
                    <div className="px-4 py-3.5">
                      <div className="font-bold text-[17px] text-mulberry dark:text-foreground truncate">
                        {b.name}
                      </div>
                      <div className="text-[13.5px] text-muted-copy mt-0.5">
                        {b.guide_count ?? 0} {b.guide_count === 1 ? 'guide' : 'guides'}
                        {b.is_shared_with_me && ' · Shared with you'}
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => navigate('/bundles/create')}
                  className="w-full h-11 rounded-full border-[1.5px] border-raspberry text-raspberry font-bold text-[15px] flex items-center justify-center gap-1.5"
                >
                  <Plus size={16} strokeWidth={2.6} /> New bundle
                </button>
              </>
            )
          )}

          {segment === 'library' && (
            libraryGuides.length === 0 ? (
              <EmptyState line={searchTerm ? `Nothing matches “${searchTerm}”.` : 'You’ve added everything here.'} />
            ) : (
              libraryGuides.map((g) => (
                <GuideRow
                  key={g.id}
                  guide={g}
                  onClick={() => navigate(`/library/guide/${g.id}`)}
                  right={
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddGuideFromLibrary(g);
                      }}
                      className="flex-shrink-0 h-9 px-4 rounded-full bg-raspberry hover:bg-raspberry-hover text-cream font-bold text-[13px]"
                    >
                      Add
                    </button>
                  }
                />
              ))
            )
          )}
        </div>
      </motion.div>
    </>
  );
};

export default GuidesLibrary;

import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useData } from '@/contexts/DataContext';
import { humanizeExpiry, isExpired } from '@/lib/shareExpiry';
import { useToast } from '@/components/ui/use-toast';
import HeartMark from '@/components/HeartMark';
import { FAMILY_SHARING_ENABLED, SHARE_TAB_MANAGE_ENABLED } from '@/lib/featureFlags';

/**
 * The Share tab — "Your team". Everyone sees only what you share.
 *
 * v1 surfaces what the data model actually supports today:
 *  - the family members you've invited (accepted invitations), with roles
 *  - every LIVE share link, with one-tap revoke (owner delete policy)
 *  - the door into sharing a bundle
 * Per-person visibility subsets and timed links are follow-ups; nothing here
 * pretends otherwise.
 */

const AVATAR_COLORS = ['bg-mulberry', 'bg-raspberry', 'bg-apricot'];

const SectionLabel = ({ children }) => (
  <div className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-raspberry mb-3">
    {children}
  </div>
);

const ShareCenterScreen = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { allGuides, allBundles } = useData();
  const [members, setMembers] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null); // invitation id
  const [grants, setGrants] = useState([]);           // selected member's grants
  const [grantsLoading, setGrantsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user?.id) return;
      try {
        const [membersRes, linksRes] = await Promise.all([
          FAMILY_SHARING_ENABLED
            ? supabase
                .from('family_invitations')
                .select('id, invited_email, invited_name, role, status')
                .eq('owner_user_id', user.id)
                .in('status', ['pending', 'accepted'])
            : Promise.resolve({ data: [] }),
          supabase
            .from('shared_links')
            .select('id, created_at, expires_at, guide_id, bundle_id, guides(name), packs(name)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
        ]);
        if (!cancelled) {
          setMembers(membersRes.data || []);
          setLinks(linksRes.data || []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  const selectedMember = useMemo(
    () => members.find((m) => m.id === selectedId) || null,
    [members, selectedId]
  );

  // Load the selected member's grants
  useEffect(() => {
    let cancelled = false;
    if (!selectedId) { setGrants([]); return; }
    setGrantsLoading(true);
    supabase
      .from('share_grants')
      .select('id, guide_id, bundle_id')
      .eq('invitation_id', selectedId)
      .then(({ data }) => {
        if (!cancelled) { setGrants(data || []); setGrantsLoading(false); }
      });
    return () => { cancelled = true; };
  }, [selectedId]);

  const myGuides = useMemo(() => (allGuides || []).filter((g) => !g.is_shared_with_me), [allGuides]);
  const myBundles = useMemo(() => (allBundles || []).filter((b) => !b.is_shared_with_me), [allBundles]);

  const grantedGuideIds = useMemo(() => new Set(grants.filter((g) => g.guide_id).map((g) => g.guide_id)), [grants]);
  const grantedBundleIds = useMemo(() => new Set(grants.filter((g) => g.bundle_id).map((g) => g.bundle_id)), [grants]);

  const toggleGrant = async (kind, itemId) => {
    if (!selectedMember) return;
    const isGranted = kind === 'guide' ? grantedGuideIds.has(itemId) : grantedBundleIds.has(itemId);
    if (isGranted) {
      const existing = grants.find((g) => (kind === 'guide' ? g.guide_id === itemId : g.bundle_id === itemId));
      setGrants((prev) => prev.filter((g) => g.id !== existing.id)); // optimistic
      const { error } = await supabase.from('share_grants').delete().eq('id', existing.id);
      if (error) {
        setGrants((prev) => [...prev, existing]);
        toast({ title: 'Could not update', description: 'Please try again.', variant: 'destructive' });
      }
    } else {
      const optimistic = { id: `tmp-${itemId}`, guide_id: kind === 'guide' ? itemId : null, bundle_id: kind === 'bundle' ? itemId : null };
      setGrants((prev) => [...prev, optimistic]); // optimistic
      const { data, error } = await supabase
        .from('share_grants')
        .insert({
          owner_user_id: user.id,
          invitation_id: selectedMember.id,
          guide_id: kind === 'guide' ? itemId : null,
          bundle_id: kind === 'bundle' ? itemId : null,
        })
        .select('id, guide_id, bundle_id')
        .single();
      if (error) {
        setGrants((prev) => prev.filter((g) => g.id !== optimistic.id));
        toast({ title: 'Could not update', description: 'Please try again.', variant: 'destructive' });
      } else {
        setGrants((prev) => prev.map((g) => (g.id === optimistic.id ? data : g)));
      }
    }
  };

  const liveLinks = useMemo(
    () => links.map((l) => ({
      ...l,
      label: l.packs?.name || l.guides?.name || 'Shared item',
      kind: l.bundle_id ? 'Bundle' : 'Guide',
    })),
    [links]
  );

  const revokeLink = async (linkId) => {
    const prev = links;
    setLinks(links.filter((l) => l.id !== linkId)); // optimistic
    const { error } = await supabase.from('shared_links').delete().eq('id', linkId);
    if (error) {
      setLinks(prev);
      toast({ title: 'Could not turn the link off', description: 'Please try again.', variant: 'destructive' });
    } else {
      toast({ title: 'Link turned off', description: 'That link no longer works for anyone.' });
    }
  };

  return (
    <>
      <Helmet>
        <title>Share - Family Playbook</title>
      </Helmet>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="min-h-screen bg-cream dark:bg-background px-[22px] pt-[58px] pb-32"
      >
        <h1 className="font-display font-semibold text-[29px] leading-[1.15] text-mulberry dark:text-foreground">
          Your team
        </h1>
        <p className="mt-1 text-[14.5px] text-muted-copy">Everyone sees only what you share.</p>

        {/* Family members (avatar row) */}
        {FAMILY_SHARING_ENABLED && (
          <div className="mt-7">
            {SHARE_TAB_MANAGE_ENABLED ? (
              <div className="flex items-center justify-between">
                <SectionLabel>Family & helpers</SectionLabel>
                <button
                  onClick={() => navigate('/account/family')}
                  className="text-[13px] font-bold text-raspberry mb-3"
                >
                  Manage
                </button>
              </div>
            ) : (
              <SectionLabel>Family & helpers</SectionLabel>
            )}
            <div className="-mx-[22px] px-[22px] flex gap-[18px] overflow-x-auto scrollbar-hide items-start">
              {members.map((m, i) => (
                <button
                  key={m.id}
                  onClick={() => m.status === 'accepted' && setSelectedId(selectedId === m.id ? null : m.id)}
                  className="flex flex-col items-center flex-shrink-0 w-[64px]"
                >
                  <div
                    className={`w-[56px] h-[56px] rounded-full ${AVATAR_COLORS[i % AVATAR_COLORS.length]} text-cream flex items-center justify-center font-bold text-[20px] ${m.status === 'pending' ? 'opacity-50' : ''}`}
                    style={selectedId === m.id ? { boxShadow: '0 0 0 3px #FDF8F3, 0 0 0 5px #C25065' } : undefined}
                  >
                    {((m.invited_name || m.invited_email || '?')[0]).toUpperCase()}
                  </div>
                  <div className="mt-1.5 text-[12.5px] font-semibold text-body-copy truncate w-full text-center">
                    {m.invited_name || (m.invited_email || '').split('@')[0]}
                  </div>
                  <div className="text-[10.5px] text-muted-copy capitalize">
                    {m.status === 'pending' ? 'invited' : m.role}
                  </div>
                </button>
              ))}
              <button
                onClick={() => navigate('/account/family')}
                className="flex flex-col items-center flex-shrink-0 w-[64px]"
              >
                <div className="w-[56px] h-[56px] rounded-full border-2 border-dashed border-raspberry text-raspberry flex items-center justify-center font-bold text-[22px]">
                  +
                </div>
                <div className="mt-1.5 text-[12.5px] font-semibold text-raspberry">Invite</div>
              </button>
            </div>
          </div>
        )}

        {/* Selected person: what they can see */}
        {selectedMember && (
          <div className="mt-6 bg-card rounded-lg border border-card-border shadow-card p-5">
            <div className="font-bold text-[16px] text-mulberry dark:text-foreground mb-1">
              {(selectedMember.invited_name || selectedMember.invited_email)} can see
            </div>
            {selectedMember.role === 'editor' ? (
              <p className="text-[14px] text-body-copy dark:text-muted-foreground">
                Everything — {(selectedMember.invited_name || 'they').split(' ')[0]} is an editor and can
                also help write guides. To change that, remove them and re-invite as a viewer.
              </p>
            ) : grantsLoading ? (
              <div className="space-y-2 mt-2">
                {[...Array(3)].map((_, i) => <div key={i} className="h-9 rounded-lg bg-blush/60 animate-pulse" />)}
              </div>
            ) : (
              <>
                <p className="text-[13px] text-muted-copy mb-3">
                  Tick what they should see. Bundles include their guides.
                </p>
                {myBundles.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-raspberry mb-1.5">Bundles</div>
                    {myBundles.map((b) => (
                      <label key={b.id} className="flex items-center gap-3 py-2 border-b border-row-divider last:border-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={grantedBundleIds.has(b.id)}
                          onChange={() => toggleGrant('bundle', b.id)}
                          className="w-5 h-5 accent-[#C25065] rounded"
                        />
                        <span className="text-[14.5px] font-semibold text-mulberry dark:text-foreground truncate">{b.name}</span>
                      </label>
                    ))}
                  </div>
                )}
                <div>
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-raspberry mb-1.5">Guides</div>
                  {myGuides.map((g) => (
                    <label key={g.id} className="flex items-center gap-3 py-2 border-b border-row-divider last:border-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={grantedGuideIds.has(g.id)}
                        onChange={() => toggleGrant('guide', g.id)}
                        className="w-5 h-5 accent-[#C25065] rounded"
                      />
                      <span className="text-[14.5px] font-semibold text-mulberry dark:text-foreground truncate">{g.name}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
            <button
              onClick={() => navigate('/account/family')}
              className="mt-4 text-[13.5px] font-bold text-coral"
            >
              Remove {(selectedMember.invited_name || 'this person').split(' ')[0]}…
            </button>
          </div>
        )}

        {/* Live links */}
        <div className="mt-8">
          <SectionLabel>Live links</SectionLabel>
          {loading ? (
            <div className="space-y-2.5">
              {[...Array(2)].map((_, i) => <div key={i} className="h-[64px] rounded-lg bg-blush/60 animate-pulse" />)}
            </div>
          ) : liveLinks.length === 0 ? (
            <div className="bg-card rounded-lg border border-card-border p-6 text-center">
              <div className="flex justify-center mb-3">
                <HeartMark size={40} stroke="#D8B9C4" />
              </div>
              <p className="font-display font-semibold text-[17px] text-mulberry dark:text-foreground">
                Nothing shared yet.
              </p>
              <p className="mt-1 text-[13.5px] text-muted-copy">
                Share a guide or a bundle and the link shows up here.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {liveLinks.map((l) => (
                <div
                  key={l.id}
                  className="bg-card rounded-lg border border-card-border shadow-card px-4 py-3.5 flex items-center gap-3"
                >
                  <button
                    onClick={() => navigate(`/share-manage/${l.id}`)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="font-bold text-[15.5px] text-mulberry dark:text-foreground truncate">{l.label}</div>
                    <div className={`text-[12.5px] ${isExpired(l.expires_at) ? 'text-chevron' : 'text-muted-copy'}`}>
                      {l.kind} · {isExpired(l.expires_at)
                        ? 'ended'
                        : humanizeExpiry(l.expires_at)}
                    </div>
                  </button>
                  <button
                    onClick={() => revokeLink(l.id)}
                    className="flex-shrink-0 text-[13px] font-bold text-raspberry"
                  >
                    Turn off
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Share CTA */}
        <button
          onClick={() => navigate('/guides?segment=bundles')}
          className="mt-8 w-full h-12 rounded-full bg-raspberry hover:bg-raspberry-hover text-cream font-bold text-[15.5px] transition-colors"
        >
          Share a bundle
        </button>
        <p className="mt-2.5 text-center text-[13px] text-muted-copy">
          No app, no account needed on their end.
        </p>
      </motion.div>
    </>
  );
};

export default ShareCenterScreen;

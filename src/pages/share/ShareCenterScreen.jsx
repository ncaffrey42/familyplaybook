import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import HeartMark from '@/components/HeartMark';
import { FAMILY_SHARING_ENABLED } from '@/lib/featureFlags';

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
  const [members, setMembers] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);

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
            .select('id, created_at, guide_id, bundle_id, guides(name), packs(name)')
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
            <SectionLabel>Family & helpers</SectionLabel>
            <div className="-mx-[22px] px-[22px] flex gap-[18px] overflow-x-auto scrollbar-hide items-start">
              {members.map((m, i) => (
                <div key={m.id} className="flex flex-col items-center flex-shrink-0 w-[64px]">
                  <div
                    className={`w-[56px] h-[56px] rounded-full ${AVATAR_COLORS[i % AVATAR_COLORS.length]} text-cream flex items-center justify-center font-bold text-[20px] ${m.status === 'pending' ? 'opacity-50' : ''}`}
                  >
                    {((m.invited_name || m.invited_email || '?')[0]).toUpperCase()}
                  </div>
                  <div className="mt-1.5 text-[12.5px] font-semibold text-body-copy truncate w-full text-center">
                    {m.invited_name || (m.invited_email || '').split('@')[0]}
                  </div>
                  <div className="text-[10.5px] text-muted-copy capitalize">
                    {m.status === 'pending' ? 'invited' : m.role}
                  </div>
                </div>
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
                    <div className="text-[12.5px] text-muted-copy">
                      {l.kind} · live since {new Date(l.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
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

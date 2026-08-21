import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Helmet } from 'react-helmet';
import { logError } from '@/lib/errorLogger';
import { Button } from '@/components/ui/button';
import { Lock, ShieldOff, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import HeartMark from '@/components/HeartMark';
import GuideIcon from '@/components/GuideIcon';
import { isVideoUrl } from '@/lib/utils';
import { windowLabel, describeWindow } from '@/lib/shareWindows';
import { loadProgress, saveProgress, pruneProgress } from '@/lib/checklistProgress';

/**
 * Helper mode — the read-only guest view of a shared guide or bundle.
 * A deliberately different surface: no tab bar, no FAB, nothing editable.
 * Check state stays on the guest's own device (localStorage, today only) and
 * never writes to the owner's data.
 * Content resolves through the get_shared_content SECURITY DEFINER RPC.
 */

const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-screen bg-cream">
    <HeartMark size={56} stroke="#D8B9C4" className="animate-pulse" />
  </div>
);

const ErrorDisplay = ({ icon: Icon, title, message }) => (
  <div className="flex flex-col items-center justify-center h-screen bg-cream text-center p-6">
    <Icon size={56} className="text-raspberry mb-4" />
    <h1 className="font-display font-semibold text-[27px] text-mulberry mb-2">{title}</h1>
    <p className="text-[15px] text-body-copy mb-6 max-w-sm">{message}</p>
    <Button asChild className="bg-raspberry hover:bg-raspberry-hover text-cream rounded-full font-bold">
      <Link to="/">Go to Homepage</Link>
    </Button>
  </div>
);

const StepMedia = ({ url }) => {
  if (!url) return null;
  const isVideo = isVideoUrl(url);
  return (
    <div className="mt-4 rounded-lg overflow-hidden">
      {isVideo ? (
        <video src={url} controls className="w-full h-auto" />
      ) : (
        <img src={url} alt="Step media" className="w-full h-auto object-cover" />
      )}
    </div>
  );
};

const HelperHeader = ({ title, subtitle, share }) => (
  <header className="bg-mulberry px-6 pt-14 pb-8">
    <div className="max-w-2xl mx-auto">
      <HeartMark size={34} stroke="#FDF8F3" />
      <div className="mt-4 text-[10.5px] font-bold uppercase tracking-[0.13em] text-apricot">
        {windowLabel(share)}
      </div>
      <h1 className="font-display font-semibold text-[30px] leading-[1.15] text-cream mt-1">
        {title}
      </h1>
      {subtitle && (
        <p className="text-[14.5px] mt-1.5" style={{ color: 'rgba(253,248,243,.7)' }}>
          {subtitle}
        </p>
      )}
    </div>
  </header>
);

const PublicSharePage = () => {
  const { shareId } = useParams();
  const [guide, setGuide] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [bundleGuides, setBundleGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [share, setShare] = useState(null);
  // Helper-mode check state: this device, today. Never sent anywhere.
  const [checked, setChecked] = useState(() => loadProgress(`share:${shareId}`));

  useEffect(() => { pruneProgress(); }, []);

  useEffect(() => {
    saveProgress(`share:${shareId}`, checked);
  }, [shareId, checked]);

  useEffect(() => {
    const fetchSharedContent = async () => {
      if (!shareId) {
        setError({ type: 'not_found' });
        setLoading(false);
        return;
      }
      try {
        const { data, error: rpcError } = await supabase
          .rpc('get_shared_content', { p_share_id: shareId });
        if (rpcError) throw rpcError;
        if (!data) throw new Error('Share link not found');
        if (data.type === 'private') {
          setError({ type: 'not_shareable' });
          setLoading(false);
          return;
        }
        if (data.type === 'expired') {
          setError({ type: 'expired' });
          setLoading(false);
          return;
        }
        setShare(data.share || null);
        if (data.type === 'guide') {
          setGuide(data.guide);
          if (data.bundle) setBundle(data.bundle);
        } else if (data.type === 'bundle') {
          setBundle(data.bundle);
          setBundleGuides(data.bundle_guides || []);
        } else {
          throw new Error('Empty share link');
        }
      } catch (err) {
        logError(err, { context: 'PublicSharePage', shareId });
        setError({ type: 'not_found' });
      } finally {
        setLoading(false);
      }
    };
    fetchSharedContent();
  }, [shareId]);

  // Emergency-category guides lead the list; everything else keeps its order.
  const orderedBundleGuides = useMemo(() => {
    const list = bundleGuides.filter((g) => g.id !== guide?.id);
    return [
      ...list.filter((g) => g.category === 'Emergency'),
      ...list.filter((g) => g.category !== 'Emergency'),
    ];
  }, [bundleGuides, guide]);

  if (loading) return <LoadingSpinner />;
  if (error?.type === 'not_found')
    return <ErrorDisplay icon={Lock} title="Link not found" message="This share link is either invalid or has been turned off." />;
  if (error?.type === 'not_shareable')
    return <ErrorDisplay icon={ShieldOff} title="This guide is private" message="The owner hasn't made this guide shareable." />;
  if (error?.type === 'expired')
    return <ErrorDisplay icon={Clock} title="This link has closed" message="It was shared for a set amount of time, and that time has passed. Ask the family for a fresh link." />;
  if (!guide && !bundle)
    return <ErrorDisplay icon={Lock} title="Link not found" message="This share link is either invalid or has been turned off." />;

  const displayItem = guide || bundle;
  const pageTitle = displayItem.name;
  const ogDescription = displayItem.description || 'View the shared content.';
  const steps = Array.isArray(guide?.steps) ? guide.steps : [];
  const doneCount = steps.filter((_, i) => checked.includes(i)).length;

  const toggle = (i) =>
    setChecked((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  return (
    <>
      <Helmet>
        <title>{`Shared: ${pageTitle}`}</title>
        <meta name="description" content={ogDescription} />
        <meta property="og:title" content={`Shared: ${pageTitle}`} />
        <meta property="og:description" content={ogDescription} />
      </Helmet>
      <div className="min-h-screen bg-cream font-sans">
        <HelperHeader
          title={pageTitle}
          subtitle={guide && bundle ? `From the bundle: ${bundle.name}` : bundle?.description || guide?.category}
          share={share}
        />

        <main className="px-6 py-6 max-w-2xl mx-auto">
          {/* Guide view: intro + big step cards + progress */}
          {guide && (
            <>
              {steps.length > 0 && (
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex-1 h-2 bg-meter-track rounded-full overflow-hidden">
                    <div
                      className="h-full bg-raspberry rounded-full"
                      style={{ width: `${steps.length ? (doneCount / steps.length) * 100 : 0}%`, transition: 'width .3s ease' }}
                    />
                  </div>
                  <span className="text-[14px] font-bold text-muted-copy flex-shrink-0">
                    {doneCount} of {steps.length}
                  </span>
                </div>
              )}

              {displayItem.description && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-blush rounded-lg p-5 mb-5"
                >
                  <p className="text-[17px] leading-[1.6] whitespace-pre-wrap" style={{ color: '#7A4A38' }}>
                    {displayItem.description}
                  </p>
                </motion.div>
              )}

              {steps.length > 0 && (
                <div className="space-y-3">
                  {steps.map((step, index) => {
                    const isDone = checked.includes(index);
                    return (
                      <div
                        key={index}
                        onClick={() => toggle(index)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && toggle(index)}
                        className={`bg-card rounded-2xl border border-card-border shadow-card p-5 min-h-[68px] cursor-pointer transition-colors ${isDone ? 'bg-cream' : ''}`}
                      >
                        <div className="flex items-start gap-4">
                          <span
                            className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 transition-colors ${
                              isDone ? 'bg-raspberry' : 'border-2 border-checkbox-ring'
                            }`}
                          >
                            {isDone && (
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M3 8.5L6.5 12L13 5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          <div className="flex-1 min-w-0">
                            <h3 className={`font-display font-semibold text-[20px] leading-[1.25] ${isDone ? 'text-muted-copy line-through' : 'text-mulberry'}`}>
                              {step.title}
                            </h3>
                            {step.content && (
                              <p className={`text-[16.5px] leading-[1.6] mt-1 ${isDone ? 'text-muted-copy' : ''}`} style={isDone ? {} : { color: '#5E3D4C' }}>
                                {step.content}
                              </p>
                            )}
                            <StepMedia url={step.mediaUrl} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {steps.length > 0 && doneCount === steps.length && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mt-5 bg-blush rounded-lg p-6 text-center"
                >
                  <h3 className="font-display font-semibold text-[21px] text-mulberry">All done.</h3>
                  <p className="text-[14.5px] mt-1 text-blush-copy">Nice work — that's everything on this one.</p>
                </motion.div>
              )}
            </>
          )}

          {/* Bundle view: big rows, emergency first */}
          {bundle && orderedBundleGuides.length > 0 && (
            <div className="mt-1">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-raspberry mb-3">
                In order
              </div>
              <div className="flex flex-col gap-3">
                {orderedBundleGuides.map((g) => (
                  <Link to={`/share/${g.shareId}`} key={g.id}>
                    <div
                      className={`bg-card rounded-2xl border shadow-card p-4 min-h-[68px] flex items-center gap-4 transition-all hover:border-hover-border hover:-translate-y-px ${
                        g.category === 'Emergency' ? 'bg-emergency-bg border-coral/30' : 'border-card-border'
                      }`}
                    >
                      <GuideIcon category={g.category} size={48} glyph={22} />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-display font-semibold text-[19px] text-mulberry truncate">{g.name}</h3>
                        <p className="text-[14.5px] text-muted-copy">{g.category}</p>
                      </div>
                      <span className="text-chevron text-xl">›</span>
                    </div>
                  </Link>
                ))}
              </div>

              <div className="mt-6 bg-blush rounded-lg p-5">
                <p className="text-[14.5px] leading-[1.6] text-blush-copy">
                  You can't change anything in here, so tap freely.{' '}
                  {share?.expires_at
                    ? `This link closes itself ${describeWindow(share)}.`
                    : 'If this link stops working, the family turned it off.'}
                </p>
              </div>
            </div>
          )}
        </main>

        <footer className="mt-8 pb-12 px-6 text-center">
          <p className="text-[14px] text-muted-copy mb-4">Want to create your own family playbook?</p>
          <Button asChild className="bg-raspberry hover:bg-raspberry-hover text-cream rounded-full px-8 h-12 font-bold text-[15px]">
            <Link to="/">Get Started Free</Link>
          </Button>
        </footer>
      </div>
    </>
  );
};

export default PublicSharePage;

import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Helmet } from 'react-helmet';
import { logError } from '@/lib/errorLogger';
import { Button } from '@/components/ui/button';
import { ArrowRight, Lock, FileText, ShieldOff, Link as LinkIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import BundleImage from '@/components/BundleImage';
import GuideIcon from '@/components/GuideIcon';
import { isVideoUrl } from '@/lib/utils';

const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
    <div className="w-20 h-20 border-4 border-dashed rounded-full animate-spin border-purple-500"></div>
  </div>
);

const ErrorDisplay = ({ icon: Icon, title, message }) => (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-gray-950 text-center p-6">
        <Icon size={64} className="text-red-500 mb-4" />
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">{title}</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{message}</p>
        <Button asChild className="bg-purple-600 hover:bg-purple-700 text-white rounded-full">
            <Link to="/">Go to Homepage</Link>
        </Button>
    </div>
);

const StepMedia = ({ url }) => {
  if (!url) return null;
  const isVideo = isVideoUrl(url);
  return (
    <div className="mt-4 rounded-lg overflow-hidden shadow-sm">
      {isVideo ? (
        <video src={url} controls className="w-full h-auto" />
      ) : (
        <img src={url} alt="Step media" className="w-full h-auto object-cover" />
      )}
    </div>
  );
};

const PublicSharePage = () => {
    const { shareId } = useParams();
    const [guide, setGuide] = useState(null);
    const [bundle, setBundle] = useState(null);
    const [bundleGuides, setBundleGuides] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchSharedContent = async () => {
            if (!shareId) {
                setError({ type: 'not_found' });
                setLoading(false);
                return;
            }

            try {
                // Shared content is resolved through a single SECURITY DEFINER
                // RPC keyed by the exact (unguessable) share link id. RLS gives
                // anonymous visitors no direct read access to shared_links /
                // guides / packs, so this is the only door in.
                const { data, error: rpcError } = await supabase
                    .rpc('get_shared_content', { p_share_id: shareId });

                if (rpcError) throw rpcError;
                if (!data) throw new Error("Share link not found");

                if (data.type === 'private') {
                    setError({ type: 'not_shareable' });
                    setLoading(false);
                    return;
                }

                if (data.type === 'guide') {
                    setGuide(data.guide);
                    if (data.bundle) setBundle(data.bundle);
                } else if (data.type === 'bundle') {
                    setBundle(data.bundle);
                    setBundleGuides(data.bundle_guides || []);
                } else {
                    throw new Error("Empty share link");
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
    
    if (loading) return <LoadingSpinner />;
    if (error?.type === 'not_found') return <ErrorDisplay icon={Lock} title="Link Not Found" message="This share link is either invalid or has been disabled." />;
    if (error?.type === 'not_shareable') return <ErrorDisplay icon={ShieldOff} title="Guide Is Private" message="The owner has not made this guide public." />;
    if (!guide && !bundle) return <ErrorDisplay icon={Lock} title="Link Not Found" message="This share link is either invalid or has been disabled." />;
    
    const displayItem = guide || bundle;
    const pageTitle = displayItem.name;
    const ogDescription = displayItem.description || `View the shared content.`;

    return (
        <>
            <Helmet>
                <title>{`Shared: ${pageTitle}`}</title>
                <meta name="description" content={ogDescription} />
                <meta property="og:title" content={`Shared: ${pageTitle}`} />
                <meta property="og:description" content={ogDescription} />
            </Helmet>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-sans">
                <header className="p-6 bg-gradient-to-r from-purple-600 to-indigo-700 text-white">
                    <div className="max-w-4xl mx-auto">
                        {guide && bundle && (
                            <p className="text-sm opacity-80 mb-2">From the bundle: {bundle.name}</p>
                        )}
                        <div className="flex items-center gap-4">
                            {/* guide.icon stores a lucide icon NAME (e.g. "Utensils") —
                                render it through GuideIcon, never as raw text. */}
                            {guide ? (
                                <GuideIcon iconName={guide.icon} category={guide.category} size={32} className="w-16 h-16 bg-white/20 text-white shadow-soft" />
                            ) : (
                                <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center shadow-soft">
                                    <BundleImage imageUrl={bundle.image} bundleName={bundle.name} bundleColor={bundle.color} className="w-full h-full object-cover rounded-2xl" />
                                </div>
                            )}
                            <h1 className="text-3xl font-bold">{pageTitle}</h1>
                        </div>
                    </div>
                </header>

                <main className="p-6 max-w-4xl mx-auto">
                    {displayItem.description && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-md mb-8"
                        >
                            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{displayItem.description}</p>
                        </motion.div>
                    )}

                    {guide && guide.steps && guide.steps.length > 0 && (
                        <div className="space-y-4">
                            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Steps</h2>
                            {guide.steps.map((step, index) => (
                                <motion.div
                                    key={index}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                    className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-md"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="w-8 h-8 flex-shrink-0 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold mt-1">
                                            {index + 1}
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">{step.title}</h3>
                                            <p className="text-gray-600 dark:text-gray-300">{step.content}</p>
                                            <StepMedia url={step.mediaUrl} />
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}

                    {bundle && bundleGuides.length > 0 && (
                        <div className="mt-8">
                            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Guides in this Bundle</h2>
                            <div className="flex flex-col gap-3">
                                {bundleGuides.filter(g => g.id !== guide?.id).map((g, index) => (
                                    <Link to={`/share/${g.shareId}`} key={g.id}>
                                        <motion.div
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: index * 0.1 }}
                                            className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md flex items-center gap-4 hover:shadow-lg transition-shadow duration-300"
                                        >
                                            <GuideIcon iconName={g.icon} category={g.category} className="w-14 h-14 rounded-xl" />
                                            <div className="flex-1">
                                                <h3 className="font-semibold text-gray-800 dark:text-gray-200">{g.name}</h3>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">{g.category}</p>
                                            </div>
                                            <LinkIcon className="text-gray-400 dark:text-gray-500" size={20} />
                                        </motion.div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </main>
                
                <footer className="mt-12 p-6 text-center">
                    <p className="text-gray-500 dark:text-gray-400 mb-4">Want to create your own family playbook?</p>
                     <Button asChild size="lg" className="bg-purple-600 hover:bg-purple-700 text-white rounded-full px-8 py-3 transition-transform hover:scale-105">
                        <Link to="/">
                            Get Started Free <ArrowRight className="ml-2" size={20} />
                        </Link>
                    </Button>
                </footer>
            </div>
        </>
    );
};

export default PublicSharePage;
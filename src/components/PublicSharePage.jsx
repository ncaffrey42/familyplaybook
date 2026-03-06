import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { Helmet } from 'react-helmet';
import { logError } from '@/lib/errorLogger';
import { Button } from '@/components/ui/button';
import { ArrowRight, Lock, FileText, ShieldOff, Link as LinkIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import BundleImage from '@/components/BundleImage';

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
  const isVideo = ['.mp4', '.webm', '.mov'].some(ext => url.toLowerCase().includes(ext));
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
                const { data: shareData, error: shareError } = await supabase
                    .from('shared_links')
                    .select('guide_id, bundle_id')
                    .eq('id', shareId)
                    .single();

                if (shareError || !shareData) {
                    throw new Error("Share link not found");
                }
                
                const { guide_id, bundle_id } = shareData;
                
                let fetchedBundle;
                if (bundle_id) {
                    const { data: bundleData, error: bundleError } = await supabase
                        .from('packs')
                        .select('id, name, description, color, image')
                        .eq('id', bundle_id)
                        .single();
                    if (bundleError) throw new Error(`Bundle fetch error: ${bundleError.message}`);
                    setBundle(bundleData);
                    fetchedBundle = bundleData;
                    
                    const { data: guidesInBundle, error: guidesError } = await supabase
                        .from('pack_guides')
                        .select('guides(id, name, description, icon, category, is_shareable, shared_links(id))')
                        .eq('pack_id', bundle_id);

                    if (guidesError) throw guidesError;
                    
                    const guidesWithLinks = guidesInBundle
                      .map(item => ({...item.guides, shareId: item.guides.shared_links[0]?.id }))
                      .filter(g => g && g.is_shareable && g.shareId);
                    
                    setBundleGuides(guidesWithLinks);
                }

                if (guide_id) {
                    const { data: guideData, error: guideError } = await supabase
                        .from('guides')
                        .select('id, name, description, icon, steps, is_shareable, category')
                        .eq('id', guide_id)
                        .single();
                        
                    if (guideError) throw new Error(`Guide fetch error: ${guideError.message}`);
                    if (!guideData.is_shareable) {
                        setError({ type: 'not_shareable' });
                        setLoading(false);
                        return;
                    };
                    
                    setGuide(guideData);
                    
                    // If this guide is part of a bundle, also fetch bundle info
                    const { data: packGuide, error: pgError } = await supabase.from('pack_guides').select('pack_id').eq('guide_id', guide_id).maybeSingle();
                    if(pgError) throw pgError;
                    
                    if(packGuide && !fetchedBundle) {
                        const { data: bundleData, error: bundleError } = await supabase
                            .from('packs')
                            .select('id, name, description, color, image')
                            .eq('id', packGuide.pack_id)
                            .single();
                        if (bundleError) throw new Error(`Bundle fetch error for guide: ${bundleError.message}`);
                        setBundle(bundleData);
                    }
                }

                if (!guide_id && !bundle_id) {
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
                            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-4xl shadow-soft">
                                {guide ? guide.icon : <BundleImage imageUrl={bundle.image} bundleName={bundle.name} bundleColor={bundle.color} className="w-full h-full object-cover rounded-2xl" />}
                            </div>
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
                                            <div className="w-14 h-14 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-2xl flex-shrink-0">{g.icon}</div>
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
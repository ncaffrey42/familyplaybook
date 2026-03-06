import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom'; // Import useLocation
import QRCode from 'qrcode.react';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Download, Copy, Sparkles, Share2, Link as LinkIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { logError } from '@/lib/errorLogger';
import { useNavigation } from '@/hooks/useNavigation';
import PageHeader from '@/components/PageHeader';
import { Helmet } from 'react-helmet';

const ShareScreen = () => {
    const { shareId } = useParams();
    const location = useLocation(); // Get location object
    const handleNavigate = useNavigation();
    const { toast } = useToast();
    const [shareUrl, setShareUrl] = useState('');
    const [qrCodeData, setQrCodeData] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [content, setContent] = useState(null);

    const generateShareLink = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data: linkData, error: linkError } = await supabase
                .from('shared_links')
                .select('*, guides(*), packs(*)')
                .eq('id', shareId)
                .single();

            if (linkError) throw linkError;

            let sharedItem;
            if (linkData.guide_id && linkData.guides) {
                sharedItem = { type: 'Guide', name: linkData.guides.name };
            } else if (linkData.bundle_id && linkData.packs) {
                sharedItem = { type: 'Bundle', name: linkData.packs.name };
            }
            setContent(sharedItem);

            const url = `${window.location.origin}/share/${shareId}`;
            setShareUrl(url);
            setQrCodeData(url);
        } catch (error) {
            logError(error, { context: 'generateShareLink' });
            toast({ title: 'Error', description: 'Could not load share link details.', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }, [shareId, toast]);

    useEffect(() => {
        generateShareLink();
    }, [generateShareLink]);

    const handleCopyLink = () => {
        navigator.clipboard.writeText(shareUrl);
        toast({
            title: 'Copied to clipboard!',
            description: 'You can now share this link with anyone.',
        });
    };

    const downloadQRCode = () => {
        const canvas = document.getElementById('qr-code');
        if (!canvas) return;
        const pngUrl = canvas.toDataURL('image/png').replace('image/png', 'image/octet-stream');
        let downloadLink = document.createElement('a');
        downloadLink.href = pngUrl;
        downloadLink.download = `qrcode-share.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    };

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Check out this ${content?.type || 'item'}`,
                    text: `I'm sharing this ${content?.type || 'item'} with you: ${content?.name || ''}`,
                    url: shareUrl,
                });
                toast({ title: 'Shared successfully!' });
            } catch (error) {
                logError(error, { context: 'navigator.share' });
            }
        } else {
            handleCopyLink();
        }
    };
    
    const goBack = () => {
        // Check if we came from a specific guide detail page
        if (location.state?.fromGuideId) {
            handleNavigate('guideDetail', { guideId: location.state.fromGuideId });
        } else if (location.state?.fromBundleId) {
            // Fixed: use 'bundleDetail' instead of 'packDetail' to match useNavigation
            handleNavigate('bundleDetail', { bundleId: location.state.fromBundleId });
        }
        else {
            // Fallback to general guides list or history back
            handleNavigate('guides');
        }
    }

    return (
        <>
            <Helmet>
                <title>Share {content?.type || 'Item'} - Family Playbook</title>
                <meta name="description" content={`Share this ${content?.type || 'item'} with anyone using a link or QR code.`} />
            </Helmet>
            <div className="min-h-screen bg-[#FAF9F6] dark:bg-gray-950 pb-28">
                <div className="p-6">
                    <PageHeader onBack={goBack} />

                    <div className="text-center pt-4">
                        <motion.div
                            className="w-24 h-24 bg-gradient-to-br from-primary to-accent mx-auto rounded-3xl flex items-center justify-center text-white mb-6 shadow-lg"
                            animate={{ rotate: [0, 15, -10, 5, 0], scale: [1, 1.1, 1]}}
                            transition={{ repeat: Infinity, repeatDelay: 3, duration: 1 }}
                        >
                            <Share2 size={48} />
                        </motion.div>

                        {isLoading ? (
                             <div className="space-y-4 animate-pulse">
                                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-3/4 mx-auto"></div>
                                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-full mx-auto"></div>
                                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-1/2 mx-auto"></div>
                                <div className="pt-6">
                                    <div className="bg-gray-200 dark:bg-gray-700 rounded-2xl p-6 space-y-6">
                                        <div className="h-12 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
                                        <div className="flex justify-center">
                                            <div className="w-40 h-40 bg-gray-300 dark:bg-gray-600 rounded-xl"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <h1 className="text-3xl font-bold text-foreground">Share this {content?.type}</h1>
                                <p className="text-muted-foreground mt-2 mb-6 max-w-sm mx-auto">Anyone with this link will be able to view "{content?.name}".</p>
                                
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-white dark:bg-gray-800 rounded-2xl p-6 space-y-6 shadow-card"
                                >
                                    <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-900/50 p-2 rounded-full border border-gray-200 dark:border-gray-700">
                                        <LinkIcon className="text-muted-foreground ml-2" size={16} />
                                        <input
                                            type="text"
                                            value={shareUrl}
                                            readOnly
                                            className="w-full bg-transparent text-sm truncate focus:outline-none"
                                        />
                                        <Button onClick={handleCopyLink} size="sm" className="rounded-full flex-shrink-0">
                                            <Copy size={14} className="mr-2"/>
                                            Copy
                                        </Button>
                                    </div>
                                    
                                    <div className="flex justify-center p-4 bg-white rounded-xl">
                                        <QRCode id="qr-code" value={qrCodeData} size={160} level={'H'} includeMargin={true} />
                                    </div>
                                </motion.div>
                            </>
                        )}
                    </div>
                </div>

                 {!isLoading && (
                    <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#FAF9F6]/80 dark:bg-gray-950/80 backdrop-blur-sm border-t border-border z-10">
                        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                            <Button variant="outline" onClick={downloadQRCode} className="w-full h-12 text-base">
                                <Download size={18} className="mr-2" />
                                QR Code
                            </Button>
                            <Button onClick={handleShare} className="w-full h-12 text-base">
                                <Sparkles size={18} className="mr-2" />
                                Share
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default ShareScreen;
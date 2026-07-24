import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom'; // Import useLocation
import QRCode from 'qrcode.react';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { logError } from '@/lib/errorLogger';
import { useNavigation } from '@/hooks/useNavigation';
import HeartMark from '@/components/HeartMark';
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
                <title>Link ready - Family Playbook</title>
                <meta name="description" content="Share this link or QR code — no app or account needed on their end." />
            </Helmet>
            <div className="min-h-screen bg-cream dark:bg-background pb-28">
                <div className="px-[22px] pt-6">
                    <div className="flex justify-start">
                        <button onClick={goBack} className="text-[15px] font-bold text-muted-copy">Done</button>
                    </div>

                    <div className="text-center pt-6">
                        {isLoading ? (
                            <div className="space-y-4">
                                <div className="w-[52px] h-[52px] rounded-full bg-blush/60 animate-pulse mx-auto" />
                                <div className="h-7 bg-blush/60 animate-pulse rounded-lg w-3/4 mx-auto" />
                                <div className="h-[220px] bg-blush/60 animate-pulse rounded-2xl mt-6" />
                            </div>
                        ) : (
                            <>
                                <div className="flex justify-center mb-4">
                                    <HeartMark size={52} stroke="#C25065" />
                                </div>
                                <h1 className="font-display font-semibold text-[25px] text-mulberry dark:text-foreground">
                                    {content?.name ? `“${content.name}” is ready` : 'Link ready'}
                                </h1>
                                <p className="text-[13.5px] text-muted-copy mt-1">
                                    Anyone with the link can view it — share carefully.
                                </p>

                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="bg-card rounded-2xl border border-card-border shadow-card p-6 mt-6 space-y-5"
                                >
                                    <div className="flex justify-center">
                                        <div className="p-3 bg-white rounded-xl">
                                            <QRCode id="qr-code" value={qrCodeData} size={148} level={'H'} includeMargin={false} fgColor="#5C2A3E" />
                                        </div>
                                    </div>
                                    <div className="text-[13px] text-muted-copy break-all px-2">{shareUrl}</div>
                                </motion.div>

                                <div className="flex gap-2.5 mt-5">
                                    <button
                                        onClick={handleShare}
                                        className="flex-1 h-12 rounded-full bg-raspberry hover:bg-raspberry-hover text-cream font-bold text-[15px] transition-colors"
                                    >
                                        Send the link
                                    </button>
                                    <button
                                        onClick={handleCopyLink}
                                        className="h-12 px-6 rounded-full bg-blush text-blush-copy font-bold text-[15px]"
                                    >
                                        Copy
                                    </button>
                                </div>

                                <button
                                    onClick={() => window.open(shareUrl, '_blank')}
                                    className="mt-4 w-full bg-card rounded-lg border border-card-border shadow-card px-4 py-3.5 flex items-center justify-between text-left transition-all hover:border-hover-border"
                                >
                                    <span>
                                        <span className="block font-bold text-[15px] text-mulberry dark:text-foreground">See what they see</span>
                                        <span className="block text-[13px] text-muted-copy">Opens the shared view</span>
                                    </span>
                                    <span className="text-chevron">›</span>
                                </button>

                                <button
                                    onClick={downloadQRCode}
                                    className="mt-3 text-[13.5px] font-bold text-muted-copy"
                                >
                                    Save the QR code
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default ShareScreen;
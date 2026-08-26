import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom'; // Import useLocation
import QRCode from 'qrcode.react';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { logError } from '@/lib/errorLogger';
import { useNavigation } from '@/hooks/useNavigation';
import HeartMark from '@/components/HeartMark';
import {
  EXPIRY_PRESETS, computeExpiry, presetFromExpiry, humanizeExpiry,
  expiryFromDateInput, dateInputFromExpiry,
} from '@/lib/shareExpiry';
import { SHARE_EXPIRY_ENABLED, SHARE_LABELS_ENABLED } from '@/lib/featureFlags';
import { Helmet } from 'react-helmet';
import {
    SHARE_WINDOWS,
    SHARE_WINDOW_FOREVER,
    describeWindow,
    expiryForWindow,
    windowIdFor,
} from '@/lib/shareWindows';

const ShareScreen = () => {
    const { shareId } = useParams();
    const location = useLocation(); // Get location object
    const handleNavigate = useNavigation();
    const { toast } = useToast();
    const [shareUrl, setShareUrl] = useState('');
    const [qrCodeData, setQrCodeData] = useState('');
    const [expiresAt, setExpiresAt] = useState(null);
    const [savingExpiry, setSavingExpiry] = useState(false);
    // Undefined until the labels migration lands; '' keeps the input controlled.
    const [recipientLabel, setRecipientLabel] = useState('');
    const [savedLabel, setSavedLabel] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [content, setContent] = useState(null);
    const [recipient, setRecipient] = useState('');
    const [windowId, setWindowId] = useState(SHARE_WINDOW_FOREVER);
    // expiresAt is declared above — both branches added it independently.
    const [isSavingWindow, setIsSavingWindow] = useState(false);

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
            setExpiresAt(linkData.expires_at || null);
            setWindowId(windowIdFor(linkData.expires_at));
            // recipient_label, not recipient_name: 20240128 applied the former,
            // main's 20240116_timed_share_links (which added the latter) never
            // did and cannot, its number already being taken.
            setRecipientLabel(linkData.recipient_label || '');
            setSavedLabel(linkData.recipient_label || '');

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

    // Name + duration are one setting: "this link is Ana's, until midnight".
    // Saved through set_share_window so a bundle's window reaches the guide
    // links that bundle exposes.
    const saveWindow = useCallback(async (nextName, nextWindowId) => {
        const nextExpiry = expiryForWindow(nextWindowId);
        setIsSavingWindow(true);
        try {
            const { error } = await supabase.rpc('set_share_window', {
                p_share_id: shareId,
                p_recipient_name: nextName || null,
                p_expires_at: nextExpiry,
            });
            if (error) throw error;
            setExpiresAt(nextExpiry);
        } catch (error) {
            logError(error, { context: 'setShareWindow', shareId });
            toast({
                title: 'Could not update the link',
                description: 'It still works — try setting that again.',
                variant: 'destructive',
            });
        } finally {
            setIsSavingWindow(false);
        }
    }, [shareId, toast]);

    const handleWindowSelect = (id) => {
        setWindowId(id);
        saveWindow(recipient.trim(), id);
    };

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

    const firstName = recipient.trim().split(' ')[0];

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
                                    {firstName
                                        ? `${firstName}'s all set`
                                        : content?.name
                                            ? `“${content.name}” is ready`
                                            : 'Link ready'}
                                </h1>
                                <p className="text-[13.5px] text-muted-copy mt-1">
                                    {content?.name ? `${content.name} · ` : ''}
                                    live {describeWindow({ expires_at: expiresAt })}
                                </p>

                                {/* Who it's for, and for how long */}
                                <div className="bg-card rounded-2xl border border-card-border shadow-card p-5 mt-6 text-left">
                                    <label
                                        htmlFor="share-recipient"
                                        className="block text-[10.5px] font-bold uppercase tracking-[0.13em] text-raspberry"
                                    >
                                        Who's this for?
                                    </label>
                                    <input
                                        id="share-recipient"
                                        type="text"
                                        value={recipient}
                                        onChange={(e) => setRecipient(e.target.value)}
                                        onBlur={() => saveWindow(recipient.trim(), windowId)}
                                        placeholder="Ana"
                                        className="mt-2 w-full h-11 px-4 rounded-full bg-cream dark:bg-background border border-card-border text-[15px] text-mulberry dark:text-foreground placeholder:text-placeholder focus:outline-none focus:border-raspberry"
                                    />

                                    <div className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-raspberry mt-5">
                                        For how long
                                    </div>
                                    <div className="mt-2 space-y-2">
                                        {SHARE_WINDOWS.map((w) => {
                                            const selected = windowId === w.id;
                                            return (
                                                <button
                                                    key={w.id}
                                                    onClick={() => handleWindowSelect(w.id)}
                                                    disabled={isSavingWindow}
                                                    className={`w-full text-left rounded-lg px-4 py-3 border transition-colors disabled:opacity-60 ${
                                                        selected
                                                            ? 'bg-[#FDF3F5] dark:bg-raspberry/10 border-raspberry border-[1.5px]'
                                                            : 'bg-card border-card-border hover:border-hover-border'
                                                    }`}
                                                >
                                                    <div className="font-bold text-[15px] text-mulberry dark:text-foreground">
                                                        {w.label}
                                                    </div>
                                                    <div className="text-[13px] text-muted-copy">{w.hint}</div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="mt-3 text-[13px] text-muted-copy">
                                        A closed link stops opening for everyone — you can send a new one any time.
                                    </p>
                                </div>

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

                                {SHARE_EXPIRY_ENABLED && (
                                  <div className="mt-5 text-left">
                                    <div className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-raspberry mb-2">For how long</div>
                                    <div className="space-y-2">
                                      {EXPIRY_PRESETS.map((p) => {
                                        const selected =
                                          presetFromExpiry(expiresAt, new Date(), { allowCustom: SHARE_LABELS_ENABLED }) === p.key;
                                        return (
                                          <button
                                            key={p.key}
                                            disabled={savingExpiry}
                                            onClick={async () => {
                                              const next = computeExpiry(p.key);
                                              setSavingExpiry(true);
                                              const prev = expiresAt;
                                              setExpiresAt(next); // optimistic
                                              const { error } = await supabase.from('shared_links').update({ expires_at: next }).eq('id', shareId);
                                              if (error) { setExpiresAt(prev); toast({ title: 'Could not update', variant: 'destructive' }); }
                                              setSavingExpiry(false);
                                            }}
                                            className={`w-full rounded-lg border px-4 py-3 text-left transition-all ${
                                              selected ? 'bg-[#FDF3F5] border-raspberry' : 'bg-card border-card-border hover:border-hover-border'
                                            }`}
                                            style={selected ? { borderWidth: '1.5px' } : undefined}
                                          >
                                            <span className="block font-bold text-[14.5px] text-mulberry dark:text-foreground">{p.label}</span>
                                            <span className="block text-[12.5px] text-muted-copy">{p.detail}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                    {/* Host stays end on a date, not "tonight". */}
                                    {SHARE_LABELS_ENABLED && (
                                      <div className="mt-2">
                                        <label
                                          htmlFor="share-until-date"
                                          className="block text-[12.5px] font-semibold text-body-copy mb-1"
                                        >
                                          Or pick the last day
                                        </label>
                                        <input
                                          id="share-until-date"
                                          type="date"
                                          disabled={savingExpiry}
                                          value={
                                            presetFromExpiry(expiresAt, new Date(), { allowCustom: true }) === 'custom'
                                              ? dateInputFromExpiry(expiresAt)
                                              : ''
                                          }
                                          onChange={async (e) => {
                                            const next = expiryFromDateInput(e.target.value);
                                            if (!next) return;
                                            setSavingExpiry(true);
                                            const prev = expiresAt;
                                            setExpiresAt(next);
                                            const { error } = await supabase
                                              .from('shared_links')
                                              .update({ expires_at: next })
                                              .eq('id', shareId)
                                              .select('id');
                                            if (error) {
                                              setExpiresAt(prev);
                                              toast({ title: 'Could not update', variant: 'destructive' });
                                            }
                                            setSavingExpiry(false);
                                          }}
                                          className="w-full h-11 px-3 rounded-lg border border-card-border bg-card text-[14.5px] text-mulberry dark:text-foreground"
                                        />
                                      </div>
                                    )}
                                    <div className="mt-2 text-[12.5px] text-muted-copy text-center">
                                      This link {humanizeExpiry(expiresAt)}.
                                    </div>
                                  </div>
                                )}

                                {/* Who the link is for — the owner's own note. */}
                                {SHARE_LABELS_ENABLED && (
                                  <div className="mt-5 text-left">
                                    <label
                                      htmlFor="share-recipient-label"
                                      className="block text-[10.5px] font-bold uppercase tracking-[0.13em] text-raspberry mb-2"
                                    >
                                      Who is it for
                                    </label>
                                    <input
                                      id="share-recipient-label"
                                      type="text"
                                      maxLength={60}
                                      value={recipientLabel}
                                      placeholder="Sitter — Friday"
                                      onChange={(e) => setRecipientLabel(e.target.value)}
                                      onBlur={async () => {
                                        const next = recipientLabel.trim();
                                        if (next === savedLabel) return;
                                        const prev = savedLabel;
                                        setSavedLabel(next);
                                        const { error } = await supabase
                                          .from('shared_links')
                                          .update({ recipient_label: next || null })
                                          .eq('id', shareId)
                                          .select('id');
                                        if (error) {
                                          setSavedLabel(prev);
                                          setRecipientLabel(prev);
                                          toast({ title: 'Could not save the label', variant: 'destructive' });
                                        }
                                      }}
                                      className="w-full h-11 px-3 rounded-lg border border-card-border bg-card text-[14.5px] text-mulberry dark:text-foreground"
                                    />
                                    <p className="mt-1 text-[12.5px] text-muted-copy">
                                      Only you see this — it labels the link in your Share tab.
                                    </p>
                                  </div>
                                )}

                                <div className="flex gap-2.5 mt-5">
                                    <button
                                        onClick={handleShare}
                                        className="flex-1 h-12 rounded-full bg-raspberry hover:bg-raspberry-hover text-cream font-bold text-[15px] transition-colors"
                                    >
                                        {firstName ? `Text it to ${firstName}` : 'Send the link'}
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
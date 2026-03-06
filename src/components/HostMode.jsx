import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Wifi, Lock, EyeOff, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import QRCode from 'qrcode.react';
import { Helmet } from 'react-helmet';
import PageHeader from '@/components/PageHeader';

const HostMode = ({ onNavigate }) => {
    const { toast } = useToast();
    const [pin, setPin] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [isHostModeActive, setIsHostModeActive] = useState(false);

    const handleToggleHostMode = () => {
        if (!isHostModeActive && pin.length < 4) {
            toast({
                title: "Set a PIN",
                description: "Please set a 4-digit PIN to activate Host Mode.",
                variant: "destructive",
            });
            return;
        }
        setIsHostModeActive(!isHostModeActive);
        toast({
            title: `Host Mode ${!isHostModeActive ? 'Activated' : 'Deactivated'}`,
            description: !isHostModeActive ? "Guests can now access selected packs." : "Guest access has been turned off.",
        });
    };

    const hostModeUrl = `https://familyplaybook.app/host?pin=${pin}`;

    const siteUrl = "https://familyplaybook.app";
    const defaultImage = "https://horizons-cdn.hostinger.com/ffc35e06-ea36-451f-a031-de31af4f5e18/80f125d4a7ccd5e3527e55a703f6454a.png";

    return (
        <>
            <Helmet>
                <title>Host Mode - Family Playbook</title>
                <meta name="description" content="Activate Host Mode to give guests, babysitters, or family members access to specific guides without sharing your full account." />
                <meta property="og:title" content="Host Mode - Family Playbook" />
                <meta property="og:description" content="Activate Host Mode to give guests, babysitters, or family members access to specific guides without sharing your full account." />
                <meta property="og:image" content={defaultImage} />
                <meta property="og:url" content={`${siteUrl}/hostMode`} />
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="Host Mode - Family Playbook" />
                <meta name="twitter:description" content="Activate Host Mode to give guests, babysitters, or family members access to specific guides without sharing your full account." />
                <meta name="twitter:image" content={defaultImage} />
            </Helmet>
            <div className="min-h-screen bg-[#FAF9F6] dark:bg-gray-950 pb-24">
                <div className="p-6">
                    <PageHeader title="Host Mode" onBack={() => onNavigate('account')} />

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                    >
                        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-soft text-center">
                            <Wifi size={48} className="mx-auto text-[#5CA9E9] mb-4" />
                            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Welcome to Host Mode</h2>
                            <p className="text-gray-600 dark:text-gray-400 mt-2">
                                Give guests, babysitters, or family members access to specific guides without sharing your full account.
                            </p>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-soft">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="host-mode-toggle" className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                                    Activate Host Mode
                                </Label>
                                <Switch
                                    id="host-mode-toggle"
                                    checked={isHostModeActive}
                                    onCheckedChange={handleToggleHostMode}
                                />
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                                When active, anyone with the PIN can access designated packs.
                            </p>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-soft">
                            <Label htmlFor="pin-code" className="text-lg font-semibold text-gray-800 dark:text-gray-100">Set a 4-Digit PIN</Label>
                            <div className="relative mt-2">
                                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                                <Input
                                    id="pin-code"
                                    type={showPin ? 'text' : 'password'}
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                    placeholder="••••"
                                    maxLength="4"
                                    className="w-full h-14 pl-10 pr-12 text-2xl tracking-[1em] text-center"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                                    onClick={() => setShowPin(!showPin)}
                                >
                                    <EyeOff size={20} />
                                </Button>
                            </div>
                        </div>

                        {isHostModeActive && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-soft text-center"
                            >
                                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Share Access</h3>
                                <div className="flex justify-center mb-4">
                                    <div className="p-4 bg-white rounded-lg shadow-inner">
                                        <QRCode value={hostModeUrl} size={128} />
                                    </div>
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Scan this QR code or share the link to give access.</p>
                            </motion.div>
                        )}
                    </motion.div>
                </div>
            </div>
        </>
    );
};

export default HostMode;
import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Gem, Sparkles } from 'lucide-react';
import { useNavigation } from '@/hooks/useNavigation';

const SubscriptionCTA = () => {
    const handleNavigate = useNavigation();

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 p-6 text-white shadow-lg"
        >
            <div className="flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-full">
                    <Gem className="h-6 w-6 text-white" />
                </div>
                <div>
                    <h3 className="font-bold text-lg">Unlock Premium Features</h3>
                    <p className="text-sm opacity-80">Upgrade your plan for more powerful tools.</p>
                </div>
            </div>
            <ul className="my-4 space-y-2 text-sm">
                <li className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-yellow-300" />
                    <span>AI Assistant for creating guides</span>
                </li>
                <li className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-yellow-300" />
                    <span>Invite family members</span>
                </li>
                 <li className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-yellow-300" />
                    <span>Unlimited guides and packs</span>
                </li>
            </ul>
            <Button
                onClick={() => handleNavigate('subscription')}
                className="w-full bg-white text-purple-600 font-bold hover:bg-gray-100"
            >
                Upgrade Now
            </Button>
        </motion.div>
    );
};

export default SubscriptionCTA;
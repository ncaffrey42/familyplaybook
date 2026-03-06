import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Lock, Zap } from 'lucide-react';
import { useLimitNotification } from '@/contexts/LimitNotificationContext';
import { AnalyticsService } from '@/lib/AnalyticsService';

const MESSAGES = {
  LIMIT_ACTIVE_GUIDES: {
    title: "Guide Limit Reached",
    description: "You've reached the maximum number of active guides for your current plan.",
    icon: Lock
  },
  LIMIT_BUNDLES: {
    title: "Bundle Limit Reached",
    description: "You cannot create more bundles on this plan.",
    icon: Lock
  },
  LIMIT_ARCHIVED_GUIDES: {
    title: "Archive Limit Reached",
    description: "Your archive is full. Upgrade to store more guides.",
    icon: Lock
  },
  LIMIT_STORAGE: {
    title: "Storage Full",
    description: "You've used all your file storage space.",
    icon: AlertTriangle
  },
  LIMIT_EDITORS: {
    title: "Team Limit Reached",
    description: "You cannot invite more editors/family members.",
    icon: Lock
  },
  LIMIT_TEMPLATES: {
    title: "Premium Template",
    description: "This template is available on higher tier plans.",
    icon: Zap
  },
  DEFAULT: {
    title: "Limit Reached",
    description: "You've hit a limit on your current plan.",
    icon: AlertTriangle
  }
};

const LimitNotificationModal = () => {
  const { isOpen, notificationData, hideLimitNotification } = useLimitNotification();
  const navigate = useNavigate();
  const { reason_code, current, limit, upgrade_suggestion } = notificationData;

  const content = MESSAGES[reason_code] || MESSAGES.DEFAULT;
  const Icon = content.icon;

  const handleUpgrade = () => {
    AnalyticsService.track(AnalyticsService.events.UPGRADE_CTA_CLICKED, {
      source: 'limit_modal',
      reason: reason_code,
      suggestion: upgrade_suggestion
    });
    hideLimitNotification();
    // Redirect to upgrade flow
    navigate('/account/subscription', { state: { suggestion: upgrade_suggestion } });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && hideLimitNotification()}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900 border-red-100 dark:border-red-900/30">
        <DialogHeader className="flex flex-col items-center text-center gap-2">
          <div className="h-12 w-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-2">
            <Icon className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <DialogTitle className="text-xl">{content.title}</DialogTitle>
          <DialogDescription className="text-center pt-2">
            {content.description}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 my-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600 dark:text-gray-400">Current Usage</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{current} / {limit > 1000 ? '∞' : limit}</span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-red-500 rounded-full" 
              style={{ width: `${Math.min((current / (limit || 1)) * 100, 100)}%` }}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button 
            onClick={handleUpgrade} 
            className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold"
          >
            Upgrade to {upgrade_suggestion ? (upgrade_suggestion.charAt(0).toUpperCase() + upgrade_suggestion.slice(1)) : 'Premium'}
          </Button>
          <Button variant="ghost" onClick={hideLimitNotification} className="w-full">
            Not now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LimitNotificationModal;
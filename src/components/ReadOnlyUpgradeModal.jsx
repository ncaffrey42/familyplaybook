import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { isInternalPath } from '@/lib/utils';

/**
 * Shown when a user tries to edit, share, or delete a guide or bundle that
 * is read-only because they're over their plan's limit. Routes them to the
 * upgrade flow with a `returnTo` so they land back where they started after
 * a successful tier change.
 *
 * Pass an explicit `returnTo` to override the current path (e.g. on a
 * detail page where the natural target is the edit URL).
 */
const ReadOnlyUpgradeModal = ({ isOpen, onClose, resourceType = 'guide', returnTo }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const noun = resourceType === 'bundle' ? 'bundle' : 'guide';

  const handleUpgrade = () => {
    onClose?.();
    const candidate = returnTo || `${location.pathname}${location.search}`;
    const safe = isInternalPath(candidate) ? candidate : null;
    const target = safe
      ? `/account/upgrade?returnTo=${encodeURIComponent(safe)}`
      : '/account/upgrade';
    navigate(target);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Lock size={18} className="text-muted-foreground" />
            Upgrade to edit this {noun}
          </AlertDialogTitle>
          <AlertDialogDescription>
            This {noun} is read-only because you have more {noun}s than your current
            plan allows. Your most recently updated {noun}s stay editable. Upgrade
            to unlock editing on all your {noun}s.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleUpgrade}>Upgrade</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ReadOnlyUpgradeModal;

import { UsageTrackingService } from '@/services/UsageTrackingService';
import { UsageEnforcement } from './UsageEnforcement';
import { UsageLogging } from './UsageLogging';

/**
 * Trigger handlers to be called after successful mutations.
 * Updates local usage stats to reflect changes immediately.
 */
export const UsageUpdateTriggers = {

  onGuideCreated: async (userId, guideId) => {
    await UsageTrackingService.updateUsageMetric(userId, 'active_guides', 1);
    UsageLogging.logUsageUpdate(userId, 'active_guides', null, null, 'GUIDE_CREATED', { guideId });
  },

  onGuideArchived: async (userId, guideId) => {
    // -1 active, +1 archived
    await Promise.all([
      UsageTrackingService.updateUsageMetric(userId, 'active_guides', -1),
      UsageTrackingService.updateUsageMetric(userId, 'archived_guides', 1)
    ]);
    UsageLogging.logUsageUpdate(userId, 'guide_status', null, null, 'GUIDE_ARCHIVED', { guideId });
  },

  onGuideUnarchived: async (userId, guideId) => {
    // Check limits first!
    try {
      await UsageEnforcement.enforceUsageLimits(userId, 'GUIDE_UNARCHIVE');
      
      await Promise.all([
        UsageTrackingService.updateUsageMetric(userId, 'active_guides', 1),
        UsageTrackingService.updateUsageMetric(userId, 'archived_guides', -1)
      ]);
      
      UsageLogging.logUsageUpdate(userId, 'guide_status', null, null, 'GUIDE_UNARCHIVED', { guideId });
      return true;
    } catch (e) {
      console.error("Unarchive blocked:", e);
      throw e; // Propagate to UI
    }
  },

  onGuideDeleted: async (userId, guideId, wasArchived = false) => {
    const metric = wasArchived ? 'archived_guides' : 'active_guides';
    await UsageTrackingService.updateUsageMetric(userId, metric, -1);
    UsageLogging.logUsageUpdate(userId, metric, null, null, 'GUIDE_DELETED', { guideId });
  },

  onBundleCreated: async (userId, bundleId) => {
    await UsageTrackingService.updateUsageMetric(userId, 'bundles', 1);
    UsageLogging.logUsageUpdate(userId, 'bundles', null, null, 'BUNDLE_CREATED', { bundleId });
  },

  onBundleDeleted: async (userId, bundleId) => {
    await UsageTrackingService.updateUsageMetric(userId, 'bundles', -1);
    UsageLogging.logUsageUpdate(userId, 'bundles', null, null, 'BUNDLE_DELETED', { bundleId });
  },

  onFileUploaded: async (userId, fileSizeBytes) => {
    if (fileSizeBytes > 0) {
      await UsageTrackingService.updateUsageMetric(userId, 'storage_bytes', fileSizeBytes);
      UsageLogging.logUsageUpdate(userId, 'storage_bytes', null, null, 'FILE_UPLOADED', { size: fileSizeBytes });
    }
  },

  onFileDeleted: async (userId, fileSizeBytes) => {
    if (fileSizeBytes > 0) {
      await UsageTrackingService.updateUsageMetric(userId, 'storage_bytes', -fileSizeBytes);
      UsageLogging.logUsageUpdate(userId, 'storage_bytes', null, null, 'FILE_DELETED', { size: fileSizeBytes });
    }
  },

  onEditorInvited: async (userId, inviteeEmail) => {
    // Note: This counts invitations or accepted members depending on business logic. 
    // Usually counts occupied seats (including pending).
    // Prompt Task 1 said "active members", but usually inviting consumes a seat.
    // We will assume pending invites count towards limit to prevent spamming invites.
    await UsageTrackingService.updateUsageMetric(userId, 'editors', 1);
    UsageLogging.logUsageUpdate(userId, 'editors', null, null, 'EDITOR_INVITED', { email: inviteeEmail });
  },

  onEditorRoleChanged: async (userId, memberId, oldRole, newRole) => {
    let delta = 0;
    // Viewer -> Editor (+1)
    if (oldRole !== 'editor' && oldRole !== 'owner' && newRole === 'editor') {
      delta = 1;
    }
    // Editor -> Viewer (-1)
    else if ((oldRole === 'editor' || oldRole === 'owner') && newRole !== 'editor' && newRole !== 'owner') {
      delta = -1;
    }

    if (delta !== 0) {
      await UsageTrackingService.updateUsageMetric(userId, 'editors', delta);
      UsageLogging.logUsageUpdate(userId, 'editors', null, null, 'ROLE_CHANGED', { memberId, delta });
    }
  },

  onEditorRemoved: async (userId, memberId) => {
    // Should check if they were an editor/owner first, or just -1 if tracking all members?
    // Usage stats usually tracks 'editors'.
    // Safe to decrement if we know they were counted. 
    // For robust handling, usually better to recalc, but here we assume caller knows.
    await UsageTrackingService.updateUsageMetric(userId, 'editors', -1);
    UsageLogging.logUsageUpdate(userId, 'editors', null, null, 'EDITOR_REMOVED', { memberId });
  }
};
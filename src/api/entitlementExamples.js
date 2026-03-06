import { entitlementService } from '@/services/EntitlementService';
import { supabase } from '@/lib/supabaseClient';

/**
 * Example implementations of API-like functions using EntitlementService.
 * In a real backend, these would be edge functions or server routes.
 * Here they mimic the logic flow.
 */

// 1. CREATE GUIDE
export async function createGuideExample(userId, guideData) {
  const check = await entitlementService.canPerform(userId, 'GUIDE_CREATE');

  if (!check.allowed) {
    throw new Error(`Cannot create guide: ${check.reason_code}. Upgrade to ${check.upgrade_suggestion}`);
  }

  // Proceed with creation...
  const { data, error } = await supabase.from('guides').insert({ ...guideData, user_id: userId });
  if (error) throw error;
  
  // IMPORTANT: Update usage stats manually or via DB trigger
  // Trigger `handle_new_subscription_usage` handles init, but increment needs logic.
  // Ideally, use DB triggers to maintain user_usage counts accurately.
  
  return data;
}

// 2. ARCHIVE GUIDE
export async function archiveGuideExample(userId, guideId) {
  const check = await entitlementService.canPerform(userId, 'GUIDE_ARCHIVE');
  // Always allowed, but good practice to check
  
  if (check.allowed) {
    await supabase.from('guides').update({ is_archived: true, archived_at: new Date() }).eq('id', guideId);
  }
}

// 3. UNARCHIVE GUIDE
export async function unarchiveGuideExample(userId, guideId) {
  const check = await entitlementService.canPerform(userId, 'GUIDE_UNARCHIVE');
  
  if (!check.allowed) {
    return { error: 'Limit reached', reason: check.reason_code };
  }

  await supabase.from('guides').update({ is_archived: false }).eq('id', guideId);
  return { success: true };
}

// 4. CREATE BUNDLE
export async function createBundleExample(userId, bundleData) {
  const check = await entitlementService.canPerform(userId, 'BUNDLE_CREATE');

  if (!check.allowed) {
     return { error: 'Bundle limit reached' };
  }
  // Create bundle...
}

// 5. UPLOAD FILE
export async function uploadFileExample(userId, file) {
  // Payload needs file size
  const check = await entitlementService.canPerform(userId, 'FILE_UPLOAD', { 
    file_size_bytes: file.size 
  });

  if (!check.allowed) {
    throw new Error('Storage limit exceeded');
  }

  // Upload to storage bucket...
}

// 6. INVITE EDITOR
export async function inviteEditorExample(userId, guideId, inviteeEmail) {
  const check = await entitlementService.canPerform(userId, 'EDITOR_INVITE');

  if (!check.allowed) {
    if (check.reason_code === 'LIMIT_EDITORS') {
        throw new Error('You have reached the maximum number of editors for your plan.');
    }
    throw new Error('Action denied');
  }

  // Send invite...
}

// 7. CHANGE ROLE
export async function changeRoleExample(userId, memberId, newRole) {
  // Only matters if upgrading to editor
  const check = await entitlementService.canPerform(userId, 'EDITOR_ROLE_CHANGE', { new_role: newRole });

  if (!check.allowed) return { error: 'Cannot add another editor' };

  // Update role...
}

// 8. USE TEMPLATE
export async function useTemplateExample(userId, templateId, templateTier) {
  const check = await entitlementService.canPerform(userId, 'TEMPLATE_USE', { template_tier: templateTier });

  if (!check.allowed) {
     return { error: `This template requires the ${templateTier} plan` };
  }

  // Apply template...
}
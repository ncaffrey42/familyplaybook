import { UsageUpdateTriggers } from './UsageUpdateTriggers';
import { UsageEnforcement } from './UsageEnforcement';
import { supabase } from './supabaseClient';

/**
 * Example 1: Creating a Guide
 */
export const exampleCreateGuide = async (userId, guideData) => {
  try {
    // 1. Check permissions
    await UsageEnforcement.enforceUsageLimits(userId, 'GUIDE_CREATE');

    // 2. Perform DB Insert
    const { data, error } = await supabase.from('guides').insert(guideData).select().single();
    if (error) throw error;

    // 3. Trigger Usage Update
    await UsageUpdateTriggers.onGuideCreated(userId, data.id);

    return { success: true, guide: data };
  } catch (error) {
    console.error("Create Guide Failed:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Example 2: Archiving a Guide
 */
export const exampleArchiveGuide = async (userId, guideId) => {
  try {
    // Archive is always allowed usually, but good to have pattern
    await UsageEnforcement.enforceUsageLimits(userId, 'GUIDE_ARCHIVE');

    const { error } = await supabase.from('guides')
      .update({ is_archived: true, archived_at: new Date() })
      .eq('id', guideId);
    
    if (error) throw error;

    await UsageUpdateTriggers.onGuideArchived(userId, guideId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Example 3: Unarchiving a Guide
 */
export const exampleUnarchiveGuide = async (userId, guideId) => {
  try {
    // 1. Limit Check is CRITICAL here
    // This will throw if limit reached
    await UsageUpdateTriggers.onGuideUnarchived(userId, guideId); 

    // 2. If we passed the check above, proceed to update DB
    // Note: onGuideUnarchived in our implementation does BOTH check and update if successful?
    // Wait, typically triggers are called AFTER success.
    // However, for unarchive, we need to check BEFORE.
    // The implementation in UsageUpdateTriggers.js calls enforceUsageLimits.
    // BUT, usually we want to DB update first, then track.
    // For Unarchive, it's safer to Check -> Update DB -> Update Stats.
    
    // Let's refine the pattern:
    
    // A. Check
    await UsageEnforcement.enforceUsageLimits(userId, 'GUIDE_UNARCHIVE');

    // B. DB Update
    const { error } = await supabase.from('guides')
      .update({ is_archived: false, archived_at: null })
      .eq('id', guideId);

    if (error) throw error;

    // C. Stats Update (Direct, skipping the trigger's internal check if redundant, but safe to call)
    // Actually our trigger implementation `onGuideUnarchived` does a check. 
    // If we call it after DB update, the check might fail if we are at limit? 
    // No, because we just decremented archived and incremented active in DB? 
    // No, DB doesn't affect the 'user_usage' table automatically unless we have DB triggers.
    // We are doing app-level tracking.
    
    // So:
    await UsageUpdateTriggers.onGuideUnarchived(userId, guideId); 
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Example 4: File Upload
 */
export const exampleFileUpload = async (userId, file) => {
  try {
    const size = file.size;
    await UsageEnforcement.enforceUsageLimits(userId, 'FILE_UPLOAD', { file_size_bytes: size });

    // Mock upload
    const { data, error } = await supabase.storage.from('images').upload(`path/${file.name}`, file);
    if (error) throw error;

    await UsageUpdateTriggers.onFileUploaded(userId, size);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
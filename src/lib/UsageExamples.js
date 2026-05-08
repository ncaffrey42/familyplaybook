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
 * Example 2: File Upload
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
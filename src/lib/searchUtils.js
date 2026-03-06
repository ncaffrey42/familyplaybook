/**
 * Utility functions for searching through guides and bundles/packs.
 * Performs case-insensitive search across multiple fields.
 */

/**
 * Searches through an array of guides.
 * Checks: name, description, category, and step content (title/description/content).
 * 
 * @param {Array} guides - The array of guide objects to search.
 * @param {string} query - The search string.
 * @returns {Array} - The filtered array of guides.
 */
export const searchGuides = (guides, query) => {
  if (!guides || !Array.isArray(guides)) return [];
  if (!query) return guides;
  
  const lowerQuery = query.toLowerCase().trim();
  if (lowerQuery.length === 0) return guides;

  return guides.filter(guide => {
    // 1. Check top-level fields
    if (guide.name?.toLowerCase().includes(lowerQuery)) return true;
    if (guide.description?.toLowerCase().includes(lowerQuery)) return true;
    if (guide.category?.toLowerCase().includes(lowerQuery)) return true;

    // 2. Check steps (if available)
    if (guide.steps && Array.isArray(guide.steps)) {
      const hasMatchInSteps = guide.steps.some(step => {
        return (
          step.title?.toLowerCase().includes(lowerQuery) ||
          step.description?.toLowerCase().includes(lowerQuery) ||
          step.content?.toLowerCase().includes(lowerQuery)
        );
      });
      if (hasMatchInSteps) return true;
    }
    
    // 3. Check legacy or alternative content structure (sometimes content is the steps array)
    if (guide.content && Array.isArray(guide.content)) {
       const hasMatchInContent = guide.content.some(step => {
        return (
          step.title?.toLowerCase().includes(lowerQuery) ||
          step.description?.toLowerCase().includes(lowerQuery)
        );
      });
      if (hasMatchInContent) return true;
    }

    return false;
  });
};

/**
 * Searches through an array of bundles/packs.
 * Checks: name, description.
 * 
 * @param {Array} bundles - The array of bundle objects to search.
 * @param {string} query - The search string.
 * @returns {Array} - The filtered array of bundles.
 */
export const searchBundles = (bundles, query) => {
  if (!bundles || !Array.isArray(bundles)) return [];
  if (!query) return bundles;

  const lowerQuery = query.toLowerCase().trim();
  if (lowerQuery.length === 0) return bundles;

  return bundles.filter(bundle => {
    if (bundle.name?.toLowerCase().includes(lowerQuery)) return true;
    if (bundle.description?.toLowerCase().includes(lowerQuery)) return true;
    return false;
  });
};
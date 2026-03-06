import { supabase } from '@/lib/supabaseClient';

export const AnalyticsService = {
  /**
   * Track a distinct analytic event
   * @param {string} eventName 
   * @param {object} properties 
   */
  track: async (eventName, properties = {}) => {
    const timestamp = new Date().toISOString();
    const eventData = {
      event: eventName,
      properties,
      timestamp,
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    // Log to console in development
    if (import.meta.env.DEV) {
      console.groupCollapsed(`[Analytics] ${eventName}`);
      console.log(properties);
      console.groupEnd();
    }

    try {
      // Get current user if available (best effort)
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      if (userId) {
        // Log to audit_log_entries or a dedicated analytics table
        // Reusing audit_log_entries as per existing schema capabilities
        await supabase.from('audit_log_entries').insert({
            payload: eventData,
            ip_address: 'client-side', // Placeholder
            // If user_id column existed on audit_log_entries we would use it, 
            // but schema shows it might be linked via instance_id or implicit.
            // We'll store userId in payload.
        });
        
        // Also log to error_logs if it's a critical conversion event for redundancy? 
        // No, stick to one source.
      }
    } catch (error) {
      console.warn('Analytics tracking failed', error);
    }
  },

  events: {
    LIMIT_HIT_SHOWN: 'limit_hit_shown',
    UPGRADE_CTA_CLICKED: 'upgrade_cta_clicked',
    UPGRADE_STARTED: 'upgrade_started',
    UPGRADE_COMPLETED: 'upgrade_completed'
  }
};
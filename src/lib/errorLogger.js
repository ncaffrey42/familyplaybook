import { supabase } from '@/lib/customSupabaseClient';

const BREADCRUMB_LIMIT = 30;
let breadcrumbs = [];

// Circuit breaker to prevent infinite error loops
const ERROR_THRESHOLD = 5;
const RESET_TIME = 5000;
let recentErrors = 0;
let lastErrorTime = 0;
let isLogging = false;

const addBreadcrumb = (type, data) => {
  let safeData = data;
  if (data && typeof data === 'object') {
      try {
          if (data.url) { 
             safeData = { url: data.url, method: data.method || 'GET' };
          } else if (data instanceof Request) {
             safeData = { url: data.url, method: data.method };
          }
      } catch (e) {
          safeData = { error: 'Could not serialize data' };
      }
  }

  breadcrumbs.push({
    timestamp: new Date().toISOString(),
    type,
    data: safeData || null,
  });

  if (breadcrumbs.length > BREADCRUMB_LIMIT) {
    breadcrumbs.shift();
  }
};

const getLogs = async () => {
  try {
    const { data, error } = await supabase.from('error_logs').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Failed to retrieve error logs:', error);
    return [];
  }
};

const clearLogs = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('error_logs').delete().eq('user_id', user.id);
  } catch (error) {
    console.error('Failed to clear error logs:', error);
  }
};

const logError = async (error, info = {}) => {
  // 1. Circuit Breaker Check
  const now = Date.now();
  if (now - lastErrorTime > RESET_TIME) {
      recentErrors = 0;
      lastErrorTime = now;
  }
  
  if (recentErrors >= ERROR_THRESHOLD) {
      // Silently fail to prevent infinite loops
      return;
  }

  if (isLogging) return;
  
  // 2. Robust Network Error Filtering
  const isNetworkError = 
    error.message === 'Failed to fetch' || 
    error.message.includes('NetworkError') || 
    error.message.includes('Network request failed') ||
    error.message.includes('fetch') ||
    (error.name === 'TypeError' && error.message.includes('fetch')) ||
    (error.stack && error.stack.includes('window.fetch'));

  if (isNetworkError) {
      return;
  }

  isLogging = true;
  recentErrors++;

  try {
      // Use a lightweight check or skip auth check if we suspect instability
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;

      const logEntry = {
        message: error.message || 'Unknown error',
        stack: error.stack,
        component_stack: info.componentStack || null,
        url: window.location.href,
        breadcrumbs: [...breadcrumbs],
        user_id: user.id,
      };
      
      await supabase.from('error_logs').insert(logEntry);
      
  } catch (dbError) {
    // Silent fail to prevent loops
    console.warn("Failed to log error to DB:", dbError);
  } finally {
    isLogging = false;
  }
};

const initErrorLogger = () => {
  window.addEventListener('error', (event) => {
    logError(event.error || new Error(event.message), { filename: event.filename });
  });

  window.addEventListener('unhandledrejection', (event) => {
    // Filter out unhandled rejections that are just network errors
    const reason = event.reason || {};
    if (reason.message === 'Failed to fetch' || (reason.name === 'TypeError' && reason.message?.includes('fetch'))) {
        return;
    }
    logError(reason || new Error('Unhandled promise rejection'));
  });

  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    let url = args[0];
    if (args[0] instanceof Request) url = args[0].url;

    if (typeof url === 'string' && !url.includes('error_logs')) {
        addBreadcrumb('network', { url, method: args[1]?.method || 'GET' });
    }
    
    return originalFetch.apply(this, args);
  };
};

export { initErrorLogger, addBreadcrumb, getLogs, clearLogs, logError };
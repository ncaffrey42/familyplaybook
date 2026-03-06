import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/supabaseClient';
import { Loader2 } from 'lucide-react';
import { addBreadcrumb } from '@/lib/errorLogger';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    addBreadcrumb('AuthCallback mounted', { url: window.location.href });

    const handleCallback = async () => {
      try {
        // 1. If the context already has a session, we're good to go.
        // This handles cases where the Supabase client auto-detected the session
        // before this component even mounted.
        if (session) {
          addBreadcrumb('AuthCallback: Session exists in context, redirecting');
          navigate('/home', { replace: true });
          return;
        }

        // 2. Otherwise, manually check for the session from the URL hash.
        // This call parses the URL fragment/query params for access_token/refresh_token/code.
        const { data: { session: newSession }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (newSession) {
          // Successful login
          if (mounted) {
             addBreadcrumb('AuthCallback: Session recovered from URL, redirecting');
             // Small delay to ensure any auth context listeners have fired and state is synced
             setTimeout(() => navigate('/home', { replace: true }), 100);
          }
        } else {
          // No session found, but we are on the callback page. 
          // Check if there are error parameters in the URL (e.g. ?error=access_denied)
          const params = new URLSearchParams(window.location.search);
          const errorDescription = params.get('error_description');
          const errorCode = params.get('error');
          
          if (errorDescription || errorCode) {
             throw new Error(errorDescription || errorCode);
          }
          
          // If no error but no session, it might be a timing issue or an invalid link.
          // We'll give it a moment as the onAuthStateChange in context might be processing the hash asynchronously.
          addBreadcrumb('AuthCallback: No session found immediately, waiting...');
          setTimeout(() => {
            if (mounted) {
                // Double check session before giving up
                supabase.auth.getSession().then(({ data: { session: retrySession } }) => {
                    if (retrySession) {
                         navigate('/home', { replace: true });
                    } else {
                         console.warn('AuthCallback: Failed to recover session, redirecting to login');
                         navigate('/login', { replace: true });
                    }
                });
            }
          }, 2000);
        }
      } catch (err) {
        console.error('Auth callback error:', err);
        addBreadcrumb('AuthCallback Error', { message: err.message });
        if (mounted) {
            setError(err.message);
            // Redirect back to login after showing error briefly
            setTimeout(() => navigate('/login', { replace: true }), 3000);
        }
      }
    };

    handleCallback();

    return () => {
      mounted = false;
    };
  }, [session, navigate]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background p-4">
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-6 rounded-xl max-w-md text-center shadow-sm border border-red-100 dark:border-red-900">
          <h3 className="font-semibold mb-2 text-lg">Authentication Error</h3>
          <p className="mb-4">{error}</p>
          <p className="text-sm opacity-75">Redirecting to login page...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-background">
      <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-500">
        <div className="relative">
             <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full"></div>
             <Loader2 className="h-16 w-16 animate-spin text-primary relative z-10" />
        </div>
        <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Logging you in...</h2>
            <p className="text-muted-foreground">Please wait while we set up your workspace.</p>
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;
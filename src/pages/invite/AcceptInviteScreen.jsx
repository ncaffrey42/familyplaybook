import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { CheckCircle, XCircle, Loader } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/supabaseClient';

const ACCEPT_FN = 'accept-family-invite';

const AcceptInviteScreen = () => {
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState('idle'); // idle | accepting | success | error | already_accepted
  const [errorMsg, setErrorMsg] = useState('');

  const token = searchParams.get('token');

  useEffect(() => {
    if (authLoading) return;

    // If not logged in, send to login then come back here
    if (!user) {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      navigate(`/login?returnTo=${returnTo}`, { replace: true });
      return;
    }

    if (!token) {
      setStatus('error');
      setErrorMsg('No invite token found in the link. Please check the URL and try again.');
      return;
    }

    acceptInvite();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, token]);

  const acceptInvite = async () => {
    setStatus('accepting');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${ACCEPT_FN}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ token }),
      });

      const json = await res.json();

      if (res.status === 409) {
        setStatus('already_accepted');
        return;
      }

      if (!res.ok) {
        throw new Error(json.error || 'Failed to accept invitation.');
      }

      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
    }
  };

  if (authLoading || status === 'idle' || status === 'accepting') {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex flex-col items-center justify-center gap-4 p-6">
        <Loader size={36} className="animate-spin text-[#5CA9E9]" />
        <p className="text-gray-500 text-sm">Accepting your invitation…</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <>
        <Helmet><title>Welcome! - Family Playbook</title></Helmet>
        <div className="min-h-screen bg-[#FAF9F6] flex flex-col items-center justify-center gap-6 p-6 text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle size={40} className="text-green-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">You're in!</h1>
            <p className="text-gray-500 mt-2 text-sm max-w-xs">
              You've joined a Family Playbook. Head to your home screen to get started.
            </p>
          </div>
          <Button
            onClick={() => navigate('/', { replace: true })}
            className="w-full max-w-xs h-12 bg-gradient-to-r from-[#5CA9E9] to-[#7BC47F] text-white font-semibold rounded-xl"
          >
            Go to Home
          </Button>
        </div>
      </>
    );
  }

  if (status === 'already_accepted') {
    return (
      <>
        <Helmet><title>Already Joined - Family Playbook</title></Helmet>
        <div className="min-h-screen bg-[#FAF9F6] flex flex-col items-center justify-center gap-6 p-6 text-center">
          <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
            <CheckCircle size={40} className="text-[#5CA9E9]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Already joined</h1>
            <p className="text-gray-500 mt-2 text-sm max-w-xs">
              This invitation has already been accepted. Head home to continue.
            </p>
          </div>
          <Button
            onClick={() => navigate('/', { replace: true })}
            className="w-full max-w-xs h-12 bg-gradient-to-r from-[#5CA9E9] to-[#7BC47F] text-white font-semibold rounded-xl"
          >
            Go to Home
          </Button>
        </div>
      </>
    );
  }

  // error state
  return (
    <>
      <Helmet><title>Invalid Invite - Family Playbook</title></Helmet>
      <div className="min-h-screen bg-[#FAF9F6] flex flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
          <XCircle size={40} className="text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Invite not valid</h1>
          <p className="text-gray-500 mt-2 text-sm max-w-xs">{errorMsg}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate('/', { replace: true })}
          className="w-full max-w-xs h-12 rounded-xl"
        >
          Go to Home
        </Button>
      </div>
    </>
  );
};

export default AcceptInviteScreen;

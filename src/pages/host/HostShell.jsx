import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import HostKpiHeader from './HostKpiHeader';
import HostBottomNav from '@/components/HostBottomNav';
import { useHostWorkspace } from '@/hooks/useHostWorkspace';

/**
 * The Host app shell (docs/platform/HOST_SHELL.md).
 *
 * One codebase, one build, one Supabase project — this is a route namespace
 * with its own chrome, not a second application. Everything below it is
 * shared with the family product: auth, DataContext, the content engine,
 * share links, billing, RLS.
 *
 * Gating goes through useHostWorkspace() and nowhere else, so the real
 * workspace_type check lands in one file once tenancy exists (§3).
 */
const HostShell = () => {
  const { ready, isHost } = useHostWorkspace();

  if (!ready) {
    return (
      <div className="min-h-screen bg-cream dark:bg-background flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-apricot border-t-transparent animate-spin" />
      </div>
    );
  }

  // Not host-eligible (or the flag is off): the host product does not exist
  // for this account. Redirect rather than render an empty shell.
  if (!isHost) return <Navigate to="/home" replace />;

  return (
    <>
      <Helmet>
        <title>Host - Family Playbook</title>
      </Helmet>
      <div className="min-h-screen bg-cream dark:bg-background pb-24">
        <HostKpiHeader />
        <main className="px-[22px] pt-6 max-w-2xl mx-auto">
          <Outlet />
        </main>
        <HostBottomNav />
      </div>
    </>
  );
};

export default HostShell;

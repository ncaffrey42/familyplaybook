import { HOST_PRODUCT_ENABLED } from '@/lib/featureFlags';
import { useAuth } from '@/contexts/SupabaseAuthContext';

/**
 * The single seam where host gating lives (docs/platform/HOST_SHELL.md §3).
 *
 * Three layers were designed; only the first is enforceable today:
 *   1. build flag        — VITE_ENABLE_HOST_PRODUCT   ✅ real
 *   2. workspace type    — workspace_type = 'host'    ⛔ stub
 *   3. capability        — has_capability(...)        ⛔ stub
 *
 * Layers 2 and 3 need tables that do not exist: `workspaces` and
 * `workspace_members` are designed in ARCHITECTURE.md and RBAC.md and no
 * migration has been applied. So with the flag ON, this reports EVERY
 * signed-in account as host-eligible. That is acceptable for a dark shell
 * and is a release blocker for shipping the flag (HOST_SHELL.md §7.1).
 *
 * Everything host-gated calls this hook and nothing else, so when the
 * tenancy migration lands, the real query replaces the stub here and no
 * component changes:
 *
 *   const { data } = await supabase
 *     .from('workspace_members')
 *     .select('workspace_id, workspaces!inner(workspace_type)')
 *     .eq('user_id', user.id)
 *     .eq('workspaces.workspace_type', 'host');
 *   → isHost = (data ?? []).length > 0
 *
 * @returns {{ ready: boolean, isHost: boolean, workspaceId: string|null }}
 *   ready       — resolution finished (always true while stubbed; becomes
 *                 meaningful once this does I/O, so callers should already
 *                 branch on it rather than assume synchronous truth)
 *   isHost      — may the host shell render for this account
 *   workspaceId — the active host workspace; null until workspaces exist
 */
export function useHostWorkspace() {
  const { user, loading } = useAuth();

  if (loading) return { ready: false, isHost: false, workspaceId: null };

  return {
    ready: true,
    isHost: HOST_PRODUCT_ENABLED && Boolean(user),
    workspaceId: null,
  };
}

export default useHostWorkspace;

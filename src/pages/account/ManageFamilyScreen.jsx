import React, { useState, useEffect, useCallback } from 'react';
import { publicOrigin } from '@/lib/publicUrl';
import { motion } from 'framer-motion';
import { UserPlus, Copy, Trash2, X, Clock, CheckCircle } from 'lucide-react';
import EntitlementGuard from '@/components/EntitlementGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Helmet } from 'react-helmet';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigation } from '@/hooks/useNavigation';
import { supabase } from '@/lib/supabaseClient';

const SEND_INVITE_FN = 'send-family-invite';
const REMOVE_STATUS  = 'removed';

// Derive initials from a name or email
function getInitials(nameOrEmail = '') {
  const parts = nameOrEmail.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return nameOrEmail.slice(0, 2).toUpperCase();
}

const ManageFamilyScreen = () => {
  const { toast } = useToast();
  const { user, session } = useAuth();
  // App.jsx renders this route without props — navigation comes from the hook.
  const onNavigate = useNavigation();

  const [invitations, setInvitations]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [isInviteModalOpen, setInviteModalOpen] = useState(false);
  const [email, setEmail]               = useState('');
  const [inviteName, setInviteName]     = useState('');
  const [phone, setPhone]               = useState('');
  const [sending, setSending]           = useState(false);
  const [inviteUrl, setInviteUrl]       = useState('');
  const [loadingLink, setLoadingLink]   = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null); // invitation pending removal confirm

  const fetchInvitations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Load invitations this user owns. NOTE: invited_user_id has no FK to
      // profiles (only to auth.users), so a PostgREST embed fails with
      // PGRST200 — fetch member profiles in a second query instead.
      const { data, error } = await supabase
        .from('family_invitations')
        .select('id, invited_email, invited_name, invited_user_id, role, status, created_at, accepted_at, token')
        .eq('owner_user_id', user.id)
        .in('status', ['pending', 'accepted'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      const memberIds = (data ?? []).map((i) => i.invited_user_id).filter(Boolean);
      let profileMap = {};
      if (memberIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', memberIds);
        profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
      }
      setInvitations((data ?? []).map((i) => ({
        ...i,
        invited_profile: i.invited_user_id ? profileMap[i.invited_user_id] ?? null : null,
      })));
    } catch (err) {
      console.error('[ManageFamilyScreen] fetch error:', err);
      toast({ title: 'Could not load members', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  const callEdgeFunction = useCallback(async (fnName, body) => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    const token = currentSession?.access_token;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnName}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json;
  }, []);

  const handleSendInvite = async () => {
    if (!email.trim()) {
      toast({ title: 'Please enter an email address.', description: 'The invite is tied to their email so only they can accept it.', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const result = await callEdgeFunction(SEND_INVITE_FN, { email: email.trim(), role: 'editor', name: inviteName.trim() || undefined });

      // Optional phone: open the user's texting app with the invite link
      // prefilled. The invite stays keyed to the email (acceptance requires
      // signing in with it) — SMS is just a delivery channel.
      const phoneDigits = phone.replace(/[^\d+]/g, '');
      if (phoneDigits && result.invite_url) {
        const smsBody = encodeURIComponent(
          `${inviteName.trim() ? inviteName.trim() + ', y' : 'Y'}ou're invited to our Family Playbook! Open this link and sign in with ${email.trim()} to join: ${result.invite_url}`
        );
        window.location.href = `sms:${phoneDigits}${/iPhone|iPad/.test(navigator.userAgent) ? '&' : '?'}body=${smsBody}`;
      }

      toast({
        title: 'Invitation sent!',
        description: result.email_sent
          ? `An invite email was sent to ${email}.${phoneDigits ? ' Your texting app is opening with the link too.' : ''}`
          : `Share this link with ${email}: ${result.invite_url}`,
      });
      setEmail('');
      setInviteName('');
      setPhone('');
      setInviteModalOpen(false);
      fetchInvitations();
    } catch (err) {
      const isLimit = err.message?.includes('limit') || err.message?.includes('LIMIT');
      toast({
        title: isLimit ? 'Member limit reached' : 'Could not send invite',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  // Generate a fresh invite link by calling the edge function with the last email
  // (or a placeholder so we always have a link ready when the "Link" tab is opened)
  const handleLoadInviteLink = async () => {
    if (inviteUrl) return; // already generated
    if (!email.trim()) {
      toast({ title: 'Enter an email first to generate a personal invite link.', variant: 'destructive' });
      return;
    }
    setLoadingLink(true);
    try {
      const result = await callEdgeFunction(SEND_INVITE_FN, { email: email.trim(), role: 'editor' });
      setInviteUrl(result.invite_url);
    } catch (err) {
      toast({ title: 'Could not generate link', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingLink(false);
    }
  };

  const handleCopyLink = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    toast({ title: 'Link copied!', description: 'The invite link has been copied.' });
  };

  const handleRemoveMember = async (invitationId) => {
    try {
      const { error } = await supabase
        .from('family_invitations')
        .update({ status: REMOVE_STATUS })
        .eq('id', invitationId)
        .eq('owner_user_id', user.id);

      if (error) throw error;

      setInvitations(prev => prev.filter(i => i.id !== invitationId));
      toast({ title: 'Member removed', description: 'They no longer have access.' });
    } catch (err) {
      toast({ title: 'Could not remove member', description: err.message, variant: 'destructive' });
    }
  };

  const pendingCount  = invitations.filter(i => i.status === 'pending').length;
  const acceptedCount = invitations.filter(i => i.status === 'accepted').length;

  return (
    <>
      <Helmet>
        <title>Manage Family & Friends - Family Playbook</title>
        <meta name="description" content="Invite and manage family and friends." />
      </Helmet>
      <div className="min-h-screen bg-[#FAF9F6] pb-24">
        <div className="p-6">
          <PageHeader title="Family & Friends" onBack={() => onNavigate('account')}>
            <EntitlementGuard action="EDITOR_INVITE">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setInviteUrl(''); setInviteModalOpen(true); }}
                className="rounded-full bg-white dark:bg-gray-800 shadow-sm"
              >
                <UserPlus size={20} className="text-[#5CA9E9]" />
              </Button>
            </EntitlementGuard>
          </PageHeader>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#5CA9E9]" />
            </div>
          ) : invitations.length === 0 ? (
            <div className="bg-card rounded-lg border border-card-border shadow-card p-8 text-center mt-4">
              <div className="w-[56px] h-[56px] rounded-full border-2 border-dashed border-raspberry text-raspberry flex items-center justify-center mx-auto mb-4">
                <UserPlus size={24} />
              </div>
              <p className="font-display font-semibold text-[19px] text-mulberry dark:text-foreground">
                Nobody on your team yet.
              </p>
              <p className="mt-1 text-[14px] text-muted-copy max-w-xs mx-auto">
                Invite a partner, grandparent, or sitter — editors can help
                write guides, viewers just see what you share.
              </p>
              <EntitlementGuard action="EDITOR_INVITE">
                <Button
                  onClick={() => { setInviteUrl(''); setInviteModalOpen(true); }}
                  className="mt-5 h-12 px-8 rounded-full bg-raspberry hover:bg-raspberry-hover text-cream font-bold text-[15px]"
                >
                  <UserPlus size={18} className="mr-2" /> Invite someone
                </Button>
              </EntitlementGuard>
            </div>
          ) : (
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {acceptedCount > 0 && (
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Members</p>
              )}
              {invitations.filter(i => i.status === 'accepted').map((inv, index) => {
                const profile = inv.invited_profile;
                const displayName = profile?.full_name || inv.invited_name || inv.invited_email;
                const initials = getInitials(displayName);
                return (
                  <motion.div
                    key={inv.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.06 }}
                    className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      {profile?.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt={displayName}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-mulberry flex items-center justify-center text-white font-bold text-lg">
                          {initials}
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold text-gray-800 dark:text-gray-100">{displayName}</h3>
                        <div className="flex items-center gap-1 mt-0.5">
                          <CheckCircle size={12} className="text-green-500" />
                          <p className="text-xs text-green-600 dark:text-green-400 capitalize">{inv.role}</p>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setRemoveTarget(inv)} aria-label="Remove member">
                      <Trash2 size={18} className="text-coral" />
                    </Button>
                  </motion.div>
                );
              })}

              {pendingCount > 0 && (
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest pt-2">Pending</p>
              )}
              {invitations.filter(i => i.status === 'pending').map((inv, index) => (
                <motion.div
                  key={inv.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (acceptedCount + index) * 0.06 }}
                  className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-4 flex items-center justify-between opacity-75"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-full bg-blush flex items-center justify-center text-blush-copy font-bold text-sm flex-shrink-0">
                      {getInitials(inv.invited_name || inv.invited_email)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-700 dark:text-gray-200 text-sm truncate">
                        {inv.invited_name || inv.invited_email}
                      </h3>
                      {inv.invited_name && (
                        <p className="text-xs text-muted-copy truncate">{inv.invited_email}</p>
                      )}
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock size={12} className="text-apricot" />
                        <p className="text-xs text-blush-copy">Invite pending</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(`${publicOrigin()}/invite/accept?token=${inv.token}`);
                        toast({ title: 'Invite link copied', description: `Send it to ${inv.invited_name || inv.invited_email} any way you like.` });
                      }}
                      aria-label="Copy invite link"
                    >
                      <Copy size={17} className="text-raspberry" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setRemoveTarget(inv)} aria-label="Cancel invite">
                      <Trash2 size={18} className="text-coral" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        {/* Remove / cancel-invite confirmation */}
        <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {removeTarget?.status === 'pending' ? 'Cancel this invite?' : 'Remove this member?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {removeTarget?.status === 'pending'
                  ? `The invite sent to ${removeTarget?.invited_name || removeTarget?.invited_email} will stop working.`
                  : `${removeTarget?.invited_profile?.full_name || removeTarget?.invited_name || removeTarget?.invited_email} will immediately lose access to your guides and bundles. You can always invite them again.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep</AlertDialogCancel>
              <AlertDialogAction
                className="bg-coral hover:bg-coral-hover"
                onClick={() => { handleRemoveMember(removeTarget.id); setRemoveTarget(null); }}
              >
                {removeTarget?.status === 'pending' ? 'Cancel invite' : 'Remove'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={isInviteModalOpen} onOpenChange={setInviteModalOpen}>
          <DialogContent className="bg-white dark:bg-gray-900 rounded-2xl p-0 max-w-[90vw] sm:max-w-md">
            <DialogHeader className="p-6 pb-0">
              <DialogTitle className="text-xl font-bold text-gray-800 dark:text-gray-100">Invite a Member</DialogTitle>
              <DialogDescription>
                Add a friend or family member to collaborate.
              </DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="email" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-gray-100 dark:bg-gray-800 mx-6 mt-4 h-12 p-1 rounded-xl" style={{ width: 'calc(100% - 3rem)' }}>
                <TabsTrigger value="email" className="rounded-lg">Email</TabsTrigger>
                <TabsTrigger value="link" className="rounded-lg" onClick={handleLoadInviteLink}>Link</TabsTrigger>
              </TabsList>

              <TabsContent value="email" className="p-6">
                <div className="space-y-4">
                  <div>
                    <Label className="text-[12px] font-bold text-body-copy dark:text-gray-300">Their name</Label>
                    <Input
                      type="text"
                      placeholder="e.g., Grandma Sue"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      className="h-12 mt-1 dark:bg-gray-800"
                    />
                  </div>
                  <div>
                    <Label className="text-[12px] font-bold text-body-copy dark:text-gray-300">Email (required)</Label>
                    <Input
                      type="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendInvite()}
                      className="h-12 mt-1 dark:bg-gray-800"
                    />
                  </div>
                  <div>
                    <Label className="text-[12px] font-bold text-body-copy dark:text-gray-300">Phone (optional — we'll open a text with the link)</Label>
                    <Input
                      type="tel"
                      placeholder="(555) 555-0100"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="h-12 mt-1 dark:bg-gray-800"
                    />
                  </div>
                  <Button
                    onClick={handleSendInvite}
                    disabled={sending}
                    className="w-full h-12 rounded-full bg-raspberry hover:bg-raspberry-hover text-cream font-bold"
                  >
                    {sending ? 'Sending…' : 'Send Invite'}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="link" className="p-6">
                <div className="space-y-4">
                  {loadingLink ? (
                    <div className="flex justify-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#5CA9E9]" />
                    </div>
                  ) : inviteUrl ? (
                    <div className="flex items-center space-x-2 w-full">
                      <Input value={inviteUrl} readOnly className="h-12 flex-grow truncate dark:bg-gray-800 text-xs" />
                      <Button type="button" size="icon" className="h-12 w-12 shrink-0" onClick={handleCopyLink}>
                        <Copy className="h-5 w-5" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-2">
                      Enter an email on the Email tab first, then switch here to get a shareable link.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
            <DialogClose className="absolute right-4 top-4 opacity-70">
              <X className="h-4 w-4" />
            </DialogClose>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default ManageFamilyScreen;

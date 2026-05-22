import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Copy, Trash2, X, Clock, CheckCircle } from 'lucide-react';
import EntitlementGuard from '@/components/EntitlementGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Helmet } from 'react-helmet';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/supabaseClient';

const SEND_INVITE_FN = 'send-family-invite';
const REMOVE_STATUS  = 'removed';

// Derive initials from a name or email
function getInitials(nameOrEmail = '') {
  const parts = nameOrEmail.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return nameOrEmail.slice(0, 2).toUpperCase();
}

const ManageFamilyScreen = ({ onNavigate }) => {
  const { toast } = useToast();
  const { user, session } = useAuth();

  const [invitations, setInvitations]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [isInviteModalOpen, setInviteModalOpen] = useState(false);
  const [email, setEmail]               = useState('');
  const [sending, setSending]           = useState(false);
  const [inviteUrl, setInviteUrl]       = useState('');
  const [loadingLink, setLoadingLink]   = useState(false);

  const fetchInvitations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Load invitations this user owns, with accepted members' profile data
      const { data, error } = await supabase
        .from('family_invitations')
        .select(`
          id, invited_email, role, status, created_at, accepted_at, token,
          invited_profile:invited_user_id ( full_name, avatar_url )
        `)
        .eq('owner_user_id', user.id)
        .in('status', ['pending', 'accepted'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvitations(data ?? []);
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
      toast({ title: 'Please enter an email address.', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const result = await callEdgeFunction(SEND_INVITE_FN, { email: email.trim(), role: 'editor' });
      toast({
        title: 'Invitation sent!',
        description: result.email_sent
          ? `An invite email was sent to ${email}.`
          : `Share this link with ${email}: ${result.invite_url}`,
      });
      setEmail('');
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
      <div className="min-h-screen bg-background pb-24">
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
            <div className="text-center py-16 text-gray-400">
              <UserPlus size={40} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No family members yet.</p>
              <p className="text-xs mt-1">Tap the + button to send an invite.</p>
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
                const displayName = profile?.full_name || inv.invited_email;
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
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#A5D6FF] to-[#D6A5FF] flex items-center justify-center text-white font-bold text-lg">
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
                    <Button variant="ghost" size="icon" onClick={() => handleRemoveMember(inv.id)}>
                      <Trash2 size={18} className="text-red-400" />
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
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500 font-bold text-sm">
                      {getInitials(inv.invited_email)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-700 dark:text-gray-200 text-sm">{inv.invited_email}</h3>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock size={12} className="text-amber-400" />
                        <p className="text-xs text-amber-500">Invite pending</p>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveMember(inv.id)}>
                    <Trash2 size={18} className="text-red-400" />
                  </Button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

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
                  <Input
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendInvite()}
                    className="h-12 dark:bg-gray-800"
                  />
                  <Button
                    onClick={handleSendInvite}
                    disabled={sending}
                    className="w-full h-12 bg-gradient-to-r from-[#5CA9E9] to-[#7BC47F]"
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

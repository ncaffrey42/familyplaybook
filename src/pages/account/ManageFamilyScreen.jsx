import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Mail, Link, Copy, Trash2, X } from 'lucide-react';
import EntitlementGuard from '@/components/EntitlementGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Helmet } from 'react-helmet';
import PageHeader from '@/components/PageHeader';
import { entitlementService } from '@/services/EntitlementService';
import { UsageTrackingService } from '@/services/UsageTrackingService';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const initialMembers = [
    { id: 1, name: 'Michael Scott', role: 'Dad', avatar: 'MS' },
    { id: 2, name: 'Pam Beesly', role: 'Aunt', avatar: 'PB' },
    { id: 3, name: 'Jim Halpert', role: 'Friend', avatar: 'JH' },
];

const ManageFamilyScreen = ({ onNavigate }) => {
    const { toast } = useToast();
    const { user } = useAuth();
    const [members, setMembers] = useState(initialMembers);
    const [isInviteModalOpen, setInviteModalOpen] = useState(false);
    const [email, setEmail] = useState('');
    const inviteLink = 'https://familyplaybook.app/invite/a1b2c3d4';

    const handleRemoveMember = async (memberId) => {
        setMembers(members.filter(m => m.id !== memberId));
        toast({
            title: "Member Removed",
            description: "They will no longer have access to your account.",
        });
        // Usage Update
        if (user) {
            UsageTrackingService.updateUsageMetric(user.id, 'editors', -1).catch(console.error);
        }
    };

    const handleSendInvite = async () => {
        if (!email) {
            toast({ title: "Error", description: "Please enter a valid email.", variant: "destructive" });
            return;
        }

        // Entitlement Check for Editor Invite
        if (user) {
            try {
                const entitlement = await entitlementService.canPerform(user.id, 'EDITOR_INVITE');
                if (!entitlement.allowed) {
                    toast({ 
                        title: "Member Limit Reached", 
                        description: entitlement.reason_code || "You cannot invite more members on this plan.", 
                        variant: "destructive" 
                    });
                    return;
                }
            } catch (e) {
                console.error(e);
                return;
            }
        }

        toast({
            title: "💌 Invitation Sent!",
            description: `An invite has been sent to ${email}.`,
        });
        
        // Usage Update (Simulated for mock)
        if (user) {
            UsageTrackingService.updateUsageMetric(user.id, 'editors', 1).catch(console.error);
        }

        setEmail('');
        setInviteModalOpen(false);
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(inviteLink);
        toast({
            title: "🔗 Link Copied!",
            description: "The invite link has been copied to your clipboard.",
        });
    };

    const siteUrl = "https://familyplaybook.app";
    const defaultImage = "/icon-192x192.png";

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
                                onClick={() => setInviteModalOpen(true)}
                                className="rounded-full bg-white dark:bg-gray-800 shadow-sm"
                            >
                                <UserPlus size={20} className="text-[#5CA9E9]" />
                            </Button>
                        </EntitlementGuard>
                    </PageHeader>

                    <motion.div
                        className="space-y-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ staggerChildren: 0.1 }}
                    >
                        {members.map((member, index) => (
                            <motion.div
                                key={member.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-4 flex items-center justify-between"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#A5D6FF] to-[#D6A5FF] flex items-center justify-center text-white font-bold text-lg">
                                        {member.avatar}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-800 dark:text-gray-100">{member.name}</h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">{member.role}</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => handleRemoveMember(member.id)}>
                                    <Trash2 size={20} className="text-red-500" />
                                </Button>
                            </motion.div>
                        ))}
                    </motion.div>
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
                            <TabsList className="grid w-full grid-cols-2 bg-gray-100 dark:bg-gray-800 mx-6 mt-4 h-12 p-1 rounded-xl">
                                <TabsTrigger value="email" className="rounded-lg">Email</TabsTrigger>
                                <TabsTrigger value="link" className="rounded-lg">Link</TabsTrigger>
                            </TabsList>
                            <TabsContent value="email" className="p-6">
                                <div className="space-y-4">
                                    <Input
                                        type="email"
                                        placeholder="name@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="h-12 dark:bg-gray-800"
                                    />
                                    <Button onClick={handleSendInvite} className="w-full h-12 bg-gradient-to-r from-[#5CA9E9] to-[#7BC47F]">Send Invite</Button>
                                </div>
                            </TabsContent>
                            <TabsContent value="link" className="p-6">
                                <div className="space-y-4">
                                    <div className="flex items-center space-x-2 w-full">
                                        <Input value={inviteLink} readOnly className="h-12 flex-grow truncate dark:bg-gray-800" />
                                        <Button type="button" size="icon" className="h-12 w-12 shrink-0" onClick={handleCopyLink}>
                                            <Copy className="h-5 w-5" />
                                        </Button>
                                    </div>
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
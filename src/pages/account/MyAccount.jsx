import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import AccountLayout from '@/components/AccountLayout';
import AvatarUpload from '@/components/AvatarUpload';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const MyAccount = () => {
    const { user, profile, refreshProfile } = useAuth();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [fullName, setFullName] = useState('');
    // avatar_url is mirrored locally so the form re-renders immediately after
    // AvatarUpload writes it; refreshProfile() will also update via the
    // profile/user effect below.
    const [avatarUrl, setAvatarUrl] = useState('');

    useEffect(() => {
        if (profile) {
            setFullName(profile.full_name || '');
            setAvatarUrl(profile.avatar_url || '');
        } else if (user?.user_metadata) {
            setFullName(user.user_metadata.full_name || user.user_metadata.name || '');
            setAvatarUrl(user.user_metadata.avatar_url || '');
        }
    }, [profile, user]);

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            // Note: `profiles` doesn't have an `updated_at` column in the
            // current schema — adding one would error in the schema cache.
            const updates = {
                id: user.id,
                full_name: fullName,
                // avatar_url is already persisted by AvatarUpload; included
                // here so the upsert payload is complete.
                avatar_url: avatarUrl,
            };

            const { error } = await supabase.from('profiles').upsert(updates);
            if (error) throw error;

            await supabase.auth.updateUser({
                data: { full_name: fullName, avatar_url: avatarUrl }
            });

            await refreshProfile();
            toast({ title: "Profile updated successfully!", variant: "success" });
        } catch (error) {
            toast({ title: "Error updating profile", description: error.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AccountLayout>
            <div className="space-y-6 pb-10">
                <Card>
                    <CardHeader>
                        <CardTitle>Public Profile</CardTitle>
                        <CardDescription>
                            This is how others see you in shared packs.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleUpdateProfile} className="space-y-6">
                            <div className="flex flex-col sm:flex-row gap-6 items-start">
                                <AvatarUpload
                                    avatarUrl={avatarUrl}
                                    fullName={fullName}
                                    onChange={setAvatarUrl}
                                />

                                <div className="flex-1 space-y-4 w-full">
                                    <div className="grid gap-2">
                                        <Label htmlFor="fullName">Full Name</Label>
                                        <Input
                                            id="fullName"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            placeholder="John Doe"
                                            className="max-w-md"
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-gray-800">
                                <Button type="submit" disabled={isLoading}>
                                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Save Changes
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </AccountLayout>
    );
};

export default MyAccount;
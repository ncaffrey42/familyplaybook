import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Camera, Save } from 'lucide-react';
import AccountLayout from '@/components/AccountLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const MyAccount = () => {
    const { user, profile, refreshProfile } = useAuth();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [fullName, setFullName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [uploading, setUploading] = useState(false);

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
            const updates = {
                id: user.id,
                full_name: fullName,
                avatar_url: avatarUrl,
                updated_at: new Date(),
            };

            const { error } = await supabase.from('profiles').upsert(updates);
            if (error) throw error;
            
            // Sync with auth metadata just in case
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
                                <div className="flex flex-col items-center gap-2">
                                    <Avatar className="h-24 w-24 border-2 border-gray-100 dark:border-gray-800">
                                        <AvatarImage src={avatarUrl} />
                                        <AvatarFallback className="text-2xl">{fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    {/* Real avatar upload requires storage setup. For now, simple text URL or disabled button */}
                                    <Button variant="outline" size="sm" type="button" disabled className="w-full">
                                        <Camera className="w-4 h-4 mr-2" /> Change
                                    </Button>
                                    <span className="text-xs text-muted-foreground">(Upload coming soon)</span>
                                </div>
                                
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

                                    <div className="grid gap-2">
                                        <Label htmlFor="avatarUrl">Avatar URL (Optional)</Label>
                                        <Input 
                                            id="avatarUrl" 
                                            value={avatarUrl} 
                                            onChange={(e) => setAvatarUrl(e.target.value)} 
                                            placeholder="https://example.com/me.png"
                                            className="max-w-md text-sm text-gray-500 font-mono"
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
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useTheme } from '@/components/ThemeProvider';
import { useToast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';
import AccountLayout from '@/components/AccountLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Bell, Shield, Moon, Globe, Key, Trash2, Download, LogOut, Loader2 } from 'lucide-react';

const AccountSettings = () => {
    const { user, signOut, loading: authLoading } = useAuth();
    const { theme, setTheme } = useTheme();
    const { toast } = useToast();
    const navigate = useNavigate();

    const [isLoading, setIsLoading] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    
    // Preferences State
    const [emailNotifs, setEmailNotifs] = useState(true);
    const [pushNotifs, setPushNotifs] = useState(true);
    const [language, setLanguage] = useState('en');

    useEffect(() => {
        if (user?.user_metadata) {
            setEmailNotifs(user.user_metadata.email_notifications ?? true);
            setPushNotifs(user.user_metadata.push_notifications ?? true);
            setLanguage(user.user_metadata.language ?? 'en');
        }
    }, [user]);

    const handleUpdatePreferences = async (key, value) => {
        try {
            const { error } = await supabase.auth.updateUser({
                data: { [key]: value }
            });
            if (error) throw error;
            
            // Optimistic update
            if (key === 'email_notifications') setEmailNotifs(value);
            if (key === 'push_notifications') setPushNotifs(value);
            if (key === 'language') setLanguage(value);

            toast({ title: "Preferences saved", variant: "success" });
        } catch (error) {
            toast({ title: "Error saving settings", description: error.message, variant: "destructive" });
        }
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            toast({ title: "Passwords do not match", variant: "destructive" });
            return;
        }
        if (password.length < 6) {
            toast({ title: "Password too short", description: "Must be at least 6 characters", variant: "destructive" });
            return;
        }

        setIsLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            toast({ title: "Password updated successfully", variant: "success" });
            setPassword('');
            setConfirmPassword('');
        } catch (error) {
            toast({ title: "Error updating password", description: error.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportData = async () => {
        setIsLoading(true);
        try {
             const { data, error } = await supabase.rpc('export_user_data');
             if (error) throw error;
             
             const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
             const url = URL.createObjectURL(blob);
             const a = document.createElement('a');
             a.href = url;
             a.download = `family_playbook_export_${new Date().toISOString().split('T')[0]}.json`;
             document.body.appendChild(a);
             a.click();
             document.body.removeChild(a);
             toast({ title: "Data export started", description: "Your file is downloading." });
        } catch (error) {
            toast({ title: "Export failed", description: error.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        // In a real app, this would likely trigger a cloud function to cleanup data
        // For this environment, we will sign out and show a message
        toast({ title: "Account Deletion Request", description: "This feature requires admin approval in this demo environment.", variant: "default" });
    };

    return (
        <AccountLayout>
            <div className="space-y-6 pb-10">
                {/* Account Security */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Key className="w-5 h-5" /> Security</CardTitle>
                        <CardDescription>Manage your password and account access.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email Address</Label>
                            <Input id="email" value={user?.email || ''} disabled className="bg-gray-100 dark:bg-gray-800 text-gray-500" />
                        </div>
                        <form onSubmit={handlePasswordChange} className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                            <div className="grid gap-2">
                                <Label htmlFor="new-password">New Password</Label>
                                <Input 
                                    id="new-password" 
                                    type="password" 
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Min. 6 characters"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="confirm-password">Confirm Password</Label>
                                <Input 
                                    id="confirm-password" 
                                    type="password" 
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Re-enter password"
                                />
                            </div>
                            <Button type="submit" disabled={isLoading || !password}>
                                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Update Password"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* Preferences */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Bell className="w-5 h-5" /> Preferences</CardTitle>
                        <CardDescription>Customize your app experience.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base">Email Notifications</Label>
                                <p className="text-sm text-gray-500">Receive weekly digests and updates.</p>
                            </div>
                            <Switch checked={emailNotifs} onCheckedChange={(v) => handleUpdatePreferences('email_notifications', v)} />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base">Push Notifications</Label>
                                <p className="text-sm text-gray-500">Get alerts on mobile devices.</p>
                            </div>
                            <Switch checked={pushNotifs} onCheckedChange={(v) => handleUpdatePreferences('push_notifications', v)} />
                        </div>
                        <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800">
                             <div className="flex items-center gap-2">
                                <Moon className="w-4 h-4 text-gray-500" />
                                <Label className="text-base">Dark Mode</Label>
                             </div>
                             <Switch checked={theme === 'dark'} onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')} />
                        </div>
                         <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2">
                                <Globe className="w-4 h-4 text-gray-500" />
                                <Label className="text-base">Language</Label>
                             </div>
                             <Select value={language} onValueChange={(v) => handleUpdatePreferences('language', v)}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Select Language" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="en">English</SelectItem>
                                    <SelectItem value="es">Español</SelectItem>
                                    <SelectItem value="fr">Français</SelectItem>
                                    <SelectItem value="de">Deutsch</SelectItem>
                                </SelectContent>
                             </Select>
                        </div>
                    </CardContent>
                </Card>

                {/* Data & Danger Zone */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5" /> Data & Privacy</CardTitle>
                        <CardDescription>Manage your personal data.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="text-base block">Export Data</Label>
                                <p className="text-sm text-gray-500">Download a copy of all your guides and packs.</p>
                            </div>
                            <Button variant="outline" onClick={handleExportData} disabled={isLoading}>
                                <Download className="mr-2 h-4 w-4" /> Export
                            </Button>
                        </div>
                    </CardContent>
                    <CardFooter className="bg-red-50 dark:bg-red-900/10 border-t border-red-100 dark:border-red-900 rounded-b-xl flex flex-col gap-4 items-start p-6">
                        <div>
                             <h4 className="font-semibold text-red-700 dark:text-red-400">Danger Zone</h4>
                             <p className="text-sm text-red-600/80 dark:text-red-400/80">Permanent actions for your account.</p>
                        </div>
                        <div className="flex gap-4 w-full">
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" className="flex-1 bg-white text-red-600 border border-red-200 hover:bg-red-50 dark:bg-transparent dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20">
                                        <Trash2 className="mr-2 h-4 w-4" /> Delete Account
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This action cannot be undone. This will permanently delete your account and remove your data from our servers.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDeleteAccount} className="bg-red-600 hover:bg-red-700">Delete Account</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                     <Button variant="destructive" className="flex-1">
                                        <LogOut className="mr-2 h-4 w-4" /> Sign Out
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Sign Out</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Are you sure you want to sign out?
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => {
                                            signOut();
                                            navigate('/login');
                                        }}>Sign Out</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </CardFooter>
                </Card>
            </div>
        </AccountLayout>
    );
};

export default AccountSettings;
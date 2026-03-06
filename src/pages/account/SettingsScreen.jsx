import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, LogOut, BookOpen, Users, Moon, Sun, Key, Trash2, BarChart, Bug, ChevronRight, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Helmet } from 'react-helmet';
import { useNavigation } from '@/hooks/useNavigation';
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
    
    const SettingsSection = ({ title, children }) => (
      <div className="mb-8">
        <h2 className="text-xl font-bold text-foreground mb-4">{title}</h2>
        <div className="bg-card rounded-3xl shadow-soft overflow-hidden">
            {children}
        </div>
      </div>
    );
    
    const SettingsItem = ({ icon: Icon, title, onClick, children, isButton, isLast }) => (
      <motion.div
        whileTap={{ scale: isButton ? 0.98 : 1 }}
        className={`flex items-center p-4 transition-colors ${isButton ? 'cursor-pointer hover:bg-secondary' : ''} ${!isLast ? 'border-b border-border' : ''}`}
        onClick={isButton ? onClick : undefined}
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mr-4">
            <Icon className="w-5 h-5 text-primary" />
        </div>
        <span className="flex-grow font-semibold text-foreground">{title}</span>
        {children}
      </motion.div>
    );
    
    const SettingsScreen = () => {
      const { theme, setTheme } = useTheme();
      const { user, signOut } = useAuth();
      const handleNavigate = useNavigation();
      const [isSigningOut, setIsSigningOut] = useState(false);
      const [isUserbackEnabled, setIsUserbackEnabled] = useState(
        localStorage.getItem('showUserbackWidget') !== 'false'
      );
    
      const handleThemeChange = () => {
        setTheme(theme === 'light' ? 'dark' : 'light');
      };
    
      const handleUserbackToggle = (enabled) => {
        setIsUserbackEnabled(enabled);
        localStorage.setItem('showUserbackWidget', enabled);
        window.dispatchEvent(new Event('storage'));
      };
    
      const handleSignOut = async () => {
        try {
            setIsSigningOut(true);
            await signOut();
            // Force navigation to login after state is cleared
            // We do a hard location replace if needed, but context update should trigger re-render in App.jsx
            handleNavigate('login');
        } catch (error) {
            console.error("Sign out error in UI:", error);
            // Even if error, force redirect as fallback
            handleNavigate('login');
        } finally {
            setIsSigningOut(false);
        }
      };
    
      const siteUrl = "https://familyplaybook.app";
      const defaultImage = "/icon-192x192.png";
    
      return (
        <>
        <Helmet>
          <title>Settings - Family Playbook</title>
          <meta name="description" content="Manage your account settings, appearance, notifications, and more." />
          <meta property="og:title" content="Settings - Family Playbook" />
          <meta property="og:description" content="Manage your account settings, appearance, notifications, and more." />
          <meta property="og:image" content={defaultImage} />
          <meta property="og:url" content={`${siteUrl}/settings`} />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="Settings - Family Playbook" />
          <meta name="twitter:description" content="Manage your account settings, appearance, notifications, and more." />
          <meta name="twitter:image" content={defaultImage} />
        </Helmet>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="min-h-screen bg-background pb-24"
        >
          <div className="p-6">
            <PageHeader title="Settings" onBack={() => handleNavigate('home')} />
    
            <div className="max-w-2xl mx-auto">
              <SettingsSection title="Account">
                <SettingsItem icon={User} title="My Account" isButton onClick={() => handleNavigate('account')}>
                  <ChevronRight size={20} className="text-muted-foreground" />
                </SettingsItem>
                 <SettingsItem icon={Key} title="Subscription" isButton onClick={() => handleNavigate('subscription')} isLast>
                  <ChevronRight size={20} className="text-muted-foreground" />
                </SettingsItem>
              </SettingsSection>

              <SettingsSection title="General">
                <SettingsItem icon={BookOpen} title="My Packs" isButton onClick={() => handleNavigate('packs')}>
                  <ChevronRight size={20} className="text-muted-foreground" />
                </SettingsItem>
                <SettingsItem icon={Users} title="Family & Friends" isButton onClick={() => handleNavigate('manageFamily')}>
                  <ChevronRight size={20} className="text-muted-foreground" />
                </SettingsItem>
                <SettingsItem icon={theme === 'light' ? Moon : Sun} title="Dark Mode" isLast>
                  <Switch
                    checked={theme === 'dark'}
                    onCheckedChange={handleThemeChange}
                  />
                </SettingsItem>
              </SettingsSection>
    
              <SettingsSection title="Data Management">
                <SettingsItem icon={BarChart} title="Export My Data" isButton onClick={() => handleNavigate('account')}>
                    <ChevronRight size={20} className="text-muted-foreground" />
                </SettingsItem>
                <SettingsItem icon={Trash2} title="Archived Items" isButton isLast onClick={() => handleNavigate('archived')}>
                    <ChevronRight size={20} className="text-muted-foreground" />
                </SettingsItem>
              </SettingsSection>
    
              <SettingsSection title="Advanced">
                <SettingsItem icon={Bug} title="Feedback Widget" isLast={!user?.email?.endsWith('@hostinger.com')}>
                  <Switch
                    checked={isUserbackEnabled}
                    onCheckedChange={handleUserbackToggle}
                  />
                </SettingsItem>
                {user?.email?.endsWith('@hostinger.com') && (
                    <SettingsItem icon={Bug} title="View Error Log" isButton isLast onClick={() => handleNavigate('error-log')}>
                        <ChevronRight size={20} className="text-muted-foreground" />
                    </SettingsItem>
                )}
              </SettingsSection>

              <div className="mt-8">
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                         <Button variant="outline" className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 border-red-200 dark:border-red-900" disabled={isSigningOut}>
                            {isSigningOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                            {isSigningOut ? 'Signing out...' : 'Sign Out'}
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>You will need to sign back in to access your account.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleSignOut} className="bg-red-600 hover:bg-red-700 text-white">Sign Out</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        </motion.div>
        </>
      );
    };
    
    export default SettingsScreen;
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Loader2, CheckCircle2, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Helmet } from 'react-helmet';
import { useNavigation } from '@/hooks/useNavigation';

const UpdatePasswordScreen = () => {
  const { toast } = useToast();
  const { updatePassword } = useAuth();
  const handleNavigate = useNavigation();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleUpdate = async () => {
    if (!password || !confirmPassword) {
      toast({ title: "⚠️ Please fill in all fields.", variant: "destructive" });
      return;
    }

    if (password !== confirmPassword) {
        toast({ title: "⚠️ Passwords do not match.", variant: "destructive" });
        return;
    }
    
    if (password.length < 6) {
        toast({ title: "⚠️ Password must be at least 6 characters.", variant: "destructive" });
        return;
    }

    setLoading(true);
    const { error } = await updatePassword(password);
    setLoading(false);

    if (!error) {
      setSuccess(true);
      setTimeout(() => {
          handleNavigate('home');
      }, 2000);
    }
  };

  const siteUrl = "https://familyplaybook.app";
  const defaultImage = "https://horizons-cdn.hostinger.com/ffc35e06-ea36-451f-a031-de31af4f5e18/80f125d4a7ccd5e3527e55a703f6454a.png";
  const inputClasses = "w-full h-12 px-4 rounded-2xl border-2 border-border bg-background focus:border-primary focus:outline-none transition-colors";

  return (
    <>
      <Helmet>
        <title>Update Password - Family Playbook</title>
        <meta name="description" content="Update your Family Playbook password." />
        <meta property="og:title" content="Update Password - Family Playbook" />
        <meta property="og:image" content={defaultImage} />
        <meta property="og:url" content={`${siteUrl}/update-password`} />
      </Helmet>
      
      <div className="h-screen bg-background flex flex-col items-center justify-center p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md flex-grow flex flex-col justify-center py-8"
        >
          <div className="text-center mb-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-4xl bg-gradient-to-br from-primary/20 to-accent/20 mb-4 shadow-soft"
            >
              <span className="text-4xl">🔐</span>
            </motion.div>
            
            <h1 className="text-2xl font-bold text-foreground mb-1">
              Set New Password
            </h1>
            
            <p className="text-sm text-muted-foreground">
              Please enter your new password below.
            </p>
          </div>

          {!success ? (
            <div className="bg-white/50 dark:bg-gray-800/50 p-6 rounded-3xl border border-border shadow-sm space-y-4">
                
                <div>
                  <label className="block text-sm font-medium mb-1.5 ml-1 text-foreground">New Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter new password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`${inputClasses} pr-12`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5 ml-1 text-foreground">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdate();
                      }}
                      className={`${inputClasses} pr-12`}
                    />
                  </div>
                </div>

                <Button
                  onClick={handleUpdate}
                  disabled={loading}
                  className="w-full h-12 text-base font-semibold rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                >
                  {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Lock className="mr-2" size={20} />}
                  Update Password
                </Button>

                <div className="text-center pt-2">
                    <button
                        type="button"
                        onClick={() => handleNavigate('home')}
                        className="text-sm text-muted-foreground hover:text-foreground font-medium flex items-center justify-center gap-1 mx-auto transition-colors"
                    >
                        <ArrowLeft size={16} />
                        Cancel
                    </button>
                </div>
            </div>
          ) : (
             <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-green-50 dark:bg-green-900/20 p-6 rounded-3xl border border-green-100 dark:border-green-900 text-center"
             >
                <div className="w-16 h-16 bg-green-100 dark:bg-green-800/50 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600 dark:text-green-400">
                    <CheckCircle2 size={32} />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Password Updated!
                </h3>
                <p className="text-muted-foreground mb-6">
                  Your password has been changed successfully. Redirecting to home...
                </p>
             </motion.div>
          )}
        </motion.div>
      </div>
    </>
  );
};

export default UpdatePasswordScreen;
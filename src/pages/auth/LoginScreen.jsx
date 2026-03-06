import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Loader2, CheckCircle2, Lock, Eye, EyeOff, ArrowLeft, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useData } from '@/contexts/DataContext';
import { Helmet } from 'react-helmet';
import { useNavigation } from '@/hooks/useNavigation';

const LoginScreen = () => {
  const { toast } = useToast();
  const { signInWithOtp, signInWithGoogle, signInWithDiscord, signInWithFacebook, signIn, signUp, resetPasswordForEmail, session } = useAuth();
  const { fetchData } = useData();
  const handleNavigate = useNavigation();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authMethod, setAuthMethod] = useState('password'); 
  const [mode, setMode] = useState('login'); 
  const [hasPrefetched, setHasPrefetched] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (session) {
        handleNavigate('home');
    }
  }, [session, handleNavigate]);

  // OPTIMIZATION: Prefetch dashboard components when user starts typing
  const handleEmailChange = (e) => {
    const val = e.target.value;
    setEmail(val);

    // Trigger prefetch once when email is of a plausible length
    if (val.length > 3 && !hasPrefetched) {
       console.log("🚀 Preloading dashboard assets...");
       import('@/components/HomeScreen');
       import('@/components/MyBundlesScreen');
       import('@/components/GuidesLibrary');
       import('@/components/FavoritesScreen');
       setHasPrefetched(true);
    }
  };

  const handleMagicLink = async () => {
    const cleanEmail = email.trim(); 
    if (!cleanEmail) {
      toast({ title: "⚠️ Please enter an email.", variant: "destructive" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
       toast({ title: "⚠️ Invalid email format.", variant: "destructive" });
       return;
    }

    setLoading(true);
    const { error } = await signInWithOtp(cleanEmail);
    setLoading(false);

    if (!error) {
      setSent(true);
      toast({ 
        title: "✨ Magic Link Sent!", 
        description: "Check your email for the login link.",
      });
    }
  };

  const handlePasswordAuth = async () => {
    const cleanEmail = email.trim(); 

    if (!cleanEmail || !password) {
      toast({ title: "⚠️ Please fill in all fields.", variant: "destructive" });
      return;
    }
    
    setLoading(true);
    
    if (mode === 'signup') {
      const { error } = await signUp(cleanEmail, password);
      if (!error) {
        setSent(true);
        toast({ 
          title: "Account Created! 🎉", 
          description: "Please check your email to confirm your account.",
        });
      }
    } else {
      // OPTIMIZATION: Fetch Data BEFORE navigation
      const { data, error } = await signIn(cleanEmail, password);
      
      if (!error && data?.user) {
        toast({ title: "Welcome back! 👋", description: "Successfully signed in." });
        
        // Start fetching data immediately using the user object we just got
        // This ensures data is ready before the screen transition completes
        try {
           await fetchData(data.user);
        } catch(e) {
           console.error("Prefetch failed", e);
        }

        handleNavigate('home');
      }
    }
    
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    const cleanEmail = email.trim();

    if (!cleanEmail) {
       toast({ title: "⚠️ Please enter your email.", variant: "destructive" });
       return;
    }

    setLoading(true);
    const { error } = await resetPasswordForEmail(cleanEmail);
    setLoading(false);

    if (!error) {
       setSent(true);
       toast({
         title: "Reset Link Sent",
         description: "Check your email for password reset instructions.",
         variant: "success"
       });
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    await signInWithGoogle();
  };

  const handleFacebookSignIn = async () => {
    setFacebookLoading(true);
    await signInWithFacebook();
  };

  const handleDiscordSignIn = async () => {
    setDiscordLoading(true);
    await signInWithDiscord();
  };

  const siteUrl = "https://familyplaybook.app";
  const defaultImage = "/icon-192x192.png";
  const inputClasses = "w-full h-12 px-4 rounded-2xl border-2 border-border bg-background focus:border-primary focus:outline-none transition-colors";
  const isForgotPasswordMode = mode === 'forgot_password';
  
  let title = "Welcome to Family Playbook";
  let subtitle = "Sign in or create an account to get started";

  if (isForgotPasswordMode) {
      title = "Reset Password";
      subtitle = "Enter your email to receive reset instructions";
  }

  return (
    <>
      <Helmet>
        <title>{isForgotPasswordMode ? "Reset Password" : "Login"} - Family Playbook</title>
        <meta name="description" content="Log in to your Family Playbook account." />
        <meta property="og:title" content="Login - Family Playbook" />
        <meta property="og:description" content="Log in to your Family Playbook account." />
        <meta property="og:image" content={defaultImage} />
        <meta property="og:url" content={`${siteUrl}/login`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Login - Family Playbook" />
        <meta name="twitter:description" content="Log in to your Family Playbook account." />
        <meta name="twitter:image" content={defaultImage} />
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
              <span className="text-4xl">
                 {isForgotPasswordMode ? '🔐' : '📖'}
              </span>
            </motion.div>
            
            <h1 className="text-2xl font-bold text-foreground mb-1">
              {title}
            </h1>
            
            <p className="text-sm text-muted-foreground">
              {subtitle}
            </p>
          </div>

          {!sent ? (
            <div className="bg-white/50 dark:bg-gray-800/50 p-6 rounded-3xl border border-border shadow-sm">
                
                {!isForgotPasswordMode && (
                  <>
                    <div className="flex gap-3 mb-6">
                      <Button
                        variant="outline"
                        onClick={handleGoogleSignIn}
                        disabled={googleLoading || discordLoading || facebookLoading || loading}
                        className="flex-1 h-11 rounded-xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm hover:shadow-md"
                        aria-label="Sign in with Google"
                      >
                        {googleLoading ? (
                          <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                        ) : (
                          <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path
                              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                              fill="#4285F4"
                            />
                            <path
                              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                              fill="#34A853"
                            />
                            <path
                              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                              fill="#FBBC05"
                            />
                            <path
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                              fill="#EA4335"
                            />
                          </svg>
                        )}
                      </Button>

                      <Button
                        variant="outline"
                        onClick={handleFacebookSignIn}
                        disabled={googleLoading || discordLoading || facebookLoading || loading}
                        className="flex-1 h-11 rounded-xl bg-[#1877F2] border-2 border-[#1877F2] text-white transition-all shadow-sm hover:shadow-md hover:opacity-90"
                        aria-label="Sign in with Facebook"
                      >
                        {facebookLoading ? (
                          <Loader2 className="h-5 w-5 animate-spin text-white" />
                        ) : (
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                          </svg>
                        )}
                      </Button>

                      <Button
                        variant="outline"
                        onClick={handleDiscordSignIn}
                        disabled={googleLoading || discordLoading || facebookLoading || loading}
                        className="flex-1 h-11 rounded-xl bg-[#5865F2] border-2 border-[#5865F2] text-white transition-all shadow-sm hover:shadow-md hover:opacity-90"
                        aria-label="Sign in with Discord"
                      >
                        {discordLoading ? (
                          <Loader2 className="h-5 w-5 animate-spin text-white" />
                        ) : (
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.419-2.1569 2.419zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.419-2.1568 2.419z"/>
                          </svg>
                        )}
                      </Button>
                    </div>

                    <div className="relative mb-6">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-gray-200 dark:border-gray-700" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-[#FAF9F6] dark:bg-gray-900 px-2 text-muted-foreground font-medium">
                          Or continue with email
                        </span>
                      </div>
                    </div>

                    <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-6">
                      <button 
                        type="button"
                        onClick={() => { setAuthMethod('password'); setSent(false); setMode('login'); }}
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${authMethod === 'password' ? 'bg-white dark:bg-gray-700 shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        Password
                      </button>
                      <button 
                        type="button"
                        onClick={() => { setAuthMethod('magic'); setSent(false); setMode('login'); }}
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${authMethod === 'magic' ? 'bg-white dark:bg-gray-700 shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        Magic Link
                      </button>
                    </div>
                  </>
                )}

                <AnimatePresence mode="wait">
                  {isForgotPasswordMode ? (
                     <motion.div
                        key="forgot-password"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-4"
                     >
                        <div>
                          <label className="block text-sm font-medium mb-1.5 ml-1 text-foreground">Email Address</label>
                          <input
                            type="email"
                            placeholder="Enter your email address"
                            value={email}
                            onChange={handleEmailChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleForgotPassword();
                              }
                            }}
                            className={inputClasses}
                            autoFocus
                          />
                        </div>
                        
                        <Button
                          onClick={handleForgotPassword}
                          disabled={loading}
                          className="w-full h-12 text-base font-semibold rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                        >
                          {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <KeyRound className="mr-2" size={20} />}
                          Send Reset Link
                        </Button>

                        <div className="text-center pt-2">
                           <button
                             type="button"
                             onClick={() => { setMode('login'); setSent(false); }}
                             className="text-sm text-muted-foreground hover:text-foreground font-medium flex items-center justify-center gap-1 mx-auto transition-colors"
                           >
                             <ArrowLeft size={16} />
                             Back to login
                           </button>
                        </div>
                     </motion.div>
                  ) : authMethod === 'password' ? (
                    <motion.div
                      key="password"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-4"
                    >
                      <div>
                        <label className="block text-sm font-medium mb-1.5 ml-1 text-foreground">Email Address</label>
                        <input
                          type="email"
                          placeholder="Enter your email address"
                          value={email}
                          onChange={handleEmailChange}
                          className={inputClasses}
                        />
                      </div>
                      
                      <div>
                        <div className="flex justify-between items-center mb-1.5 ml-1">
                            <label className="block text-sm font-medium text-foreground">Password</label>
                            <button 
                                type="button"
                                onClick={() => { setMode('forgot_password'); setSent(false); }} 
                                className="text-xs font-medium text-primary hover:text-primary/80 hover:underline transition-all"
                            >
                                Forgot Password?
                            </button>
                        </div>
                        <div className="relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handlePasswordAuth();
                              }
                            }}
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

                      <Button
                        onClick={handlePasswordAuth}
                        disabled={loading || googleLoading || discordLoading || facebookLoading}
                        className="w-full h-12 text-base font-semibold rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                      >
                        {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Lock className="mr-2" size={20} />}
                        {mode === 'signup' ? "Create Account" : "Sign In"}
                      </Button>

                      <div className="text-center pt-1">
                        <button
                          type="button"
                          onClick={() => { 
                             setMode(mode === 'login' ? 'signup' : 'login'); 
                             setPassword(''); 
                          }}
                          className="text-sm text-primary hover:text-primary/80 font-medium hover:underline transition-all"
                        >
                          {mode === 'signup' 
                            ? "Already have an account? Sign In" 
                            : "Need an account? Create one"}
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="magic"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-3"
                    >
                      <div>
                        <label className="block text-sm font-medium mb-1.5 ml-1 text-foreground">Email Address</label>
                        <input
                          type="email"
                          placeholder="Enter your email address"
                          value={email}
                          onChange={handleEmailChange}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleMagicLink();
                            }
                          }}
                          className={inputClasses}
                        />
                      </div>
                      <Button
                        onClick={handleMagicLink}
                        disabled={loading || googleLoading || discordLoading || facebookLoading}
                        className="w-full h-12 text-base font-semibold rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                      >
                        {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Mail className="mr-2" size={20} />}
                        Send Magic Link
                      </Button>
                      <p className="text-center text-xs text-muted-foreground pt-1">
                        We'll email you a magic link for a password-free sign in.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
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
                  {mode === 'forgot_password' 
                    ? "Check your email" 
                    : (authMethod === 'magic' ? "Check your email" : (mode === 'signup' ? "Verify your account" : "Success!"))}
                </h3>
                <p className="text-muted-foreground mb-6">
                   {mode === 'forgot_password' && <span>We sent reset instructions to <strong>{email}</strong></span>}
                   {mode !== 'forgot_password' && authMethod === 'magic' && <span>We sent a login link to <strong>{email}</strong></span>}
                   {mode === 'signup' && <span>We sent a confirmation link to <strong>{email}</strong>. Please click it to finish signing up.</span>}
                </p>
                <Button 
                    variant="outline" 
                    onClick={() => { setSent(false); if(mode === 'forgot_password') setMode('login'); }}
                    className="rounded-full"
                >
                    Back to login
                </Button>
             </motion.div>
          )}

          <p className="text-center text-xs text-muted-foreground mt-8">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </motion.div>
      </div>
    </>
  );
};

export default LoginScreen;
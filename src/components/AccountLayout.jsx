import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { User, CreditCard, Settings } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { LoadingSpinner } from '@/components/AccountComponents';

const AccountLayout = ({ children }) => {
    const { user, loading } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    // Determine active tab based on current URL
    const getActiveTab = () => {
        const path = location.pathname;
        if (path.includes('/plans') || path.includes('/subscription')) return 'plans';
        if (path.includes('/settings')) return 'settings';
        return 'profile';
    };

    const activeTab = getActiveTab();

    const handleTabChange = (value) => {
        switch (value) {
            case 'profile':
                navigate('/account');
                break;
            case 'plans':
                navigate('/account/plans');
                break;
            case 'settings':
                navigate('/account/settings');
                break;
            default:
                navigate('/account');
        }
    };

    if (loading) return <LoadingSpinner />;
    if (!user) {
        // Fallback for protected route redirect lag
        return <LoadingSpinner />;
    }

    return (
        <div className="min-h-screen bg-[#FAF9F6] dark:bg-gray-950 pb-32 font-sans transition-colors duration-300">
            <Helmet>
                <title>My Account - Family Playbook</title>
                <meta name="description" content="Manage your account settings, plans, and profile." />
            </Helmet>

            <header className="p-6 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 mb-6 transition-colors duration-300">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 max-w-5xl mx-auto">My Account</h1>
            </header>

            <main className="px-4 md:px-6 max-w-5xl mx-auto">
                <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 bg-gray-200 dark:bg-gray-800 rounded-xl p-1 mb-8 gap-1 shadow-inner max-w-md mx-auto">
                        <TabsTrigger 
                            value="profile" 
                            className="flex items-center justify-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-[#5CA9E9] data-[state=active]:shadow-sm transition-all py-2 rounded-lg"
                        >
                            <User size={16} /> <span className="hidden sm:inline">Profile</span>
                        </TabsTrigger>
                        <TabsTrigger 
                            value="plans" 
                            className="flex items-center justify-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-[#5CA9E9] data-[state=active]:shadow-sm transition-all py-2 rounded-lg"
                        >
                            <CreditCard size={16} /> <span className="hidden sm:inline">Plans</span>
                        </TabsTrigger>
                        <TabsTrigger 
                            value="settings" 
                            className="flex items-center justify-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-[#5CA9E9] data-[state=active]:shadow-sm transition-all py-2 rounded-lg"
                        >
                            <Settings size={16} /> <span className="hidden sm:inline">Settings</span>
                        </TabsTrigger>
                    </TabsList>
                    
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 focus-visible:outline-none">
                        {children}
                    </div>
                </Tabs>
            </main>
        </div>
    );
};

export default AccountLayout;
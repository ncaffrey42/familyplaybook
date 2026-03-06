import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from "@/components/ui/toaster";
import { EntitlementProvider } from './contexts/EntitlementContext';
import { UsageTrackingProvider } from './contexts/UsageTrackingContext';
import { LimitNotificationProvider } from './contexts/LimitNotificationContext';
import { DataProvider } from './contexts/DataContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import LimitNotificationModal from './components/LimitNotificationModal';
import BottomNav from './components/BottomNav';
import PrivateRoute from './components/PrivateRoute';
import LazyRoute from './components/LazyRoute';
import useScrollToTop from '@/hooks/useScrollToTop';

// Auth — eager load login/check-email as they are the entry point
import LoginScreen from './pages/auth/LoginScreen';
import CheckEmailScreen from './pages/auth/CheckEmailScreen';

// Auth — lazy
const AuthCallback = lazy(() => import('./pages/auth/AuthCallback'));
const UpdatePasswordScreen = lazy(() => import('./pages/auth/UpdatePasswordScreen'));
const PhoneVerificationScreen = lazy(() => import('./pages/auth/PhoneVerificationScreen'));
const OnboardingScreen = lazy(() => import('./pages/auth/OnboardingScreen'));

// Home
const HomeScreen = lazy(() => import('./pages/home/HomeScreen'));

// Guides
const GuidesLibrary = lazy(() => import('./pages/guides/GuidesLibrary'));
const CreateGuideScreen = lazy(() => import('./pages/guides/CreateGuideScreen'));
const GuideDetail = lazy(() => import('./pages/guides/GuideDetail'));

// Bundles
const MyBundlesScreen = lazy(() => import('./pages/bundles/MyBundlesScreen'));
const CreateBundleScreen = lazy(() => import('./pages/bundles/CreateBundleScreen'));
const BundleDetail = lazy(() => import('./pages/bundles/BundleDetail'));
const BundlesLibrary = lazy(() => import('./pages/library/BundlesLibrary'));

// Packs (legacy naming — kept for backward-compat routes, same concept as bundles)
const MyPacksScreen = lazy(() => import('./pages/packs/MyPacksScreen'));
const CreatePackScreen = lazy(() => import('./pages/packs/CreatePackScreen'));
const PackDetail = lazy(() => import('./pages/packs/PackDetail'));
const ArchivedPacksScreen = lazy(() => import('./pages/packs/ArchivedPacksScreen'));

// Library
const PacksLibrary = lazy(() => import('./pages/library/PacksLibrary'));

// Account
const MyAccount = lazy(() => import('./pages/account/MyAccount'));
const PlansPage = lazy(() => import('./pages/account/PlansPage'));
const AccountSettings = lazy(() => import('./pages/account/AccountSettings'));
const SubscriptionScreen = lazy(() => import('./pages/account/SubscriptionScreen'));
const ManageFamilyScreen = lazy(() => import('./pages/account/ManageFamilyScreen'));
const SettingsScreen = lazy(() => import('./pages/account/SettingsScreen'));
const UpgradeFlow = lazy(() => import('./pages/account/UpgradeFlow'));

// Share
const PublicSharePage = lazy(() => import('./pages/share/PublicSharePage'));

// Other pages
const SearchScreen = lazy(() => import('./pages/SearchScreen'));
const FavoritesScreen = lazy(() => import('./pages/FavoritesScreen'));
const ArchivedItemsScreen = lazy(() => import('./pages/ArchivedItemsScreen'));
const HostMode = lazy(() => import('./pages/HostMode'));
const NotFoundScreen = lazy(() => import('./pages/NotFoundScreen'));

// Admin
const ErrorLogScreen = lazy(() => import('./pages/admin/ErrorLogScreen'));

// Dev only
const DebugRegressionTest = lazy(() => import('./pages/admin/DebugRegressionTest'));

const AddToHomeScreenPrompt = lazy(() => import('./components/AddToHomeScreenPrompt'));

const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
);

const AppContent = () => {
  const { user } = useAuth();
  const location = useLocation();

  useScrollToTop();

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log(`[ROUTE] ${location.pathname}`);
    }
  }, [location]);

  const hideNavPaths = [
    '/login',
    '/check-email',
    '/auth/callback',
    '/update-password',
    '/verify-phone',
    '/host-mode',
    '/onboarding',
    '/debug/regression-test',
  ];

  const shouldHideNav =
    hideNavPaths.includes(location.pathname) ||
    location.pathname.startsWith('/share/');

  return (
    <div className={`min-h-screen bg-background ${user && !shouldHideNav ? 'pb-20' : ''}`}>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/check-email" element={<CheckEmailScreen />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/share/:shareId" element={<PublicSharePage />} />
          <Route path="/update-password" element={<UpdatePasswordScreen />} />
          <Route path="/verify-phone" element={<PhoneVerificationScreen />} />
          <Route path="/onboarding" element={<OnboardingScreen />} />

          {/* Home */}
          <Route path="/" element={<PrivateRoute><LazyRoute><HomeScreen /></LazyRoute></PrivateRoute>} />
          <Route path="/home" element={<PrivateRoute><LazyRoute><HomeScreen /></LazyRoute></PrivateRoute>} />

          {/* Packs routes (legacy naming) */}
          <Route path="/packs" element={<LazyRoute><MyPacksScreen /></LazyRoute>} />
          <Route path="/packs/create" element={<LazyRoute><CreatePackScreen /></LazyRoute>} />
          <Route path="/packs/archived" element={<LazyRoute><ArchivedPacksScreen /></LazyRoute>} />
          <Route path="/pack/:id" element={<LazyRoute><PackDetail /></LazyRoute>} />

          {/* Guides */}
          <Route path="/guides" element={<LazyRoute><GuidesLibrary /></LazyRoute>} />
          <Route path="/library" element={<LazyRoute><GuidesLibrary /></LazyRoute>} />
          <Route path="/guides/create" element={<LazyRoute><CreateGuideScreen /></LazyRoute>} />
          <Route path="/guide/new" element={<LazyRoute><CreateGuideScreen /></LazyRoute>} />
          <Route path="/guide/:id" element={<LazyRoute><GuideDetail /></LazyRoute>} />
          <Route path="/guide/:id/edit" element={<LazyRoute><CreateGuideScreen /></LazyRoute>} />

          {/* Bundles */}
          <Route path="/bundles" element={<LazyRoute><MyBundlesScreen /></LazyRoute>} />
          <Route path="/bundles/create" element={<LazyRoute><CreateBundleScreen /></LazyRoute>} />
          <Route path="/createBundle" element={<LazyRoute><CreateBundleScreen /></LazyRoute>} />
          <Route path="/bundle/:id" element={<LazyRoute><BundleDetail /></LazyRoute>} />
          <Route path="/bundle/:id/edit" element={<LazyRoute><CreateBundleScreen /></LazyRoute>} />

          {/* Library */}
          <Route path="/library/packs" element={<LazyRoute><PacksLibrary /></LazyRoute>} />
          <Route path="/library/guide/:id" element={<LazyRoute><GuideDetail /></LazyRoute>} />
          <Route path="/library/bundles" element={<LazyRoute><BundlesLibrary /></LazyRoute>} />
          <Route path="/library/bundle/:id" element={<LazyRoute><BundleDetail /></LazyRoute>} />

          {/* Search */}
          <Route path="/search" element={<LazyRoute><SearchScreen /></LazyRoute>} />

          {/* Account */}
          <Route path="/account" element={<PrivateRoute><LazyRoute><MyAccount /></LazyRoute></PrivateRoute>} />
          <Route path="/account/plans" element={<PrivateRoute><LazyRoute><PlansPage /></LazyRoute></PrivateRoute>} />
          <Route path="/plans" element={<PrivateRoute><LazyRoute><PlansPage /></LazyRoute></PrivateRoute>} />
          <Route path="/account/settings" element={<PrivateRoute><LazyRoute><AccountSettings /></LazyRoute></PrivateRoute>} />
          <Route path="/account/subscription" element={<LazyRoute><SubscriptionScreen /></LazyRoute>} />
          <Route path="/account/upgrade" element={<LazyRoute><UpgradeFlow /></LazyRoute>} />
          <Route path="/account/family" element={<LazyRoute><ManageFamilyScreen /></LazyRoute>} />
          <Route path="/settings" element={<LazyRoute><SettingsScreen /></LazyRoute>} />

          {/* Other */}
          <Route path="/host-mode" element={<LazyRoute><HostMode /></LazyRoute>} />
          <Route path="/favorites" element={<LazyRoute><FavoritesScreen /></LazyRoute>} />
          <Route path="/archived-items" element={<LazyRoute><ArchivedItemsScreen /></LazyRoute>} />

          {/* Admin */}
          <Route path="/admin/errors" element={<LazyRoute><ErrorLogScreen /></LazyRoute>} />

          {/* Dev */}
          {import.meta.env.DEV && (
            <Route path="/debug/regression-test" element={<LazyRoute><DebugRegressionTest /></LazyRoute>} />
          )}

          {/* 404 */}
          <Route path="*" element={<LazyRoute><NotFoundScreen /></LazyRoute>} />
        </Routes>

        {user && !shouldHideNav && <BottomNav />}
        <LimitNotificationModal />
        <AddToHomeScreenPrompt />
        <Toaster />
      </Suspense>
    </div>
  );
};

const App = () => {
  return (
    <ErrorBoundary>
      <EntitlementProvider>
        <UsageTrackingProvider>
          <LimitNotificationProvider>
            <DataProvider>
              <AppContent />
            </DataProvider>
          </LimitNotificationProvider>
        </UsageTrackingProvider>
      </EntitlementProvider>
    </ErrorBoundary>
  );
};

export default App;

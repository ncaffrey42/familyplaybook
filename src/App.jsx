import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { FAMILY_SHARING_ENABLED, HOST_MODE_ENABLED } from '@/lib/featureFlags';
import { Toaster } from "@/components/ui/toaster";
import { EntitlementProvider } from './contexts/EntitlementContext';
import { UsageTrackingProvider } from './contexts/UsageTrackingContext';
import { LimitNotificationProvider } from './contexts/LimitNotificationContext';
import { DataProvider } from './contexts/DataContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import LimitNotificationModal from './components/LimitNotificationModal';
import BottomNav from './components/BottomNav';
import CreateFab from './components/CreateFab';
import PrivateRoute from './components/PrivateRoute';
import LazyRoute from './components/LazyRoute';
import useScrollToTop from '@/hooks/useScrollToTop';

// Auth — eager load login/check-email as they are the entry point
import LoginScreen from './pages/auth/LoginScreen';
import CheckEmailScreen from './pages/auth/CheckEmailScreen';

// Auth — lazy
const AuthCallback = lazy(() => import('./pages/auth/AuthCallback'));
const UpdatePasswordScreen = lazy(() => import('./pages/auth/UpdatePasswordScreen'));
const OnboardingScreen = lazy(() => import('./pages/auth/OnboardingScreen'));

// Home
const HomeScreen = lazy(() => import('./pages/home/HomeScreen'));

// Guides
const GuidesLibrary = lazy(() => import('./pages/guides/GuidesLibrary'));
const CreateGuideScreen = lazy(() => import('./pages/guides/CreateGuideScreen'));
const GuideDetail = lazy(() => import('./pages/guides/GuideDetail'));

// Bundles
const CreateBundleScreen = lazy(() => import('./pages/bundles/CreateBundleScreen'));
const BundleDetail = lazy(() => import('./pages/bundles/BundleDetail'));

// Packs (legacy naming — kept for backward-compat routes, same concept as bundles)
const PackDetail = lazy(() => import('./pages/packs/PackDetail'));
// Account
const MyAccount = lazy(() => import('./pages/account/MyAccount'));
const PlansPage = lazy(() => import('./pages/account/PlansPage'));
const AccountSettings = lazy(() => import('./pages/account/AccountSettings'));
const SubscriptionScreen = lazy(() => import('./pages/account/SubscriptionScreen'));
const ManageFamilyScreen = lazy(() => import('./pages/account/ManageFamilyScreen'));
const SettingsScreen = lazy(() => import('./pages/account/SettingsScreen'));
const UpgradeFlow = lazy(() => import('./pages/account/UpgradeFlow'));

// Share
const ShareCenterScreen = lazy(() => import('./pages/share/ShareCenterScreen'));
const ShareScreen = lazy(() => import('./pages/share/ShareScreen'));
const PublicSharePage = lazy(() => import('./pages/share/PublicSharePage'));

// Invite
const AcceptInviteScreen = lazy(() => import('./pages/invite/AcceptInviteScreen'));

// Other pages
const SearchScreen = lazy(() => import('./pages/SearchScreen'));
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
    '/host-mode',
    '/onboarding',
    '/invite/accept',
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
          <Route path="/invite/accept" element={FAMILY_SHARING_ENABLED ? <LazyRoute><AcceptInviteScreen /></LazyRoute> : <Navigate to="/" replace />} />
          <Route path="/update-password" element={<UpdatePasswordScreen />} />
          <Route path="/onboarding" element={<OnboardingScreen />} />

          {/* Home */}
          <Route path="/" element={<PrivateRoute><LazyRoute><HomeScreen /></LazyRoute></PrivateRoute>} />
          <Route path="/home" element={<PrivateRoute><LazyRoute><HomeScreen /></LazyRoute></PrivateRoute>} />

          {/* Guides — the one destination for guides / bundles / library.
              Retired routes redirect into the right segment so old links
              (and the legacy pack family) keep working. */}
          <Route path="/guides" element={<PrivateRoute><LazyRoute><GuidesLibrary /></LazyRoute></PrivateRoute>} />
          <Route path="/library" element={<Navigate to="/guides?segment=library" replace />} />
          <Route path="/bundles" element={<Navigate to="/guides?segment=bundles" replace />} />
          <Route path="/favorites" element={<Navigate to="/guides?chip=pinned" replace />} />
          <Route path="/packs" element={<Navigate to="/guides?segment=bundles" replace />} />
          <Route path="/packs/create" element={<Navigate to="/bundles/create" replace />} />
          <Route path="/pack/:id" element={<PrivateRoute><LazyRoute><PackDetail /></LazyRoute></PrivateRoute>} />

          <Route path="/guides/create" element={<PrivateRoute><LazyRoute><CreateGuideScreen /></LazyRoute></PrivateRoute>} />
          <Route path="/guide/new" element={<PrivateRoute><LazyRoute><CreateGuideScreen /></LazyRoute></PrivateRoute>} />
          <Route path="/guide/:id" element={<PrivateRoute><LazyRoute><GuideDetail /></LazyRoute></PrivateRoute>} />
          <Route path="/guide/:id/edit" element={<PrivateRoute><LazyRoute><CreateGuideScreen /></LazyRoute></PrivateRoute>} />

          {/* Bundles (details/creation keep their routes) */}
          <Route path="/bundles/create" element={<PrivateRoute><LazyRoute><CreateBundleScreen /></LazyRoute></PrivateRoute>} />
          <Route path="/createBundle" element={<PrivateRoute><LazyRoute><CreateBundleScreen /></LazyRoute></PrivateRoute>} />
          <Route path="/bundle/:id" element={<PrivateRoute><LazyRoute><BundleDetail /></LazyRoute></PrivateRoute>} />
          <Route path="/bundle/:id/edit" element={<PrivateRoute><LazyRoute><CreateBundleScreen /></LazyRoute></PrivateRoute>} />

          {/* Library detail views */}
          <Route path="/library/guide/:id" element={<PrivateRoute><LazyRoute><GuideDetail /></LazyRoute></PrivateRoute>} />
          <Route path="/library/bundles" element={<Navigate to="/guides?segment=bundles" replace />} />
          <Route path="/library/bundle/:id" element={<PrivateRoute><LazyRoute><BundleDetail /></LazyRoute></PrivateRoute>} />

          {/* Share tab (owner's team surface) */}
          <Route path="/share-manage/:shareId" element={<PrivateRoute><LazyRoute><ShareScreen /></LazyRoute></PrivateRoute>} />
          <Route path="/share-center" element={<PrivateRoute><LazyRoute><ShareCenterScreen /></LazyRoute></PrivateRoute>} />

          {/* Search */}
          <Route path="/search" element={<PrivateRoute><LazyRoute><SearchScreen /></LazyRoute></PrivateRoute>} />

          {/* Account */}
          <Route path="/account" element={<PrivateRoute><LazyRoute><MyAccount /></LazyRoute></PrivateRoute>} />
          <Route path="/account/plans" element={<PrivateRoute><LazyRoute><PlansPage /></LazyRoute></PrivateRoute>} />
          <Route path="/plans" element={<PrivateRoute><LazyRoute><PlansPage /></LazyRoute></PrivateRoute>} />
          <Route path="/account/settings" element={<PrivateRoute><LazyRoute><AccountSettings /></LazyRoute></PrivateRoute>} />
          <Route path="/account/subscription" element={<PrivateRoute><LazyRoute><SubscriptionScreen /></LazyRoute></PrivateRoute>} />
          <Route path="/account/upgrade" element={<PrivateRoute><LazyRoute><UpgradeFlow /></LazyRoute></PrivateRoute>} />
          <Route path="/account/family" element={FAMILY_SHARING_ENABLED ? <PrivateRoute><LazyRoute><ManageFamilyScreen /></LazyRoute></PrivateRoute> : <Navigate to="/account" replace />} />
          <Route path="/settings" element={<PrivateRoute><LazyRoute><SettingsScreen /></LazyRoute></PrivateRoute>} />

          {/* Other */}
          <Route path="/host-mode" element={HOST_MODE_ENABLED ? <PrivateRoute><LazyRoute><HostMode /></LazyRoute></PrivateRoute> : <Navigate to="/account" replace />} />

          {/* Admin */}
          <Route path="/admin/errors" element={<PrivateRoute><LazyRoute><ErrorLogScreen /></LazyRoute></PrivateRoute>} />

          {/* Dev */}
          {import.meta.env.DEV && (
            <Route path="/debug/regression-test" element={<LazyRoute><DebugRegressionTest /></LazyRoute>} />
          )}

          {/* 404 */}
          <Route path="*" element={<LazyRoute><NotFoundScreen /></LazyRoute>} />
        </Routes>

        {user && !shouldHideNav && <BottomNav />}
        {user && !shouldHideNav && <CreateFab />}
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

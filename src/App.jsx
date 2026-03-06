/*
 * HORIZONS "NO SIDE EFFECTS" RULE:
 * 1. Entitlement/billing code changes must NOT touch routing, page lists, or navigation.
 * 2. Navigation/routing changes must NOT touch entitlement logic.
 * 3. Plan limit checks must ONLY block CREATE/IMPORT/UPLOAD/INVITE, never VIEW/LIST/OPEN.
 */

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
import LoginScreen from './components/LoginScreen';
import CheckEmailScreen from './components/CheckEmailScreen';
import PrivateRoute from './components/PrivateRoute';
import LazyRoute from './components/LazyRoute';
import useScrollToTop from '@/hooks/useScrollToTop';

// Eager load critical components
import HomeScreen from './components/HomeScreen';

// Lazy load non-critical routes
const MyPacksScreen = lazy(() => import('./components/MyPacksScreen'));
const CreatePackScreen = lazy(() => import('./components/CreatePackScreen'));
const PackDetail = lazy(() => import('./components/PackDetail'));
const GuidesLibrary = lazy(() => import('./components/GuidesLibrary'));
const CreateGuideScreen = lazy(() => import('./components/CreateGuideScreen'));
const GuideDetail = lazy(() => import('./components/GuideDetail'));
const PacksLibrary = lazy(() => import('./components/PacksLibrary'));
const ViewLibraryPack = lazy(() => import('./components/ViewLibraryPack'));
// ViewLibraryGuide replaced by unified GuideDetail
const ViewLibraryGuide = lazy(() => import('./components/ViewLibraryGuide'));

// Account Pages
const MyAccount = lazy(() => import('./components/MyAccount'));
const PlansPage = lazy(() => import('./components/PlansPage'));
const AccountSettings = lazy(() => import('./components/AccountSettings'));

const SubscriptionScreen = lazy(() => import('./components/SubscriptionScreen'));
const SettingsScreen = lazy(() => import('./components/SettingsScreen'));
const UpdatePasswordScreen = lazy(() => import('./components/UpdatePasswordScreen'));
const SearchScreen = lazy(() => import('./components/SearchScreen'));
const PublicSharePage = lazy(() => import('./components/PublicSharePage'));
const AuthCallback = lazy(() => import('./components/AuthCallback'));
const NotFoundScreen = lazy(() => import('./components/NotFoundScreen'));
const PhoneVerificationScreen = lazy(() => import('./components/PhoneVerificationScreen'));
const HostMode = lazy(() => import('./components/HostMode'));
const FavoritesScreen = lazy(() => import('./components/FavoritesScreen'));

// Bundles
const MyBundlesScreen = lazy(() => import('./components/MyBundlesScreen'));
const CreateBundleScreen = lazy(() => import('./components/CreateBundleScreen'));
const BundleDetail = lazy(() => import('./components/BundleDetail'));
const BundlesLibrary = lazy(() => import('./components/BundlesLibrary'));
// ViewLibraryBundle is deprecated in favor of unified BundleDetail
const ViewLibraryBundle = lazy(() => import('./components/ViewLibraryBundle'));

const AddToHomeScreenPrompt = lazy(() => import('./components/AddToHomeScreenPrompt'));
const ArchivedPacksScreen = lazy(() => import('./components/ArchivedPacksScreen'));
const ArchivedItemsScreen = lazy(() => import('./components/ArchivedItemsScreen'));
const ManageFamilyScreen = lazy(() => import('./components/ManageFamilyScreen'));
const ErrorLogScreen = lazy(() => import('./components/ErrorLogScreen'));
const UpgradeFlow = lazy(() => import('./components/UpgradeFlow'));

// Dev Only
const DebugRegressionTest = lazy(() => import('./pages/DebugRegressionTest'));

// Loading component
const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
);

const AppContent = () => {
  const { user } = useAuth();
  const location = useLocation();

  // Use the scroll to top hook
  useScrollToTop();

  // Dev-only route logging
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log(`[ROUTE] Navigating to: ${location.pathname}`);
    }
  }, [location]);

  // Define paths where BottomNav should be hidden
  const hideNavPaths = [
    '/login',
    '/check-email',
    '/auth/callback',
    '/update-password',
    '/verify-phone',
    '/host-mode',
    '/onboarding',
    '/debug/regression-test'
  ];

  // Also hide on share pages
  const shouldHideNav = hideNavPaths.includes(location.pathname) || 
                        location.pathname.startsWith('/share/');

  return (
    <div className={`min-h-screen bg-background ${user && !shouldHideNav ? 'pb-20' : ''}`}>
       <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/check-email" element={<CheckEmailScreen />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/share/:shareId" element={<PublicSharePage />} />
            <Route path="/update-password" element={<UpdatePasswordScreen />} />
            <Route path="/verify-phone" element={<PhoneVerificationScreen />} />

            {/* Protected Routes */}
            <Route path="/" element={<PrivateRoute><HomeScreen /></PrivateRoute>} />
            <Route path="/home" element={<PrivateRoute><HomeScreen /></PrivateRoute>} />
            
            {/* Packs/Bundles Routes */}
            <Route path="/packs" element={<LazyRoute><MyPacksScreen /></LazyRoute>} />
            <Route path="/packs/create" element={<LazyRoute><CreatePackScreen /></LazyRoute>} />
            <Route path="/packs/archived" element={<LazyRoute><ArchivedPacksScreen /></LazyRoute>} />
            <Route path="/pack/:id" element={<LazyRoute><PackDetail /></LazyRoute>} />
            
            {/* Guides Routes */}
            <Route path="/guides" element={<LazyRoute><GuidesLibrary /></LazyRoute>} />
            <Route path="/library" element={<LazyRoute><GuidesLibrary /></LazyRoute>} />
            <Route path="/guides/create" element={<LazyRoute><CreateGuideScreen /></LazyRoute>} />
            <Route path="/guide/new" element={<LazyRoute><CreateGuideScreen /></LazyRoute>} />
            <Route path="/guide/:id" element={<LazyRoute><GuideDetail /></LazyRoute>} />
            <Route path="/guide/:id/edit" element={<LazyRoute><CreateGuideScreen /></LazyRoute>} />
            
            {/* Bundle Specific Routes */}
            <Route path="/bundles" element={<LazyRoute><MyBundlesScreen /></LazyRoute>} />
            <Route path="/bundles/create" element={<LazyRoute><CreateBundleScreen /></LazyRoute>} />
            <Route path="/createBundle" element={<LazyRoute><CreateBundleScreen /></LazyRoute>} />
            {/* Unified Bundle Detail Route for both user and library bundles */}
            <Route path="/bundle/:id" element={<LazyRoute><BundleDetail /></LazyRoute>} />
            <Route path="/bundle/:id/edit" element={<LazyRoute><CreateBundleScreen /></LazyRoute>} />
            
            {/* Library Routes */}
            <Route path="/library/packs" element={<LazyRoute><PacksLibrary /></LazyRoute>} />
            <Route path="/library/pack/:id" element={<LazyRoute><ViewLibraryPack /></LazyRoute>} />
            
            {/* Unified Guide Detail for Library Items */}
            <Route path="/library/guide/:id" element={<LazyRoute><GuideDetail /></LazyRoute>} />
            
            <Route path="/library/bundles" element={<LazyRoute><BundlesLibrary /></LazyRoute>} />
            {/* Pointing library bundle view to BundleDetail to use unified logic */}
            <Route path="/library/bundle/:id" element={<LazyRoute><BundleDetail /></LazyRoute>} />

            <Route path="/search" element={<LazyRoute><SearchScreen /></LazyRoute>} />
            
            {/* Account Routes (Tabs) */}
            <Route path="/account" element={<PrivateRoute><LazyRoute><MyAccount /></LazyRoute></PrivateRoute>} />
            <Route path="/account/plans" element={<PrivateRoute><LazyRoute><PlansPage /></LazyRoute></PrivateRoute>} />
            <Route path="/plans" element={<PrivateRoute><LazyRoute><PlansPage /></LazyRoute></PrivateRoute>} />
            <Route path="/account/settings" element={<PrivateRoute><LazyRoute><AccountSettings /></LazyRoute></PrivateRoute>} />
            
            {/* Account Sub-pages */}
            <Route path="/account/subscription" element={<LazyRoute><SubscriptionScreen /></LazyRoute>} />
            <Route path="/account/upgrade" element={<LazyRoute><UpgradeFlow /></LazyRoute>} />
            <Route path="/account/family" element={<LazyRoute><ManageFamilyScreen /></LazyRoute>} />
            <Route path="/settings" element={<LazyRoute><SettingsScreen /></LazyRoute>} />
            
            <Route path="/host-mode" element={<LazyRoute><HostMode /></LazyRoute>} />
            <Route path="/favorites" element={<LazyRoute><FavoritesScreen /></LazyRoute>} />
            <Route path="/archived-items" element={<LazyRoute><ArchivedItemsScreen /></LazyRoute>} />
            
            {/* Admin Routes */}
            <Route path="/admin/errors" element={<LazyRoute><ErrorLogScreen /></LazyRoute>} />

            {/* Dev Routes */}
            {import.meta.env.DEV && (
              <Route path="/debug/regression-test" element={<LazyRoute><DebugRegressionTest /></LazyRoute>} />
            )}

            {/* 404 Route */}
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
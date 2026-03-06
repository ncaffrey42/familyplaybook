import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { addBreadcrumb } from '@/lib/errorLogger';

export const useNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();

  const handleNavigate = useCallback((screen, data = {}) => {
    addBreadcrumb(`Navigating to ${screen}`, { ...data, from: location.pathname });

    // Handle 'back' action explicitly to use browser history
    if (screen === 'back') {
      if (import.meta.env.DEV) {
        console.log(`[NAVIGATION] Back -> Previous Page`);
      }
      navigate(-1);
      return;
    }

    if (screen === 'logout') {
      if (import.meta.env.DEV) {
        console.log(`[NAVIGATION] Logout -> Login Screen`);
      }
      signOut().then(() => {
        addBreadcrumb('User logged out');
        navigate('/login', { replace: true });
        window.location.reload();
      });
      return;
    }

    const routeMap = {
      home: '/home',
      bundles: '/bundles',
      guides: '/guides',
      favorites: '/favorites',
      createBundle: '/createBundle',
      bundleDetail: `/bundle/${data.bundleId}`,
      editBundle: `/bundle/${data.bundleId}/edit`,
      createGuide: '/guide/new',
      editGuide: `/guide/${data.guideId}/edit`,
      guideDetail: `/guide/${data.guideId}`,
      account: '/account',
      settings: '/settings',
      manageFamily: '/manageFamily',
      hostMode: '/hostMode',
      subscription: '/subscription',
      archived: '/archived',
      viewLibraryBundle: `/library/bundle/${data.bundleId}`,
      viewLibraryGuide: `/library/guide/${data.guideId}`,
      'error-log': '/error-log',
      shareGuide: `/guide/share/${data.shareId}`,
      onboarding: '/onboarding',
      login: '/login',
      'check-email': '/check-email',
      'verify-phone': '/verify-phone',
    };

    const path = routeMap[screen] || `/${screen}`;

    if (import.meta.env.DEV) {
      console.log(`[NAVIGATION] ${screen} -> ${path}`);
    }

    navigate(path, { state: data });

  }, [navigate, location, signOut]);

  return handleNavigate;
};
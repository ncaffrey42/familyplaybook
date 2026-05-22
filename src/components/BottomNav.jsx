import React from 'react';
import { Home, Library, Heart, CreditCard, FolderOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useNavigation } from '@/hooks/useNavigation';
import UserAvatar from '@/components/UserAvatar';

const BottomNav = () => {
  const location = useLocation();
  const handleNavigate = useNavigation();
  const currentPath = location.pathname;

  const navItems = [
    { id: 'home', path: '/home', icon: Home, label: 'Home' },
    { id: 'guides', path: '/library', icon: Library, label: 'Guides' }, // Changed label to "Guides"
    { id: 'bundles', path: '/bundles', icon: FolderOpen, label: 'Bundles' },
    { id: 'favorites', path: '/favorites', icon: Heart, label: 'Favorites' },
    { id: 'plans', path: '/plans', icon: CreditCard, label: 'Plans' },
    // `icon` is null for the account tab — it renders the user's avatar instead.
    { id: 'account', path: '/account', icon: null, label: 'Account' },
  ];

  const handlePrefetch = (screenId) => {
    // Corrected prefetch logic
    const componentMap = {
      home: () => import('@/pages/home/HomeScreen'),
      guides: () => import('@/pages/guides/GuidesLibrary'),
      bundles: () => import('@/pages/bundles/MyBundlesScreen'),
      favorites: () => import('@/pages/FavoritesScreen'),
      plans: () => import('@/pages/account/PlansPage'),
      account: () => import('@/pages/account/MyAccount'),
    };

    const prefetcher = componentMap[screenId];
    if (prefetcher) {
      prefetcher();
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-xl border-t border-border shadow-lg z-50 pb-safe">
      <div className="flex items-center justify-around max-w-md mx-auto px-1 py-3">
        {navItems.map((item) => {
          let isActive = false;
          
          // Updated active state logic
          if (item.id === 'plans') {
             isActive = currentPath.startsWith('/plans') || currentPath.startsWith('/account/plans');
          } else if (item.id === 'account') {
             isActive = currentPath.startsWith('/account') && !currentPath.startsWith('/account/plans');
          } else if (item.id === 'home') {
             isActive = currentPath === '/home' || currentPath === '/';
          } else if (item.id === 'guides') { // Updated to 'guides'
             // Guides tab is active for /library, /guides and /library/guide paths
             isActive = currentPath.startsWith('/library') || currentPath.startsWith('/guides');
          } else if (item.id === 'bundles') {
             isActive = currentPath.startsWith('/bundles') || currentPath.startsWith('/library/bundle');
          } else {
             isActive = currentPath.startsWith(item.path);
          }

          const Icon = item.icon;

          return (
            <motion.button
              key={item.id}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleNavigate(item.id)}
              onMouseEnter={() => handlePrefetch(item.id)}
              className="relative flex flex-col items-center justify-center w-16 group"
            >
              <div className={`p-1.5 rounded-xl transition-all duration-300 ${isActive ? 'bg-primary/10' : 'bg-transparent'}`}>
                {item.id === 'account' ? (
                  // box-shadow ring instead of `ring-*` utilities so the
                  // active indicator doesn't expand the avatar's layout box
                  // — keeps it the same 22×22 footprint as the lucide icons
                  // in the other tabs, so vertical alignment with the
                  // labels stays consistent across the row.
                  <UserAvatar
                    className={`h-[22px] w-[22px] transition-shadow duration-300 ${
                      isActive
                        ? 'shadow-[0_0_0_2px_hsl(var(--primary))]'
                        : 'opacity-80 group-hover:opacity-100'
                    }`}
                  />
                ) : (
                  <Icon
                    className={`transition-colors duration-300 ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}
                    strokeWidth={isActive ? 2.5 : 2}
                    fill={isActive && item.id === 'favorites' ? 'currentColor' : 'none'}
                    size={22}
                  />
                )}
              </div>
              <span
                className={`text-[10px] mt-1 font-medium text-center transition-colors duration-300 ${
                  isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                }`}
              >
                {item.label}
              </span>
              {isActive && (
                 <motion.div
                    layoutId="active-nav-indicator"
                    className="absolute -bottom-3 h-1 w-8 rounded-t-full bg-primary"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                 />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNav;
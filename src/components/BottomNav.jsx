import React from 'react';
import { Home, BookOpen, Share2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useNavigation } from '@/hooks/useNavigation';

/**
 * Brand v1 navigation: 3 tabs — Home / Guides / Share.
 * Favorites is retired as a destination (it became "Pinned" on Home + a chip
 * on Guides); Account moved to the Home-header avatar; create lives on the
 * FAB. Active state is colour alone: raspberry active, #C9A6B2 inactive.
 */
const BottomNav = () => {
  const location = useLocation();
  const handleNavigate = useNavigation();
  const currentPath = location.pathname;

  const navItems = [
    { id: 'home', path: '/home', icon: Home, label: 'Home' },
    { id: 'guides', path: '/guides', icon: BookOpen, label: 'Guides' },
    { id: 'share', path: '/share-center', icon: Share2, label: 'Share' },
  ];

  const isActiveFor = (id) => {
    if (id === 'home') return currentPath === '/home' || currentPath === '/';
    if (id === 'guides')
      return (
        currentPath.startsWith('/guides') ||
        currentPath.startsWith('/library') ||
        currentPath.startsWith('/bundles') ||
        currentPath.startsWith('/bundle/') ||
        currentPath.startsWith('/guide/')
      );
    if (id === 'share') return currentPath.startsWith('/share-center');
    return false;
  };

  const handlePrefetch = (screenId) => {
    const componentMap = {
      home: () => import('@/pages/home/HomeScreen'),
      guides: () => import('@/pages/guides/GuidesLibrary'),
      share: () => import('@/pages/share/ShareCenterScreen'),
    };
    componentMap[screenId]?.();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-cream/95 dark:bg-background/95 backdrop-blur-xl border-t border-card-border dark:border-border z-50 pb-safe">
      <div className="flex items-center justify-around max-w-md mx-auto px-1 pt-3 pb-4">
        {navItems.map((item) => {
          const isActive = isActiveFor(item.id);
          const Icon = item.icon;
          return (
            <motion.button
              key={item.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleNavigate(item.id)}
              onMouseEnter={() => handlePrefetch(item.id)}
              className="relative flex flex-col items-center justify-center w-20 min-h-[44px]"
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2.4 : 2}
                className={isActive ? 'text-raspberry' : 'text-placeholder-copy'}
              />
              <span
                className={`text-[10.5px] mt-1 font-bold ${
                  isActive ? 'text-raspberry' : 'text-placeholder-copy'
                }`}
              >
                {item.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNav;

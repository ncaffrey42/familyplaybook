import React from 'react';
import { Home, BookOpen, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * The Host shell's own 3-tab nav — Properties / Guides / Team.
 * See docs/platform/HOST_SHELL.md §2 for why these three and why guest
 * links are NOT a tab (a link is meaningless without its property, so it
 * lives inside one).
 *
 * Structurally a mirror of BottomNav: same geometry, same active/inactive
 * treatment, same 44px touch targets. The one difference is the accent —
 * apricot here, raspberry there (§5) — so a host recognises this as the
 * same software, differently addressed.
 */
const HOST_TABS = [
  { id: 'properties', path: '/host/properties', icon: Home, label: 'Properties' },
  { id: 'guides', path: '/host/guides', icon: BookOpen, label: 'Guides' },
  { id: 'team', path: '/host/team', icon: Users, label: 'Team' },
];

const HostBottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const isActiveFor = (path) => location.pathname.startsWith(path);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-cream/95 dark:bg-background/95 backdrop-blur-xl border-t border-card-border dark:border-border z-50 pb-safe">
      <div className="flex items-center justify-around max-w-md mx-auto px-1 pt-3 pb-4">
        {HOST_TABS.map((tab) => {
          const isActive = isActiveFor(tab.path);
          const Icon = tab.icon;
          return (
            <motion.button
              key={tab.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(tab.path)}
              className="relative flex flex-col items-center justify-center w-20 min-h-[44px]"
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2.4 : 2}
                className={isActive ? 'text-apricot' : 'text-placeholder-copy'}
              />
              <span
                className={`text-[10.5px] mt-1 font-bold ${
                  isActive ? 'text-apricot' : 'text-placeholder-copy'
                }`}
              >
                {tab.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default HostBottomNav;

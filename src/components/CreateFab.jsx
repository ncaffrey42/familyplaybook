import React from 'react';
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

/**
 * The create FAB — raspberry, 60px, bottom-right, 22px inset, floated 110px
 * up to clear the tab bar. Shown on Home and Guides only.
 */
const CreateFab = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const visible =
    pathname === '/' || pathname === '/home' || pathname === '/guides';
  if (!visible) return null;

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => navigate('/guide/new')}
      className="fixed z-40 flex items-center justify-center w-[60px] h-[60px] rounded-full bg-raspberry hover:bg-raspberry-hover text-cream shadow-fab"
      style={{ right: 22, bottom: 110 }}
      aria-label="Create a guide"
    >
      <Plus size={26} strokeWidth={2.4} />
    </motion.button>
  );
};

export default CreateFab;

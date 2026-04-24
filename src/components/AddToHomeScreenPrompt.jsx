import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Share, PlusSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

const AddToHomeScreenPrompt = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  // Ref instead of state: writing the prompt object must not re-run the effect,
  // which previously caused the install banner to re-appear after dismissal.
  const deferredPromptRef = useRef(null);

  useEffect(() => {
    const showPrompt = (promptEvent = null) => {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
      const promptCount = parseInt(localStorage.getItem('a2hsPromptCount') || '0', 10);

      if (isMobile && !isInStandaloneMode && promptCount < 3) {
        const userAgent = navigator.userAgent;
        const isIosDevice = /iPhone|iPad|iPod/.test(userAgent) && !/CriOS/i.test(userAgent);
        const isSafari = /applewebkit/i.test(userAgent) && !/crios/i.test(userAgent) && !/fxios/i.test(userAgent) && !/oprios/i.test(userAgent) && !/mercury/i.test(userAgent);

        if (isIosDevice && isSafari) {
          setIsIos(true);
          setIsVisible(true);
        } else if (promptEvent || deferredPromptRef.current) {
          setIsVisible(true);
        }
      }
    };

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      showPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const timer = setTimeout(() => {
      showPrompt();
    }, 2000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      clearTimeout(timer);
    };
  }, []);
  
  const incrementPromptCount = () => {
      const promptCount = parseInt(localStorage.getItem('a2hsPromptCount') || '0', 10);
      if (promptCount < 3) {
          localStorage.setItem('a2hsPromptCount', (promptCount + 1).toString());
      }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setShowIosInstructions(false);
  };

  const handleInstallClick = async () => {
    if (!isVisible) return;

    incrementPromptCount();
    setIsVisible(false);

    if (isIos) {
      setShowIosInstructions(true);
    } else if (deferredPromptRef.current) {
      deferredPromptRef.current.prompt();
      const { outcome } = await deferredPromptRef.current.userChoice;
      if (outcome === 'accepted') {
        console.log('User accepted the A2HS prompt');
      } else {
        console.log('User dismissed the A2HS prompt');
      }
      deferredPromptRef.current = null;
    }
  };

  return (
    <AnimatePresence>
      {isVisible && !showIosInstructions && (
        <motion.div
          initial={{ y: '-100%' }}
          animate={{ y: 0 }}
          exit={{ y: '-100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed top-4 left-4 right-4 md:top-6 md:left-auto md:right-6 md:max-w-sm z-50"
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-soft flex items-center gap-4">
             <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-[#5CA9E9] to-[#7BC47F] shadow-soft flex-shrink-0">
                <span className="text-2xl">📖</span>
             </div>
            <div className="flex-grow">
              <p className="font-semibold text-gray-800 dark:text-gray-100">Family Playbook</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Install the app for quick access.</p>
            </div>
            <Button
              onClick={handleInstallClick}
              size="sm"
              className="bg-gradient-to-r from-[#5CA9E9] to-[#7BC47F] text-white font-semibold rounded-lg flex-shrink-0"
            >
              Install
            </Button>
            <button onClick={handleDismiss} className="absolute -top-2 -right-2 bg-gray-200 dark:bg-gray-700 rounded-full p-1">
              <X size={16} className="text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </motion.div>
      )}

      {showIosInstructions && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4"
          onClick={() => setShowIosInstructions(false)}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="bg-white dark:bg-gray-800 rounded-t-2xl p-6 text-center w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={handleDismiss} className="absolute top-4 right-4 bg-gray-200 dark:bg-gray-700 rounded-full p-1">
              <X size={20} className="text-gray-600 dark:text-gray-300" />
            </button>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">Add to Home Screen</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              To install the app, tap the Share icon and then 'Add to Home Screen'.
            </p>
            <div className="flex items-center justify-center gap-2 text-gray-700 dark:text-gray-200">
              <p>Tap</p>
              <Share className="text-[#5CA9E9]" />
              <p>then</p>
              <PlusSquare className="text-[#7BC47F]" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AddToHomeScreenPrompt;
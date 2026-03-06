import React from 'react';
    import { motion } from 'framer-motion';
    import { Compass, Home } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Helmet } from 'react-helmet';
    import { useNavigation } from '@/hooks/useNavigation';

    const NotFoundScreen = () => {
      const handleNavigate = useNavigation();
      const siteUrl = "https://familyplaybook.app";
      const defaultImage = "/icon-192x192.png";

      return (
        <>
          <Helmet>
            <title>404 - Page Not Found</title>
            <meta name="description" content="Oops! It looks like this page doesn't exist. Let's get you back on track." />
            <meta property="og:title" content="404 - Page Not Found" />
            <meta property="og:description" content="Oops! It looks like this page doesn't exist. Let's get you back on track." />
            <meta property="og:image" content={defaultImage} />
            <meta property="og:url" content={`${siteUrl}/404`} />
          </Helmet>
          <div className="min-h-screen bg-[#FAF9F6] dark:bg-gray-950 flex flex-col items-center justify-center text-center p-6">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.2 }}
            >
              <motion.div
                animate={{ rotate: [0, -15, 15, -15, 15, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
              >
                <Compass size={80} className="text-[#5CA9E9] mb-6" />
              </motion.div>
            </motion.div>

            <motion.h1
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="text-4xl font-bold text-gray-800 dark:text-gray-100 mb-3"
            >
              Oops! Lost in the Playbook?
            </motion.h1>

            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-md"
            >
              The page you're looking for seems to have vanished. Let's get you back to familiar territory.
            </motion.p>

            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.5 }}
            >
              <Button
                onClick={() => handleNavigate('home')}
                size="lg"
                className="bg-gradient-to-r from-[#5CA9E9] to-[#7BC47F] text-white font-bold shadow-lg hover:shadow-xl transition-shadow"
              >
                <Home className="mr-2 h-5 w-5" />
                Go Back Home
              </Button>
            </motion.div>
          </div>
        </>
      );
    };

    export default NotFoundScreen;
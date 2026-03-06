import React from 'react';
import { useLocation } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { motion } from 'framer-motion';

const CheckEmailScreen = () => {
  const location = useLocation();
  const email = location.state?.email || 'your email';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-green-100 dark:from-blue-900/50 dark:to-green-900/50 flex flex-col items-center justify-center p-4 text-center">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', duration: 0.8 }}
        className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl max-w-md w-full"
      >
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mx-auto mb-6 w-20 h-20 bg-gradient-to-r from-blue-500 to-green-500 text-white rounded-full flex items-center justify-center"
        >
          <MailCheck size={40} />
        </motion.div>
        <motion.h1 
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-4"
        >
          Confirm Your Email
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="text-gray-600 dark:text-gray-300 mb-6"
        >
          We've sent a confirmation link to <br />
          <strong className="text-gray-900 dark:text-white font-medium">{email}</strong>.
        </motion.p>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="text-sm text-gray-500 dark:text-gray-400"
        >
          Please click the link in the email to activate your account. You can close this window.
        </motion.p>
      </motion.div>
    </div>
  );
};

export default CheckEmailScreen;
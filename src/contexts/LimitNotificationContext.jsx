import React, { createContext, useContext, useState, useCallback } from 'react';
import { AnalyticsService } from '@/services/AnalyticsService';

const LimitNotificationContext = createContext(null);

export const LimitNotificationProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notificationData, setNotificationData] = useState({
    reason_code: null,
    current: 0,
    limit: 0,
    upgrade_suggestion: null
  });

  const showLimitNotification = useCallback((reason_code, current, limit, upgrade_suggestion) => {
    setNotificationData({
      reason_code,
      current,
      limit,
      upgrade_suggestion
    });
    setIsOpen(true);
    
    AnalyticsService.track(AnalyticsService.events.LIMIT_HIT_SHOWN, {
      reason_code,
      current,
      limit,
      suggestion: upgrade_suggestion
    });
  }, []);

  const hideLimitNotification = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = {
    isOpen,
    notificationData,
    showLimitNotification,
    hideLimitNotification
  };

  return (
    <LimitNotificationContext.Provider value={value}>
      {children}
    </LimitNotificationContext.Provider>
  );
};

export const useLimitNotification = () => {
  const context = useContext(LimitNotificationContext);
  if (!context) {
    throw new Error('useLimitNotification must be used within a LimitNotificationProvider');
  }
  return context;
};
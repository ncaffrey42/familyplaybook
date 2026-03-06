import React, { useEffect } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';

/* global Userback */

const UserbackWidget = () => {
  const { user, profile } = useAuth();

  useEffect(() => {
    window.Userback = window.Userback || {};
    window.Userback.access_token = 'A-P8reqUdbC5527nJ21oqURZPos';

    if (user && profile) {
      window.Userback.user_data = {
        id: user.id,
        info: {
          name: profile.full_name || user.email,
          email: user.email,
        },
      };
    }

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://static.userback.io/widget/v1.js';
    document.head.appendChild(script);

    return () => {
      const existingScript = document.querySelector('script[src="https://static.userback.io/widget/v1.js"]');
      if (existingScript) {
        document.head.removeChild(existingScript);
      }
      const userbackWidget = document.getElementById('userback_button_container');
      if(userbackWidget) {
        userbackWidget.remove();
      }
      if(window.Userback) {
        delete window.Userback;
      }
    };
  }, [user, profile]);

  return null;
};

export default UserbackWidget;
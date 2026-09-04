import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import App from './App';
import './index.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AuthProvider } from '@/contexts/SupabaseAuthContext';
import { initErrorLogger } from '@/lib/errorLogger';
import { initNativeAuth } from '@/lib/nativeAuth';
import { isNative } from '@/lib/native';

// Initialize error logging service
initErrorLogger();

// Register the native OAuth deep-link handler (no-op on web).
initNativeAuth();

// Register service worker for PWA support.
//
// Skipped under Capacitor: the native shells serve the bundle from
// capacitor://localhost (iOS) / https://localhost (Android) via
// WebViewLocalServer, which does not serve /sw.js for registration. The
// attempt always failed with "An unknown error occurred when fetching the
// script", logging an error on every cold start of both native apps while
// buying nothing — a packaged app has no offline problem to solve.
if ('serviceWorker' in navigator && import.meta.env.PROD && !isNative()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    }, err => {
      console.error('ServiceWorker registration failed: ', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <Router>
    <ThemeProvider storageKey="vite-ui-theme">
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </Router>
);
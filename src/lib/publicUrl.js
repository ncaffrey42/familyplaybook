/**
 * Base URL for links that leave the app: share links, invites, QR codes.
 *
 * On the web this is simply the page's own origin. Inside the Capacitor
 * shell, window.location.origin is the WebView's private https://localhost,
 * which no recipient can open — so native builds bake the public web app URL
 * in at build time via VITE_APP_URL (see .env.native). Nothing about the
 * web/Docker build changes: there, the origin still wins.
 */
import { Capacitor } from '@capacitor/core';

export function publicOrigin() {
  const configured = (import.meta.env.VITE_APP_URL || '').replace(/\/+$/, '');
  if (Capacitor.isNativePlatform() && configured) return configured;
  return window.location.origin;
}

export const shareLinkUrl = (shareId) => `${publicOrigin()}/share/${shareId}`;

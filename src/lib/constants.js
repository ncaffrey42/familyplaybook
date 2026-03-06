// App-wide constants

// Default OG/fallback image used in <Helmet> meta tags and image fallbacks.
// For social sharing to resolve correctly, set VITE_APP_URL in your .env.local.
export const DEFAULT_OG_IMAGE = `${import.meta.env.VITE_APP_URL || ''}/icon-192x192.png`;

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Brand v1 guide icon: a solid colour dot inside a tinted circular halo,
 * keyed by guide category (replacing the previous lucide-glyph tiles).
 *
 *   How To    → raspberry dot in a raspberry halo
 *   Find It   → apricot dot in an apricot halo
 *   Reference → mulberry dot in a mulberry halo
 *   Emergency → coral dot in a coral halo
 *
 * `iconName` is accepted for backwards compatibility but no longer rendered —
 * the category drives the visual. Sizes: halo defaults to 42px with a 15px dot
 * (Home/Guides rows); helper mode uses size={48} dot={17}.
 */
const CATEGORY_STYLES = {
  'How To':    { halo: 'bg-halo-raspberry', dot: 'bg-raspberry' },
  'Find It':   { halo: 'bg-halo-apricot',   dot: 'bg-apricot' },
  'Reference': { halo: 'bg-halo-mulberry',  dot: 'bg-mulberry' },
  'Emergency': { halo: 'bg-halo-coral',     dot: 'bg-coral' },
};
const DEFAULT_STYLE = { halo: 'bg-halo-raspberry', dot: 'bg-raspberry' };

const GuideIcon = ({ category, size = 42, dot, className, iconName: _iconName, ...props }) => {
  const s = CATEGORY_STYLES[category] || DEFAULT_STYLE;
  // Legacy call sites size the container via className (w-10 h-10 …); only
  // apply the inline halo size when the className doesn't set its own width.
  const classSized = /(^|\s)(w-|h-)/.test(className || '');
  const haloStyle = classSized ? undefined : { width: size, height: size };
  const dotPx = dot ?? Math.round((classSized ? 40 : size) * 0.36);
  return (
    <div
      className={cn('rounded-full flex items-center justify-center flex-shrink-0', s.halo, className)}
      style={haloStyle}
      {...props}
    >
      <div className={cn('rounded-full', s.dot)} style={{ width: dotPx, height: dotPx }} />
    </div>
  );
};

export default GuideIcon;

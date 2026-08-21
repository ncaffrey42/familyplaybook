import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Brand v2 guide icon: a line glyph inside a tinted circular halo, keyed by
 * guide category. The halo carries the category tint, the glyph carries the
 * category colour and its meaning.
 *
 *   How To    → two-row checklist, raspberry on a raspberry halo
 *   Find It   → map pin, apricot on an apricot halo
 *   Reference → open book, mulberry on a mulberry halo
 *   Emergency → alert triangle, coral on a coral halo
 *
 * Paths are lifted verbatim from the design handoff prototype (the GLYPHS map
 * in "Family Playbook - Mobile.dc.html") rather than approximated with lucide,
 * so the shapes match the marketing screenshots exactly. All are drawn on a
 * 24x24 viewBox, fill:none, 2px round-capped stroke.
 *
 * `iconName` is accepted for backwards compatibility but no longer rendered —
 * the category drives the visual. Sizes: 42px halo / 19px glyph on standard
 * rows, 48px halo / 22px glyph in helper mode. When `className` sizes the halo
 * itself (w-10 h-10 …), pass `glyph` explicitly.
 */
const CATEGORY_STYLES = {
  'How To':    { halo: 'bg-halo-raspberry', stroke: '#C25065', glyph: 'how' },
  'Find It':   { halo: 'bg-halo-apricot',   stroke: '#F4A259', glyph: 'find' },
  'Reference': { halo: 'bg-halo-mulberry',  stroke: '#5C2A3E', glyph: 'ref' },
  'Emergency': { halo: 'bg-halo-coral',     stroke: '#F0705A', glyph: 'urgent' },
};
const DEFAULT_STYLE = CATEGORY_STYLES['How To'];

const GLYPH_PATHS = {
  how: [
    'M4 7.6l2.2 2.2L10.2 6',
    'M4 16.6l2.2 2.2L10.2 15',
    'M13.4 8.4h6.6',
    'M13.4 17.4h6.6',
  ],
  find: [
    'M12 20.6s6.5-6.1 6.5-10.6a6.5 6.5 0 1 0-13 0C5.5 14.5 12 20.6 12 20.6z',
    'M12 12.3a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z',
  ],
  ref: [
    'M12 7.2S9.6 5.4 4.5 5.6v12.3c5.1-.2 7.5 1.5 7.5 1.5s2.4-1.7 7.5-1.5V5.6C14.4 5.4 12 7.2 12 7.2z',
    'M12 7.2v12.2',
  ],
  urgent: [
    'M12 4.2 20.6 19H3.4L12 4.2z',
    'M12 9.8v4.3',
    'M12 17.1v.1',
  ],
};

const GuideIcon = ({ category, size = 42, glyph, className, iconName: _iconName, ...props }) => {
  const s = CATEGORY_STYLES[category] || DEFAULT_STYLE;
  // Legacy call sites size the container via className (w-10 h-10 …); only
  // apply the inline halo size when the className doesn't set its own width.
  const classSized = /(^|\s)(w-|h-)/.test(className || '');
  const haloStyle = classSized ? undefined : { width: size, height: size };
  const glyphPx = glyph ?? Math.round(size * 0.45);
  return (
    <div
      className={cn('rounded-full flex items-center justify-center flex-shrink-0', s.halo, className)}
      style={haloStyle}
      {...props}
    >
      <svg
        width={glyphPx}
        height={glyphPx}
        viewBox="0 0 24 24"
        fill="none"
        className="block"
        aria-hidden="true"
        focusable="false"
      >
        {GLYPH_PATHS[s.glyph].map((d, i) => (
          <path
            key={i}
            d={d}
            stroke={s.stroke}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </div>
  );
};

export default GuideIcon;

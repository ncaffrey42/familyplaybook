import React from 'react';

/**
 * The brand heart-route mark, used inline as UI (pin toggle, share success,
 * helper-mode header). Path, dash pattern (10 8) and the apricot player dot
 * come from the v1 brand guide (design/redesign-v1/brand-guide.html) and per
 * that guide must not be altered.
 *
 * Props:
 *  - size:   px height/width (viewBox is square-ish 100x100)
 *  - stroke: the heart's stroke colour (e.g. '#C25065' pinned, '#D8B9C4' idle)
 *  - fill:   optional fill inside the heart (e.g. 'rgba(194,80,101,.12)')
 */
const HeartMark = ({ size = 24, stroke = '#C25065', fill = 'none', className, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
    {...props}
  >
    <path
      d="M50 84 C26 64, 14 48, 14 34 C14 21, 24 14, 34 14 C42 14, 48 19, 50 28 C52 19, 58 14, 66 14 C76 14, 86 21, 86 34 C86 48, 74 64, 56 79"
      stroke={stroke}
      strokeWidth="5.5"
      strokeLinecap="round"
      strokeDasharray="10 8"
      fill={fill}
    />
    {/* The player dot — always apricot, per the brand guide */}
    <circle cx="50" cy="84" r="5.5" fill="#F4A259" />
  </svg>
);

export default HeartMark;

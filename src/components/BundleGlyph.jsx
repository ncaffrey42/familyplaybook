import React from 'react';

/**
 * Brand v2 bundle glyph: a white layers stack, drawn on the bundle's solid
 * colour cap. Path lifted verbatim from the design handoff prototype
 * (`stackGlyph` in "Family Playbook - Mobile.dc.html").
 *
 * 16px on the colour caps (30px cap in the Home carousel, 34px cap on the
 * Guides > Bundles cards); larger when it stands in for a missing cover.
 */
const BundleGlyph = ({ size = 16, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M12 3.6 21 8l-9 4.4L3 8l9-4.4z"
      stroke="#fff"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M4.6 12.6 12 16.2l7.4-3.6M4.6 16.9 12 20.4l7.4-3.5"
      stroke="#fff"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={0.75}
    />
  </svg>
);

export default BundleGlyph;

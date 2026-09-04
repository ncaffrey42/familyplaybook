import React from 'react';

/**
 * Skeleton screens for the Host shell's not-yet-built tabs. Properties
 * graduated to a real screen (src/pages/host/HostProperties.jsx, Prompt 9);
 * Guides and Team remain.
 *
 * Deliberately honest rather than fake: each states which prompt fills it
 * in, so that flipping VITE_ENABLE_HOST_PRODUCT internally shows a shell
 * that is legibly unfinished instead of one that looks broken. This is the
 * opposite of HostMode.jsx, whose QR code points at a route that does not
 * exist (docs/platform/HOST_SHELL.md §7.4).
 */

const Placeholder = ({ title, blurb, owner }) => (
  <section className="bg-card rounded-lg border border-card-border shadow-card p-6">
    <h1 className="font-display font-semibold text-[22px] text-mulberry dark:text-foreground">
      {title}
    </h1>
    <p className="mt-1.5 text-[14.5px] leading-[1.55] text-body-copy dark:text-muted-foreground">
      {blurb}
    </p>
    <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-halo-apricot px-3 py-1.5">
      <span className="w-2 h-2 rounded-full bg-apricot" />
      <span className="text-[12.5px] font-bold text-mulberry">{owner}</span>
    </div>
  </section>
);

export const HostGuides = () => (
  <Placeholder
    title="Guides"
    blurb="The same guide editor and AI generation the family product uses, with the host taxonomy — Arrival, House, Local, Departure. Shared across properties, because check-out instructions rarely differ by unit."
    owner="Content engine exists; host taxonomy from Prompt 4"
  />
);

export const HostTeam = () => (
  <Placeholder
    title="Team"
    blurb="Co-hosts, managers and cleaners. Cleaners see only the guides relevant to a turnover — the same per-person grants model the family product calls Helpers."
    owner="Built by Prompt 10"
  />
);

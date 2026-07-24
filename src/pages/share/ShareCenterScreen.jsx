import React from 'react';
import { Helmet } from 'react-helmet';
import HeartMark from '@/components/HeartMark';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

/**
 * The Share tab ("Your team"). Scaffold for the redesign's top-level share
 * surface — fleshed out in the share phase (avatars, per-person visibility,
 * duration cards). For now it routes people to the working share flows so the
 * tab is never a dead end.
 */
const ShareCenterScreen = () => {
  const navigate = useNavigate();
  return (
    <>
      <Helmet>
        <title>Share - Family Playbook</title>
      </Helmet>
      <div className="min-h-screen bg-cream dark:bg-background px-[22px] pt-[58px] pb-32">
        <h1 className="font-display font-semibold text-[29px] leading-[1.15] text-mulberry dark:text-foreground">
          Your team
        </h1>
        <p className="mt-1 text-[14.5px] text-muted-copy">
          Everyone sees only what you share.
        </p>

        <div className="mt-8 bg-card rounded-lg border border-card-border shadow-card p-6 text-center">
          <div className="flex justify-center mb-3">
            <HeartMark size={52} stroke="#C25065" />
          </div>
          <p className="font-display font-semibold text-[19px] text-mulberry dark:text-foreground">
            Share a bundle to get started.
          </p>
          <p className="mt-1 text-[14.5px] text-body-copy dark:text-muted-foreground">
            Pick a bundle, tap Share, and send one link. No app, no account
            needed on their end.
          </p>
          <Button
            onClick={() => navigate('/guides?segment=bundles')}
            className="mt-5 rounded-full bg-raspberry hover:bg-raspberry-hover text-cream font-bold text-[15px] h-11 px-6"
          >
            Choose a bundle
          </Button>
        </div>
      </div>
    </>
  );
};

export default ShareCenterScreen;

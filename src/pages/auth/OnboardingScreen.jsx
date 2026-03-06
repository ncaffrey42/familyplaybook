import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Home, Heart, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Helmet } from 'react-helmet';

const OnboardingScreen = ({ onComplete }) => {
  const [step, setStep] = useState(0);

  const steps = [
    {
      icon: Home,
      title: "Welcome to Family Playbook",
      description: "Make life easier for you and those you love. Organize guides, instructions, and lists all in one place.",
      color: "hsl(var(--primary))"
    },
    {
      icon: Heart,
      title: "Create & Share",
      description: "Build custom packs for babysitters, guests, travel, and more. Share them instantly with anyone.",
      color: "hsl(var(--accent))"
    },
    {
      icon: Sparkles,
      title: "Stay Organized",
      description: "Keep everything your family needs in beautifully organized themed packs. Access anytime, anywhere.",
      color: "#FFB88C"
    }
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const siteUrl = "https://familyplaybook.app";
  const defaultImage = "/icon-192x192.png";

  return (
    <>
      <Helmet>
        <title>Welcome to Family Playbook</title>
        <meta name="description" content="Get started with Family Playbook. Organize guides, instructions, and lists for your family and caregivers." />
        <meta property="og:title" content="Welcome to Family Playbook" />
        <meta property="og:description" content="Get started with Family Playbook. Organize guides, instructions, and lists for your family and caregivers." />
        <meta property="og:image" content={defaultImage} />
        <meta property="og:url" content={`${siteUrl}/onboarding`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Welcome to Family Playbook" />
        <meta name="twitter:description" content="Get started with Family Playbook. Organize guides, instructions, and lists for your family and caregivers." />
        <meta name="twitter:image" content={defaultImage} />
      </Helmet>
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-md"
          >
            <div className="text-center mb-12">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="inline-flex items-center justify-center w-28 h-28 rounded-4xl mb-8"
                style={{ backgroundColor: `${steps[step].color}20` }}
              >
                {React.createElement(steps[step].icon, {
                  size: 56,
                  color: steps[step].color,
                  strokeWidth: 2
                })}
              </motion.div>
              
              <h1 className="text-3xl font-bold text-foreground mb-4">
                {steps[step].title}
              </h1>
              
              <p className="text-lg text-muted-foreground leading-relaxed">
                {steps[step].description}
              </p>
            </div>

            <div className="flex justify-center gap-2 mb-8">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    index === step ? 'w-8 bg-primary' : 'w-2 bg-border'
                  }`}
                />
              ))}
            </div>

            <Button
              onClick={handleNext}
              className="w-full h-14 text-lg font-semibold rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300"
            >
              {step < steps.length - 1 ? 'Next' : 'Get Started'}
              <ChevronRight className="ml-2" size={20} />
            </Button>

            {step === steps.length - 1 && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                onClick={onComplete}
                className="w-full mt-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip for now
              </motion.button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
};

export default OnboardingScreen;
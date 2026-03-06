import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

const PageHeader = ({ title, onBack, children, sticky = false }) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex items-center justify-between p-4 -mx-4 mb-4",
        sticky && "sticky top-0 z-40 bg-background/80 backdrop-blur-sm"
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={handleBack}
        className="rounded-full bg-background dark:bg-gray-800 shadow-sm text-foreground focus-visible:bg-accent"
      >
        <ArrowLeft size={24} />
      </Button>
      <h1 className="flex-1 text-xl sm:text-2xl font-bold text-foreground truncate text-center px-4">
        {title}
      </h1>
      <div className="flex items-center justify-end gap-2 min-w-[40px]">
        {children}
      </div>
    </motion.header>
  );
};

export default PageHeader;
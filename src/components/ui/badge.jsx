import React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = {
  default: 'border border-gray-200 bg-white text-gray-950 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50',
  secondary: 'border border-gray-200 bg-gray-100 text-gray-900 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-50',
  destructive: 'border border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200',
  outline: 'border border-gray-200 text-gray-950 dark:border-gray-800 dark:text-gray-50',
};

const Badge = React.forwardRef(({ className, variant = 'default', ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-gray-950 focus:ring-offset-2 dark:focus:ring-gray-300 dark:focus:ring-offset-gray-950',
      badgeVariants[variant],
      className
    )}
    {...props}
  />
));
Badge.displayName = 'Badge';

export { Badge, badgeVariants };
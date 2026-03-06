import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Package } from 'lucide-react';

const generateAvatar = (name) => {
  if (!name) return { initials: '?', color: '#cccccc' };
  const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const colors = ['#FFC857', '#E9724C', '#C5283D', '#481D24', '#255F85', '#A9C5A0', '#4281A4', '#FE938C', '#E6BCCD', '#4A403A'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = colors[Math.abs(hash) % colors.length];
  return { initials, color };
};

export const BundleImage = ({ imageUrl, bundleName, bundleColor, className }) => {
  const [hasError, setHasError] = useState(false);
  const avatar = useMemo(() => generateAvatar(bundleName), [bundleName]);

  const handleError = () => {
    setHasError(true);
  };
  
  const showImage = imageUrl && !hasError;

  if (showImage) {
    return (
      <img 
        src={imageUrl} 
        alt={bundleName || 'Bundle image'} 
        className={cn('w-full h-full object-cover', className)} 
        onError={handleError}
        loading="lazy"
      />
    );
  }
  
  return (
    <div
      className={cn('w-full h-full flex items-center justify-center bg-secondary', className)}
      style={{ backgroundColor: bundleColor || avatar.color }}
    >
      <Package className="w-1/2 h-1/2 text-white/50" />
    </div>
  );
};

export default BundleImage;
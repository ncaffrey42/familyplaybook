import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Package } from 'lucide-react';

const generateAvatar = (name) => {
  if (!name) return { initials: '?', color: '#cccccc' };
  const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const colors = [
    '#FFC857', '#E9724C', '#C5283D', '#481D24', '#255F85',
    '#A9C5A0', '#4281A4', '#FE938C', '#E6BCCD', '#4A403A',
  ];
  const charCodeSum = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const color = colors[charCodeSum % colors.length];
  return { initials, color };
};

export const PackImage = ({ imageUrl, packName, packColor, className }) => {
  const avatar = useMemo(() => generateAvatar(packName), [packName]);

  if (imageUrl) {
    return <img src={imageUrl} alt={packName} className={cn('w-full h-full object-cover', className)} />;
  }

  if (packColor) {
    return (
      <div
        className={cn('w-full h-full flex items-center justify-center', className)}
        style={{ backgroundColor: packColor }}
      >
        <Package className="w-1/2 h-1/2 text-white opacity-50" />
      </div>
    );
  }

  return (
    <div
      className={cn('w-full h-full flex items-center justify-center', className)}
      style={{ backgroundColor: avatar.color }}
    >
      <span className="text-white font-bold text-3xl">{avatar.initials}</span>
    </div>
  );
};

export default PackImage;
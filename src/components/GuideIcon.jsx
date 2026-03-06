import React, { useMemo } from 'react';
import * as LucideIcons from 'lucide-react';
import { cn } from '@/lib/utils';

const categoryColors = {
  'How To': 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400',
  'Find It': 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400',
  'Reference': 'bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400', // Updated to purple as requested
  'Default': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

// Helper to convert various string formats to PascalCase (e.g., 'file-text' -> 'FileText')
const toPascalCase = (str) => {
  if (!str) return '';
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2') // split camelCase
    .replace(/[\s_]+/g, '-') // replace spaces and underscores with hyphens
    .replace(/(^\w|-\w)/g, (clear) => clear.replace('-', '').toUpperCase());
};

const GuideIcon = ({ iconName, category, className, size = 24 }) => {
  const colorClass = categoryColors[category] || categoryColors['Default'];
  
  const IconComponent = useMemo(() => {
    if (!iconName) return LucideIcons.FileText;

    // 1. Try exact match (e.g. "FileText")
    // eslint-disable-next-line import/namespace
    if (LucideIcons[iconName]) return LucideIcons[iconName];

    // 2. Try PascalCase conversion (fixes "file-text" -> "FileText")
    const pascalName = toPascalCase(iconName);
    // eslint-disable-next-line import/namespace
    if (LucideIcons[pascalName]) return LucideIcons[pascalName];

    // 3. Fallback to default
    return LucideIcons.FileText;
  }, [iconName]);

  return (
    <div className={cn(`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors duration-200 overflow-hidden flex-shrink-0`, colorClass, className)}>
      <IconComponent size={size} />
    </div>
  );
};

export default GuideIcon;
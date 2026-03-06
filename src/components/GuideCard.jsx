import React from 'react';
import { motion } from 'framer-motion';
import { Heart, Library } from 'lucide-react';
import { cn } from '@/lib/utils';
import GuideIcon from '@/components/GuideIcon';

const GuideCard = ({ guide, isFavorited, onToggleFavorite, onClick, isLibrary = false }) => {
  const handleFavoriteClick = (e) => {
    e.stopPropagation();
    if (onToggleFavorite) {
      onToggleFavorite();
    }
  };

  const packInfo = guide.packName || (guide.packNames && guide.packNames.length > 0 ? guide.packNames.join(', ') : 'Uncategorized');

  return (
    <motion.div
      whileHover={{ y: -4, boxShadow: "0 10px 20px rgba(0,0,0,0.08)" }}
      className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm cursor-pointer flex flex-col gap-4 transition-all duration-300 relative border border-gray-200/50 dark:border-gray-700/50"
      onClick={onClick}
    >
      <div className="flex justify-between items-start">
        <GuideIcon iconName={guide.icon} category={guide.category} />
        {!isLibrary ? (
          <button
            onClick={handleFavoriteClick}
            className="p-2 text-gray-400 hover:text-red-500 transition-colors z-10 -mr-2 -mt-2"
            aria-label={isFavorited ? 'Unfavorite' : 'Favorite'}
          >
            <Heart
              className={cn(
                'w-6 h-6 transition-all',
                isFavorited ? 'text-red-500 fill-red-500' : 'text-gray-300 dark:text-gray-500'
              )}
            />
          </button>
        ) : (
          <div className="p-2 text-blue-400" aria-label="Library guide">
            <Library className="w-6 h-6" />
          </div>
        )}
      </div>
      <div className="flex-grow overflow-hidden">
        <h3 className="font-bold text-gray-800 dark:text-gray-100 truncate">{guide.name}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{guide.description || packInfo}</p>
      </div>
    </motion.div>
  );
};

export default GuideCard;
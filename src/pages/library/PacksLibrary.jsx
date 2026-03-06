import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Plus, Heart, Image as ImageIcon } from 'lucide-react';
import { searchBundles } from '@/lib/searchUtils';

const PacksLibrary = ({ onNavigate, packs, onToggleLike }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Use enhanced bundle search
  const filteredPacks = searchBundles(packs, searchTerm);

  const handleLikeClick = (e, packId) => {
    e.stopPropagation();
    onToggleLike(packId);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] dark:bg-gray-950">
      <div className="p-6">
        <div className="flex items-center gap-4 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Packs Library</h1>
        </div>

        <div className="mb-6">
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" size={20} />
            <input
              type="text"
              placeholder="Search packs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-14 pl-12 pr-4 rounded-2xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 focus:border-[#5CA9E9] focus:outline-none transition-colors shadow-card text-gray-800 dark:text-gray-100"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {filteredPacks.map((pack, index) => (
            <motion.div
              key={pack.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onNavigate('packDetail', { pack })}
              className="bg-white dark:bg-gray-800 rounded-3xl shadow-card hover:shadow-soft transition-all duration-300 cursor-pointer transform hover:-translate-y-1 flex flex-col overflow-hidden"
            >
              <div className="w-full h-24 relative bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                {pack.image ? (
                   <img className="w-full h-full object-cover" alt={pack.name} src="https://images.unsplash.com/photo-1682961159647-dc795fa531b0" />
                ) : (
                  <ImageIcon size={32} className="text-gray-400 dark:text-gray-500" />
                )}
              </div>
              <div className="p-4 flex flex-col flex-grow">
                <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-1 flex-grow">{pack.name}</h3>
                <p className="text-xs text-[#5CA9E9] font-semibold mb-3">{pack.guides} guides</p>
                <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                  <button onClick={(e) => handleLikeClick(e, pack.id)} className="flex items-center gap-1.5 group">
                    <Heart size={16} className={`group-hover:text-red-500 transition-colors ${pack.isLiked ? 'text-red-500 fill-current' : 'text-gray-400 dark:text-gray-500'}`} />
                    <span>{pack.likes}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <motion.button
        onClick={() => onNavigate('createPack')}
        className="fixed bottom-24 right-6 w-16 h-16 rounded-full bg-gradient-to-br from-[#5CA9E9] to-[#7BC47F] flex items-center justify-center shadow-lg z-40"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <Plus size={28} color="white" strokeWidth={2.5} />
      </motion.button>
    </div>
  );
};

export default PacksLibrary;
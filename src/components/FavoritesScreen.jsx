import React from 'react';
import { useData } from '@/contexts/DataContext';
import { useNavigate } from 'react-router-dom';
import { Heart, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GuideIcon from '@/components/GuideIcon';
import { format } from 'date-fns';

const FavoritesScreen = () => {
  const { favorites, toggleFavorite } = useData();
  const navigate = useNavigate();

  // FIX: favorites is already an array of guide objects from DataContext.
  // We just need to ensure we don't show archived ones (though Context usually handles this).
  const favoriteGuides = (favorites || []).filter(guide => !guide.is_archived);

  const handleGuideClick = (guideId) => {
    navigate(`/guide/${guideId}`);
  };

  const getSubtitle = (guide) => {
    const parts = [];
    
    // Use bundleNames provided by DataContext directly
    if (guide.bundleNames && guide.bundleNames.length > 0) {
        parts.push(guide.bundleNames.join(', '));
    } else if (guide.category && guide.category !== 'General') {
        parts.push(guide.category);
    }

    if (guide.created_at) {
      try {
        parts.push(format(new Date(guide.created_at), 'MMM yyyy'));
      } catch (e) {
        // Ignore invalid dates
      }
    }

    return parts.join(' • ');
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] dark:bg-gray-950 pb-24">
      <div className="sticky top-0 z-10 bg-[#FAF9F6]/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate(-1)}
            className="-ml-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500 fill-current" />
            Your Favorites
          </h1>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-4">
        {favoriteGuides.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <Heart className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No favorites yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Tap the heart icon on any guide to add it to your favorites for quick access.
            </p>
            <Button onClick={() => navigate('/home')}>
              Browse Guides
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {favoriteGuides.map((guide) => (
              <div
                key={guide.id}
                onClick={() => handleGuideClick(guide.id)}
                className="group bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex items-center gap-4 cursor-pointer active:scale-[0.98] transition-transform hover:shadow-md"
              >
                <div className="flex-shrink-0">
                  <GuideIcon 
                    iconName={guide.icon} 
                    category={guide.category} 
                    className="w-12 h-12 text-2xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" 
                  />
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 dark:text-white truncate">
                    {guide.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {getSubtitle(guide)}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(guide); // Pass full guide object, context handles logic
                  }}
                >
                  <Heart className="h-5 w-5 fill-current" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FavoritesScreen;
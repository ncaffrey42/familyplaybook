import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Package, FileText, Library, Frown, Plus } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useData } from '@/contexts/DataContext';
import SearchInput from '@/components/ui/SearchInput';
import { useNavigation } from '@/hooks/useNavigation';
import BundleImage from '@/components/BundleImage';
import { Button } from '@/components/ui/button';
import GuideIcon from '@/components/GuideIcon';
import { useLocation } from 'react-router-dom';
import { searchGuides, searchBundles } from '@/lib/searchUtils';

const HomeScreen = () => {
  const location = useLocation();
  const handleNavigate = useNavigation();
  const { allBundles, allGuides, availableLibraryBundles, favorites, toggleFavorite, isDataLoaded } = useData();
  const searchRef = useRef(null);

  const [searchQuery, setSearchQuery] = useState('');
  
  // Initialize tab from location state (priority) or localStorage (persistence) or default
  const [activeTab, setActiveTab] = useState(() => {
    if (location.state?.tab) return location.state.tab;
    return localStorage.getItem('homeScreenActiveTab') || 'bundles';
  });

  // Persist active tab to localStorage
  useEffect(() => {
    localStorage.setItem('homeScreenActiveTab', activeTab);
  }, [activeTab]);

  const myBundles = useMemo(() => allBundles.filter(p => !p.is_archived), [allBundles]);
  const myGuides = useMemo(() => allGuides.filter(g => !g.is_archived), [allGuides]);
  
  // Defensively filter favorites to ensure no archived items appear on homepage
  // Get top 4 favorites (assuming favorites are already sorted by creation date from context)
  const recentFavorites = useMemo(() => {
    return (favorites || [])
      .filter(f => !f.is_archived)
      .slice(0, 4);
  }, [favorites]);

  const libraryBundlesWithGuides = useMemo(() => {
    return availableLibraryBundles.filter(bundle => bundle.guides && bundle.guides.length > 0);
  }, [availableLibraryBundles]);

  const searchResults = useMemo(() => {
    if (searchQuery.length < 2) return [];
    
    const filteredGuides = searchGuides(myGuides, searchQuery).map(g => ({ ...g, type: 'guide' }));
    const filteredBundles = searchBundles(myBundles, searchQuery).map(b => ({ ...b, type: 'bundle' }));

    return [...filteredBundles, ...filteredGuides];
  }, [searchQuery, myGuides, myBundles]);

  useEffect(() => {
    const handleClickOutside = event => {
      if (searchRef.current && !searchRef.current.contains(event.target)) setSearchQuery('');
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleResultClick = item => {
    handleNavigate(item.type === 'guide' ? 'guideDetail' : 'bundleDetail', {
      [item.type === 'guide' ? 'guideId' : 'bundleId']: item.id
    });
    setSearchQuery('');
  };

  const renderGuideBundleInfo = guide => {
    const bundleNames = guide.bundleNames;
    if (!bundleNames || bundleNames.length === 0) return 'Uncategorized';
    return bundleNames.join(', ');
  };

  const LoadingSkeleton = () => (
    <div className="space-y-6">
      <div className="flex gap-4 overflow-hidden">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex-shrink-0 w-40 h-48 bg-gray-200 dark:bg-gray-800 rounded-3xl animate-pulse" />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-8 w-40 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        {[1, 2].map((i) => (
          <div key={i} className="h-20 w-full bg-gray-200 dark:bg-gray-800 rounded-2xl animate-pulse" />
        ))}
      </div>
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Home - Family Playbook</title>
        <meta name="description" content="Welcome back! Access your guides, bundles, and family organization tools." />
      </Helmet>
      
      <div className="min-h-screen bg-background pb-24">
        <div className="p-6">
          <motion.header 
            initial={{ opacity: 0, y: -20 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="mb-8"
          >
            <h1 className="text-3xl font-bold text-foreground mb-2">Welcome back! 👋</h1>
            <p className="text-muted-foreground">Let's keep your family organized</p>
          </motion.header>
  
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.1 }} 
            className="mb-8 relative" 
            ref={searchRef}
          >
            <SearchInput 
              searchTerm={searchQuery} 
              setSearchTerm={setSearchQuery} 
              placeholder="Find a guide or bundle..." 
            />
            <AnimatePresence>
              {searchResults.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  exit={{ opacity: 0, y: -10 }} 
                  className="absolute top-full mt-2 w-full bg-card rounded-2xl shadow-lg border z-10 overflow-hidden max-h-80 overflow-y-auto"
                >
                  <ul className="divide-y divide-border">
                    {searchResults.map(item => (
                      <li 
                        key={`${item.type}-${item.id}`} 
                        onClick={() => handleResultClick(item)} 
                        className="p-4 hover:bg-secondary cursor-pointer flex items-center gap-4"
                      >
                        {item.type === 'guide' ? (
                          <GuideIcon iconName={item.icon} category={item.category} className="w-10 h-10" size={20} /> 
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                            <Package size={20} />
                          </div>
                        )}
                        <div className="flex-grow">
                          <p className="font-semibold text-foreground">{item.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {item.type === 'guide' ? renderGuideBundleInfo(item) : `${item.guide_count || 0} guides`}
                          </p>
                        </div>
                        {item.type === 'bundle' ? <Package className="text-muted-foreground" size={18} /> : <FileText className="text-muted-foreground" size={18} />}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-secondary rounded-2xl p-1">
              <TabsTrigger value="bundles" className="flex items-center gap-2 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-soft">
                <Package size={20} />
                <span className="text-sm font-semibold">My Bundles</span>
              </TabsTrigger>
              <TabsTrigger value="explore" className="flex items-center gap-2 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-soft">
                <Library size={20} />
                <span className="text-sm font-semibold">Library</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="bundles" className="mt-6">
              {!isDataLoaded ? (
                <LoadingSkeleton />
              ) : myBundles.length > 0 ? (
                <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6 scrollbar-hide">
                  {myBundles.map((bundle, index) => (
                    <motion.div 
                      key={bundle.id} 
                      initial={{ opacity: 0, x: 20 }} 
                      animate={{ opacity: 1, x: 0 }} 
                      transition={{ delay: 0.1 + index * 0.1 }} 
                      onClick={() => handleNavigate('bundleDetail', { bundleId: bundle.id })} 
                      className="flex-shrink-0 w-40 cursor-pointer group"
                    >
                      <div className="bg-card rounded-3xl shadow-card hover:shadow-soft transition-all duration-300 transform group-hover:-translate-y-1 h-48 flex flex-col overflow-hidden">
                        <div className="w-full h-28 relative flex items-center justify-center overflow-hidden">
                          <BundleImage imageUrl={bundle.image} bundleName={bundle.name} bundleColor={bundle.color} />
                        </div>
                        <div className="p-3 flex flex-col justify-center flex-1">
                          <h3 className="font-bold text-foreground text-sm line-clamp-2">{bundle.name}</h3>
                          <p className="text-xs text-muted-foreground">{bundle.guide_count || 0} guides</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  className="text-center mt-12 mb-8"
                >
                  <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                    <Frown size={32} className="text-muted-foreground" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground mb-2">No Bundles Yet</h2>
                  <p className="text-muted-foreground mb-6 max-w-xs mx-auto">Create a bundle to organize your guides or explore the library.</p>
                  <Button onClick={() => handleNavigate('createBundle')} className="rounded-full">
                    <Plus size={16} className="mr-2" />
                    Create Bundle
                  </Button>
                </motion.div>
              )}
            </TabsContent>

            <TabsContent value="explore" className="mt-6">
              {!isDataLoaded ? (
                <LoadingSkeleton />
              ) : libraryBundlesWithGuides.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {libraryBundlesWithGuides.map((bundle, index) => (
                    <motion.div 
                      key={bundle.id} 
                      initial={{ opacity: 0, y: 20 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      transition={{ delay: 0.1 + index * 0.05 }} 
                      onClick={() => handleNavigate('viewLibraryBundle', { bundleId: bundle.id })} 
                      className="flex flex-col text-center cursor-pointer group"
                    >
                      <div className="w-full aspect-video rounded-2xl flex items-center justify-center mb-2 shadow-soft-press transition-all duration-300 group-hover:shadow-soft group-hover:-translate-y-1 overflow-hidden">
                        <BundleImage imageUrl={bundle.image} bundleName={bundle.name} bundleColor={bundle.color} />
                      </div>
                      <h3 className="font-semibold text-foreground text-sm">{bundle.name}</h3>
                      <p className="text-xs text-muted-foreground">{bundle.guides?.length || 0} guides</p>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  className="text-center mt-12 mb-8"
                >
                  <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                    <Library size={32} className="text-muted-foreground" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground mb-2">Library Empty</h2>
                  <p className="text-muted-foreground mb-6">Check back later for new templates!</p>
                </motion.div>
              )}
            </TabsContent>
          </Tabs>

          {/* Favorites Section - Updated Layout */}
          {isDataLoaded && recentFavorites.length > 0 && (
            <motion.section 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              transition={{ delay: 0.2 }} 
              className="mt-8"
            >
              <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center gap-2">
                    <Heart size={20} className="text-red-500 fill-red-500" />
                    <h2 className="text-xl font-bold text-foreground">Your Favorites</h2>
                 </div>
                 {/* Only show View All if there are more than 4 favorites */}
                 {(favorites || []).filter(f => !f.is_archived).length > 4 && (
                    <Button variant="ghost" size="sm" onClick={() => handleNavigate('favorites')} className="text-primary hover:text-primary/80 h-8 px-2">View All</Button>
                 )}
              </div>
              
              <div className="grid gap-3">
                {recentFavorites.map((item, index) => (
                  <motion.div 
                    key={item.id} 
                    initial={{ opacity: 0, x: -20 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    transition={{ delay: 0.3 + index * 0.1 }} 
                    onClick={() => handleNavigate('guideDetail', { guideId: item.id })} 
                    className="bg-card rounded-2xl p-4 shadow-card hover:shadow-soft transition-all duration-300 cursor-pointer group border border-transparent hover:border-primary/10"
                  >
                    <div className="flex items-start gap-4">
                        {/* Left: Icon */}
                        <div className="flex-shrink-0 pt-1">
                             <GuideIcon iconName={item.icon} category={item.category} className="w-12 h-12 rounded-2xl" size={24} />
                        </div>
                        
                        {/* Middle: Content */}
                        <div className="flex-grow min-w-0 pr-2"> 
                            <h3 className="font-bold text-foreground truncate text-base mb-0.5">{item.name}</h3>
                            <p className="text-sm text-muted-foreground line-clamp-1 mb-1.5 h-5">{item.description || 'No description'}</p>
                            <p className="text-xs text-muted-foreground/70">
                                {new Date(item.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                        </div>

                        {/* Right: Heart */}
                        <div className="flex-shrink-0 pt-1">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFavorite(item);
                                }}
                                className="w-10 h-10 flex items-center justify-center hover:bg-red-50 rounded-full transition-colors focus:outline-none"
                                aria-label="Remove from favorites"
                            >
                                <Heart size={22} className="text-red-500 fill-red-500" />
                            </button>
                        </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}
        </div>
      </div>
    </>
  );
};

export default HomeScreen;
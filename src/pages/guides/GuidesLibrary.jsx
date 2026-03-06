import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus, Frown, Pencil, Library, Search } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { useData } from '@/contexts/DataContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SearchInput from '@/components/ui/SearchInput';
import GuideCard from '@/components/GuideCard';
import { Button } from '@/components/ui/button';
import { searchGuides } from '@/lib/searchUtils';

const GuideList = ({ guides, toggleFavorite, favorites, isLibrary = false, onTabChange, searchTerm }) => {
  const navigate = useNavigate();
  
  if (guides.length === 0) {
    let message = { title: "", description: "" };
    
    if (isLibrary) {
         if (searchTerm) {
             message = { title: "No matches found", description: `We couldn't find any guides matching "${searchTerm}" in the library.` };
         } else {
             message = { title: "Library Empty", description: "You've added all available guides! Check back later for more." };
         }
    } else {
        if (searchTerm) {
            message = { title: "No matches found", description: `You don't have any guides matching "${searchTerm}".` };
        } else {
            message = { title: "A Fresh Start!", description: "Your guides will live here. Create a new guide or find one in the library." };
        }
    }

    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mt-20 px-6"
      >
        {searchTerm ? <Search size={48} className="mx-auto text-muted-foreground/30 mb-4" /> : <Frown size={48} className="mx-auto text-muted-foreground/30 mb-4" />}
        <h2 className="text-xl font-bold text-foreground mb-2">{message.title}</h2>
        <p className="text-muted-foreground mb-6 max-w-xs mx-auto">{message.description}</p>
        {!isLibrary && (
           <Button onClick={() => onTabChange('library')} className="shadow-md bg-gradient-to-r from-[#5CA9E9] to-[#7BC47F] text-white border-0">
              <Library size={16} className="mr-2" />
              {searchTerm ? "Search Library Instead" : "Explore Library"}
           </Button>
        )}
      </motion.div>
    );
  }

  const handleCardClick = (guide) => {
    // Verified: Navigates to correct library route
    if (isLibrary) {
      navigate(`/library/guide/${guide.id}`);
    } else {
      navigate(`/guide/${guide.id}`);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {guides.map((guide, index) => (
        <motion.div
          key={guide.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          className="relative group"
        >
          <GuideCard
            guide={guide}
            isFavorited={!isLibrary && Array.isArray(favorites) && favorites.some(fav => fav.id === guide.id)}
            onToggleFavorite={() => !isLibrary && toggleFavorite(guide)}
            onClick={() => handleCardClick(guide)}
            isLibrary={isLibrary}
          />
          {!isLibrary && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/guide/${guide.id}/edit`); }}
              className="absolute top-1/2 -translate-y-1/2 right-20 bg-background/70 dark:bg-background/50 p-1.5 rounded-full backdrop-blur-sm transition-opacity opacity-0 group-hover:opacity-100 hover:bg-primary/80 hover:text-white"
              aria-label="Edit guide"
            >
              <Pencil size={16} />
            </button>
          )}
        </motion.div>
      ))}
    </div>
  );
};

const GuidesLibrary = ({ favorites, toggleFavorite }) => {
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeMainTab, setActiveMainTab] = useState(location.state?.tab || 'my-guides');
  const [activeCategoryTab, setActiveCategoryTab] = useState('all');
  const { allGuides, guideLibrary } = useData();
  const navigate = useNavigate();

  const filteredGuides = useMemo(() => {
    let sourceGuides;
    if (activeMainTab === 'library') {
      const userGuideTemplateIds = new Set(allGuides.map(g => g.template_id).filter(Boolean));
      sourceGuides = guideLibrary.filter(lg => !userGuideTemplateIds.has(lg.id));
    } else {
      sourceGuides = allGuides.filter(guide => !guide.is_archived);
    }
    
    const searched = searchGuides(sourceGuides, searchTerm);

    if (activeCategoryTab === 'all') {
      return searched;
    }
    return searched.filter(guide => guide.category === activeCategoryTab);
  }, [allGuides, guideLibrary, searchTerm, activeMainTab, activeCategoryTab]);

  const siteUrl = "https://familyplaybook.app";
  const defaultImage = "/icon-192x192.png";

  return (
    <>
      <Helmet>
        <title>Guides - Family Playbook</title>
        <meta name="description" content="Browse and manage your collection of guides. Create new guides for any situation." />
        <meta property="og:title" content="Guides - Family Playbook" />
        <meta property="og:description" content="Browse and manage your collection of guides. Create new guides for any situation." />
        <meta property="og:image" content={defaultImage} />
        <meta property="og:url" content={`${siteUrl}/guides`} />
      </Helmet>
      <div className="min-h-screen bg-background pb-28">
        <main className="p-6">
          <header className="flex items-center justify-between gap-4 mb-6">
            <h1 className="text-3xl font-bold text-foreground">Guides</h1>
          </header>

          <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="w-full mb-6">
            <TabsList className="grid w-full grid-cols-2 bg-secondary rounded-2xl p-1">
              <TabsTrigger value="my-guides" className="rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-soft text-sm font-semibold">My Guides</TabsTrigger>
              <TabsTrigger value="library" className="rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-soft text-sm font-semibold flex items-center gap-2">
                <Library size={16} /> Library
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <SearchInput
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            placeholder={activeMainTab === 'library' ? "Search library templates..." : "Search my guides..."}
            className="mb-6"
          />

          <Tabs value={activeCategoryTab} onValueChange={setActiveCategoryTab} className="w-full mb-6">
            <TabsList className="grid w-full grid-cols-4 bg-secondary rounded-2xl p-1">
              <TabsTrigger value="all" className="rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-soft text-sm font-semibold">All</TabsTrigger>
              <TabsTrigger value="How To" className="rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-soft text-sm font-semibold">How To</TabsTrigger>
              <TabsTrigger value="Find It" className="rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-soft text-sm font-semibold">Find It</TabsTrigger>
              <TabsTrigger value="Reference" className="rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-soft text-sm font-semibold">Reference</TabsTrigger>
            </TabsList>
          </Tabs>

          <GuideList 
            guides={filteredGuides} 
            toggleFavorite={toggleFavorite} 
            favorites={favorites}
            isLibrary={activeMainTab === 'library'}
            onTabChange={setActiveMainTab}
            searchTerm={searchTerm}
          />
        </main>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/guide/new')}
          className="fixed bottom-28 right-6 flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-[#5CA9E9] to-[#7BC47F] text-white shadow-lg z-40"
          aria-label="Create New Guide"
        >
          <Plus size={28} />
        </motion.button>
      </div>
    </>
  );
};

export default GuidesLibrary;
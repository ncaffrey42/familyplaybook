import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Library, Frown, BookOpen } from 'lucide-react'; // Added BookOpen for Guides link
import { Helmet } from 'react-helmet';
import { useData } from '@/contexts/DataContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SearchInput from '@/components/ui/SearchInput';
import BundleImage from '@/components/BundleImage';
import { Button } from '@/components/ui/button';
import { searchBundles } from '@/lib/searchUtils';

const BundleCard = ({ bundle, onClick }) => (
  <div
    onClick={onClick}
    className="bg-white dark:bg-gray-800 rounded-3xl p-4 shadow-card hover:shadow-soft transition-all duration-300 cursor-pointer flex flex-col justify-between group"
  >
    <div className="w-full h-32 rounded-2xl mb-4 overflow-hidden transform group-hover:scale-[1.02] transition-transform duration-300">
      <BundleImage imageUrl={bundle.image} bundleName={bundle.name} bundleColor={bundle.color} />
    </div>
    <div className="text-center">
      <h3 className="font-bold text-lg text-foreground truncate">{bundle.name}</h3>
      <p className="text-sm text-muted-foreground">{bundle.guide_count ?? bundle.guides?.length ?? 0} guides</p>
    </div>
  </div>
);

const BundleList = ({ bundles, isLibrary = false, onTabChange }) => {
  const navigate = useNavigate();

  if (bundles.length === 0) {
    const message = isLibrary 
      ? { title: "Library Cleared!", description: "Looks like you've added all available bundles. Nicely done!" }
      : { title: "No Bundles Here!", description: "Create a new bundle or find one in the library to get started." };

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mt-20"
      >
        <Frown size={48} className="mx-auto text-muted-foreground/50 mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">{message.title}</h2>
        <p className="text-muted-foreground mb-6">{message.description}</p>
        {!isLibrary && (
          <Button onClick={() => onTabChange('library')}>
            <Library size={16} className="mr-2" />
            Explore Library
          </Button>
        )}
      </motion.div>
    );
  }

  const handleCardClick = (bundle) => {
    // Diagnostic logging for navigation debugging
    const targetPath = isLibrary ? `/library/bundle/${bundle.id}` : `/bundle/${bundle.id}`;
    
    if (!bundle.id) {
      console.error('CRITICAL: Bundle ID is missing!', bundle);
      return;
    }

    navigate(targetPath);
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {bundles.map((bundle, index) => (
        <motion.div
          key={bundle.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
        >
          <BundleCard
            bundle={bundle}
            onClick={() => handleCardClick(bundle)}
          />
        </motion.div>
      ))}
    </div>
  );
};


const MyBundlesScreen = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('my-bundles');
  const { allBundles, availableLibraryBundles } = useData();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab);
    }
  }, [location.state]);


  const filteredMyBundles = useMemo(() => {
    const activeBundles = allBundles.filter(bundle => !bundle.is_archived);
    return searchBundles(activeBundles, searchTerm);
  }, [allBundles, searchTerm]);

  const filteredLibraryBundles = useMemo(() => {
    return searchBundles(availableLibraryBundles, searchTerm);
  }, [availableLibraryBundles, searchTerm]);
  
  const siteUrl = "https://familyplaybook.app";
  const defaultImage = "/icon-192x192.png";

  return (
    <>
      <Helmet>
        <title>My Bundles - Family Playbook</title>
        <meta name="description" content="Organize your guides into bundles for easy access. Create custom bundles for any part of your family life." />
        <meta property="og:title" content="My Bundles - Family Playbook" />
        <meta property="og:description" content="Organize your guides into bundles for easy access." />
        <meta property="og:image" content={defaultImage} />
        <meta property="og:url" content={`${siteUrl}/bundles`} />
      </Helmet>
      <div className="min-h-screen bg-background pb-28">
        <main className="p-6">
          <header className="flex items-center justify-between gap-4 mb-6">
            <h1 className="text-3xl font-bold text-foreground">Bundles</h1>
            {/* Added navigation link to Guides section */}
            <Button 
              variant="outline" 
              onClick={() => navigate('/guides')}
              className="rounded-full flex items-center gap-1.5 text-foreground bg-white dark:bg-gray-800 shadow-sm"
            >
              <BookOpen size={18} />
              <span className="hidden sm:inline">Guides</span>
            </Button>
          </header>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-secondary rounded-2xl p-1 mb-6">
              <TabsTrigger value="my-bundles" className="rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-soft text-sm font-semibold">My Bundles</TabsTrigger>
              <TabsTrigger value="library" className="rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-soft text-sm font-semibold flex items-center gap-2">
                <Library size={16} /> Library
              </TabsTrigger>
            </TabsList>
            
            <SearchInput
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              placeholder={activeTab === 'my-bundles' ? "Search my bundles..." : "Search library..."}
              className="mb-6"
            />

            <TabsContent value="my-bundles" className="mt-0">
               <BundleList bundles={filteredMyBundles} onTabChange={setActiveTab} />
            </TabsContent>
            <TabsContent value="library" className="mt-0">
              <BundleList bundles={filteredLibraryBundles} isLibrary={true} onTabChange={setActiveTab} />
            </TabsContent>
          </Tabs>

        </main>
        
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/bundles/create')}
          className="fixed bottom-28 right-6 flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-brand-blue to-brand-green text-white shadow-lg z-40"
          aria-label="Create New Bundle"
        >
          <Plus size={28} />
        </motion.button>
      </div>
    </>
  );
};

export default MyBundlesScreen;
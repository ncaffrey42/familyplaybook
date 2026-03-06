import React from 'react';
    import { motion } from 'framer-motion';
    import { Plus, FileText, ChevronRight } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Helmet } from 'react-helmet';
    import PackImage from '@/components/PackImage';
    import PageHeader from '@/components/PageHeader';
    import { useNavigation } from '@/hooks/useNavigation';
    
    const ViewLibraryPack = ({ pack, onAddPack }) => {
      const handleNavigate = useNavigation();
    
      if (!pack) {
        return (
          <div className="flex items-center justify-center h-screen bg-[#FAF9F6] dark:bg-gray-950">
            <p className="text-gray-600 dark:text-gray-400">Bundle not found. Please go back.</p>
          </div>
        );
      }
    
      const siteUrl = "https://familyplaybook.app";
      const ogImage = pack.image || "https://horizons-cdn.hostinger.com/ffc35e06-ea36-451f-a031-de31af4f5e18/80f125d4a7ccd5e3527e55a703f6454a.png";
    
      return (
        <>
          <Helmet>
            <title>{`${pack.name} - Family Playbook Library`}</title>
            <meta name="description" content={pack.description || `Explore the ${pack.name} bundle in the Family Playbook library.`} />
            <meta property="og:title" content={`${pack.name} - Family Playbook Library`} />
            <meta property="og:description" content={pack.description || `Explore the ${pack.name} bundle in the Family Playbook library.`} />
            <meta property="og:image" content={ogImage} />
            <meta property="og:url" content={`${siteUrl}/library/pack/${pack.id}`} />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={`${pack.name} - Family Playbook Library`} />
            <meta name="twitter:description" content={pack.description || `Explore the ${pack.name} bundle in the Family Playbook library.`} />
            <meta name="twitter:image" content={ogImage} />
          </Helmet>
          <div className="min-h-screen bg-[#FAF9F6] dark:bg-gray-950 pb-20">
            <div className="p-6">
              <PageHeader title="" onBack={() => handleNavigate('packs', { from: 'library' })}>
                <Button 
                  onClick={() => onAddPack(pack)}
                  className="bg-gradient-to-r from-[#5CA9E9] to-[#7BC47F] text-white font-bold rounded-full shadow-lg transition-transform transform hover:scale-105"
                >
                  <Plus size={20} className="sm:mr-2" />
                  <span className="hidden sm:inline">Add to My Bundles</span>
                </Button>
              </PageHeader>
      
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center text-center mb-8"
              >
                 <div className="w-48 h-32 rounded-3xl mb-4 overflow-hidden shadow-soft bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
                    <PackImage 
                      imageUrl={pack.image}
                      packName={pack.name}
                      packColor={pack.color}
                      className="w-full h-full object-cover"
                    />
                  </div>
                <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">{pack.name}</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1 max-w-md">{pack.description}</p>
                 <div className="flex items-center gap-4 mt-4 text-sm text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-1.5">
                    <FileText size={16} />
                    <span>{pack.guides?.length || 0} guides</span>
                  </div>
                </div>
              </motion.div>
      
              {pack.guides && pack.guides.length > 0 ? (
                <div className="space-y-3">
                  <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200 mb-2 px-1">Guides in this Bundle</h2>
                  {pack.guides.map((guide, index) => (
                    <motion.div
                      key={guide.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      onClick={() => handleNavigate('viewLibraryGuide', { guide })}
                      className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card hover:shadow-soft transition-all duration-300 cursor-pointer flex items-center gap-4"
                    >
                      <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-2xl">
                        {guide.icon}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-800 dark:text-gray-200">{guide.name}</h3>
                         <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">{guide.description}</p>
                      </div>
                      <ChevronRight size={20} className="text-gray-400 dark:text-gray-500" />
                    </motion.div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </>
      );
    };
    
    export default ViewLibraryPack;
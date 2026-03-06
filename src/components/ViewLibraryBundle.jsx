import React from 'react';
import { motion } from 'framer-motion';
import { Plus, FileText, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Helmet } from 'react-helmet';
import BundleImage from '@/components/BundleImage';
import PageHeader from '@/components/PageHeader';
import { useNavigation } from '@/hooks/useNavigation';
import GuideIcon from '@/components/GuideIcon';

const ViewLibraryBundle = ({ bundle, onAddBundle, ownedTemplateIds }) => {
  const handleNavigate = useNavigation();

  if (!bundle) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#FAF9F6] dark:bg-gray-950">
        <p className="text-gray-600 dark:text-gray-400">Bundle not found. Please go back.</p>
      </div>
    );
  }

  const siteUrl = "https://familyplaybook.app";
  const ogImage = bundle.image || "https://horizons-cdn.hostinger.com/ffc35e06-ea36-451f-a031-de31af4f5e18/80f125d4a7ccd5e3527e55a703f6454a.png";

  return (
    <>
      <Helmet>
        <title>{`${bundle.name} - Family Playbook Library`}</title>
        <meta name="description" content={bundle.description || `Explore the ${bundle.name} bundle in the Family Playbook library.`} />
        <meta property="og:title" content={`${bundle.name} - Family Playbook Library`} />
        <meta property="og:description" content={bundle.description || `Explore the ${bundle.name} bundle in the Family Playbook library.`} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:url" content={`${siteUrl}/library/bundle/${bundle.id}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${bundle.name} - Family Playbook Library`} />
        <meta name="twitter:description" content={bundle.description || `Explore the ${bundle.name} bundle in the Family Playbook library.`} />
        <meta name="twitter:image" content={ogImage} />
      </Helmet>
      <div className="min-h-screen bg-[#FAF9F6] dark:bg-gray-950 pb-20">
        <div className="p-6">
          <PageHeader title="" onBack={() => handleNavigate('bundles', { from: 'library' })}>
            <Button 
              onClick={() => onAddBundle(bundle)}
              className="bg-gradient-to-r from-[#5CA9E9] to-[#7BC47F] text-white font-bold rounded-full shadow-lg transition-transform transform hover:scale-105"
            >
              <Plus size={20} className="sm:mr-2" />
              <span className="hidden sm:inline">Add All to My Bundles</span>
            </Button>
          </PageHeader>
  
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center text-center mb-8"
          >
             <div className="w-48 h-32 rounded-3xl mb-4 overflow-hidden shadow-soft bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
                <BundleImage 
                  imageUrl={bundle.image}
                  bundleName={bundle.name}
                  bundleColor={bundle.color}
                  className="w-full h-full object-cover"
                />
              </div>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">{bundle.name}</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1 max-w-md">{bundle.description}</p>
             <div className="flex items-center gap-4 mt-4 text-sm text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-1.5">
                <FileText size={16} />
                <span>{bundle.guides?.length || 0} guides</span>
              </div>
            </div>
          </motion.div>
  
          {bundle.guides && bundle.guides.length > 0 ? (
            <div className="space-y-3">
              <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200 mb-2 px-1">Guides in this Bundle</h2>
              {bundle.guides.map((guide, index) => {
                const isOwned = ownedTemplateIds?.has(guide.id);
                return (
                  <motion.div
                    key={guide.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    onClick={() => handleNavigate('viewLibraryGuide', { guideId: guide.id, bundleId: bundle.id })}
                    className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card hover:shadow-soft transition-all duration-300 cursor-pointer flex items-center gap-4 relative overflow-hidden"
                  >
                    <GuideIcon iconName={guide.icon} category={guide.category} />
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-800 dark:text-gray-200">{guide.name}</h3>
                       <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">{guide.description}</p>
                    </div>
                    {isOwned ? (
                      <div className="flex items-center gap-1 text-green-500 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-full text-xs font-medium">
                        <Check size={12} />
                        <span>Added</span>
                      </div>
                    ) : (
                      <ChevronRight size={20} className="text-gray-400 dark:text-gray-500" />
                    )}
                  </motion.div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
};

export default ViewLibraryBundle;
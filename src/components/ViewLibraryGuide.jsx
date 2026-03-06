import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Helmet } from 'react-helmet';
import GuideIcon from '@/components/GuideIcon';
import { useNavigation } from '@/hooks/useNavigation';

const ViewLibraryGuide = ({ guide, onAddGuide, onAddAndEdit, isAlreadyAdded }) => {
  const handleNavigate = useNavigation();

  if (!guide) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#FAF9F6] dark:bg-gray-950">
        <p className="text-gray-600 dark:text-gray-400">Guide not found.</p>
      </div>
    );
  }

  // Safely extract data
  const steps = (guide && Array.isArray(guide.steps)) ? guide.steps : [];
  const content = guide ? guide.content : null;
  
  // Helper to check if content is actually empty
  const hasContent = content && (content.description || content.intro || content.image);
  const hasSteps = steps && steps.length > 0;

  const siteUrl = "https://familyplaybook.app";
  const ogImage = "https://horizons-cdn.hostinger.com/ffc35e06-ea36-451f-a031-de31af4f5e18/80f125d4a7ccd5e3527e55a703f6454a.png";
  const ogDescription = content?.description?.substring(0, 150) || `Template for "${guide.name}" in Family Playbook.`;

  return (
    <>
      <Helmet>
        <title>{`Library: ${guide.name} - Family Playbook`}</title>
        <meta name="description" content={ogDescription} />
        <meta property="og:title" content={`Library: ${guide.name} - Family Playbook`} />
        <meta property="og:description" content={ogDescription} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:url" content={`${siteUrl}/library/guide/${guide.id}`} />
      </Helmet>
      <div className="min-h-screen bg-[#FAF9F6] dark:bg-gray-950">
        {/* Header */}
        <div className="bg-gradient-to-br from-[#5CA9E9]/20 to-[#7BC47F]/20 dark:from-[#5CA9E9]/10 dark:to-[#7BC47F]/10 p-6 pb-8 pt-6">
          <div className="flex items-center justify-between mb-6 max-w-3xl mx-auto w-full">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleNavigate('back')}
              className="rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-800 dark:text-gray-100 hover:bg-white dark:hover:bg-gray-800"
            >
              <ArrowLeft size={24} />
            </Button>
            
            <div className="flex gap-2">
              {!isAlreadyAdded && (
                <Button 
                    onClick={() => onAddAndEdit && onAddAndEdit(guide)}
                    variant="outline"
                    className="rounded-full border-primary/20 text-primary hover:bg-primary/10 bg-white/50 dark:bg-gray-800/50 dark:text-white"
                >
                    <span className="hidden sm:inline">Customize</span>
                    <ExternalLink size={16} className="ml-0 sm:ml-2" />
                </Button>
              )}
              <Button 
                onClick={() => !isAlreadyAdded && onAddGuide(guide)} 
                disabled={isAlreadyAdded}
                className={`rounded-full shadow-sm transition-all font-semibold ${isAlreadyAdded ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-white text-gray-900 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-100'}`}
              >
                  {isAlreadyAdded ? (
                    <>
                      <Check size={16} className="mr-2"/> Added
                    </>
                  ) : (
                    <>
                      <Plus size={16} className="mr-2"/> Add to My Guides
                    </>
                  )}
              </Button>
            </div>
          </div>
  
          <div className="flex items-center gap-4 max-w-3xl mx-auto w-full">
            <GuideIcon iconName={guide.icon} category={guide.category} size={32} className="w-16 h-16 rounded-2xl shadow-soft bg-white dark:bg-gray-800" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100">{guide.name}</h1>
              <p className="text-gray-600 dark:text-gray-400 font-medium">{guide.category}</p>
            </div>
          </div>
        </div>
  
        <div className="p-6 max-w-3xl mx-auto pb-24">
          
          {/* 1. Render Description/Content Block if exists */}
          {hasContent && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-800 rounded-2xl p-6 sm:p-8 shadow-card border border-gray-100 dark:border-gray-800 mb-8"
            >
              {(content.intro || content.description) && (
                  <div className="prose dark:prose-invert max-w-none">
                      {content.intro && <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4 leading-relaxed">{content.intro}</p>}
                      {content.description && <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{content.description}</p>}
                  </div>
              )}
              {content.image && (
                <div className="mt-6 rounded-xl overflow-hidden shadow-sm">
                    <img alt={guide.name} className="w-full h-auto object-cover" src={content.image} loading="lazy" />
                </div>
              )}
            </motion.div>
          )}

          {/* 2. Render Steps Block if exists */}
          {hasSteps && (
            <div className="space-y-6">
              {hasContent && <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 px-2">Instructions</h3>}
              {steps.map((step, index) => (
                <motion.div
                  key={(step.title || 'step') + index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex gap-4"
                >
                  <div className="flex-shrink-0 flex flex-col items-center pt-1">
                    <div className="w-8 h-8 rounded-full bg-[#5CA9E9] text-white flex items-center justify-center font-bold text-sm shadow-sm z-10">
                      {index + 1}
                    </div>
                    {index !== steps.length - 1 && (
                      <div className="w-0.5 flex-grow bg-gray-200 dark:bg-gray-800 my-2"></div>
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    {step.title && <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">{step.title}</h3>}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
                      <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                        {step.content}
                      </p>
                      {step.mediaUrl && (
                        <img src={step.mediaUrl} alt={step.title} className="mt-4 rounded-xl w-full object-cover max-h-60" loading="lazy" />
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
          
          {/* Empty State fallback */}
          {!hasContent && !hasSteps && (
             <div className="text-center py-12 text-gray-500">
                 <p>This template is ready for your content.</p>
             </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ViewLibraryGuide;
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, FileText } from 'lucide-react';
import { Helmet } from 'react-helmet';
import SearchInput from '@/components/ui/SearchInput';
import { searchGuides, searchBundles } from '@/lib/searchUtils';

const SearchScreen = ({ onNavigate, packs, guides }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredPacks = searchTerm 
        ? searchBundles(packs, searchTerm)
        : [];

    const filteredGuides = searchTerm
        ? searchGuides(guides, searchTerm)
        : [];

    const handleResultClick = (item) => {
        if (item.type === 'guide') {
            onNavigate('guideDetail', { guide: item });
        } else if (item.type === 'pack') {
            onNavigate('packDetail', { pack: item });
        }
    };

    const siteUrl = "https://familyplaybook.app";
    const defaultImage = "/icon-192x192.png";

    return (
        <>
            <Helmet>
                <title>Search - Family Playbook</title>
                <meta name="description" content="Search for packs and guides within your Family Playbook. Find what you need, when you need it." />
                <meta property="og:title" content="Search - Family Playbook" />
                <meta property="og:description" content="Search for packs and guides within your Family Playbook. Find what you need, when you need it." />
                <meta property="og:image" content={defaultImage} />
                <meta property="og:url" content={`${siteUrl}/search`} />
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="Search - Family Playbook" />
                <meta name="twitter:description" content="Search for packs and guides within your Family Playbook. Find what you need, when you need it." />
                <meta name="twitter:image" content={defaultImage} />
            </Helmet>
            <div className="min-h-screen bg-[#FAF9F6] dark:bg-gray-950 pb-24">
                <div className="p-6">
                    <SearchInput
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        placeholder="Search for anything..."
                        className="mb-6"
                    />

                    <AnimatePresence>
                        {searchTerm && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            >
                                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Results</h2>
                                {(filteredPacks.length === 0 && filteredGuides.length === 0) ? (
                                    <p className="text-gray-500 dark:text-gray-400">No results found for "{searchTerm}".</p>
                                ) : (
                                    <div className="space-y-3">
                                        {filteredPacks.map(pack => (
                                            <motion.div
                                                key={`pack-${pack.id}`}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                onClick={() => handleResultClick({ ...pack, type: 'pack' })}
                                                className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card hover:shadow-soft transition-all duration-300 cursor-pointer flex items-center gap-4"
                                            >
                                                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: pack.color || '#A2D2FF' }}>
                                                    <Package size={24} className="text-white" />
                                                </div>
                                                <div className="flex-1">
                                                    <h3 className="font-semibold text-gray-800 dark:text-gray-200">{pack.name}</h3>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400">Pack</p>
                                                </div>
                                            </motion.div>
                                        ))}
                                        {filteredGuides.map(guide => (
                                            <motion.div
                                                key={`guide-${guide.id}`}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                onClick={() => handleResultClick({ ...guide, type: 'guide' })}
                                                className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-card hover:shadow-soft transition-all duration-300 cursor-pointer flex items-center gap-4"
                                            >
                                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#5CA9E9]/20 to-[#7BC47F]/20 flex items-center justify-center text-2xl">
                                                    {guide.icon}
                                                </div>
                                                <div className="flex-1">
                                                    <h3 className="font-semibold text-gray-800 dark:text-gray-200">{guide.name}</h3>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400">Guide in {guide.pack}</p>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </>
    );
};

export default SearchScreen;
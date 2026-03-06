import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, ChevronDown, Bug, ServerCrash, Copy, Lightbulb, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Helmet } from 'react-helmet';
import { getLogs, clearLogs } from '@/lib/errorLogger';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import PageHeader from '@/components/PageHeader';
import { Loader2 } from 'lucide-react';
import { useNavigation } from '@/hooks/useNavigation';

const LogItem = ({ log, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const { toast } = useToast();

  const handleCopy = () => {
    const detailsToCopy = `Error: ${log.message}\n\nStack Trace:\n${log.stack}\n\nBreadcrumbs:\n${JSON.stringify(log.breadcrumbs, null, 2)}\n\nAI Analysis:\n${JSON.stringify(log.ai_analysis, null, 2)}`;
    navigator.clipboard.writeText(detailsToCopy);
    toast({
      title: 'Copied to Clipboard!',
      description: 'The error details have been copied.',
    });
  };

  const aiAnalysis = log.ai_analysis;
  const hasValidAnalysis = aiAnalysis && typeof aiAnalysis === 'object' && aiAnalysis.probable_cause && aiAnalysis.recommended_solution;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-4 overflow-hidden">
          <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <Bug size={20} className="text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-800 dark:text-gray-100 truncate">{log.message}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {new Date(log.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <ChevronDown
          size={20}
          className={`text-gray-400 transition-transform ml-2 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 border-t border-gray-100 dark:border-gray-700 space-y-4">
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={handleCopy}>
                  <Copy size={16} className="mr-2" />
                  Copy Details
                </Button>
              </div>

              {hasValidAnalysis ? (
                <>
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                    <h4 className="flex items-center gap-2 font-semibold text-blue-800 dark:text-blue-300 mb-2"><Lightbulb size={18} /> Probable Cause</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-400">{aiAnalysis.probable_cause}</p>
                  </div>
                   <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                    <h4 className="flex items-center gap-2 font-semibold text-green-800 dark:text-green-300 mb-2"><Wrench size={18} /> Recommended Solution</h4>
                    <p className="text-sm text-green-700 dark:text-green-400 whitespace-pre-wrap">{aiAnalysis.recommended_solution}</p>
                  </div>
                </>
              ) : (
                 <div className="text-center py-4">
                  <p className="text-gray-500 dark:text-gray-400">AI analysis is pending or unavailable.</p>
                </div>
              )}
             
              <div>
                <h4 className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Full Error Stack:</h4>
                <pre className="bg-gray-100 dark:bg-gray-900/50 p-3 rounded-lg text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap break-words">
                  {log.stack || log.message}
                </pre>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};


const ErrorLogScreen = () => {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const handleNavigate = useNavigation();

  useEffect(() => {
    const fetchLogs = async () => {
      setIsLoading(true);
      const dbLogs = await getLogs();
      setLogs(dbLogs);
      setIsLoading(false);
    };
    fetchLogs();
  }, []);

  const handleClearLogs = async () => {
    await clearLogs();
    setLogs([]);
    toast({
      title: "Logs Cleared",
      description: "The error log has been emptied.",
    });
  };

  const siteUrl = "https://familyplaybook.app";
  const defaultImage = "https://horizons-cdn.hostinger.com/ffc35e06-ea36-451f-a031-de31af4f5e18/80f125d4a7ccd5e3527e55a703f6454a.png";

  return (
    <>
      <Helmet>
        <title>Error Log - Family Playbook</title>
        <meta name="description" content="View application error logs for debugging purposes." />
        <meta property="og:title" content="Error Log - Family Playbook" />
        <meta property="og:description" content="View application error logs for debugging purposes." />
        <meta property="og:image" content={defaultImage} />
        <meta property="og:url" content={`${siteUrl}/error-log`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Error Log - Family Playbook" />
        <meta name="twitter:description" content="View application error logs for debugging purposes." />
        <meta name="twitter:image" content={defaultImage} />
      </Helmet>
      <div className="min-h-screen bg-[#FAF9F6] dark:bg-gray-950 pb-24">
        <div className="p-6">
          <PageHeader title="Error Log" onBack={() => handleNavigate('account')}>
            {logs.length > 0 && (
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                            <Trash2 size={16} className="mr-2" />
                            Clear
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                            This will permanently delete all error logs. This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleClearLogs} className="bg-red-500 hover:bg-red-600">
                                Delete All
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
          </PageHeader>
          
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-[#5CA9E9]" />
            </div>
          ) : (
            <div className="space-y-4">
              {logs.length > 0 ? (
                logs.map((log, index) => (
                  <LogItem key={log.id} log={log} defaultOpen={index === 0} />
                ))
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center mt-20"
                >
                  <ServerCrash size={48} className="mx-auto text-green-500 mb-4" />
                  <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200 mb-2">No Errors Here!</h2>
                  <p className="text-gray-500 dark:text-gray-400">Everything is running smoothly. Any errors will appear here.</p>
                </motion.div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ErrorLogScreen;
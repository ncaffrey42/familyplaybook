import React, { useState } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { Button } from '@/components/ui/button';
import { RefreshCw, Zap, Database, Users, Box, Book, Archive, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import DowngradeFlow from './DowngradeFlow';
import { format } from 'date-fns';

const UsageMeter = ({ label, current, limit, icon: Icon }) => {
  const isUnlimited = !limit || limit > 999999 || limit === -1;
  const percentage = isUnlimited ? 0 : Math.min((current / limit) * 100, 100);
  
  let colorClass = "bg-green-500";
  if (percentage > 80) colorClass = "bg-red-500";
  else if (percentage > 50) colorClass = "bg-yellow-500";

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-sm">
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
          {Icon && <Icon size={14} />}
          <span>{label}</span>
        </div>
        <span className="font-mono text-xs font-semibold">
          {current} / {isUnlimited ? '∞' : limit}
        </span>
      </div>
      <div className="h-2 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div 
          className={cn("h-full transition-all duration-500", colorClass)} 
          style={{ width: isUnlimited ? '100%' : `${percentage}%` }}
        />
      </div>
    </div>
  );
};

const MyAccountPlanSection = () => {
  const { subscription, loading, fetchSubscription } = useSubscription();
  const [showDowngrade, setShowDowngrade] = useState(false);

  if (loading && !subscription) return <div className="p-8 text-center text-gray-500"><RefreshCw className="animate-spin inline mr-2"/> Loading Usage...</div>;
  if (!subscription) return null;

  const { plan_name, usage = {}, entitlements = [], current_period_end, cancel_at_period_end, status } = subscription;
  
  // Helper to get limit
  const getLimit = (key) => {
      const ent = entitlements.find(e => e.feature_key === key);
      if (ent?.is_unlimited) return -1;
      return ent?.feature_value_int || 0;
  };
  
  const storageLimit = getLimit('storage_bytes_max');
  const storageUsed = usage['storage_bytes'] || 0;
  
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const isPaid = plan_name !== 'Free';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            Current Plan: <span className="text-[#5CA9E9]">{plan_name}</span>
          </h2>
          <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
              <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium capitalize", 
                  status === 'active' ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
              )}>
                  {status}
              </span>
              {current_period_end && (
                  <span>
                     • {cancel_at_period_end ? "Ends" : "Renews"} {format(new Date(current_period_end), 'MMM d, yyyy')}
                  </span>
              )}
          </div>
          {cancel_at_period_end && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertCircle size={12} /> Subscription canceling soon
              </p>
          )}
        </div>
        
        <div className="flex gap-2">
            {isPaid && (
                <Button variant="outline" size="sm" onClick={() => setShowDowngrade(true)}>
                    Downgrade
                </Button>
            )}
            <Button variant="ghost" size="sm" onClick={fetchSubscription} className="text-gray-400 hover:text-gray-600">
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <UsageMeter 
          label="Active Guides" 
          current={usage['active_guides'] || 0} 
          limit={getLimit('active_guides_max')}
          icon={Book}
        />
        <UsageMeter 
          label="Bundles" 
          current={usage['bundles'] || 0} 
          limit={getLimit('bundles_max')}
          icon={Box}
        />
        <UsageMeter 
          label="Archived Guides" 
          current={usage['archived_guides'] || 0} 
          limit={getLimit('archived_guides_max')}
          icon={Archive}
        />
        <UsageMeter 
          label="Team Members" 
          current={usage['editors'] || 0} 
          limit={getLimit('editors_max')}
          icon={Users}
        />
        <div className="md:col-span-2">
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <Database size={14} />
                <span>Storage</span>
              </div>
              <span className="font-mono text-xs font-semibold">
                {formatBytes(storageUsed)} / {storageLimit === -1 ? '∞' : formatBytes(storageLimit)}
              </span>
            </div>
            <div className="h-2 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                className={cn("h-full bg-blue-500 transition-all duration-500")} 
                style={{ width: storageLimit === -1 ? '1%' : `${Math.min((storageUsed / storageLimit) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <DowngradeFlow 
         isOpen={showDowngrade} 
         onClose={() => setShowDowngrade(false)} 
         targetPlanName="Free" // Default logic: downgrade usually means going to Free or lower tier. Simple version.
      />
    </div>
  );
};

export default MyAccountPlanSection;
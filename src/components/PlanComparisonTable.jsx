import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { useSubscription } from '@/hooks/useSubscription';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import DowngradeFlow from './DowngradeFlow';

const PlanComparisonTable = () => {
  const { subscription } = useSubscription();
  const currentPlanName = subscription?.plan_name || 'Free';
  
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downgradeTarget, setDowngradeTarget] = useState(null);

  useEffect(() => {
    const loadPlans = async () => {
      try {
        const data = await apiClient.getPlans();
        const ordered = data.sort((a, b) => {
          const order = { 'Free': 0, 'Couple': 1, 'Family': 2 };
          return (order[a.name] || 99) - (order[b.name] || 99);
        });
        setPlans(ordered);
      } catch (e) {
        console.error("Failed to load plans", e);
      } finally {
        setLoading(false);
      }
    };
    loadPlans();
  }, []);

  const getEntitlementValue = (planEntitlements, key) => {
    const ent = planEntitlements.find(e => e.feature_key === key);
    if (!ent) return <span className="text-gray-300">-</span>;
    if (ent.is_unlimited) return <span className="font-bold">Unlimited</span>;
    if (ent.feature_value_text) return ent.feature_value_text;
    return ent.feature_value_int;
  };

  const getButtonState = (planName) => {
    const normalizedPlanName = planName.toLowerCase();
    const current = currentPlanName.toLowerCase();
    
    // Exact match
    if (normalizedPlanName === current || (current.includes(normalizedPlanName) && normalizedPlanName !== 'free')) {
      return { label: "Current Plan", disabled: true, variant: "secondary", action: null };
    }
    
    const tiers = ['free', 'couple', 'family'];
    const currentIdx = tiers.findIndex(t => current.includes(t));
    const targetIdx = tiers.findIndex(t => normalizedPlanName.includes(t));
    
    if (targetIdx > currentIdx) {
      return { label: "Upgrade", disabled: false, variant: "default", action: 'upgrade' };
    }
    
    return { label: "Downgrade", disabled: false, variant: "outline", action: 'downgrade' };
  };

  const handleAction = (plan, action) => {
    if (action === 'upgrade') {
        navigate('/account/upgrade', { state: { targetPlan: plan.name } });
    } else if (action === 'downgrade') {
        setDowngradeTarget(plan);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-gray-400" /></div>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800/50">
            <th className="p-4 font-medium text-gray-500 dark:text-gray-400">Features</th>
            {plans.map(plan => (
              <th key={plan.id} className={cn("p-4 text-center text-lg font-bold text-gray-900 dark:text-white", currentPlanName === plan.name ? "text-[#5CA9E9]" : "")}>
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          <tr>
            <td className="p-4 font-medium">Active Guides</td>
            {plans.map(plan => (
              <td key={plan.id} className="p-4 text-center">{getEntitlementValue(plan.entitlements, 'active_guides_max')}</td>
            ))}
          </tr>
          <tr>
            <td className="p-4 font-medium">Bundles</td>
            {plans.map(plan => (
              <td key={plan.id} className="p-4 text-center">{getEntitlementValue(plan.entitlements, 'bundles_max')}</td>
            ))}
          </tr>
           <tr>
            <td className="p-4 font-medium">Storage</td>
            {plans.map(plan => {
              const val = plan.entitlements.find(e => e.feature_key === 'storage_bytes_max');
              if (val?.is_unlimited) return <td key={plan.id} className="p-4 text-center">Unlimited</td>;
              const gb = val ? val.feature_value_int / (1024*1024*1024) : 0;
              return <td key={plan.id} className="p-4 text-center">{gb > 0 ? `${gb} GB` : '-'}</td>
            })}
          </tr>
           <tr>
            <td className="p-4 font-medium">Members</td>
            {plans.map(plan => (
              <td key={plan.id} className="p-4 text-center">{getEntitlementValue(plan.entitlements, 'editors_max')}</td>
            ))}
          </tr>
          <tr>
            <td className="p-4"></td>
            {plans.map(plan => {
              const { label, disabled, variant, action } = getButtonState(plan.name);
              return (
                <td key={plan.id} className="p-4 text-center">
                  <Button 
                    variant={variant} 
                    disabled={disabled}
                    onClick={() => handleAction(plan, action)}
                    className={cn("w-full", label === 'Current Plan' && "opacity-70")}
                  >
                    {label}
                  </Button>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>

      {downgradeTarget && (
          <DowngradeFlow 
            isOpen={!!downgradeTarget} 
            onClose={() => setDowngradeTarget(null)} 
            targetPlanName={downgradeTarget.name}
            targetPlanId={downgradeTarget.id}
          />
      )}
    </div>
  );
};

export default PlanComparisonTable;
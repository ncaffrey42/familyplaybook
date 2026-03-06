import React from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import AccountLayout from '@/components/AccountLayout';
import PlanComparisonTable from '@/components/PlanComparisonTable';
import MyAccountPlanSection from '@/components/MyAccountPlanSection';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, CalendarDays, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

const AccountPlans = () => {
  const { subscription, loading } = useSubscription();
  const navigate = useNavigate();

  if (loading && !subscription) return <AccountLayout><div className="p-10 text-center">Loading plans...</div></AccountLayout>;

  // Fallback if no sub loaded yet
  const planName = subscription?.plan_name || 'Free';
  const status = subscription?.status || 'active';
  const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;
  const isFree = planName === 'Free';

  return (
    <AccountLayout>
      <Helmet>
        <title>Plans & Pricing - Family Playbook</title>
        <meta name="description" content="Manage your subscription" />
      </Helmet>

      <div className="space-y-8 max-w-5xl mx-auto pb-10">
        
        {/* Current Plan Summary Card */}
        <Card className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 border-l-4 border-l-[#5CA9E9] shadow-md">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  Current Plan: <span className="text-[#5CA9E9] capitalize">{planName}</span>
                  {!isFree && <Badge variant="secondary" className="bg-[#5CA9E9]/10 text-[#5CA9E9] border-0"><Zap size={12} className="mr-1" fill="currentColor"/> Active</Badge>}
                </CardTitle>
                <CardDescription className="mt-1">
                  Manage your subscription details.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
              <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 p-3 rounded-lg border shadow-sm">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full text-green-600 dark:text-green-400">
                   <CheckCircle2 size={18} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-semibold capitalize">{status}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 p-3 rounded-lg border shadow-sm">
                 <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600 dark:text-blue-400">
                   <CalendarDays size={18} />
                 </div>
                 <div>
                   <p className="text-xs text-muted-foreground">Renews On</p>
                   <p className="font-semibold">{periodEnd ? format(periodEnd, 'MMM d, yyyy') : 'N/A'}</p>
                 </div>
              </div>
              
              <div className="flex items-center justify-end">
                 {isFree ? (
                    <Button onClick={() => navigate('/account/upgrade')} className="w-full md:w-auto bg-[#5CA9E9] hover:bg-[#4B98D8]">
                       Upgrade Plan
                    </Button>
                 ) : (
                    <Button variant="outline" onClick={() => navigate('/account/upgrade')} className="w-full md:w-auto">
                       Manage Billing
                    </Button>
                 )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Usage Section */}
        <section>
          <h3 className="text-lg font-semibold mb-4 px-1 text-gray-900 dark:text-gray-100">Current Usage</h3>
          <MyAccountPlanSection />
        </section>

        {/* Comparison Table */}
        <section>
          <div className="flex items-center justify-between mb-4 px-1">
             <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Available Plans</h3>
          </div>
          <PlanComparisonTable />
        </section>

      </div>
    </AccountLayout>
  );
};

export default AccountPlans;
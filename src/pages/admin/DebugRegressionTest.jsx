import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useEntitlements } from '@/contexts/EntitlementContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const DebugRegressionTest = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, subscriptionStatus, planKey } = useAuth();
  const { checkEntitlement } = useEntitlements();
  const [entitlementResults, setEntitlementResults] = useState({});

  const testEntitlements = async () => {
    const actions = ['GUIDE_CREATE', 'BUNDLE_CREATE', 'STORAGE_UPLOAD', 'FAMILY_INVITE'];
    const results = {};
    
    for (const action of actions) {
      const result = await checkEntitlement(action);
      results[action] = result;
    }
    setEntitlementResults(results);
  };

  useEffect(() => {
    if (user) {
      testEntitlements();
    }
  }, [user]);

  if (!user) {
    return (
      <div className="p-8">
        <h1>Debug Page</h1>
        <p>Please log in to use debug tools.</p>
        <Button onClick={() => navigate('/login')}>Go to Login</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8 space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-red-600">🐞 Debug & Regression</h1>
        <Button variant="outline" onClick={() => navigate('/')}>Exit Debug Mode</Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Environment & Route Info */}
        <Card>
          <CardHeader>
            <CardTitle>Environment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="font-semibold">Current Route:</span>
              <code className="bg-gray-100 px-2 py-1 rounded">{location.pathname}</code>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">Node Env:</span>
              <Badge variant={import.meta.env.DEV ? "destructive" : "default"}>
                {import.meta.env.MODE}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* User Context Info */}
        <Card>
          <CardHeader>
            <CardTitle>User Context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <span className="font-semibold">User ID:</span>
              <span className="truncate">{user.id}</span>
              
              <span className="font-semibold">Email:</span>
              <span>{user.email}</span>
              
              <span className="font-semibold">Plan Key:</span>
              <Badge variant="outline" className="w-fit">{planKey}</Badge>
              
              <span className="font-semibold">Sub Status:</span>
              <Badge variant={subscriptionStatus === 'active' ? "success" : "secondary"} className="w-fit">
                {subscriptionStatus}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Navigation Tests */}
        <Card>
          <CardHeader>
            <CardTitle>Navigation Regression Tests</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">
              Clicking these should work regardless of plan status (Free/Paid).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => navigate('/home')}>Home</Button>
              <Button size="sm" variant="secondary" onClick={() => navigate('/guides')}>Guides List</Button>
              <Button size="sm" variant="secondary" onClick={() => navigate('/bundles')}>Bundles List</Button>
              <Button size="sm" variant="secondary" onClick={() => navigate('/library/guides')}>Library</Button>
              <Button size="sm" variant="secondary" onClick={() => navigate('/account')}>Account</Button>
              <Button size="sm" variant="secondary" onClick={() => navigate('/account/plans')}>Plans</Button>
            </div>
          </CardContent>
        </Card>

        {/* Entitlement Tests */}
        <Card>
          <CardHeader>
            <CardTitle>Entitlement Check (Live)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">
              Checks should only block CREATE/WRITE actions.
            </p>
            <div className="space-y-2">
              {Object.entries(entitlementResults).map(([action, result]) => (
                <div key={action} className="flex items-center justify-between border p-2 rounded bg-white">
                  <span className="font-mono text-xs">{action}</span>
                  {result.allowed ? (
                    <Badge className="bg-green-500">ALLOWED</Badge>
                  ) : (
                    <Badge variant="destructive">DENIED: {result.reason_code}</Badge>
                  )}
                </div>
              ))}
              <Button size="sm" className="w-full mt-2" onClick={testEntitlements}>Re-run Checks</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DebugRegressionTest;
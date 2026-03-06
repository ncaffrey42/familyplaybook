import React from 'react';
import { Loader2, Calendar, AlertTriangle, Crown, Zap, Check, Heart, ArrowRight, History, FileText, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const LoadingSpinner = () => (
    <div className="flex justify-center items-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
    </div>
);

export const AccountSection = ({ title, children }) => (
    <div className="space-y-4">
        {title && <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{title}</h3>}
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl shadow-sm divide-y divide-gray-100 dark:divide-gray-700/50">
            {children}
        </div>
    </div>
);

export const ListItem = ({ icon: Icon, title, onClick, rightElement }) => (
    <div
        onClick={onClick}
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
    >
        <div className="flex items-center gap-4">
            <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg">
                <Icon size={20} className="text-gray-600 dark:text-gray-300" />
            </div>
            <span className="font-medium text-gray-800 dark:text-gray-200">{title}</span>
        </div>
        {rightElement}
    </div>
);

export const BillingHistorySection = ({ onManageClick, isManaging }) => (
    <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500">
                <FileText size={24} />
            </div>
            <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Billing History</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">View past invoices and receipts</p>
            </div>
        </div>
        <Button variant="outline" onClick={onManageClick} disabled={isManaging} className="w-full sm:w-auto">
             {isManaging ? <Loader2 className="animate-spin mr-2" size={16} /> : <ExternalLink className="mr-2" size={16} />}
             View Invoices
        </Button>
    </div>
);

export const SubscriptionInfo = ({ isPremium, planKey, status, interval, currentPeriodEnd, onManageClick, cancelAtPeriodEnd }) => {
    const getPlanConfig = () => {
        if (planKey === 'couple') return { name: 'Couple Plan', icon: Heart, gradient: 'from-[#FFB88C] to-[#FF8A8A]' };
        if (planKey === 'family') return { name: 'Family Plan', icon: Crown, gradient: 'from-[#5CA9E9] to-[#7BC47F]' };
        return { name: 'Free Tier', icon: Zap, gradient: 'from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900' };
    };

    const config = getPlanConfig();
    const PlanIcon = config.icon;

    const getIntervalDisplay = () => {
        if (!isPremium) return '';
        if (interval === 'year') return 'Yearly';
        return 'Monthly';
    };

    const getRenewalDate = () => {
        if (!currentPeriodEnd) return null;
        return new Date(currentPeriodEnd).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    };

    const isPastDue = status === 'past_due' || status === 'unpaid';
    const isActivePremium = (status === 'active' || status === 'trialing') && (planKey === 'couple' || planKey === 'family');
    const isCanceling = cancelAtPeriodEnd;

    return (
        <div className="relative overflow-hidden rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800">
             {/* Background Gradient/Pattern */}
             <div className={cn("absolute inset-0 opacity-10 dark:opacity-20 bg-gradient-to-br", config.gradient)} />
             
             <div className="relative p-6 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-4">
                        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg bg-gradient-to-br", isPremium ? config.gradient : "from-gray-400 to-gray-500")}>
                            <PlanIcon className="h-6 w-6 fill-white/20" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-xl text-gray-900 dark:text-gray-100">{config.name}</h3>
                                {isActivePremium && !isCanceling && !isPastDue && (
                                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
                                        Active
                                    </span>
                                )}
                                {isCanceling && (
                                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
                                        Canceling
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                {isActivePremium ? (
                                    <>
                                        <span className="font-medium text-gray-700 dark:text-gray-300">{getIntervalDisplay()} Billing</span>
                                        <span>•</span>
                                        <span className={cn("capitalize", isPastDue && "text-red-600 font-bold")}>
                                            {status === 'trialing' ? 'Trial Period' : status?.replace('_', ' ')}
                                        </span>
                                    </>
                                ) : (
                                    <span>Basic features included</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-t border-gray-100 dark:border-gray-800 pt-4">
                    <div className="text-sm">
                         {isActivePremium && !isPastDue && getRenewalDate() && (
                            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                <Calendar size={14} />
                                <span>
                                    {isCanceling ? (
                                        <span className="text-amber-600 font-medium">Access ends on <span className="font-bold">{getRenewalDate()}</span></span>
                                    ) : (
                                        <span>Renews on <span className="font-semibold text-gray-900 dark:text-gray-200">{getRenewalDate()}</span></span>
                                    )}
                                </span>
                            </div>
                        )}
                        {isPastDue && (
                            <div className="flex items-center gap-2 text-red-600 font-medium">
                                <AlertTriangle size={14} />
                                <span>Payment failed. Please update method.</span>
                            </div>
                        )}
                         {!isPremium && <span className="text-gray-500">Upgrade to unlock full access.</span>}
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto">
                        <Button 
                            onClick={onManageClick} 
                            variant={isActivePremium && !isPastDue ? "outline" : "default"}
                            className={cn(
                                "group transition-all w-full sm:w-auto",
                                isPastDue ? "bg-red-600 hover:bg-red-700 text-white border-transparent" : "",
                                !isPremium ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white border-0 shadow-md hover:shadow-lg" : ""
                            )}
                        >
                            {isPastDue ? "Fix Payment" : (isActivePremium ? "Manage Plan" : "Upgrade Now")}
                            {!isActivePremium && <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />}
                        </Button>
                    </div>
                </div>
             </div>
        </div>
    );
};

export const PlanCard = ({ 
    title, price, interval, features, icon: Icon, gradient, 
    isActive, isCurrentTier, currentPlanKey, targetPlanKey, 
    subscriptionStatus, isLoading, onAction, isPastDue, cancelAtPeriodEnd 
}) => {
    // Plan Levels for Comparison
    const PLAN_LEVELS = {
        'free': 0,
        'couple': 1,
        'family': 2
    };

    let buttonText = "Upgrade";
    let isDisabled = false;
    
    const currentLevel = PLAN_LEVELS[currentPlanKey] || 0;
    const targetLevel = PLAN_LEVELS[targetPlanKey] || 0;

    // Logic Tree
    
    // 1. Critical Errors
    if (isCurrentTier && isPastDue) {
        buttonText = "Fix Payment";
        isDisabled = false; 
    } 
    // 2. Cancellation / Resubscribe Logic
    else if (isCurrentTier && (subscriptionStatus === 'canceled' || cancelAtPeriodEnd)) {
        // If it's the exact same interval we are viewing
        if (isActive) {
            buttonText = "Resume Subscription"; // Covers both "Resume" (pending cancel) and "Resubscribe" (fully canceled) conceptually
        } else {
             // If viewing diff interval, we can switch & resume at once
             buttonText = `Resume (${interval === 'year' ? 'Annual' : 'Monthly'})`;
        }
        isDisabled = false;
    }
    // 3. Active Plan (Exact Match)
    else if (isActive) {
        buttonText = "Current Plan";
        isDisabled = true;
    } 
    // 4. Same Plan, Different Interval (Tier Match but not Interval Match)
    else if (isCurrentTier) {
        if (interval === 'year') {
             buttonText = "Save with Annual";
        } else {
             buttonText = "Switch to Monthly";
        }
        isDisabled = false;
    } 
    // 5. Upgrade / Downgrade
    else {
        if (targetLevel < currentLevel) {
            buttonText = "Downgrade";
        } else {
            buttonText = "Upgrade";
        }
        isDisabled = false;
    }

    // Determine Badge Visibility
    // Show "Active" if it is the current TIER, regardless of interval
    const showActiveBadge = isCurrentTier && subscriptionStatus !== 'canceled' && !isPastDue;
    const badgeText = cancelAtPeriodEnd ? "Canceling" : "Active";
    const badgeColor = cancelAtPeriodEnd ? "text-amber-600 bg-amber-50" : "text-emerald-600 bg-white";

    // VISUAL IDENTITY FIX:
    // Use isCurrentTier for the border/glow instead of isActive.
    // This ensures the card looks "active" even when user toggles the interval switch.
    const showVisualBorder = isCurrentTier && !cancelAtPeriodEnd;

    return (
        <div className={cn(
            "rounded-3xl p-6 shadow-md text-white relative overflow-hidden transition-all transform hover:scale-[1.01] flex flex-col h-full",
            `bg-gradient-to-br ${gradient}`,
            // We use showVisualBorder here to maintain tier identity across toggle states
            showVisualBorder ? "ring-4 ring-offset-2 ring-offset-[#FAF9F6] dark:ring-offset-gray-950 ring-emerald-400 scale-[1.01]" : "",
            cancelAtPeriodEnd && isCurrentTier ? "ring-4 ring-offset-2 ring-offset-[#FAF9F6] dark:ring-offset-gray-950 ring-amber-400" : ""
        )}>
            <div className="relative z-10 flex flex-col h-full">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                            <Icon className="fill-white text-white w-5 h-5" />
                        </div>
                        <h3 className="text-xl font-bold">{title}</h3>
                    </div>
                    {showActiveBadge && (
                        <div className={cn("px-3 py-1 rounded-full text-xs font-bold uppercase flex items-center gap-1 shadow-sm", badgeColor)}>
                            {cancelAtPeriodEnd ? <History size={12} strokeWidth={4} /> : <Check size={12} strokeWidth={4} />}
                            {badgeText}
                        </div>
                    )}
                </div>
                
                <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold">${price}</span>
                        <span className="opacity-80 font-medium">/{interval}</span>
                    </div>
                    {interval === 'year' && (
                        <p className="text-xs bg-white/20 inline-block px-2 py-0.5 rounded-md mt-1 font-medium">Billed yearly</p>
                    )}
                </div>

                <ul className="space-y-3 mb-8 flex-grow">
                    {features.map((f, i) => (
                        <li key={i} className="flex items-center gap-3">
                            <div className="w-5 h-5 rounded-full bg-white/20 flex-shrink-0 flex items-center justify-center">
                                <Check size={12} strokeWidth={3} />
                            </div>
                            <span className="font-medium text-sm leading-tight">{f}</span>
                        </li>
                    ))}
                </ul>

                <Button 
                    onClick={onAction} 
                    disabled={isDisabled || isLoading}
                    className={cn(
                        "w-full font-bold h-12 rounded-xl border-0 transition-all shadow-lg mt-auto",
                        // Button styling still relies on exact Active state for the "Current Plan" look
                        isActive && !cancelAtPeriodEnd
                            ? "bg-white/20 text-white hover:bg-white/30 cursor-default opacity-80" 
                            : "bg-white text-gray-900 hover:bg-white/90 hover:scale-[1.02]",
                        // Highlight upgrades
                         targetLevel > currentLevel && !isActive ? "shadow-xl" : ""
                    )}
                >
                    {isLoading ? <Loader2 className="animate-spin mr-2" /> : null}
                    {buttonText}
                </Button>
            </div>
            
            {/* Abstract Background Shapes */}
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-black/5 rounded-full blur-3xl pointer-events-none" />
        </div>
    );
};

export const PaymentVerificationOverlay = () => (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-6 animate-in fade-in duration-500">
        <div className="relative">
            <div className="absolute inset-0 bg-purple-500 blur-xl opacity-20 animate-pulse rounded-full"></div>
            <div className="relative bg-white dark:bg-gray-800 p-6 rounded-full shadow-lg">
                <Loader2 className="h-10 w-10 text-purple-600 animate-spin" />
            </div>
        </div>
        <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Finalizing Your Upgrade</h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                We're confirming your payment with Stripe. This usually takes just a few seconds...
            </p>
        </div>
        <div className="w-64 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-purple-600 animate-progress-indeterminate"></div>
        </div>
    </div>
);
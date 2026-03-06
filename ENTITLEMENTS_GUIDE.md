# Entitlements & Subscription System Documentation

This document outlines the architecture, usage, and management of the subscription entitlements system.

## Database Schema Overview

The system is built on four core tables:

1.  **`public.plans`**: Definitions of available subscription tiers (Free, Couples, Family).
    *   `id`: UUID
    *   `name`: Unique name of the plan.
    *   `is_active`: Controls visibility/availability of the plan.

2.  **`public.plan_entitlements`**: Specific features and limits linked to a plan.
    *   `feature_key`: Identifier for the limit (e.g., `active_guides_max`, `storage_bytes_max`).
    *   `feature_value_int`: Numeric limit (e.g., 5).
    *   `feature_value_text`: String config (e.g., "starter").
    *   `is_unlimited`: Boolean override for unlimited access.

3.  **`public.user_subscriptions`**: Links a user to a plan.
    *   `user_id`: Foreign key to `auth.users`.
    *   `status`: 'active', 'cancelled', 'past_due'.

4.  **`public.user_usage`**: Tracks current consumption of limits.
    *   `feature_key`: Corresponding key to entitlement (usually without `_max` suffix).
    *   `current_usage`: The integer count of used resources.

---

## How to Check Limits (Code Logic)

To determine if a user can perform an action (e.g., create a new guide), you must compare their **Usage** against their **Entitlement**.

### Step 1: Fetch Data
Fetch both usage and entitlements for the user.
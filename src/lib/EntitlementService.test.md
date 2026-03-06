# Entitlement Service Test Cases

This document outlines scenarios for testing `EntitlementService.js`.

## Setup
Ensure `user_subscriptions`, `plan_entitlements`, and `user_usage` are populated.

## Test Cases

### 1. Active Guide Limits
*   **Scenario**: User on Free Plan (Limit 5) has 5 active guides.
*   **Action**: `GUIDE_CREATE`
*   **Expected**: 
    *   `allowed`: `false`
    *   `reason_code`: `LIMIT_ACTIVE_GUIDES`
    *   `limit`: 5, `current`: 5
    *   `upgrade_suggestion`: 'couples'

*   **Scenario**: User on Free Plan has 4 active guides.
*   **Action**: `GUIDE_CREATE`
*   **Expected**: `allowed`: `true`

### 2. Plan Upgrade
*   **Scenario**: User upgrades Free -> Couples (Limit 20).
*   **Action**: `GUIDE_CREATE` (User has 6 guides).
*   **Expected**: `allowed`: `true` (Current 6 < Limit 20). Note: Ensure cache is invalidated or TTL expired.

### 3. Editor Restrictions
*   **Scenario**: Free Plan User (Limit 1 editor - themselves).
*   **Action**: `EDITOR_INVITE`
*   **Expected**: 
    *   `allowed`: `false`
    *   `reason_code`: `LIMIT_EDITORS`
    *   `upgrade_suggestion`: 'couples'

*   **Scenario**: Couples Plan User (Limit 2 editors). Has 1 editor (self) + 1 invited.
*   **Action**: `EDITOR_INVITE`
*   **Expected**:
    *   `allowed`: `false`
    *   `upgrade_suggestion`: 'family'

### 4. Storage Limits
*   **Scenario**: User has 4.9GB used. Limit 5GB.
*   **Action**: `FILE_UPLOAD` with payload `{ file_size_bytes: 200MB }` (0.2GB)
*   **Calculation**: 4.9 + 0.2 = 5.1GB > 5GB.
*   **Expected**: `allowed`: `false`, `reason_code`: `LIMIT_STORAGE`.

### 5. Unarchiving Logic
*   **Scenario**: User at Active Guide Limit. Has 10 archived guides.
*   **Action**: `GUIDE_UNARCHIVE`
*   **Expected**: `allowed`: `false` (Unarchiving would increment active count beyond limit).

### 6. Templates
*   **Scenario**: User on Starter Tier.
*   **Action**: `TEMPLATE_USE`, payload `{ template_tier: 'full' }`
*   **Expected**: `allowed`: `false`, `reason_code`: `LIMIT_TEMPLATES`.

### 7. Unlimited Plans
*   **Scenario**: Family Plan (Unlimited guides).
*   **Action**: `GUIDE_CREATE`. User has 1000 guides.
*   **Expected**: `allowed`: `true`.

### 8. Caching
*   **Scenario**: Call `canPerform` twice in 1 second.
*   **Expected**: Second call should not trigger Supabase network request (verify via network tab or console logs if added).

### 9. Upgrade Suggestions
*   **Free (Fail)** -> Suggest 'couples'
*   **Couples (Fail)** -> Suggest 'family'
*   **Family (Fail)** -> Suggest `null`
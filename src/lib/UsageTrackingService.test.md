# Usage Tracking Service - Test Scenarios

## 1. Metric Computation
**Scenario**: User has 3 active guides, 2 archived guides.
- `recalculateUsageMetrics` is called.
- **Expected**: `user_usage` table updates: `active_guides`=3, `archived_guides`=2.
- **Verification**: `getUsageMetrics` returns correct values.

## 2. Caching
**Scenario**: `getUsageMetrics` called twice.
- **First Call**: Fetches from DB, checks timestamp.
- **Second Call**: If within cache window (implemented in EntitlementService mainly, UsageService fetches DB), DB read is fast. 
- **Note**: `UsageTrackingService` reads directly from `user_usage`. Caching is effectively the persistent DB table.
- **Stale Data**: If `updated_at` > 1 hour old, triggers background `recalculate`.

## 3. Atomic Updates
**Scenario**: Concurrent creation of guides.
- User creates Guide A and Guide B simultaneously.
- `increment_usage` RPC is called for both.
- **Expected**: `active_guides` increments by 2 safely, no race condition overwriting values.

## 4. Enforcement - Unarchive
**Scenario**: User at limit (5/5 guides). Tries to unarchive 6th guide.
- `exampleUnarchiveGuide` called.
- `UsageEnforcement.enforceUsageLimits('GUIDE_UNARCHIVE')` checks limit.
- **Expected**: Throws error "Action denied: LIMIT_ACTIVE_GUIDES".
- **State**: DB remains unchanged.

## 5. Enforcement - Downgrade
**Scenario**: User downgrades Family (Unlimited) -> Free (Limit 5). Has 20 guides.
- `getOverLimitActions` called.
- **Expected**: Returns `GUIDE_CREATE` blocked.
- `getCleanupActions` suggests "Archive Guides".
- User tries to create new guide -> Blocked.
- User tries to archive guide -> Allowed.

## 6. Storage Limits
**Scenario**: User has 4.9GB used (Limit 5GB). Uploads 200MB file.
- `checkUsageAllowed('FILE_UPLOAD', { file_size_bytes: 200MB })`
- Total would be 5.1GB.
- **Expected**: Denied. `reason: LIMIT_STORAGE`.

## 7. Admin Reconciliation
**Scenario**: Usage stats drifted (DB says 0, actual is 5).
- `AdminUsageUtilities.recalculateUserUsage(userId)` called.
- **Expected**: 
  - Detects change. 
  - Updates `user_usage`.
  - Returns `changes: { active_guides: { from: 0, to: 5 } }`.
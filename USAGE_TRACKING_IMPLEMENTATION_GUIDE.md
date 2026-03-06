# Usage Tracking Implementation Guide

This system provides robust tracking, enforcement, and auditing of user resource usage (guides, storage, seats) to support tiered subscription plans.

## Architecture

1.  **Storage**: `public.user_usage` table acts as a high-performance cache.
    *   Columns: `user_id`, `feature_key` (active_guides, etc.), `current_usage`, `updated_at`.
2.  **Write-Path Updates**: Application logic triggers updates immediately after mutations (Create/Delete/Archive).
    *   Uses `UsageUpdateTriggers` module.
    *   Uses atomic Postgres increments via `increment_usage` RPC.
3.  **Read-Path Checks**: Before allowing actions, `UsageEnforcement` checks cached usage against Plan Limits.
4.  **Self-Healing**: `recalculate_usage_stats` RPC function can rebuild stats from source of truth (COUNT/SUM queries) if drift occurs.

## Integration Steps

### 1. Wrap App in Context
In `src/App.jsx`:
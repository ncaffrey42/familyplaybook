# Manual Regression Checklist

Use this checklist before every deployment to ensuring billing/entitlement changes have not broken core navigation flows.

**Estimated Time: 2 Minutes**

## 1. Core Navigation (Free & Paid)
*These checks ensure the app is usable regardless of plan status.*

- [ ] **Bottom Navigation:**
    - [ ] Click "Home" -> Loads Home screen
    - [ ] Click "Library" -> Loads Library screen (Tabs should work)
    - [ ] Click "Bundles" -> Loads Bundles list
    - [ ] Click "Favorites" -> Loads Favorites list
    - [ ] Click "Account" -> Loads My Account screen

## 2. Viewing Content
*Plan limits should NEVER block viewing existing content.*

- [ ] **Guides:**
    - [ ] Go to "Guides" list.
    - [ ] List populates with items (if any exist).
    - [ ] Click a Guide card -> Detail page opens.
    - [ ] Content (steps/text) is visible.

- [ ] **Bundles:**
    - [ ] Go to "Bundles" list.
    - [ ] List populates with items.
    - [ ] Click a Bundle card -> Detail page opens.
    - [ ] Included guides are listed.

## 3. Account & Plans
- [ ] **My Account:**
    - [ ] Shows correct Plan Name (Free/Couple/Family).
    - [ ] Shows "Upgrade" button (if Free).
    - [ ] Shows "Manage Subscription" (if Paid).

## 4. Entitlement Logic (The "No Side Effects" Rule)
*Only creation/modification actions should trigger limits.*

- [ ] **Create/Import:**
    - [ ] Click "+" (Create Guide or Bundle).
    - [ ] **IF limit reached:** "Limit Reached" modal appears.
    - [ ] **IF limit NOT reached:** Create form opens.
    - [ ] *Note: The navigation to the form itself might be allowed, but saving might be blocked, or the entry button might show a lock icon. Key is that the APP DOES NOT CRASH.*

## 5. Technical Health
- [ ] **Console:** Open Browser Developer Tools (F12). No red errors during navigation.
- [ ] **Network:** No failed (4xx/5xx) API requests in Network tab during navigation.

---

**If any item fails:** Do NOT deploy. Check `src/pages/DebugRegressionTest.jsx` locally to diagnose entitlement vs routing issues.
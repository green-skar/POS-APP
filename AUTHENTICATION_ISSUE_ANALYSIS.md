# Authentication Issue Analysis - Based on Code Facts

## Problem Statement
- User logs in successfully
- Pages are not showing their content
- Clicking sidebar links redirects back to login page

---

## CODE FACTS - What Actually Happens

### 1. LOGIN FLOW (login/page.jsx)

**Lines 51-79:**
```javascript
if (data.success) {
  // Set sessionStorage markers
  sessionStorage.setItem('session_active', 'true');
  sessionStorage.setItem('app_start_time', Date.now().toString());
  
  // Redirect using window.location.replace (FULL PAGE RELOAD)
  setTimeout(() => {
    if (data.user.role === 'cashier') {
      window.location.replace('/pos');
    } else {
      window.location.replace('/admin');  // ← FULL PAGE RELOAD
    }
  }, 300);
}
```

**FACT:** Login uses `window.location.replace('/admin')` which causes a **FULL PAGE RELOAD**, not React Router navigation.

---

### 2. SESSION CHECK ON PAGE LOAD (useAuth.js)

**Lines 7-12: Initial State:**
```javascript
const [user, setUser] = useState(null);           // ← Starts as null
const [store, setStore] = useState(null);         // ← Starts as null
const [loading, setLoading] = useState(true);      // ← Starts as true
const [authenticated, setAuthenticated] = useState(false); // ← Starts as false
```

**Lines 236-240: Session Check on Mount:**
```javascript
useEffect(() => {
  checkSession(); // Runs once on mount
}, []); // Empty deps - only runs on mount
```

**FACT:** When page loads, `useAuth` starts with:
- `user = null`
- `authenticated = false`
- `loading = true`

**Lines 26-234: checkSession() Logic:**

1. **Lines 28-31:** Prevents concurrent calls
2. **Lines 36:** Sets `loading = true`
3. **Lines 45-46:** Checks sessionStorage markers
4. **Lines 58-103:** Checks `app_start_time` - if missing, may invalidate session
5. **Lines 108-128:** If cookie exists but no `session_active` marker → **INVALIDATES SESSION**
6. **Lines 164-171:** Calls `/api/auth/session` to validate
7. **Lines 200-212:** If authenticated, sets state:
   ```javascript
   sessionStorage.setItem('session_active', 'true');
   updateAuthState(data.user, data.store, true);
   ```

**CRITICAL FACT:** The session check is ASYNC and takes time. During this time:
- `loading = true` (AdminLayout shows "Loading...")
- `authenticated = false`
- `user = null`

---

### 3. ADMIN LAYOUT PROTECTION (admin/layout.jsx)

**Lines 12-13:**
```javascript
const { authenticated, loading, user, canAccessAdmin } = useAuth();
```

**Lines 18-28: Redirect Logic:**
```javascript
useEffect(() => {
  if (!loading && (!authenticated || !user) && !hasRedirectedRef.current) {
    hasRedirectedRef.current = true;
    navigate('/login', { replace: true });  // ← REDIRECTS TO LOGIN
  } else if (authenticated && user) {
    hasRedirectedRef.current = false;
  }
}, [loading, authenticated, user, navigate]);
```

**Lines 31-37: Loading State:**
```javascript
if (loading) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-analytics-secondary">Loading...</div>
    </div>
  );
}
```

**Lines 40-46: Not Authenticated:**
```javascript
if (!authenticated || !user) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-analytics-secondary">Redirecting...</div>
    </div>
  );
}
```

**Lines 49-55: Admin Access Check:**
```javascript
if (!canAccessAdmin()) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-analytics-secondary">Unauthorized - Admin access required</div>
    </div>
  );
}
```

**FACT:** AdminLayout has THREE conditions that can prevent rendering:
1. If `loading = true` → Shows "Loading..."
2. If `!authenticated || !user` → Shows "Redirecting..." AND redirects to login
3. If `!canAccessAdmin()` → Shows "Unauthorized"

---

### 4. SIDEBAR NAVIGATION (AdminSidebar.jsx)

**Lines 193-239: handleNavigation:**
```javascript
const handleNavigation = useCallback(async (path) => {
  if (location.pathname === path) {
    return;
  }
  
  // Log navigation activity (non-blocking)
  if (user) {
    setTimeout(async () => {
      // ... activity logging
    }, 0);
  }
  
  navigate(path);  // ← React Router navigation
}, [user, location.pathname, navigate]);
```

**FACT:** Sidebar uses `navigate(path)` which is React Router navigation (NOT full page reload).

**Lines 342-348: Navigation Links:**
```javascript
<a
  href={path}  // ← Has href attribute
  onClick={(e) => {
    e.preventDefault();
    handleNavigation(path);
  }}
>
```

**FACT:** Links have `href` attribute. If `preventDefault()` fails or navigation fails, browser might do full page navigation.

---

### 5. LAYOUT APPLICATION (plugins/layouts.ts)

**Lines 64-84: collectLayouts Function:**
- Walks up directory tree from page file
- Finds `layout.jsx` files
- Returns layouts in order (outermost → innermost)

**Lines 110-176: buildWrapper Function:**
- Wraps page component with layout components
- Creates wrapper that renders: `<Layout><Page /></Layout>`

**FACT:** Layouts are applied at BUILD TIME via Vite plugin, not at runtime via React Router.

---

## ROOT CAUSE ANALYSIS

### Problem 1: Full Page Reload After Login

**Issue:** `window.location.replace('/admin')` causes full page reload.

**What Happens:**
1. User logs in → sessionStorage markers set
2. `window.location.replace('/admin')` → FULL PAGE RELOAD
3. Page reloads → React Router initializes
4. `useAuth` hook mounts → Initial state: `loading=true, authenticated=false, user=null`
5. `checkSession()` starts (async)
6. AdminLayout sees `loading=true` → Shows "Loading..."
7. If `checkSession()` takes time or fails:
   - `loading` becomes `false`
   - `authenticated` still `false` (or becomes false)
   - `user` still `null`
   - AdminLayout redirects to login (line 21)

**Why This Happens:**
- `checkSession()` is async and may take time
- If session check fails (network error, cookie not set yet, etc.), state remains unauthenticated
- AdminLayout redirects immediately when `!loading && !authenticated`

---

### Problem 2: Session Invalidation During Navigation

**Issue:** `checkSession()` may invalidate session during navigation.

**Code Evidence (useAuth.js lines 108-128):**
```javascript
if (cookies.session_token && !sessionMarker) {
  console.log('⚠️ CRITICAL: Session cookie exists but sessionStorage marker missing - app was closed, invalidating session');
  clearSessionCookieClient();
  // ... invalidates session
  updateAuthState(null, null, false);
  return;
}
```

**What Happens:**
1. User navigates (React Router navigation, NOT full page reload)
2. `checkSession()` runs (maybe triggered by something)
3. If `sessionStorage.getItem('session_active')` is missing (maybe cleared or not set):
   - Session is invalidated
   - User is logged out
   - Redirected to login

**Why This Happens:**
- `sessionStorage` might be cleared in some scenarios
- Race condition: `checkSession()` might run before `session_active` is set
- The check at line 108 is too aggressive

---

### Problem 3: Pages Not Showing Content

**Issue:** AdminLayout shows "Loading..." or "Redirecting..." instead of page content.

**Code Evidence (admin/layout.jsx):**
- Line 31-37: If `loading = true` → Shows "Loading..."
- Line 40-46: If `!authenticated || !user` → Shows "Redirecting..."
- Line 49-55: If `!canAccessAdmin()` → Shows "Unauthorized"
- Line 65: `<Outlet />` only renders if all checks pass

**What Happens:**
1. Page loads
2. `useAuth` has `loading=true` initially
3. AdminLayout shows "Loading..." (blocks `<Outlet />`)
4. If `checkSession()` fails or takes too long:
   - `loading` becomes `false`
   - `authenticated` is still `false`
   - AdminLayout redirects to login
   - Page content never renders

---

### Problem 4: Navigation Redirects to Login

**Issue:** Clicking sidebar links redirects to login.

**What Happens:**
1. User clicks sidebar link
2. `handleNavigation(path)` is called
3. `navigate(path)` is called (React Router navigation)
4. Route changes → AdminLayout re-renders
5. `useAuth` hook might re-run `checkSession()` (if dependencies change)
6. If session check fails or `authenticated` becomes `false`:
   - AdminLayout redirects to login (line 21)
7. User is redirected to login page

**Why This Happens:**
- `checkSession()` might be called during navigation
- Session might be invalidated during navigation
- `authenticated` state might flip to `false` temporarily
- AdminLayout redirects immediately when `!loading && !authenticated`

---

## SPECIFIC CODE ISSUES IDENTIFIED

### Issue 1: Session Check Timing (useAuth.js)

**Problem:** `checkSession()` is async and AdminLayout doesn't wait properly.

**Evidence:**
- Line 36: `setLoading(true)` at start
- Line 230: `setLoading(false)` in finally block
- But if session check fails or takes time, `loading` becomes `false` before `authenticated` is `true`

**Fix Needed:** Ensure `loading` stays `true` until session check completes AND state is updated.

---

### Issue 2: Aggressive Session Invalidation (useAuth.js)

**Problem:** Line 108 invalidates session if cookie exists but marker doesn't.

**Evidence:**
```javascript
if (cookies.session_token && !sessionMarker) {
  // Invalidates session
}
```

**Why This Is Wrong:**
- After full page reload, `sessionStorage` might not be immediately available
- Race condition: Cookie might be set before `sessionStorage` is read
- This invalidates valid sessions

**Fix Needed:** Don't invalidate if we just logged in. Check `app_start_time` or add a grace period.

---

### Issue 3: AdminLayout Redirects Too Early (admin/layout.jsx)

**Problem:** Line 21 redirects immediately when `!loading && !authenticated`.

**Evidence:**
```javascript
if (!loading && (!authenticated || !user) && !hasRedirectedRef.current) {
  navigate('/login', { replace: true });
}
```

**Why This Is Wrong:**
- If `checkSession()` fails temporarily, this redirects even if session is valid
- No retry mechanism
- No delay to allow session check to complete

**Fix Needed:** Add retry logic or delay before redirecting.

---

### Issue 4: Full Page Reload on Login (login/page.jsx)

**Problem:** Line 77 uses `window.location.replace('/admin')` instead of React Router navigation.

**Evidence:**
```javascript
window.location.replace('/admin');
```

**Why This Is Wrong:**
- Causes full page reload
- Loses React state
- Forces `useAuth` to re-initialize
- Increases chance of race conditions

**Fix Needed:** Use React Router `navigate()` instead.

---

## SUGGESTED FIXES

### Fix 1: Use React Router Navigation for Login Redirect

**File:** `apps/web/src/app/login/page.jsx`

**Change:**
```javascript
// OLD (line 73-79):
setTimeout(() => {
  if (data.user.role === 'cashier') {
    window.location.replace('/pos');
  } else {
    window.location.replace('/admin');
  }
}, 300);

// NEW:
setTimeout(() => {
  if (data.user.role === 'cashier') {
    navigate('/pos', { replace: true });
  } else {
    navigate('/admin', { replace: true });
  }
}, 100); // Reduced delay since no full reload needed
```

**Why:** Prevents full page reload, maintains React state, reduces race conditions.

---

### Fix 2: Make Session Check More Resilient

**File:** `apps/web/src/utils/useAuth.js`

**Change Line 108-128:**
```javascript
// OLD:
if (cookies.session_token && !sessionMarker) {
  // Invalidates session
}

// NEW:
if (cookies.session_token && !sessionMarker) {
  // Check if we just logged in (app_start_time exists)
  const appStartTime = sessionStorage.getItem('app_start_time');
  if (!appStartTime) {
    // Only invalidate if app_start_time doesn't exist (truly closed app)
    console.log('⚠️ CRITICAL: Session cookie exists but sessionStorage marker missing - app was closed, invalidating session');
    // ... invalidate
  } else {
    // We just logged in, set the marker
    sessionStorage.setItem('session_active', 'true');
  }
}
```

**Why:** Prevents invalidating sessions right after login.

---

### Fix 3: Add Retry Logic to AdminLayout

**File:** `apps/web/src/app/admin/layout.jsx`

**Change Lines 18-28:**
```javascript
// Add retry mechanism
const retryCountRef = useRef(0);
const maxRetries = 3;

useEffect(() => {
  if (!loading && (!authenticated || !user) && !hasRedirectedRef.current) {
    // Retry session check before redirecting
    if (retryCountRef.current < maxRetries) {
      retryCountRef.current++;
      setTimeout(() => {
        checkSession();
      }, 500 * retryCountRef.current); // Exponential backoff
      return;
    }
    
    hasRedirectedRef.current = true;
    navigate('/login', { replace: true });
  } else if (authenticated && user) {
    hasRedirectedRef.current = false;
    retryCountRef.current = 0; // Reset on success
  }
}, [loading, authenticated, user, navigate, checkSession]);
```

**Why:** Gives session check time to complete before redirecting.

---

### Fix 4: Ensure Loading State Persists

**File:** `apps/web/src/utils/useAuth.js`

**Change Lines 227-233:**
```javascript
} finally {
  // Only update loading if this is still the current check
  if (currentCheckId === checkIdRef.current) {
    // Ensure state is updated before setting loading to false
    setLoading(false);
  }
  isCheckingRef.current = false;
}
```

**Add after line 212 (after successful auth):**
```javascript
if (data.authenticated && data.user) {
  // ... existing code ...
  updateAuthState(data.user, data.store, true);
  // Ensure loading is false AFTER state update
  setLoading(false);
}
```

**Why:** Ensures `loading` is only set to `false` after state is properly updated.

---

### Fix 5: Prevent checkSession During Navigation

**File:** `apps/web/src/utils/useAuth.js`

**Add check to prevent unnecessary session checks:**
```javascript
const checkSession = useCallback(async () => {
  // Prevent concurrent calls
  if (isCheckingRef.current) {
    console.log('⚠️ checkSession already running - skipping duplicate call');
    return;
  }
  
  // If we're already authenticated and have a user, don't re-check unnecessarily
  if (authenticated && user && sessionStorage.getItem('session_active')) {
    console.log('✅ Already authenticated, skipping session check');
    return;
  }
  
  // ... rest of checkSession
}, [updateAuthState, authenticated, user]);
```

**Why:** Prevents unnecessary session checks during navigation that might cause state flips.

---

## SUMMARY

**Root Causes:**
1. Full page reload on login causes state reset
2. Session check is async and AdminLayout doesn't wait properly
3. Aggressive session invalidation invalidates valid sessions
4. No retry mechanism when session check fails
5. `checkSession()` might run during navigation causing state flips

**Priority Fixes:**
1. **HIGH:** Change login redirect to use React Router navigation
2. **HIGH:** Fix session invalidation logic to not invalidate after login
3. **MEDIUM:** Add retry logic to AdminLayout
4. **MEDIUM:** Prevent unnecessary session checks during navigation
5. **LOW:** Ensure loading state persists until state is updated



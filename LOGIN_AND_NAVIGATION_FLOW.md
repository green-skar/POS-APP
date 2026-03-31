# Login and Navigation Flow Documentation

## Overview
This document describes the complete flow of user authentication (login) and navigation within the application, including session management, route protection, and state management.

---

## 1. LOGIN FLOW

### Step 1: User Submits Login Form
**File:** `apps/web/src/app/login/page.jsx`

1. User enters username and password
2. Form submission triggers `handleLogin()` function
3. Validation: Checks if username and password are provided

### Step 2: API Authentication Request
**File:** `apps/web/src/app/login/page.jsx` (lines 31-41)

```javascript
POST /api/auth/login
Body: { username, password }
Credentials: 'include' (sends cookies)
```

**Backend:** `apps/web/src/app/api/auth/login/route.js`

1. Validates username/password
2. Verifies password hash
3. Handles store selection (for non-super_admin roles)
4. Creates session token
5. Sets session cookie (session cookie - expires on browser close)
6. Returns user data and store info

### Step 3: Login Success Handling
**File:** `apps/web/src/app/login/page.jsx` (lines 51-79)

After successful login:

1. **Set Session Markers** (Critical for session persistence):
   ```javascript
   sessionStorage.setItem('session_active', 'true');
   sessionStorage.setItem('app_start_time', Date.now().toString());
   ```

2. **Log Activity**:
   - Logs successful login to activity log
   - Includes user info, role, store details

3. **Set Intentional Navigation Flag**:
   ```javascript
   sessionStorage.setItem('intentional_navigation', 'true');
   ```
   - Prevents beforeunload dialog during redirect

4. **Redirect Based on Role**:
   - **Cashier** → `/pos`
   - **Admin/Store Admin/Super Admin** → `/admin`
   - Uses `window.location.replace()` for clean redirect (no back button)
   - 300ms delay to ensure cookie is set

---

## 2. SESSION MANAGEMENT

### Session Check on App Load
**File:** `apps/web/src/utils/useAuth.js`

#### Initial Check (on mount)
**Lines 236-240:**
```javascript
useEffect(() => {
  checkSession(); // Runs once on component mount
}, []); // Empty deps - only runs once
```

#### Session Check Logic (`checkSession` function)
**Lines 26-234:**

1. **Prevent Race Conditions**:
   - Uses `isCheckingRef` to prevent concurrent calls
   - Uses `checkIdRef` to ignore stale results

2. **Check Session Markers**:
   ```javascript
   const sessionMarker = sessionStorage.getItem('session_active');
   const browserWasClosing = sessionStorage.getItem('browser_closing');
   const appStartTime = sessionStorage.getItem('app_start_time');
   ```

3. **Fresh App Start Detection**:
   - If `app_start_time` doesn't exist:
     - If cookie/marker exists BUT no `session_active` → **Invalidate session** (app was closed)
     - If `session_active` exists → **Set app_start_time** (active session, just missing timestamp)
     - If nothing exists → **Fresh start** (set timestamps)

4. **Session Cookie Validation**:
   - If cookie exists but no `session_active` marker → **Invalidate** (browser was closed)

5. **API Session Check**:
   ```javascript
   GET /api/auth/session
   Credentials: 'include'
   ```
   - Validates session token from cookie
   - Returns user data and store info

6. **Update Auth State**:
   - If authenticated: Set `session_active` marker, ensure `app_start_time` exists
   - If not authenticated: Clear markers

### Session State Management
**File:** `apps/web/src/utils/useAuth.js`

The `useAuth` hook manages:
- `user`: Current user object
- `store`: Current store object
- `loading`: Loading state
- `authenticated`: Authentication status

All state updates go through `updateAuthState()` for consistency.

---

## 3. NAVIGATION FLOW

### Route Structure
**File:** `apps/web/src/app/routes.ts`

- File-based routing (React Router v7)
- Detects `page.jsx` files and creates routes
- Detects `layout.jsx` files and applies layouts

### Admin Layout (Shared Sidebar)
**File:** `apps/web/src/app/admin/layout.jsx`

**Purpose:** Provides persistent sidebar across all admin pages

1. **Authentication Check**:
   ```javascript
   useEffect(() => {
     if (!loading && (!authenticated || !user) && !hasRedirectedRef.current) {
       navigate('/login', { replace: true });
     }
   }, [loading, authenticated, user]);
   ```

2. **Renders**:
   - `AdminSidebar` component (persistent)
   - `<Outlet />` for child routes (admin pages)

### Sidebar Navigation
**File:** `apps/web/src/app/admin/AdminSidebar.jsx`

#### Navigation Handler (`handleNavigation`)
**Lines 195-234:**

1. **Abort Previous Requests**:
   - Cancels any pending navigation activity logs

2. **Log Navigation Activity** (Non-blocking):
   ```javascript
   setTimeout(async () => {
     POST /api/users/log-activity
     Body: {
       action_type: 'navigation',
       action_description: `Navigated to ${path}`,
       ...
     }
   }, 0);
   ```
   - Runs asynchronously (doesn't block navigation)
   - Silently fails on 401 errors (expected during transitions)

3. **Navigate**:
   ```javascript
   navigate(path); // React Router navigation
   ```

#### Navigation Items Filtering
**Lines 70-214:**

The sidebar filters navigation items based on:
- User role (admin, super_admin, cashier, etc.)
- User permissions
- `canAccessAdmin()` check
- Loading state

Uses `lastValidUserRef` to preserve user data during navigation (prevents sidebar from clearing).

---

## 4. ROUTE PROTECTION

### Admin Layout Protection
**File:** `apps/web/src/app/admin/layout.jsx`

1. **Loading State**: Shows loading spinner while checking session
2. **Authentication Check**: Redirects to `/login` if not authenticated
3. **Admin Access Check**: Shows "Unauthorized" if user can't access admin

### ProtectedRoute Component
**File:** `apps/web/src/components/ProtectedRoute.jsx`

Optional wrapper for additional protection:
- Role-based access (`requiredRole`, `allowedRoles`)
- Permission-based access (`requiredPermission`, `allowedPermissions`)
- Automatically redirects if conditions not met

**Note:** Admin layout already handles basic auth, so `ProtectedRoute` is typically not needed for admin pages.

---

## 5. SESSION PERSISTENCE DURING NAVIGATION

### Key Mechanisms

1. **Session Markers**:
   - `session_active`: Indicates active session
   - `app_start_time`: Timestamp of app start (prevents false "fresh start" detection)
   - `previous_start_time`: Previous app start timestamp

2. **Race Condition Prevention**:
   - `isCheckingRef`: Prevents concurrent `checkSession` calls
   - `checkIdRef`: Tracks check ID to ignore stale results

3. **User Data Preservation**:
   - `lastValidUserRef` in `AdminSidebar`: Preserves user data during navigation
   - Prevents sidebar from clearing when `user` temporarily becomes null

4. **Non-Blocking Activity Logging**:
   - Navigation activity logs run asynchronously
   - Don't block navigation or cause race conditions

---

## 6. LOGOUT FLOW

**File:** `apps/web/src/utils/useAuth.js` (lines 269-313)

1. **Log Activity**: Logs logout event
2. **API Call**: `POST /api/auth/logout`
3. **Clear State**: Sets user/store to null, authenticated to false
4. **Clear Session Markers**:
   ```javascript
   sessionStorage.removeItem('session_active');
   sessionStorage.removeItem('app_start_time');
   sessionStorage.removeItem('previous_start_time');
   sessionStorage.removeItem('browser_closing');
   ```
5. **Clear Cookie**: Removes session cookie
6. **Redirect**: Navigates to `/login`

---

## 7. APP CLOSE DETECTION

**File:** `apps/web/src/app/root.tsx`

### Window Close Handlers

1. **beforeunload**: Sets `browser_closing` flag
2. **unload**: Sends logout beacon (if flag set)
3. **pagehide**: Fallback for mobile browsers

### Session Invalidation on Close

When app is closed:
- `sessionStorage` is cleared (in browsers)
- `browser_closing` flag is set (in Tauri, sessionStorage persists)
- On next app start, `checkSession` detects:
  - Cookie exists BUT no `session_active` marker → **Invalidate session**

---

## 8. FLOW DIAGRAM

```
┌─────────────────┐
│  User Opens App │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  checkSession() │ ◄─── useAuth hook mounts
└────────┬────────┘
         │
         ├─► No session → Show login
         │
         └─► Valid session → Load dashboard
                    │
                    ▼
         ┌──────────────────┐
         │  User Logs In    │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │  POST /api/auth/ │
         │      login       │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Set session      │
         │ markers          │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Redirect to      │
         │ /admin or /pos   │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ AdminLayout      │
         │ mounts           │
         └────────┬─────────┘
                  │
                  ├─► checkSession() again
                  │
                  └─► Render AdminSidebar + Outlet
                           │
                           ▼
                  ┌──────────────────┐
                  │ User clicks nav   │
                  │ item in sidebar   │
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │ handleNavigation │
                  │ - Log activity   │
                  │ - navigate(path) │
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │ Route changes    │
                  │ (Outlet updates) │
                  └────────┬─────────┘
                           │
                           └─► Sidebar persists (layout)
                               Page content updates
```

---

## 9. KEY FILES REFERENCE

| File | Purpose |
|------|---------|
| `apps/web/src/app/login/page.jsx` | Login form and authentication |
| `apps/web/src/utils/useAuth.js` | Authentication hook, session management |
| `apps/web/src/app/admin/layout.jsx` | Shared admin layout with sidebar |
| `apps/web/src/app/admin/AdminSidebar.jsx` | Sidebar navigation component |
| `apps/web/src/app/admin/page.jsx` | Admin dashboard page |
| `apps/web/src/app/routes.ts` | Route configuration |
| `apps/web/src/components/ProtectedRoute.jsx` | Route protection wrapper |
| `apps/web/src/app/root.tsx` | Root component, window close handlers |

---

## 10. TROUBLESHOOTING

### Issue: Session invalidated during navigation
**Cause:** `app_start_time` missing, causing false "fresh start" detection
**Fix:** Ensure `app_start_time` is set immediately after successful session check

### Issue: Sidebar content disappears during navigation
**Cause:** `user` state temporarily null during route changes
**Fix:** Use `lastValidUserRef` to preserve user data

### Issue: Multiple redirects to login
**Cause:** `checkSession` running multiple times, causing state flips
**Fix:** Use `isCheckingRef` and `checkIdRef` to prevent race conditions

### Issue: 401 errors during navigation
**Cause:** Activity logging happening before session is fully established
**Fix:** Make activity logging non-blocking and handle 401 gracefully

---

## 11. BEST PRACTICES

1. **Always set session markers** after successful login/session check
2. **Use refs to prevent race conditions** in async operations
3. **Make activity logging non-blocking** to avoid blocking navigation
4. **Preserve user data during navigation** using refs
5. **Check `session_active` marker** before invalidating sessions
6. **Use `window.location.replace()`** for login redirects (clean redirect)



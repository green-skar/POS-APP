import {
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
  createElement,
} from 'react';
import { apiFetch, persistPosSessionToken, clearPosSessionToken } from './apiClient';
import { clearSessionCookieClient } from './cookies';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { logActivity } from './logActivity';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const navigate = useNavigate();
  
  // Ref to track if checkSession is currently running (prevents race conditions)
  const isCheckingRef = useRef(false);
  // Ref to track the current check ID (to ignore stale results)
  const checkIdRef = useRef(0);
  
  // Helper to update all auth state consistently
  const updateAuthState = useCallback((userData, storeData, isAuthenticated) => {
    setUser(userData);
    setStore(storeData);
    setAuthenticated(isAuthenticated);
  }, []);

  /**
   * Apply a successful POST /api/auth/login JSON body immediately (same path super-admin uses via context.login).
   * Invalidates any in-flight checkSession so it cannot overwrite this state.
   */
  const applyLoginFromResponse = useCallback(
    (data) => {
      if (!data?.success || !data.user) return;
      checkIdRef.current += 1;
      isCheckingRef.current = false;
      sessionStorage.setItem('session_active', 'true');
      if (!sessionStorage.getItem('app_start_time')) {
        sessionStorage.setItem('app_start_time', Date.now().toString());
      }
      if (data.sessionToken) persistPosSessionToken(data.sessionToken);
      updateAuthState(data.user, data.store ?? null, true);
      setLoading(false);
    },
    [updateAuthState]
  );

  const checkSession = useCallback(async () => {
    // Prevent concurrent calls - if already checking, return early
    if (isCheckingRef.current) {
      console.log('⚠️ checkSession already running - skipping duplicate call');
      return;
    }
    
    // If we're already authenticated and have a user, don't re-check unnecessarily
    // This prevents unnecessary checks during navigation
    // BUT: Don't skip if we have session_active marker - we might need to verify it
    if (authenticated && user && sessionStorage.getItem('session_active') && sessionStorage.getItem('app_start_time')) {
      console.log('✅ Already authenticated with valid markers, skipping session check');
      return;
    }
    
    // Mark as checking and increment check ID
    isCheckingRef.current = true;
    const currentCheckId = ++checkIdRef.current;
    setLoading(true);

    try {
      const cookieHeader = document.cookie;
      const cookies = Object.fromEntries(
        cookieHeader.split(';').map(c => c.trim().split('='))
      );
      
      // Check if browser was closed (sessionStorage cleared = browser closed)
      const sessionMarker = sessionStorage.getItem('session_active');
      const browserWasClosing = sessionStorage.getItem('browser_closing');
      
      console.log('Session check:', { 
        hasCookie: !!cookies.session_token, 
        hasMarker: !!sessionMarker, 
        browserWasClosing: !!browserWasClosing,
        cookieValue: cookies.session_token ? cookies.session_token.substring(0, 20) + '...' : 'none'
      });
      
      // CRITICAL FIX: Tauri doesn't clear sessionStorage on close like browsers do
      // So we use app_start_time to detect fresh app starts
      // BUT: We should NOT invalidate sessions during navigation - only on true app restarts
      const appStartTime = sessionStorage.getItem('app_start_time');
      const previousStartTime = sessionStorage.getItem('previous_start_time');
      const now = Date.now();
      
      // CRITICAL: Check if we just logged in (cookie exists but markers might not be set yet)
      // If we have a cookie, try to verify it first before invalidating
      // This prevents race conditions where checkSession runs before login sets markers
      if (cookies.session_token && !sessionMarker && !appStartTime) {
        // We have a cookie but no markers - this could be:
        // 1. Just logged in (markers being set)
        // 2. App was closed and restarted (should invalidate)
        // To distinguish, we'll verify the cookie first
        // If cookie is valid, we just logged in - set markers
        // If cookie is invalid, app was closed - invalidate
        console.log('⚠️ Cookie exists but no markers - verifying cookie before deciding...');
        // Don't invalidate yet - let the API call below verify the session
        // If API call succeeds, we'll set the markers
        // If API call fails, we'll invalidate
      }
      
      // If no app_start_time, check if this is a true fresh start or just navigation
      if (!appStartTime) {
        // Only invalidate if we have a cookie/marker BUT no session_active marker
        // AND we've verified the cookie is invalid (handled below after API call)
        // If session_active exists, we're in an active session - just set app_start_time
        if (sessionMarker) {
          console.log('✅ Active session detected - setting app_start_time');
          sessionStorage.setItem('app_start_time', now.toString());
          sessionStorage.setItem('previous_start_time', now.toString());
        } else if (!cookies.session_token && !previousStartTime) {
          // No cookie and no previous start - truly fresh start
          sessionStorage.setItem('app_start_time', now.toString());
          sessionStorage.setItem('previous_start_time', now.toString());
          console.log('✅ Fresh app start (no previous session) - setting app_start_time');
        }
        // If we have a cookie but no marker, wait for API verification before invalidating
      } else {
        // App is continuing - update previous_start_time
        sessionStorage.setItem('previous_start_time', appStartTime);
      }
      
      // Clear browser_closing flag if app is still active (session marker exists)
      // This means the app didn't actually close, so clear the flag
      if (browserWasClosing && sessionMarker) {
        console.log('Clearing browser_closing flag - app is still active');
        sessionStorage.removeItem('browser_closing');
      }
      
      // Only invalidate session if browser_closing flag exists AND there's no session marker
      // This means the app was closed and restarted
      if (browserWasClosing && !sessionMarker) {
        console.log('⚠️ CRITICAL: browser_closing flag detected with no session marker - invalidating session');
        clearSessionCookieClient();
        try {
          await apiFetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
          });
        } catch (e) {
          console.error('Logout API error:', e);
        }
        sessionStorage.removeItem('browser_closing');
        // Only update state if this is still the current check
        if (currentCheckId === checkIdRef.current) {
          updateAuthState(null, null, false);
          setLoading(false);
        }
        isCheckingRef.current = false;
        return;
      }
      
      const response = await apiFetch('/api/auth/session', {
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Accept': 'application/json',
        },
      });
      
      // Check if response is HTML (error page) instead of JSON
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Session API returned non-JSON response:', text.substring(0, 200));
        // Keep existing auth state on transient server/SSR response issues.
        if (currentCheckId === checkIdRef.current) {
          setLoading(false);
        }
        isCheckingRef.current = false;
        return;
      }
      
      if (!response.ok) {
        throw new Error(`Session check failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Only update state if this is still the current check (not stale)
      if (currentCheckId !== checkIdRef.current) {
        console.log('⚠️ Ignoring stale checkSession result');
        isCheckingRef.current = false;
        return;
      }
      
      if (data.authenticated && data.user) {
        // Set sessionStorage markers to indicate active session
        sessionStorage.setItem('session_active', 'true');
        // Ensure app_start_time is set (critical for preventing false "fresh start" detection)
        const currentAppStartTime = sessionStorage.getItem('app_start_time');
        if (!currentAppStartTime) {
          const now = Date.now().toString();
          sessionStorage.setItem('app_start_time', now);
          sessionStorage.setItem('previous_start_time', now);
          console.log('✅ Set app_start_time during session check');
        }
        console.log('Session check successful:', data.user.username, data.user.role);
        updateAuthState(data.user, data.store, true);
      } else {
        // Session is invalid - clear everything
        console.log('Session check: not authenticated - clearing session');
        sessionStorage.removeItem('session_active');
        // Only clear app_start_time if we're truly not authenticated
        // This prevents clearing it during race conditions
        const hadAppStartTime = sessionStorage.getItem('app_start_time');
        if (hadAppStartTime) {
          sessionStorage.removeItem('app_start_time');
          sessionStorage.removeItem('previous_start_time');
        }
        clearSessionCookieClient();
        clearPosSessionToken();
        updateAuthState(null, null, false);
      }
    } catch (error) {
      console.error('Session check error:', error);
      // Only update state if this is still the current check
      if (currentCheckId === checkIdRef.current) {
        // If we got a 401, the session is invalid - clear everything
        if (error.message && error.message.includes('401')) {
          console.log('⚠️ Session invalid (401) - clearing session data');
          sessionStorage.removeItem('session_active');
          sessionStorage.removeItem('app_start_time');
          sessionStorage.removeItem('previous_start_time');
          clearSessionCookieClient();
          clearPosSessionToken();
        } else {
          // For transient errors, preserve current auth state to avoid forced logout/redirect loops.
          console.warn('Transient session check error - preserving current auth state');
        }
        setLoading(false);
      }
    } finally {
      // Only update loading if this is still the current check
      if (currentCheckId === checkIdRef.current) {
        setLoading(false);
      }
      isCheckingRef.current = false;
    }
  }, [updateAuthState, authenticated, user]);

  useEffect(() => {
    // Check session immediately on mount (only once)
    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount

  const login = async (username, password, storeId = null) => {
    try {
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ username, password, storeId }),
      });

      const data = await response.json();

      if (data.requiresStoreSelection) {
        return data;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.success) {
        applyLoginFromResponse(data);
        return { success: true, data };
      }

      throw new Error('Login failed');
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      // Log logout before clearing session
      if (user) {
        logActivity('logout', `User logged out: ${user.username}`, 'user', user.id, {
          username: user.username,
          role: user.role
        });
      }
      
      await apiFetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      
      updateAuthState(null, null, false);
      
      // CRITICAL: Clear ALL session markers to ensure fresh start on next launch
      sessionStorage.removeItem('session_active');
      sessionStorage.removeItem('app_start_time');
      sessionStorage.removeItem('previous_start_time');
      sessionStorage.removeItem('browser_closing');
      sessionStorage.removeItem('pending_close');
      sessionStorage.removeItem('intentional_navigation');
      
      console.log('✅ Logout: All session markers cleared');
      
      // Clear cookie as fallback
      clearSessionCookieClient();
      clearPosSessionToken();
      navigate('/login');
      toast.success('Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      // Clear ALL markers even if API call fails
      sessionStorage.removeItem('session_active');
      sessionStorage.removeItem('app_start_time');
      sessionStorage.removeItem('previous_start_time');
      sessionStorage.removeItem('browser_closing');
      sessionStorage.removeItem('pending_close');
      sessionStorage.removeItem('intentional_navigation');
      clearSessionCookieClient();
      clearPosSessionToken();
      updateAuthState(null, null, false);
      toast.error('Failed to logout');
    }
  };

  const hasRole = (role) => {
    return user?.role === role;
  };

  const hasAnyRole = (roles) => {
    return roles.includes(user?.role);
  };

  const canAccessStore = (storeId) => {
    if (!user) return false;
    
    // Super admin can access all stores
    if (user.role === 'super_admin') return true;
    
    // Users must have access to the store
    return store?.id === storeId;
  };

  const isAdmin = useCallback(() => {
    return user?.role === 'admin' || user?.role === 'super_admin';
  }, [user]);

  const isSuperAdmin = useCallback(() => {
    return user?.role === 'super_admin';
  }, [user]);

  const isCashier = useCallback(() => {
    return user?.role === 'cashier';
  }, [user]);

  // Helper function to check if user has a specific permission
  const hasPermission = useCallback((permission) => {
    if (!user?.permissions) return false;
    try {
      const permissions = typeof user.permissions === 'string' 
        ? JSON.parse(user.permissions) 
        : user.permissions;
      const permissionList = Array.isArray(permissions) ? permissions : permissions.split(',').map(p => p.trim());
      return permissionList.includes(permission);
    } catch (e) {
      // If parsing fails, try comma-separated string
      try {
        const permissions = user.permissions.split(',').map(p => p.trim());
        return permissions.includes(permission);
      } catch {
        return false;
      }
    }
  }, [user]);

  // Helper function to check if user has any of the specified permissions
  const hasAnyPermission = useCallback((permissionList) => {
    if (!user?.permissions) return false;
    try {
      const permissions = typeof user.permissions === 'string' 
        ? JSON.parse(user.permissions) 
        : user.permissions;
      const userPermissions = Array.isArray(permissions) ? permissions : permissions.split(',').map(p => p.trim());
      return permissionList.some(perm => userPermissions.includes(perm));
    } catch (e) {
      try {
        const permissions = user.permissions.split(',').map(p => p.trim());
        return permissionList.some(perm => permissions.includes(perm));
      } catch {
        return false;
      }
    }
  }, [user]);

  // Check if user can access admin dashboard (role-based or permission-based)
  const canAccessAdmin = useCallback(() => {
    if (!user) return false;
    // Admins and super admins always have access
    if (user?.role === 'admin' || user?.role === 'super_admin') {
      return true;
    }
    // Check for access_admin permission
    if (!user?.permissions) return false;
    try {
      const permissions = typeof user.permissions === 'string' 
        ? JSON.parse(user.permissions) 
        : user.permissions;
      const permissionList = Array.isArray(permissions) ? permissions : permissions.split(',').map(p => p.trim());
      return permissionList.includes('access_admin');
    } catch (e) {
      try {
        const permissions = user.permissions.split(',').map(p => p.trim());
        return permissions.includes('access_admin');
      } catch {
        return false;
      }
    }
  }, [user]);

  const value = {
    user,
    store,
    loading,
    authenticated,
    login,
    applyLoginFromResponse,
    logout,
    checkSession,
    hasRole,
    hasAnyRole,
    canAccessStore,
    isAdmin,
    isSuperAdmin,
    isCashier,
    hasPermission,
    hasAnyPermission,
    canAccessAdmin,
  };
  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx == null) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

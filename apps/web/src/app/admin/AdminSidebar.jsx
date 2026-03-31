'use client';

import { apiFetch } from '@/utils/apiClient';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  ChevronLeft,
  ChevronRight,
  Home,
  Package,
  Shield,
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Settings,
  DollarSign,
  LineChart,
  Sparkles,
  Palette,
  Users,
  Store,
  Briefcase,
  History,
  LogOut,
  Network,
  CreditCard
} from 'lucide-react';
import { useAuth } from '@/utils/useAuth';

const NAVIGATION_ITEMS = [
  { path: '/pos', icon: Home, label: 'Home' },
  { path: '/admin', icon: Settings, label: 'Dashboard' },
  { path: '/admin/products', icon: Package, label: 'Products' },
  { path: '/admin/services', icon: Shield, label: 'Services' },
  { path: '/admin/sales', icon: BarChart3, label: 'Sales' },
  { path: '/admin/inventory', icon: TrendingUp, label: 'Inventory' },
  { path: '/admin/alerts', icon: AlertTriangle, label: 'Alerts' },
  { path: '/admin/analytics', icon: LineChart, label: 'Analytics' },
  { path: '/admin/expenses', icon: DollarSign, label: 'Expenses' },
  { path: '/admin/cashiers', icon: Users, label: 'User Management', roles: ['super_admin', 'admin'] },
  { path: '/admin/employees', icon: Briefcase, label: 'Employees', roles: ['super_admin', 'admin'] },
  { path: '/admin/stores', icon: Store, label: 'Stores', roles: ['super_admin'] },
  { path: '/admin/network', icon: Network, label: 'Network', roles: ['super_admin'] },
  { path: '/admin/payment-settings', icon: CreditCard, label: 'Payments', roles: ['super_admin'] },
  { path: '/admin/activity-log', icon: History, label: 'Activity Log', roles: ['super_admin'] },
  { path: '/admin/ai-chat', icon: Sparkles, label: 'AI Chat' },
  { path: '/admin/themes', icon: Palette, label: 'Themes' },
];

export default function AdminSidebar({ sidebarOpen, setSidebarOpen, onCollapsedChange }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, store, isSuperAdmin, isAdmin, logout, canAccessAdmin, loading } = useAuth();
  
  const [isCollapsed, setIsCollapsed] = useState(false);
  const abortControllerRef = useRef(null);
  // Preserve last valid user to prevent sidebar from clearing during navigation
  const lastValidUserRef = useRef(user);

  // Sync collapsed state with parent callback
  useEffect(() => {
    if (onCollapsedChange) {
      onCollapsedChange(isCollapsed);
    }
  }, [isCollapsed, onCollapsedChange]);

  // Update last valid user ref when user exists
  useEffect(() => {
    if (user && !loading) {
      lastValidUserRef.current = user;
    }
  }, [user, loading]);

  // Filter navigation items based on user permissions
  const visibleNavItems = useMemo(() => {
    // Use last valid user if current user is temporarily null (during navigation)
    // This prevents sidebar from clearing during route changes
    const effectiveUser = user || lastValidUserRef.current;
    
    // Debug logging - always log to help diagnose
    console.log('🔍 Sidebar useMemo triggered:', {
      loading,
      hasUser: !!user,
      hasEffectiveUser: !!effectiveUser,
      usingFallback: !user && !!lastValidUserRef.current,
      userRole: effectiveUser?.role,
      userPermissions: effectiveUser?.permissions
    });

    // Only show loading state on initial load, not during navigation
    // If we have a last valid user, use it even if current user is temporarily null
    if (loading && !lastValidUserRef.current) {
      console.log('⏳ Sidebar: Initial loading - returning null');
      return null; // null means loading, empty array means no access
    }

    // If no user at all (not even a last valid one), return empty
    if (!effectiveUser) {
      console.log('⏳ Sidebar: No user at all - returning empty array');
      return [];
    }

    // Debug logging - use effectiveUser for checks
    // Temporarily override user in the functions by checking effectiveUser directly
    const hasAdminAccess = effectiveUser ? (
      effectiveUser.role === 'admin' || 
      effectiveUser.role === 'super_admin' || 
      (() => {
        if (!effectiveUser.permissions) return false;
        try {
          const permissions = typeof effectiveUser.permissions === 'string' 
            ? JSON.parse(effectiveUser.permissions) 
            : effectiveUser.permissions;
          const permissionList = Array.isArray(permissions) ? permissions : permissions.split(',').map(p => p.trim());
          return permissionList.includes('access_admin');
        } catch {
          try {
            const permissions = effectiveUser.permissions.split(',').map(p => p.trim());
            return permissions.includes('access_admin');
          } catch {
            return false;
          }
        }
      })()
    ) : false;
    const userIsAdmin = effectiveUser?.role === 'admin' || effectiveUser?.role === 'super_admin';
    const userIsSuperAdmin = effectiveUser?.role === 'super_admin';
    
    console.log('🔍 Sidebar Debug:', {
      userRole: effectiveUser?.role,
      hasAdminAccess,
      userIsAdmin,
      userIsSuperAdmin,
      userPermissions: effectiveUser?.permissions,
      totalItems: NAVIGATION_ITEMS.length
    });

    // If user doesn't have admin access, they shouldn't be here
    // However, if we're on the admin page, we should still show items
    // The page-level protection should have redirected them
    if (!hasAdminAccess) {
      console.warn('⚠️ User on admin page but canAccessAdmin() returned false:', {
        role: effectiveUser?.role,
        permissions: effectiveUser?.permissions,
        userObject: effectiveUser
      });
      
      // Fallback: If user has admin or super_admin role, show items anyway
      // This handles edge cases where permission check might fail
      if (effectiveUser?.role === 'admin' || effectiveUser?.role === 'super_admin') {
        console.log('✅ Fallback: User has admin role, showing all unrestricted items');
        return NAVIGATION_ITEMS.filter(item => !item.roles || item.roles.length === 0);
      }
      
      return [];
    }

    const filtered = NAVIGATION_ITEMS.filter(item => {
      // Items without role restrictions are visible to all admin users
      if (!item.roles || item.roles.length === 0) {
        return true;
      }

      // Check if user has required role
      return item.roles.some(role => {
        if (role === 'super_admin') {
          return userIsSuperAdmin;
        }
        if (role === 'admin') {
          return userIsAdmin || userIsSuperAdmin;
        }
        return false;
      });
    });

    console.log('✅ Filtered navItems:', {
      total: NAVIGATION_ITEMS.length,
      visible: filtered.length,
      items: filtered.map(i => i.label)
    });

    // This should never be empty if user has admin access
    // All admin users should see at least the unrestricted items
    if (filtered.length === 0 && hasAdminAccess) {
      console.error('❌ ERROR: User has admin access but no nav items visible!', {
        userRole: effectiveUser?.role,
        allItems: NAVIGATION_ITEMS.map(i => ({ label: i.label, roles: i.roles }))
      });
    }

    return filtered;
  }, [user, loading, canAccessAdmin, isAdmin, isSuperAdmin, user?.role, user?.permissions]);

  const handleCollapseToggle = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  const handleNavigation = useCallback(async (path) => {
    if (location.pathname === path) {
      return;
    }

    // Cancel any pending navigation log requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Log navigation activity (non-blocking, don't fail navigation if logging fails)
    if (user) {
      // Use setTimeout to make this non-blocking and avoid race conditions
      setTimeout(async () => {
        try {
          await apiFetch('/api/users/log-activity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            signal: abortController.signal,
            body: JSON.stringify({
              action_type: 'navigation',
              action_description: `Navigated to ${path}`,
              entity_type: 'route',
              entity_id: null,
              metadata: JSON.stringify({
                from: location.pathname,
                to: path,
                route_name: path.split('/').pop() || 'home'
              })
            }),
          });
        } catch (error) {
          // Silently fail - don't log errors for activity logging failures
          // This prevents console spam if session is temporarily unavailable
          if (error.name !== 'AbortError' && !error.message?.includes('401')) {
            // Only log non-auth errors (401 means session issue, which is expected during navigation)
          }
        }
      }, 0);
    }

    navigate(path);
  }, [user, location.pathname, navigate]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, [logout]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Use effective user (current or last valid) for display
  const effectiveUser = user || lastValidUserRef.current;
  const userInitial = effectiveUser?.fullName?.[0]?.toUpperCase() || 
                      effectiveUser?.username?.[0]?.toUpperCase() || 
                      'U';

  return (
    <>
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          ${isCollapsed ? 'w-16' : 'w-64'}
          h-screen fixed left-0 top-0 z-50
          sidebar-glass
          flex flex-col
          transition-all duration-300 ease-in-out
          overflow-hidden
          rounded-r-2xl shadow-xl
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        aria-label="Admin navigation sidebar"
      >
        {/* Header */}
        <header className={`
          flex-shrink-0 border-b border-white/10
          ${isCollapsed ? 'px-2 py-3' : 'px-4 py-3'}
          flex items-center justify-between
        `}>
          {!isCollapsed && (
            <h2 className="text-lg font-semibold text-analytics-primary">
              Admin Menu
            </h2>
          )}
          
          <button
            type="button"
            onClick={handleCollapseToggle}
            className="w-6 h-6 rounded-md flex items-center justify-center bg-white/10 backdrop-blur-md border border-white/20 text-analytics-primary hover:bg-white/20 hover:border-white/30 transition-all duration-300 flex-shrink-0"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight size={14} strokeWidth={2.5} aria-hidden="true" />
            ) : (
              <ChevronLeft size={14} strokeWidth={2.5} aria-hidden="true" />
            )}
          </button>
        </header>

        {/* Navigation */}
        <nav
          className="flex-1 overflow-y-auto overflow-x-hidden sidebar-scroll px-4 py-4 space-y-3"
          aria-label="Admin navigation menu"
        >
          {visibleNavItems === null ? (
            // Loading state
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-10 bg-white/10 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : visibleNavItems.length === 0 ? (
            // No access - user shouldn't be here
            <div className="px-4 py-2">
              <p className="text-xs text-analytics-secondary mb-2">
                Access denied
              </p>
              <p className="text-xs text-red-400">
                You don't have permission to access the admin panel.
              </p>
            </div>
          ) : (
            visibleNavItems.map(({ path, icon: Icon, label }) => {
              const isActive = location.pathname === path;
              
              return (
                <a
                  key={path}
                  href={path}
                  onClick={(e) => {
                    e.preventDefault();
                    handleNavigation(path);
                  }}
                  className={`
                    flex items-center rounded-xl transition-all duration-300
                    ${isCollapsed 
                      ? 'w-10 h-10 mx-auto justify-center' 
                      : 'px-4 py-3 justify-start space-x-3 w-full'
                    }
                    ${isActive
                      ? 'bg-white/40 text-analytics-primary border border-white/50 shadow-md'
                      : 'text-analytics-secondary border-transparent hover:bg-white/20 hover:border-white/30 hover:shadow-sm'
                    }
                    group relative
                  `}
                  title={isCollapsed ? label : ''}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon
                    size={18}
                    strokeWidth={2.5}
                    stroke="currentColor"
                    fill="none"
                    className="flex-shrink-0 pointer-events-none"
                    aria-hidden="true"
                  />
                  {!isCollapsed && (
                    <span className="font-medium text-[15px] whitespace-nowrap">
                      {label}
                    </span>
                  )}
                  
                  {/* Tooltip for collapsed state */}
                  {isCollapsed && (
                    <div
                      className="absolute left-full ml-2 px-3 py-2 rounded-lg glass-card-pro text-analytics-primary text-sm font-medium whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50"
                      role="tooltip"
                    >
                      {label}
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 rotate-45 bg-white/40 border-l border-b border-white/50" />
                    </div>
                  )}
                </a>
              );
            })
          )}
        </nav>

        {/* Footer - User Info & Logout */}
        <footer className={`
          flex-shrink-0 border-t border-white/10
          ${isCollapsed ? 'px-2 py-3' : 'px-4 py-4'}
        `}>
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              {loading && !lastValidUserRef.current ? (
                <div className="w-10 h-10 rounded-full bg-white/10 animate-pulse" aria-label="Loading" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                  {userInitial}
                </div>
              )}
              <button
                onClick={handleLogout}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-analytics-secondary hover:bg-white/20 hover:text-analytics-primary transition-all duration-200 border border-transparent hover:border-white/30"
                title="Logout"
                aria-label="Logout"
              >
                <LogOut size={18} strokeWidth={2.5} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* User Info */}
              {loading && !lastValidUserRef.current ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/10 animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-white/10 rounded animate-pulse" />
                    <div className="h-3 bg-white/10 rounded animate-pulse w-2/3" />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
                    {userInitial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-analytics-primary truncate">
                      {effectiveUser?.fullName || effectiveUser?.username || 'User'}
                    </p>
                    <p className="text-xs text-analytics-secondary capitalize truncate">
                      {effectiveUser?.role?.replace('_', ' ') || 'Role'}
                    </p>
                    {store && (
                      <p className="text-xs text-analytics-secondary truncate">
                        {store.name}
                      </p>
                    )}
                  </div>
                </div>
              )}
              
              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-analytics-secondary hover:bg-white/20 hover:text-analytics-primary transition-all duration-200 border border-transparent hover:border-white/30"
                aria-label="Logout"
              >
                <LogOut size={18} strokeWidth={2.5} aria-hidden="true" />
                <span className="font-medium text-sm">Logout</span>
              </button>
            </div>
          )}
        </footer>
      </aside>
    </>
  );
}


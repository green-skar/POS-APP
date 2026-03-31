'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import AppFooter from '@/components/AppFooter';
import { useAuth } from '@/utils/useAuth';
import { apiFetch } from '@/utils/apiClient';

const adminShellFooterClass =
  'flex-shrink-0 border-t border-gray-200/80 dark:border-gray-700/80 py-3 px-4 bg-gray-50/50 dark:bg-gray-900/30';

export default function AdminLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { authenticated, loading, user, canAccessAdmin, checkSession } = useAuth();
  const navigate = useNavigate();
  const [storeCount, setStoreCount] = useState(null);

  useEffect(() => {
    if (!authenticated || !user || user.role !== 'super_admin') {
      setStoreCount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch('/api/stores', { credentials: 'include' });
        const d = await r.json().catch(() => ({}));
        if (!cancelled && r.ok && Array.isArray(d.stores)) {
          setStoreCount(d.stores.length);
        } else if (!cancelled) {
          setStoreCount(-1);
        }
      } catch {
        if (!cancelled) setStoreCount(-1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, user?.role, user?.id]);

  // Redirect to login if not authenticated (but only after loading completes)
  // Use a ref to prevent multiple redirects during navigation
  const hasRedirectedRef = useRef(false);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  // Check admin access (only if authenticated) - must be before conditional returns
  // Memoize to prevent unnecessary recalculations
  const hasAdminAccess = useMemo(() => {
    if (!authenticated || !user) return false;
    return canAccessAdmin();
  }, [authenticated, user, canAccessAdmin]);

  useEffect(() => {
    // Only redirect if we're done loading and truly not authenticated
    // Don't redirect during navigation transitions (when loading might be temporarily true)
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
      // Reset redirect flag and retry count if we become authenticated
      hasRedirectedRef.current = false;
      retryCountRef.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, authenticated, user]);

  // Show loading overlay but still render Outlet so components can mount
  if (loading) {
    return (
      <div className="min-h-screen font-sans flex">
        <AdminSidebar 
          sidebarOpen={sidebarOpen} 
          setSidebarOpen={setSidebarOpen} 
          onCollapsedChange={setSidebarCollapsed} 
        />
        <div
          className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${sidebarOpen ? (sidebarCollapsed ? 'ml-16' : 'ml-64') : 'ml-0 md:ml-16'}`}
        >
          <div className="relative flex-1 min-h-0">
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 backdrop-blur-sm z-10">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-analytics-secondary">Loading...</p>
              </div>
            </div>
            <div className="relative z-0">
              {children || <Outlet />}
            </div>
          </div>
          <AppFooter className={adminShellFooterClass} />
        </div>
      </div>
    );
  }

  // Don't render if not authenticated (redirecting)
  if (!authenticated || !user) {
    return (
      <div className="min-h-screen font-sans flex">
        <AdminSidebar 
          sidebarOpen={sidebarOpen} 
          setSidebarOpen={setSidebarOpen} 
          onCollapsedChange={setSidebarCollapsed} 
        />
        <div
          className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${sidebarOpen ? (sidebarCollapsed ? 'ml-16' : 'ml-64') : 'ml-0 md:ml-16'}`}
        >
          <div className="flex flex-1 items-center justify-center">
            <div className="text-analytics-secondary">Redirecting...</div>
          </div>
          <AppFooter className={adminShellFooterClass} />
        </div>
      </div>
    );
  }

  // Check admin access
  if (!hasAdminAccess) {
    return (
      <div className="min-h-screen font-sans flex">
        <AdminSidebar 
          sidebarOpen={sidebarOpen} 
          setSidebarOpen={setSidebarOpen} 
          onCollapsedChange={setSidebarCollapsed} 
        />
        <div
          className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${sidebarOpen ? (sidebarCollapsed ? 'ml-16' : 'ml-64') : 'ml-0 md:ml-16'}`}
        >
          <div className="flex flex-1 items-center justify-center">
            <div className="text-analytics-secondary">Unauthorized - Admin access required</div>
          </div>
          <AppFooter className={adminShellFooterClass} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans flex">
      <AdminSidebar 
        sidebarOpen={sidebarOpen} 
        setSidebarOpen={setSidebarOpen} 
        onCollapsedChange={setSidebarCollapsed} 
      />
      <div
        className={`flex-1 flex flex-col min-w-0 min-h-screen transition-all duration-300 ${sidebarOpen ? (sidebarCollapsed ? 'ml-16' : 'ml-64') : 'ml-0 md:ml-16'}`}
      >
        {storeCount === 0 ? (
          <div className="mx-4 mt-4 flex-shrink-0 rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
            <strong>No store yet.</strong> Create at least one store so admins and cashiers can be assigned and analytics can be scoped correctly.{' '}
            <Link to="/admin/stores" className="font-semibold underline">
              Open Stores
            </Link>
          </div>
        ) : null}
        <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
          {children || <Outlet />}
        </div>
        <AppFooter className={adminShellFooterClass} />
      </div>
    </div>
  );
}


'use client';

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/utils/useAuth';

export default function ProtectedRoute({ children, requiredRole = null, allowedRoles = null, requiredPermission = null, allowedPermissions = null }) {
  const { user, authenticated, loading, hasPermission, hasAnyPermission, canAccessAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Only redirect after loading is complete
    if (!loading) {
      if (!authenticated || !user) {
        // Redirect immediately - useAuth already checked session
        navigate('/login', { replace: true });
        return;
      }

      if (requiredRole && user?.role !== requiredRole) {
        navigate('/', { replace: true });
        return;
      }

      if (allowedRoles && !allowedRoles.includes(user?.role)) {
        // Check if user has access_admin permission as fallback
        // But super_admins and admins always have access
        if (!canAccessAdmin()) {
          navigate('/', { replace: true });
          return;
        }
      }

      // Check required permission (but admins/super_admins bypass this)
      if (requiredPermission && !hasPermission(requiredPermission)) {
        // Super admins and admins bypass permission checks
        if (user?.role !== 'super_admin' && user?.role !== 'admin') {
          navigate('/', { replace: true });
          return;
        }
      }

      // Check allowed permissions (but admins/super_admins bypass this)
      if (allowedPermissions && !hasAnyPermission(allowedPermissions)) {
        // Super admins and admins bypass permission checks
        if (user?.role !== 'super_admin' && user?.role !== 'admin') {
          navigate('/', { replace: true });
          return;
        }
      }
    }
  }, [authenticated, loading, user, requiredRole, allowedRoles, requiredPermission, allowedPermissions, navigate, hasPermission, hasAnyPermission, canAccessAdmin]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-analytics-secondary">Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    // Check if user has access_admin permission as fallback
    // But super_admins and admins always have access
    if (!canAccessAdmin()) {
      return null;
    }
  }

  // Check required permission (but admins/super_admins bypass this)
  if (requiredPermission && !hasPermission(requiredPermission)) {
    // Super admins and admins bypass permission checks
    if (user?.role !== 'super_admin' && user?.role !== 'admin') {
      return null;
    }
  }

  // Check allowed permissions (but admins/super_admins bypass this)
  if (allowedPermissions && !hasAnyPermission(allowedPermissions)) {
    // Super admins and admins bypass permission checks
    if (user?.role !== 'super_admin' && user?.role !== 'admin') {
      return null;
    }
  }

  return children;
}


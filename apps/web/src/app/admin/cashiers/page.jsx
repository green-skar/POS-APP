'use client';

import { apiFetch } from '@/utils/apiClient';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit2, Trash2, User, Mail, Shield, Store, X, Eye, BarChart3, TrendingUp, Clock, DollarSign, Users as UsersIcon, Calendar, Filter, Menu, Power, PowerOff, RefreshCw, ChevronDown, Download, Search, FileText, Lock, ArrowUp, ArrowDown, Trash } from 'lucide-react';
import { useAuth } from '@/utils/useAuth';
import ProtectedRoute from '@/components/ProtectedRoute';
// Sidebar is now in admin layout - no need to import here
import { logButtonClick } from '@/utils/logActivity';
import ConfirmationModal from '@/components/ConfirmationModal';
import { usePasswordConfirmation } from '@/utils/usePasswordConfirmation';
import { saveFile } from '@/utils/saveFile';

export default function CashiersPage() {
  return (
    <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
      <CashiersPageContent />
    </ProtectedRoute>
  );
}

function CashiersPageContent() {
  const { user: authUser, isAdmin, isSuperAdmin, store } = useAuth();
  const queryClient = useQueryClient();

  // Sidebar state is now managed by AdminLayout
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [roleFilter, setRoleFilter] = useState('all');
  const [userListSearch, setUserListSearch] = useState('');
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [roleDropdownPosition, setRoleDropdownPosition] = useState({ top: 0, right: 0, width: 0 });
  const roleDropdownRef = useRef(null);
  const roleButtonRef = useRef(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showUserAnalyticsExportModal, setShowUserAnalyticsExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  const [exportType, setExportType] = useState('all'); // 'all' or 'user'
  const [exportDateRange, setExportDateRange] = useState({ startDate: '', endDate: '' });
  const [userExportDateRange, setUserExportDateRange] = useState({ startDate: '', endDate: '' });
  
  // Password confirmation hook
  const {
    requirePassword,
    showPasswordModal,
    password,
    setPassword,
    handlePasswordConfirm,
    pendingAction: passwordPendingAction,
    setPendingAction: setPasswordPendingAction
  } = usePasswordConfirmation();
  const [roleSelectDropdownOpen, setRoleSelectDropdownOpen] = useState(false);
  const [roleSelectDropdownPosition, setRoleSelectDropdownPosition] = useState({ top: 0, right: 0, width: 0 });
  const roleSelectDropdownRef = useRef(null);
  const roleSelectButtonRef = useRef(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [showToggleStatusModal, setShowToggleStatusModal] = useState(false);
  const [userToToggle, setUserToToggle] = useState(null);
  const [showEmployeeSearchModal, setShowEmployeeSearchModal] = useState(false);
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [pendingAction, setPendingAction] = useState(null); // { type: 'delete'|'update'|'deactivate', user: {...}, callback: fn }
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const employeeSearchRef = useRef(null);
  const employeeSearchInputRef = useRef(null);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

  // Available permissions
  const availablePermissions = [
    { id: 'access_pos', label: 'Access POS System', description: 'Can access the Point of Sale system' },
    { id: 'edit_products', label: 'Edit Products', description: 'Can create, update, and delete products' },
    { id: 'edit_services', label: 'Edit Services', description: 'Can create, update, and delete services' },
    { id: 'manage_sales', label: 'Manage Sales', description: 'Can view and manage sales transactions' },
    { id: 'manage_inventory', label: 'Manage Inventory', description: 'Can manage inventory levels and stock' },
    { id: 'view_analytics', label: 'View Analytics', description: 'Can view analytics and reports' },
    { id: 'manage_stores', label: 'Manage Stores', description: 'Can create, update, and delete stores' },
    { id: 'edit_prices', label: 'Edit Prices', description: 'Can modify product and service prices' },
    { id: 'access_admin', label: 'Access Admin Dashboard', description: 'Can access the admin dashboard' },
    { id: 'manage_themes', label: 'Manage Themes', description: 'Can modify application themes' },
    { id: 'view_alerts', label: 'View Alerts', description: 'Can view system alerts' },
    { id: 'view_activity_log', label: 'View Activity Log', description: 'Can view and manage activity log, including deleted and modified items' },
  ];

  // Predefined roles for consistent display across the app
  const predefinedRoles = [
    { value: 'cashier', label: 'Cashier' },
    { value: 'admin', label: 'Admin' },
    { value: 'super_admin', label: 'Super Admin' },
    { value: 'manager', label: 'Manager' },
    { value: 'supervisor', label: 'Supervisor' },
    { value: 'assistant_manager', label: 'Assistant Manager' },
    { value: 'sales_associate', label: 'Sales Associate' },
    { value: 'inventory_clerk', label: 'Inventory Clerk' },
    { value: 'security', label: 'Security' },
    { value: 'maintenance', label: 'Maintenance' }
  ];

  // Role hierarchy for elevation/downgrade
  const roleHierarchy = {
    'cashier': 1,
    'sales_associate': 2,
    'inventory_clerk': 3,
    'security': 3,
    'maintenance': 3,
    'supervisor': 4,
    'assistant_manager': 5,
    'manager': 6,
    'admin': 7,
    'super_admin': 8
  };

  // Helper function to get role label
  const getRoleLabel = (role) => {
    return predefinedRoles.find(r => r.value === role)?.label || 
           (role ? role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' ') : 'Unknown');
  };

  // Helper function to get role badge color
  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'super_admin':
        return 'bg-purple-500/20 text-purple-300';
      case 'admin':
        return 'bg-blue-500/20 text-blue-300';
      case 'cashier':
        return 'bg-green-500/20 text-green-300';
      case 'manager':
        return 'bg-purple-500/20 text-purple-300';
      case 'supervisor':
        return 'bg-yellow-500/20 text-yellow-300';
      case 'assistant_manager':
        return 'bg-indigo-500/20 text-indigo-300';
      case 'sales_associate':
        return 'bg-cyan-500/20 text-cyan-300';
      case 'inventory_clerk':
        return 'bg-orange-500/20 text-orange-300';
      case 'security':
        return 'bg-red-500/20 text-red-300';
      case 'maintenance':
        return 'bg-gray-500/20 text-gray-300';
      default:
        return 'bg-gray-500/20 text-gray-300';
    }
  };

  // Calculate dropdown position
  useEffect(() => {
    if (roleDropdownOpen && roleButtonRef.current) {
      const updatePosition = () => {
        if (roleButtonRef.current) {
          const rect = roleButtonRef.current.getBoundingClientRect();
          setRoleDropdownPosition({
            top: rect.bottom + 8,
            left: rect.left,
            width: rect.width
          });
        }
      };
      updatePosition();
      
      let rafId;
      const handleScroll = () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(updatePosition);
      };
      
      window.addEventListener('scroll', handleScroll, true);
      document.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', updatePosition);
      
      let parent = roleButtonRef.current.parentElement;
      const scrollableParents = [];
      while (parent && parent !== document.body) {
        const overflow = window.getComputedStyle(parent).overflow;
        if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') {
          scrollableParents.push(parent);
          parent.addEventListener('scroll', handleScroll, true);
        }
        parent = parent.parentElement;
      }
      
      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener('scroll', handleScroll, true);
        document.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', updatePosition);
        scrollableParents.forEach(el => {
          el.removeEventListener('scroll', handleScroll, true);
        });
      };
    }
  }, [roleDropdownOpen, isSuperAdmin]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!roleDropdownOpen) return;
    
    let isScrolling = false;
    let scrollTimeout;
    
    const handleScrollStart = () => {
      isScrolling = true;
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
      }, 150);
    };
    
    const handleClickOutside = (event) => {
      if (isScrolling) return;
      
      const dropdownElement = document.querySelector('[data-role-dropdown]');
      const clickedDropdown = dropdownElement && (dropdownElement.contains(event.target) || dropdownElement === event.target);
      const clickedButton = roleButtonRef.current && roleButtonRef.current.contains(event.target);
      
      if (!clickedButton && !clickedDropdown) {
        setRoleDropdownOpen(false);
      }
    };
    
    window.addEventListener('scroll', handleScrollStart, true);
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      window.removeEventListener('scroll', handleScrollStart, true);
      document.removeEventListener('mousedown', handleClickOutside);
      clearTimeout(scrollTimeout);
    };
  }, [roleDropdownOpen]);

  // Calculate role select dropdown position (for Add User form)
  useEffect(() => {
    if (roleSelectDropdownOpen && roleSelectButtonRef.current) {
      const updatePosition = () => {
        if (roleSelectButtonRef.current) {
          const rect = roleSelectButtonRef.current.getBoundingClientRect();
          setRoleSelectDropdownPosition({
            top: rect.bottom,
            right: window.innerWidth - rect.right,
            width: Math.max(rect.width, 200)
          });
        }
      };
      updatePosition();
      
      let rafId;
      const handleScroll = () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(updatePosition);
      };
      
      window.addEventListener('scroll', handleScroll, true);
      document.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', updatePosition);
      
      let parent = roleSelectButtonRef.current.parentElement;
      const scrollableParents = [];
      while (parent && parent !== document.body) {
        const overflow = window.getComputedStyle(parent).overflow;
        if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') {
          scrollableParents.push(parent);
          parent.addEventListener('scroll', handleScroll, true);
        }
        parent = parent.parentElement;
      }
      
      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener('scroll', handleScroll, true);
        document.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', updatePosition);
        scrollableParents.forEach(el => {
          el.removeEventListener('scroll', handleScroll, true);
        });
      };
    } else {
      setRoleSelectDropdownPosition({ top: 0, right: 0, width: 0 });
    }
  }, [roleSelectDropdownOpen]);

  // Close role select dropdown when clicking outside
  useEffect(() => {
    if (!roleSelectDropdownOpen) return;
    
    let isScrolling = false;
    let scrollTimeout;
    
    const handleScrollStart = () => {
      isScrolling = true;
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
      }, 150);
    };
    
    const handleClickOutside = (event) => {
      if (isScrolling) return;
      
      const dropdownElement = document.querySelector('[data-role-select-dropdown]');
      const clickedDropdown = dropdownElement && (dropdownElement.contains(event.target) || dropdownElement === event.target);
      const clickedButton = roleSelectButtonRef.current && roleSelectButtonRef.current.contains(event.target);
      
      if (!clickedButton && !clickedDropdown) {
        setRoleSelectDropdownOpen(false);
      }
    };
    
    window.addEventListener('scroll', handleScrollStart, true);
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      window.removeEventListener('scroll', handleScrollStart, true);
      document.removeEventListener('mousedown', handleClickOutside);
      clearTimeout(scrollTimeout);
    };
  }, [roleSelectDropdownOpen]);

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    fullName: '',
    role: 'cashier',
    storeIds: [],
    permissions: [],
    employeeId: null, // Link to employee record
  });

  // Fetch users (employees with login info)
  const { data: usersData, isLoading, error: usersError } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await apiFetch('/api/auth/users', {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch users' }));
        console.error('Failed to fetch users:', errorData);
        throw new Error(errorData.error || 'Failed to fetch users');
      }
      const data = await response.json();
      console.log('Users API response:', data);
      return data;
    },
  });

  // Fetch employees for search (all employees, including those without login info)
  const { data: employeesData } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const response = await apiFetch('/api/auth/employees', {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch employees' }));
        console.error('Failed to fetch employees:', errorData);
        return { employees: [] };
      }
      const data = await response.json();
      return data;
    },
    enabled: showEmployeeSearchModal, // Only fetch when search modal is open
  });

  // Fetch stores for super admin
  const { data: storesData, isLoading: storesLoading, error: storesError } = useQuery({
    queryKey: ['stores'],
    queryFn: async () => {
      const response = await apiFetch('/api/stores', {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch stores' }));
        console.error('Failed to fetch stores:', errorData);
        throw new Error(errorData.error || 'Failed to fetch stores');
      }
      return response.json();
    },
    enabled: isAdmin(),
  });

  // Fetch user's stores for regular admin
  const { data: userStoresData } = useQuery({
    queryKey: ['userStores'],
    queryFn: async () => {
      const response = await apiFetch('/api/auth/stores', {
        credentials: 'include',
      });
      if (!response.ok) return { stores: [] };
      return response.json();
    },
    enabled: isAdmin() && !isSuperAdmin(),
  });

  // Fetch user analytics with auto-refresh when modal is open
  const { data: userAnalytics, isLoading: analyticsLoading, refetch: refetchAnalytics } = useQuery({
    queryKey: ['userAnalytics', selectedUser?.id, dateRange.startDate, dateRange.endDate],
    queryFn: async () => {
      if (!selectedUser?.id) return null;
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append('startDate', dateRange.startDate);
      if (dateRange.endDate) params.append('endDate', dateRange.endDate);
      const response = await apiFetch(`/api/users/${selectedUser.id}/analytics?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch user analytics' }));
        console.error('Failed to fetch user analytics:', errorData);
        throw new Error(errorData.error || 'Failed to fetch user analytics');
      }
      const data = await response.json();
      console.log('User analytics response:', data);
      return data;
    },
    enabled: !!selectedUser?.id && showDetailsModal,
    refetchInterval: showDetailsModal ? 5000 : false, // Auto-refresh every 5 seconds when modal is open
    refetchIntervalInBackground: true, // Continue refetching even when tab is in background
  });

  const stores = isSuperAdmin() ? (storesData?.stores || []) : (userStoresData?.stores || []);
  const users = usersData?.users || [];
  const employees = employeesData?.employees || [];

  // Filter employees for search (exclude those who already have login info)
  const availableEmployees = employees.filter(emp => {
    // Only show employees that don't already have login info (username)
    return !users.some(u => u.id === emp.id);
  });

  // Filter employees based on search query
  const filteredEmployees = availableEmployees.filter(emp => {
    if (!employeeSearchQuery.trim()) return true;
    const query = employeeSearchQuery.toLowerCase();
    return (
      (emp.full_name || emp.fullName || '').toLowerCase().includes(query) ||
      (emp.username || '').toLowerCase().includes(query) ||
      (emp.email || '').toLowerCase().includes(query) ||
      (emp.role || '').toLowerCase().includes(query)
    );
  }).slice(0, 10); // Limit to 10 suggestions

  // Get unique roles from users for dynamic role options
  const uniqueRoles = [...new Set(users.map(user => user.role).filter(Boolean))];
  const roleOptions = [
    { value: 'all', label: 'All Roles' },
    ...(isSuperAdmin() && uniqueRoles.includes('super_admin') ? [{ value: 'super_admin', label: 'Super Admin' }] : []),
    ...uniqueRoles
      .filter(role => role !== 'super_admin')
      .sort((a, b) => {
        // Sort roles in a logical order
        const order = ['admin', 'manager', 'assistant_manager', 'supervisor', 'cashier', 'sales_associate', 'inventory_clerk', 'security', 'maintenance'];
        const aIndex = order.indexOf(a);
        const bIndex = order.indexOf(b);
        if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      })
      .map(role => ({
        value: role,
        label: getRoleLabel(role)
      }))
  ];

  // Debug: Log stores availability
  useEffect(() => {
    if (isSuperAdmin() && isModalOpen) {
      console.log('Stores for super admin:', stores);
      console.log('Stores data:', storesData);
      console.log('Stores loading:', storesLoading);
      console.log('Stores error:', storesError);
    }
  }, [isSuperAdmin, isModalOpen, stores, storesData, storesLoading, storesError]);

  // Debug: Log stores when storesData changes
  useEffect(() => {
    if (isSuperAdmin() && storesData) {
      console.log('Stores data received:', storesData);
      console.log('Stores array:', storesData.stores);
    }
  }, [isSuperAdmin, storesData]);

  const filteredUsers = useMemo(() => {
    const q = userListSearch.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter !== 'all' && user.role !== roleFilter) return false;
      if (!q) return true;
      const blob = [
        user.full_name,
        user.username,
        user.email,
        user.store_names,
        getRoleLabel(user.role),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [users, roleFilter, userListSearch]);

  // Create/Update user mutation
  const userMutation = useMutation({
    mutationFn: async (data) => {
      const url = '/api/auth/users';
      const method = editingUser ? 'PUT' : 'POST';
      const body = editingUser 
        ? { 
            ...data, 
            id: editingUser.id,
            permissions: data.permissions || [],
            employeeId: data.employeeId || editingUser.id
          } 
        : { 
            ...data,
            permissions: data.permissions || [],
            employeeId: data.employeeId || null
          };

      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save user');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success(editingUser ? 'User updated successfully' : 'User created successfully');
      setIsModalOpen(false);
      setShowEditUserModal(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Delete user mutation
  const deleteMutation = useMutation({
    mutationFn: async (userId) => {
      const response = await apiFetch(`/api/auth/users?id=${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete user');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('User access revoked successfully. They have been reverted to a regular employee.');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    const defaultStores =
      !isSuperAdmin() && isAdmin() && store?.id ? [store.id] : [];
    setFormData({
      username: '',
      email: '',
      password: '',
      fullName: '',
      role: 'cashier',
      storeIds: defaultStores,
      permissions: [],
      employeeId: null,
    });
    setEditingUser(null);
    setSelectedEmployee(null);
  };

  // Export all users data
  const handleExportAllUsers = () => {
    setExportType('all');
    setShowExportModal(true);
  };

  const performExportAllUsers = async () => {
    // Require password confirmation
    requirePassword('export', async () => {
      try {
        // Fetch activity logs for all users with date range filter
        let allActivityLogs = [];
        if (exportDateRange.startDate || exportDateRange.endDate) {
          try {
            const logsResponse = await apiFetch(`/api/auth/users/activity-logs/download?format=json&startDate=${exportDateRange.startDate || ''}&endDate=${exportDateRange.endDate || ''}`, {
              credentials: 'include'
            });
            if (logsResponse.ok) {
              allActivityLogs = await logsResponse.json();
            } else {
              console.warn('Failed to fetch activity logs, continuing without them');
            }
          } catch (logError) {
            console.warn('Error fetching activity logs, continuing without them:', logError);
          }
        }

        logButtonClick('Export All Users', `Export all users data as ${exportFormat.toUpperCase()}`, {
          total_users: filteredUsers.length,
          role_filter: roleFilter,
          format: exportFormat,
          date_range: exportDateRange
        });

        let content = '';
        let filename = '';
        let mimeType = '';

        const dateFilterStr = new Date().toISOString().split('T')[0];
        const roleFilterStr = roleFilter !== 'all' ? `_${roleFilter}` : '';
        const dateRangeStr = exportDateRange.startDate && exportDateRange.endDate 
          ? `_${exportDateRange.startDate}_to_${exportDateRange.endDate}` 
          : '';

        if (exportFormat === 'csv') {
          let csvContent = `Users Export\n`;
          csvContent += `Date Range: ${exportDateRange.startDate || 'All'} to ${exportDateRange.endDate || 'All'}\n`;
          csvContent += `Role Filter: ${roleFilter !== 'all' ? getRoleLabel(roleFilter) : 'All'}\n`;
          csvContent += `Total Users: ${filteredUsers.length}\n`;
          csvContent += `\n`;

          // Users data
          csvContent += `Users Data\n`;
          const headers = ['ID', 'Full Name', 'Username', 'Email', 'Role', 'Stores', 'Status', 'Created At'];
          const csvData = filteredUsers.map(user => [
            user.id,
            user.full_name || '',
            user.username || '',
            user.email || '',
            getRoleLabel(user.role),
            user.store_names || 'N/A',
            user.is_active ? 'Active' : 'Inactive',
            user.created_at || ''
          ]);

          csvContent += [headers, ...csvData]
            .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
            .join('\n');

          // Activity Logs
          if (allActivityLogs.length > 0) {
            csvContent += `\n\nActivity Logs\n`;
            csvContent += `User ID,Username,Full Name,Action Type,Action Description,Entity Type,Entity ID,Created At,Metadata\n`;
            allActivityLogs.forEach(log => {
              const metadata = log.metadata ? JSON.stringify(log.metadata).replace(/"/g, '""') : '';
              csvContent += `"${log.user_id}","${log.username || ''}","${log.full_name || ''}","${log.action_type || ''}","${log.action_description || ''}","${log.entity_type || ''}","${log.entity_id || ''}","${log.created_at || ''}","${metadata}"\n`;
            });
          }

          content = csvContent;
          filename = `users_export${roleFilterStr}${dateRangeStr}_${dateFilterStr}.csv`;
          mimeType = 'text/csv;charset=utf-8;';
        } else if (exportFormat === 'json') {
          const exportData = {
            export_info: {
              date_range: {
                start: exportDateRange.startDate || 'All',
                end: exportDateRange.endDate || 'All'
              },
              role_filter: roleFilter !== 'all' ? roleFilter : 'All',
              total_users: filteredUsers.length,
              exported_at: new Date().toISOString()
            },
            users: filteredUsers,
            activity_logs: allActivityLogs
          };
          content = JSON.stringify(exportData, null, 2);
          filename = `users_export${roleFilterStr}${dateRangeStr}_${dateFilterStr}.json`;
          mimeType = 'application/json';
        }

        const blob = new Blob([content], { type: mimeType });
        try {
          await saveFile(blob, filename);
          setShowExportModal(false);
          setExportDateRange({ startDate: '', endDate: '' });
          toast.success('Users data exported successfully!');
        } catch (saveError) {
          // User might have cancelled the save dialog
          if (saveError?.name === 'AbortError' || saveError?.message?.includes('cancel')) {
            // User cancelled, don't show error
            return;
          }
          throw saveError; // Re-throw other errors
        }
      } catch (error) {
        console.error('Error exporting users:', error);
        toast.error(`Failed to export users data: ${error.message || 'Unknown error'}`);
      }
    }, { action: 'export_all_users' });
  };

  // Export specific user's analytics data
  const handleExportUserAnalytics = () => {
    if (!selectedUser || !userAnalytics) {
      toast.error('No analytics data available to export');
      return;
    }
    setExportType('user');
    setShowUserAnalyticsExportModal(true);
  };

  const performExportUserAnalytics = async () => {
    if (!selectedUser || !userAnalytics) {
      toast.error('No analytics data available to export');
      return;
    }

    // Require password confirmation
    requirePassword('export', async () => {
      try {
        // Fetch activity logs with date range filter
        let activityLogs = [];
        if (userExportDateRange.startDate || userExportDateRange.endDate) {
          try {
            const logsResponse = await apiFetch(`/api/auth/users/${selectedUser.id}/activity-logs/download?format=json&startDate=${userExportDateRange.startDate || ''}&endDate=${userExportDateRange.endDate || ''}`, {
              credentials: 'include'
            });
            if (logsResponse.ok) {
              activityLogs = await logsResponse.json();
            } else {
              console.warn('Failed to fetch activity logs, using existing analytics logs');
              activityLogs = userAnalytics.activity_logs || [];
            }
          } catch (logError) {
            console.warn('Error fetching activity logs, using existing analytics logs:', logError);
            activityLogs = userAnalytics.activity_logs || [];
          }
        } else {
          // Use existing activity logs from analytics (limited to 100)
          activityLogs = userAnalytics.activity_logs || [];
        }

        logButtonClick('Export User Analytics', `Export analytics for user: ${selectedUser.username} as ${exportFormat.toUpperCase()}`, {
          user_id: selectedUser.id,
          username: selectedUser.username,
          format: exportFormat,
          date_range: userExportDateRange
        });

        const dateFilterStr = userExportDateRange.startDate && userExportDateRange.endDate 
          ? `_${userExportDateRange.startDate}_to_${userExportDateRange.endDate}` 
          : '';

        let content = '';
        let filename = '';
        let mimeType = '';

        if (exportFormat === 'csv') {
          // Prepare CSV data
          let csvContent = `User Analytics Export\n`;
          csvContent += `User: ${selectedUser.full_name} (${selectedUser.username})\n`;
          csvContent += `Role: ${selectedUser.role === 'super_admin' ? 'Super Admin' : selectedUser.role === 'admin' ? 'Admin' : 'Cashier'}\n`;
          csvContent += `Date Range: ${userExportDateRange.startDate || 'All'} to ${userExportDateRange.endDate || 'All'}\n`;
          csvContent += `\n`;

          // Statistics
          csvContent += `Statistics\n`;
          csvContent += `Total Sales,${userAnalytics.statistics.total_sales}\n`;
          csvContent += `Total Revenue,$${userAnalytics.statistics.total_revenue.toFixed(2)}\n`;
          csvContent += `Customers Served,${userAnalytics.statistics.customers_served}\n`;
          csvContent += `Active Days,${userAnalytics.statistics.active_days}\n`;
          csvContent += `Completed Revenue,$${userAnalytics.statistics.completed_revenue.toFixed(2)}\n`;
          csvContent += `Pending Revenue,$${userAnalytics.statistics.pending_revenue.toFixed(2)}\n`;
          csvContent += `Failed Revenue,$${userAnalytics.statistics.failed_revenue.toFixed(2)}\n`;
          csvContent += `\n`;

          // Top Items
          if (userAnalytics.top_items && userAnalytics.top_items.length > 0) {
            csvContent += `Top Selling Items\n`;
            csvContent += `Item Name,Total Revenue,Total Quantity\n`;
            userAnalytics.top_items.forEach(item => {
              csvContent += `"${item.item_name}",$${parseFloat(item.total_revenue).toFixed(2)},${item.total_quantity}\n`;
            });
            csvContent += `\n`;
          }

          // Payment Methods
          if (userAnalytics.payment_methods && userAnalytics.payment_methods.length > 0) {
            csvContent += `Payment Methods\n`;
            csvContent += `Payment Method,Total Amount,Transaction Count\n`;
            userAnalytics.payment_methods.forEach(method => {
              csvContent += `"${method.payment_method}",$${parseFloat(method.total_amount).toFixed(2)},${method.count}\n`;
            });
            csvContent += `\n`;
          }

          // Activity Logs
          if (activityLogs.length > 0) {
            csvContent += `Activity Logs\n`;
            csvContent += `Action Type,Action Description,Entity Type,Entity ID,Metadata,Timestamp\n`;
            activityLogs.forEach(log => {
              const metadata = log.metadata ? (typeof log.metadata === 'string' ? log.metadata : JSON.stringify(log.metadata)).replace(/"/g, '""') : '';
              csvContent += `"${log.action_type || ''}","${log.action_description || ''}","${log.entity_type || ''}","${log.entity_id || ''}","${metadata}","${log.created_at || ''}"\n`;
            });
          }

          content = csvContent;
          filename = `user_analytics_${selectedUser.username}_${dateFilterStr}_${new Date().toISOString().split('T')[0]}.csv`;
          mimeType = 'text/csv;charset=utf-8;';
        } else if (exportFormat === 'json') {
          const exportData = {
            user: {
              id: selectedUser.id,
              username: selectedUser.username,
              full_name: selectedUser.full_name,
              role: selectedUser.role === 'super_admin' ? 'Super Admin' : selectedUser.role === 'admin' ? 'Admin' : 'Cashier'
            },
            date_range: {
              start: userExportDateRange.startDate || 'All',
              end: userExportDateRange.endDate || 'All'
            },
            statistics: userAnalytics.statistics,
            top_items: userAnalytics.top_items || [],
            payment_methods: userAnalytics.payment_methods || [],
            activity_logs: activityLogs
          };
          content = JSON.stringify(exportData, null, 2);
          filename = `user_analytics_${selectedUser.username}_${dateFilterStr}_${new Date().toISOString().split('T')[0]}.json`;
          mimeType = 'application/json';
        }

        const blob = new Blob([content], { type: mimeType });
        try {
          await saveFile(blob, filename);
          setShowUserAnalyticsExportModal(false);
          setUserExportDateRange({ startDate: '', endDate: '' });
          toast.success('User analytics exported successfully!');
        } catch (saveError) {
          // User might have cancelled the save dialog
          if (saveError?.name === 'AbortError' || saveError?.message?.includes('cancel')) {
            // User cancelled, don't show error
            return;
          }
          throw saveError; // Re-throw other errors
        }
      } catch (error) {
        console.error('Error exporting user analytics:', error);
        toast.error(`Failed to export user analytics: ${error.message || 'Unknown error'}`);
      }
    }, { action: 'export_user_analytics', user_id: selectedUser?.id });
  };

  const handleOpenModal = (user = null) => {
    if (user) {
      logButtonClick('Edit User', `Edit user: ${user.username}`, {
        user_id: user.id,
        username: user.username
      });
      setEditingUser(user);
      let permissions = [];
      if (user.permissions) {
        try {
          permissions = JSON.parse(user.permissions);
        } catch (e) {
          permissions = user.permissions.split(',').map(p => p.trim()).filter(p => p);
        }
      }
      setFormData({
        username: user.username,
        email: user.email || '',
        password: '',
        fullName: user.full_name,
        role: user.role,
        storeIds: user.store_ids ? user.store_ids.split(',').map(Number) : [],
        permissions: permissions,
        employeeId: user.id, // User ID is the employee ID
      });
      setShowEditUserModal(true);
    } else {
      // For adding new user, show employee search modal first
      logButtonClick('Add User', 'Open employee search modal');
      setShowEmployeeSearchModal(true);
      setEmployeeSearchQuery('');
      setSelectedEmployee(null);
    }
  };

  // Handle employee selection from search
  const handleEmployeeSelect = (employee) => {
    setSelectedEmployee(employee);
    setShowEmployeeSearchModal(false);
    // Check if employee already has login info (is a user)
    const existingUser = users.find(u => u.id === employee.id);
    if (existingUser) {
      // Employee already has login info, open edit modal
      setEditingUser(existingUser);
      let permissions = [];
      if (existingUser.permissions) {
        try {
          permissions = JSON.parse(existingUser.permissions);
        } catch (e) {
          permissions = existingUser.permissions.split(',').map(p => p.trim()).filter(p => p);
        }
      }
      setFormData({
        username: existingUser.username || '',
        email: existingUser.email || '',
        password: '',
        fullName: existingUser.full_name || '',
        role: existingUser.role,
        storeIds: existingUser.store_ids ? existingUser.store_ids.split(',').map(Number) : [],
        permissions: permissions,
        employeeId: employee.id,
      });
      setShowEditUserModal(true);
    } else {
      // New user, pre-fill with employee data
      setEditingUser(null);
      let permissions = [];
      if (employee.permissions) {
        try {
          permissions = JSON.parse(employee.permissions);
        } catch (e) {
          permissions = employee.permissions.split(',').map(p => p.trim()).filter(p => p);
        }
      }
      const fromEmp = employee.store_ids ? employee.store_ids.split(',').map(Number) : [];
      const fallbackStores =
        !fromEmp.length && !isSuperAdmin() && isAdmin() && store?.id ? [store.id] : fromEmp;
      setFormData({
        username: '',
        email: employee.email || '',
        password: '',
        fullName: employee.full_name || employee.fullName || '',
        role: employee.role || 'cashier',
        storeIds: fallbackStores,
        permissions: permissions,
        employeeId: employee.id,
      });
      setIsModalOpen(true);
    }
  };

  const handleViewDetails = (user) => {
    logButtonClick('View User Details', `View details for user: ${user.username}`, {
      user_id: user.id,
      username: user.username
    });
    setSelectedUser(user);
    setShowDetailsModal(true);
    setDateRange({ startDate: '', endDate: '' });
  };

  const [showCreateUserConfirmModal, setShowCreateUserConfirmModal] = useState(false);
  const [pendingCreateUserData, setPendingCreateUserData] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.username || !formData.fullName) {
      toast.error('Username and full name are required');
      return;
    }

    if (!editingUser && !formData.password) {
      toast.error('Password is required for new users');
      return;
    }

    const coercedStoreIds =
      formData.role === 'super_admin'
        ? []
        : formData.storeIds?.length
          ? formData.storeIds
          : !isSuperAdmin() && store?.id
            ? [store.id]
            : [];

    if (formData.role !== 'super_admin' && coercedStoreIds.length === 0) {
      toast.error('Please select at least one store (admins need an assigned store).');
      return;
    }

    const submitPayload = { ...formData, storeIds: coercedStoreIds };

    // Ensure employeeId is set when creating a user from an existing employee
    if (!editingUser && selectedEmployee && !submitPayload.employeeId) {
      submitPayload.employeeId = selectedEmployee.id;
    }

    // For critical updates (role changes, permissions), require admin password
    if (editingUser) {
      const hasRoleChange = editingUser.role !== submitPayload.role;
      const existingPermissions = editingUser.permissions 
        ? (typeof editingUser.permissions === 'string' 
            ? JSON.parse(editingUser.permissions) 
            : editingUser.permissions)
        : [];
      const hasPermissionChange =
        JSON.stringify(existingPermissions.sort()) !== JSON.stringify(submitPayload.permissions.sort());

      if (hasRoleChange || hasPermissionChange) {
        setPendingAction({
          type: 'update',
          user: editingUser,
          callback: () => {
            userMutation.mutate(submitPayload);
          }
        });
        setShowAdminPasswordModal(true);
        return;
      }
      
      // For regular updates, require password confirmation
      setPendingAction({
        type: 'update',
        user: editingUser,
        callback: () => {
          userMutation.mutate(submitPayload);
        }
      });
      setShowAdminPasswordModal(true);
      return;
    }

    // For creating new user, show confirmation modal first
    setPendingCreateUserData(submitPayload);
    setShowCreateUserConfirmModal(true);
  };

  const confirmCreateUser = () => {
    const payload = pendingCreateUserData;
    if (!payload) return;

    setShowCreateUserConfirmModal(false);

    setPendingAction({
      type: 'create',
      user: null,
      callback: () => {
        userMutation.mutate(payload);
        setPendingCreateUserData(null);
      },
    });
    setShowAdminPasswordModal(true);
  };

  const handleDelete = (userId) => {
    const user = users.find(u => u.id === userId);
    // Require admin password for delete
    setPendingAction({
      type: 'delete',
      user: user,
      callback: () => {
        setUserToDelete(user);
        setShowDeleteModal(true);
      }
    });
    setShowAdminPasswordModal(true);
  };

  const confirmDelete = () => {
    if (userToDelete) {
      logButtonClick('Revoke User Access', `Revoke access for user: ${userToDelete.username}`, {
        user_id: userToDelete.id,
        username: userToDelete.username
      });
      deleteMutation.mutate(userToDelete.id);
      setUserToDelete(null);
    }
  };

  // Toggle user active status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ userId, isActive }) => {
      const response = await apiFetch('/api/auth/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: userId, isActive: !isActive }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update user status');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User status updated successfully');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleToggleStatus = (user) => {
    // Require admin password for deactivate/reactivate
    setPendingAction({
      type: 'deactivate',
      user: user,
      callback: () => {
        setUserToToggle(user);
        setShowToggleStatusModal(true);
      }
    });
    setShowAdminPasswordModal(true);
  };

  const confirmToggleStatus = () => {
    if (userToToggle) {
      const action = userToToggle.is_active ? 'deactivate' : 'reactivate';
      logButtonClick('Toggle User Status', `${action} user: ${userToToggle.username}`, {
        user_id: userToToggle.id,
        username: userToToggle.username,
        action: action,
        new_status: !userToToggle.is_active
      });
      toggleStatusMutation.mutate({ userId: userToToggle.id, isActive: userToToggle.is_active });
      
      // Log admin action (logging is handled in the API endpoint)
    }
  };

  // Handle admin password confirmation
  const handleAdminPasswordConfirm = async () => {
    if (!adminPassword.trim() || !pendingAction || !authUser) {
      toast.error('Password is required');
      return;
    }

    try {
      // Verify admin password
      const response = await apiFetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: authUser.username,
          password: adminPassword
        })
      });

      const data = await response.json();

      if (!response.ok || !data.valid) {
        toast.error('Invalid password. Action cancelled.');
        setShowAdminPasswordModal(false);
        setPendingAction(null);
        setAdminPassword('');
        return;
      }

      // Password verified, proceed with action
      setShowAdminPasswordModal(false);
      setAdminPassword('');
      
      if (pendingAction.callback) {
        pendingAction.callback();
      }
      
      setPendingAction(null);
    } catch (error) {
      console.error('Password verification error:', error);
      toast.error('Failed to verify password. Please try again.');
    }
  };

  if (!isAdmin()) {
    return (
      <div className="p-6">
        <div className="glass-card p-6 text-center">
          <p className="text-analytics-secondary">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full font-sans">
      <div className="flex-shrink-0 px-4 pt-7 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center sm:gap-4">
            <div className="flex items-center gap-3">
              {/* Sidebar toggle is now in AdminLayout */}
              <div>
                <h1 className="analytics-header text-2xl">User Management</h1>
                <p className="text-sm text-analytics-secondary mt-1">Users with access to POS, Admin Dashboard, or Price Editing</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleExportAllUsers}
                className="glass-card-pro text-xs font-semibold soft-shadow flex items-center gap-1.5 py-2 px-3 min-h-10"
                title="Export all users data"
              >
                <Download size={12} className="text-analytics-revenue" /> Export
              </button>
              {(isSuperAdmin() || (isAdmin() && !isSuperAdmin())) && (
                <button
                  type="button"
                  onClick={() => handleOpenModal()}
                  className="glass-button-primary text-white font-semibold flex items-center gap-2 px-4 py-2 text-sm min-h-10"
                >
                  <Plus size={18} />
                  Add User
                </button>
              )}
            </div>
        </div>
      </div>

      <div className="flex-shrink-0 px-4 pb-3">
          {/* Filters */}
          <div className="glass-card-pro p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Search size={16} className="shrink-0 text-analytics-secondary" />
                <label htmlFor="user-mgmt-search" className="sr-only">
                  Search users
                </label>
                <input
                  id="user-mgmt-search"
                  type="search"
                  value={userListSearch}
                  onChange={(e) => setUserListSearch(e.target.value)}
                  placeholder="Search by name, username, email, store, or role…"
                  className="glass-button-secondary min-h-10 w-full min-w-0 flex-1 rounded-lg px-3 py-2 text-sm text-analytics-primary placeholder:text-analytics-secondary/70"
                  autoComplete="off"
                />
              </div>
              <div className="flex items-center gap-2 relative">
                <Filter size={16} className="text-analytics-secondary" />
                <label className="text-sm text-analytics-secondary">Filter by Role:</label>
                <div className="relative">
                  <button
                    ref={roleButtonRef}
                    onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
                    className="glass-button-secondary px-3 py-1.5 text-sm text-analytics-primary flex items-center gap-2 min-w-[120px] justify-between"
                  >
                    <span>{roleOptions.find(opt => opt.value === roleFilter)?.label || 'All Roles'}</span>
                    <ChevronDown size={14} className={`transition-transform ${roleDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {roleDropdownOpen && typeof document !== 'undefined' && createPortal(
                    <div
                      ref={roleDropdownRef}
                      style={{
                        position: 'fixed',
                        top: `${roleDropdownPosition.top}px`,
                        left: `${roleDropdownPosition.left}px`,
                        width: `${roleDropdownPosition.width || 0}px`,
                        zIndex: 10000,
                        pointerEvents: 'auto'
                      }}
                      onClick={(e) => e.stopPropagation()}
                      data-role-dropdown
                    >
                      <div className="glass-card-pro shadow-lg category-dropdown-scroll" style={{ 
                        background: 'rgba(255,255,255,0.18)',
                        borderRadius: '16px',
                        boxShadow: '0 8px 32px 0 rgba(16,9,7,0.11), 0 2px 8px 0 rgba(0,0,0,0.06)',
                        backdropFilter: 'blur(9.5px)',
                        padding: '0',
                        maxHeight: 'calc(5 * 40px)',
                        overflowY: 'auto',
                        overflowX: 'hidden'
                      }}>
                        {roleOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setRoleFilter(option.value);
                              setRoleDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                              roleFilter === option.value
                                ? 'bg-white/30 text-analytics-primary font-medium'
                                : 'text-analytics-secondary hover:bg-white/20'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>,
                    document.body
                  )}
                </div>
              </div>
            </div>
          </div>
      </div>

      <div className="flex flex-1 min-h-0 min-w-0 flex-col px-4 pb-7">
          {/* Users Table */}
          <div className="glass-card-pro flex min-h-0 flex-1 flex-col overflow-hidden p-6">
            {isLoading ? (
              <div className="text-center py-8 text-analytics-secondary">Loading...</div>
            ) : usersError ? (
              <div className="text-center py-8 text-red-500">
                Error: {usersError.message || 'Failed to load users'}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-analytics-secondary">
                {userListSearch.trim()
                  ? `No users match “${userListSearch.trim()}”. Try another search or clear the search box.`
                  : users && users.length > 0
                    ? `No users match the current filters (${users.length} total).`
                    : 'No users found.'}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
              <div className="min-w-0 overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-analytics-secondary whitespace-nowrap">Name</th>
                      <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-analytics-secondary whitespace-nowrap hidden md:table-cell">Username</th>
                      <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-analytics-secondary whitespace-nowrap hidden lg:table-cell">Email</th>
                      <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-analytics-secondary whitespace-nowrap">Role</th>
                      <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-analytics-secondary whitespace-nowrap hidden md:table-cell">Stores</th>
                      <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-analytics-secondary whitespace-nowrap">Status</th>
                      <th className="text-right py-3 px-2 sm:px-4 text-sm font-semibold text-analytics-secondary whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr 
                        key={user.id} 
                        className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                        onClick={(e) => {
                          // Don't open modal if clicking on action buttons
                          const target = e.target;
                          const isActionButton = target.closest('button') || target.closest('svg') || target.closest('[data-action-button]');
                          if (!isActionButton) {
                            handleViewDetails(user);
                          }
                        }}
                      >
                        <td className="py-3 px-2 sm:px-4 text-analytics-primary whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-medium">{user.full_name}</span>
                            <span className="text-xs text-analytics-secondary md:hidden">{user.username}</span>
                          </div>
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-analytics-secondary whitespace-nowrap hidden md:table-cell">{user.username}</td>
                        <td className="py-3 px-2 sm:px-4 text-analytics-secondary whitespace-nowrap hidden lg:table-cell">{user.email || '-'}</td>
                        <td className="py-3 px-2 sm:px-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getRoleBadgeColor(user.role)}`}>
                            {getRoleLabel(user.role)}
                          </span>
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-analytics-secondary text-sm whitespace-nowrap hidden md:table-cell">
                          {user.store_names || '-'}
                        </td>
                        <td className="py-3 px-2 sm:px-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            user.is_active ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                          }`}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-right whitespace-nowrap" data-action-button>
                          <div className="flex justify-end gap-1 sm:gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenModal(user);
                              }}
                              className="p-1.5 sm:p-2 glass-button-secondary rounded-lg hover:bg-white/20 transition-colors flex-shrink-0"
                              title="Edit User"
                            >
                              <Edit2 size={14} className="sm:w-4 sm:h-4" />
                            </button>
                            {user.id !== authUser?.id && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleStatus(user);
                                  }}
                                  className={`p-1.5 sm:p-2 rounded-lg transition-colors flex-shrink-0 ${
                                    user.is_active
                                      ? 'glass-button-secondary hover:bg-yellow-500/20'
                                      : 'glass-button-secondary hover:bg-green-500/20'
                                  }`}
                                  title={user.is_active ? 'Deactivate User' : 'Reactivate User'}
                                >
                                  {user.is_active ? <PowerOff size={14} className="sm:w-4 sm:h-4" /> : <Power size={14} className="sm:w-4 sm:h-4" />}
                                </button>
                                {user.id !== authUser?.id && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(user.id);
                                    }}
                                    className="p-1.5 sm:p-2 glass-button-danger rounded-lg hover:bg-red-500/20 transition-colors flex-shrink-0"
                                    title="Revoke User Access"
                                  >
                                    <Trash2 size={14} className="sm:w-4 sm:h-4" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            )}
          </div>
      </div>

          {/* User Details Modal */}
          <AnimatePresence>
            {showDetailsModal && selectedUser && (
              <div className="fixed inset-0 z-[100050] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="glass-card-pro p-6 rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col"
                >
                  <div className="flex justify-between items-center mb-6 flex-shrink-0">
                    <div>
                      <h2 className="text-2xl font-bold text-analytics-primary">
                        {selectedUser.full_name} - Analytics & Logs
                      </h2>
                      <p className="text-sm text-analytics-secondary mt-1">
                        {selectedUser.role === 'super_admin' ? 'Super Admin' : selectedUser.role === 'admin' ? 'Admin' : 'Cashier'} • {selectedUser.username}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          handleOpenModal(selectedUser);
                          setShowDetailsModal(false);
                        }}
                        className="p-2 glass-button-primary text-white rounded-lg hover:bg-white/20 transition-colors flex items-center gap-2"
                        title="Edit User"
                      >
                        <Edit2 size={18} />
                        <span className="hidden sm:inline">Edit</span>
                      </button>
                      <button
                        onClick={handleExportUserAnalytics}
                        disabled={!userAnalytics || analyticsLoading}
                        className="p-1.5 glass-card-pro rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        title="Export user analytics"
                      >
                        <Download size={14} className="text-analytics-revenue" />
                        <span className="text-xs text-analytics-secondary">Export</span>
                      </button>
                      <button
                        onClick={() => refetchAnalytics()}
                        disabled={analyticsLoading}
                        className="p-2 glass-button-secondary rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Refresh"
                      >
                        <RefreshCw size={20} className={analyticsLoading ? 'animate-spin' : ''} />
                      </button>
                      <button
                        onClick={() => {
                          setShowDetailsModal(false);
                          setSelectedUser(null);
                        }}
                        className="p-2 glass-button-secondary rounded-lg hover:bg-white/20 transition-colors"
                        title="Close"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>

                  {/* Date Range Filter */}
                  <div className="glass-card-pro p-4 mb-6 flex-shrink-0">
                    <div className="flex items-center gap-4">
                      <div>
                        <label className="block text-xs text-analytics-secondary mb-1">Start Date</label>
                        <input
                          type="date"
                          value={dateRange.startDate}
                          onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                          className="glass-button-secondary px-3 py-1.5 text-sm text-analytics-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-analytics-secondary mb-1">End Date</label>
                        <input
                          type="date"
                          value={dateRange.endDate}
                          onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                          className="glass-button-secondary px-3 py-1.5 text-sm text-analytics-primary"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Analytics Content */}
                  <div className="flex-1 overflow-y-auto sidebar-scroll">
                    {analyticsLoading ? (
                      <div className="text-center py-8 text-analytics-secondary">Loading analytics...</div>
                    ) : userAnalytics ? (
                      <div className="space-y-6">
                        {/* Statistics Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="glass-card-pro p-4 text-center">
                            <BarChart3 size={24} className="text-analytics-revenue mx-auto mb-2" />
                            <p className="text-xs text-analytics-secondary mb-1">Total Sales</p>
                            <p className="text-xl font-bold text-analytics-primary">{userAnalytics.statistics.total_sales}</p>
                          </div>
                          <div className="glass-card-pro p-4 text-center">
                            <DollarSign size={24} className="text-analytics-profit mx-auto mb-2" />
                            <p className="text-xs text-analytics-secondary mb-1">Total Revenue</p>
                            <p className="text-xl font-bold text-analytics-primary">${userAnalytics.statistics.total_revenue.toFixed(2)}</p>
                          </div>
                          <div className="glass-card-pro p-4 text-center">
                            <UsersIcon size={24} className="text-analytics-revenue mx-auto mb-2" />
                            <p className="text-xs text-analytics-secondary mb-1">Customers Served</p>
                            <p className="text-xl font-bold text-analytics-primary">{userAnalytics.statistics.customers_served}</p>
                          </div>
                          <div className="glass-card-pro p-4 text-center">
                            <Calendar size={24} className="text-analytics-stock mx-auto mb-2" />
                            <p className="text-xs text-analytics-secondary mb-1">Active Days</p>
                            <p className="text-xl font-bold text-analytics-primary">{userAnalytics.statistics.active_days}</p>
                          </div>
                        </div>

                        {/* Revenue Breakdown */}
                        <div className="glass-card-pro p-4">
                          <h3 className="text-lg font-semibold text-analytics-primary mb-4">Revenue Breakdown</h3>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <p className="text-xs text-analytics-secondary mb-1">Completed</p>
                              <p className="text-lg font-bold text-analytics-revenue">${userAnalytics.statistics.completed_revenue.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-analytics-secondary mb-1">Pending</p>
                              <p className="text-lg font-bold text-analytics-expense">${userAnalytics.statistics.pending_revenue.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-analytics-secondary mb-1">Failed</p>
                              <p className="text-lg font-bold text-analytics-loss">${userAnalytics.statistics.failed_revenue.toFixed(2)}</p>
                            </div>
                          </div>
                        </div>

                        {/* Top Items */}
                        {userAnalytics.top_items && userAnalytics.top_items.length > 0 && (
                          <div className="glass-card-pro p-4">
                            <h3 className="text-lg font-semibold text-analytics-primary mb-4">Top Selling Items</h3>
                            <div className="space-y-2">
                              {userAnalytics.top_items.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center p-2 bg-white/10 rounded">
                                  <span className="text-sm text-analytics-primary">{item.item_name}</span>
                                  <div className="text-right">
                                    <p className="text-sm font-bold text-analytics-revenue">${parseFloat(item.total_revenue).toFixed(2)}</p>
                                    <p className="text-xs text-analytics-secondary">Qty: {item.total_quantity}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Payment Methods */}
                        {userAnalytics.payment_methods && userAnalytics.payment_methods.length > 0 && (
                          <div className="glass-card-pro p-4">
                            <h3 className="text-lg font-semibold text-analytics-primary mb-4">Payment Methods</h3>
                            <div className="space-y-2">
                              {userAnalytics.payment_methods.map((method, idx) => (
                                <div key={idx} className="flex justify-between items-center p-2 bg-white/10 rounded">
                                  <span className="text-sm text-analytics-primary capitalize">{method.payment_method}</span>
                                  <div className="text-right">
                                    <p className="text-sm font-bold text-analytics-revenue">${parseFloat(method.total_amount).toFixed(2)}</p>
                                    <p className="text-xs text-analytics-secondary">{method.count} transactions</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Activity Logs */}
                        <div className="glass-card-pro p-4">
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold text-analytics-primary">Activity Logs</h3>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1 text-xs text-analytics-secondary">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                <span>Auto-updating</span>
                              </div>
                              <button
                                onClick={() => refetchAnalytics()}
                                disabled={analyticsLoading}
                                className="p-1.5 glass-button-secondary rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Refresh logs"
                              >
                                <RefreshCw size={16} className={analyticsLoading ? 'animate-spin' : ''} />
                              </button>
                            </div>
                          </div>
                          <div className="space-y-2 max-h-64 overflow-y-auto sidebar-scroll">
                            {userAnalytics.activity_logs && userAnalytics.activity_logs.length > 0 ? (
                              userAnalytics.activity_logs.map((log, idx) => (
                                <div key={`${log.id || idx}-${log.created_at}`} className="flex items-start gap-3 p-2 bg-white/10 rounded">
                                  <Clock size={16} className="text-analytics-secondary mt-0.5 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-analytics-primary">{log.action_description}</p>
                                    <p className="text-xs text-analytics-secondary">
                                      {new Date(log.created_at).toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-analytics-secondary text-center py-4">No activity logs found</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-analytics-secondary">No analytics data available</div>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Add/Edit User Modal */}
          <AnimatePresence>
            {(isModalOpen || showEditUserModal) && (
              <div className="fixed inset-0 z-[100050] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="glass-card-pro p-6 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto sidebar-scroll"
                >
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-analytics-primary">
                        {editingUser ? 'Edit User' : selectedEmployee ? `Create Login for ${selectedEmployee.full_name || selectedEmployee.fullName || 'Employee'}` : 'Add New User'}
                      </h2>
                      {selectedEmployee && !editingUser && (
                        <p className="text-sm text-analytics-secondary mt-1">
                          Employee: {selectedEmployee.full_name || selectedEmployee.fullName} • {getRoleLabel(selectedEmployee.role)}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setIsModalOpen(false);
                        setShowEditUserModal(false);
                        resetForm();
                      }}
                      className="p-2 glass-button-secondary rounded-lg hover:bg-white/20 transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-analytics-secondary mb-2">Username *</label>
                        <input
                          type="text"
                          value={formData.username}
                          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                          className="w-full glass-input px-4 py-2 rounded-lg text-analytics-primary"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-analytics-secondary mb-2">Full Name *</label>
                        <input
                          type="text"
                          value={formData.fullName}
                          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                          className="w-full glass-input px-4 py-2 rounded-lg text-analytics-primary"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-analytics-secondary mb-2">Email</label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full glass-input px-4 py-2 rounded-lg text-analytics-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-analytics-secondary mb-2">
                          Password {!editingUser && '*'}
                        </label>
                        <input
                          type="password"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          className="w-full glass-input px-4 py-2 rounded-lg text-analytics-primary"
                          required={!editingUser}
                          placeholder={editingUser ? 'Leave blank to keep current password' : ''}
                        />
                      </div>

                      {isSuperAdmin() && (
                        <div className="relative">
                          <label className="block text-sm font-medium text-analytics-secondary mb-2">Role *</label>
                          <div className="relative">
                            <button
                              ref={roleSelectButtonRef}
                              type="button"
                              onClick={() => setRoleSelectDropdownOpen(!roleSelectDropdownOpen)}
                              className="w-full glass-button-secondary px-4 py-2 rounded-lg text-sm text-analytics-primary flex items-center justify-between min-w-[120px]"
                            >
                              <span>
                                {getRoleLabel(formData.role)}
                              </span>
                              <ChevronDown size={14} className={`transition-transform ${roleSelectDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>
                            
                            {roleSelectDropdownOpen && typeof document !== 'undefined' && createPortal(
                              <div
                                data-role-select-dropdown
                                ref={roleSelectDropdownRef}
                                style={{ 
                                  position: 'fixed',
                                  top: `${roleSelectDropdownPosition.top + 8}px`,
                                  right: `${roleSelectDropdownPosition.right}px`,
                                  width: `${roleSelectDropdownPosition.width || 0}px`,
                                  zIndex: 10000,
                                  pointerEvents: 'auto'
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="glass-card-pro shadow-lg category-dropdown-scroll" style={{ 
                                  background: 'rgba(255,255,255,0.18)',
                                  borderRadius: '16px',
                                  boxShadow: '0 8px 32px 0 rgba(16,9,7,0.11), 0 2px 8px 0 rgba(0,0,0,0.06)',
                                  backdropFilter: 'blur(9.5px)',
                                  padding: '0',
                                  maxHeight: 'calc(5 * 40px)',
                                  overflowY: 'auto',
                                  overflowX: 'hidden'
                                }}>
                                  {predefinedRoles
                                    .filter(role => {
                                      // Super admin can assign any role
                                      if (isSuperAdmin()) {
                                        return true;
                                      }
                                      // Regular admin can assign any role except admin and super_admin
                                      if (isAdmin()) {
                                        return role.value !== 'admin' && role.value !== 'super_admin';
                                      }
                                      return false;
                                    })
                                    .map((option) => (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() => {
                                        setFormData({ ...formData, role: option.value, storeIds: option.value === 'super_admin' ? [] : formData.storeIds });
                                        setRoleSelectDropdownOpen(false);
                                      }}
                                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                        formData.role === option.value
                                          ? 'bg-white/30 text-analytics-primary font-medium'
                                          : 'text-analytics-secondary hover:bg-white/10'
                                      }`}
                                    >
                                      {option.label}
                                    </button>
                                  ))}
                                </div>
                              </div>,
                              document.body
                            )}
                          </div>
                        </div>
                      )}

                      {/* Role Elevation/Downgrade (for editing) */}
                      {editingUser && (isSuperAdmin() || isAdmin()) && (
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-analytics-secondary mb-2">Role Management</label>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                const currentLevel = roleHierarchy[formData.role] || 0;
                                const lowerRole = Object.entries(roleHierarchy)
                                  .filter(([roleName, level]) => {
                                    // Admins can't downgrade to admin role, only super admins can
                                    if (!isSuperAdmin() && roleName === 'admin') return false;
                                    return level < currentLevel;
                                  })
                                  .sort(([_, a], [__, b]) => b - a)[0];
                                if (lowerRole) {
                                  setFormData({ ...formData, role: lowerRole[0] });
                                }
                              }}
                              disabled={!Object.entries(roleHierarchy).some(([roleName, level]) => {
                                if (!isSuperAdmin() && roleName === 'admin') return false;
                                return level < (roleHierarchy[formData.role] || 0);
                              })}
                              className="glass-button-secondary px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Downgrade Role"
                            >
                              <ArrowDown size={16} />
                              Downgrade
                            </button>
                            <span className="text-sm text-analytics-secondary">
                              Current: <span className="font-medium text-analytics-primary">{getRoleLabel(formData.role)}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const currentLevel = roleHierarchy[formData.role] || 0;
                                const higherRole = Object.entries(roleHierarchy)
                                  .filter(([roleName, level]) => {
                                    // Admins can't elevate users to admin role
                                    if (!isSuperAdmin() && roleName === 'admin') return false;
                                    return level > currentLevel;
                                  })
                                  .sort(([_, a], [__, b]) => a - b)[0];
                                if (higherRole) {
                                  setFormData({ ...formData, role: higherRole[0] });
                                }
                              }}
                              disabled={!Object.entries(roleHierarchy).some(([roleName, level]) => {
                                if (!isSuperAdmin() && roleName === 'admin') return false;
                                return level > (roleHierarchy[formData.role] || 0);
                              })}
                              className="glass-button-secondary px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Elevate Role"
                            >
                              Elevate
                              <ArrowUp size={16} />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Permissions Section */}
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-analytics-secondary mb-2">Permissions</label>
                        <div className="glass-card-pro p-4 rounded-lg max-h-[300px] overflow-y-auto">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {availablePermissions.map((permission) => (
                              <label
                                key={permission.id}
                                className="flex items-start gap-2 p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={formData.permissions.includes(permission.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setFormData({
                                        ...formData,
                                        permissions: [...formData.permissions, permission.id]
                                      });
                                    } else {
                                      setFormData({
                                        ...formData,
                                        permissions: formData.permissions.filter(p => p !== permission.id)
                                      });
                                    }
                                  }}
                                  className="mt-1 w-4 h-4"
                                />
                                <div className="flex-1">
                                  <div className="text-sm font-medium text-analytics-primary">
                                    {permission.label}
                                  </div>
                                  <div className="text-xs text-analytics-secondary mt-0.5">
                                    {permission.description}
                                  </div>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>

                      {formData.role !== 'super_admin' && (
                        <div className={isSuperAdmin() ? 'md:col-span-1' : 'md:col-span-2'}>
                          <label className="block text-sm font-medium text-analytics-secondary mb-2">Stores *</label>
                          {storesLoading ? (
                            <div className="glass-button-secondary p-3 rounded-lg text-sm text-analytics-secondary text-center">
                              Loading stores...
                            </div>
                          ) : storesError ? (
                            <div className="glass-button-secondary p-3 rounded-lg text-sm text-red-400 text-center">
                              Error loading stores. Please try again.
                            </div>
                          ) : stores.length > 0 ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                              {stores.map((store) => (
                                <label key={store.id} className="flex items-center gap-2 glass-button-secondary p-3 rounded-lg cursor-pointer hover:bg-white/20 transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={formData.storeIds.includes(store.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setFormData({ ...formData, storeIds: [...formData.storeIds, store.id] });
                                      } else {
                                        setFormData({ ...formData, storeIds: formData.storeIds.filter(id => id !== store.id) });
                                      }
                                    }}
                                    className="w-4 h-4"
                                  />
                                  <span className="text-sm text-analytics-primary">{store.name}</span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <div className="glass-button-secondary p-3 rounded-lg text-sm text-analytics-secondary text-center">
                              {isSuperAdmin() ? 'No stores available. Please create a store first.' : 'No stores assigned to your account.'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                      <button
                        type="button"
                        onClick={() => {
                          setIsModalOpen(false);
                          setShowEditUserModal(false);
                          resetForm();
                        }}
                        className="glass-button-secondary px-6 py-2 rounded-lg font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={userMutation.isPending}
                        className="glass-button-primary px-6 py-2 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {userMutation.isPending ? 'Saving...' : editingUser ? 'Update' : 'Create'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

        {/* Export Format Selection Modal - All Users */}
        <AnimatePresence>
          {showExportModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100050] p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="glass-card-pro max-w-md w-full mx-4"
              >
                <div className="flex items-center justify-between pb-3 border-b border-white/30 mb-4">
                  <h2 className="text-xl font-semibold text-analytics-primary">Export Users</h2>
                  <button
                    onClick={() => setShowExportModal(false)}
                    className="p-2 glass-button-secondary rounded-lg hover:bg-white/20 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-analytics-secondary mb-2">Export Format</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setExportFormat('csv')}
                        className={`flex-1 px-4 py-2 text-sm rounded-lg transition-colors ${
                          exportFormat === 'csv' 
                            ? 'glass-button-primary text-white'
                            : 'glass-button-secondary'
                        }`}
                      >
                        CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportFormat('json')}
                        className={`flex-1 px-4 py-2 text-sm rounded-lg transition-colors ${
                          exportFormat === 'json' 
                            ? 'glass-button-primary text-white'
                            : 'glass-button-secondary'
                        }`}
                      >
                        JSON
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-analytics-secondary mb-2">Time Period (for Activity Logs)</label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-analytics-secondary mb-1">Start Date</label>
                        <input
                          type="date"
                          value={exportDateRange.startDate}
                          onChange={(e) => setExportDateRange({ ...exportDateRange, startDate: e.target.value })}
                          className="w-full px-3 py-2 text-sm glass-button-secondary rounded-lg text-analytics-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-analytics-secondary mb-1">End Date</label>
                        <input
                          type="date"
                          value={exportDateRange.endDate}
                          onChange={(e) => setExportDateRange({ ...exportDateRange, endDate: e.target.value })}
                          className="w-full px-3 py-2 text-sm glass-button-secondary rounded-lg text-analytics-primary"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-analytics-secondary mt-2">Leave empty to export all activity logs</p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowExportModal(false);
                        setExportDateRange({ startDate: '', endDate: '' });
                      }}
                      className="glass-button-secondary flex-1 px-4 py-2 text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={performExportAllUsers}
                      className="glass-button-primary text-white flex-1 px-4 py-2 text-sm flex items-center justify-center gap-2"
                    >
                      <Download size={16} /> Export
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Export Format Selection Modal - User Analytics */}
        <AnimatePresence>
          {showUserAnalyticsExportModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100050] p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="glass-card-pro max-w-md w-full mx-4"
              >
                <div className="flex items-center justify-between pb-3 border-b border-white/30 mb-4">
                  <h2 className="text-xl font-semibold text-analytics-primary">Export User Analytics</h2>
                  <button
                    onClick={() => setShowUserAnalyticsExportModal(false)}
                    className="p-2 glass-button-secondary rounded-lg hover:bg-white/20 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-analytics-secondary mb-2">Export Format</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setExportFormat('csv')}
                        className={`flex-1 px-4 py-2 text-sm rounded-lg transition-colors ${
                          exportFormat === 'csv' 
                            ? 'glass-button-primary text-white'
                            : 'glass-button-secondary'
                        }`}
                      >
                        CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportFormat('json')}
                        className={`flex-1 px-4 py-2 text-sm rounded-lg transition-colors ${
                          exportFormat === 'json' 
                            ? 'glass-button-primary text-white'
                            : 'glass-button-secondary'
                        }`}
                      >
                        JSON
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-analytics-secondary mb-2">Time Period (for Activity Logs)</label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-analytics-secondary mb-1">Start Date</label>
                        <input
                          type="date"
                          value={userExportDateRange.startDate}
                          onChange={(e) => setUserExportDateRange({ ...userExportDateRange, startDate: e.target.value })}
                          className="w-full px-3 py-2 text-sm glass-button-secondary rounded-lg text-analytics-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-analytics-secondary mb-1">End Date</label>
                        <input
                          type="date"
                          value={userExportDateRange.endDate}
                          onChange={(e) => setUserExportDateRange({ ...userExportDateRange, endDate: e.target.value })}
                          className="w-full px-3 py-2 text-sm glass-button-secondary rounded-lg text-analytics-primary"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-analytics-secondary mt-2">Leave empty to export all activity logs</p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserAnalyticsExportModal(false);
                        setUserExportDateRange({ startDate: '', endDate: '' });
                      }}
                      className="glass-button-secondary flex-1 px-4 py-2 text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={performExportUserAnalytics}
                      className="glass-button-primary text-white flex-1 px-4 py-2 text-sm flex items-center justify-center gap-2"
                    >
                      <Download size={16} /> Export
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Employee Search Modal */}
        <AnimatePresence>
          {showEmployeeSearchModal && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowEmployeeSearchModal(false)}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100050]"
              />
              <div className="fixed inset-0 z-[100050] flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={(e) => e.stopPropagation()}
                  className="glass-card-pro p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
                >
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-analytics-primary">Search Employee</h2>
                    <button
                      onClick={() => setShowEmployeeSearchModal(false)}
                      className="text-analytics-secondary hover:text-analytics-primary transition-colors"
                    >
                      <X size={24} />
                    </button>
                  </div>

                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-analytics-secondary" size={18} />
                    <input
                      ref={employeeSearchInputRef}
                      type="text"
                      value={employeeSearchQuery}
                      onChange={(e) => {
                        setEmployeeSearchQuery(e.target.value);
                        setSelectedSuggestionIndex(-1);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setSelectedSuggestionIndex(prev => 
                            prev < filteredEmployees.length - 1 ? prev + 1 : prev
                          );
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < filteredEmployees.length) {
                            handleEmployeeSelect(filteredEmployees[selectedSuggestionIndex]);
                          } else if (filteredEmployees.length === 1) {
                            handleEmployeeSelect(filteredEmployees[0]);
                          }
                        } else if (e.key === 'Escape') {
                          setShowEmployeeSearchModal(false);
                        }
                      }}
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg text-analytics-primary text-sm glass-input"
                      placeholder="Search by name, email, or role..."
                      autoFocus
                    />
                  </div>

                  {filteredEmployees.length > 0 ? (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {filteredEmployees.map((employee, index) => (
                        <button
                          key={employee.id}
                          onClick={() => handleEmployeeSelect(employee)}
                          className={`w-full text-left glass-card-pro p-4 rounded-lg transition-colors ${
                            selectedSuggestionIndex === index
                              ? 'bg-white/20'
                              : 'hover:bg-white/10'
                          }`}
                          onMouseEnter={() => setSelectedSuggestionIndex(index)}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-medium text-analytics-primary">
                                {employee.full_name || employee.fullName || employee.username}
                              </div>
                              <div className="text-sm text-analytics-secondary mt-1">
                                {employee.email && <span>{employee.email}</span>}
                                {employee.email && employee.role && <span> • </span>}
                                {employee.role && <span>{getRoleLabel(employee.role)}</span>}
                              </div>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${getRoleBadgeColor(employee.role)}`}>
                              {getRoleLabel(employee.role)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : employeeSearchQuery.trim() ? (
                    <div className="text-center py-8 text-analytics-secondary">
                      No employees found matching "{employeeSearchQuery}"
                    </div>
                  ) : (
                    <div className="text-center py-8 text-analytics-secondary">
                      Start typing to search for employees...
                    </div>
                  )}
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>

        {/* Admin Password Confirmation Modal */}
        <AnimatePresence>
          {showAdminPasswordModal && pendingAction && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setShowAdminPasswordModal(false);
                  setPendingAction(null);
                  setAdminPassword('');
                }}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100070]"
              />
              <div className="fixed inset-0 z-[100070] flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={(e) => e.stopPropagation()}
                  className="glass-card-pro p-6 max-w-md w-full"
                >
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-analytics-primary">Admin Verification</h2>
                    <button
                      onClick={() => {
                        setShowAdminPasswordModal(false);
                        setPendingAction(null);
                        setAdminPassword('');
                      }}
                      className="text-analytics-secondary hover:text-analytics-primary transition-colors"
                    >
                      <X size={24} />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-analytics-secondary mb-2">
                        Admin Username
                      </label>
                      <input
                        type="text"
                        value={authUser?.username || ''}
                        disabled
                        className="w-full glass-input px-4 py-2 rounded-lg text-analytics-primary text-sm opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-analytics-secondary mb-2">
                        Admin Password *
                      </label>
                      <input
                        type="password"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && adminPassword.trim()) {
                            handleAdminPasswordConfirm();
                          }
                        }}
                        className="w-full glass-input px-4 py-2 rounded-lg text-analytics-primary text-sm"
                        placeholder="Enter your password to confirm"
                        autoFocus
                      />
                    </div>
                    <div className="text-sm text-analytics-secondary">
                      This action requires admin verification for security purposes.
                    </div>
                  </div>

                  <div className="flex gap-2 mt-6">
                    <button
                      onClick={() => {
                        setShowAdminPasswordModal(false);
                        setPendingAction(null);
                        setAdminPassword('');
                      }}
                      className="glass-button-secondary flex-1 px-4 py-2 text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAdminPasswordConfirm}
                      disabled={!adminPassword.trim()}
                      className="glass-button-primary text-white flex-1 px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Lock size={16} className="inline mr-2" />
                      Verify & Continue
                    </button>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setUserToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Revoke User Access"
        message={userToDelete ? `Are you sure you want to revoke access for "${userToDelete.username}"? This will remove their login credentials and permissions, reverting them back to a regular employee. They will no longer appear in the users list.` : ''}
        confirmText="Revoke Access"
        cancelText="Cancel"
        type="delete"
      />

      {/* Toggle Status Confirmation Modal */}
      <ConfirmationModal
        isOpen={showToggleStatusModal}
        onClose={() => {
          setShowToggleStatusModal(false);
          setUserToToggle(null);
        }}
        onConfirm={confirmToggleStatus}
        title={userToToggle ? (userToToggle.is_active ? 'Deactivate User' : 'Reactivate User') : 'Toggle User Status'}
        message={userToToggle ? `Are you sure you want to ${userToToggle.is_active ? 'deactivate' : 'reactivate'} "${userToToggle.username}"?` : ''}
        confirmText={userToToggle ? (userToToggle.is_active ? 'Deactivate' : 'Reactivate') : 'Confirm'}
        cancelText="Cancel"
        type={userToToggle && !userToToggle.is_active ? 'undo' : 'warning'}
      />

      {/* Create User Confirmation Modal */}
      <ConfirmationModal
        isOpen={showCreateUserConfirmModal}
        onClose={() => {
          setShowCreateUserConfirmModal(false);
          setPendingCreateUserData(null);
        }}
        onConfirm={confirmCreateUser}
        title="Create User"
        message={pendingCreateUserData?.fullName ? `Are you sure you want to create a user account for "${pendingCreateUserData.fullName}"?` : selectedEmployee ? `Are you sure you want to create a user account for "${selectedEmployee.full_name || selectedEmployee.fullName}"?` : 'Are you sure you want to create a new user?'}
        confirmText="Create"
        cancelText="Cancel"
        type="info"
        stackZIndexClass="z-[100060]"
      />

      {/* Password Confirmation Modal */}
      <ConfirmationModal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setPasswordPendingAction(null);
          setPassword('');
        }}
        onConfirm={handlePasswordConfirm}
        title="Confirm with your password"
        message="Enter your admin or super admin account password to confirm this action."
        confirmText="Confirm"
        cancelText="Cancel"
        type="info"
        stackZIndexClass="z-[100065]"
        requirePassword={true}
        password={password}
        setPassword={setPassword}
        disabled={!password.trim()}
      />
    </div>
  );
}

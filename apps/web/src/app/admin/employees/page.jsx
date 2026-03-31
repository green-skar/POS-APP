'use client';

import { apiFetch } from '@/utils/apiClient';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit2, Trash2, User, Mail, Shield, Store, X, Calendar, Clock, DollarSign, Filter, Menu, Power, PowerOff, Download, ChevronDown, ArrowUp, ArrowDown, Eye, Search } from 'lucide-react';
import { useAuth } from '@/utils/useAuth';
import ProtectedRoute from '@/components/ProtectedRoute';
// Sidebar is now in admin layout - no need to import here
import { logButtonClick } from '@/utils/logActivity';
import ConfirmationModal from '@/components/ConfirmationModal';
import { usePasswordConfirmation } from '@/utils/usePasswordConfirmation';
import { saveFile } from '@/utils/saveFile';

export default function EmployeesPage() {
  return (
    <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
      <EmployeesPageContent />
    </ProtectedRoute>
  );
}

function EmployeesPageContent() {
  const { user: authUser, isAdmin, isSuperAdmin, store } = useAuth();
  const queryClient = useQueryClient();

  // Password confirmation hook
  const {
    showPasswordModal,
    setShowPasswordModal,
    password,
    setPassword,
    handlePasswordConfirm,
    requirePassword,
    setPendingAction: clearPasswordPendingAction,
  } = usePasswordConfirmation();
  
  // Sidebar state is now managed by AdminLayout
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [roleFilter, setRoleFilter] = useState('all');
  const [employeeListSearch, setEmployeeListSearch] = useState('');
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [roleDropdownPosition, setRoleDropdownPosition] = useState({ top: 0, right: 0, width: 0 });
  const roleDropdownRef = useRef(null);
  const roleButtonRef = useRef(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState(null);
  const [showToggleStatusModal, setShowToggleStatusModal] = useState(false);
  const [employeeToToggle, setEmployeeToToggle] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  const [roleSelectDropdownOpen, setRoleSelectDropdownOpen] = useState(false);
  const [roleSelectDropdownPosition, setRoleSelectDropdownPosition] = useState({ top: 0, right: 0, width: 0 });
  const [roleInputValue, setRoleInputValue] = useState('');
  const [showNewRoleConfirmModal, setShowNewRoleConfirmModal] = useState(false);
  const [pendingNewRole, setPendingNewRole] = useState(null);
  const [pendingFieldChange, setPendingFieldChange] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active'); // 'active', 'inactive', 'all'
  const [showRoleChangeModal, setShowRoleChangeModal] = useState(false);
  const [employeeToChangeRole, setEmployeeToChangeRole] = useState(null);
  const [newRole, setNewRole] = useState('');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showEmployeeExportModal, setShowEmployeeExportModal] = useState(false);
  const [employeeExportFormat, setEmployeeExportFormat] = useState('csv');
  const [showCreateConfirmModal, setShowCreateConfirmModal] = useState(false);
  const [pendingCreateData, setPendingCreateData] = useState(null);
  const roleSelectDropdownRef = useRef(null);
  const roleSelectButtonRef = useRef(null);
  const roleInputRef = useRef(null);

  // Available permissions
  const availablePermissions = [
    { id: 'access_pos', label: 'Access POS System', description: 'Can access the Point of Sale system' },
    { id: 'edit_products', label: 'Edit Products', description: 'Can create, update, and delete products' },
    { id: 'edit_services', label: 'Edit Services', description: 'Can create, update, and delete services' },
    { id: 'manage_sales', label: 'Manage Sales', description: 'Can view and manage sales records' },
    { id: 'manage_inventory', label: 'Manage Inventory', description: 'Can view and manage inventory' },
    { id: 'view_analytics', label: 'View Analytics', description: 'Can view analytics and reports' },
    { id: 'manage_expenses', label: 'Manage Expenses', description: 'Can create and manage expenses' },
    { id: 'manage_users', label: 'Manage Users', description: 'Can create, update, and delete users' },
    { id: 'manage_employees', label: 'Manage Employees', description: 'Can create, update, and delete employees' },
    { id: 'manage_stores', label: 'Manage Stores', description: 'Can create, update, and delete stores' },
    { id: 'edit_prices', label: 'Edit Prices', description: 'Can modify product and service prices' },
    { id: 'access_admin', label: 'Access Admin Dashboard', description: 'Can access the admin dashboard' },
    { id: 'manage_themes', label: 'Manage Themes', description: 'Can modify application themes' },
    { id: 'view_alerts', label: 'View Alerts', description: 'Can view system alerts' },
    { id: 'view_activity_log', label: 'View Activity Log', description: 'Can view and manage activity log, including deleted and modified items' },
  ];

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

  // Role hierarchy for upgrade/downgrade
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

  // Calculate dropdown position
  useEffect(() => {
    if (roleDropdownOpen && roleButtonRef.current) {
      const updatePosition = () => {
        if (roleButtonRef.current) {
          const rect = roleButtonRef.current.getBoundingClientRect();
          setRoleDropdownPosition({
            top: rect.bottom,
            right: window.innerWidth - rect.right,
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
  }, [roleDropdownOpen]);

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

  // Calculate role select dropdown position (for Add/Edit Employee form)
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

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    newPassword: '',
    confirmNewPassword: '',
    fullName: '',
    role: 'cashier',
    storeIds: [],
    salary: '',
    workShiftName: '',
    workShiftStart: '',
    workShiftEnd: '',
    hireDate: '',
    permissions: []
  });

  // Check if the typed role is new
  const checkForNewRole = React.useCallback(() => {
    const trimmedValue = roleInputValue.trim();
    if (!trimmedValue) return;
    
    const isExistingRole = predefinedRoles.some(r => 
      r.value.toLowerCase() === trimmedValue.toLowerCase() || 
      r.label.toLowerCase() === trimmedValue.toLowerCase()
    );
    
    if (!isExistingRole && trimmedValue !== formData.role) {
      setPendingNewRole(trimmedValue);
      setShowNewRoleConfirmModal(true);
    }
  }, [roleInputValue, formData.role]);

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
        // Check if a new role was typed
        setTimeout(() => checkForNewRole(), 100);
      }
    };
    
    window.addEventListener('scroll', handleScrollStart, true);
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      window.removeEventListener('scroll', handleScrollStart, true);
      document.removeEventListener('mousedown', handleClickOutside);
      clearTimeout(scrollTimeout);
    };
  }, [roleSelectDropdownOpen, checkForNewRole]);

  // Handle role selection from predefined list
  const handleRoleSelect = (roleValue) => {
    setFormData({ ...formData, role: roleValue });
    setRoleInputValue('');
    setRoleSelectDropdownOpen(false);
  };

  // Handle role input change
  const handleRoleInputChange = (value) => {
    setRoleInputValue(value);
    // If it matches a predefined role, auto-select it
    const matchedRole = predefinedRoles.find(r => 
      r.value.toLowerCase() === value.toLowerCase() || 
      r.label.toLowerCase() === value.toLowerCase()
    );
    if (matchedRole) {
      setFormData({ ...formData, role: matchedRole.value });
    } else {
      setFormData({ ...formData, role: value.toLowerCase().replace(/\s+/g, '_') });
    }
  };

  // Confirm new role creation
  const confirmNewRole = () => {
    if (pendingNewRole) {
      const normalizedRole = pendingNewRole.toLowerCase().replace(/\s+/g, '_');
      setFormData({ ...formData, role: normalizedRole });
      setRoleInputValue('');
    }
    setShowNewRoleConfirmModal(false);
    setPendingNewRole(null);
    // Continue with the pending field change if any
    if (pendingFieldChange) {
      pendingFieldChange();
      setPendingFieldChange(null);
    }
  };

  // Cancel new role creation
  const cancelNewRole = () => {
    setRoleInputValue('');
    setFormData({ ...formData, role: 'cashier' });
    setShowNewRoleConfirmModal(false);
    setPendingNewRole(null);
    setPendingFieldChange(null);
  };

  // Fetch employees (all employees, not filtered by permissions)
  const { data: employeesData, isLoading, error: employeesError, refetch } = useQuery({
    queryKey: ['employees', authUser?.id, store?.id], // Include user and store in cache key to avoid cache collisions
    queryFn: async () => {
      // Add cache-busting timestamp to ensure fresh data
      const timestamp = Date.now();
      console.log('[Frontend] Fetching employees at:', new Date(timestamp).toISOString());
      // Use the new /api/auth/employees endpoint which returns ALL employees
      const response = await apiFetch('/api/auth/employees', {
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch employees' }));
        console.error('[Frontend] Failed to fetch employees:', errorData);
        throw new Error(errorData.error || 'Failed to fetch employees');
      }
      
      // Log debug headers from API
      const debugEmployeeCount = response.headers.get('X-Debug-Employee-Count');
      const debugStoreId = response.headers.get('X-Debug-Store-Id');
      const debugRole = response.headers.get('X-Debug-Role');
      const debugRoleDistribution = response.headers.get('X-Debug-Role-Distribution');
      console.log('[Frontend] API Debug Headers:', {
        employeeCount: debugEmployeeCount,
        storeId: debugStoreId,
        role: debugRole,
        roleDistribution: debugRoleDistribution ? JSON.parse(debugRoleDistribution) : null
      });
      
      const data = await response.json();
      console.log('[Frontend] ===== EMPLOYEES FETCH START =====');
      console.log('[Frontend] API Response Status:', response.status);
      console.log('[Frontend] Employees API response - Total employees:', data.employees?.length || 0);
      console.log('[Frontend] Employees API response - Employees:', data.employees);
      
      // Verify data structure
      if (!data || !data.employees) {
        console.error('[Frontend] ERROR: Invalid API response structure:', data);
        throw new Error('Invalid API response structure');
      }
      
      // Log each employee's role
      if (data.employees && data.employees.length > 0) {
        console.log('[Frontend] Employees by role:');
        data.employees.forEach(e => {
          console.log(`  ${e.username} (ID: ${e.id}) - Role: ${e.role}, Active: ${e.is_active}`);
        });
        
        // Count roles
        const roleCounts = {};
        data.employees.forEach(e => {
          roleCounts[e.role] = (roleCounts[e.role] || 0) + 1;
        });
        console.log('[Frontend] Role distribution in API response:', roleCounts);
      } else {
        console.warn('[Frontend] WARNING: No employees received from API!');
      }
      
      // Employees endpoint already filters out super_admins, so use directly
      const employees = data.employees || [];
      
      console.log('[Frontend] Employees count:', employees.length);
      console.log('[Frontend] Employees by role:', employees.map(e => `${e.username} (${e.role})`));
      
      // Count roles in employees
      const roleCounts = {};
      employees.forEach(e => {
        roleCounts[e.role] = (roleCounts[e.role] || 0) + 1;
      });
      console.log('[Frontend] Role distribution:', roleCounts);
      
      console.log('[Frontend] ===== EMPLOYEES FETCH END =====');
      return { employees, timestamp };
    },
    staleTime: 0, // Always consider data stale to force refetch
    gcTime: 0, // Don't cache to ensure fresh data (formerly cacheTime)
  });

  const employees = employeesData?.employees || [];
  
  // Log employees count for debugging
  useEffect(() => {
    console.log('[Frontend] Total employees:', employees.length);
    console.log('[Frontend] Current roleFilter:', roleFilter);
    console.log('[Frontend] Current statusFilter:', statusFilter);
    console.log('[Frontend] Employees list:', employees.map(e => `${e.username} (${e.role}, active: ${e.is_active})`));
  }, [employees, roleFilter, statusFilter]);
  
  // Get unique roles from employees to populate filter dropdown
  const uniqueRoles = [...new Set(employees.map(emp => emp.role))].sort();
  console.log('[Frontend] Unique roles found:', uniqueRoles);
  
  const roleOptions = [
    { value: 'all', label: 'All Roles' },
    ...uniqueRoles.map(role => ({
      value: role,
      label: predefinedRoles.find(r => r.value === role)?.label || role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' ')
    }))
  ];
  
  const filteredEmployees = useMemo(() => {
    const q = employeeListSearch.trim().toLowerCase();
    return employees.filter((emp) => {
      const roleMatch = roleFilter === 'all' || emp.role === roleFilter;
      const statusMatch =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
            ? emp.is_active === 1 || emp.is_active === true
            : emp.is_active === 0 || emp.is_active === false;
      if (!roleMatch || !statusMatch) return false;
      if (!q) return true;
      const roleLabel =
        predefinedRoles.find((r) => r.value === emp.role)?.label ||
        String(emp.role || '')
          .replace(/_/g, ' ');
      const blob = [
        emp.full_name,
        emp.fullName,
        emp.username,
        emp.email,
        emp.store_names,
        roleLabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [employees, roleFilter, statusFilter, employeeListSearch]);
  
  // Log filtered employees for debugging
  useEffect(() => {
    console.log('[Frontend] Filtered employees count:', filteredEmployees.length);
    console.log('[Frontend] Filtered employees:', filteredEmployees.map(e => `${e.username} (${e.role}, active: ${e.is_active})`));
  }, [filteredEmployees]);

  // Separate active and inactive employees for display
  const activeEmployees = employees.filter(emp => emp.is_active === 1 || emp.is_active === true);
  const inactiveEmployees = employees.filter(emp => emp.is_active === 0 || emp.is_active === false);

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

  const stores = storesData?.stores || [];

  // Parse work shift from stored format (e.g., "Morning (08:00 - 16:00)" or JSON)
  const parseWorkShift = (workShiftString) => {
    if (!workShiftString) return { name: '', start: '', end: '' };
    
    // Try to parse as JSON first
    try {
      const parsed = JSON.parse(workShiftString);
      if (parsed.name || parsed.start || parsed.end) {
        return {
          name: parsed.name || '',
          start: parsed.start || '',
          end: parsed.end || ''
        };
      }
    } catch (e) {
      // Not JSON, try parsing format like "Morning (08:00 - 16:00)"
      const match = workShiftString.match(/^(.+?)\s*\((\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\)$/);
      if (match) {
        return {
          name: match[1].trim(),
          start: match[2],
          end: match[3]
        };
      }
      // If no format matches, assume it's just a name
      return { name: workShiftString, start: '', end: '' };
    }
    
    return { name: '', start: '', end: '' };
  };

  // Format work shift for storage
  const formatWorkShift = (name, start, end) => {
    if (!name && !start && !end) return null;
    if (start && end) {
      return JSON.stringify({ name: name || '', start, end });
    }
    if (name) {
      return name;
    }
    return null;
  };

  const handleOpenModal = (employee = null) => {
    logButtonClick('Open Employee Modal', employee ? 'Edit Employee' : 'Add Employee');
    setEditingEmployee(employee);
    if (employee) {
      const roleValue = employee.role || 'cashier';
      const roleLabel = predefinedRoles.find(r => r.value === roleValue)?.label || roleValue;
      const workShift = parseWorkShift(employee.work_shift || '');
      let permissions = [];
      if (employee.permissions) {
        try {
          permissions = JSON.parse(employee.permissions);
        } catch (e) {
          permissions = employee.permissions.split(',').filter(p => p.trim());
        }
      }
      setFormData({
        username: employee.username || '',
        email: employee.email || '',
        password: '',
        newPassword: '',
        confirmNewPassword: '',
        fullName: employee.full_name || employee.fullName || '',
        role: roleValue,
        storeIds: employee.store_ids ? employee.store_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [],
        salary: employee.salary || '',
        workShiftName: workShift.name,
        workShiftStart: workShift.start,
        workShiftEnd: workShift.end,
        hireDate: employee.hire_date ? employee.hire_date.split('T')[0] : '',
        permissions: permissions
      });
      setRoleInputValue(roleLabel);
    } else {
      const defaultStoreIds =
        !isSuperAdmin() && isAdmin() && store?.id ? [store.id] : [];
      setFormData({
        username: '',
        email: '',
        password: '',
        newPassword: '',
        confirmNewPassword: '',
        fullName: '',
        role: 'cashier',
        storeIds: defaultStoreIds,
        salary: '',
        workShiftName: '',
        workShiftStart: '',
        workShiftEnd: '',
        hireDate: '',
        permissions: []
      });
      setRoleInputValue('Cashier');
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingEmployee(null);
    setRoleSelectDropdownOpen(false);
    setRoleInputValue('');
    setFormData({
      username: '',
      email: '',
      password: '',
      newPassword: '',
      confirmNewPassword: '',
      fullName: '',
      role: 'cashier',
      storeIds: [],
      salary: '',
      workShiftName: '',
      workShiftStart: '',
      workShiftEnd: '',
      hireDate: '',
      permissions: []
    });
  };

  const createEmployeeMutation = useMutation({
    mutationFn: async (data) => {
      const response = await apiFetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create employee');
      }
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
      await queryClient.refetchQueries({ queryKey: ['employees', authUser?.id, store?.id] });
      toast.success('Employee created successfully');
      handleCloseModal();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create employee');
    },
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: async (data) => {
      const response = await apiFetch(`/api/auth/users/${editingEmployee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update employee');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees', authUser?.id, store?.id] });
      queryClient.invalidateQueries({ queryKey: ['employees'] }); // Also invalidate base key for compatibility
      toast.success('Employee updated successfully');
      handleCloseModal();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update employee');
    },
  });

  /** @param {Record<string, unknown>} data */
  const appendPasswordForEdit = (data) => {
    if (!editingEmployee) return true;
    const np = String(formData.newPassword || '').trim();
    if (!np) return true;
    if (np.length < 8) {
      toast.error('New password must be at least 8 characters');
      return false;
    }
    if (np !== String(formData.confirmNewPassword || '').trim()) {
      toast.error('New password and confirmation do not match');
      return false;
    }
    data.password = np;
    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.fullName || !formData.username || !formData.email || !formData.role) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!editingEmployee && !formData.password) {
      toast.error('Password is required when creating a new employee');
      return;
    }
    
    // Check if a new role was typed
    const trimmedValue = roleInputValue.trim();
    if (trimmedValue) {
      const isExistingRole = predefinedRoles.some(r => 
        r.value.toLowerCase() === trimmedValue.toLowerCase() || 
        r.label.toLowerCase() === trimmedValue.toLowerCase()
      );
      
      if (!isExistingRole && trimmedValue !== formData.role) {
        setPendingNewRole(trimmedValue);
        setPendingFieldChange(() => () => {
          // After role confirmation, show create confirmation
          const data = {
            username: formData.username,
            email: formData.email,
            fullName: formData.fullName,
            role: pendingNewRole.toLowerCase().replace(/\s+/g, '_'),
            storeIds: formData.storeIds,
            salary: formData.salary ? parseFloat(formData.salary) : null,
            workShift: formatWorkShift(formData.workShiftName, formData.workShiftStart, formData.workShiftEnd),
            hireDate: formData.hireDate || null,
            permissions: [...formData.permissions],
          };

          if (!editingEmployee && formData.password) {
            data.password = formData.password;
          }

          if (editingEmployee) {
            // For updates, require password confirmation
            requirePassword('update', () => {
              if (!appendPasswordForEdit(data)) return;
              updateEmployeeMutation.mutate(data);
            }, { 
              action: 'update_employee',
              employee_name: formData.fullName 
            });
          } else {
            // For creates, show confirmation modal first
            setPendingCreateData(data);
            setShowCreateConfirmModal(true);
          }
        });
        setShowNewRoleConfirmModal(true);
        return;
      }
    }
    
    // Prepare data
    const data = {
      username: formData.username,
      email: formData.email,
      fullName: formData.fullName,
      role: formData.role,
      storeIds: formData.storeIds,
      salary: formData.salary ? parseFloat(formData.salary) : null,
      workShift: formatWorkShift(formData.workShiftName, formData.workShiftStart, formData.workShiftEnd),
      hireDate: formData.hireDate || null,
      permissions: [...formData.permissions],
    };

    if (!editingEmployee && formData.password) {
      data.password = formData.password;
    }

    if (editingEmployee) {
      // For updates, require password confirmation
      requirePassword('update', () => {
        logButtonClick('Submit Employee Form', 'Update Employee');
        if (!appendPasswordForEdit(data)) return;
        updateEmployeeMutation.mutate(data);
      }, { 
        action: 'update_employee',
        employee_name: formData.fullName 
      });
    } else {
      // For creates, show confirmation modal first
      setPendingCreateData(data);
      setShowCreateConfirmModal(true);
    }
  };

  const confirmCreateEmployee = () => {
    const payload = pendingCreateData;
    if (!payload) return;

    setShowCreateConfirmModal(false);

    requirePassword(
      'create',
      () => {
        logButtonClick('Submit Employee Form', 'Create Employee');
        createEmployeeMutation.mutate(payload);
        setPendingCreateData(null);
      },
      {
        action: 'create_employee',
        employee_name: payload.fullName || formData.fullName,
      }
    );
  };

  const handleDelete = (employee) => {
    requirePassword('delete', () => {
      setEmployeeToDelete(employee);
      setShowDeleteModal(true);
    }, { employee_id: employee.id, employee_name: employee.full_name || employee.fullName || employee.username });
  };

  const confirmDelete = async () => {
    if (!employeeToDelete) return;

    try {
      const response = await apiFetch(`/api/auth/users/${employeeToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete employee');
      }

      queryClient.invalidateQueries({ queryKey: ['employees', authUser?.id, store?.id] });
      queryClient.invalidateQueries({ queryKey: ['employees'] }); // Also invalidate base key for compatibility
      toast.success('Employee deleted successfully');
      setEmployeeToDelete(null);
    } catch (error) {
      toast.error(error.message || 'Failed to delete employee');
    }
  };

  const handleToggleStatus = (employee) => {
    requirePassword('deactivate', () => {
      setEmployeeToToggle(employee);
      setShowToggleStatusModal(true);
    }, { employee_id: employee.id, employee_name: employee.full_name || employee.fullName || employee.username });
  };

  const handleChangeRole = (employee) => {
    requirePassword('update', () => {
      setEmployeeToChangeRole(employee);
      setNewRole(employee.role || 'cashier');
      setShowRoleChangeModal(true);
    }, { employee_id: employee.id, employee_name: employee.full_name || employee.fullName || employee.username });
  };

  const confirmRoleChange = async () => {
    if (!employeeToChangeRole || !newRole) return;

    try {
      const response = await apiFetch(`/api/auth/users/${employeeToChangeRole.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          role: newRole,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update employee role');
      }

      queryClient.invalidateQueries({ queryKey: ['employees', authUser?.id, store?.id] });
      queryClient.invalidateQueries({ queryKey: ['employees'] }); // Also invalidate base key for compatibility
      const oldRole = employeeToChangeRole.role || 'cashier';
      const isUpgrade = (roleHierarchy[newRole] || 0) > (roleHierarchy[oldRole] || 0);
      toast.success(`Employee role ${isUpgrade ? 'upgraded' : 'downgraded'} from ${oldRole} to ${newRole}`);
      setEmployeeToChangeRole(null);
      setNewRole('');
      setShowRoleChangeModal(false);
    } catch (error) {
      toast.error(error.message || 'Failed to update employee role');
    }
  };

  const confirmToggleStatus = async () => {
    if (!employeeToToggle) return;

    try {
      const response = await apiFetch(`/api/auth/users/${employeeToToggle.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          isActive: !employeeToToggle.is_active,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update employee status');
      }

      queryClient.invalidateQueries({ queryKey: ['employees', authUser?.id, store?.id] });
      queryClient.invalidateQueries({ queryKey: ['employees'] }); // Also invalidate base key for compatibility
      toast.success(`Employee ${employeeToToggle.is_active ? 'deactivated' : 'activated'} successfully`);
      setEmployeeToToggle(null);
    } catch (error) {
      toast.error(error.message || 'Failed to update employee status');
    }
  };

  const handleExport = () => {
    setShowExportModal(true);
  };

  const performExport = async () => {
    if (!filteredEmployees.length) {
      toast.error('No employees to export for the current filters.');
      setShowExportModal(false);
      return;
    }
    const data = filteredEmployees.map(emp => ({
      'Full Name': emp.full_name || emp.fullName || '',
      'Username': emp.username || '',
      'Email': emp.email || '',
      'Role': emp.role || '',
      'Store(s)': emp.store_names || '',
      'Salary': emp.salary ? `$${parseFloat(emp.salary).toFixed(2)}` : '$0.00',
      'Work Shift': formatWorkShiftDisplay(emp.work_shift) || 'N/A',
      'Hire Date': emp.hire_date ? new Date(emp.hire_date).toLocaleDateString() : 'N/A',
      'Status': emp.is_active ? 'Active' : 'Inactive',
      'Created At': emp.created_at ? new Date(emp.created_at).toLocaleDateString() : 'N/A'
    }));

    if (exportFormat === 'csv') {
      const headers = Object.keys(data[0] || {});
      const csv = [
        headers.join(','),
        ...data.map(row => headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(','))
      ].join('\n');
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const filename = `employees_${new Date().toISOString().split('T')[0]}.csv`;
      await saveFile(blob, filename);
    } else {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const filename = `employees_${new Date().toISOString().split('T')[0]}.json`;
      await saveFile(blob, filename);
    }

    setShowExportModal(false);
    toast.success(`Employees exported as ${exportFormat.toUpperCase()}`);
  };

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00';
    return `$${parseFloat(amount).toFixed(2)}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  // Format work shift for display
  const formatWorkShiftDisplay = (workShiftString) => {
    if (!workShiftString) return '';
    
    const parsed = parseWorkShift(workShiftString);
    if (parsed.start && parsed.end) {
      return parsed.name 
        ? `${parsed.name} (${parsed.start} - ${parsed.end})`
        : `${parsed.start} - ${parsed.end}`;
    }
    return parsed.name || workShiftString;
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-gradient-to-br from-background via-background-secondary to-background">
      <div className="flex-shrink-0 px-4 pb-3 pt-6 sm:px-6">
          {/* Header */}
          <div className="mb-4 flex flex-col gap-3 sm:mb-0 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-analytics-primary mb-2">Employee Management</h1>
              <p className="text-analytics-secondary">Manage employees, their roles, and employee information</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="glass-button px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 min-h-10"
              >
                <Download size={16} />
                <span className="hidden sm:inline">Export</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenModal()}
                className="glass-button bg-analytics-revenue hover:bg-analytics-revenue/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 min-h-10"
              >
                <Plus size={16} />
                <span>Add Employee</span>
              </button>
            </div>
          </div>
      </div>

      <div className="flex-shrink-0 px-4 pb-3 sm:px-6">
          {/* Filters */}
          <div className="glass-card flex flex-col gap-3 p-4">
            <div className="flex min-w-0 items-center gap-2">
              <Search size={16} className="shrink-0 text-analytics-secondary" />
              <label htmlFor="employee-mgmt-search" className="sr-only">
                Search employees
              </label>
              <input
                id="employee-mgmt-search"
                type="search"
                value={employeeListSearch}
                onChange={(e) => setEmployeeListSearch(e.target.value)}
                placeholder="Search by name, username, email, store, or role…"
                className="glass-button min-h-10 w-full min-w-0 flex-1 rounded-lg px-3 py-2 text-sm text-analytics-primary placeholder:text-analytics-secondary/70"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex gap-3">
              <div className="relative">
                <button
                  ref={roleButtonRef}
                  onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
                  className="glass-button px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 min-w-[150px]"
                >
                  <Filter size={16} />
                  <span>{roleOptions.find(r => r.value === roleFilter)?.label || 'All Roles'}</span>
                  <ChevronDown size={16} className={roleDropdownOpen ? 'rotate-180' : ''} />
                </button>
              
              {roleDropdownOpen && createPortal(
                <div
                  data-role-dropdown
                  ref={roleDropdownRef}
                  style={{
                    position: 'fixed',
                    top: `${roleDropdownPosition.top}px`,
                    right: `${roleDropdownPosition.right}px`,
                    width: `${roleDropdownPosition.width}px`,
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
                    maxHeight: '200px',
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
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                        roleFilter === option.value
                          ? 'bg-analytics-revenue text-white'
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
              
              {/* Status Filter */}
              <div className="flex gap-2">
                <button
                  onClick={() => setStatusFilter('active')}
                  className={`glass-button px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    statusFilter === 'active' ? 'bg-analytics-revenue text-white' : ''
                  }`}
                >
                  Active ({activeEmployees.length})
                </button>
                <button
                  onClick={() => setStatusFilter('inactive')}
                  className={`glass-button px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    statusFilter === 'inactive' ? 'bg-red-500/20 text-red-400' : ''
                  }`}
                >
                  Deactivated/Fired ({inactiveEmployees.length})
                </button>
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`glass-button px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    statusFilter === 'all' ? 'bg-analytics-revenue text-white' : ''
                  }`}
                >
                  All ({employees.length})
                </button>
              </div>
            </div>
            </div>
          </div>
      </div>

          {/* Error Message */}
          {employeesError && (
            <div className="mx-4 mb-3 flex-shrink-0 rounded-lg border border-red-500/20 bg-red-500/10 p-4 sm:mx-6">
              <p className="text-red-500">Error: {employeesError.message}</p>
            </div>
          )}

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-6">
          {/* Employees Table */}
          <div className="glass-card flex min-h-0 flex-1 flex-col overflow-hidden p-6">
            {isLoading ? (
              <div className="text-center py-12">
                <p className="text-analytics-secondary">Loading employees...</p>
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-analytics-secondary">
                  {employeeListSearch.trim()
                    ? `No employees match “${employeeListSearch.trim()}”. Try another search or clear the search box.`
                    : employees.length > 0
                      ? 'No employees match the current filters.'
                      : 'No employees found.'}
                </p>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
              <div className="min-w-0 overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-analytics-primary">Full Name</th>
                      <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-analytics-primary hidden md:table-cell">Username</th>
                      <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-analytics-primary hidden lg:table-cell">Email</th>
                      <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-analytics-primary">Role</th>
                      <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-analytics-primary hidden lg:table-cell">Store(s)</th>
                      <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-analytics-primary">Salary</th>
                      <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-analytics-primary hidden md:table-cell">Work Shift</th>
                      <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-analytics-primary hidden md:table-cell">Hire Date</th>
                      <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-analytics-primary">Status</th>
                      <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-analytics-primary">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((employee) => (
                      <tr 
                        key={employee.id} 
                        className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                        onClick={(e) => {
                          // Don't open modal if clicking on action buttons
                          const target = e.target;
                          const isActionButton = target.closest('button') || target.closest('svg') || target.closest('[data-action-button]');
                          if (!isActionButton) {
                            setSelectedEmployee(employee);
                            setShowDetailsModal(true);
                            logButtonClick('View Employee Details', `View details for: ${employee.full_name || employee.fullName || employee.username}`);
                          }
                        }}
                      >
                        <td className="py-3 px-4 text-sm text-analytics-secondary whitespace-nowrap">
                          {employee.full_name || employee.fullName || employee.username}
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-sm text-analytics-secondary whitespace-nowrap hidden md:table-cell">
                          {employee.username}
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-sm text-analytics-secondary whitespace-nowrap hidden lg:table-cell">
                          {employee.email}
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-sm text-analytics-secondary whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            employee.role === 'admin' ? 'bg-blue-500/20 text-blue-400' :
                            employee.role === 'cashier' ? 'bg-green-500/20 text-green-400' :
                            employee.role === 'manager' ? 'bg-purple-500/20 text-purple-400' :
                            employee.role === 'supervisor' ? 'bg-yellow-500/20 text-yellow-400' :
                            employee.role === 'assistant_manager' ? 'bg-indigo-500/20 text-indigo-400' :
                            employee.role === 'sales_associate' ? 'bg-cyan-500/20 text-cyan-400' :
                            employee.role === 'inventory_clerk' ? 'bg-orange-500/20 text-orange-400' :
                            employee.role === 'security' ? 'bg-red-500/20 text-red-400' :
                            employee.role === 'maintenance' ? 'bg-gray-500/20 text-gray-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {predefinedRoles.find(r => r.value === employee.role)?.label || 
                             employee.role.charAt(0).toUpperCase() + employee.role.slice(1).replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-sm text-analytics-secondary whitespace-nowrap hidden lg:table-cell">
                          {employee.store_names || 'N/A'}
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-sm text-analytics-secondary whitespace-nowrap">
                          {formatCurrency(employee.salary)}
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-sm text-analytics-secondary whitespace-nowrap hidden md:table-cell">
                          {formatWorkShiftDisplay(employee.work_shift) || 'N/A'}
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-sm text-analytics-secondary whitespace-nowrap hidden md:table-cell">
                          {formatDate(employee.hire_date)}
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-sm whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            employee.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {employee.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-3 px-2 sm:px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0" data-action-button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEmployee(employee);
                                setShowDetailsModal(true);
                                logButtonClick('View Employee Details', `View details for: ${employee.full_name || employee.fullName || employee.username}`);
                              }}
                              className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg transition-colors"
                              title="View Details"
                            >
                              <Eye size={16} className="text-cyan-400" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenModal(employee);
                              }}
                              className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Edit2 size={16} className="text-blue-400" />
                            </button>
                            {(isSuperAdmin() || (isAdmin() && employee.role !== 'super_admin')) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleChangeRole(employee);
                                }}
                                className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg transition-colors"
                                title="Change Role"
                              >
                                {(roleHierarchy[employee.role] || 0) < 7 ? (
                                  <ArrowUp size={16} className="text-purple-400" />
                                ) : (
                                  <ArrowDown size={16} className="text-orange-400" />
                                )}
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleStatus(employee);
                              }}
                              className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg transition-colors"
                              title={employee.is_active ? 'Deactivate' : 'Activate'}
                            >
                              {employee.is_active ? (
                                <PowerOff size={16} className="text-yellow-400" />
                              ) : (
                                <Power size={16} className="text-green-400" />
                              )}
                            </button>
                            {(isSuperAdmin() || (isAdmin() && employee.role === 'cashier')) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(employee);
                                }}
                                className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={16} className="text-red-400" />
                              </button>
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

      {/* Add/Edit Employee Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseModal}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100040]"
            />
            <div className="fixed inset-0 z-[100040] flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="glass-card-pro p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto pointer-events-auto"
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-analytics-primary">
                    {editingEmployee ? 'Edit Employee' : 'Add Employee'}
                  </h2>
                  <button
                    onClick={handleCloseModal}
                    className="text-analytics-secondary hover:text-analytics-primary transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-analytics-primary mb-2">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        value={formData.fullName}
                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                        className="w-full glass-button px-4 py-2 rounded-lg text-analytics-secondary"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-analytics-primary mb-2">
                        Username *
                      </label>
                      <input
                        type="text"
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        className="w-full glass-button px-4 py-2 rounded-lg text-analytics-secondary"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-analytics-primary mb-2">
                        Email *
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full glass-button px-4 py-2 rounded-lg text-analytics-secondary"
                        required
                      />
                    </div>

                    {!editingEmployee && (
                      <div>
                        <label className="block text-sm font-medium text-analytics-primary mb-2">
                          Password *
                        </label>
                        <input
                          type="password"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          className="w-full glass-button px-4 py-2 rounded-lg text-analytics-secondary"
                          required={!editingEmployee}
                        />
                      </div>
                    )}

                    {editingEmployee && (
                      <>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-analytics-primary mb-2">
                            New password (optional — leave blank to keep current)
                          </label>
                          <input
                            type="password"
                            value={formData.newPassword}
                            onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                            className="w-full glass-button px-4 py-2 rounded-lg text-analytics-secondary"
                            autoComplete="new-password"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-analytics-primary mb-2">
                            Confirm new password
                          </label>
                          <input
                            type="password"
                            value={formData.confirmNewPassword}
                            onChange={(e) => setFormData({ ...formData, confirmNewPassword: e.target.value })}
                            className="w-full glass-button px-4 py-2 rounded-lg text-analytics-secondary"
                            autoComplete="new-password"
                          />
                          <p className="text-xs text-analytics-secondary mt-1">
                            Super admins may reset passwords for any user. Store admins may reset passwords for users in
                            their store (not other admins or super admins).
                          </p>
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-analytics-primary mb-2">
                        Role *
                      </label>
                      <div className="relative">
                        <button
                          ref={roleSelectButtonRef}
                          type="button"
                          onClick={() => {
                            setRoleSelectDropdownOpen(!roleSelectDropdownOpen);
                            if (!roleSelectDropdownOpen && roleInputRef.current) {
                              setTimeout(() => roleInputRef.current?.focus(), 100);
                            }
                          }}
                          className="w-full glass-button px-4 py-2 rounded-lg text-analytics-secondary text-left flex items-center justify-between"
                        >
                          <span className={roleInputValue ? 'text-analytics-primary' : 'text-analytics-secondary'}>
                            {roleInputValue || predefinedRoles.find(r => r.value === formData.role)?.label || 'Select Role'}
                          </span>
                          <ChevronDown size={16} className={roleSelectDropdownOpen ? 'rotate-180' : ''} />
                        </button>
                        
                        {roleSelectDropdownOpen && createPortal(
                          <div
                            data-role-select-dropdown
                            ref={roleSelectDropdownRef}
                            style={{
                              position: 'fixed',
                              top: `${roleSelectDropdownPosition.top + 8}px`,
                              right: `${roleSelectDropdownPosition.right}px`,
                              width: `${Math.max(roleSelectDropdownPosition.width, 200)}px`,
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
                              padding: '8px',
                              maxHeight: '300px',
                              overflowY: 'auto',
                              overflowX: 'hidden'
                            }}>
                            {/* Input for typing new role */}
                            <div className="mb-2 pb-2 border-b border-white/10">
                              <input
                                ref={roleInputRef}
                                type="text"
                                value={roleInputValue}
                                onChange={(e) => handleRoleInputChange(e.target.value)}
                                onBlur={() => {
                                  setTimeout(() => {
                                    if (!roleSelectDropdownOpen) {
                                      checkForNewRole();
                                    }
                                  }, 200);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const trimmedValue = roleInputValue.trim();
                                    if (trimmedValue) {
                                      const matchedRole = predefinedRoles.find(r => 
                                        r.value.toLowerCase() === trimmedValue.toLowerCase() || 
                                        r.label.toLowerCase() === trimmedValue.toLowerCase()
                                      );
                                      if (matchedRole) {
                                        handleRoleSelect(matchedRole.value);
                                      } else {
                                        checkForNewRole();
                                      }
                                    }
                                  }
                                  if (e.key === 'Escape') {
                                    setRoleSelectDropdownOpen(false);
                                  }
                                }}
                                placeholder="Type to search or create new role..."
                                className="w-full glass-button px-3 py-2 rounded-lg text-sm text-analytics-secondary"
                                autoFocus
                              />
                            </div>
                            
                            {/* Predefined roles list */}
                            <div className="space-y-1">
                              {predefinedRoles.map((role) => (
                                <button
                                  key={role.value}
                                  type="button"
                                  onClick={() => handleRoleSelect(role.value)}
                                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                                    formData.role === role.value
                                      ? 'bg-analytics-revenue text-white'
                                      : 'text-analytics-secondary hover:bg-white/10'
                                  }`}
                                >
                                  {role.label}
                                </button>
                              ))}
                            </div>
                            </div>
                          </div>,
                          document.body
                        )}
                      </div>
                    </div>

                    {isSuperAdmin() && stores.length > 0 && formData.role !== 'super_admin' && (
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-analytics-primary mb-2">
                          Store(s)
                        </label>
                        <div className="space-y-2 max-h-32 overflow-y-auto category-dropdown-scroll">
                          {stores.map((st) => (
                            <label key={st.id} className="flex items-center gap-2 glass-button px-4 py-2 rounded-lg cursor-pointer hover:bg-white/10">
                              <input
                                type="checkbox"
                                checked={formData.storeIds.includes(st.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData({ ...formData, storeIds: [...formData.storeIds, st.id] });
                                  } else {
                                    setFormData({ ...formData, storeIds: formData.storeIds.filter(id => id !== st.id) });
                                  }
                                }}
                                className="rounded"
                              />
                              <span className="text-analytics-secondary">{st.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {isAdmin() && !isSuperAdmin() && store?.id && formData.role !== 'super_admin' && (
                      <div className="md:col-span-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-sm text-analytics-secondary">
                          New employees are assigned to your store: <strong className="text-analytics-primary">{store.name || 'Current store'}</strong>
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-analytics-primary mb-2">
                        Salary
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.salary}
                        onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                        className="w-full glass-button px-4 py-2 rounded-lg text-analytics-secondary"
                        placeholder="0.00"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-analytics-primary mb-2">
                        Work Shift
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-analytics-secondary mb-1">
                            Shift Name
                          </label>
                          <input
                            type="text"
                            value={formData.workShiftName}
                            onChange={(e) => setFormData({ ...formData, workShiftName: e.target.value })}
                            className="w-full glass-button px-4 py-2 rounded-lg text-analytics-secondary text-sm"
                            placeholder="e.g., Morning, Afternoon, Night"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-analytics-secondary mb-1">
                            Start Time
                          </label>
                          <input
                            type="time"
                            value={formData.workShiftStart}
                            onChange={(e) => setFormData({ ...formData, workShiftStart: e.target.value })}
                            className="w-full glass-button px-4 py-2 rounded-lg text-analytics-secondary text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-analytics-secondary mb-1">
                            End Time
                          </label>
                          <input
                            type="time"
                            value={formData.workShiftEnd}
                            onChange={(e) => setFormData({ ...formData, workShiftEnd: e.target.value })}
                            className="w-full glass-button px-4 py-2 rounded-lg text-analytics-secondary text-sm"
                          />
                        </div>
                      </div>
                      {formData.workShiftName && formData.workShiftStart && formData.workShiftEnd && (
                        <p className="mt-2 text-xs text-analytics-secondary">
                          Preview: {formatWorkShiftDisplay(formatWorkShift(formData.workShiftName, formData.workShiftStart, formData.workShiftEnd))}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-analytics-primary mb-2">
                        Hire Date
                      </label>
                      <input
                        type="date"
                        value={formData.hireDate}
                        onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                        className="w-full glass-button px-4 py-2 rounded-lg text-analytics-secondary"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-analytics-primary mb-2">
                        Permissions & Access Control
                      </label>
                      <p className="text-xs text-analytics-secondary mb-3">
                        Select what this employee can access and modify:
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto category-dropdown-scroll p-2 glass-card">
                        {availablePermissions.map((permission) => (
                          <label
                            key={permission.id}
                            className="flex items-start gap-2 p-2 rounded-lg cursor-pointer hover:bg-white/10 transition-colors"
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
                              className="mt-1 rounded"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-analytics-primary">
                                {permission.label}
                              </div>
                              <div className="text-xs text-analytics-secondary">
                                {permission.description}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="glass-button px-6 py-2 rounded-lg text-sm font-medium transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="glass-button bg-analytics-revenue hover:bg-analytics-revenue/90 text-white px-6 py-2 rounded-lg text-sm font-medium transition-all"
                    >
                      {editingEmployee ? 'Update Employee' : 'Create Employee'}
                    </button>
                  </div>
                </form>
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
          setEmployeeToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Delete Employee"
        message={employeeToDelete ? `Are you sure you want to delete "${employeeToDelete.full_name || employeeToDelete.fullName || employeeToDelete.username}"? This action cannot be undone.` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        type="delete"
      />

      {/* Toggle Status Confirmation Modal */}
      <ConfirmationModal
        isOpen={showToggleStatusModal}
        onClose={() => {
          setShowToggleStatusModal(false);
          setEmployeeToToggle(null);
        }}
        onConfirm={confirmToggleStatus}
        title={employeeToToggle?.is_active ? 'Deactivate Employee' : 'Activate Employee'}
        message={employeeToToggle ? `Are you sure you want to ${employeeToToggle.is_active ? 'deactivate' : 'activate'} "${employeeToToggle.full_name || employeeToToggle.fullName || employeeToToggle.username}"?` : ''}
        confirmText={employeeToToggle?.is_active ? 'Deactivate' : 'Activate'}
        cancelText="Cancel"
        type="warning"
      />

      {/* New Role Confirmation Modal */}
      <ConfirmationModal
        isOpen={showNewRoleConfirmModal}
        onClose={cancelNewRole}
        onConfirm={confirmNewRole}
        title="Create New Employee Role"
        message={pendingNewRole ? `You are about to create a new employee role: "${pendingNewRole}". This role will be saved and can be used for future employees. Do you want to continue?` : ''}
        confirmText="Create Role"
        cancelText="Cancel"
        type="warning"
        stackZIndexClass="z-[100050]"
      />

      {/* Create Employee Confirmation Modal */}
      <ConfirmationModal
        isOpen={showCreateConfirmModal}
        onClose={() => {
          setShowCreateConfirmModal(false);
          setPendingCreateData(null);
        }}
        onConfirm={confirmCreateEmployee}
        title="Create Employee"
        message={formData.fullName ? `Are you sure you want to create a new employee "${formData.fullName}"?` : 'Are you sure you want to create a new employee?'}
        confirmText="Create"
        cancelText="Cancel"
        type="info"
        stackZIndexClass="z-[100050]"
      />

      {/* Admin / super admin password — must sit above add-employee modal (z-[100040]) */}
      <ConfirmationModal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          clearPasswordPendingAction(null);
          setPassword('');
        }}
        onConfirm={handlePasswordConfirm}
        title="Confirm with your password"
        message="Enter your admin or super admin account password to create this employee."
        confirmText="Verify & create"
        cancelText="Cancel"
        type="info"
        stackZIndexClass="z-[100060]"
        requirePassword
        password={password}
        setPassword={setPassword}
        disabled={!password?.trim()}
      />

      {/* Role Change Modal */}
      <AnimatePresence>
        {showRoleChangeModal && employeeToChangeRole && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRoleChangeModal(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="glass-card-pro p-6 max-w-md w-full"
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-analytics-primary">
                    Change Employee Role
                  </h3>
                  <button
                    onClick={() => {
                      setShowRoleChangeModal(false);
                      setEmployeeToChangeRole(null);
                      setNewRole('');
                    }}
                    className="text-analytics-secondary hover:text-analytics-primary transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                
                <div className="mb-4">
                  <p className="text-sm text-analytics-secondary mb-2">
                    Employee: <span className="font-medium text-analytics-primary">{employeeToChangeRole.full_name || employeeToChangeRole.fullName || employeeToChangeRole.username}</span>
                  </p>
                  <p className="text-sm text-analytics-secondary mb-4">
                    Current Role: <span className="font-medium text-analytics-primary">{predefinedRoles.find(r => r.value === employeeToChangeRole.role)?.label || employeeToChangeRole.role}</span>
                  </p>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-analytics-primary mb-2">
                    New Role *
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full glass-button px-4 py-2 rounded-lg text-analytics-secondary"
                    required
                  >
                    {predefinedRoles.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                  {newRole && employeeToChangeRole.role && (
                    <p className="mt-2 text-xs text-analytics-secondary">
                      {(roleHierarchy[newRole] || 0) > (roleHierarchy[employeeToChangeRole.role] || 0) ? (
                        <span className="text-green-400">↑ This is an upgrade</span>
                      ) : (roleHierarchy[newRole] || 0) < (roleHierarchy[employeeToChangeRole.role] || 0) ? (
                        <span className="text-orange-400">↓ This is a downgrade</span>
                      ) : (
                        <span className="text-blue-400">= Same level</span>
                      )}
                    </p>
                  )}
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowRoleChangeModal(false);
                      setEmployeeToChangeRole(null);
                      setNewRole('');
                    }}
                    className="glass-button px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmRoleChange}
                    className="glass-button bg-analytics-revenue hover:bg-analytics-revenue/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  >
                    Confirm Change
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Employee Details Modal */}
      <AnimatePresence>
        {showDetailsModal && selectedEmployee && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDetailsModal(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="glass-card-pro p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-analytics-primary">
                    Employee Details
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEmployeeExportFormat('csv');
                        setShowEmployeeExportModal(true);
                      }}
                      className="glass-button px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
                      title="Export Details"
                    >
                      <Download size={16} />
                      <span className="hidden sm:inline">Export</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowDetailsModal(false);
                        setSelectedEmployee(null);
                      }}
                      className="text-analytics-secondary hover:text-analytics-primary transition-colors"
                    >
                      <X size={24} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Personal Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-analytics-primary border-b border-white/10 pb-2">
                      Personal Information
                    </h3>
                    <div>
                      <label className="text-xs text-analytics-secondary">Full Name</label>
                      <p className="text-sm text-analytics-primary font-medium">
                        {selectedEmployee.full_name || selectedEmployee.fullName || selectedEmployee.username}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-analytics-secondary">Username</label>
                      <p className="text-sm text-analytics-primary font-medium">
                        {selectedEmployee.username}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-analytics-secondary">Email</label>
                      <p className="text-sm text-analytics-primary font-medium">
                        {selectedEmployee.email || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-analytics-secondary">Role</label>
                      <p className="text-sm text-analytics-primary font-medium">
                        {predefinedRoles.find(r => r.value === selectedEmployee.role)?.label || selectedEmployee.role}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-analytics-secondary">Status</label>
                      <p className="text-sm">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          selectedEmployee.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {selectedEmployee.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Employment Details */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-analytics-primary border-b border-white/10 pb-2">
                      Employment Details
                    </h3>
                    <div>
                      <label className="text-xs text-analytics-secondary">Store(s)</label>
                      <p className="text-sm text-analytics-primary font-medium">
                        {selectedEmployee.store_names || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-analytics-secondary">Salary</label>
                      <p className="text-sm text-analytics-primary font-medium">
                        {formatCurrency(selectedEmployee.salary)}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-analytics-secondary">Work Shift</label>
                      <p className="text-sm text-analytics-primary font-medium">
                        {formatWorkShiftDisplay(selectedEmployee.work_shift) || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-analytics-secondary">Hire Date</label>
                      <p className="text-sm text-analytics-primary font-medium">
                        {formatDate(selectedEmployee.hire_date)}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-analytics-secondary">Created At</label>
                      <p className="text-sm text-analytics-primary font-medium">
                        {formatDate(selectedEmployee.created_at)}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-analytics-secondary">Updated At</label>
                      <p className="text-sm text-analytics-primary font-medium">
                        {formatDate(selectedEmployee.updated_at)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Permissions */}
                {selectedEmployee.permissions && (
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold text-analytics-primary border-b border-white/10 pb-2 mb-4">
                      Permissions & Access
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {(() => {
                        let employeePermissions = [];
                        try {
                          employeePermissions = JSON.parse(selectedEmployee.permissions);
                        } catch (e) {
                          employeePermissions = selectedEmployee.permissions.split(',').filter(p => p.trim());
                        }
                        return employeePermissions.length > 0 ? (
                          employeePermissions.map((permId) => {
                            const permission = availablePermissions.find(p => p.id === permId);
                            return permission ? (
                              <div key={permId} className="glass-card p-3 rounded-lg">
                                <div className="text-sm font-medium text-analytics-primary">
                                  {permission.label}
                                </div>
                                <div className="text-xs text-analytics-secondary mt-1">
                                  {permission.description}
                                </div>
                              </div>
                            ) : null;
                          })
                        ) : (
                          <p className="text-sm text-analytics-secondary">No specific permissions assigned</p>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Employee Export Format Modal */}
      <AnimatePresence>
        {showEmployeeExportModal && selectedEmployee && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEmployeeExportModal(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
            />
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="glass-card-pro p-6 max-w-md w-full"
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-analytics-primary">Export Employee Details</h3>
                  <button
                    onClick={() => setShowEmployeeExportModal(false)}
                    className="text-analytics-secondary hover:text-analytics-primary transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                <p className="text-sm text-analytics-secondary mb-4">Select export format:</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 glass-button px-4 py-2 rounded-lg cursor-pointer hover:bg-white/10">
                    <input
                      type="radio"
                      value="csv"
                      checked={employeeExportFormat === 'csv'}
                      onChange={(e) => setEmployeeExportFormat(e.target.value)}
                      className="rounded"
                    />
                    <span className="text-analytics-secondary">CSV</span>
                  </label>
                  <label className="flex items-center gap-2 glass-button px-4 py-2 rounded-lg cursor-pointer hover:bg-white/10">
                    <input
                      type="radio"
                      value="json"
                      checked={employeeExportFormat === 'json'}
                      onChange={(e) => setEmployeeExportFormat(e.target.value)}
                      className="rounded"
                    />
                    <span className="text-analytics-secondary">JSON</span>
                  </label>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowEmployeeExportModal(false)}
                    className="glass-button px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      // Export employee details
                      let employeePermissions = [];
                      try {
                        employeePermissions = JSON.parse(selectedEmployee.permissions || '[]');
                      } catch (e) {
                        employeePermissions = (selectedEmployee.permissions || '').split(',').filter(p => p.trim());
                      }
                      const permissionLabels = employeePermissions.map(permId => {
                        const perm = availablePermissions.find(p => p.id === permId);
                        return perm ? perm.label : permId;
                      });

                      const employeeData = {
                        'Full Name': selectedEmployee.full_name || selectedEmployee.fullName || selectedEmployee.username,
                        'Username': selectedEmployee.username || '',
                        'Email': selectedEmployee.email || '',
                        'Role': predefinedRoles.find(r => r.value === selectedEmployee.role)?.label || selectedEmployee.role,
                        'Store(s)': selectedEmployee.store_names || 'N/A',
                        'Salary': formatCurrency(selectedEmployee.salary),
                        'Work Shift': formatWorkShiftDisplay(selectedEmployee.work_shift) || 'N/A',
                        'Hire Date': formatDate(selectedEmployee.hire_date),
                        'Status': selectedEmployee.is_active ? 'Active' : 'Inactive',
                        'Created At': formatDate(selectedEmployee.created_at),
                        'Permissions': permissionLabels.join(', ') || 'None'
                      };

                      if (employeeExportFormat === 'csv') {
                        const headers = Object.keys(employeeData);
                        const csv = [
                          headers.join(','),
                          headers.map(h => `"${String(employeeData[h] || '').replace(/"/g, '""')}"`).join(',')
                        ].join('\n');
                        
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const filename = `employee_${selectedEmployee.username}_${new Date().toISOString().split('T')[0]}.csv`;
                        await saveFile(blob, filename);
                      } else {
                        const json = JSON.stringify(employeeData, null, 2);
                        const blob = new Blob([json], { type: 'application/json' });
                        const filename = `employee_${selectedEmployee.username}_${new Date().toISOString().split('T')[0]}.json`;
                        await saveFile(blob, filename);
                      }

                      setShowEmployeeExportModal(false);
                      toast.success(`Employee details exported as ${employeeExportFormat.toUpperCase()}`);
                    }}
                    className="glass-button bg-analytics-revenue hover:bg-analytics-revenue/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  >
                    Export
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Export Format Modal */}
      <AnimatePresence>
        {showExportModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowExportModal(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100050]"
            />
            <div className="fixed inset-0 z-[100050] flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="glass-card-pro p-6 max-w-md w-full pointer-events-auto"
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-analytics-primary">Export Employees</h3>
                  <button
                    onClick={() => setShowExportModal(false)}
                    className="text-analytics-secondary hover:text-analytics-primary transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                <p className="text-sm text-analytics-secondary mb-4">Select export format:</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 glass-button px-4 py-2 rounded-lg cursor-pointer hover:bg-white/10">
                    <input
                      type="radio"
                      value="csv"
                      checked={exportFormat === 'csv'}
                      onChange={(e) => setExportFormat(e.target.value)}
                      className="rounded"
                    />
                    <span className="text-analytics-secondary">CSV</span>
                  </label>
                  <label className="flex items-center gap-2 glass-button px-4 py-2 rounded-lg cursor-pointer hover:bg-white/10">
                    <input
                      type="radio"
                      value="json"
                      checked={exportFormat === 'json'}
                      onChange={(e) => setExportFormat(e.target.value)}
                      className="rounded"
                    />
                    <span className="text-analytics-secondary">JSON</span>
                  </label>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowExportModal(false)}
                    className="glass-button px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={performExport}
                    className="glass-button bg-analytics-revenue hover:bg-analytics-revenue/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  >
                    Export
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

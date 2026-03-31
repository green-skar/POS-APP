'use client';

import { apiFetch } from '@/utils/apiClient';
import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createPortal } from 'react-dom';
import { 
  DollarSign, 
  Plus, 
  Edit2, 
  Trash2, 
  Calendar, 
  Search,
  Filter,
  Download,
  FileSpreadsheet,
  X,
  ChevronDown
} from 'lucide-react';
// Sidebar is now in admin layout - no need to import here
import { logButtonClick } from '@/utils/logActivity';
import { usePasswordConfirmation } from '@/utils/usePasswordConfirmation';
import ConfirmationModal from '@/components/ConfirmationModal';
import { saveFile } from '@/utils/saveFile';

export default function ExpensesManagement() {
  // Password confirmation hook
  const {
    showPasswordModal,
    setShowPasswordModal,
    password,
    setPassword,
    handlePasswordConfirm,
    requirePassword
  } = usePasswordConfirmation();
  
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exportFormat, setExportFormat] = useState('csv');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [categoryDropdownPosition, setCategoryDropdownPosition] = useState({ top: 0, right: 0, width: 0 });
  const categoryDropdownRef = useRef(null);
  const categoryButtonRef = useRef(null);
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    period_start: '',
    period_end: '',
    notes: '',
  });

  // Fetch expenses
  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', startDate, endDate, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (categoryFilter) params.append('category', categoryFilter);
      
      const response = await apiFetch(`/api/expenses?${params}`);
      if (!response.ok) throw new Error('Failed to fetch expenses');
      return response.json();
    },
  });

  // Filter expenses by search term
  const filteredExpenses = expenses.filter(expense =>
    expense.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    expense.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Fetch all expense categories
  const { data: allExpenseCategories = [] } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: async () => {
      const response = await apiFetch('/api/categories/expenses');
      if (!response.ok) {
        throw new Error('Failed to fetch categories');
      }
      return response.json();
    },
  });

  // Get unique categories from current expenses (for filter dropdown)
  const categories = allExpenseCategories.length > 0 ? allExpenseCategories : [...new Set(expenses.map(e => e.category))];
  
  // Prepare category options for dropdown
  const categoryOptions = [
    { value: '', label: 'All Categories' },
    ...categories.map(cat => ({ value: cat, label: cat }))
  ];

  // Calculate dropdown position
  useEffect(() => {
    if (categoryDropdownOpen && categoryButtonRef.current) {
      const updatePosition = () => {
        if (categoryButtonRef.current) {
          const rect = categoryButtonRef.current.getBoundingClientRect();
          setCategoryDropdownPosition({
            top: rect.bottom,
            right: window.innerWidth - rect.right,
            width: rect.width
          });
        }
      };
      updatePosition();
      
      // Use requestAnimationFrame for smooth updates
      let rafId;
      const handleScroll = () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(updatePosition);
      };
      
      // Listen to scroll events on window and document
      window.addEventListener('scroll', handleScroll, true);
      document.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', updatePosition);
      
      // Find scrollable parent elements
      let parent = categoryButtonRef.current.parentElement;
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
  }, [categoryDropdownOpen]);

  // Close dropdown when clicking outside (but not on scroll)
  useEffect(() => {
    if (!categoryDropdownOpen) return;
    
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
      // Don't close if we're scrolling
      if (isScrolling) return;
      
      // Check if click is outside both button and dropdown
      const dropdownElement = document.querySelector('[data-expense-category-dropdown]');
      const clickedDropdown = dropdownElement && (dropdownElement.contains(event.target) || dropdownElement === event.target);
      const clickedButton = categoryButtonRef.current && categoryButtonRef.current.contains(event.target);
      
      if (!clickedButton && !clickedDropdown) {
        setCategoryDropdownOpen(false);
      }
    };
    
    window.addEventListener('scroll', handleScrollStart, true);
    document.addEventListener('scroll', handleScrollStart, true);
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('touchstart', handleClickOutside);
    
    return () => {
      clearTimeout(scrollTimeout);
      window.removeEventListener('scroll', handleScrollStart, true);
      document.removeEventListener('scroll', handleScrollStart, true);
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('touchstart', handleClickOutside);
    };
  }, [categoryDropdownOpen]);

  // Create expense mutation
  const createMutation = useMutation({
    mutationFn: async (data) => {
      const response = await apiFetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create expense');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
      setShowAddModal(false);
      setFormData({
        title: '',
        description: '',
        category: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        period_start: '',
        period_end: '',
        notes: '',
      });
      toast.success('Expense created successfully!', {
        description: 'The expense has been added to your records.',
      });
    },
    onError: (error) => {
      toast.error('Failed to create expense', {
        description: error.message || 'An error occurred while creating the expense.',
      });
    },
  });

  // Update expense mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const response = await apiFetch(`/api/expenses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update expense');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
      setShowEditModal(false);
      setEditingExpense(null);
      toast.success('Expense updated successfully!', {
        description: 'The expense details have been saved.',
      });
    },
    onError: (error) => {
      toast.error('Failed to update expense', {
        description: error.message || 'An error occurred while updating the expense.',
      });
    },
  });

  // Delete expense mutation
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const response = await apiFetch(`/api/expenses/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete expense');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
      toast.success('Expense deleted successfully!', {
        description: 'The expense has been removed from your records.',
      });
    },
    onError: (error) => {
      toast.error('Failed to delete expense', {
        description: error.message || 'An error occurred while deleting the expense.',
      });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    // Require password for add/update operations
    requirePassword(editingExpense ? 'update' : 'create', () => {
      if (editingExpense) {
        logButtonClick('Update Expense', `Update expense: ${formData.title}`, {
          expense_id: editingExpense.id,
          expense_title: formData.title,
          amount: formData.amount,
          category: formData.category
        });
        updateMutation.mutate({ id: editingExpense.id, data: formData });
      } else {
        logButtonClick('Create Expense', `Create expense: ${formData.title}`, {
          expense_title: formData.title,
          amount: formData.amount,
          category: formData.category
        });
        createMutation.mutate(formData);
      }
    }, { 
      action: editingExpense ? 'update_expense' : 'create_expense',
      expense_title: formData.title 
    });
  };

  const handleEdit = (expense) => {
    setEditingExpense(expense);
    // If period_start or period_end is missing, default to the expense date
    const defaultDate = expense.date.split('T')[0];
    setFormData({
      title: expense.title,
      description: expense.description || '',
      category: expense.category,
      amount: expense.amount.toString(),
      date: defaultDate,
      period_start: expense.period_start ? expense.period_start.split('T')[0] : defaultDate,
      period_end: expense.period_end ? expense.period_end.split('T')[0] : defaultDate,
      notes: expense.notes || '',
    });
    setShowEditModal(true);
  };

  const handleViewDetails = (expense) => {
    setSelectedExpense(expense);
    setShowDetailsModal(true);
  };

  const handleDelete = (expense) => {
    requirePassword('delete', () => {
      setExpenseToDelete(expense);
      setShowDeleteModal(true);
    }, { expense_id: expense.id, expense_title: expense.title });
  };

  const confirmDelete = () => {
    if (expenseToDelete) {
      deleteMutation.mutate(expenseToDelete.id);
      setExpenseToDelete(null);
      setShowDeleteModal(false);
    }
  };

  // Calculate summary
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  const expenseByCategory = filteredExpenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + parseFloat(e.amount);
    return acc;
  }, {});

  // Export function
  const handleExport = () => {
    requirePassword('export', async () => {
    let content = '';
    let filename = '';
    let mimeType = '';
    
    const dateFilterStr = startDate && endDate ? `_${startDate}_to_${endDate}` : '';
    const categoryFilterStr = categoryFilter ? `_${categoryFilter}` : '';
    
    if (exportFormat === 'csv') {
      const headers = ['Title', 'Category', 'Amount', 'Date', 'Description'];
      const csvData = filteredExpenses.map(expense => [
        expense.title,
        expense.category,
        expense.amount,
        expense.date,
        expense.description || ''
      ]);

      content = [headers, ...csvData]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');
      filename = `expenses_export${dateFilterStr}${categoryFilterStr}_${new Date().toISOString().split('T')[0]}.csv`;
      mimeType = 'text/csv';
    } else if (exportFormat === 'json') {
      content = JSON.stringify(filteredExpenses, null, 2);
      filename = `expenses_export${dateFilterStr}${categoryFilterStr}_${new Date().toISOString().split('T')[0]}.json`;
      mimeType = 'application/json';
    }
    
    const blob = new Blob([content], { type: mimeType });
    await saveFile(blob, filename);
      setShowExportModal(false);
      toast.success('Export completed successfully!', {
        description: `Your expenses data has been exported as ${filename}`,
      });
    }, { action: 'export_expenses' });
  };

  return (
    <div className="min-h-screen font-sans">
      <main className="px-4 py-7"> 
        {/* Header section styled like analytics */}
        <div className="analytics-header text-2xl mb-6 flex justify-between items-center">
          <span>Expense Management</span>
          <div className="flex gap-3">
            <button onClick={() => setShowExportModal(true)} className="glass-card-pro text-xs font-semibold soft-shadow flex items-center gap-1.5 py-1 px-3">
              <Download size={14} className="text-analytics-revenue" /> Export
                </button>
            <button onClick={() => requirePassword('create', () => setShowAddModal(true), { action: 'add_expense' })} className="glass-button-primary text-white font-semibold flex items-center gap-1.5 py-1 px-3 text-sm">
              <Plus size={14} /> Add Expense
                </button>
              </div>
            </div>
          {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <div className="glass-card-pro py-5 px-4 flex flex-col items-center bounce-in">
            <span className="text-analytics-secondary text-xs mb-1">Total Expenses</span>
            <span className="text-3xl text-analytics-expense font-bold soft-shadow">${totalExpenses.toFixed(2)}</span>
                </div>
          <div className="glass-card-pro py-5 px-4 flex flex-col items-center bounce-in"><span className="text-analytics-secondary text-xs mb-1">Number of Expenses</span><span className="text-3xl text-analytics-primary font-bold soft-shadow">{filteredExpenses.length}</span></div>
          <div className="glass-card-pro py-5 px-4 flex flex-col items-center bounce-in"><span className="text-analytics-secondary text-xs mb-1">Average Expense</span><span className="text-3xl text-analytics-profit font-bold soft-shadow">${filteredExpenses.length > 0 ? (totalExpenses / filteredExpenses.length).toFixed(2) : 0}</span></div>
          </div>
          {/* Filters */}
        <div className="glass-card-pro p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-analytics-secondary mb-1">Search</label>
              <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-analytics-secondary" />
                <input
                  type="text"
                  placeholder="Search expenses..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                    className="glass-button-secondary w-full pl-10 pr-4 py-2 text-sm text-analytics-primary placeholder:text-analytics-secondary" 
                />
              </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-analytics-secondary mb-1">Category</label>
                <div className="relative" ref={categoryDropdownRef}>
                  <button
                    ref={categoryButtonRef}
                    onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                    className="glass-button-secondary flex items-center justify-between gap-2 w-full px-3 py-2 text-sm text-analytics-primary"
                  >
                    <span>{categoryFilter ? categoryOptions.find(opt => opt.value === categoryFilter)?.label || 'Filter by category' : 'Filter by category'}</span>
                    <ChevronDown size={16} className={`transition-transform duration-200 ${categoryDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {categoryDropdownOpen && typeof document !== 'undefined' && createPortal(
                    <div 
                      data-expense-category-dropdown
                      style={{ 
                        position: 'fixed',
                        top: `${categoryDropdownPosition.top + 8}px`,
                        right: `${categoryDropdownPosition.right}px`,
                        width: `${categoryDropdownPosition.width || 0}px`,
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
                        {categoryOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setCategoryFilter(option.value);
                              setCategoryDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                              categoryFilter === option.value
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
              
              <div>
                <label className="block text-xs font-medium text-analytics-secondary mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                  className="glass-button-secondary w-full px-3 py-2 text-sm text-analytics-primary" 
              />
              </div>

              <div>
                <label className="block text-xs font-medium text-analytics-secondary mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                  className="glass-button-secondary w-full px-3 py-2 text-sm text-analytics-primary" 
              />
            </div>
          </div>
          </div>
          {/* Expenses Table */}
        <div className="glass-card-pro overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10">
                <thead className="bg-white/10">
                  <tr>
                    <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-analytics-secondary uppercase tracking-wider">Title</th>
                    <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-analytics-secondary uppercase tracking-wider hidden sm:table-cell">Category</th>
                    <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-analytics-secondary uppercase tracking-wider">Amount</th>
                    <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-analytics-secondary uppercase tracking-wider hidden md:table-cell">Date Added</th>
                    <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-analytics-secondary uppercase tracking-wider hidden lg:table-cell">Period</th>
                    <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-analytics-secondary uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {isLoading ? (
                  <tr><td colSpan={6} className="px-2 sm:px-3 md:px-4 lg:px-6 py-3 sm:py-4 text-center text-xs sm:text-sm text-analytics-secondary">Loading...</td></tr>
                  ) : filteredExpenses.length === 0 ? (
                  <tr><td colSpan={6} className="px-2 sm:px-3 md:px-4 lg:px-6 py-3 sm:py-4 text-center text-xs sm:text-sm text-analytics-secondary">No expenses found</td></tr>
                  ) : (
                    filteredExpenses.map((expense) => (
                      <tr 
                        key={expense.id} 
                        className="hover:bg-white/25 transition-colors cursor-pointer"
                        onClick={(e) => {
                          // Don't open modal if clicking on action buttons
                          const target = e.target;
                          const isActionButton = target.closest('button') || target.closest('svg') || target.closest('[data-action-button]');
                          if (!isActionButton) {
                            handleViewDetails(expense);
                          }
                        }}
                      >
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                        <div className="text-xs sm:text-sm font-medium text-analytics-primary">{expense.title}</div>
                        {expense.description && <div className="text-[10px] sm:text-xs text-analytics-secondary hidden sm:block">{expense.description}</div>}
                        <div className="text-[10px] text-analytics-secondary sm:hidden">
                          {expense.category && <span className="glass-card-pro px-1.5 py-0.5 text-[10px] font-medium text-analytics-primary border border-white/30 rounded-full mr-1">{expense.category}</span>}
                          <span className="text-analytics-secondary">{new Date(expense.date).toLocaleDateString()}</span>
                        </div>
                        </td>
                      <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap hidden sm:table-cell">
                        <span className="glass-card-pro px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium text-analytics-primary border border-white/30 rounded-full">{expense.category}</span>
                        </td>
                      <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-xs sm:text-sm font-medium text-analytics-expense">${parseFloat(expense.amount).toFixed(2)}</td>
                      <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-xs sm:text-sm text-analytics-secondary hidden md:table-cell">{new Date(expense.date).toLocaleDateString()}</td>
                      <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-xs sm:text-sm text-analytics-secondary hidden lg:table-cell">
                        {expense.period_start && expense.period_end ? (
                          <span>
                            {new Date(expense.period_start).toLocaleDateString()} - {new Date(expense.period_end).toLocaleDateString()}
                          </span>
                        ) : expense.period_start ? (
                          <span>From {new Date(expense.period_start).toLocaleDateString()}</span>
                        ) : (
                          <span className="text-analytics-expense">Not set</span>
                        )}
                      </td>
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-xs sm:text-sm font-medium">
                        <div className="flex items-center gap-1 sm:gap-1.5">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(expense);
                          }} 
                          className="glass-card-pro text-blue-700 border border-blue-200 px-1 py-0.5 text-[10px] sm:text-xs leading-tight"
                          data-action-button
                        >
                          Edit
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(expense);
                          }} 
                          className="glass-card-pro text-red-700 border border-red-200 px-1 py-0.5 text-[10px] sm:text-xs leading-tight"
                          data-action-button
                        >
                          Delete
                        </button>
                        </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        {/* Add Expense Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="glass-card-pro max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex-shrink-0 px-6 pt-6">
                <div className="flex items-center justify-between pb-3 border-b border-white/30 mb-4">
                  <h2 className="text-xl font-semibold text-analytics-primary">Add Expense</h2>
                  <button onClick={() => { setShowAddModal(false); setFormData({ title: '', description: '', category: '', amount: '', date: new Date().toISOString().split('T')[0], period_start: '', period_end: '', notes: '' }); }} className="text-analytics-secondary hover:text-analytics-primary">
                    <X size={18} />
                  </button>
                </div>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto flex-1 px-6 pb-6 expense-modal-scroll" style={{ maxHeight: 'calc(90vh - 80px)' }}>
                <div>
                  <label className="block text-sm font-medium text-analytics-secondary mb-2">Title *</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="glass-input w-full px-3 py-2 text-sm"
                    placeholder="Enter expense title"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-analytics-secondary mb-2">Category *</label>
                  <input
                    type="text"
                    required
                    list="expense-categories-add"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="glass-input w-full px-3 py-2 text-sm"
                    placeholder="Type or select a category"
                  />
                  <datalist id="expense-categories-add">
                    {categories.map(cat => (<option key={cat} value={cat} />))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-analytics-secondary mb-2">Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="glass-input w-full px-3 py-2 text-sm"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-analytics-secondary mb-2">Date Added *</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="glass-input w-full px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-analytics-secondary mt-1">Date when this expense was recorded</p>
                </div>
                
                {/* Time Period Section */}
                <div className="pt-2 border-t border-white/20">
                  <label className="block text-sm font-medium text-analytics-primary mb-3">Time Period *</label>
                  <p className="text-xs text-analytics-secondary mb-3">Specify the time period this expense covers (e.g., monthly subscription, quarterly expense)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-analytics-secondary mb-2">Period Start *</label>
                      <input
                        type="date"
                        required
                        value={formData.period_start}
                        onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                        className="glass-input w-full px-3 py-2 text-sm"
                        placeholder="Start date"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-analytics-secondary mb-2">Period End *</label>
                      <input
                        type="date"
                        required
                        value={formData.period_end}
                        onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
                        className="glass-input w-full px-3 py-2 text-sm"
                        placeholder="End date"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-analytics-secondary mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="glass-input w-full px-3 py-2 text-sm"
                    placeholder="Optional description"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-analytics-secondary mb-2">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={2}
                    className="glass-input w-full px-3 py-2 text-sm"
                    placeholder="Optional notes"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowAddModal(false); setFormData({ title: '', description: '', category: '', amount: '', date: new Date().toISOString().split('T')[0], period_start: '', period_end: '', notes: '' }); }}
                    className="glass-button-secondary flex-1 px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="glass-button-primary text-white flex-1 px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {createMutation.isPending ? 'Adding...' : 'Add Expense'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Expense Modal */}
        {showEditModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="glass-card-pro max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex-shrink-0 px-6 pt-6">
                <div className="flex items-center justify-between pb-3 border-b border-white/30 mb-4">
                  <h2 className="text-xl font-semibold text-analytics-primary">Edit Expense</h2>
                  <button onClick={() => { setShowEditModal(false); setEditingExpense(null); setFormData({ title: '', description: '', category: '', amount: '', date: new Date().toISOString().split('T')[0], period_start: '', period_end: '', notes: '' }); }} className="text-analytics-secondary hover:text-analytics-primary">
                    <X size={18} />
                  </button>
                </div>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto flex-1 px-6 pb-6 expense-modal-scroll" style={{ maxHeight: 'calc(90vh - 80px)' }}>
                <div>
                  <label className="block text-sm font-medium text-analytics-secondary mb-2">Title *</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="glass-input w-full px-3 py-2 text-sm"
                    placeholder="Enter expense title"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-analytics-secondary mb-2">Category *</label>
                  <input
                    type="text"
                    required
                    list="expense-categories-edit"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="glass-input w-full px-3 py-2 text-sm"
                    placeholder="Type or select a category"
                  />
                  <datalist id="expense-categories-edit">
                    {categories.map(cat => (<option key={cat} value={cat} />))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-analytics-secondary mb-2">Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="glass-input w-full px-3 py-2 text-sm"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-analytics-secondary mb-2">Date Added *</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="glass-input w-full px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-analytics-secondary mt-1">Date when this expense was recorded</p>
                </div>
                
                {/* Time Period Section */}
                <div className="pt-2 border-t border-white/20">
                  <label className="block text-sm font-medium text-analytics-primary mb-3">Time Period *</label>
                  <p className="text-xs text-analytics-secondary mb-3">Specify the time period this expense covers (e.g., monthly subscription, quarterly expense)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-analytics-secondary mb-2">Period Start *</label>
                      <input
                        type="date"
                        required
                        value={formData.period_start}
                        onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                        className="glass-input w-full px-3 py-2 text-sm"
                        placeholder="Start date"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-analytics-secondary mb-2">Period End *</label>
                      <input
                        type="date"
                        required
                        value={formData.period_end}
                        onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
                        className="glass-input w-full px-3 py-2 text-sm"
                        placeholder="End date"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-analytics-secondary mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="glass-input w-full px-3 py-2 text-sm"
                    placeholder="Optional description"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-analytics-secondary mb-2">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={2}
                    className="glass-input w-full px-3 py-2 text-sm"
                    placeholder="Optional notes"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowEditModal(false); setEditingExpense(null); setFormData({ title: '', description: '', category: '', amount: '', date: new Date().toISOString().split('T')[0], period_start: '', period_end: '', notes: '' }); }}
                    className="glass-button-secondary flex-1 px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="glass-button-primary text-white flex-1 px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {updateMutation.isPending ? 'Updating...' : 'Update Expense'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Export Modal */}
        {showExportModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="glass-card-pro max-w-md w-full mx-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/30 mb-4">
                <h2 className="text-xl font-semibold text-analytics-primary">Export Expenses</h2>
                <button onClick={() => setShowExportModal(false)} className="text-analytics-secondary hover:text-analytics-primary">
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
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowExportModal(false)}
                    className="glass-button-secondary flex-1 px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                <button
                    type="button"
                  onClick={handleExport}
                    className="glass-button-primary text-white flex-1 px-4 py-2 text-sm"
                >
                    <Download size={16} className="inline mr-2" /> Export
                </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        <ConfirmationModal
          isOpen={showDeleteModal}
          onClose={() => {
            setShowDeleteModal(false);
            setExpenseToDelete(null);
          }}
          onConfirm={confirmDelete}
          title="Delete Expense"
          message={expenseToDelete ? `Are you sure you want to delete "${expenseToDelete.title}"? This action cannot be undone.` : ''}
          confirmText="Delete"
          cancelText="Cancel"
          type="danger"
        />

        {/* Expense Details Modal */}
        {showDetailsModal && selectedExpense && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="glass-card-pro max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-white/30 mb-4">
                <h2 className="text-xl font-semibold text-analytics-primary">Expense Details</h2>
                <button onClick={() => {
                  setShowDetailsModal(false);
                  setSelectedExpense(null);
                }} className="text-analytics-secondary hover:text-analytics-primary">
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-analytics-secondary mb-1">Title</label>
                  <p className="text-base text-analytics-primary">{selectedExpense.title}</p>
                </div>
                {selectedExpense.description && (
                  <div>
                    <label className="block text-sm font-medium text-analytics-secondary mb-1">Description</label>
                    <p className="text-base text-analytics-primary">{selectedExpense.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-analytics-secondary mb-1">Category</label>
                    <p className="text-base text-analytics-primary">{selectedExpense.category}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-analytics-secondary mb-1">Amount</label>
                    <p className="text-base font-semibold text-analytics-expense">${parseFloat(selectedExpense.amount).toFixed(2)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-analytics-secondary mb-1">Date</label>
                    <p className="text-base text-analytics-primary">{new Date(selectedExpense.date).toLocaleDateString()}</p>
                  </div>
                  {selectedExpense.period_start && (
                    <div>
                      <label className="block text-sm font-medium text-analytics-secondary mb-1">Period</label>
                      <p className="text-base text-analytics-primary">
                        {new Date(selectedExpense.period_start).toLocaleDateString()} - {selectedExpense.period_end ? new Date(selectedExpense.period_end).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  )}
                </div>
                {selectedExpense.notes && (
                  <div>
                    <label className="block text-sm font-medium text-analytics-secondary mb-1">Notes</label>
                    <p className="text-base text-analytics-primary">{selectedExpense.notes}</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/30">
                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    setSelectedExpense(null);
                  }}
                  className="glass-button-secondary px-4 py-2 text-sm"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    handleEdit(selectedExpense);
                  }}
                  className="glass-button-primary text-white px-4 py-2 text-sm"
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Password Confirmation Modal */}
        <ConfirmationModal
          isOpen={showPasswordModal}
          onClose={() => {
            setShowPasswordModal(false);
            setPassword('');
          }}
          onConfirm={handlePasswordConfirm}
          title="Confirm Action"
          message="Please enter your password to confirm this critical action."
          confirmText="Verify & Continue"
          cancelText="Cancel"
          type="info"
          requirePassword={true}
          password={password}
          setPassword={setPassword}
          disabled={!password.trim()}
        />
      </main>
    </div>
  );
}


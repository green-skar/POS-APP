'use client';

import { apiFetch } from '@/utils/apiClient';
import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Plus, Edit2, Trash2, Store, X, Users, Package, Menu, Shield, Eye, ChevronDown } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '@/utils/useAuth';
import ProtectedRoute from '@/components/ProtectedRoute';
// Sidebar is now in admin layout - no need to import here
import { logButtonClick } from '@/utils/logActivity';
import ConfirmationModal from '@/components/ConfirmationModal';
import { usePasswordConfirmation } from '@/utils/usePasswordConfirmation';

export default function StoresPage() {
  return (
    <ProtectedRoute requiredRole="super_admin">
      <StoresPageContent />
    </ProtectedRoute>
  );
}

function StoresPageContent() {
  const { isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  // Sidebar state is now managed by AdminLayout
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showStoreDetailsModal, setShowStoreDetailsModal] = useState(false);
  const [selectedStore, setSelectedStore] = useState(null);
  const [storeDetails, setStoreDetails] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showStoreExportModal, setShowStoreExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  const [salesViewType, setSalesViewType] = useState('products'); // 'products' or 'services'
  const [editingStore, setEditingStore] = useState(null);
  const [showItemsDropdown, setShowItemsDropdown] = useState(false);
  const [itemsDropdownPosition, setItemsDropdownPosition] = useState({ top: 0, left: 0 });
  const itemsDropdownRef = useRef(null);
  const itemsButtonRef = useRef(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [storeToDelete, setStoreToDelete] = useState(null);
  
  // Handle click outside for items dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        showItemsDropdown &&
        itemsDropdownRef.current &&
        !itemsDropdownRef.current.contains(event.target) &&
        itemsButtonRef.current &&
        !itemsButtonRef.current.contains(event.target)
      ) {
        setShowItemsDropdown(false);
      }
    };

    if (showItemsDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showItemsDropdown]);

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    isActive: true,
  });

  // Fetch stores
  const { data: storesData, isLoading, error: storesError } = useQuery({
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
      const data = await response.json();
      console.log('Stores API response:', data);
      return data;
    },
    enabled: isSuperAdmin(),
  });

  const stores = storesData?.stores || [];

  // Create/Update store mutation
  const storeMutation = useMutation({
    mutationFn: async (data) => {
      const url = '/api/stores';
      const method = editingStore ? 'PUT' : 'POST';
      const body = editingStore ? { ...data, id: editingStore.id } : data;

      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save store');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      queryClient.invalidateQueries({ queryKey: ['userStores'] });
      toast.success(editingStore ? 'Store updated successfully' : 'Store created successfully');
      setIsModalOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Delete store mutation
  const deleteMutation = useMutation({
    mutationFn: async (storeId) => {
      const response = await apiFetch(`/api/stores?id=${storeId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete store');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      queryClient.invalidateQueries({ queryKey: ['userStores'] });
      toast.success('Store deleted successfully');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      address: '',
      phone: '',
      email: '',
      isActive: true,
    });
    setEditingStore(null);
  };

  const handleOpenModal = (store = null) => {
    if (store) {
      logButtonClick('Edit Store', `Edit store: ${store.name}`, {
        store_id: store.id,
        store_name: store.name
      });
      setEditingStore(store);
      setFormData({
        name: store.name,
        address: store.address || '',
        phone: store.phone || '',
        email: store.email || '',
        isActive: store.is_active !== 0,
      });
      setIsModalOpen(true);
    } else {
      requirePassword('create', () => {
        logButtonClick('Add Store', 'Open add store modal');
        resetForm();
        setIsModalOpen(true);
      }, { action: 'add_store' });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.name) {
      toast.error('Store name is required');
      return;
    }

    // Require password for add/update operations
    requirePassword(editingStore ? 'update' : 'create', () => {
      if (editingStore) {
        logButtonClick('Update Store', `Update store: ${formData.name}`, {
          store_id: editingStore.id,
          store_name: formData.name
        });
      } else {
        logButtonClick('Create Store', `Create store: ${formData.name}`, {
          store_name: formData.name
        });
      }

      storeMutation.mutate(formData);
    }, { 
      action: editingStore ? 'update_store' : 'create_store',
      store_name: formData.name 
    });
  };

  // Password confirmation hook
  const {
    showPasswordModal,
    setShowPasswordModal,
    password,
    setPassword,
    handlePasswordConfirm,
    requirePassword
  } = usePasswordConfirmation();

  const handleDelete = (storeId) => {
    const store = stores.find(s => s.id === storeId);
    requirePassword('delete', () => {
      setStoreToDelete(store);
      setShowDeleteModal(true);
    }, { store_id: store.id, store_name: store.name });
  };

  const confirmDelete = () => {
    if (storeToDelete) {
      logButtonClick('Delete Store', `Delete store: ${storeToDelete.name}`, {
        store_id: storeToDelete.id,
        store_name: storeToDelete.name
      });
      deleteMutation.mutate(storeToDelete.id);
      setStoreToDelete(null);
    }
  };

  const handleViewStoreDetails = (store) => {
    logButtonClick('View Store Details', `View details for store: ${store.name}`, {
      store_id: store.id,
      store_name: store.name
    });
    setSelectedStore(store);
    setShowStoreDetailsModal(true);
    setSalesViewType('products'); // Reset to products view when opening new store
  };

  // Fetch store details
  const { data: storeDetailsData, isLoading: detailsLoading } = useQuery({
    queryKey: ['storeDetails', selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return null;
      const response = await apiFetch(`/api/stores/${selectedStore.id}/details`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch store details' }));
        throw new Error(errorData.error || 'Failed to fetch store details');
      }
      const data = await response.json();
      console.log('Store details response:', data);
      console.log('Service sales:', data.service_sales, 'Length:', data.service_sales?.length);
      console.log('Product sales:', data.product_sales, 'Length:', data.product_sales?.length);
      return data;
    },
    enabled: !!selectedStore?.id && showStoreDetailsModal,
  });

  if (!isSuperAdmin()) {
    return (
      <div className="p-6">
        <div className="glass-card p-6 text-center">
          <p className="text-analytics-secondary">Only super admins can manage stores.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans">
      <div className="px-4 py-7">
        <div className="space-y-6">
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              {/* Sidebar toggle is now in AdminLayout */}
              <h1 className="analytics-header text-2xl">Store Management</h1>
            </div>
            <button
              onClick={() => handleOpenModal()}
              className="glass-button-primary px-6 py-3 rounded-xl font-semibold flex items-center gap-2 hover:scale-105 transition-all"
            >
              <Plus size={20} />
              Add Store
            </button>
          </div>

          {/* Stores Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading ? (
              <div className="col-span-full text-center py-8 text-analytics-secondary">Loading...</div>
            ) : storesError ? (
              <div className="col-span-full text-center py-8 text-red-500">
                Error: {storesError.message || 'Failed to load stores'}
              </div>
            ) : stores.length === 0 ? (
              <div className="col-span-full text-center py-8 text-analytics-secondary">No stores found</div>
            ) : (
          stores.map((store) => (
            <motion.div
              key={store.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-6 rounded-2xl hover:scale-105 transition-all"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 glass-button-primary rounded-xl">
                    <Store size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-analytics-primary">{store.name}</h3>
                    <span className={`text-xs px-2 py-1 rounded ${
                      store.is_active ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                    }`}>
                      {store.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleViewStoreDetails(store)}
                    className="p-2 glass-button-secondary rounded-lg hover:bg-white/20 transition-colors"
                    title="View Details"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    onClick={() => handleOpenModal(store)}
                    className="p-2 glass-button-secondary rounded-lg hover:bg-white/20 transition-colors"
                    title="Edit Store"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(store.id)}
                    className="p-2 glass-button-danger rounded-lg hover:bg-red-500/20 transition-colors"
                    title="Delete Store"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm text-analytics-secondary">
                {store.address && (
                  <div className="flex items-start gap-2">
                    <span className="font-medium">Address:</span>
                    <span>{store.address}</span>
                  </div>
                )}
                {store.phone && (
                  <div className="flex items-start gap-2">
                    <span className="font-medium">Phone:</span>
                    <span>{store.phone}</span>
                  </div>
                )}
                {store.email && (
                  <div className="flex items-start gap-2">
                    <span className="font-medium">Email:</span>
                    <span>{store.email}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 flex gap-4 text-sm">
                <div className="flex flex-col gap-1 text-analytics-secondary items-center">
                  <span className="text-sm">Users</span>
                  <div className="flex items-center gap-2">
                    <Users size={12} />
                    <span className="text-lg font-bold text-analytics-primary">{store.user_count || 0}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-analytics-secondary items-center">
                  <span className="text-sm">Products</span>
                  <div className="flex items-center gap-2">
                    <Package size={12} />
                    <span className="text-lg font-bold text-analytics-primary">{store.product_count || 0}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-analytics-secondary items-center">
                  <span className="text-sm">Services</span>
                  <div className="flex items-center gap-2">
                    <Shield size={12} />
                    <span className="text-lg font-bold text-analytics-primary">{store.service_count || 0}</span>
                  </div>
                </div>
              </div>
            </motion.div>
            ))
          )}
          </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card p-6 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-analytics-primary">
                  {editingStore ? 'Edit Store' : 'Add New Store'}
                </h2>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }}
                  className="p-2 glass-button-secondary rounded-lg hover:bg-white/20 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-analytics-secondary mb-2">Store Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full glass-input px-4 py-2 rounded-lg text-analytics-primary"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-analytics-secondary mb-2">Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full glass-input px-4 py-2 rounded-lg text-analytics-primary"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-analytics-secondary mb-2">Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full glass-input px-4 py-2 rounded-lg text-analytics-primary"
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
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium text-analytics-secondary">Active</span>
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      resetForm();
                    }}
                    className="glass-button-secondary px-6 py-2 rounded-lg font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={storeMutation.isPending}
                    className="glass-button-primary px-6 py-2 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {storeMutation.isPending ? 'Saving...' : editingStore ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
          </AnimatePresence>

        {/* Store Details Modal */}
        <AnimatePresence>
          {showStoreDetailsModal && selectedStore && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="glass-card-pro p-6 rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              >
                <div className="flex justify-between items-center mb-6 flex-shrink-0">
                  <div>
                    <h2 className="text-2xl font-bold text-analytics-primary">
                      {selectedStore.name} - Details
                    </h2>
                    <p className="text-sm text-analytics-secondary mt-1">
                      {selectedStore.address || 'No address'} • {selectedStore.phone || 'No phone'} • {selectedStore.email || 'No email'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setShowStoreDetailsModal(false);
                        setSelectedStore(null);
                      }}
                      className="p-2 glass-button-secondary rounded-lg hover:bg-white/20 transition-colors"
                      title="Close"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {/* Store Details Content */}
                <div className="flex-1 overflow-y-auto sidebar-scroll">
                  {detailsLoading ? (
                    <div className="text-center py-8 text-analytics-secondary">Loading store details...</div>
                  ) : storeDetailsData ? (
                    <div className="space-y-6">
                      {/* Store Information */}
                      <div className="glass-card-pro p-4">
                        <h3 className="text-lg font-semibold text-analytics-primary mb-4">Store Information</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-analytics-secondary mb-1">Status</p>
                            <p className={`text-sm font-medium ${
                              storeDetailsData.store.is_active ? 'text-green-300' : 'text-red-300'
                            }`}>
                              {storeDetailsData.store.is_active ? 'Active' : 'Inactive'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-analytics-secondary mb-1">Created</p>
                            <p className="text-sm text-analytics-primary">
                              {new Date(storeDetailsData.store.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Sales Statistics */}
                      <div className="glass-card-pro p-4">
                        <h3 className="text-lg font-semibold text-analytics-primary mb-4">Sales Statistics</h3>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-analytics-secondary mb-1">Total Sales</p>
                            <p className="text-xl font-bold text-analytics-primary">{storeDetailsData.sales_stats.total_sales || 0}</p>
                          </div>
                          <div>
                            <p className="text-xs text-analytics-secondary mb-1">Total Revenue</p>
                            <p className="text-xl font-bold text-analytics-primary">${parseFloat(storeDetailsData.sales_stats.total_revenue || 0).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-analytics-secondary mb-1">Active Days</p>
                            <p className="text-xl font-bold text-analytics-primary">{storeDetailsData.sales_stats.active_days || 0}</p>
                          </div>
                        </div>
                      </div>

                      {/* Products & Services with Product Sales Chart */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Products & Services List */}
                        <div className="space-y-4">
                          {/* Products */}
                          <div className="glass-card-pro p-4">
                            <h3 className="text-lg font-semibold text-analytics-primary mb-4">Products ({storeDetailsData.products?.length || 0})</h3>
                            {storeDetailsData.products && storeDetailsData.products.length > 0 ? (
                              <div className="space-y-2 max-h-60 overflow-y-auto sidebar-scroll">
                                {storeDetailsData.products.map((product) => (
                                  <div key={product.id} className="flex justify-between items-center p-2 bg-white/10 rounded">
                                    <div>
                                      <span className="text-sm text-analytics-primary font-medium">{product.name}</span>
                                      <span className="text-xs text-analytics-secondary ml-2">({product.category})</span>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-sm font-bold text-analytics-revenue">${parseFloat(product.price).toFixed(2)}</p>
                                      <p className="text-xs text-analytics-secondary">Stock: {product.stock_quantity}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-analytics-secondary">No products found</p>
                            )}
                          </div>

                          {/* Services */}
                          <div className="glass-card-pro p-4">
                            <h3 className="text-lg font-semibold text-analytics-primary mb-4">Services ({storeDetailsData.services?.length || 0})</h3>
                            {storeDetailsData.services && storeDetailsData.services.length > 0 ? (
                              <div className="space-y-2 max-h-60 overflow-y-auto sidebar-scroll">
                                {storeDetailsData.services.map((service) => (
                                  <div key={service.id} className="flex justify-between items-center p-2 bg-white/10 rounded">
                                    <div>
                                      <span className="text-sm text-analytics-primary font-medium">{service.name}</span>
                                      <span className="text-xs text-analytics-secondary ml-2">({service.category})</span>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-sm font-bold text-analytics-revenue">${parseFloat(service.price).toFixed(2)}</p>
                                      <p className="text-xs text-analytics-secondary">{service.price_type}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-analytics-secondary">No services found</p>
                            )}
                          </div>
                        </div>

                        {/* Product/Service Sales Chart */}
                        <div className="glass-card-pro p-4">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-analytics-primary">
                              {salesViewType === 'products' ? 'Product Sales Performance' : 'Service Sales Performance'}
                            </h3>
                            <div className="flex gap-2 items-center">
                              <button
                                onClick={() => setSalesViewType('products')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                  salesViewType === 'products'
                                    ? 'bg-analytics-revenue text-white shadow-lg'
                                    : 'bg-white/10 text-analytics-secondary hover:bg-white/20'
                                }`}
                              >
                                Products
                              </button>
                              <button
                                onClick={() => setSalesViewType('services')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                  salesViewType === 'services'
                                    ? 'bg-analytics-revenue text-white shadow-lg'
                                    : 'bg-white/10 text-analytics-secondary hover:bg-white/20'
                                }`}
                              >
                                Services
                              </button>
                              <div className="relative">
                                <button
                                  ref={itemsButtonRef}
                                  onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const dropdownWidth = 400; // max-w-[400px]
                                    const viewportWidth = window.innerWidth;
                                    const rightEdge = rect.right;
                                    
                                    let left = rect.left + window.scrollX;
                                    // If dropdown would go off right edge, align to right edge of button
                                    if (rightEdge + dropdownWidth > viewportWidth) {
                                      left = rect.right + window.scrollX - dropdownWidth;
                                    }
                                    // Ensure it doesn't go off left edge
                                    if (left < window.scrollX) {
                                      left = window.scrollX + 8;
                                    }
                                    
                                    setItemsDropdownPosition({
                                      top: rect.bottom + window.scrollY + 8,
                                      left: left
                                    });
                                    setShowItemsDropdown(!showItemsDropdown);
                                  }}
                                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all bg-white/10 text-analytics-secondary hover:bg-white/20 flex items-center gap-2"
                                >
                                  <span>View All Items</span>
                                  <ChevronDown size={16} className={showItemsDropdown ? 'rotate-180' : ''} />
                                </button>
                              </div>
                            </div>
                          </div>
                          {salesViewType === 'products' ? (
                            storeDetailsData?.product_sales && Array.isArray(storeDetailsData.product_sales) && storeDetailsData.product_sales.length > 0 ? (
                              <div className="w-full h-[500px]">
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={storeDetailsData.product_sales.map((item) => ({
                                        name: item.name,
                                        value: parseFloat(item.total_revenue || 0),
                                        quantity: parseInt(item.total_quantity_sold || 0),
                                        sales: parseInt(item.sale_count || 0)
                                      }))}
                                      cx="50%"
                                      cy="50%"
                                      labelLine={false}
                                      label={({ percent, name }) => {
                                        // Only show label if percentage is >= 5% to avoid overlap
                                        if (percent < 0.05) return '';
                                        const shortName = name && name.length > 12 ? name.substring(0, 10) + '...' : name;
                                        return `${shortName} ${(percent * 100).toFixed(0)}%`;
                                      }}
                                      outerRadius={120}
                                      innerRadius={40}
                                      fill="#8884d8"
                                      dataKey="value"
                                    >
                                      {storeDetailsData.product_sales.map((entry, index) => {
                                        const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82CA9D', '#FFC658', '#FF6B6B', '#4ECDC4', '#95E1D3'];
                                        return (
                                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        );
                                      })}
                                    </Pie>
                                    <Tooltip 
                                      formatter={(value, name, props) => {
                                        if (name === 'value') {
                                          const payload = props.payload;
                                          const totalRevenue = storeDetailsData.product_sales.reduce((sum, item) => sum + parseFloat(item.total_revenue || 0), 0);
                                          const percent = totalRevenue > 0 ? ((parseFloat(value) / totalRevenue) * 100).toFixed(1) : '0';
                                          return [`$${parseFloat(value).toFixed(2)} (${percent}%)`, 'Revenue'];
                                        }
                                        return [value, name];
                                      }}
                                      contentStyle={{
                                        backgroundColor: 'rgba(0,0,0,0.8)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        borderRadius: '8px',
                                        color: '#fff'
                                      }}
                                    />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                            ) : (
                              <div className="h-[500px] flex items-center justify-center text-analytics-secondary">
                                <p className="text-sm">No sales data available for products</p>
                              </div>
                            )
                          ) : (
                            storeDetailsData?.service_sales && Array.isArray(storeDetailsData.service_sales) && storeDetailsData.service_sales.length > 0 ? (
                              <div className="w-full h-[500px]">
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={storeDetailsData.service_sales.map((item) => ({
                                        name: item.name,
                                        value: parseFloat(item.total_revenue || 0),
                                        quantity: parseInt(item.total_quantity_sold || 0),
                                        sales: parseInt(item.sale_count || 0)
                                      }))}
                                      cx="50%"
                                      cy="50%"
                                      labelLine={false}
                                      label={({ percent, name }) => {
                                        // Only show label if percentage is >= 5% to avoid overlap
                                        if (percent < 0.05) return '';
                                        const shortName = name && name.length > 12 ? name.substring(0, 10) + '...' : name;
                                        return `${shortName} ${(percent * 100).toFixed(0)}%`;
                                      }}
                                      outerRadius={120}
                                      innerRadius={40}
                                      fill="#8884d8"
                                      dataKey="value"
                                    >
                                      {storeDetailsData.service_sales.map((entry, index) => {
                                        const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82CA9D', '#FFC658', '#FF6B6B', '#4ECDC4', '#95E1D3'];
                                        return (
                                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        );
                                      })}
                                    </Pie>
                                    <Tooltip 
                                      formatter={(value, name, props) => {
                                        if (name === 'value') {
                                          const payload = props.payload;
                                          const totalRevenue = storeDetailsData.service_sales.reduce((sum, item) => sum + parseFloat(item.total_revenue || 0), 0);
                                          const percent = totalRevenue > 0 ? ((parseFloat(value) / totalRevenue) * 100).toFixed(1) : '0';
                                          return [`$${parseFloat(value).toFixed(2)} (${percent}%)`, 'Revenue'];
                                        }
                                        return [value, name];
                                      }}
                                      contentStyle={{
                                        backgroundColor: 'rgba(0,0,0,0.8)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        borderRadius: '8px',
                                        color: '#fff'
                                      }}
                                    />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                            ) : (
                              <div className="h-[500px] flex items-center justify-center text-analytics-secondary">
                                <p className="text-sm">No sales data available for services</p>
                              </div>
                            )
                          )}
                        </div>
                        
                        {/* Items Dropdown */}
                        {showItemsDropdown && typeof window !== 'undefined' && createPortal(
                          <div
                            ref={itemsDropdownRef}
                            style={{
                              position: 'fixed',
                              top: `${itemsDropdownPosition.top}px`,
                              left: `${itemsDropdownPosition.left}px`,
                              zIndex: 10000,
                              pointerEvents: 'auto',
                              transform: 'translateX(0)',
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="glass-card-pro shadow-lg category-dropdown-scroll" style={{
                              background: 'rgba(255,255,255,0.18)',
                              borderRadius: '16px',
                              boxShadow: '0 8px 32px 0 rgba(16,9,7,0.11), 0 2px 8px 0 rgba(0,0,0,0.06)',
                              backdropFilter: 'blur(9.5px)',
                              padding: '16px',
                              minWidth: '320px',
                              maxWidth: '400px',
                              maxHeight: '400px',
                              overflowY: 'auto',
                              overflowX: 'hidden'
                            }}>
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold text-analytics-primary mb-3 pb-2 border-b border-white/10">
                                {salesViewType === 'products' ? 'All Products' : 'All Services'}
                              </h4>
                              {salesViewType === 'products' 
                                ? (storeDetailsData?.product_sales && Array.isArray(storeDetailsData.product_sales) && storeDetailsData.product_sales.length > 0 ? (
                                    storeDetailsData.product_sales.map((item, index) => {
                                      const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82CA9D', '#FFC658', '#FF6B6B', '#4ECDC4', '#95E1D3'];
                                      const color = COLORS[index % COLORS.length];
                                      const totalRevenue = storeDetailsData.product_sales.reduce((sum, i) => sum + parseFloat(i.total_revenue || 0), 0);
                                      const percent = totalRevenue > 0 ? ((parseFloat(item.total_revenue || 0) / totalRevenue) * 100).toFixed(1) : '0';
                                      
                                      return (
                                        <div
                                          key={item.id || index}
                                          className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                                        >
                                          <div
                                            className="w-4 h-4 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: color }}
                                          />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm text-analytics-primary font-medium truncate">
                                              {item.name}
                                            </p>
                                            <p className="text-xs text-analytics-secondary">
                                              ${parseFloat(item.total_revenue || 0).toFixed(2)} • {percent}% • {item.total_quantity_sold || 0} sold
                                            </p>
                                          </div>
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <p className="text-sm text-analytics-secondary">No products available</p>
                                  ))
                                : (storeDetailsData?.service_sales && Array.isArray(storeDetailsData.service_sales) && storeDetailsData.service_sales.length > 0 ? (
                                    storeDetailsData.service_sales.map((item, index) => {
                                      const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82CA9D', '#FFC658', '#FF6B6B', '#4ECDC4', '#95E1D3'];
                                      const color = COLORS[index % COLORS.length];
                                      const totalRevenue = storeDetailsData.service_sales.reduce((sum, i) => sum + parseFloat(i.total_revenue || 0), 0);
                                      const percent = totalRevenue > 0 ? ((parseFloat(item.total_revenue || 0) / totalRevenue) * 100).toFixed(1) : '0';
                                      
                                      return (
                                        <div
                                          key={item.id || index}
                                          className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                                        >
                                          <div
                                            className="w-4 h-4 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: color }}
                                          />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm text-analytics-primary font-medium truncate">
                                              {item.name}
                                            </p>
                                            <p className="text-xs text-analytics-secondary">
                                              ${parseFloat(item.total_revenue || 0).toFixed(2)} • {percent}% • {item.total_quantity_sold || 0} sold
                                            </p>
                                          </div>
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <p className="text-sm text-analytics-secondary">No services available</p>
                                  ))
                              }
                            </div>
                            </div>
                          </div>,
                          document.body
                        )}
                      </div>

                      {/* Employees */}
                      <div className="glass-card-pro p-4">
                        <h3 className="text-lg font-semibold text-analytics-primary mb-4">Employees ({storeDetailsData.employees?.length || 0})</h3>
                        {storeDetailsData.employees && storeDetailsData.employees.length > 0 ? (
                          <div className="space-y-3 max-h-96 overflow-y-auto sidebar-scroll">
                            {storeDetailsData.employees.map((employee) => (
                              <div key={employee.id} className="p-3 bg-white/10 rounded-lg">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-sm text-analytics-primary font-medium">{employee.full_name}</span>
                                      <span className="text-xs text-analytics-secondary">({employee.username})</span>
                                      {employee.is_primary && (
                                        <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-300">Primary</span>
                                      )}
                                    </div>
                                    {employee.email && (
                                      <p className="text-xs text-analytics-secondary mb-1">{employee.email}</p>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <p className={`text-xs px-2 py-1 rounded mb-1 ${
                                      employee.role === 'super_admin' ? 'bg-purple-500/20 text-purple-300' :
                                      employee.role === 'admin' ? 'bg-blue-500/20 text-blue-300' :
                                      'bg-green-500/20 text-green-300'
                                    }`}>
                                      {employee.role === 'super_admin' ? 'Super Admin' : employee.role === 'admin' ? 'Admin' : employee.role === 'cashier' ? 'Cashier' : 'N/A'}
                                    </p>
                                    <p className={`text-xs ${
                                      employee.is_active ? 'text-green-300' : 'text-red-300'
                                    }`}>
                                      {employee.is_active ? 'Active' : 'Inactive'}
                                    </p>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2 pt-2 border-t border-white/10">
                                  <div>
                                    <p className="text-xs text-analytics-secondary mb-0.5">Role</p>
                                    <p className="text-sm text-analytics-primary font-medium">
                                      {employee.role === 'super_admin' ? 'Super Admin' : employee.role === 'admin' ? 'Admin' : employee.role === 'cashier' ? 'Cashier' : 'N/A'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-analytics-secondary mb-0.5">Work Shift</p>
                                    <p className="text-sm text-analytics-primary capitalize">
                                      {employee.work_shift || 'Not set'}
                                    </p>
                                  </div>
                                  {employee.salary !== undefined && employee.salary !== null && (
                                    <div>
                                      <p className="text-xs text-analytics-secondary mb-0.5">Salary</p>
                                      <p className="text-sm font-bold text-analytics-primary">${parseFloat(employee.salary || 0).toFixed(2)}</p>
                                    </div>
                                  )}
                                  {employee.hire_date && (
                                    <div>
                                      <p className="text-xs text-analytics-secondary mb-0.5">Hire Date</p>
                                      <p className="text-sm text-analytics-primary">
                                        {new Date(employee.hire_date).toLocaleDateString()}
                                      </p>
                                    </div>
                                  )}
                                  <div>
                                    <p className="text-xs text-analytics-secondary mb-0.5">Joined</p>
                                    <p className="text-sm text-analytics-primary">
                                      {new Date(employee.created_at).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-analytics-secondary">No employees found</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-analytics-secondary">No store details available</div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setStoreToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Delete Store"
        message={storeToDelete ? `Are you sure you want to delete "${storeToDelete.name}"? This will also delete all associated users and products. This action cannot be undone.` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        type="delete"
      />

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
    </div>
  );
}


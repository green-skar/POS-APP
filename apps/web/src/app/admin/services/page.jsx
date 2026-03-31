'use client';

import { apiFetch } from '@/utils/apiClient';
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Shield,
  AlertTriangle,
  Save,
  X,
  ChevronDown
} from 'lucide-react';
import ConfirmationModal from '@/components/ConfirmationModal';
import { usePasswordConfirmation } from '@/utils/usePasswordConfirmation';

export default function ServicesManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    price: '',
    price_type: 'fixed',
    price_config: '',
    description: '',
    duration: '',
    features: ''
  });
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [showNewCategoryPrompt, setShowNewCategoryPrompt] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0, width: 0 });
  const categoryDropdownRef = useRef(null);
  const dropdownButtonRef = useRef(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState(null);

  // Calculate dropdown position
  useEffect(() => {
    if (categoryDropdownOpen && dropdownButtonRef.current) {
      const updatePosition = () => {
        if (dropdownButtonRef.current) {
          const rect = dropdownButtonRef.current.getBoundingClientRect();
          setDropdownPosition({
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
      let parent = dropdownButtonRef.current.parentElement;
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
      const dropdownElement = document.querySelector('[data-category-dropdown-services]');
      const clickedDropdown = dropdownElement && (dropdownElement.contains(event.target) || dropdownElement === event.target);
      const clickedButton = dropdownButtonRef.current && dropdownButtonRef.current.contains(event.target);
      
      if (!clickedButton && !clickedDropdown) {
        setCategoryDropdownOpen(false);
      }
    };
    
    window.addEventListener('scroll', handleScrollStart, true);
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      window.removeEventListener('scroll', handleScrollStart, true);
      document.removeEventListener('mousedown', handleClickOutside);
      clearTimeout(scrollTimeout);
    };
  }, [categoryDropdownOpen]);

  const queryClient = useQueryClient();

  // Fetch services
  const { data: services = [], isLoading, error: servicesError, refetch: refetchServices } = useQuery({
    queryKey: ['services', searchTerm, selectedCategory],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedCategory) params.append('category', selectedCategory);
      
      const response = await apiFetch(`/api/services?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch services' }));
        throw new Error(errorData.error || 'Failed to fetch services');
      }
      return response.json();
    },
    retry: 1,
  });

  // Fetch all service categories
  const { data: serviceCategories = [], error: categoriesError } = useQuery({
    queryKey: ['service-categories'],
    queryFn: async () => {
      const response = await apiFetch('/api/categories/services', {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch categories' }));
        throw new Error(errorData.error || 'Failed to fetch categories');
      }
      return response.json();
    },
    retry: 1,
  });

  // Get unique categories from current services (for filter dropdown)
  const categories = [...new Set(services.map(s => s.category).filter(Boolean))];

  // Create service mutation
  const createServiceMutation = useMutation({
    mutationFn: async (serviceData) => {
      const response = await apiFetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(serviceData),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create service');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['service-categories'] });
      setShowAddForm(false);
      resetForm();
      toast.success('Service created successfully!', {
        description: 'The service has been added to your catalog.',
      });
    },
    onError: (error) => {
      toast.error('Failed to create service', {
        description: error.message || 'An error occurred while creating the service.',
      });
    },
  });

  // Update service mutation
  const updateServiceMutation = useMutation({
    mutationFn: async ({ id, ...serviceData }) => {
      const response = await apiFetch(`/api/services/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(serviceData),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update service');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['service-categories'] });
      setEditingService(null);
      resetForm();
      toast.success('Service updated successfully!', {
        description: 'The service details have been saved.',
      });
    },
    onError: (error) => {
      toast.error('Failed to update service', {
        description: error.message || 'An error occurred while updating the service.',
      });
    },
  });

  // Delete service mutation
  const deleteServiceMutation = useMutation({
    mutationFn: async (id) => {
      const response = await apiFetch(`/api/services/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete service');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['service-categories'] });
      toast.success('Service deleted successfully!', {
        description: 'The service has been removed from your catalog.',
      });
    },
    onError: (error) => {
      toast.error('Failed to delete service', {
        description: error.message || 'An error occurred while deleting the service.',
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      category: '',
      price: '',
      price_type: 'fixed',
      price_config: '',
      description: '',
      duration: '',
      features: ''
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Check if category is new
    const category = formData.category.trim();
    const isNewCategory = category && !serviceCategories.includes(category);
    
    if (isNewCategory) {
      setShowNewCategoryPrompt(true);
      setNewCategoryInput(category);
      return;
    }
    
    const serviceData = {
      ...formData,
      price: parseFloat(formData.price),
      price_type: formData.price_type,
      price_config: formData.price_config || null,
      duration: formData.duration ? parseInt(formData.duration) : null,
    };

    // Require password for add/update operations
    requirePassword(editingService ? 'update' : 'create', () => {
      if (editingService) {
        updateServiceMutation.mutate({ id: editingService.id, ...serviceData });
      } else {
        createServiceMutation.mutate(serviceData);
      }
    }, { 
      action: editingService ? 'update_service' : 'create_service',
      service_name: serviceData.name 
    });
    
    setShowNewCategoryPrompt(false);
    setNewCategoryInput('');
  };

  const handleConfirmNewCategory = () => {
    setShowNewCategoryPrompt(false);
    const updatedFormData = { ...formData, category: newCategoryInput };
    setFormData(updatedFormData);
    
    // Submit the form programmatically
    setTimeout(() => {
      const serviceData = {
        ...updatedFormData,
        price: parseFloat(updatedFormData.price),
        price_type: updatedFormData.price_type,
        price_config: updatedFormData.price_config || null,
        duration: updatedFormData.duration ? parseInt(updatedFormData.duration) : null,
      };

      if (editingService) {
        updateServiceMutation.mutate({ id: editingService.id, ...serviceData });
      } else {
        createServiceMutation.mutate(serviceData);
      }
    }, 100);
  };

  const handleEdit = (service) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      category: service.category || '',
      price: service.price.toString(),
      price_type: service.price_type || 'fixed',
      price_config: service.price_config || '',
      description: service.description || '',
      duration: service.duration ? service.duration.toString() : '',
      features: service.features || ''
    });
    setShowAddForm(true);
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

  const handleDelete = (service) => {
    requirePassword('delete', () => {
      setServiceToDelete(service);
      setShowDeleteModal(true);
    }, { service_id: service.id, service_name: service.name });
  };

  const confirmDelete = () => {
    if (serviceToDelete) {
      deleteServiceMutation.mutate(serviceToDelete.id);
      setServiceToDelete(null);
    }
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingService(null);
    resetForm();
    setShowNewCategoryPrompt(false);
    setNewCategoryInput('');
  };

  // Show error state with retry option
  if (servicesError) {
    return (
      <div className="px-4 py-7">
        <div className="glass-card-pro p-6 text-center">
          <p className="text-red-500 mb-4">Error loading services: {servicesError.message}</p>
          <button 
            onClick={() => refetchServices()} 
            className="glass-button-primary px-4 py-2 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-7">
        {/* Header */}
        <div className="analytics-header text-2xl mb-6 flex justify-between items-center">
          <span>Cyber Services Management</span>
          <button onClick={() => requirePassword('create', () => setShowAddForm(true), { action: 'add_service' })} className="glass-button-primary text-white font-semibold flex items-center gap-1.5 py-1 px-3 text-sm">
            <Plus size={16} /> Add Service
          </button>
        </div>

        {/* Add/Edit Service Modal */}
        {showAddForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="glass-card-pro max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-white/30">
                <h2 className="text-lg font-semibold text-analytics-primary">{editingService ? 'Edit Service' : 'Add New Cyber Service'}</h2>
                <button onClick={handleCancel} className="text-analytics-secondary hover:text-analytics-primary"><X size={18} /></button>
              </div>
              <form onSubmit={handleSubmit} className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-analytics-secondary mb-1">Service Name *</label>
                  <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="glass-input w-full px-3 py-2" placeholder="e.g., Network Penetration Test" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-analytics-secondary mb-1">Category *</label>
                  <input type="text" required list="service-categories" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="glass-input w-full px-3 py-2" placeholder="Select or type a category" />
                  <datalist id="service-categories">{serviceCategories.map((cat) => (<option key={cat} value={cat} />))}</datalist>
                  <p className="text-xs text-analytics-secondary mt-1">Select from list or type a new category name</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-analytics-secondary mb-1">Price *</label>
                  <input type="number" step="0.01" required value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} className="glass-input w-full px-3 py-2" placeholder="Base price" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-analytics-secondary mb-1">Price Type *</label>
                  <input type="text" list="price-types" value={formData.price_type} onChange={(e) => setFormData({ ...formData, price_type: e.target.value })} className="glass-input w-full px-3 py-2" placeholder="Select or type a price type" required />
                  <datalist id="price-types">
                    <option value="fixed">Fixed - Standard price</option>
                    <option value="adjustable">Adjustable - Can negotiate</option>
                    <option value="calculated">Calculated - Based on parameters (e.g., printing)</option>
                  </datalist>
                </div>
                {formData.price_type !== 'fixed' && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-analytics-secondary mb-1">Price Configuration</label>
                    <textarea rows={3} value={formData.price_config} onChange={(e) => setFormData({ ...formData, price_config: e.target.value })} className="glass-input w-full px-3 py-2" placeholder="For calculated prices, describe the formula (e.g., 'Base price: $0.50 per page for black/white, $2.00 per page for color')" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-analytics-secondary mb-1">Duration (hours)</label>
                  <input type="number" value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: e.target.value })} className="glass-input w-full px-3 py-2" placeholder="e.g., 8" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-analytics-secondary mb-1">Description</label>
                  <textarea rows={3} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="glass-input w-full px-3 py-2" placeholder="Describe the service..." />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-analytics-secondary mb-1">Features (comma-separated)</label>
                  <textarea rows={2} value={formData.features} onChange={(e) => setFormData({ ...formData, features: e.target.value })} className="glass-input w-full px-3 py-2" placeholder="e.g., External network scan, Report delivery, Remediation guidance" />
                </div>
                <div className="md:col-span-2 flex space-x-3 pt-2 border-t border-white/20">
                  <button type="button" onClick={handleCancel} className="glass-card-pro text-analytics-secondary text-sm py-1 px-3">Cancel</button>
                  <button type="submit" disabled={createServiceMutation.isLoading || updateServiceMutation.isLoading} className="glass-button-primary text-white font-semibold ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm">
                    <Save size={16} /> {editingService ? 'Update Service' : 'Create Service'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* New Category Confirmation Modal */}
        {showNewCategoryPrompt && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
            <div className="glass-card-pro max-w-md w-full mx-4">
              <div className="p-4">
                <h3 className="text-lg font-semibold text-analytics-primary mb-2">Create New Category?</h3>
                <p className="text-sm text-analytics-secondary mb-2">You're creating a new category: <strong className="text-analytics-stock">"{newCategoryInput || formData.category}"</strong></p>
                <p className="text-sm text-analytics-secondary mb-4">This will create a new category that can be used for future services.</p>
                <div className="flex space-x-3">
                  <button onClick={() => { setShowNewCategoryPrompt(false); setNewCategoryInput(''); setFormData({ ...formData, category: '' }); }} className="glass-card-pro text-sm py-1 px-3">Cancel</button>
                  <button onClick={handleConfirmNewCategory} className="glass-button-primary text-white text-sm py-1 px-3">Create Category & Add Service</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="glass-card-pro p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-analytics-secondary" />
              <input type="text" placeholder="Search services..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="glass-input w-full pl-10 pr-4 py-2" />
            </div>
            <div className="relative" ref={categoryDropdownRef}>
              <button
                ref={dropdownButtonRef}
                onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                className="glass-button-secondary flex items-center justify-between gap-2 w-full px-3 py-2 text-sm text-analytics-primary"
              >
                <span>{selectedCategory || 'Filter by category'}</span>
                <ChevronDown size={16} className={`transition-transform duration-200 ${categoryDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {categoryDropdownOpen && typeof document !== 'undefined' && createPortal(
                <div 
                  data-category-dropdown-services
                  style={{ 
                    position: 'fixed',
                    top: `${dropdownPosition.top + 8}px`,
                    right: `${dropdownPosition.right}px`,
                    width: `${dropdownPosition.width || 0}px`,
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
                    <button
                      onClick={() => {
                        setSelectedCategory('');
                        setCategoryDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        !selectedCategory
                          ? 'bg-white/30 text-analytics-primary font-medium'
                          : 'text-analytics-secondary hover:bg-white/20'
                      }`}
                    >
                      All Categories
                    </button>
                    {categories.map((category) => (
                      <button
                        key={category}
                        onClick={() => {
                          setSelectedCategory(category);
                          setCategoryDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          selectedCategory === category
                            ? 'bg-white/30 text-analytics-primary font-medium'
                            : 'text-analytics-secondary hover:bg-white/20'
                        }`}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                </div>,
                document.body
              )}
            </div>
          </div>
        </div>

        {/* Services Grid */}
        <div className="glass-card-pro p-6">
          <div className="-mx-6 px-6 py-4 border-b border-white/10 mb-4"><h2 className="text-lg font-medium text-analytics-primary">Services</h2></div>
          {isLoading ? (
            <div className="text-center py-8 text-analytics-secondary">Loading services...</div>
          ) : services.length === 0 ? (
            <div className="text-center py-8 text-analytics-secondary">No services found</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.map((service) => (
                <div key={service.id} className="glass-card-pro p-4">
                  <div className="flex items-start justify-between mb-2">
                    <Shield className="h-8 w-8 text-analytics-stock" />
                    <div className="flex items-center gap-1 sm:gap-1.5">
                      <button onClick={() => handleEdit(service)} className="glass-card-pro text-blue-700 border border-blue-200 px-1 py-0.5 text-[10px] sm:text-xs leading-tight">Edit</button>
                      <button onClick={() => handleDelete(service)} className="glass-card-pro text-red-700 border border-red-200 px-1 py-0.5 text-[10px] sm:text-xs leading-tight">Delete</button>
                    </div>
                  </div>
                  <h3 className="font-medium text-analytics-primary mb-1">{service.name}</h3>
                  <p className="text-sm text-analytics-stock mb-2">{service.category}</p>
                  {service.description && (<p className="text-sm text-analytics-secondary mb-2">{service.description}</p>)}
                  {service.features && (
                    <div className="mb-2">
                      <p className="text-xs font-medium text-analytics-primary mb-1">Features:</p>
                      <p className="text-xs text-analytics-secondary">{service.features}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-lg font-semibold text-analytics-price">${parseFloat(service.price).toFixed(2)}</span>
                    {service.duration && (<span className="text-sm text-analytics-secondary">{service.duration} hours</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        <ConfirmationModal
          isOpen={showDeleteModal}
          onClose={() => {
            setShowDeleteModal(false);
            setServiceToDelete(null);
          }}
          onConfirm={confirmDelete}
          title="Delete Service"
          message={serviceToDelete ? `Are you sure you want to delete "${serviceToDelete.name}"? This action cannot be undone.` : ''}
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


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
  Package,
  AlertTriangle,
  Save,
  X,
  ChevronDown
} from 'lucide-react';
import { logButtonClick, logActivity } from '@/utils/logActivity';
import ConfirmationModal from '@/components/ConfirmationModal';
import { usePasswordConfirmation } from '@/utils/usePasswordConfirmation';

export default function ProductsManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    barcode: '',
    price: '',
    cost_price: '',
    purchase_total_initial: '',
    purchase_total_added: '',
    stock_quantity: '',
    min_stock_level: '',
    category: '',
    description: '',
    expiry_date: '',
  });
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [showNewCategoryPrompt, setShowNewCategoryPrompt] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0, width: 0 });
  const categoryDropdownRef = useRef(null);
  const dropdownButtonRef = useRef(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);

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
      const dropdownElement = document.querySelector('[data-category-dropdown]');
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

  // Fetch products
  const { data: products = [], isLoading, error: productsError, refetch: refetchProducts } = useQuery({
    queryKey: ['products', searchTerm, selectedCategory],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedCategory) params.append('category', selectedCategory);
      
      const response = await apiFetch(`/api/products?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch products' }));
        throw new Error(errorData.error || 'Failed to fetch products');
      }
      return response.json();
    },
    retry: 1,
  });

  // Fetch all product categories
  const { data: allCategories = [], error: categoriesError } = useQuery({
    queryKey: ['product-categories'],
    queryFn: async () => {
      const response = await apiFetch('/api/categories/products', {
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

  // Get unique categories from current products (for filter dropdown)
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  // Create product mutation
  const createProductMutation = useMutation({
    mutationFn: async (productData) => {
      const response = await apiFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(productData),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create product');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      setShowAddForm(false);
      resetForm();
      toast.success('Product created successfully!', {
        description: 'The product has been added to your inventory.',
      });
    },
    onError: (error) => {
      toast.error('Failed to create product', {
        description: error.message || 'An error occurred while creating the product.',
      });
    },
  });

  // Update product mutation
  const updateProductMutation = useMutation({
    mutationFn: async ({ id, ...productData }) => {
      const response = await apiFetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(productData),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update product');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      setEditingProduct(null);
      resetForm();
      toast.success('Product updated successfully!', {
        description: 'The product details have been saved.',
      });
    },
    onError: (error) => {
      toast.error('Failed to update product', {
        description: error.message || 'An error occurred while updating the product.',
      });
    },
  });

  // Delete product mutation
  const deleteProductMutation = useMutation({
    mutationFn: async (id) => {
      const response = await apiFetch(`/api/products/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete product');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      toast.success('Product deleted successfully!', {
        description: 'The product has been removed from your inventory.',
      });
    },
    onError: (error) => {
      toast.error('Failed to delete product', {
        description: error.message || 'An error occurred while deleting the product.',
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      barcode: '',
      price: '',
      cost_price: '',
      purchase_total_initial: '',
      purchase_total_added: '',
      stock_quantity: '',
      min_stock_level: '',
      category: '',
      description: '',
      expiry_date: '',
    });
  };

  const buildProductPayload = (fd, editingProductArg) => {
    const newStock = parseInt(fd.stock_quantity, 10) || 0;
    let cost_price =
      fd.cost_price !== '' && fd.cost_price != null ? parseFloat(fd.cost_price) : undefined;
    let purchase_unit_cost;

    if (!editingProductArg) {
      if (newStock > 0 && fd.purchase_total_initial !== '' && fd.purchase_total_initial != null) {
        const total = parseFloat(fd.purchase_total_initial);
        if (Number.isFinite(total) && total >= 0) {
          cost_price = total / newStock;
        }
      }
    } else {
      const oldStock = Number(editingProductArg.stock_quantity) || 0;
      const delta = newStock - oldStock;
      if (delta > 0 && fd.purchase_total_added !== '' && fd.purchase_total_added != null) {
        const total = parseFloat(fd.purchase_total_added);
        if (Number.isFinite(total) && total >= 0) {
          purchase_unit_cost = total / delta;
        }
      }
    }

    return {
      name: fd.name,
      barcode: fd.barcode,
      price: parseFloat(fd.price),
      stock_quantity: newStock,
      min_stock_level: parseInt(fd.min_stock_level, 10) || 10,
      category: fd.category,
      description: fd.description,
      cost_price,
      purchase_unit_cost,
      expiry_date: fd.expiry_date || null,
    };
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Check if category is new
    const category = formData.category.trim();
    const isNewCategory = category && !allCategories.includes(category);
    
    if (isNewCategory) {
      setShowNewCategoryPrompt(true);
      setNewCategoryInput(category);
      return;
    }
    
    const productData = buildProductPayload(formData, editingProduct);

    // Require password for add/update operations
    requirePassword(editingProduct ? 'update' : 'create', () => {
      if (editingProduct) {
        logButtonClick('Update Product', `Update product: ${productData.name}`, {
          product_id: editingProduct.id,
          product_name: productData.name,
          price: productData.price,
          stock_quantity: productData.stock_quantity
        });
        updateProductMutation.mutate({ id: editingProduct.id, ...productData });
      } else {
        logButtonClick('Create Product', `Create product: ${productData.name}`, {
          product_name: productData.name,
          price: productData.price,
          stock_quantity: productData.stock_quantity,
          category: productData.category
        });
        createProductMutation.mutate(productData);
      }
    }, { 
      action: editingProduct ? 'update_product' : 'create_product',
      product_name: productData.name 
    });
    
    setShowNewCategoryPrompt(false);
    setNewCategoryInput('');
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      barcode: product.barcode || '',
      price: product.price.toString(),
      cost_price:
        product.cost_price != null && product.cost_price !== ''
          ? String(product.cost_price)
          : '',
      purchase_total_initial: '',
      purchase_total_added: '',
      stock_quantity: product.stock_quantity.toString(),
      min_stock_level: product.min_stock_level.toString(),
      category: product.category || '',
      description: product.description || '',
      expiry_date: product.expiry_date || '',
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

  const handleDelete = (product) => {
    requirePassword('delete', () => {
      setProductToDelete(product);
      setShowDeleteModal(true);
    }, { product_id: product.id, product_name: product.name });
  };

  const confirmDelete = () => {
    if (productToDelete) {
      logButtonClick('Delete Product', `Delete product: ${productToDelete.name}`, {
        product_id: productToDelete.id,
        product_name: productToDelete.name
      });
      deleteProductMutation.mutate(productToDelete.id);
      setProductToDelete(null);
    }
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingProduct(null);
    resetForm();
    setShowNewCategoryPrompt(false);
    setNewCategoryInput('');
  };

  const handleConfirmNewCategory = () => {
    setShowNewCategoryPrompt(false);
    const updatedFormData = { ...formData, category: newCategoryInput };
    setFormData(updatedFormData);
    
    // Submit the form programmatically
    setTimeout(() => {
      const productData = buildProductPayload(updatedFormData, editingProduct);

      if (editingProduct) {
        updateProductMutation.mutate({ id: editingProduct.id, ...productData });
      } else {
        createProductMutation.mutate(productData);
      }
    }, 100);
  };

  // Show error state with retry option
  if (productsError) {
    return (
      <div className="px-4 py-7">
        <div className="glass-card-pro p-6 text-center">
          <p className="text-red-500 mb-4">Error loading products: {productsError.message}</p>
          <button 
            onClick={() => refetchProducts()} 
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
          <span>Products Management</span>
          <button onClick={() => requirePassword('create', () => setShowAddForm(true), { action: 'add_product' })} className="glass-button-primary text-white font-semibold flex items-center gap-1.5 py-1 px-3 text-sm">
            <Plus size={16} /> Add Product
              </button>
        </div>

        {/* Add/Edit Product Modal */}
        {showAddForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="glass-card-pro max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-white/30">
                <h2 className="text-lg font-semibold text-analytics-primary">{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
                <button onClick={handleCancel} className="text-analytics-secondary hover:text-analytics-primary"><X size={18} /></button>
              </div>
              <form onSubmit={handleSubmit} className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                  <label className="block text-xs font-medium text-analytics-secondary mb-1">Product name *</label>
                  <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="glass-input w-full px-3 py-2" placeholder="e.g. Bottled water 500ml" />
              </div>
              <div>
                  <label className="block text-xs font-medium text-analytics-secondary mb-1">Barcode / SKU</label>
                  <input type="text" value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} className="glass-input w-full px-3 py-2" placeholder="Scan or type product barcode (optional)" />
              </div>
              <div>
                  <label className="block text-xs font-medium text-analytics-secondary mb-1">Selling price *</label>
                  <input type="number" step="0.01" required value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} className="glass-input w-full px-3 py-2" placeholder="Price for one unit sold to customers" />
              </div>
              <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-analytics-secondary mb-1">Stock quantity *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.stock_quantity}
                    onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                    className="glass-input w-full px-3 py-2"
                    placeholder={
                      editingProduct
                        ? 'Enter total units on hand after this update'
                        : 'Enter how many units you are adding to inventory now'
                    }
                  />
              </div>
              {!editingProduct ? (
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-analytics-secondary mb-1">Total purchase cost for all units in stock</label>
                  <p className="text-[11px] text-analytics-secondary mb-1">
                    Enter the full amount you paid for this whole batch (all units together, not per unit). We divide by stock quantity to record cost per unit for FIFO. If stock is 0, skip or use cost per unit below.
                  </p>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.purchase_total_initial}
                    onChange={(e) => setFormData({ ...formData, purchase_total_initial: e.target.value })}
                    className="glass-input w-full px-3 py-2"
                    placeholder={
                      parseInt(formData.stock_quantity, 10) > 0
                        ? `Example: ${formData.stock_quantity} units cost 5000 total → enter 5000`
                        : 'Set stock quantity above, then enter the total you paid for all of those units'
                    }
                  />
                </div>
              ) : (
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-analytics-secondary mb-1">Total purchase cost for newly added units only</label>
                  <p className="text-[11px] text-analytics-secondary mb-1">
                    If you increased stock, enter the full amount you paid for the extra units only (entire purchase for that add-on, not per unit). Leave empty if quantity did not go up.
                  </p>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.purchase_total_added}
                    onChange={(e) => setFormData({ ...formData, purchase_total_added: e.target.value })}
                    className="glass-input w-full px-3 py-2"
                    placeholder="Example: added 10 units and paid 800 total → enter 800"
                  />
                </div>
              )}
              <div>
                  <label className="block text-xs font-medium text-analytics-secondary mb-1">
                    {editingProduct ? 'Book cost per unit (optional)' : 'Cost per unit instead of total (optional)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.cost_price}
                    onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                    className="glass-input w-full px-3 py-2"
                    placeholder={
                      editingProduct
                        ? 'Leave blank to keep current book cost; or override displayed average cost'
                        : 'Use only if you prefer to type one unit cost instead of total purchase above'
                    }
                  />
              </div>
              <div>
                  <label className="block text-xs font-medium text-analytics-secondary mb-1">Minimum stock level</label>
                  <input type="number" value={formData.min_stock_level} onChange={(e) => setFormData({ ...formData, min_stock_level: e.target.value })} className="glass-input w-full px-3 py-2" placeholder="Alert when count falls to this number (default 10)" />
              </div>
              <div>
                  <label className="block text-xs font-medium text-analytics-secondary mb-1">Category</label>
                  <input type="text" list="product-categories" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="glass-input w-full px-3 py-2" placeholder="Pick from list or type a new category name" />
                  <datalist id="product-categories">{allCategories.map((cat) => (<option key={cat} value={cat} />))}</datalist>
                </div>
              <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-analytics-secondary mb-1">Description</label>
                  <textarea rows={3} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="glass-input w-full px-3 py-2" placeholder="Optional notes visible to staff (size, supplier, etc.)" />
              </div>
              <div>
                  <label className="block text-xs font-medium text-analytics-secondary mb-1">Expiry date (optional)</label>
                  <input
                    type="date"
                    value={formData.expiry_date}
                    onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                    className="glass-input w-full px-3 py-2"
                    placeholder="Set if this product expires"
                  />
              </div>
                <div className="md:col-span-2 flex space-x-3 pt-2 border-t border-white/20">
                  <button type="button" onClick={handleCancel} className="glass-card-pro text-analytics-secondary text-sm py-1 px-3">Cancel</button>
                  <button type="submit" disabled={createProductMutation.isLoading || updateProductMutation.isLoading} className="glass-button-primary text-white font-semibold ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm">
                    <Save size={16} /> {editingProduct ? 'Update Product' : 'Create Product'}
                </button>
              </div>
            </form>
            </div>
          </div>
        )}

        {/* New Category Confirmation Modal */}
        {showNewCategoryPrompt && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
            <div className="glass-card-pro max-w-md w-full mx-4">
              <div className="p-2">
                <h3 className="text-lg font-semibold text-analytics-primary mb-2">Create New Category?</h3>
                <p className="text-sm text-analytics-secondary mb-2">You're creating a new category: <strong className="text-analytics-stock">"{newCategoryInput || formData.category}"</strong></p>
                <p className="text-sm text-analytics-secondary mb-4">This will create a new category that can be used for future products.</p>
                <div className="flex space-x-3">
                  <button onClick={() => { setShowNewCategoryPrompt(false); setNewCategoryInput(''); setFormData({ ...formData, category: '' }); }} className="glass-card-pro text-sm py-1 px-3">Cancel</button>
                  <button onClick={handleConfirmNewCategory} className="glass-button-primary text-white text-sm py-1 px-3">Create Category & Add Product</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="glass-card-pro p-6 mb-6 relative" style={{ zIndex: 10 }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-analytics-secondary" />
              <input type="text" placeholder="Search products..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="glass-input w-full pl-10 pr-4 py-2" />
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
                  data-category-dropdown
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

        {/* Products Table */}
        <div className="glass-card-pro relative" style={{ zIndex: 1, position: 'relative' }}>
          <div className="px-6 py-4 border-b border-white/20">
            <h2 className="text-lg font-medium text-analytics-primary">Products</h2>
          </div>
          {isLoading ? (
            <div className="text-center py-8 text-analytics-secondary">Loading products...</div>
          ) : products.length === 0 ? (
            <div className="text-center py-8 text-analytics-secondary">No products found</div>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6 products-table-scroll">
              <table className="min-w-full divide-y divide-white/10" style={{ minWidth: '800px' }}>
                <thead className="bg-white/10">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-analytics-secondary uppercase tracking-wider">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-analytics-secondary uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-analytics-secondary uppercase tracking-wider">Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-analytics-secondary uppercase tracking-wider">Stock</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-analytics-secondary uppercase tracking-wider">Barcode</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-analytics-secondary uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {products.map((product) => (
                    <tr key={product.id} className="hover:bg-white/25 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Package className="h-8 w-8 text-analytics-secondary mr-3" />
                          <div>
                            <div className="text-sm font-medium text-analytics-primary">{product.name}</div>
                            <div className="text-sm text-analytics-secondary">{product.description}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-analytics-primary">{product.category || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-analytics-primary">${product.price.toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {product.stock_quantity <= product.min_stock_level && (<AlertTriangle size={16} className="text-analytics-expense mr-1" />)}
                          <span className={`text-sm ${product.stock_quantity === 0 ? 'text-analytics-loss' : product.stock_quantity <= product.min_stock_level ? 'text-analytics-expense' : 'text-analytics-primary'}`}>{product.stock_quantity}</span>
                          <span className="text-xs text-analytics-secondary ml-1">(min: {product.min_stock_level})</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-analytics-primary">{product.barcode || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-1 sm:gap-1.5">
                          <button onClick={() => handleEdit(product)} className="glass-card-pro text-blue-700 border border-blue-200 px-1 py-0.5 text-[10px] sm:text-xs leading-tight">Edit</button>
                          <button onClick={() => handleDelete(product)} className="glass-card-pro text-red-700 border border-red-200 px-1 py-0.5 text-[10px] sm:text-xs leading-tight">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        <ConfirmationModal
          isOpen={showDeleteModal}
          onClose={() => {
            setShowDeleteModal(false);
            setProductToDelete(null);
          }}
          onConfirm={confirmDelete}
          title="Delete Product"
          message={productToDelete ? `Are you sure you want to delete "${productToDelete.name}"? This action cannot be undone.` : ''}
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
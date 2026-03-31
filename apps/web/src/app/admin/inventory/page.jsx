'use client';

import { apiFetch } from '@/utils/apiClient';
import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createPortal } from 'react-dom';
import { 
  Package, 
  AlertTriangle, 
  Search,
  Filter,
  Download,
  FileSpreadsheet,
  X,
  CheckCircle,
  ChevronDown
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { usePasswordConfirmation } from '@/utils/usePasswordConfirmation';
import { saveFile } from '@/utils/saveFile';
import ConfirmationModal from '@/components/ConfirmationModal';

const COLORS = ['#10b981', '#E66E19', '#D63C3C']; // green, orange, red (matching analytics color tokens)

export default function InventoryReport() {
  // Debug: Log when component mounts
  useEffect(() => {
    console.log('🟢 InventoryReport mounted');
    return () => console.log('🔴 InventoryReport unmounted');
  }, []);

  // Password confirmation hook
  const {
    showPasswordModal,
    setShowPasswordModal,
    password,
    setPassword,
    handlePasswordConfirm,
    requirePassword
  } = usePasswordConfirmation();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [stockFilter, setStockFilter] = useState(''); // all, low, out
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [categoryDropdownPosition, setCategoryDropdownPosition] = useState({ top: 0, right: 0, width: 0 });
  const categoryDropdownRef = useRef(null);
  const categoryButtonRef = useRef(null);
  
  const [stockDropdownOpen, setStockDropdownOpen] = useState(false);
  const [stockDropdownPosition, setStockDropdownPosition] = useState({ top: 0, right: 0, width: 0 });
  const stockDropdownRef = useRef(null);
  const stockButtonRef = useRef(null);
  const [showStockChartDropdown, setShowStockChartDropdown] = useState(false);
  const [stockChartDropdownPosition, setStockChartDropdownPosition] = useState({ top: 0, left: 0 });
  const stockChartDropdownRef = useRef(null);
  const stockChartButtonRef = useRef(null);

  // Fetch products for inventory
  const { data: products = [], isLoading, error: productsError, refetch: refetchProducts } = useQuery({
    queryKey: ['products', searchTerm, selectedCategory, stockFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedCategory) params.append('category', selectedCategory);
      if (stockFilter === 'low') params.append('lowStock', 'true');
      if (stockFilter === 'about_to_expire' || stockFilter === 'expired') {
        params.append('expiry', stockFilter);
      }
      
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
  const categories = allCategories.length > 0 ? allCategories : [...new Set(products.map(p => p.category).filter(Boolean))];
  
  // Prepare category options for dropdown
  const categoryOptions = [
    { value: '', label: 'All Categories' },
    ...categories.map(cat => ({ value: cat, label: cat }))
  ];
  
  // Prepare stock/expiry filter options for dropdown
  const stockOptions = [
    { value: '', label: 'All Stock Levels' },
    { value: 'low', label: 'Low Stock Only' },
    { value: 'out', label: 'Out of Stock Only' },
    { value: 'about_to_expire', label: 'About to expire' },
    { value: 'expired', label: 'Expired only' },
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
      const dropdownElement = document.querySelector('[data-category-dropdown]');
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

  // Calculate stock dropdown position
  useEffect(() => {
    if (stockDropdownOpen && stockButtonRef.current) {
      const updatePosition = () => {
        if (stockButtonRef.current) {
          const rect = stockButtonRef.current.getBoundingClientRect();
          setStockDropdownPosition({
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
      let parent = stockButtonRef.current.parentElement;
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
  }, [stockDropdownOpen]);

  // Close stock dropdown when clicking outside (but not on scroll)
  useEffect(() => {
    if (!stockDropdownOpen) return;
    
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
      const dropdownElement = document.querySelector('[data-stock-dropdown]');
      const clickedDropdown = dropdownElement && (dropdownElement.contains(event.target) || dropdownElement === event.target);
      const clickedButton = stockButtonRef.current && stockButtonRef.current.contains(event.target);
      
      if (!clickedButton && !clickedDropdown) {
        setStockDropdownOpen(false);
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
  }, [stockDropdownOpen]);

  // Handle click outside for stock chart dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        showStockChartDropdown &&
        stockChartDropdownRef.current &&
        !stockChartDropdownRef.current.contains(event.target) &&
        stockChartButtonRef.current &&
        !stockChartButtonRef.current.contains(event.target)
      ) {
        setShowStockChartDropdown(false);
      }
    };

    if (showStockChartDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showStockChartDropdown]);

  // Filter products based on stock/expiry filter (API already applied most constraints, but keep local for low/out)
  const filteredProducts = products.filter(product => {
    if (stockFilter === 'low') {
      return product.stock_quantity <= product.min_stock_level && product.stock_quantity > 0;
    } else if (stockFilter === 'out') {
      return product.stock_quantity === 0;
    }
    return true;
  });

  // Calculate inventory statistics
  const totalProducts = products.length;
  const totalValue = products.reduce((sum, product) => sum + (product.stock_quantity * product.price), 0);
  const lowStockCount = products.filter(p => p.stock_quantity <= p.min_stock_level && p.stock_quantity > 0).length;
  const outOfStockCount = products.filter(p => p.stock_quantity === 0).length;
  const averageStockValue = totalProducts > 0 ? totalValue / totalProducts : 0;

  // Get top value products
  const topValueProducts = [...products]
    .sort((a, b) => (b.stock_quantity * b.price) - (a.stock_quantity * a.price))
    .slice(0, 5);

  // Prepare data for stock distribution chart
  const wellStockedCount = products.filter(p => p.stock_quantity > p.min_stock_level).length;
  const stockDistributionData = [
    { name: 'Well Stocked', value: wellStockedCount, color: '#10b981' },
    { name: 'Low Stock', value: lowStockCount, color: '#E66E19' }, // orange to match text-analytics-expense
    { name: 'Out of Stock', value: outOfStockCount, color: '#D63C3C' } // red to match text-analytics-loss
  ].filter(item => item.value > 0); // Only show categories with items

  // Color mapping for chart - ensures correct colors regardless of filtered data
  const getColorForName = (name) => {
    if (name === 'Well Stocked') return '#10b981';
    if (name === 'Low Stock') return '#E66E19';
    if (name === 'Out of Stock') return '#D63C3C';
    return '#8884d8';
  };

  const getStockStatus = (product) => {
    if (product.stock_quantity === 0) {
      return { status: 'Out of Stock', color: 'text-red-600', bgColor: 'bg-red-100' };
    } else if (product.stock_quantity <= product.min_stock_level) {
      return { status: 'Low Stock', color: 'text-orange-600', bgColor: 'bg-orange-100' };
    } else {
      return { status: 'In Stock', color: 'text-green-600', bgColor: 'bg-green-100' };
    }
  };

  const exportToCSV = async () => {
    const headers = ['Product Name', 'Category', 'Stock Quantity', 'Min Stock Level', 'Unit Price', 'Total Value', 'Status'];
    const csvData = filteredProducts.map(product => [
      product.name,
      product.category || '',
      product.stock_quantity,
      product.min_stock_level,
      product.price.toFixed(2),
      (product.stock_quantity * product.price).toFixed(2),
      getStockStatus(product).status
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const dateRange = startDate && endDate ? `_${startDate}_${endDate}` : startDate ? `_from_${startDate}` : endDate ? `_until_${endDate}` : '';
    const categoryStr = selectedCategory ? `_${selectedCategory}` : '';
    const stockStr = stockFilter ? `_${stockFilter}` : '';
    const filename = `inventory-report${dateRange}${categoryStr}${stockStr}_${new Date().toISOString().split('T')[0]}.csv`;
    await saveFile(blob, filename);
  };

  // Export to JSON
  const handleExport = () => {
    requirePassword('export', async () => {
    let content = '';
    let filename = '';
    let mimeType = '';
    
    const dateRange = startDate && endDate ? `_${startDate}_${endDate}` : startDate ? `_from_${startDate}` : endDate ? `_until_${endDate}` : '';
    const categoryStr = selectedCategory ? `_${selectedCategory}` : '';
    const stockStr = stockFilter ? `_${stockFilter}` : '';
    
    if (exportFormat === 'csv') {
      const headers = ['Product Name', 'Category', 'Stock Quantity', 'Min Stock Level', 'Price', 'Total Value', 'Status'];
      const csvData = filteredProducts.map(product => [
        product.name,
        product.category,
        product.stock_quantity,
        product.min_stock_level,
        product.price,
        product.stock_quantity * product.price,
        getStockStatus(product).status
      ]);

      content = [headers, ...csvData]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');
      filename = `inventory-report${dateRange}${categoryStr}${stockStr}_${new Date().toISOString().split('T')[0]}.csv`;
      mimeType = 'text/csv';
    } else if (exportFormat === 'json') {
      const jsonData = filteredProducts.map(product => ({
        id: product.id,
        name: product.name,
        category: product.category,
        stock_quantity: product.stock_quantity,
        min_stock_level: product.min_stock_level,
        price: product.price,
        total_value: product.stock_quantity * product.price,
        status: getStockStatus(product).status,
        barcode: product.barcode,
        description: product.description
      }));

      content = JSON.stringify(jsonData, null, 2);
      filename = `inventory-report${dateRange}${categoryStr}${stockStr}_${new Date().toISOString().split('T')[0]}.json`;
      mimeType = 'application/json';
    }
    
    const blob = new Blob([content], { type: mimeType });
    await saveFile(blob, filename);
      setShowExportModal(false);
      toast.success('Export completed successfully!', {
        description: `Your inventory data has been exported as ${filename}`,
      });
    }, { action: 'export_inventory' });
  };

  return (
    <div className="px-4 py-7">
        {/* Header */}
        <div className="analytics-header text-2xl mb-7 flex justify-between items-center">
          <span>Inventory Report</span>
          <button onClick={() => setShowExportModal(true)} className="glass-button-primary text-white font-semibold flex items-center gap-1.5 py-1 px-3 text-sm">
            <Download size={16} /> Export
          </button>
        </div>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div className="glass-card-pro py-6 px-5 flex flex-col items-center bounce-in">
            <span className="text-analytics-secondary text-xs mb-1">Total Products</span>
            <span className="text-3xl text-analytics-primary font-bold soft-shadow">{totalProducts}</span>
          </div>
          <div className="glass-card-pro py-6 px-5 flex flex-col items-center bounce-in">
            <span className="text-analytics-secondary text-xs mb-1">Total Inventory Value</span>
            <span className="text-3xl text-analytics-revenue font-bold soft-shadow">${totalValue.toFixed(2)}</span>
          </div>
          <div className="glass-card-pro py-6 px-5 flex flex-col items-center bounce-in">
            <span className="text-analytics-secondary text-xs mb-1">Low Stock Items</span>
            <span className="text-3xl text-analytics-expense font-bold soft-shadow">{lowStockCount}</span>
          </div>
          <div className="glass-card-pro py-6 px-5 flex flex-col items-center bounce-in">
            <span className="text-analytics-secondary text-xs mb-1">Out of Stock</span>
            <span className="text-3xl text-analytics-loss font-bold soft-shadow">{outOfStockCount}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Top Value Products */}
          <div className="glass-card-pro p-6">
            <h2 className="text-lg font-semibold text-analytics-primary mb-4">Highest Value Inventory</h2>
            {topValueProducts.length > 0 ? (
              <div className="space-y-3">
                {topValueProducts.map((product, index) => (
                  <div key={product.id} className="flex items-center justify-between p-3 bg-white/20 rounded-md hover:bg-white/30 transition-colors">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-medium text-analytics-secondary">#{index + 1}</span>
                      <div>
                        <h3 className="font-medium text-analytics-primary">{product.name}</h3>
                        <p className="text-sm text-analytics-secondary">{product.category}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-analytics-revenue">
                        ${(product.stock_quantity * product.price).toFixed(2)}
                      </p>
                      <p className="text-sm text-analytics-secondary">
                        {product.stock_quantity} × ${product.price.toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-analytics-secondary text-center py-8">No products found</p>
            )}
          </div>

          {/* Stock Distribution */}
          <div className="lg:col-span-2 glass-card-pro p-6">
            <h2 className="text-lg font-semibold text-analytics-primary mb-4">Stock Status Distribution</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left side: Statistics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4">
                <div className="text-center p-4 bg-white/20 rounded-lg hover:bg-white/30 transition-colors">
                  <CheckCircle size={24} className="mx-auto mb-2 text-analytics-stock" />
                  <div className="text-2xl font-bold text-analytics-stock">
                    {wellStockedCount}
                  </div>
                  <div className="text-sm text-analytics-stock font-medium">Well Stocked</div>
                  <div className="text-xs text-analytics-secondary mt-1">
                    {totalProducts > 0 ? 
                      ((wellStockedCount / totalProducts) * 100).toFixed(1) 
                      : 0}% of total
                  </div>
                </div>
                
                <div className="text-center p-4 bg-white/20 rounded-lg hover:bg-white/30 transition-colors">
                  <AlertTriangle size={24} className="mx-auto mb-2 text-analytics-expense" />
                  <div className="text-2xl font-bold text-analytics-expense">{lowStockCount}</div>
                  <div className="text-sm text-analytics-expense font-medium">Low Stock</div>
                  <div className="text-xs text-analytics-secondary mt-1">
                    {totalProducts > 0 ? ((lowStockCount / totalProducts) * 100).toFixed(1) : 0}% of total
                  </div>
                </div>
                
                <div className="text-center p-4 bg-white/20 rounded-lg hover:bg-white/30 transition-colors">
                  <X size={24} className="mx-auto mb-2 text-analytics-loss" />
                  <div className="text-2xl font-bold text-analytics-loss">{outOfStockCount}</div>
                  <div className="text-sm text-analytics-loss font-medium">Out of Stock</div>
                  <div className="text-xs text-analytics-secondary mt-1">
                    {totalProducts > 0 ? ((outOfStockCount / totalProducts) * 100).toFixed(1) : 0}% of total
                  </div>
                </div>
              </div>

              {/* Right side: Visual Chart */}
              <div className="flex flex-col">
                {stockDistributionData.length > 0 ? (
                  <div className="w-full h-[200px] min-h-[200px] max-h-[200px]">
                    <div className="flex items-center justify-end mb-2">
                      <button
                        ref={stockChartButtonRef}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const dropdownWidth = 400;
                          const viewportWidth = window.innerWidth;
                          const rightEdge = rect.right;
                          
                          let left = rect.left + window.scrollX;
                          if (rightEdge + dropdownWidth > viewportWidth) {
                            left = rect.right + window.scrollX - dropdownWidth;
                          }
                          if (left < window.scrollX) {
                            left = window.scrollX + 8;
                          }
                          
                          setStockChartDropdownPosition({
                            top: rect.bottom + window.scrollY + 8,
                            left: left
                          });
                          setShowStockChartDropdown(!showStockChartDropdown);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-white/10 text-analytics-secondary hover:bg-white/20 flex items-center gap-1.5"
                      >
                        <span>View All</span>
                        <ChevronDown size={14} className={showStockChartDropdown ? 'rotate-180' : ''} />
                      </button>
                    </div>
                    <div className="w-full flex-1 min-h-0" style={{ height: 'calc(100% - 36px)' }}>
                      <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stockDistributionData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ percent }) => {
                            if (percent < 0.05) return '';
                            return `${(percent * 100).toFixed(0)}%`;
                          }}
                          outerRadius={70}
                          innerRadius={25}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {stockDistributionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getColorForName(entry.name)} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value, name, props) => {
                            const payload = props.payload;
                            const percentage = totalProducts > 0 ? ((value / totalProducts) * 100).toFixed(1) : 0;
                            return [`${value} items (${percentage}%)`, name];
                          }}
                          contentStyle={{
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            border: '1px solid rgba(0, 0, 0, 0.1)',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            fontSize: '12px'
                          }}
                        />
                      </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-analytics-secondary">
                    <div className="text-center">
                      <Package size={32} className="mx-auto mb-2 opacity-50" />
                      <p>No stock data available</p>
                    </div>
                  </div>
                )}
                
                {/* Quick Insights */}
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-2 bg-white/10 rounded-md">
                      <div className="text-xs text-analytics-secondary mb-1">Stock Health</div>
                      <div className={`text-sm font-semibold ${
                        (wellStockedCount / totalProducts) >= 0.7 ? 'text-analytics-stock' :
                        (wellStockedCount / totalProducts) >= 0.5 ? 'text-analytics-expense' :
                        'text-analytics-loss'
                      }`}>
                        {totalProducts > 0 ? ((wellStockedCount / totalProducts) * 100).toFixed(0) : 0}%
                      </div>
                    </div>
                    <div className="text-center p-2 bg-white/10 rounded-md">
                      <div className="text-xs text-analytics-secondary mb-1">Attention Needed</div>
                      <div className="text-sm font-semibold text-analytics-expense">
                        {lowStockCount + outOfStockCount}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
                  placeholder="Search products..."
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
                  <span>{selectedCategory ? categoryOptions.find(opt => opt.value === selectedCategory)?.label || 'Filter by category' : 'Filter by category'}</span>
                  <ChevronDown size={16} className={`transition-transform duration-200 ${categoryDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {categoryDropdownOpen && typeof document !== 'undefined' && createPortal(
                  <div 
                    data-category-dropdown
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
                            setSelectedCategory(option.value);
                            setCategoryDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                            selectedCategory === option.value
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
              <label className="block text-xs font-medium text-analytics-secondary mb-1">Stock Status</label>
              <div className="relative" ref={stockDropdownRef}>
                <button
                  ref={stockButtonRef}
                  onClick={() => setStockDropdownOpen(!stockDropdownOpen)}
                  className="glass-button-secondary flex items-center justify-between gap-2 w-full px-3 py-2 text-sm text-analytics-primary"
                >
                  <span>{stockFilter ? stockOptions.find(opt => opt.value === stockFilter)?.label || 'Filter by stock' : 'Filter by stock'}</span>
                  <ChevronDown size={16} className={`transition-transform duration-200 ${stockDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {stockDropdownOpen && typeof document !== 'undefined' && createPortal(
                  <div 
                    data-stock-dropdown
                    style={{ 
                      position: 'fixed',
                      top: `${stockDropdownPosition.top + 8}px`,
                      right: `${stockDropdownPosition.right}px`,
                      width: `${stockDropdownPosition.width || 0}px`,
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
                      {stockOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => {
                            setStockFilter(option.value);
                            setStockDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                            stockFilter === option.value
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
              <label className="block text-xs font-medium text-analytics-secondary mb-1">Actions</label>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('');
                  setStockFilter('');
                }}
                className="glass-button-secondary w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-analytics-primary"
              >
                <Filter size={16} /> <span>Clear Filters</span>
              </button>
            </div>
          </div>
        </div>

        {/* Inventory Table */}
        <div className="glass-card-pro overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-lg font-semibold text-analytics-primary">
              Inventory Details ({filteredProducts.length} products)
            </h2>
          </div>
          
          {isLoading ? (
            <div className="text-center py-8 text-analytics-secondary">Loading inventory...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-8 text-analytics-secondary">No products found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10">
                <thead className="bg-white/10">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-analytics-secondary uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-analytics-secondaryunta uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-analytics-secondary uppercase tracking-wider">
                      Stock Level
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-analytics-secondary uppercase tracking-wider">
                      Unit Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-analytics-secondary uppercase tracking-wider">
                      Total Value
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-analytics-secondary uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {filteredProducts.map((product) => {
                    const stockStatus = getStockStatus(product);
                    const totalValue = product.stock_quantity * product.price;
                    
                    return (
                      <tr key={product.id} className="hover:bg-white/25 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Package className="h-8 w-8 text-analytics-secondary mr-3" />
                            <div>
                              <div className="text-sm font-medium text-analytics-primary">
                                {product.name}
                              </div>
                              <div className="text-sm text-analytics-secondary">
                                {product.description}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-analytics-primary">
                          {product.category || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {product.stock_quantity <= product.min_stock_level && (
                              <AlertTriangle size={16} className="text-analytics-expense mr-1" />
                            )}
                            <span className={`text-sm font-medium ${product.stock_quantity === 0 ? 'text-analytics-loss' : product.stock_quantity <= product.min_stock_level ? 'text-analytics-expense' : 'text-analytics-stock'}`}>
                              {product.stock_quantity}
                            </span>
                            <span className="text-xs text-analytics-secondary ml-1">
                              / {product.min_stock_level} min
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-analytics-primary">
                          ${product.price.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-analytics-revenue">
                          ${totalValue.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            product.stock_quantity === 0 ? 'bg-red-100/50 text-analytics-loss' : 
                            product.stock_quantity <= product.min_stock_level ? 'bg-orange-100/50 text-analytics-expense' : 
                            'bg-green-100/50 text-analytics-stock'
                          }`}>
                            {stockStatus.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Export Modal */}
        {showExportModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="glass-card-pro max-w-md w-full mx-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/30">
                <h2 className="text-xl font-semibold text-analytics-primary">Export Inventory Data</h2>
                <button onClick={() => setShowExportModal(false)} className="text-analytics-secondary hover:text-analytics-primary"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4">
                <label className="block text-sm font-medium text-analytics-secondary mb-2">Select Format</label>
                <div className="space-y-2">
                  <button onClick={() => setExportFormat('csv')} className={`w-full flex items-center space-x-2 p-2.5 border rounded-md transition-colors text-left ${exportFormat === 'csv' ? 'border-blue-500 bg-blue-50/70' : 'border-white/10 hover:bg-white/5'}`}> <FileSpreadsheet size={18} className="text-green-600" /> <div><p className="font-medium text-sm text-analytics-primary">CSV Format</p><p className="text-xs text-analytics-secondary">Comma-separated values file</p></div></button>
                  <button onClick={() => setExportFormat('json')} className={`w-full flex items-center space-x-2 p-2.5 border rounded-md transition-colors text-left ${exportFormat === 'json' ? 'border-blue-500 bg-blue-50/70' : 'border-white/10 hover:bg-white/5'}`}> <FileSpreadsheet size={18} className="text-blue-600" /> <div><p className="font-medium text-sm text-analytics-primary">JSON Format</p><p className="text-xs text-analytics-secondary">JavaScript Object Notation file</p></div></button>
                </div>
                <div className="text-sm text-analytics-secondary bg-white/10 p-3 rounded-md">
                  <p>Export will include data based on your current filters:</p>
                  {selectedCategory && (<p className="mt-1">• Category: {selectedCategory}</p>)}
                  {stockFilter && (<p className="mt-1">• Stock Filter: {stockFilter}</p>)}
                  {filteredProducts.length > 0 && (<p className="mt-1">• {filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'} will be exported</p>)}
                  {!selectedCategory && !stockFilter && (<p className="mt-1">• All products</p>)}
                </div>
                <button onClick={handleExport} className="w-full mt-6 glass-button-primary text-white font-semibold py-1 px-3 text-sm">Export Data</button>
              </div>
            </div>
          </div>
        )}
      
      {/* Stock Chart Dropdown */}
      {showStockChartDropdown && typeof window !== 'undefined' && stockDistributionData && stockDistributionData.length > 0 && createPortal(
        <div
          ref={stockChartDropdownRef}
          className="fixed z-50 glass-card-pro p-4 min-w-[320px] max-w-[400px] max-h-[400px] overflow-y-auto category-dropdown-scroll shadow-2xl"
          style={{
            top: `${stockChartDropdownPosition.top}px`,
            left: `${stockChartDropdownPosition.left}px`,
          }}
        >
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-analytics-primary mb-3 pb-2 border-b border-white/10">
              Stock Distribution
            </h4>
            {stockDistributionData.map((item, index) => {
              const color = getColorForName(item.name);
              const percentage = totalProducts > 0 ? ((item.value / totalProducts) * 100).toFixed(1) : '0';
              
              return (
                <div
                  key={item.name || index}
                  className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-analytics-primary font-medium truncate">
                      {item.name || 'Unknown'}
                    </p>
                    <p className="text-xs text-analytics-secondary">
                      {item.value} items • {percentage}%
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>,
        document.body
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
    </div>
  );
}

'use client';

import { apiFetch } from '@/utils/apiClient';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ShoppingCart,
  Package,
  Download,
  Calendar,
  X,
  FileSpreadsheet,
  ChevronDown
} from 'lucide-react';
import ConfirmationModal from '@/components/ConfirmationModal';
import { usePasswordConfirmation } from '@/utils/usePasswordConfirmation';
import { saveFile } from '@/utils/saveFile';
import { useCurrencySettings } from '@/utils/currency';
import { useTimezoneSettings } from '@/utils/timezone';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// --- Utility & stub data ---
const stores = [{ id: 1, name: 'Main' }, { id: 2, name: 'Branch A' }]; // TODO: backend
const cashiers = [{ id: 1, name: 'Jane Doe' }, { id: 2, name: 'John Smith' }]; // TODO: backend
const itemImgPlaceholder = '/placeholder-prod.png';

export default function AnalyticsPro() {
  const { formatMoney } = useCurrencySettings();
  const { formatCustom } = useTimezoneSettings();
  // Password confirmation hook
  const {
    showPasswordModal,
    setShowPasswordModal,
    password,
    setPassword,
    handlePasswordConfirm,
    requirePassword
  } = usePasswordConfirmation();
  
  // State for filters, search, selected item, periods, etc.
  const [periodPreset, setPeriodPreset] = useState('last30');
  const [customRange, setCustomRange] = useState([null, null]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedCashier, setSelectedCashier] = useState('');
  const [includeServices, setIncludeServices] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null); // product or service
  const [selectedItemInput, setSelectedItemInput] = useState(''); // for the input field value
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [showFilterCard, setShowFilterCard] = useState(false);
  const [itemType, setItemType] = useState('product');
  const [selectedItemDetail, setSelectedItemDetail] = useState(null);
  const [aiInsight, setAiInsight] = useState('');
  const [conversationHistory, setConversationHistory] = useState([]);
  const [followUpPrompt, setFollowUpPrompt] = useState('');
  const [isLoadingFollowUp, setIsLoadingFollowUp] = useState(false);
  const [periodType, setPeriodType] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPeriod, setExportPeriod] = useState('all');
  const [exportFormat, setExportFormat] = useState('csv');
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false);
  const [storeDropdownPosition, setStoreDropdownPosition] = useState({ top: 0, right: 0, width: 0 });
  const [cashierDropdownOpen, setCashierDropdownOpen] = useState(false);
  const [cashierDropdownPosition, setCashierDropdownPosition] = useState({ top: 0, right: 0, width: 0 });
  const [itemDropdownOpen, setItemDropdownOpen] = useState(false);
  const [itemDropdownPosition, setItemDropdownPosition] = useState({ top: 0, right: 0, width: 0 });
  const [itemSearchTerm, setItemSearchTerm] = useState('');
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [categoryDropdownPosition, setCategoryDropdownPosition] = useState({ top: 0, right: 0, width: 0 });
  const [showProfitabilityDropdown, setShowProfitabilityDropdown] = useState(false);
  const [profitabilityDropdownPosition, setProfitabilityDropdownPosition] = useState({ top: 0, right: 0, width: 0 });
  const [showCategorySalesDropdown, setShowCategorySalesDropdown] = useState(false);
  const [categorySalesDropdownPosition, setCategorySalesDropdownPosition] = useState({ top: 0, left: 0 });
  const storeDropdownRef = useRef(null);
  const storeButtonRef = useRef(null);
  const cashierDropdownRef = useRef(null);
  const cashierButtonRef = useRef(null);
  const itemDropdownRef = useRef(null);
  const itemButtonRef = useRef(null);
  const periodDropdownRef = useRef(null);
  const categoryDropdownRef = useRef(null);
  const categoryButtonRef = useRef(null);
  const profitabilityButtonRef = useRef(null);
  const categorySalesButtonRef = useRef(null);

  // Helper function to calculate dropdown position
  const setupDropdownPosition = (buttonRef, setPosition, isOpen) => {
    if (isOpen && buttonRef.current) {
      const updatePosition = () => {
        if (buttonRef.current) {
          const rect = buttonRef.current.getBoundingClientRect();
          setPosition({
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
      let parent = buttonRef.current.parentElement;
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
  };

  // Calculate category dropdown position
  useEffect(() => {
    return setupDropdownPosition(categoryButtonRef, setCategoryDropdownPosition, categoryDropdownOpen);
  }, [categoryDropdownOpen]);

  // Calculate store dropdown position
  useEffect(() => {
    return setupDropdownPosition(storeButtonRef, setStoreDropdownPosition, storeDropdownOpen);
  }, [storeDropdownOpen]);

  // Calculate cashier dropdown position
  useEffect(() => {
    return setupDropdownPosition(cashierButtonRef, setCashierDropdownPosition, cashierDropdownOpen);
  }, [cashierDropdownOpen]);

  // Calculate item dropdown position (use the input container, not the button)
  useEffect(() => {
    if (itemDropdownOpen && itemDropdownRef.current) {
      const updatePosition = () => {
        if (itemDropdownRef.current) {
          const rect = itemDropdownRef.current.getBoundingClientRect();
          setItemDropdownPosition({
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
      let parent = itemDropdownRef.current.parentElement;
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
  }, [itemDropdownOpen]);

  // Helper function to handle click outside for dropdowns
  const setupClickOutside = (buttonRef, dataAttribute, setIsOpen, isOpen) => {
    if (!isOpen) return;
    
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
      const dropdownElement = document.querySelector(`[data-${dataAttribute}]`);
      const clickedDropdown = dropdownElement && (dropdownElement.contains(event.target) || dropdownElement === event.target);
      const clickedButton = buttonRef.current && buttonRef.current.contains(event.target);
      
      if (!clickedButton && !clickedDropdown) {
        setIsOpen(false);
      }
    };
    
    window.addEventListener('scroll', handleScrollStart, true);
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      window.removeEventListener('scroll', handleScrollStart, true);
      document.removeEventListener('mousedown', handleClickOutside);
      clearTimeout(scrollTimeout);
    };
  };

  // Close category dropdown when clicking outside
  useEffect(() => {
    return setupClickOutside(categoryButtonRef, 'category-dropdown', setCategoryDropdownOpen, categoryDropdownOpen);
  }, [categoryDropdownOpen]);

  // Close store dropdown when clicking outside
  useEffect(() => {
    return setupClickOutside(storeButtonRef, 'store-dropdown', setStoreDropdownOpen, storeDropdownOpen);
  }, [storeDropdownOpen]);

  // Close cashier dropdown when clicking outside
  useEffect(() => {
    return setupClickOutside(cashierButtonRef, 'cashier-dropdown', setCashierDropdownOpen, cashierDropdownOpen);
  }, [cashierDropdownOpen]);

  // Close item dropdown when clicking outside
  useEffect(() => {
    return setupClickOutside(itemButtonRef, 'item-dropdown', setItemDropdownOpen, itemDropdownOpen);
  }, [itemDropdownOpen]);

  // Calculate profitability dropdown position (using fixed positioning like sales page)
  useEffect(() => {
    if (showProfitabilityDropdown && profitabilityButtonRef.current) {
      const updatePosition = () => {
        if (profitabilityButtonRef.current) {
          const rect = profitabilityButtonRef.current.getBoundingClientRect();
          setProfitabilityDropdownPosition({
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
      let parent = profitabilityButtonRef.current.parentElement;
      const scrollableParents = [];
      while (parent && parent !== document.body) {
        const overflow = window.getComputedStyle(parent).overflow;
        if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') {
          scrollableParents.push(parent);
        }
        parent = parent.parentElement;
      }
      
      scrollableParents.forEach(el => {
        el.addEventListener('scroll', handleScroll, true);
      });
      
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
  }, [showProfitabilityDropdown]);

  // Handle click outside for profitability dropdown
  useEffect(() => {
    if (!showProfitabilityDropdown) return;
    
    const handleClickOutside = (event) => {
      // Check if click is outside both button and dropdown
      const dropdownElement = document.querySelector('[data-profitability-dropdown]');
      const clickedDropdown = dropdownElement && (dropdownElement.contains(event.target) || dropdownElement === event.target);
      const clickedButton = profitabilityButtonRef.current && profitabilityButtonRef.current.contains(event.target);
      
      if (!clickedButton && !clickedDropdown) {
        setShowProfitabilityDropdown(false);
      }
    };

    // Use a small delay to avoid immediate closing
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProfitabilityDropdown]);

  // Calculate category sales dropdown position (positioned to the left, top-right corner under button)
  useEffect(() => {
    if (showCategorySalesDropdown && categorySalesButtonRef.current) {
      const updatePosition = () => {
        if (categorySalesButtonRef.current) {
          const rect = categorySalesButtonRef.current.getBoundingClientRect();
          // Position dropdown to the left, with top-right corner aligned with button's bottom-right
          // So: dropdown's right edge = button's right edge
          setCategorySalesDropdownPosition({
            top: rect.bottom,
            left: Math.max(8, rect.right - 320) // 320 is maxWidth, ensure 8px margin from left edge
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
      let parent = categorySalesButtonRef.current.parentElement;
      const scrollableParents = [];
      while (parent && parent !== document.body) {
        const overflow = window.getComputedStyle(parent).overflow;
        if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') {
          scrollableParents.push(parent);
        }
        parent = parent.parentElement;
      }
      
      scrollableParents.forEach(el => {
        el.addEventListener('scroll', handleScroll, true);
      });
      
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
  }, [showCategorySalesDropdown]);

  // Handle click outside for category sales dropdown
  useEffect(() => {
    if (!showCategorySalesDropdown) return;
    
    const handleClickOutside = (event) => {
      // Check if click is outside both button and dropdown
      const dropdownElement = document.querySelector('[data-category-sales-dropdown]');
      const clickedDropdown = dropdownElement && (dropdownElement.contains(event.target) || dropdownElement === event.target);
      const clickedButton = categorySalesButtonRef.current && categorySalesButtonRef.current.contains(event.target);
      
      if (!clickedButton && !clickedDropdown) {
        setShowCategorySalesDropdown(false);
      }
    };

    // Use a small delay to avoid immediate closing
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCategorySalesDropdown]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (periodDropdownRef.current && !periodDropdownRef.current.contains(event.target)) {
        setPeriodDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close sidebar on mobile when resizing to mobile viewport
  useEffect(() => {
    // Handle resize if needed
  }, []);

  // Fetch all products/services for selection
  const { data: allProducts = [], isLoading: productsLoading, error: productsError } = useQuery({
    queryKey: ['all-products'],
    queryFn: async () => {
      const res = await apiFetch('/api/products');
      return res.ok ? res.json() : [];
    },
  });
  const { data: allServices = [], isLoading: servicesLoading, error: servicesError } = useQuery({
    queryKey: ['all-services'],
    queryFn: async () => {
      const res = await apiFetch('/api/services');
      return res.ok ? res.json() : [];
    },
  });
  // Fetch categories for products and services
  const { data: productCategories = [] } = useQuery({
    queryKey: ['product-categories'],
    queryFn: async () => {
      const res = await apiFetch('/api/categories/products');
      return res.ok ? res.json() : [];
    },
  });
  const { data: serviceCategories = [] } = useQuery({
    queryKey: ['service-categories'],
    queryFn: async () => {
      const res = await apiFetch('/api/categories/services');
      return res.ok ? res.json() : [];
    },
  });

  // Unified item options list for the filter card
  const itemOptions = React.useMemo(() => {
    const products = (allProducts || []).map((p) => ({ key: `p-${p.id}`, id: p.id, name: p.name, type: 'product', category: p.category || '' }));
    const services = (allServices || []).map((s) => ({ key: `s-${s.name}`, id: null, name: s.name, type: 'service', category: s.category || '' }));
    return [...products, ...services];
  }, [allProducts, allServices]);

  // Function to find the best matching item based on filters
  const findBestMatchingItem = () => {
    let filtered = [...itemOptions];
    
    // Filter by category if selected
    if (selectedCategories.length > 0 && selectedCategories[0]) {
      filtered = filtered.filter(item => 
        item.category && item.category.toLowerCase() === selectedCategories[0].toLowerCase()
      );
    }
    
    // Filter by includeServices checkbox
    if (!includeServices) {
      filtered = filtered.filter(item => item.type === 'product');
    }
    
    // Filter by search term if provided
    if (searchTerm && searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        item.name.toLowerCase().includes(searchLower)
      );
    }
    
    // Return the first matching item
    if (filtered.length > 0) {
      return filtered[0];
    }
    
    // If no matches based on filters, return first available item (respecting includeServices)
    const available = includeServices ? itemOptions : itemOptions.filter(item => item.type === 'product');
    return available.length > 0 ? available[0] : null;
  };
  const categoryOptions = React.useMemo(() => {
    const pc = Array.isArray(productCategories) ? productCategories : [];
    const sc = Array.isArray(serviceCategories) ? serviceCategories : [];
    const merged = new Set([...pc, ...sc].filter(Boolean));
    return Array.from(merged);
  }, [productCategories, serviceCategories]);

  // Sync selectedItemInput with selectedItem when itemOptions change
  React.useEffect(() => {
    if (selectedItem && itemOptions.length > 0) {
      const matched = itemOptions.find(o => 
        (o.type === 'product' && o.id === selectedItem) || 
        (o.type === 'service' && o.name === selectedItem)
      );
      if (matched) {
        setSelectedItemInput(matched.name);
      }
    } else if (!selectedItem) {
      setSelectedItemInput('');
    }
  }, [selectedItem, itemOptions]);

  // Watch for filter changes and update details panel accordingly
  React.useEffect(() => {
    // Check if any filters are active (category, store, cashier) or item is selected
    const hasFilters = (selectedCategories.length > 0 && selectedCategories[0]) || 
                       selectedStore || 
                       selectedCashier || 
                       selectedItem;
    
    if (!hasFilters) {
      // No filters or items selected, hide detail panel
      setSelectedItemDetail(null);
      setAiInsight('');
      setConversationHistory([]);
      setShowDetailPanel(false);
      return;
    }
    
    // Build filter-based analytics URL
    let url = '/api/analytics/filter-details?';
    const queryParams = [];
    
    // Category filter
    if (selectedCategories.length > 0 && selectedCategories[0]) {
      queryParams.push(`category=${encodeURIComponent(selectedCategories[0])}`);
    }
    
    // Store filter
    if (selectedStore) {
      queryParams.push(`store=${encodeURIComponent(selectedStore)}`);
    }
    
    // Cashier filter
    if (selectedCashier) {
      queryParams.push(`cashier=${encodeURIComponent(selectedCashier)}`);
    }
    
    // Item-specific filter (takes precedence over category aggregation)
    if (selectedItem) {
      if (itemType === 'product') {
        queryParams.push(`itemType=product&itemId=${selectedItem}`);
      } else {
        queryParams.push(`itemType=service&itemName=${encodeURIComponent(selectedItem)}`);
      }
    }
    
    // Include services
    queryParams.push(`includeServices=${includeServices}`);
    
    // Date filters
    if (startDate) queryParams.push(`startDate=${startDate}`);
    if (endDate) queryParams.push(`endDate=${endDate}`);
    
    url += queryParams.join('&');
    
    // Fetch aggregated analytics based on all active filters
    apiFetch(url).then(res => res.json()).then(data => {
      if (data.error) {
        console.error('Error fetching filter details:', data.error);
        setSelectedItemDetail(null);
        return;
      }
      
      setSelectedItemDetail(data);
      if (!data.stats) {
        // Clear AI insights if no stats available
        setAiInsight('');
        setConversationHistory([]);
        return;
      }
      
      // Clear AI insights when filters change - start fresh
      setAiInsight('');
      setConversationHistory([]);
      
      // Build detailed context message with actual data from filter details
      let contextMessage = '';
      
      // Build filter description for context
      const filters = [];
      if (selectedCategories.length > 0 && selectedCategories[0]) filters.push(`Category: ${selectedCategories[0]}`);
      if (selectedStore) filters.push(`Store: ${selectedStore}`);
      if (selectedCashier) filters.push(`Cashier: ${selectedCashier}`);
      if (startDate || endDate) {
        const dateRange = startDate && endDate ? `${startDate} to ${endDate}` : startDate ? `from ${startDate}` : `until ${endDate}`;
        filters.push(`Date Range: ${dateRange}`);
      }
      if (!includeServices) filters.push(`Items Type: Products Only`);
      
      const filterDescription = filters.length > 0 ? `Filters: ${filters.join(', ')}. ` : '';
      
      // Build detailed data context with actual numbers
      const stats = data.stats || {};
      const meta = data.meta || {};
      const trends = data.trends || [];
      
      let dataContext = '';
      
      if (selectedItem && (meta.type === 'product' || meta.type === 'service')) {
        // Individual product/service analysis
        dataContext = `
ACTUAL DATA FOR ${meta.type.toUpperCase()}: "${meta.name}"
- Units Sold: ${stats.total_quantity || 0}
- Total Revenue: $${parseFloat(stats.total_revenue || 0).toFixed(2)}
- COGS (Cost of Goods Sold): $${parseFloat(stats.total_expenses || 0).toFixed(2)}
- Profit: $${parseFloat(stats.profit || 0).toFixed(2)}
- Profit Margin: ${parseFloat(stats.profit_margin || 0).toFixed(2)}%
- Total Sales Count: ${stats.total_sales || 0}
- Returns: ${stats.total_returns || 0} units
${meta.sku ? `- SKU: ${meta.sku}` : ''}
${meta.category ? `- Category: ${meta.category}` : ''}
${trends.length > 0 ? `- Sales Trend: ${trends.length} data points available` : ''}
`;
        contextMessage = `${filterDescription}Analyze this specific ${meta.type} using the ACTUAL DATA provided above. Provide insights about:
1. Sales performance (${stats.total_quantity || 0} units sold, $${parseFloat(stats.total_revenue || 0).toFixed(2)} revenue)
2. Profitability (${parseFloat(stats.profit_margin || 0).toFixed(2)}% margin, $${parseFloat(stats.profit || 0).toFixed(2)} profit)
3. Performance trends based on the data
4. Actionable recommendations specific to this ${meta.type}
${trends.length > 0 ? '5. Analyze the sales trends over time' : ''}

Use ONLY the actual numbers provided above.`;
      } else if (selectedCategories.length > 0 && selectedCategories[0]) {
        // Category aggregation analysis
        dataContext = `
ACTUAL DATA FOR CATEGORY: "${selectedCategories[0]}"
- Total Units Sold: ${stats.total_quantity || 0}
- Total Revenue: $${parseFloat(stats.total_revenue || 0).toFixed(2)}
- Total COGS: $${parseFloat(stats.total_expenses || 0).toFixed(2)}
- Total Profit: $${parseFloat(stats.profit || 0).toFixed(2)}
- Profit Margin: ${parseFloat(stats.profit_margin || 0).toFixed(2)}%
- Total Sales Count: ${stats.total_sales || 0}
- Number of Products: ${meta.product_count || 0}
- Number of Services: ${meta.service_count || 0}
${trends.length > 0 ? `- Sales Trend: ${trends.length} data points available` : ''}
`;
        contextMessage = `${filterDescription}Analyze this category using the ACTUAL DATA provided above. Provide insights about:
1. Overall category performance (${stats.total_quantity || 0} units, $${parseFloat(stats.total_revenue || 0).toFixed(2)} revenue)
2. Profitability analysis (${parseFloat(stats.profit_margin || 0).toFixed(2)}% margin)
3. Category health and trends
4. Strategic recommendations for this category
${trends.length > 0 ? '5. Analyze the sales trends over time' : ''}

Use ONLY the actual numbers provided above.`;
      } else if (selectedStore) {
        // Store analysis
        dataContext = `
ACTUAL DATA FOR STORE: "${selectedStore}"
- Total Units Sold: ${stats.total_quantity || 0}
- Total Revenue: $${parseFloat(stats.total_revenue || 0).toFixed(2)}
- Total COGS: $${parseFloat(stats.total_expenses || 0).toFixed(2)}
- Total Profit: $${parseFloat(stats.profit || 0).toFixed(2)}
- Profit Margin: ${parseFloat(stats.profit_margin || 0).toFixed(2)}%
- Total Sales Count: ${stats.total_sales || 0}
${trends.length > 0 ? `- Sales Trend: ${trends.length} data points available` : ''}
`;
        contextMessage = `${filterDescription}Analyze this store using the ACTUAL DATA provided above.`;
      } else if (selectedCashier) {
        // Cashier analysis
        dataContext = `
ACTUAL DATA FOR CASHIER: "${selectedCashier}"
- Total Units Sold: ${stats.total_quantity || 0}
- Total Revenue: $${parseFloat(stats.total_revenue || 0).toFixed(2)}
- Total COGS: $${parseFloat(stats.total_expenses || 0).toFixed(2)}
- Total Profit: $${parseFloat(stats.profit || 0).toFixed(2)}
- Profit Margin: ${parseFloat(stats.profit_margin || 0).toFixed(2)}%
- Total Sales Count: ${stats.total_sales || 0}
${trends.length > 0 ? `- Sales Trend: ${trends.length} data points available` : ''}
`;
        contextMessage = `${filterDescription}Analyze this cashier's performance using the ACTUAL DATA provided above.`;
      } else {
        // Overall analysis
        dataContext = `
ACTUAL OVERALL DATA:
- Total Units Sold: ${stats.total_quantity || 0}
- Total Revenue: $${parseFloat(stats.total_revenue || 0).toFixed(2)}
- Total COGS: $${parseFloat(stats.total_expenses || 0).toFixed(2)}
- Total Profit: $${parseFloat(stats.profit || 0).toFixed(2)}
- Profit Margin: ${parseFloat(stats.profit_margin || 0).toFixed(2)}%
- Total Sales Count: ${stats.total_sales || 0}
${trends.length > 0 ? `- Sales Trend: ${trends.length} data points available` : ''}
`;
        contextMessage = `${filterDescription}Analyze overall performance using the ACTUAL DATA provided above.`;
      }
      
      // Combine data context with the analysis request
      const fullContextMessage = dataContext + '\n' + contextMessage;
      
      // Reset conversation history when filters change - start fresh session
      const newHistory = [];
      
      // AI call for insight with detailed data context
      apiFetch('/api/ai-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: fullContextMessage,
          context: data, // Send full data object for reference
          conversationHistory: newHistory,
        }),
      }).then(r=>r.json()).then(result => {
        const aiResponse = result.response || '';
        setAiInsight(aiResponse);
        // Initialize conversation history with initial exchange - this starts the session
        const initialHistory = [
          { role: 'user', content: fullContextMessage },
          { role: 'assistant', content: aiResponse }
        ];
        setConversationHistory(initialHistory);
        
        // Scroll to bottom after initial message
        setTimeout(() => {
          const chatContainer = document.querySelector('.ai-chat-scroll');
          if (chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
          }
        }, 100);
      }).catch(()=>{
        setAiInsight('');
        setConversationHistory([]);
      });
    }).catch((err) => {
      console.error('Error fetching filter details:', err);
      setSelectedItemDetail(null);
    });
    
    // Show detail panel when filters are active
    setShowDetailPanel(true);
  }, [selectedItem, itemType, selectedCategories, selectedStore, selectedCashier, includeServices, startDate, endDate]);

  // Handle follow-up prompts - maintains memory within the current filter session
  const handleFollowUp = async () => {
    if (!followUpPrompt.trim() || !selectedItemDetail || isLoadingFollowUp) return;
    
    setIsLoadingFollowUp(true);
    
    try {
      // Add user message to history - maintain session memory
      const userMessage = { role: 'user', content: followUpPrompt };
      const updatedHistory = [...conversationHistory, userMessage];
      
      // Build context message with current data for reference
      const stats = selectedItemDetail.stats || {};
      const meta = selectedItemDetail.meta || {};
      
      let dataContext = '';
      if (meta.type === 'product' || meta.type === 'service') {
        dataContext = `\n\nCurrent ${meta.type} data: ${meta.name}
- Units Sold: ${stats.total_quantity || 0}
- Revenue: $${parseFloat(stats.total_revenue || 0).toFixed(2)}
- Profit: $${parseFloat(stats.profit || 0).toFixed(2)}
- Margin: ${parseFloat(stats.profit_margin || 0).toFixed(2)}%`;
      } else if (meta.type === 'category') {
        dataContext = `\n\nCurrent category data: ${meta.name || meta.category}
- Units Sold: ${stats.total_quantity || 0}
- Revenue: $${parseFloat(stats.total_revenue || 0).toFixed(2)}
- Profit: $${parseFloat(stats.profit || 0).toFixed(2)}
- Margin: ${parseFloat(stats.profit_margin || 0).toFixed(2)}%`;
      }
      
      // Add data context to follow-up for reference
      const enhancedPrompt = followUpPrompt + dataContext;
      
      const response = await apiFetch('/api/ai-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: enhancedPrompt,
          context: selectedItemDetail, // Send full context
          conversationHistory: updatedHistory.slice(0, -1), // Send all previous history (maintains memory)
        }),
      });
      
      const result = await response.json();
      const aiResponse = result.response || '';
      
      // Update conversation history with assistant response - maintains full session memory
      const finalHistory = [
        ...updatedHistory,
        { role: 'assistant', content: aiResponse }
      ];
      
      setConversationHistory(finalHistory);
      
      // Update displayed insight to show latest response
      setAiInsight(aiResponse);
      
      // Scroll to bottom after new message
      setTimeout(() => {
        const chatContainer = document.querySelector('.ai-chat-scroll');
        if (chatContainer) {
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      }, 100);
      
      // Clear input
      setFollowUpPrompt('');
    } catch (error) {
      console.error('Error sending follow-up:', error);
      toast.error('Failed to get AI response', { description: 'Please try again.' });
    } finally {
      setIsLoadingFollowUp(false);
    }
  };

  // Fetch analytics summary
  const { data: summary = {}, isLoading: summaryLoading, error: summaryError } = useQuery({
    queryKey: ['analytics-summary', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const response = await apiFetch(`/api/analytics/summary?${params}`);
      if (!response.ok) throw new Error('Failed to fetch summary');
      return response.json();
    },
  });

  // Fetch product profitability
  const { data: profitability = [], isLoading: profitabilityLoading, error: profitabilityError } = useQuery({
    queryKey: ['analytics-profitability', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const response = await apiFetch(`/api/analytics/product-profitability?${params}`);
      if (!response.ok) throw new Error('Failed to fetch profitability');
      return response.json();
    },
  });

  // Fetch sales trends (must match header period: All Time / custom range — was hardcoded ?days=30 before)
  const { data: trends = [], isLoading: trendsLoading, error: trendsError } = useQuery({
    queryKey: ['analytics-trends', startDate, endDate, periodType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const q = params.toString();
      const response = await apiFetch(`/api/analytics/sales-trends${q ? `?${q}` : ''}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch trends');
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
  });

  // Fetch expense breakdown
  const { data: expenseBreakdown = [], isLoading: expenseLoading, error: expenseError } = useQuery({
    queryKey: ['analytics-expenses', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const response = await apiFetch(`/api/analytics/expense-breakdown?${params}`);
      if (!response.ok) throw new Error('Failed to fetch expenses');
      return response.json();
    },
  });

  // Fetch sales by category
  const { data: salesByCategory = [], isLoading: salesByCategoryLoading, error: salesByCategoryError } = useQuery({
    queryKey: ['analytics-sales-by-category', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const response = await apiFetch(`/api/analytics/sales-by-category?${params}`);
      if (!response.ok) throw new Error('Failed to fetch sales by category');
      const data = await response.json();
      // Ensure data is in the format [{ name: string, value: number }]
      return Array.isArray(data) ? data.map(item => ({
        name: item.category || item.name || 'Other',
        value: parseFloat(item.total_amount || item.value || 0)
      })) : [];
    },
  });

  // Calculate AI insights
  const getAIInsights = () => {
    const insights = [];
    
    if (summary.profit > 0 && summary.profit < summary.revenue * 0.1) {
      insights.push({
        type: 'warning',
        message: 'Profit margin is low. Consider reducing expenses or increasing prices.',
      });
    }
    
    if (summary.expenses > summary.revenue * 0.5) {
      insights.push({
        type: 'error',
        message: 'Expenses are high relative to revenue. Review and optimize cost structure.',
      });
    }
    
    const topProduct = profitability[0];
    if (topProduct && topProduct.profit > 0) {
      insights.push({
        type: 'success',
        message: `${topProduct.name} is your most profitable product. Consider increasing inventory.`,
      });
    }
    
    const lowProfitProduct = profitability.find(p => p.profit < 0);
    if (lowProfitProduct) {
      insights.push({
        type: 'warning',
        message: `${lowProfitProduct.name} is losing money. Review pricing or discontinue.`,
      });
    }
    
    return insights;
  };

  // Prepare chart data (API returns daily revenue + expenses; profit = revenue − expenses)
  const trendsData = (Array.isArray(trends) ? trends : []).map((t) => {
    const revenue = Number(t.revenue) || 0;
    const expenses = Number(t.expenses) || 0;
    return {
      name: t.date
        ? formatCustom(t.date, { month: 'short', day: 'numeric' })
        : '',
      revenue,
      expenses,
      profit: revenue - expenses,
    };
  });

  const expensePieData = expenseBreakdown.map(e => ({
    name: e.category,
    value: parseFloat(e.total_amount)
  }));

  const profitPieData = [
    { name: 'Revenue', value: summary.revenue || 0 },
    { name: 'Expenses', value: summary.expenses || 0 }
  ];

  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];

  // Export functions
  const handleExport = () => {
    requirePassword('export', async () => {
    const periodStr = exportPeriod !== 'all' ? `_${exportPeriod}` : '';
    
    let content = '';
    let filename = '';
    let mimeType = '';
    
    if (exportFormat === 'csv') {
      const data = [
        ['Metric', 'Value'],
        ['Revenue', summary.revenue || 0],
        ['Expenses', summary.expenses || 0],
        ['Profit', summary.profit || 0],
        ['Sales Count', summary.sales_count || 0],
        ['Expenses Count', summary.expenses_count || 0],
      ];
      content = data.map(row => row.map(field => `"${field}"`).join(',')).join('\n');
      filename = `analytics_export${periodStr}_${new Date().toISOString().split('T')[0]}.csv`;
      mimeType = 'text/csv';
    } else if (exportFormat === 'json') {
      content = JSON.stringify({
        period: exportPeriod,
        summary,
        profitability,
        trends,
        expenseBreakdown,
      }, null, 2);
      filename = `analytics_export${periodStr}_${new Date().toISOString().split('T')[0]}.json`;
      mimeType = 'application/json';
    }
    
    const blob = new Blob([content], { type: mimeType });
    await saveFile(blob, filename);
    setShowExportModal(false);
      toast.success('Export completed successfully!', {
        description: `Your analytics data has been exported as ${filename}`,
      });
    }, { action: 'export_analytics' });
  };

  const insights = getAIInsights();

  // --- Main Layout: 3 columns + header (sticky top) ---
  return (
    <div>
        {/* Header Bar */}
        <header className="sticky top-0 z-40 bg-gradient-to-br from-white/75 via-[#f5f3ed]/80 to-[#ebe6dc]/60 glass-panel shadow-md mb-2">
          <div className="max-w-8xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1.5 sm:gap-3 px-3 sm:px-6 py-1.5 sm:py-2">
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              {/* Mobile Menu Button */}
              <button
                onClick={() => {}}
                className="md:hidden glass-card-pro p-1 rounded-md text-analytics-secondary hover:text-analytics-primary transition-colors"
                aria-label="Toggle menu"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
              </button>
              <span className="analytics-header tracking-tight text-sm sm:text-base md:text-lg">📊 Analytics Dashboard</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5 w-full sm:w-auto justify-end">
              <button onClick={() => setShowFilterCard(true)} className="glass-button-secondary flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-xs shrink-0">
                <svg width="14" height="14" className="sm:w-[16px] sm:h-[16px]" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M7 12h10M10 18h4" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round"/></svg>
                <span className="hidden sm:inline">Filters</span>
              </button>
                <button
                  onClick={() => setShowExportModal(true)}
                className="glass-card-pro flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-xs text-analytics-secondary font-semibold shrink-0"
              >
                <svg width="14" height="14" className="sm:w-[16px] sm:h-[16px]" fill="#1DAA5D" viewBox="0 0 24 24"><path d="M5 20h14v-2H5v2zm7-18C8.486 2 5.5 4.986 5.5 8.5c0 3.038 3.346 6.596 6.158 9.08a1.003 1.003 0 0 0 1.183 0C15.154 15.096 18.5 11.538 18.5 8.5 18.5 4.986 15.514 2 12 2zm0 13.69C9.381 12.303 7.5 9.998 7.5 8.5c0-2.206 1.794-4 4-4s4 1.794 4 4c0 1.498-1.881 3.803-4.5 7.19z"/></svg>
                <span className="hidden sm:inline">Export</span>
              </button>
              <button className="glass-card-pro flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-xs text-analytics-secondary font-semibold shrink-0">
                <svg width="14" height="14" className="sm:w-[16px] sm:h-[16px]" fill="#E66E19" viewBox="0 0 24 24"><path d="M12 22c5.421 0 9.875-4.454 9.875-9.875C21.875 6.704 17.45 2.25 12 2.25 6.55 2.25 2.125 6.704 2.125 12.125 2.125 17.546 6.579 22 12 22zm.625-14v5h-2.25v-5h2.25z"/></svg>
                <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            </div>
        </header>
        
        {/* Active Filters Display */}
        {(selectedCategories.length > 0 || selectedCashier || selectedStore || !includeServices) && (
          <div className="mb-4 px-2 sm:px-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs sm:text-sm text-analytics-secondary font-medium">Active Filters:</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {selectedCategories.length > 0 && selectedCategories[0] && (
                <div className="glass-card-pro p-3 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs text-analytics-secondary">Category</span>
                    <span className="text-sm font-medium text-analytics-primary">{selectedCategories[0]}</span>
                  </div>
                  <button 
                    onClick={() => setSelectedCategories([])} 
                    className="hover:bg-white/30 rounded-full p-1 transition-colors"
                  >
                    <X size={16} className="text-analytics-secondary" />
                  </button>
                </div>
              )}
              {selectedCashier && (
                <div className="glass-card-pro p-3 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs text-analytics-secondary">Cashier</span>
                    <span className="text-sm font-medium text-analytics-primary">{selectedCashier}</span>
                  </div>
                  <button 
                    onClick={() => setSelectedCashier('')} 
                    className="hover:bg-white/30 rounded-full p-1 transition-colors"
                  >
                    <X size={16} className="text-analytics-secondary" />
                  </button>
                </div>
              )}
              {selectedStore && (
                <div className="glass-card-pro p-3 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs text-analytics-secondary">Store</span>
                    <span className="text-sm font-medium text-analytics-primary">
                      {stores.find(s => s.id.toString() === selectedStore)?.name || 'All Stores'}
                    </span>
                  </div>
                  <button 
                    onClick={() => setSelectedStore('')} 
                    className="hover:bg-white/30 rounded-full p-1 transition-colors"
                  >
                    <X size={16} className="text-analytics-secondary" />
                  </button>
                </div>
              )}
              {!includeServices && (
                <div className="glass-card-pro p-3 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs text-analytics-secondary">Items Type</span>
                    <span className="text-sm font-medium text-analytics-primary">Products Only</span>
                  </div>
                  <button 
                    onClick={() => setIncludeServices(true)} 
                    className="hover:bg-white/30 rounded-full p-1 transition-colors"
                  >
                    <X size={16} className="text-analytics-secondary" />
                  </button>
                </div>
              )}
              <div className="glass-card-pro p-3 flex items-center justify-center">
                <button 
                  onClick={() => {
                    setSelectedCategories([]);
                    setSelectedCashier('');
                    setSelectedStore('');
                    setIncludeServices(true);
                    setSelectedItem(null);
                    setSelectedItemInput('');
                    setShowDetailPanel(false);
                    setSelectedItemDetail(null);
                    setAiInsight('');
                  }}
                  className="w-full px-3 py-2 text-xs text-analytics-secondary hover:text-analytics-primary glass-button-secondary text-center"
                >
                  Clear All Filters
                </button>
              </div>
            </div>
          </div>
        )}
        
        {showFilterCard && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-10 sm:pt-20 px-4">
            <div className="glass-card-pro w-full max-w-3xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <span className="text-base sm:text-lg font-semibold text-analytics-primary">Filters & Item Search</span>
                <div className="flex items-center gap-2">
                  <button
                    className="glass-button-secondary px-3 py-1 text-xs sm:text-sm"
                    onClick={() => {
                      setSelectedCategories([]);
                      setSelectedCashier('');
                      setSelectedStore('');
                      setIncludeServices(true);
                      setSelectedItem(null);
                      setSelectedItemInput('');
                      setItemSearchTerm('');
                      setShowDetailPanel(false);
                      setSelectedItemDetail(null);
                      setAiInsight('');
                    }}
                  >
                    Clear filters
                  </button>
                  <button onClick={() => {
                    // Clear input fields when closing
                    setSelectedItemInput('');
                    setShowFilterCard(false);
                  }} className="glass-card-pro px-3 py-1 text-xs sm:text-sm">Close</button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-analytics-secondary mb-1">Cashier</label>
                  <div className="relative" ref={cashierDropdownRef}>
                    <button
                      ref={cashierButtonRef}
                      onClick={() => setCashierDropdownOpen(!cashierDropdownOpen)}
                      className="glass-button-secondary flex items-center justify-between gap-2 w-full px-3 py-2 text-sm text-analytics-primary"
                    >
                      <span>{selectedCashier || 'Filter by cashier'}</span>
                      <ChevronDown size={16} className={`transition-transform duration-200 ${cashierDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {cashierDropdownOpen && typeof document !== 'undefined' && createPortal(
                      <div 
                        data-cashier-dropdown
                        style={{ 
                          position: 'fixed',
                          top: `${cashierDropdownPosition.top + 8}px`,
                          right: `${cashierDropdownPosition.right}px`,
                          width: `${cashierDropdownPosition.width || 0}px`,
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
                              setSelectedCashier('');
                              setCashierDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                              !selectedCashier
                                ? 'bg-white/30 text-analytics-primary font-medium'
                                : 'text-analytics-secondary hover:bg-white/20'
                            }`}
                          >
                            All Cashiers
                          </button>
                          {cashiers.map((cashier) => (
                            <button
                              key={cashier.id}
                              onClick={() => {
                                setSelectedCashier(cashier.name);
                                setCashierDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                selectedCashier === cashier.name
                                  ? 'bg-white/30 text-analytics-primary font-medium'
                                  : 'text-analytics-secondary hover:bg-white/20'
                              }`}
                            >
                              {cashier.name}
                            </button>
                          ))}
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>
          </div>
                <div>
                  <label className="block text-xs text-analytics-secondary mb-1">Category</label>
                  <div className="relative" ref={categoryDropdownRef}>
                    <button
                      ref={categoryButtonRef}
                      onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                      className="glass-button-secondary flex items-center justify-between gap-2 w-full px-3 py-2 text-sm text-analytics-primary"
                    >
                      <span>{selectedCategories.length > 0 && selectedCategories[0] ? selectedCategories[0] : 'Filter by category'}</span>
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
                          <button
                            onClick={() => {
                              setSelectedCategories([]);
                              setCategoryDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                              selectedCategories.length === 0 || !selectedCategories[0]
                                ? 'bg-white/30 text-analytics-primary font-medium'
                                : 'text-analytics-secondary hover:bg-white/20'
                            }`}
                          >
                            All Categories
                          </button>
                          {categoryOptions.map((category) => (
                            <button
                              key={category}
                              onClick={() => {
                                setSelectedCategories([category]);
                                setCategoryDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                selectedCategories.length > 0 && selectedCategories[0] === category
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
                <div>
                  <label className="block text-xs text-analytics-secondary mb-1">Store</label>
                  <div className="relative" ref={storeDropdownRef}>
                    <button
                      ref={storeButtonRef}
                      onClick={() => setStoreDropdownOpen(!storeDropdownOpen)}
                      className="glass-button-secondary flex items-center justify-between gap-2 w-full px-3 py-2 text-sm text-analytics-primary"
                    >
                      <span>{selectedStore ? stores.find(s => s.id.toString() === selectedStore)?.name || 'All Stores' : 'All Stores'}</span>
                      <ChevronDown size={16} className={`transition-transform duration-200 ${storeDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {storeDropdownOpen && typeof document !== 'undefined' && createPortal(
                      <div 
                        data-store-dropdown
                        style={{ 
                          position: 'fixed',
                          top: `${storeDropdownPosition.top + 8}px`,
                          right: `${storeDropdownPosition.right}px`,
                          width: `${storeDropdownPosition.width || 0}px`,
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
                              setSelectedStore('');
                              setStoreDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                              !selectedStore
                                ? 'bg-white/30 text-analytics-primary font-medium'
                                : 'text-analytics-secondary hover:bg-white/20'
                            }`}
                          >
                            All Stores
                          </button>
                          {stores.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => {
                                setSelectedStore(s.id.toString());
                                setStoreDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                selectedStore === s.id.toString()
                                  ? 'bg-white/30 text-analytics-primary font-medium'
                                  : 'text-analytics-secondary hover:bg-white/20'
                              }`}
                            >
                              {s.name}
                            </button>
                          ))}
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 md:col-span-3">
                  <input id="incServices2" type="checkbox" checked={includeServices} onChange={()=>setIncludeServices(!includeServices)} />
                  <label htmlFor="incServices2" className="text-sm text-analytics-secondary">Include Services</label>
                </div>
                <div className="md:col-span-3">
                  <label className="block text-xs text-analytics-secondary mb-1">Select Item (Optional)</label>
                  <div className="relative" ref={itemDropdownRef}>
                    <div className="relative">
                      <input
                        type="text"
                        value={itemSearchTerm}
                        onChange={(e) => {
                          setItemSearchTerm(e.target.value);
                          setItemDropdownOpen(true);
                        }}
                        onFocus={() => setItemDropdownOpen(true)}
                        placeholder={productsLoading || servicesLoading ? 'Loading items...' : 'Type to search products/services (leave empty to auto-select based on filters)'}
                        className="glass-input w-full px-3 py-2 pr-8"
                      />
                      <button
                        ref={itemButtonRef}
                        onClick={() => setItemDropdownOpen(!itemDropdownOpen)}
                        className="absolute right-2 top-1/2 -translate-y-1/2"
                      >
                        <ChevronDown size={16} className={`transition-transform duration-200 text-analytics-secondary ${itemDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                    
                    {itemDropdownOpen && typeof document !== 'undefined' && createPortal(
                      <div 
                        data-item-dropdown
                        style={{ 
                          position: 'fixed',
                          top: `${itemDropdownPosition.top + 8}px`,
                          right: `${itemDropdownPosition.right}px`,
                          width: `${itemDropdownPosition.width || 0}px`,
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
                              setSelectedItem(null);
                              setSelectedItemInput('');
                              setItemSearchTerm('');
                              setItemDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                              !selectedItem
                                ? 'bg-white/30 text-analytics-primary font-medium'
                                : 'text-analytics-secondary hover:bg-white/20'
                            }`}
                          >
                            No Item Selected
                          </button>
                          {itemOptions
                            .filter(item => !itemSearchTerm || item.name.toLowerCase().includes(itemSearchTerm.toLowerCase()))
                            .map((item) => (
                              <button
                                key={item.key}
                                onClick={() => {
                                  if (item.type === 'product') {
                                    setItemType('product');
                                    setSelectedItem(item.id);
                                  } else {
                                    setItemType('service');
                                    setSelectedItem(item.name);
                                  }
                                  setSelectedItemInput(item.name);
                                  setItemSearchTerm(item.name);
                                  setItemDropdownOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                  selectedItem && (
                                    (item.type === 'product' && item.id === selectedItem) ||
                                    (item.type === 'service' && item.name === selectedItem)
                                  )
                                    ? 'bg-white/30 text-analytics-primary font-medium'
                                    : 'text-analytics-secondary hover:bg-white/20'
                                }`}
                              >
                                {item.name} <span className="text-xs opacity-70">({item.type})</span>
                              </button>
                            ))}
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>
                  {selectedItem && (
                    <button
                      onClick={() => {
                        setSelectedItem(null);
                        setSelectedItemInput('');
                      }}
                      className="mt-2 text-xs text-analytics-secondary hover:text-analytics-primary"
                    >
                      Clear selection
                    </button>
                  )}
                  <datalist id="items-list">
                    {itemOptions.map(opt => (<option key={opt.key} value={opt.name} />))}
                  </datalist>
              </div>
            </div>
              <div className="flex flex-col sm:flex-row justify-end gap-2 mt-4">
                <button className="glass-card-pro px-3 py-1 text-xs" onClick={()=>setShowFilterCard(false)}>Cancel</button>
                <button className="glass-button-primary text-white px-3 py-1 text-xs" onClick={()=>{
                  // Clear only the input fields (not the filter state, so active filters display persists)
                  setSelectedItemInput('');
                  
                  // If category is selected, clear explicit item selection (category aggregation will be used)
                  if (selectedCategories.length > 0 && selectedCategories[0]) {
                    setSelectedItem(null);
                    // The useEffect will handle fetching category aggregation automatically
                  }
                  // If item is explicitly selected, keep it (item details will be used)
                  
                  setShowFilterCard(false);
                  // The useEffect hook will automatically update the details panel based on current filters
                }}>Apply</button>
                </div>
              </div>
            </div>
        )}
        <div className="flex flex-1 justify-center max-w-8xl mx-auto gap-4 px-2 sm:px-4 md:px-6 pb-16">
          {/* Sidebar removed - filters available via Filters button */}
          {/* Main Center Area */}
          <main className="flex-1 px-2 sm:px-4 py-1 w-full">
            {/* Selected Item/Category Details - Appears before summary cards when filters are applied */}
            {(showDetailPanel && selectedItemDetail && selectedItemDetail.stats) && (
              <div className="mb-6">
                <div className="glass-card-pro p-4 sm:p-6">
                  {/* Header Section */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-2">
                    {selectedItemDetail.meta?.type === 'category' ? (
                      <div className="w-14 h-14 rounded-lg border bg-white/60 flex items-center justify-center">
                        <Package size={24} className="text-analytics-secondary" />
                      </div>
                    ) : (
                      <img alt="Item" draggable="false" src={itemImgPlaceholder} className="w-14 h-14 object-cover rounded-lg border bg-white/60" />
                    )}
                    <div>
                      <span className="text-base sm:text-lg font-bold text-analytics-primary">
                        {selectedItemDetail.meta?.name || 'Item Details'}
                      </span>
                      <div className="text-xs text-analytics-secondary">
                        {selectedItemDetail.meta?.type === 'aggregated' || selectedItemDetail.meta?.type === 'category' ? (
                          <>
                            {selectedItemDetail.meta?.category && `Category: ${selectedItemDetail.meta.category}`}
                            {selectedItemDetail.meta?.store && `${selectedItemDetail.meta.category ? ' | ' : ''}Store: ${selectedItemDetail.meta.store}`}
                            {selectedItemDetail.meta?.cashier && `${selectedItemDetail.meta.category || selectedItemDetail.meta.store ? ' | ' : ''}Cashier: ${selectedItemDetail.meta.cashier}`}
                            {selectedItemDetail.meta?.product_count > 0 && ` | ${selectedItemDetail.meta.product_count} Products`}
                            {selectedItemDetail.meta?.service_count > 0 && ` | ${selectedItemDetail.meta.service_count} Services`}
                            {!selectedItemDetail.meta?.category && !selectedItemDetail.meta?.store && !selectedItemDetail.meta?.cashier && 
                             !selectedItemDetail.meta?.product_count && !selectedItemDetail.meta?.service_count && 
                             'Aggregated View'}
                          </>
                        ) : selectedItemDetail.meta?.type === 'product' ? (
                          <>SKU: {selectedItemDetail.meta?.sku || 'N/A'} | Category: {selectedItemDetail.meta?.category || 'N/A'}</>
                        ) : selectedItemDetail.meta?.type === 'service' ? (
                          <>Service | Category: {selectedItemDetail.meta?.category || 'N/A'}</>
                        ) : (
                          <>SKU: {selectedItemDetail.meta?.sku || 'N/A'} | Category: {selectedItemDetail.meta?.category || 'N/A'}</>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* KPIs */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 mb-4">
                    <div className="glass-card-pro p-3 flex flex-col items-center text-center">
                      <span className="text-xs text-analytics-secondary mb-1">Units Sold</span>
                      <span className="text-lg sm:text-xl font-bold text-analytics-primary">
                        {selectedItemDetail.stats?.total_quantity || 0}
                      </span>
                    </div>
                    <div className="glass-card-pro p-3 flex flex-col items-center text-center">
                      <span className="text-xs text-analytics-secondary mb-1">Revenue</span>
                      <span className="text-lg sm:text-xl font-bold text-analytics-revenue">
                        {formatMoney(parseFloat(selectedItemDetail.stats?.total_revenue || 0))}
                      </span>
                    </div>
                    <div className="glass-card-pro p-3 flex flex-col items-center text-center">
                      <span className="text-xs text-analytics-secondary mb-1">COGS</span>
                      <span className="text-lg sm:text-xl font-bold text-analytics-expense">
                        {formatMoney(parseFloat(selectedItemDetail.stats?.total_expenses || 0))}
                      </span>
                    </div>
                    <div className="glass-card-pro p-3 flex flex-col items-center text-center">
                      <span className="text-xs text-analytics-secondary mb-1">Profit</span>
                      <span className="text-lg sm:text-xl font-bold text-analytics-profit">
                        {formatMoney(parseFloat(selectedItemDetail.stats?.profit || 0))}
                      </span>
                    </div>
                    <div className="glass-card-pro p-3 flex flex-col items-center text-center">
                      <span className="text-xs text-analytics-secondary mb-1">Margin</span>
                      <span className="text-lg sm:text-xl font-bold text-analytics-profit">
                        {parseFloat(selectedItemDetail.stats?.profit_margin || 0).toFixed(1)}%
                      </span>
                    </div>
                    <div className="glass-card-pro p-3 flex flex-col items-center text-center">
                      <span className="text-xs text-analytics-secondary mb-1">Returns</span>
                      <span className="text-lg sm:text-xl font-bold text-analytics-loss">
                        {selectedItemDetail.stats?.total_returns || 0}
                      </span>
                      <span className="text-[8px] text-analytics-secondary mt-0.5 opacity-75">
                        units returned
                      </span>
                    </div>
                  </div>
                  {/* Chart & Recent Txns Table */}
                  <div className="my-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="bg-white/30 rounded p-2">
                      <h4 className="font-semibold text-sm sm:text-base mb-2">Sales Trend</h4>
                      <div className="w-full h-[200px] sm:h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={selectedItemDetail.trends}>
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Line type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={2} />
                            <Line type="monotone" dataKey="quantity" stroke="#3b82f6" strokeWidth={1} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    {selectedItemDetail && selectedItemDetail.transactions && selectedItemDetail.transactions.length > 0 ? (
                      <div className="bg-white/30 rounded p-2">
                        <h4 className="font-semibold text-sm sm:text-base mb-2">Recent Transactions</h4>
                        <div className="overflow-y-auto max-h-[200px] sm:max-h-[220px]">
                          <table className="w-full text-xs sm:text-sm">
                            <thead>
                              <tr className="border-b border-white/20">
                                <th className="text-left py-1">Date</th>
                                <th className="text-left py-1">Qty</th>
                                <th className="text-right py-1">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedItemDetail.transactions?.slice(0, 5).map((txn, idx) => (
                                <tr key={idx} className="border-b border-white/10">
                                  <td className="py-1">{txn.date || 'N/A'}</td>
                                  <td className="py-1">{txn.quantity || 0}</td>
                                  <td className="text-right py-1">{formatMoney(parseFloat(txn.amount || 0))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : selectedItemDetail && (selectedItemDetail.meta?.type === 'category' || selectedItemDetail.meta?.type === 'aggregated') ? (
                      // Show Top Products chart when viewing category/aggregated and no transactions
                      <div className="bg-white/30 rounded p-2">
                        <h4 className="font-semibold text-sm sm:text-base mb-2">Top Products</h4>
                        {selectedItemDetail.topProducts && selectedItemDetail.topProducts.length > 0 ? (
                          <div className="w-full h-[200px] sm:h-[220px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={selectedItemDetail.topProducts.slice(0, 5).map(p => ({
                                name: p.name?.substring(0, 15) || 'Product',
                                revenue: parseFloat(p.revenue || p.total_revenue || 0),
                                quantity: parseInt(p.quantity || p.total_quantity || 0)
                              }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 10 }} />
                                <YAxis tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 10 }} />
                                <Tooltip 
                                  contentStyle={{ 
                                    backgroundColor: 'rgba(0,0,0,0.8)', 
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '8px'
                                  }}
                                  formatter={(value) => formatMoney(parseFloat(value))}
                                />
                                <Bar dataKey="revenue" fill="#16a34a" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-[200px] sm:h-[220px] text-analytics-secondary text-sm">
                            No product data available
                          </div>
                        )}
                      </div>
                    ) : selectedItemDetail && selectedItemDetail.meta?.type === 'product' ? (
                      // Show Performance Summary for individual products
                      <div className="bg-white/30 rounded p-2">
                        <h4 className="font-semibold text-sm sm:text-base mb-2">Performance Summary</h4>
                        <div className="space-y-2 text-xs sm:text-sm">
                          <div className="flex justify-between items-center py-1 border-b border-white/10">
                            <span className="text-analytics-secondary">Avg. Order Value</span>
                            <span className="text-analytics-primary font-medium">
                              {selectedItemDetail.stats?.total_revenue && selectedItemDetail.stats?.total_sales
                                ? formatMoney(selectedItemDetail.stats.total_revenue / selectedItemDetail.stats.total_sales)
                                : formatMoney(0)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-white/10">
                            <span className="text-analytics-secondary">Avg. Quantity/Sale</span>
                            <span className="text-analytics-primary font-medium">
                              {selectedItemDetail.stats?.total_quantity && selectedItemDetail.stats?.total_sales
                                ? (selectedItemDetail.stats.total_quantity / selectedItemDetail.stats.total_sales).toFixed(1)
                                : '0'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-white/10">
                            <span className="text-analytics-secondary">Best Day</span>
                            <span className="text-analytics-primary font-medium text-[10px]">
                              {selectedItemDetail.bestDay || 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-white/10">
                            <span className="text-analytics-secondary">Peak Revenue</span>
                            <span className="text-analytics-revenue font-medium">
                              {formatMoney(parseFloat(selectedItemDetail.peakRevenue || 0))}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1">
                            <span className="text-analytics-secondary">Total Sales</span>
                            <span className="text-analytics-primary font-medium">
                              {selectedItemDetail.stats?.total_sales || 0}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      // Default: Show Quick Insights
                      <div className="bg-white/30 rounded p-2">
                        <h4 className="font-semibold text-sm sm:text-base mb-2">Quick Insights</h4>
                        <div className="space-y-2 text-xs sm:text-sm">
                          <div className="flex items-start gap-2">
                            <TrendingUp size={14} className="text-analytics-success mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="text-analytics-secondary block">Performance</span>
                              <span className="text-analytics-primary">
                                {selectedItemDetail.stats?.profit_margin > 20 
                                  ? 'Excellent' 
                                  : selectedItemDetail.stats?.profit_margin > 10 
                                    ? 'Good' 
                                    : 'Needs Attention'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <Package size={14} className="text-analytics-info mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="text-analytics-secondary block">Sales Activity</span>
                              <span className="text-analytics-primary">
                                {selectedItemDetail.stats?.total_quantity > 100 
                                  ? 'High' 
                                  : selectedItemDetail.stats?.total_quantity > 50 
                                    ? 'Moderate' 
                                    : 'Low'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <DollarSign size={14} className="text-analytics-revenue mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="text-analytics-secondary block">Revenue Trend</span>
                              <span className="text-analytics-primary">
                                {selectedItemDetail.revenueTrend === 'up' 
                                  ? '↑ Increasing' 
                                  : selectedItemDetail.revenueTrend === 'down' 
                                    ? '↓ Decreasing' 
                                    : '→ Stable'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* AI Chat Section */}
                  {(aiInsight || conversationHistory.length > 0) && (
                    <div className="mt-3 glass-card-pro p-3 sm:p-4 flex flex-col h-full max-h-[400px]">
                      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                        <span className="text-analytics-primary font-semibold text-xs sm:text-sm">AI Insights Chat</span>
                      </div>
                      
                      {/* Chat Messages - Scrollable */}
                      <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-2 ai-chat-scroll" style={{ minHeight: '200px', maxHeight: '300px' }}>
                        {conversationHistory.length > 0 ? (
                          conversationHistory.map((message, idx) => (
                            <div
                              key={idx}
                              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                              <div
                                className={`max-w-[85%] rounded-lg px-3 py-2 ${
                                  message.role === 'user'
                                    ? 'bg-blue-500/20 text-blue-100 border border-blue-400/30'
                                    : 'bg-white/20 text-analytics-secondary border border-white/30'
                                }`}
                              >
                                {message.role === 'user' ? (
                                  <div className="text-xs sm:text-sm font-medium text-blue-50">
                                    {message.content}
                                  </div>
                                ) : (
                                  <div className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">
                                    {message.content}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))
                        ) : aiInsight ? (
                          <div className="flex justify-start">
                            <div className="max-w-[85%] rounded-lg px-3 py-2 bg-white/20 text-analytics-secondary border border-white/30">
                              <div className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">
                                {aiInsight}
                              </div>
                            </div>
                          </div>
                        ) : null}
                        
                        {/* Loading indicator */}
                        {isLoadingFollowUp && (
                          <div className="flex justify-start">
                            <div className="max-w-[85%] rounded-lg px-3 py-2 bg-white/20 text-analytics-secondary border border-white/30">
                              <div className="text-xs sm:text-sm flex items-center gap-2">
                                <span className="animate-pulse">Thinking...</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Follow-up Prompt Input */}
                      <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0 border-t border-white/10 pt-3">
                        <input
                          type="text"
                          value={followUpPrompt}
                          onChange={(e) => setFollowUpPrompt(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && followUpPrompt.trim()) {
                              e.preventDefault();
                              handleFollowUp();
                            }
                          }}
                          placeholder="Ask a follow-up question or request more details..."
                          className="glass-input flex-1 px-3 py-2 text-xs sm:text-sm text-analytics-primary placeholder:text-analytics-secondary"
                          disabled={isLoadingFollowUp}
                        />
                        <button
                          onClick={handleFollowUp}
                          disabled={!followUpPrompt.trim() || isLoadingFollowUp}
                          className="glass-button-primary text-white px-3 py-2 text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {isLoadingFollowUp ? 'Sending...' : 'Send'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Top Summary Cards */}
            {summaryLoading ? (
              <div className="glass-card-pro p-4 col-span-6 text-center">Loading summary...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-5">
                <div className="glass-card-pro py-2 sm:py-3 md:py-4 lg:py-5 px-2 sm:px-3 md:px-4 flex flex-col items-center justify-center bounce-in min-h-0">
                  <span className="text-analytics-secondary text-[10px] sm:text-xs mb-0.5 sm:mb-1 leading-tight text-center">Total Revenue</span>
                  <span className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl 2xl:text-3xl text-analytics-revenue font-bold soft-shadow break-words text-center leading-tight px-1">{formatMoney(summary.revenue || 0)}</span>
                </div>
                <div className="glass-card-pro py-2 sm:py-3 md:py-4 lg:py-5 px-2 sm:px-3 md:px-4 flex flex-col items-center justify-center bounce-in min-h-0">
                  <span className="text-analytics-secondary text-[10px] sm:text-xs mb-0.5 sm:mb-1 leading-tight text-center">Total Sales</span>
                  <span className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl 2xl:text-3xl text-analytics-primary font-bold soft-shadow leading-tight px-1">{summary.sales_count || 0}</span>
                </div>
                <div className="glass-card-pro py-2 sm:py-3 md:py-4 lg:py-5 px-2 sm:px-3 md:px-4 flex flex-col items-center justify-center bounce-in min-h-0">
                  <span className="text-analytics-secondary text-[10px] sm:text-xs mb-0.5 sm:mb-1 leading-tight text-center">Expenses</span>
                  <span className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl 2xl:text-3xl text-analytics-expense font-bold soft-shadow break-words text-center leading-tight px-1">{formatMoney(summary.expenses || 0)}</span>
              </div>
                <div className="glass-card-pro py-2 sm:py-3 md:py-4 lg:py-5 px-2 sm:px-3 md:px-4 flex flex-col items-center justify-center bounce-in min-h-0">
                  <span className="text-analytics-secondary text-[10px] sm:text-xs mb-0.5 sm:mb-1 leading-tight text-center">Gross Profit</span>
                  <span className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl 2xl:text-3xl text-analytics-profit font-bold soft-shadow break-words text-center leading-tight px-1">{formatMoney(summary.profit || 0)}</span>
            </div>
                <div className="glass-card-pro py-2 sm:py-3 md:py-4 lg:py-5 px-2 sm:px-3 md:px-4 flex flex-col items-center justify-center bounce-in min-h-0">
                  <span className="text-analytics-secondary text-[10px] sm:text-xs mb-0.5 sm:mb-1 leading-tight text-center">Profit Margin</span>
                  <span className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl 2xl:text-3xl text-analytics-primary font-bold soft-shadow leading-tight px-1">{(summary.profit_margin || 0).toFixed(1)}%</span>
                </div>
                <div className="glass-card-pro py-2 sm:py-3 md:py-4 lg:py-5 px-2 sm:px-3 md:px-4 flex flex-col items-center justify-center bounce-in min-h-0">
                  <span className="text-analytics-secondary text-[10px] sm:text-xs mb-0.5 sm:mb-1 leading-tight text-center">Avg Order Value</span>
                  <span className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl 2xl:text-3xl text-analytics-primary font-bold soft-shadow break-words text-center leading-tight px-1">{formatMoney(summary.avg_order_value || 0)}</span>
                </div>
              </div>
            )}
            {/* Main Chart + Bar Chart row — acrylic card (aligned with Top 5 Performing Items) */}
            <section
              className="glass-card-pro relative w-full max-w-full overflow-hidden mb-7 p-4 sm:p-5 lg:p-6 xl:p-7"
              aria-label="Revenue and expense trends"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
              {/* Main Area/Line chart */}
              <div className="flex flex-col min-w-0 lg:col-span-2">
                <div className="flex flex-col sm:flex-row w-full justify-between items-start sm:items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                  <span className="font-semibold text-sm sm:text-base text-analytics-primary">Revenue, Expenses & Profit</span>
                  <div className="relative shrink-0" ref={periodDropdownRef}>
                    <button
                      onClick={() => setPeriodDropdownOpen(!periodDropdownOpen)}
                      className="glass-button-secondary flex items-center justify-between gap-2 px-2 py-1 text-xs sm:text-sm text-analytics-primary min-w-[120px]"
                    >
                      <span>{periodType === 'all' ? 'All Time' : periodType === 'today' ? 'Today' : periodType === 'week' ? 'Last 7 Days' : 'Last 30 Days'}</span>
                      <ChevronDown size={14} className={`transition-transform duration-200 ${periodDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {periodDropdownOpen && (
                      <div className="absolute right-0 mt-2 z-50 min-w-[120px]">
                        <div className="glass-card-pro overflow-hidden shadow-lg">
                          {[
                            { value: 'all', label: 'All Time' },
                            { value: 'today', label: 'Today' },
                            { value: 'week', label: 'Last 7 Days' },
                            { value: 'month', label: 'Last 30 Days' }
                          ].map((option) => (
                            <button
                              key={option.value}
                              onClick={() => {
                                const today = new Date();
                                if (option.value === 'all') { setStartDate(''); setEndDate(''); }
                                else if (option.value === 'today') {
                                  let t = today.toISOString().split('T')[0]; setStartDate(t); setEndDate(t);
                                } else if (option.value === 'week') {
                                  let w = new Date(); w.setDate(today.getDate()-7);
                                  setStartDate(w.toISOString().split('T')[0]); setEndDate(today.toISOString().split('T')[0]);
                                } else if (option.value === 'month') {
                                  let m = new Date(); m.setMonth(today.getMonth()-1);
                                  setStartDate(m.toISOString().split('T')[0]); setEndDate(today.toISOString().split('T')[0]);
                                }
                                setPeriodType(option.value);
                                setPeriodDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-xs sm:text-sm transition-colors ${
                                periodType === option.value
                                  ? 'bg-white/30 text-analytics-primary font-medium'
                                  : 'text-analytics-secondary hover:bg-white/20'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
            </div>
                {/* Inner acrylic panel so charts read clearly on busy backgrounds */}
                <div className="rounded-xl border border-white/15 bg-white/[0.07] backdrop-blur-sm shadow-inner min-h-[220px] sm:min-h-[260px] lg:min-h-[280px] px-2 sm:px-3 py-3 sm:py-4">
                {trendsLoading ? (
                  <div className="flex flex-col h-[220px] sm:h-[260px] lg:h-[280px] items-center justify-center text-analytics-secondary text-sm">Loading trends...</div>
                ) : trendsError ? (
                  <div className="flex flex-col h-[220px] sm:h-[260px] lg:h-[280px] items-center justify-center text-sm text-red-600 px-4 text-center">
                    Could not load trends. Check the console or try again.
                  </div>
                ) : (trendsData && trendsData.length > 0 ? (
                  <div className="w-full h-[220px] sm:h-[260px] lg:h-[280px] min-h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendsData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(value) => formatMoney(Number(value))} />
                        <Legend />
                        <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="profit" name="Profit" stroke="#22c55e" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
          </div>
                ) : (
                  <div className="flex flex-col h-[220px] sm:h-[260px] lg:h-[280px] items-center justify-center text-center px-3 sm:px-4 text-analytics-secondary text-sm">
                    <span>No trends data.</span>
                    <span className="text-xs mt-2 opacity-80 max-w-md">Completed sales and expenses will appear by day. If you use &quot;All Time&quot;, ensure your database has sales with payment status completed.</span>
                  </div>
                ))}
                </div>
                    </div>
              {/* Revenue vs Expenses Bar/Stacked */}
              <div className="flex flex-col min-w-0 border-t border-white/15 pt-4 mt-1 lg:mt-0 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5 xl:pl-6 lg:border-white/15">
                <span className="font-semibold text-sm sm:text-base text-analytics-primary mb-2 sm:mb-3">Revenue vs Expenses</span>
                <div className="rounded-xl border border-white/15 bg-white/[0.07] backdrop-blur-sm shadow-inner flex-1 min-h-[180px] sm:min-h-[200px] px-2 sm:px-3 py-2 sm:py-3">
                <div className="w-full h-[160px] sm:h-[180px] md:h-[200px] min-h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendsData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value) => formatMoney(Number(value))} />
                      <Bar dataKey="revenue" fill="#3b82f6" />
                      <Bar dataKey="expenses" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                </div>
              </div>
            </div>
            </section>
            {/* Mini charts: Top 5 items, Sales by Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
              <div className="glass-card-pro p-4 sm:p-5 relative">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm sm:text-base text-analytics-primary">Top 5 Performing Items</h3>
                  {profitability && profitability.length > 0 && (
                    <div className="relative">
                      <button
                        ref={profitabilityButtonRef}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (profitabilityButtonRef.current) {
                            const rect = profitabilityButtonRef.current.getBoundingClientRect();
                            setProfitabilityDropdownPosition({
                              top: rect.bottom,
                              right: window.innerWidth - rect.right,
                              width: rect.width
                            });
                          }
                          setShowProfitabilityDropdown(!showProfitabilityDropdown);
                        }}
                        className="glass-button-secondary px-3 py-1.5 rounded-lg text-xs font-medium transition-all text-analytics-primary hover:opacity-80 flex items-center gap-1.5"
                      >
                        <span>View All</span>
                        <ChevronDown size={14} className={`transition-transform duration-200 ${showProfitabilityDropdown ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  )}
                </div>
                {profitabilityLoading ? (
                  <div className="h-[200px] flex items-center justify-center text-analytics-secondary">Loading...</div>
                ) : (profitability && profitability.length > 0 ? (
                  <div className="w-full h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                          data={profitability.slice(0, 5)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                          label={({ name, percent }) => {
                            if (percent < 0.05) return '';
                            const shortName = name.length > 12 ? name.substring(0, 10) + '...' : name;
                            return `${shortName} ${(percent * 100).toFixed(0)}%`;
                          }}
                          outerRadius={60}
                          innerRadius={20}
                    fill="#8884d8"
                          dataKey="profit"
                  >
                          {profitability.slice(0, 5).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                        <Tooltip formatter={(value, name, props) => {
                          const payload = props.payload;
                          // Calculate percentage from all items (not just top 5) for consistency with dropdown
                          const totalProfit = profitability.reduce((sum, item) => sum + parseFloat(item.profit || 0), 0);
                          const percent = totalProfit > 0 ? ((parseFloat(value) / totalProfit) * 100).toFixed(1) : '0';
                          return [`${formatMoney(parseFloat(value))} (${percent}%)`, name];
                        }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
                ) : <div className="h-[200px] flex items-center justify-center text-analytics-secondary">No data</div>)}
                
                {/* Profitability Dropdown */}
                {showProfitabilityDropdown && typeof document !== 'undefined' && createPortal(
                  <div 
                    data-profitability-dropdown
                    style={{ 
                      position: 'fixed',
                      top: `${profitabilityDropdownPosition.top + 8}px`,
                      right: `${profitabilityDropdownPosition.right}px`,
                      width: `${profitabilityDropdownPosition.width || 0}px`,
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
                      padding: '12px',
                      minWidth: '280px',
                      maxWidth: '320px',
                      maxHeight: '300px',
                      overflowY: 'auto',
                      overflowX: 'hidden'
                    }}>
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-analytics-primary mb-3 pb-2 border-b border-white/10">
                          All Performing Items
                        </h4>
                        {profitabilityLoading ? (
                          <div className="text-center py-4 text-analytics-secondary text-sm">
                            Loading...
                          </div>
                        ) : profitability && Array.isArray(profitability) && profitability.length > 0 ? (
                          profitability.map((item, index) => {
                            const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];
                            const color = COLORS[index % COLORS.length];
                            // Calculate percentage from all items (not just top 5) for consistency
                            const totalProfit = profitability.reduce((sum, i) => sum + parseFloat(i.profit || 0), 0);
                            const profitValue = parseFloat(item.profit || 0);
                            const percent = totalProfit > 0 ? ((profitValue / totalProfit) * 100).toFixed(1) : '0';
                            
                            return (
                              <div
                                key={`${item.name || 'item'}-${item.id || index}`}
                                className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
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
                                    {formatMoney(profitValue)} • {percent}%
                                  </p>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-center py-4 text-analytics-secondary text-sm">
                            {profitabilityError ? 'Error loading data' : 'No data available'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>,
                  document.body
                )}
              </div>
              <div className="glass-card-pro p-4 sm:p-5 relative">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm sm:text-base text-analytics-primary">Sales by Category</h3>
                  {salesByCategory && salesByCategory.length > 0 && (
                    <div className="relative">
                      <button
                        ref={categorySalesButtonRef}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (categorySalesButtonRef.current) {
                            const rect = categorySalesButtonRef.current.getBoundingClientRect();
                            // Position dropdown to the left, with top-right corner aligned with button's bottom-right
                            setCategorySalesDropdownPosition({
                              top: rect.bottom,
                              left: Math.max(8, rect.right - 320) // 320 is maxWidth, ensure 8px margin from left edge
                            });
                          }
                          setShowCategorySalesDropdown(!showCategorySalesDropdown);
                        }}
                        className="glass-button-secondary px-3 py-1.5 rounded-lg text-xs font-medium transition-all text-analytics-primary hover:opacity-80 flex items-center gap-1.5"
                      >
                        <span>View All</span>
                        <ChevronDown size={14} className={`transition-transform duration-200 ${showCategorySalesDropdown ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  )}
                </div>
                {salesByCategoryLoading ? (
                  <div className="h-[200px] flex items-center justify-center text-analytics-secondary">Loading...</div>
                ) : (salesByCategory && salesByCategory.length > 0 ? (
                  <div className="w-full h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                          data={salesByCategory.slice(0, 5)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                          label={({ name, percent }) => {
                            if (percent < 0.05) return '';
                            const shortName = name && name.length > 12 ? name.substring(0, 10) + '...' : (name || 'Other');
                            return `${shortName} ${(percent * 100).toFixed(0)}%`;
                          }}
                          outerRadius={60}
                          innerRadius={20}
                    fill="#8884d8"
                    dataKey="value"
                  >
                          {salesByCategory.slice(0, 5).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                        <Tooltip formatter={(value, name, props) => {
                          const payload = props.payload;
                          // Calculate percentage from all items (not just top 5) for consistency with dropdown
                          const totalValue = salesByCategory.reduce((sum, item) => sum + parseFloat(item.value || 0), 0);
                          const percent = totalValue > 0 ? ((parseFloat(value) / totalValue) * 100).toFixed(1) : '0';
                          return [`${formatMoney(parseFloat(value))} (${percent}%)`, name];
                        }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
                ) : <div className="h-[200px] flex items-center justify-center text-analytics-secondary">No data</div>)}
                
                {/* Category Sales Dropdown */}
                {showCategorySalesDropdown && typeof document !== 'undefined' && createPortal(
                  <div 
                    data-category-sales-dropdown
                    style={{ 
                      position: 'fixed',
                      top: `${categorySalesDropdownPosition.top + 8}px`,
                      left: `${categorySalesDropdownPosition.left}px`,
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
                      padding: '12px',
                      minWidth: '280px',
                      maxWidth: '320px',
                      maxHeight: '300px',
                      overflowY: 'auto',
                      overflowX: 'hidden'
                    }}>
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-analytics-primary mb-3 pb-2 border-b border-white/10">
                          All Categories
                        </h4>
                        {salesByCategoryLoading ? (
                          <div className="text-center py-4 text-analytics-secondary text-sm">
                            Loading...
                          </div>
                        ) : salesByCategory && Array.isArray(salesByCategory) && salesByCategory.length > 0 ? (
                          salesByCategory.map((item, index) => {
                            const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];
                            const color = COLORS[index % COLORS.length];
                            // Calculate percentage from all items (not just top 5) for consistency
                            // Note: salesByCategory is already transformed to { name, value } format in the query
                            const totalValue = salesByCategory.reduce((sum, i) => sum + parseFloat(i.value || 0), 0);
                            const itemValue = parseFloat(item.value || 0);
                            const percent = totalValue > 0 ? ((itemValue / totalValue) * 100).toFixed(1) : '0';
                            
                            return (
                              <div
                                key={`${item.name || item.category || 'category'}-${index}`}
                                className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                              >
                                <div
                                  className="w-4 h-4 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: color }}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-analytics-primary font-medium truncate">
                                    {item.name || item.category || 'Other'}
                                  </p>
                                  <p className="text-xs text-analytics-secondary">
                                    {formatMoney(itemValue)} • {percent}%
                                  </p>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-center py-4 text-analytics-secondary text-sm">
                            {salesByCategoryError ? 'Error loading data' : 'No data available'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>,
                  document.body
                )}
              </div>
            </div>
          </main>
          {/* Right detail panel removed */}
          {/* Placeholder column to keep grid alignment on wide screens */}
          <div className="hidden lg:block w-[1px]" />
        </div>
        
        {/* AI Insights (Bottom Panel) */}
        <section className="max-w-8xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-8">
          <div className="glass-card-pro p-4 sm:p-6 flex flex-col sm:flex-row flex-wrap gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-4 items-start sm:items-center w-full sm:w-auto">
              <span className="text-analytics-primary font-semibold text-base sm:text-lg">AI Insights:</span>
              <div className="flex flex-wrap gap-2">
                {insights.length > 0 ? (
                  insights.map((insight, idx) => (
                    <span key={idx} className="glass-card-pro px-3 py-1.5 rounded-full text-xs sm:text-sm">
                      {insight.message}
                    </span>
                  ))
                ) : (
                  <span className="text-analytics-secondary text-xs sm:text-sm">No specific insights available.</span>
                )}
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto justify-end">
              <button className="glass-card-pro px-2 py-1 text-xs">Export Insights</button>
              <button className="glass-card-pro px-2 py-1 text-xs">Explain more</button>
            </div>
          </div>
        </section>
        {/* Export Modal */}
        {showExportModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="glass-card-pro max-w-md w-full mx-4">
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <h2 className="text-xl font-semibold text-analytics-primary">Export Analytics Data</h2>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="text-analytics-secondary hover:text-analytics-primary transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-analytics-secondary mb-2">Select Period</label>
                  <select
                    value={exportPeriod}
                    onChange={(e) => setExportPeriod(e.target.value)}
                    className="w-full glass-input px-3 py-2 rounded-lg text-analytics-primary focus:outline-none focus:ring-2 focus:ring-analytics-revenue/50"
                  >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="week">Last 7 Days</option>
                    <option value="month">Last 30 Days</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-analytics-secondary mb-2">Select Format</label>
                  <div className="space-y-2">
                    <button
                      onClick={() => setExportFormat('csv')}
                      className={`w-full flex items-center space-x-2 p-2.5 border rounded-lg transition-colors text-left text-sm ${
                        exportFormat === 'csv' 
                          ? 'border-analytics-revenue/50 bg-analytics-revenue/10' 
                          : 'border-white/20 hover:bg-white/5'
                      }`}
                    >
                      <FileSpreadsheet size={18} className={exportFormat === 'csv' ? 'text-analytics-revenue' : 'text-analytics-secondary'} />
                      <div>
                        <p className={`font-medium text-sm ${exportFormat === 'csv' ? 'text-analytics-primary' : 'text-analytics-secondary'}`}>CSV Format</p>
                        <p className="text-xs text-analytics-secondary">Comma-separated values file</p>
                      </div>
                    </button>
                    <button
                      onClick={() => setExportFormat('json')}
                      className={`w-full flex items-center space-x-2 p-2.5 border rounded-lg transition-colors text-left text-sm ${
                        exportFormat === 'json' 
                          ? 'border-analytics-revenue/50 bg-analytics-revenue/10' 
                          : 'border-white/20 hover:bg-white/5'
                      }`}
                    >
                      <FileSpreadsheet size={18} className={exportFormat === 'json' ? 'text-analytics-revenue' : 'text-analytics-secondary'} />
                      <div>
                        <p className={`font-medium text-sm ${exportFormat === 'json' ? 'text-analytics-primary' : 'text-analytics-secondary'}`}>JSON Format</p>
                        <p className="text-xs text-analytics-secondary">JavaScript Object Notation file</p>
                      </div>
                    </button>
                  </div>
                </div>
                <button
                  onClick={handleExport}
                  className="w-full mt-6 glass-button-primary text-white px-3 py-2 rounded-lg hover:opacity-90 transition-opacity font-medium text-sm"
                >
                  Export Data
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
    </div>
  );
}

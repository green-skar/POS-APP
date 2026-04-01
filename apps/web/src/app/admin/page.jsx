'use client';

import { apiFetch } from '@/utils/apiClient';
import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useCurrencySettings } from '@/utils/currency';
import { useTimezoneSettings } from '@/utils/timezone';
import { 
  AlertTriangle, 
  ChevronDown
} from 'lucide-react';
// Layout handles authentication and sidebar - no need to duplicate here
export default function AdminDashboard() {
  return <AdminDashboardContent />;
}

function AdminDashboardContent() {
  const { formatMoney } = useCurrencySettings();
  const { formatDateTime } = useTimezoneSettings();
  const [selectedPeriod, setSelectedPeriod] = useState('today');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const periodOptions = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'week', label: 'This Week' },
    { value: 'last7', label: 'Last 7 Days' },
    { value: 'month', label: 'This Month' },
    { value: 'last30', label: 'Last 30 Days' },
    { value: 'year', label: 'This Year' },
    { value: 'all', label: 'All Time' },
  ];

  const selectedLabel = periodOptions.find(opt => opt.value === selectedPeriod)?.label || 'Today';
  const [selectedSale, setSelectedSale] = useState(null);
  const [saleItems, setSaleItems] = useState([]);
  const [loadingSaleItems, setLoadingSaleItems] = useState(false);

  // Fetch dashboard statistics
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['dashboard-stats', selectedPeriod],
    queryFn: async () => {
      const response = await apiFetch(`/api/dashboard/stats?period=${selectedPeriod}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch dashboard stats' }));
        throw new Error(errorData.error || 'Failed to fetch dashboard stats');
      }
      return response.json();
    },
    retry: 1,
  });

  // Fetch stock alerts
  const { data: alerts = [], error: alertsError } = useQuery({
    queryKey: ['alerts'],
    queryFn: async () => {
      const response = await apiFetch('/api/alerts?unreadOnly=true', {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch alerts' }));
        throw new Error(errorData.error || 'Failed to fetch alerts');
      }
      return response.json();
    },
    retry: 1,
  });

  // Fetch low stock products
  const { data: lowStockProducts = [], error: lowStockError } = useQuery({
    queryKey: ['low-stock-products'],
    queryFn: async () => {
      const response = await apiFetch('/api/products?lowStock=true', {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch low stock products' }));
        throw new Error(errorData.error || 'Failed to fetch low stock products');
      }
      return response.json();
    },
    retry: 1,
  });


  // Fetch sale items when a sale is selected
  useEffect(() => {
    if (selectedSale) {
      setLoadingSaleItems(true);
      apiFetch(`/api/sales/${selectedSale.id}`, {
        credentials: 'include',
      })
        .then(res => {
          if (!res.ok) {
            throw new Error('Failed to fetch sale items');
          }
          return res.json();
        })
        .then(data => {
          // Use the items array directly from the API
          if (data.items && Array.isArray(data.items)) {
            setSaleItems(data.items);
          } else {
            setSaleItems([]);
          }
        })
        .catch(err => {
          console.error('Error fetching sale items:', err);
          setSaleItems([]);
        })
        .finally(() => setLoadingSaleItems(false));
    }
  }, [selectedSale]);

  // Show loading state
  if (statsLoading) {
    return (
      <div className="px-6 sm:px-8 lg:px-10 py-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state with retry option
  if (statsError) {
    return (
      <div className="px-6 sm:px-8 lg:px-10 py-6">
        <div className="glass-card-pro p-6 text-center">
          <p className="text-red-500 mb-4">Error loading dashboard: {statsError.message}</p>
          <button 
            onClick={() => refetchStats()} 
            className="glass-button-primary px-4 py-2 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 sm:px-8 lg:px-10 py-6">
      {/* Header */}
          <div className="analytics-header text-2xl mb-7 flex justify-between items-center">
            <span>Admin Dashboard</span>
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="glass-button-secondary flex items-center justify-between gap-2 px-3 py-2 text-sm text-analytics-primary min-w-[180px]"
              >
                <span>{selectedLabel}</span>
                <ChevronDown size={16} className={`transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 z-50 min-w-[180px]">
                  <div className="glass-card-pro overflow-hidden shadow-lg">
                    {periodOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setSelectedPeriod(option.value);
                          setDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          selectedPeriod === option.value
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
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Sales */}
            <div className="glass-card-pro py-6 px-5 flex flex-col items-center bounce-in">
              <span className="text-analytics-secondary text-xs mb-1">Total Sales</span>
              <span className="text-3xl text-analytics-primary font-bold soft-shadow">{stats?.sales?.total_sales || 0}</span>
            </div>
            <div className="glass-card-pro py-6 px-5 flex flex-col items-center bounce-in"><span className="text-analytics-secondary text-xs mb-1">Total Revenue</span><span className="text-3xl text-analytics-revenue font-bold soft-shadow">{formatMoney(parseFloat(stats?.sales?.total_revenue || 0))}</span></div>
            <div className="glass-card-pro py-6 px-5 flex flex-col items-center bounce-in"><span className="text-analytics-secondary text-xs mb-1">Total Products</span><span className="text-3xl text-analytics-primary font-bold soft-shadow">{stats?.products?.total_products || 0}</span></div>
            <div className="glass-card-pro py-6 px-5 flex flex-col items-center bounce-in"><span className="text-analytics-secondary text-xs mb-1">Low Stock Items</span><span className="text-3xl text-analytics-expense font-bold soft-shadow">{lowStockProducts.length || stats?.products?.low_stock_products || 0}</span></div>
          </div>
          {/* Two column section (Top products, Recent Sales) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="glass-card-pro p-6">
              <h2 className="text-lg font-semibold text-analytics-primary mb-4">Top Selling Products</h2>
            {stats?.top_products?.length > 0 ? (
                <>
              <div className="space-y-3">
                    {stats.top_products.slice(0, 6).map((product, index) => (
                      <div 
                        key={index} 
                        className="flex items-center justify-between p-3 bg-white/30 rounded-md hover:bg-white/60 transition-colors"
                      >
                        <div>
                          <h3 className="font-medium text-analytics-primary">{product.name}</h3>
                          <p className="text-sm text-analytics-secondary">Sold: {product.total_sold} units</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-analytics-revenue">{formatMoney(parseFloat(product.total_revenue))}</p>
                          <p className="text-sm text-analytics-secondary">{formatMoney(parseFloat(product.price))} each</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {stats.top_products.length > 6 && (
                    <button onClick={() => setShowTopProductsModal(true)} className="mt-4 w-full text-primary-pos text-sm font-medium">Show More ({stats.top_products.length - 6} more)</button>
                  )}
                </>
              ) : (
                <p className="text-analytics-secondary text-center py-8">No sales data available</p>
              )}
            </div>
            <div className="glass-card-pro p-6">
              <h2 className="text-lg font-semibold text-analytics-primary mb-4">Recent Sales</h2>
              {stats?.recent_sales?.length > 0 ? (
                <>
                  <div className="space-y-3">
                    {stats.recent_sales.slice(0, 6).map((sale) => (
                      <div key={sale.id} className="flex items-center justify-between p-3 bg-white/30 rounded-md hover:bg-white/60 cursor-pointer transition-colors" onClick={() => setSelectedSale(sale)}>
                        <div>
                          <p className="font-medium text-analytics-primary">Sale #{sale.id}</p>
                          <p className="text-sm text-analytics-secondary">{sale.item_count} items • {sale.payment_method}</p>
                          <p className="text-xs text-analytics-secondary">{formatDateTime(sale.created_at)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-analytics-revenue">{formatMoney(parseFloat(sale.total_amount))}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {stats.recent_sales.length > 6 && (
                    <Link to="/admin/sales" className="mt-4 w-full flex items-center justify-center text-primary-pos text-sm font-medium">Show More ({stats.recent_sales.length - 6} more)</Link>
                  )}
                </>
              ) : (
                <p className="text-analytics-secondary text-center py-8">No recent sales</p>
              )}
            </div>
          </div>
          {/* Alerts & Low Stock Products */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card-pro p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-analytics-primary">Stock Alerts</h2>
                <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">{alerts.length} unread</span>
              </div>
              {alerts.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="flex items-start space-x-3 p-3 bg-red-50/80 border border-red-200 rounded-md">
                      <AlertTriangle className="h-5 w-5 text-analytics-loss mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-analytics-loss">{alert.product_name}</p>
                        <p className="text-sm text-red-700">{alert.alert_type === 'out_of_stock' ? 'Out of stock' : `Low stock: ${alert.stock_quantity} remaining (min: ${alert.min_stock_level})`}</p>
                        <p className="text-xs text-red-600">{formatDateTime(alert.created_at)}</p>
            </div>
          </div>
                  ))}
        </div>
              ) : (
                <p className="text-analytics-secondary text-center py-8">No stock alerts</p>
              )}
            </div>
            <div className="glass-card-pro p-6">
              <h2 className="text-lg font-semibold text-analytics-expense mb-4">Low Stock Products</h2>
              {lowStockProducts.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {lowStockProducts.map((product) => (
                    <div key={product.id} className="flex items-center justify-between p-3 bg-orange-50/80 border border-orange-200 rounded-md">
                <div>
                        <h3 className="font-medium text-analytics-expense">{product.name}</h3>
                        <p className="text-sm text-analytics-secondary">{product.category}</p>
                        <p className="text-xs text-analytics-secondary">Min stock level: {product.min_stock_level}</p>
                          </div>
                          <div className="text-right">
                        <p className={`font-medium ${product.stock_quantity === 0 ? 'text-analytics-loss' : 'text-analytics-expense'}`}>{product.stock_quantity} left</p>
                        <p className="text-sm text-analytics-secondary">{formatMoney(parseFloat(product.price))}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                <p className="text-analytics-secondary text-center py-8">All products are well stocked</p>
              )}
            </div>
          </div>
    </div>
  );
}
'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  BarChart3, 
  Package, 
  AlertTriangle, 
  TrendingUp, 
  DollarSign, 
  ShoppingBag,
  Users,
  Calendar,
  ArrowLeft
} from 'lucide-react';

export default function AdminDashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState('today');

  // Fetch dashboard statistics
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats', selectedPeriod],
    queryFn: async () => {
      const response = await fetch(`/api/dashboard/stats?period=${selectedPeriod}`);
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard stats');
      }
      return response.json();
    },
  });

  // Fetch stock alerts
  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts'],
    queryFn: async () => {
      const response = await fetch('/api/alerts?unreadOnly=true');
      if (!response.ok) {
        throw new Error('Failed to fetch alerts');
      }
      return response.json();
    },
  });

  // Fetch low stock products
  const { data: lowStockProducts = [] } = useQuery({
    queryKey: ['low-stock-products'],
    queryFn: async () => {
      const response = await fetch('/api/products?lowStock=true');
      if (!response.ok) {
        throw new Error('Failed to fetch low stock products');
      }
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <a href="/" className="p-2 text-gray-600 hover:text-gray-900">
                <ArrowLeft size={20} />
              </a>
              <h1 className="text-xl font-semibold text-gray-900">Admin Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Sales */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Sales</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.sales?.total_sales || 0}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <ShoppingBag className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>

          {/* Total Revenue */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${parseFloat(stats?.sales?.total_revenue || 0).toFixed(2)}
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>

          {/* Total Products */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Products</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.products?.total_products || 0}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-full">
                <Package className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </div>

          {/* Low Stock Alerts */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Low Stock Items</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.products?.low_stock_products || 0}</p>
              </div>
              <div className="p-3 bg-orange-100 rounded-full">
                <AlertTriangle className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Top Selling Products */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Top Selling Products</h2>
            {stats?.top_products?.length > 0 ? (
              <div className="space-y-3">
                {stats.top_products.map((product, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                    <div>
                      <h3 className="font-medium text-gray-900">{product.name}</h3>
                      <p className="text-sm text-gray-600">Sold: {product.total_sold} units</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-green-600">
                        ${parseFloat(product.total_revenue).toFixed(2)}
                      </p>
                      <p className="text-sm text-gray-600">${parseFloat(product.price).toFixed(2)} each</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No sales data available</p>
            )}
          </div>

          {/* Recent Sales */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Sales</h2>
            {stats?.recent_sales?.length > 0 ? (
              <div className="space-y-3">
                {stats.recent_sales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                    <div>
                      <p className="font-medium text-gray-900">Sale #{sale.id}</p>
                      <p className="text-sm text-gray-600">
                        {sale.item_count} items • {sale.payment_method}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(sale.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-green-600">
                        ${parseFloat(sale.total_amount).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No recent sales</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stock Alerts */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">Stock Alerts</h2>
              <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {alerts.length} unread
              </span>
            </div>
            {alerts.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {alerts.map((alert) => (
                  <div key={alert.id} className="flex items-start space-x-3 p-3 bg-red-50 border border-red-200 rounded-md">
                    <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-red-900">{alert.product_name}</p>
                      <p className="text-sm text-red-700">
                        {alert.alert_type === 'out_of_stock' 
                          ? 'Out of stock' 
                          : `Low stock: ${alert.stock_quantity} remaining (min: ${alert.min_stock_level})`
                        }
                      </p>
                      <p className="text-xs text-red-600">
                        {new Date(alert.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No stock alerts</p>
            )}
          </div>

          {/* Low Stock Products */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Low Stock Products</h2>
            {lowStockProducts.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {lowStockProducts.map((product) => (
                  <div key={product.id} className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-md">
                    <div>
                      <h3 className="font-medium text-orange-900">{product.name}</h3>
                      <p className="text-sm text-orange-700">{product.category}</p>
                      <p className="text-xs text-orange-600">
                        Min stock level: {product.min_stock_level}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-medium ${
                        product.stock_quantity === 0 ? 'text-red-600' : 'text-orange-600'
                      }`}>
                        {product.stock_quantity} left
                      </p>
                      <p className="text-sm text-gray-600">${parseFloat(product.price).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">All products are well stocked</p>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <a
              href="/admin/products"
              className="flex items-center justify-center space-x-2 p-4 border border-gray-300 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              <Package size={20} className="text-gray-600" />
              <span className="font-medium text-gray-900">Manage Products</span>
            </a>
            
            <a
              href="/admin/sales"
              className="flex items-center justify-center space-x-2 p-4 border border-gray-300 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              <BarChart3 size={20} className="text-gray-600" />
              <span className="font-medium text-gray-900">View Sales</span>
            </a>
            
            <a
              href="/admin/inventory"
              className="flex items-center justify-center space-x-2 p-4 border border-gray-300 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              <TrendingUp size={20} className="text-gray-600" />
              <span className="font-medium text-gray-900">Inventory Report</span>
            </a>
            
            <a
              href="/admin/alerts"
              className="flex items-center justify-center space-x-2 p-4 border border-gray-300 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              <AlertTriangle size={20} className="text-gray-600" />
              <span className="font-medium text-gray-900">Stock Alerts</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
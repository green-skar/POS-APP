'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Package,
  Filter,
  Eye,
  EyeOff
} from 'lucide-react';

export default function AlertsManagement() {
  const [showReadAlerts, setShowReadAlerts] = useState(false);
  const queryClient = useQueryClient();

  // Fetch alerts
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['alerts', showReadAlerts],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (!showReadAlerts) params.append('unreadOnly', 'true');
      
      const response = await fetch(`/api/alerts?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch alerts');
      }
      return response.json();
    },
  });

  // Mark alert as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (alertId) => {
      const response = await fetch('/api/alerts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_id: alertId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to mark alert as read');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (error) => {
      alert(error.message);
    },
  });

  const getAlertIcon = (alertType) => {
    switch (alertType) {
      case 'out_of_stock':
        return <AlertTriangle size={20} className="text-red-500" />;
      case 'low_stock':
        return <AlertTriangle size={20} className="text-orange-500" />;
      default:
        return <AlertTriangle size={20} className="text-yellow-500" />;
    }
  };

  const getAlertColor = (alertType) => {
    switch (alertType) {
      case 'out_of_stock':
        return 'border-red-200 bg-red-50';
      case 'low_stock':
        return 'border-orange-200 bg-orange-50';
      default:
        return 'border-yellow-200 bg-yellow-50';
    }
  };

  const getAlertMessage = (alert) => {
    if (alert.alert_type === 'out_of_stock') {
      return `${alert.product_name} is completely out of stock`;
    } else if (alert.alert_type === 'low_stock') {
      return `${alert.product_name} is running low (${alert.stock_quantity} remaining, minimum: ${alert.min_stock_level})`;
    }
    return `Stock alert for ${alert.product_name}`;
  };

  const handleMarkAsRead = (alertId) => {
    markAsReadMutation.mutate(alertId);
  };

  // Calculate statistics
  const unreadAlerts = alerts.filter(alert => !alert.is_read);
  const outOfStockAlerts = alerts.filter(alert => alert.alert_type === 'out_of_stock');
  const lowStockAlerts = alerts.filter(alert => alert.alert_type === 'low_stock');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <a href="/admin" className="p-2 text-gray-600 hover:text-gray-900">
                <ArrowLeft size={20} />
              </a>
              <h1 className="text-xl font-semibold text-gray-900">Stock Alerts</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowReadAlerts(!showReadAlerts)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                  showReadAlerts 
                    ? 'bg-gray-200 text-gray-700' 
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {showReadAlerts ? <EyeOff size={16} /> : <Eye size={16} />}
                <span>{showReadAlerts ? 'Hide Read Alerts' : 'Show All Alerts'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Unread Alerts</p>
                <p className="text-2xl font-bold text-gray-900">{unreadAlerts.length}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <Clock className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Out of Stock</p>
                <p className="text-2xl font-bold text-gray-900">{outOfStockAlerts.length}</p>
              </div>
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Low Stock</p>
                <p className="text-2xl font-bold text-gray-900">{lowStockAlerts.length}</p>
              </div>
              <div className="p-3 bg-orange-100 rounded-full">
                <AlertTriangle className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Alerts List */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-900">
                {showReadAlerts ? 'All Alerts' : 'Unread Alerts'} ({alerts.length})
              </h2>
              {!showReadAlerts && unreadAlerts.length > 0 && (
                <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                  {unreadAlerts.length} unread
                </span>
              )}
            </div>
          </div>
          
          {isLoading ? (
            <div className="text-center py-8">Loading alerts...</div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-8">
              <AlertTriangle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-500">
                {showReadAlerts ? 'No alerts found' : 'No unread alerts'}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {showReadAlerts ? 'All your stock levels are healthy!' : 'Great! All alerts have been addressed.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-6 transition-colors ${
                    alert.is_read ? 'bg-gray-50' : getAlertColor(alert.alert_type)
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0 mt-1">
                        {getAlertIcon(alert.alert_type)}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <h3 className="text-sm font-medium text-gray-900">
                            {alert.product_name}
                          </h3>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            alert.alert_type === 'out_of_stock' 
                              ? 'bg-red-100 text-red-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}>
                            {alert.alert_type === 'out_of_stock' ? 'Out of Stock' : 'Low Stock'}
                          </span>
                          {alert.is_read && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              <CheckCircle size={12} className="mr-1" />
                              Read
                            </span>
                          )}
                        </div>
                        
                        <p className="text-sm text-gray-700 mb-2">
                          {getAlertMessage(alert)}
                        </p>
                        
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span>Current stock: {alert.stock_quantity}</span>
                          <span>Minimum level: {alert.min_stock_level}</span>
                          <span>{new Date(alert.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {!alert.is_read && (
                        <button
                          onClick={() => handleMarkAsRead(alert.id)}
                          disabled={markAsReadMutation.isLoading}
                          className="flex items-center space-x-1 px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle size={14} />
                          <span>Mark as Read</span>
                        </button>
                      )}
                      
                      <a
                        href="/admin/products"
                        className="flex items-center space-x-1 px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                      >
                        <Package size={14} />
                        <span>Manage Product</span>
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        {alerts.length > 0 && (
          <div className="mt-8 bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <a
                href="/admin/products"
                className="flex items-center justify-center space-x-2 p-4 border border-gray-300 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-colors"
              >
                <Package size={20} className="text-gray-600" />
                <span className="font-medium text-gray-900">Manage Products</span>
              </a>
              
              <a
                href="/admin/inventory"
                className="flex items-center justify-center space-x-2 p-4 border border-gray-300 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-colors"
              >
                <AlertTriangle size={20} className="text-gray-600" />
                <span className="font-medium text-gray-900">View Inventory Report</span>
              </a>
              
              <a
                href="/admin"
                className="flex items-center justify-center space-x-2 p-4 border border-gray-300 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-colors"
              >
                <CheckCircle size={20} className="text-gray-600" />
                <span className="font-medium text-gray-900">Back to Dashboard</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
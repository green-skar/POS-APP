'use client';

import { apiFetch } from '@/utils/apiClient';
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { 
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
  
  // Store read alerts in localStorage
  const [readAlerts, setReadAlerts] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('readAlerts');
      return stored ? JSON.parse(stored) : [];
    }
    return [];
  });

  // Fetch alerts
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['alerts', showReadAlerts, readAlerts],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (!showReadAlerts) params.append('unreadOnly', 'true');
      
      const response = await apiFetch(`/api/alerts?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch alerts');
      }
      const data = await response.json();
      
      // Mark alerts as read based on localStorage
      return data.map(alert => ({
        ...alert,
        is_read: readAlerts.includes(`${alert.product_id}_${alert.alert_type}`)
      }));
    },
  });

  // Mark alert as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (alertId) => {
      // Store in localStorage (alerts are dynamically generated, no API call needed)
      if (typeof window !== 'undefined') {
        const alert = alerts.find(a => a.id === alertId);
        if (alert) {
          const readKey = `${alert.product_id}_${alert.alert_type}`;
          const newReadAlerts = [...readAlerts, readKey];
          localStorage.setItem('readAlerts', JSON.stringify(newReadAlerts));
          setReadAlerts(newReadAlerts);
        }
      }
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Alert marked as read', {
        description: 'The alert has been marked as read.',
      });
    },
    onError: (error) => {
      console.error('Error marking alert as read:', error);
      toast.error('Failed to mark alert as read', {
        description: error.message || 'An error occurred.',
      });
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
    <div className="px-4 py-7">
        {/* Header */}
        <div className="analytics-header text-2xl mb-7 flex justify-between items-center">
          <span>Stock Alerts</span>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowReadAlerts(!showReadAlerts)}
              className={`glass-button-primary text-white font-semibold flex items-center gap-1.5 py-1 px-3 text-sm`}
            >
              {showReadAlerts ? <EyeOff size={16} /> : <Eye size={16} />}
              <span>{showReadAlerts ? 'Hide Read Alerts' : 'Show All Alerts'}</span>
            </button>
          </div>
        </div>

      <div>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="glass-card-pro p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-analytics-secondary">Unread Alerts</p>
                <p className="text-3xl font-bold text-analytics-primary soft-shadow">{unreadAlerts.length}</p>
              </div>
              <div className="p-3 bg-white/20 rounded-full">
                <Clock className="h-6 w-6 text-analytics-stock" />
              </div>
            </div>
          </div>

          <div className="glass-card-pro p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-analytics-secondary">Out of Stock</p>
                <p className="text-3xl font-bold text-analytics-loss soft-shadow">{outOfStockAlerts.length}</p>
              </div>
              <div className="p-3 bg-white/20 rounded-full">
                <AlertTriangle className="h-6 w-6 text-analytics-loss" />
              </div>
            </div>
          </div>

          <div className="glass-card-pro p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-analytics-secondary">Low Stock</p>
                <p className="text-3xl font-bold text-analytics-expense soft-shadow">{lowStockAlerts.length}</p>
              </div>
              <div className="p-3 bg-white/20 rounded-full">
                <AlertTriangle className="h-6 w-6 text-analytics-expense" />
              </div>
            </div>
          </div>
        </div>

        {/* Alerts List */}
        <div className="glass-card-pro overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-analytics-primary">
                {showReadAlerts ? 'All Alerts' : 'Unread Alerts'} ({alerts.length})
              </h2>
              {!showReadAlerts && unreadAlerts.length > 0 && (
                <span className="bg-red-100/60 text-analytics-loss text-xs font-medium px-2.5 py-0.5 rounded-full">
                  {unreadAlerts.length} unread
                </span>
              )}
            </div>
          </div>
          
          {isLoading ? (
            <div className="text-center py-8 text-analytics-secondary">Loading alerts...</div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-8">
              <AlertTriangle className="mx-auto h-12 w-12 text-analytics-secondary mb-4" />
              <p className="text-analytics-secondary">
                {showReadAlerts ? 'No alerts found' : 'No unread alerts'}
              </p>
              <p className="text-sm text-analytics-secondary mt-1">
                {showReadAlerts ? 'All your stock levels are healthy!' : 'Great! All alerts have been addressed.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-6 transition-colors hover:bg-white/20`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0 mt-1">
                        {getAlertIcon(alert.alert_type)}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <h3 className="text-sm font-semibold text-analytics-primary">
                            {alert.product_name}
                          </h3>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            alert.alert_type === 'out_of_stock' 
                              ? 'bg-red-100/60 text-analytics-loss'
                              : 'bg-orange-100/60 text-analytics-expense'
                          }`}>
                            {alert.alert_type === 'out_of_stock' ? 'Out of Stock' : 'Low Stock'}
                          </span>
                          {alert.is_read && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/30 text-analytics-secondary">
                              <CheckCircle size={12} className="mr-1" />
                              Read
                            </span>
                          )}
                        </div>
                        
                        <p className="text-sm text-analytics-secondary mb-2">
                          {getAlertMessage(alert)}
                        </p>
                        
                        <div className="flex items-center space-x-4 text-xs text-analytics-secondary">
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
                          className="glass-button-primary text-white text-[10px] sm:text-xs px-1 py-0.5 disabled:opacity-50 leading-tight"
                        >
                          <CheckCircle size={12} />
                          <span>Mark as Read</span>
                        </button>
                      )}
                      
                      <Link
                        to="/admin/products"
                        className="glass-card-pro text-[10px] sm:text-xs px-1 py-0.5 leading-tight"
                      >
                        <Package size={12} />
                        <span>Manage Product</span>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        {alerts.length > 0 && (
          <div className="mt-8 glass-card-pro p-6">
            <h2 className="text-lg font-semibold text-analytics-primary mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Link to="/admin/products" className="glass-card-pro flex items-center justify-center space-x-2 p-4">
                <Package size={20} className="text-analytics-secondary" />
                <span className="font-medium text-analytics-primary">Manage Products</span>
              </Link>
              <Link to="/admin/inventory" className="glass-card-pro flex items-center justify-center space-x-2 p-4">
                <AlertTriangle size={20} className="text-analytics-expense" />
                <span className="font-medium text-analytics-primary">View Inventory Report</span>
              </Link>
              <Link to="/admin" className="glass-card-pro flex items-center justify-center space-x-2 p-4">
                <CheckCircle size={20} className="text-analytics-stock" />
                <span className="font-medium text-analytics-primary">Back to Dashboard</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
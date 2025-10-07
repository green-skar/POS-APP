'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Calendar, 
  Filter, 
  Eye, 
  CreditCard, 
  Banknote, 
  Smartphone,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';

export default function SalesManagement() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedSale, setSelectedSale] = useState(null);

  // Fetch sales
  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['sales', startDate, endDate, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (statusFilter) params.append('status', statusFilter);
      
      const response = await fetch(`/api/sales?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch sales');
      }
      return response.json();
    },
  });

  // Fetch single sale details
  const { data: saleDetails } = useQuery({
    queryKey: ['sale', selectedSale],
    queryFn: async () => {
      if (!selectedSale) return null;
      const response = await fetch(`/api/sales/${selectedSale}`);
      if (!response.ok) {
        throw new Error('Failed to fetch sale details');
      }
      return response.json();
    },
    enabled: !!selectedSale,
  });

  const getPaymentIcon = (method) => {
    switch (method) {
      case 'cash':
        return <Banknote size={16} className="text-green-600" />;
      case 'card':
        return <CreditCard size={16} className="text-blue-600" />;
      case 'mpesa':
        return <Smartphone size={16} className="text-green-600" />;
      default:
        return null;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} className="text-green-600" />;
      case 'failed':
        return <XCircle size={16} className="text-red-600" />;
      case 'pending':
        return <Clock size={16} className="text-yellow-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Calculate totals
  const totalSales = sales.length;
  const totalRevenue = sales
    .filter(sale => sale.payment_status === 'completed')
    .reduce((sum, sale) => sum + parseFloat(sale.total_amount), 0);
  const completedSales = sales.filter(sale => sale.payment_status === 'completed').length;

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
              <h1 className="text-xl font-semibold text-gray-900">Sales Management</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Sales</p>
                <p className="text-2xl font-bold text-gray-900">{totalSales}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Completed Sales</p>
                <p className="text-2xl font-bold text-gray-900">{completedSales}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                <p className="text-2xl font-bold text-gray-900">${totalRevenue.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <Banknote className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Status</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setStatusFilter('');
                }}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                <Filter size={16} />
                <span>Clear Filters</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sales List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">Sales Transactions</h2>
              </div>
              
              {isLoading ? (
                <div className="text-center py-8">Loading sales...</div>
              ) : sales.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No sales found</div>
              ) : (
                <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                  {sales.map((sale) => (
                    <div
                      key={sale.id}
                      className={`p-6 hover:bg-gray-50 cursor-pointer transition-colors ${
                        selectedSale === sale.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                      }`}
                      onClick={() => setSelectedSale(sale.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              Sale #{sale.id}
                            </p>
                            <p className="text-sm text-gray-600">
                              {new Date(sale.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-3">
                          <div className="text-right">
                            <p className="text-sm font-medium text-gray-900">
                              ${parseFloat(sale.total_amount).toFixed(2)}
                            </p>
                            <div className="flex items-center space-x-1">
                              {getPaymentIcon(sale.payment_method)}
                              <span className="text-xs text-gray-600 capitalize">
                                {sale.payment_method}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-center space-y-1">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(sale.payment_status)}`}>
                              {getStatusIcon(sale.payment_status)}
                              <span className="ml-1 capitalize">{sale.payment_status}</span>
                            </span>
                            <span className="text-xs text-gray-500">
                              {sale.item_count} items
                            </span>
                          </div>
                          
                          <Eye size={16} className="text-gray-400" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sale Details */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6 sticky top-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Sale Details</h2>
              
              {!selectedSale ? (
                <p className="text-gray-500 text-center py-8">Select a sale to view details</p>
              ) : !saleDetails ? (
                <div className="text-center py-8">Loading details...</div>
              ) : (
                <div className="space-y-4">
                  {/* Sale Info */}
                  <div className="border-b pb-4">
                    <h3 className="font-medium text-gray-900 mb-2">Sale #{saleDetails.id}</h3>
                    <div className="space-y-1 text-sm">
                      <p className="text-gray-600">
                        Date: {new Date(saleDetails.created_at).toLocaleString()}
                      </p>
                      <div className="flex items-center space-x-2">
                        <span className="text-gray-600">Payment:</span>
                        {getPaymentIcon(saleDetails.payment_method)}
                        <span className="capitalize">{saleDetails.payment_method}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-gray-600">Status:</span>
                        {getStatusIcon(saleDetails.payment_status)}
                        <span className={`capitalize ${
                          saleDetails.payment_status === 'completed' ? 'text-green-600' :
                          saleDetails.payment_status === 'failed' ? 'text-red-600' :
                          'text-yellow-600'
                        }`}>
                          {saleDetails.payment_status}
                        </span>
                      </div>
                      {saleDetails.mpesa_transaction_id && (
                        <p className="text-gray-600">
                          M-Pesa ID: {saleDetails.mpesa_transaction_id}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Items */}
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Items</h4>
                    <div className="space-y-2">
                      {saleDetails.items && saleDetails.items.map((item, index) => (
                        <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {item.product_name}
                            </p>
                            <p className="text-xs text-gray-600">
                              ${parseFloat(item.unit_price).toFixed(2)} × {item.quantity}
                            </p>
                          </div>
                          <p className="text-sm font-medium text-gray-900">
                            ${parseFloat(item.total_price).toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Total */}
                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-medium text-gray-900">Total:</span>
                      <span className="text-xl font-bold text-green-600">
                        ${parseFloat(saleDetails.total_amount).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
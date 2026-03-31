'use client';

import { apiFetch } from '@/utils/apiClient';
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  Calendar, 
  Filter, 
  Eye, 
  CreditCard, 
  Banknote, 
  Smartphone,
  CheckCircle,
  XCircle,
  Clock,
  Download,
  FileSpreadsheet,
  X,
  ChevronDown,
  RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
// Sidebar is now in admin layout - no need to import here
import { usePasswordConfirmation } from '@/utils/usePasswordConfirmation';
import { saveFile } from '@/utils/saveFile';
import ConfirmationModal from '@/components/ConfirmationModal';
import { useCurrencySettings } from '@/utils/currency';

export default function SalesManagement() {
  const { formatMoney } = useCurrencySettings();
  // Password confirmation hook
  const {
    showPasswordModal,
    setShowPasswordModal,
    password,
    setPassword,
    handlePasswordConfirm,
    requirePassword
  } = usePasswordConfirmation();
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedSale, setSelectedSale] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0, width: 0 });
  const statusDropdownRef = useRef(null);
  const statusButtonRef = useRef(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [selectedItemForReturn, setSelectedItemForReturn] = useState(null);
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [returnReason, setReturnReason] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const queryClient = useQueryClient();

  const statusOptions = [
    { value: '', label: 'All Status' },
    { value: 'completed', label: 'Completed' },
    { value: 'pending', label: 'Pending' },
    { value: 'failed', label: 'Failed' }
  ];

  // Calculate dropdown position
  useEffect(() => {
    if (statusDropdownOpen && statusButtonRef.current) {
      const updatePosition = () => {
        if (statusButtonRef.current) {
          const rect = statusButtonRef.current.getBoundingClientRect();
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
      let parent = statusButtonRef.current.parentElement;
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
  }, [statusDropdownOpen]);

  // Close dropdown when clicking outside (but not on scroll)
  useEffect(() => {
    if (!statusDropdownOpen) return;
    
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
      const dropdownElement = document.querySelector('[data-status-dropdown]');
      const clickedDropdown = dropdownElement && (dropdownElement.contains(event.target) || dropdownElement === event.target);
      const clickedButton = statusButtonRef.current && statusButtonRef.current.contains(event.target);
      
      if (!clickedButton && !clickedDropdown) {
        setStatusDropdownOpen(false);
      }
    };
    
    window.addEventListener('scroll', handleScrollStart, true);
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      window.removeEventListener('scroll', handleScrollStart, true);
      document.removeEventListener('mousedown', handleClickOutside);
      clearTimeout(scrollTimeout);
    };
  }, [statusDropdownOpen]);

  // Fetch sales
  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['sales', startDate, endDate, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (statusFilter) params.append('status', statusFilter);
      
      const response = await apiFetch(`/api/sales?${params}`);
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
      const response = await apiFetch(`/api/sales/${selectedSale}`);
      if (!response.ok) {
        throw new Error('Failed to fetch sale details');
      }
      return response.json();
    },
    enabled: !!selectedSale,
  });

  // Fetch returns for the selected sale
  const { data: saleReturns = [] } = useQuery({
    queryKey: ['returns', selectedSale],
    queryFn: async () => {
      if (!selectedSale) return [];
      const response = await apiFetch(`/api/returns?saleId=${selectedSale}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!selectedSale,
  });

  // Process return mutation
  const processReturnMutation = useMutation({
    mutationFn: async (returnData) => {
      const response = await apiFetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(returnData),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to process return');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Return processed successfully', {
        description: 'The item has been returned and stock has been adjusted.',
      });
      setShowReturnModal(false);
      setSelectedItemForReturn(null);
      setReturnQuantity(1);
      setReturnReason('');
      setReturnNotes('');
      queryClient.invalidateQueries({ queryKey: ['returns', selectedSale] });
      queryClient.invalidateQueries({ queryKey: ['sale', selectedSale] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
    onError: (error) => {
      toast.error('Failed to process return', {
        description: error.message || 'An error occurred while processing the return.',
      });
    },
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

  // Export to CSV
  const handleExport = () => {
    requirePassword('export', async () => {
    let content = '';
    let filename = '';
    let mimeType = '';
    
    const dateRange = startDate && endDate ? `_${startDate}_${endDate}` : startDate ? `_from_${startDate}` : endDate ? `_until_${endDate}` : '';
    const statusStr = statusFilter ? `_${statusFilter}` : '';
    
    if (exportFormat === 'csv') {
      const headers = ['Sale ID', 'Total Amount', 'Items', 'Payment Method', 'Payment Status', 'Date', 'M-Pesa Transaction ID'];
      const csvData = sales.map(sale => [
        sale.id,
        sale.total_amount,
        sale.item_count || 0,
        sale.payment_method,
        sale.payment_status,
        new Date(sale.created_at).toLocaleString(),
        sale.mpesa_transaction_id || ''
      ]);

      content = [headers, ...csvData]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');
      filename = `sales_export${dateRange}${statusStr}_${new Date().toISOString().split('T')[0]}.csv`;
      mimeType = 'text/csv';
    } else if (exportFormat === 'json') {
      const jsonData = sales.map(sale => ({
        id: sale.id,
        total_amount: sale.total_amount,
        item_count: sale.item_count || 0,
        payment_method: sale.payment_method,
        payment_status: sale.payment_status,
        mpesa_transaction_id: sale.mpesa_transaction_id || null,
        created_at: sale.created_at,
        items: sale.items || ''
      }));

      content = JSON.stringify(jsonData, null, 2);
      filename = `sales_export${dateRange}${statusStr}_${new Date().toISOString().split('T')[0]}.json`;
      mimeType = 'application/json';
    }
    
    const blob = new Blob([content], { type: mimeType });
    await saveFile(blob, filename);
    setShowExportModal(false);
      toast.success('Export completed successfully!', {
        description: `Your sales data has been exported as ${filename}`,
      });
    }, { action: 'export_sales' });
  };

  return (
    <div className="px-4 py-7">
        {/* Header */}
        <div className="analytics-header text-2xl mb-7 flex justify-between items-center">
          <span>Sales Management</span>
          <button onClick={() => setShowExportModal(true)} className="glass-button-primary text-white font-semibold flex items-center gap-1.5 py-1 px-3 text-sm">
            <Download size={16} /> Export
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="glass-card-pro py-6 px-5 flex flex-col items-center bounce-in">
            <span className="text-analytics-secondary text-xs mb-1">Total Sales</span>
            <span className="text-3xl text-analytics-primary font-bold soft-shadow">{totalSales}</span>
          </div>
          <div className="glass-card-pro py-6 px-5 flex flex-col items-center bounce-in">
            <span className="text-analytics-secondary text-xs mb-1">Completed Sales</span>
            <span className="text-3xl text-analytics-revenue font-bold soft-shadow">{completedSales}</span>
          </div>
          <div className="glass-card-pro py-6 px-5 flex flex-col items-center bounce-in">
            <span className="text-analytics-secondary text-xs mb-1">Total Revenue</span>
            <span className="text-3xl text-analytics-profit font-bold soft-shadow">{formatMoney(totalRevenue)}</span>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card-pro p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-analytics-secondary mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="glass-input w-full px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-analytics-secondary mb-1">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="glass-input w-full px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-analytics-secondary mb-1">Status</label>
              <div className="relative" ref={statusDropdownRef}>
                <button
                  ref={statusButtonRef}
                  onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                  className="glass-button-secondary flex items-center justify-between gap-2 w-full px-3 py-2 text-sm text-analytics-primary"
                >
                  <span>{statusFilter ? statusOptions.find(opt => opt.value === statusFilter)?.label || 'Filter by status' : 'Filter by status'}</span>
                  <ChevronDown size={16} className={`transition-transform duration-200 ${statusDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {statusDropdownOpen && typeof document !== 'undefined' && createPortal(
                  <div 
                    data-status-dropdown
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
                      {statusOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => {
                            setStatusFilter(option.value);
                            setStatusDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                            statusFilter === option.value
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
            <div className="flex items-end">
              <button onClick={() => { setStartDate(''); setEndDate(''); setStatusFilter(''); }} className="glass-button-secondary w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm">
                <Filter size={16} /> <span>Clear Filters</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* Sales List */}
          <div className="flex flex-col">
            <div className="glass-card-pro overflow-hidden flex flex-col" style={{ height: 'calc(6 * 92px + 60px)' }}>
              <div className="px-6 py-4 border-b border-white/10 flex-shrink-0">
                <h2 className="text-lg font-semibold text-analytics-primary">Sales Transactions</h2>
              </div>
              {isLoading ? (
                <div className="text-center py-8 text-analytics-secondary flex-1 flex items-center justify-center">Loading sales...</div>
              ) : sales.length === 0 ? (
                <div className="text-center py-8 text-analytics-secondary flex-1 flex items-center justify-center">No sales found</div>
              ) : (
                <div className="divide-y divide-white/10 overflow-y-auto sales-list-scroll flex-1 min-h-0">
                  {sales.map((sale) => (
                    <div key={sale.id}
                      className={`p-6 hover:bg-white/25 cursor-pointer transition-colors ${selectedSale === sale.id ? 'bg-blue-50/30 border-l-4 border-blue-500' : ''}`}
                      onClick={() => setSelectedSale(sale.id)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div>
                            <p className="text-sm font-semibold text-analytics-primary">Sale #{sale.id}</p>
                            <p className="text-xs text-analytics-secondary">{new Date(sale.created_at).toLocaleString()}</p>
                            {sale.created_by_full_name || sale.created_by_username ? (
                              <p className="text-xs text-analytics-secondary mt-0.5">
                                By: {sale.created_by_full_name || sale.created_by_username}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="text-right">
                            <p className="text-base font-bold text-analytics-profit">{formatMoney(parseFloat(sale.total_amount))}</p>
                            <div className="flex items-center space-x-1">
                              {getPaymentIcon(sale.payment_method)}
                              <span className="text-xs text-analytics-secondary capitalize">{sale.payment_method}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-center space-y-1">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(sale.payment_status)}`}>
                              {getStatusIcon(sale.payment_status)}
                              <span className="ml-1 capitalize">{sale.payment_status}</span>
                            </span>
                            <span className="text-xs text-analytics-secondary">
                              {sale.item_count || 0} {sale.item_count === 1 ? 'item' : 'items'}
                            </span>
                          </div>
                          <Eye size={16} className="text-analytics-secondary" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Sale Details */}
          <div className="flex flex-col">
            <div className="glass-card-pro flex flex-col overflow-hidden" style={{ height: 'calc(6 * 92px + 60px)' }}>
              <div className="px-6 py-4 border-b border-white/10 flex-shrink-0">
                <h2 className="text-lg font-semibold text-analytics-primary">Sale Details</h2>
              </div>
              <div className="p-6 overflow-y-auto sale-details-scroll flex-1 min-h-0">
              {!selectedSale ? (
                <p className="text-analytics-secondary text-center py-8">Select a sale to view details</p>
              ) : !saleDetails ? (
                <div className="text-center py-8 text-analytics-secondary">Loading details...</div>
              ) : (
                <div className="space-y-4">
                  {/* Sale Info */}
                  <div className="border-b border-white/10 pb-4">
                    <h3 className="font-semibold text-analytics-primary mb-2">Sale #{saleDetails.id}</h3>
                    <div className="space-y-1 text-sm">
                      <p className="text-analytics-secondary">Date: {new Date(saleDetails.created_at).toLocaleString()}</p>
                      {(saleDetails.created_by_full_name || saleDetails.created_by_username) && (
                        <p className="text-analytics-secondary">
                          Created by: {saleDetails.created_by_full_name || saleDetails.created_by_username}
                        </p>
                      )}
                      <div className="flex items-center space-x-2">
                        <span className="text-analytics-secondary">Payment:</span>
                        {getPaymentIcon(saleDetails.payment_method)}
                        <span className="capitalize">{saleDetails.payment_method}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-analytics-secondary">Status:</span>
                        {getStatusIcon(saleDetails.payment_status)}
                        <span className={`capitalize ${saleDetails.payment_status === 'completed' ? 'text-analytics-revenue' : saleDetails.payment_status === 'failed' ? 'text-analytics-loss' : 'text-analytics-expense'}`}>{saleDetails.payment_status}</span>
                      </div>
                      {saleDetails.mpesa_transaction_id && (
                        <p className="text-analytics-secondary">M-Pesa ID: {saleDetails.mpesa_transaction_id}</p>
                      )}
                    </div>
                  </div>
                  {/* Items */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-analytics-primary">Items</h4>
                      <span className="text-xs text-analytics-secondary">
                        {saleDetails.item_count || (saleDetails.items ? saleDetails.items.length : 0)} {saleDetails.item_count === 1 || (saleDetails.items && saleDetails.items.length === 1) ? 'item' : 'items'}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {saleDetails.items && saleDetails.items.length > 0 ? (
                        saleDetails.items.map((item, index) => {
                          // Calculate how many units have already been returned for this item
                          const itemReturns = saleReturns.filter(r => r.sale_item_id === item.id);
                          const returnedQuantity = itemReturns.reduce((sum, r) => sum + (r.quantity || 0), 0);
                          const remainingQuantity = (item.quantity || 0) - returnedQuantity;
                          const canReturn = saleDetails.payment_status === 'completed' && remainingQuantity > 0;
                          
                          return (
                            <div key={index} className="flex justify-between items-start p-3 bg-white/20 rounded-lg border border-white/10">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="text-sm font-semibold text-analytics-primary">
                                    {item.item_name || item.product_name || item.service_name || 'Unknown Item'}
                                  </p>
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-white/30 text-analytics-secondary capitalize">
                                    {item.item_type || (item.product_id ? 'product' : 'service')}
                                  </span>
                                </div>
                                <p className="text-xs text-analytics-secondary">
                                  {formatMoney(parseFloat(item.unit_price || 0))} × {item.quantity} 
                                  <span className="ml-2 text-analytics-secondary/80">
                                    ({formatMoney(parseFloat((item.unit_price || 0) * (item.quantity || 0)))})
                                  </span>
                                </p>
                                {returnedQuantity > 0 && (
                                  <p className="text-xs text-analytics-loss mt-1">
                                    Returned: {returnedQuantity} of {item.quantity}
                                  </p>
                                )}
                              </div>
                              <div className="text-right ml-4 flex flex-col items-end gap-1">
                                <p className="text-sm font-bold text-analytics-revenue">{formatMoney(parseFloat(item.total_price || 0))}</p>
                                <p className="text-xs text-analytics-secondary mt-0.5">Qty: {item.quantity}</p>
                                {canReturn && (
                                  <button
                                    onClick={() => {
                                      requirePassword('return', () => {
                                        setSelectedItemForReturn(item);
                                        setReturnQuantity(1);
                                        setShowReturnModal(true);
                                      }, { 
                                        sale_id: saleDetails.id,
                                        item_id: item.id,
                                        item_name: item.item_name || item.product_name || item.service_name
                                      });
                                    }}
                                    className="glass-button-secondary px-2 py-0.5 text-[10px] sm:text-xs leading-tight flex items-center gap-1 mt-1"
                                  >
                                    <RotateCcw size={12} />
                                    Return
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-analytics-secondary text-center py-4">No items found</p>
                      )}
                    </div>
                  </div>
                  {/* Returns Summary */}
                  {saleReturns && saleReturns.length > 0 && (
                    <div className="border-t border-white/10 pt-4">
                      <h4 className="font-semibold text-analytics-primary mb-2">Returns</h4>
                      <div className="space-y-2">
                        {saleReturns.map((returnItem, idx) => (
                          <div key={idx} className="flex justify-between items-center p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                            <div className="flex-1">
                              <p className="text-xs font-medium text-analytics-loss">
                                {returnItem.product_name || returnItem.service_name || 'Item'}
                              </p>
                              <p className="text-[10px] text-analytics-secondary">
                                {returnItem.return_reason && `${returnItem.return_reason} • `}
                                Qty: {returnItem.quantity}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-bold text-analytics-loss">
                                {formatMoney(parseFloat(returnItem.return_amount || 0))}
                              </p>
                              <p className="text-[10px] text-analytics-secondary">
                                {new Date(returnItem.return_date).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 pt-2 border-t border-white/10">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-analytics-secondary">Total Returned:</span>
                          <span className="font-bold text-analytics-loss">
                            {formatMoney(saleReturns.reduce((sum, r) => sum + parseFloat(r.return_amount || 0), 0))}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Total */}
                  <div className="border-t border-white/10 pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold text-analytics-primary">Total:</span>
                      <span className="text-xl font-bold text-analytics-profit">{formatMoney(parseFloat(saleDetails.total_amount))}</span>
                    </div>
                    {saleReturns && saleReturns.length > 0 && (
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/10">
                        <span className="text-sm text-analytics-secondary">Net (after returns):</span>
                        <span className="text-lg font-bold text-analytics-revenue">
                          {formatMoney(parseFloat(saleDetails.total_amount) - saleReturns.reduce((sum, r) => sum + parseFloat(r.return_amount || 0), 0))}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>

        {/* Return Modal */}
        {showReturnModal && selectedItemForReturn && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="glass-card-pro max-w-md w-full mx-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/30">
                <h2 className="text-xl font-semibold text-analytics-primary">Process Return</h2>
                <button onClick={() => {
                  setShowReturnModal(false);
                  setSelectedItemForReturn(null);
                }} className="text-analytics-secondary hover:text-analytics-primary"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <p className="text-sm text-analytics-secondary mb-1">Item</p>
                  <p className="text-base font-semibold text-analytics-primary">
                    {selectedItemForReturn.item_name || selectedItemForReturn.product_name || selectedItemForReturn.service_name}
                  </p>
                </div>
                
                {/* Calculate remaining quantity */}
                {(() => {
                  const itemReturns = saleReturns.filter(r => r.sale_item_id === selectedItemForReturn.id);
                  const returnedQuantity = itemReturns.reduce((sum, r) => sum + (r.quantity || 0), 0);
                  const maxReturnable = (selectedItemForReturn.quantity || 0) - returnedQuantity;
                  return (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-analytics-secondary mb-2">
                          Quantity to Return (Max: {maxReturnable})
                        </label>
                        <input
                          type="number"
                          min="1"
                          max={maxReturnable}
                          value={returnQuantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 1;
                            setReturnQuantity(Math.min(Math.max(1, val), maxReturnable));
                          }}
                          className="glass-input w-full px-3 py-2 text-sm"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-analytics-secondary mb-2">Return Reason (Optional)</label>
                        <select
                          value={returnReason}
                          onChange={(e) => setReturnReason(e.target.value)}
                          className="glass-input w-full px-3 py-2 text-sm"
                        >
                          <option value="">Select reason...</option>
                          <option value="defective">Defective/Damaged</option>
                          <option value="wrong_item">Wrong Item</option>
                          <option value="customer_request">Customer Request</option>
                          <option value="expired">Expired</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-analytics-secondary mb-2">Notes (Optional)</label>
                        <textarea
                          value={returnNotes}
                          onChange={(e) => setReturnNotes(e.target.value)}
                          rows={3}
                          className="glass-input w-full px-3 py-2 text-sm"
                          placeholder="Additional notes about the return..."
                        />
                      </div>
                      
                      <div className="pt-2 border-t border-white/10">
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-sm text-analytics-secondary">Return Amount:</span>
                          <span className="text-lg font-bold text-analytics-loss">
                            {formatMoney(parseFloat(selectedItemForReturn.unit_price || 0) * returnQuantity)}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setShowReturnModal(false);
                              setSelectedItemForReturn(null);
                            }}
                            className="glass-button-secondary flex-1 px-4 py-2 text-sm"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              processReturnMutation.mutate({
                                saleId: selectedSale,
                                saleItemId: selectedItemForReturn.id,
                                productId: selectedItemForReturn.product_id || null,
                                serviceId: selectedItemForReturn.service_id || null,
                                quantity: returnQuantity,
                                returnReason: returnReason || null,
                                returnAmount: parseFloat(selectedItemForReturn.unit_price || 0) * returnQuantity,
                                notes: returnNotes || null,
                              });
                            }}
                            disabled={processReturnMutation.isPending || returnQuantity < 1 || returnQuantity > maxReturnable}
                            className="glass-button-primary text-white flex-1 px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {processReturnMutation.isPending ? 'Processing...' : 'Process Return'}
                          </button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Export Modal */}
        {showExportModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="glass-card-pro max-w-md w-full mx-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/30">
                <h2 className="text-xl font-semibold text-analytics-primary">Export Sales Data</h2>
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
                  {startDate && endDate && (<p className="mt-1">• Date Range: {startDate} to {endDate}</p>)}
                  {statusFilter && (<p className="mt-1">• Status: {statusFilter}</p>)}
                  {sales.length > 0 && (<p className="mt-1">• {sales.length} {sales.length === 1 ? 'sale' : 'sales'} will be exported</p>)}
                  {!startDate && !endDate && !statusFilter && (<p className="mt-1">• All sales</p>)}
                </div>
                <button onClick={handleExport} className="w-full mt-6 glass-button-primary text-white font-semibold py-1 px-3 text-sm">Export Data</button>
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
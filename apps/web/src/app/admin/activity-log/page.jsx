'use client';

import { apiFetch } from '@/utils/apiClient';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { 
  History, 
  Trash2, 
  Edit2, 
  RotateCcw, 
  Settings, 
  AlertTriangle,
  Clock,
  X,
  Calendar,
  Filter,
  ChevronDown
} from 'lucide-react';
import { usePasswordConfirmation } from '@/utils/usePasswordConfirmation';
import ConfirmationModal from '@/components/ConfirmationModal';
import { useTimezoneSettings } from '@/utils/timezone';

export default function ActivityLogPage() {
  const { formatDateTime } = useTimezoneSettings();
  // Password confirmation hook
  const {
    showPasswordModal,
    setShowPasswordModal,
    password,
    setPassword,
    handlePasswordConfirm,
    requirePassword
  } = usePasswordConfirmation();
  const [filterType, setFilterType] = useState('all'); // 'all', 'deleted', 'modified', 'create'
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [alertDaysBefore, setAlertDaysBefore] = useState(7);
  const [showUndoModal, setShowUndoModal] = useState(false);
  const [itemToUndo, setItemToUndo] = useState(null);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0, width: 0 });
  const filterDropdownRef = useRef(null);
  const filterButtonRef = useRef(null);
  const queryClient = useQueryClient();

  const filterOptions = [
    { value: 'all', label: 'All Activities' },
    { value: 'deleted', label: 'Deleted Items' },
    { value: 'modified', label: 'Modified Items' },
    { value: 'create', label: 'Created Items' },
    { value: 'return', label: 'Returns' }
  ];

  const selectedFilter = filterOptions.find(opt => opt.value === filterType) || filterOptions[0];

  // Calculate dropdown position
  useEffect(() => {
    if (filterDropdownOpen && filterButtonRef.current) {
      const updatePosition = () => {
        if (filterButtonRef.current) {
          const rect = filterButtonRef.current.getBoundingClientRect();
          setDropdownPosition({
            top: rect.bottom + 8,
            left: rect.left,
            width: rect.width
          });
        }
      };
      updatePosition();
      
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [filterDropdownOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!filterDropdownOpen) return;
    
    const handleClickOutside = (event) => {
      if (
        filterDropdownRef.current &&
        !filterDropdownRef.current.contains(event.target) &&
        filterButtonRef.current &&
        !filterButtonRef.current.contains(event.target)
      ) {
        setFilterDropdownOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filterDropdownOpen]);

  // Fetch activity log
  const { data: activityLog, isLoading } = useQuery({
    queryKey: ['activity-log', filterType],
    queryFn: async () => {
      const response = await apiFetch(`/api/activity-log?type=${filterType}`);
      if (!response.ok) throw new Error('Failed to fetch activity log');
      return response.json();
    }
  });

  // Fetch settings
  const { data: settings } = useQuery({
    queryKey: ['activity-log-settings'],
    queryFn: async () => {
      const response = await apiFetch('/api/activity-log/settings');
      if (!response.ok) throw new Error('Failed to fetch settings');
      return response.json();
    }
  });

  useEffect(() => {
    if (settings) {
      setRetentionDays(parseInt(settings.retention_days) || 30);
      setAlertDaysBefore(parseInt(settings.alert_days_before) || 7);
    }
  }, [settings]);

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (data) => {
      const response = await apiFetch('/api/activity-log/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update settings');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-log-settings'] });
      queryClient.invalidateQueries({ queryKey: ['activity-log'] });
      toast.success('Settings updated successfully!');
      setShowSettingsModal(false);
    },
    onError: (error) => {
      toast.error('Failed to update settings', {
        description: error.message
      });
    }
  });

  // Undo mutation
  const undoMutation = useMutation({
    mutationFn: async (logId) => {
      const response = await apiFetch(`/api/activity-log/${logId}/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to undo action');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-log'] });
      toast.success('Action undone successfully!');
      setShowUndoModal(false);
      setItemToUndo(null);
    },
    onError: (error) => {
      toast.error('Failed to undo action', {
        description: error.message
      });
    }
  });

  const handleUndo = (item) => {
    setItemToUndo(item);
    requirePassword('update', () => {
      setShowUndoModal(true);
    }, { action: 'undo_action', entity_type: item.entity_type, entity_id: item.entity_id });
  };

  const confirmUndo = () => {
    if (itemToUndo) {
      undoMutation.mutate(itemToUndo.id);
    }
  };

  const handleSaveSettings = () => {
    requirePassword('update', () => {
      updateSettingsMutation.mutate({
        retention_days: retentionDays,
        alert_days_before: alertDaysBefore
      });
    }, { action: 'update_activity_log_settings' });
  };

  const getDaysUntilDeletion = (permanentDeleteAt) => {
    if (!permanentDeleteAt) return null;
    const deleteDate = new Date(permanentDeleteAt);
    const now = new Date();
    const diffTime = deleteDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getActionIcon = (actionType) => {
    switch (actionType) {
      case 'delete':
        return <Trash2 size={16} className="text-red-500" />;
      case 'update':
      case 'modify':
        return <Edit2 size={16} className="text-blue-500" />;
      case 'create':
        return <RotateCcw size={16} className="text-green-500" />;
      default:
        return <History size={16} />;
    }
  };

  const getActionLabel = (actionType) => {
    switch (actionType) {
      case 'delete':
        return 'Deleted';
      case 'update':
      case 'modify':
        return 'Modified';
      case 'create':
        return 'Created';
      default:
        return actionType;
    }
  };

  const filteredLogs = activityLog || [];

  return (
    <div className="px-4 py-7">
        {/* Header */}
        <div className="analytics-header text-2xl mb-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <History size={28} className="text-analytics-accent" />
            <span>Activity Log</span>
          </div>
          <button
            onClick={() => {
              requirePassword('view', () => {
                setShowSettingsModal(true);
              }, { action: 'view_activity_log_settings' });
            }}
            className="glass-button-secondary px-3 py-1.5 text-sm flex items-center gap-2"
          >
            <Settings size={16} />
            Settings
          </button>
        </div>

        {/* Filter Dropdown */}
        <div className="mb-6 flex items-center gap-3">
          <label className="text-sm font-medium text-analytics-secondary">Filter by:</label>
          <div className="relative">
            <button
              ref={filterButtonRef}
              onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
              className="glass-button-secondary px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 min-w-[180px] justify-between"
            >
              <span className="text-analytics-primary">{selectedFilter.label}</span>
              <ChevronDown size={16} className={`text-analytics-secondary transition-transform ${filterDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {filterDropdownOpen && typeof window !== 'undefined' && createPortal(
              <div
                ref={filterDropdownRef}
                style={{
                  position: 'fixed',
                  top: `${dropdownPosition.top}px`,
                  left: `${dropdownPosition.left}px`,
                  width: `${dropdownPosition.width}px`,
                  zIndex: 10000,
                  pointerEvents: 'auto'
                }}
                onClick={(e) => e.stopPropagation()}
                data-filter-dropdown
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
                  {filterOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setFilterType(option.value);
                        setFilterDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        filterType === option.value
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

        {/* Activity Log Table */}
        <div className="glass-card-pro rounded-lg overflow-hidden p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-analytics-secondary uppercase tracking-wider">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-analytics-secondary uppercase tracking-wider">Entity</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-analytics-secondary uppercase tracking-wider">Details</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-analytics-secondary uppercase tracking-wider">Performed By</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-analytics-secondary uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-analytics-secondary uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-analytics-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-analytics-secondary">Loading...</td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-analytics-secondary">No activity log entries found</td>
                  </tr>
                ) : (
                  filteredLogs.map((item) => {
                    const daysUntilDeletion = getDaysUntilDeletion(item.permanent_delete_at);
                    const isAlert = daysUntilDeletion !== null && daysUntilDeletion <= alertDaysBefore;
                    const canUndo = !item.is_undone && (item.action_type === 'delete' || item.action_type === 'update');

                    return (
                      <tr key={item.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {getActionIcon(item.action_type)}
                            <span className="text-sm text-analytics-primary">{getActionLabel(item.action_type)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-sm text-analytics-primary capitalize">{item.entity_type}</span>
                          <span className="text-xs text-analytics-secondary ml-2">#{item.entity_id}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-analytics-primary max-w-xs truncate">
                            {item.entity_name || (item.action_data ? (() => {
                              try {
                                const actionData = JSON.parse(item.action_data);
                                return actionData.name || actionData.title || actionData.full_name || actionData.username || 'N/A';
                              } catch {
                                return 'N/A';
                              }
                            })() : 'N/A')}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-sm text-analytics-primary">
                            {item.performed_by_name || item.performed_by_username || `User #${item.performed_by}`}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-sm text-analytics-secondary">
                            {formatDateTime(item.performed_at)}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {item.is_undone ? (
                            <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400">Undone</span>
                          ) : isAlert ? (
                            <div className="flex items-center gap-1">
                              <AlertTriangle size={14} className="text-yellow-500" />
                              <span className="text-xs text-yellow-500">
                                {daysUntilDeletion} day{daysUntilDeletion !== 1 ? 's' : ''} left
                              </span>
                            </div>
                          ) : daysUntilDeletion !== null ? (
                            <span className="text-xs text-analytics-secondary">
                              {daysUntilDeletion} day{daysUntilDeletion !== 1 ? 's' : ''} left
                            </span>
                          ) : (
                            <span className="text-xs text-analytics-secondary">Active</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {canUndo && (
                            <button
                              onClick={() => handleUndo(item)}
                              className="glass-button-secondary px-3 py-1 text-xs flex items-center gap-1"
                            >
                              <RotateCcw size={14} />
                              Undo
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Settings Modal */}
        {showSettingsModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="glass-card-pro max-w-md w-full mx-4 p-6">
              <div className="flex items-center justify-between pb-3 border-b border-white/30 mb-4">
                <h2 className="text-xl font-semibold text-analytics-primary">Activity Log Settings</h2>
                <button onClick={() => setShowSettingsModal(false)} className="text-analytics-secondary hover:text-analytics-primary">
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-analytics-secondary mb-2">
                    Retention Period (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(parseInt(e.target.value) || 30)}
                    className="glass-input w-full px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-analytics-secondary mt-1">
                    Items will be permanently deleted after this many days
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-analytics-secondary mb-2">
                    Alert Days Before Deletion
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={retentionDays}
                    value={alertDaysBefore}
                    onChange={(e) => setAlertDaysBefore(parseInt(e.target.value) || 7)}
                    className="glass-input w-full px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-analytics-secondary mt-1">
                    Show alert when this many days remain before permanent deletion
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/30">
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="glass-button-secondary px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSettings}
                  className="glass-button-primary text-white px-4 py-2 text-sm"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Undo Confirmation Modal */}
        <ConfirmationModal
          isOpen={showUndoModal}
          onClose={() => {
            setShowUndoModal(false);
            setItemToUndo(null);
          }}
          onConfirm={confirmUndo}
          title="Undo Action"
          message={itemToUndo ? `Are you sure you want to undo this ${getActionLabel(itemToUndo.action_type).toLowerCase()} action?` : ''}
          confirmText="Undo"
          cancelText="Cancel"
          type="warning"
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



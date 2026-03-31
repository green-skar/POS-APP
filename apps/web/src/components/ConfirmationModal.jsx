'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Trash2, RotateCcw, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/utils/useAuth';

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'delete', // 'delete', 'undo', 'warning', 'info'
  confirmButtonClass = 'bg-red-600 hover:bg-red-700',
  requirePassword = false, // If true, shows password input
  password = '', // Password value (controlled)
  setPassword = null, // Password setter (controlled)
  disabled = false, // Disable confirm button
  /** Tailwind z-index classes for backdrop + container (must sit above other stacked modals) */
  stackZIndexClass = 'z-50',
}) {
  const { user: authUser } = useAuth();
  
  if (!isOpen || typeof window === 'undefined') return null;

  const getIcon = () => {
    switch (type) {
      case 'delete':
        return <Trash2 size={24} className="text-red-500" />;
      case 'undo':
        return <RotateCcw size={24} className="text-blue-500" />;
      case 'warning':
        return <AlertTriangle size={24} className="text-yellow-500" />;
      default:
        return <AlertTriangle size={24} className="text-blue-500" />;
    }
  };

  const getConfirmButtonClass = () => {
    switch (type) {
      case 'delete':
        return 'bg-red-600 hover:bg-red-700 text-white';
      case 'undo':
        return 'bg-blue-600 hover:bg-blue-700 text-white';
      case 'warning':
        return 'bg-yellow-600 hover:bg-yellow-700 text-white';
      default:
        return 'bg-blue-600 hover:bg-blue-700 text-white';
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className={`fixed inset-0 bg-black/50 backdrop-blur-sm ${stackZIndexClass}`}
          />
          
          {/* Modal */}
          <div className={`fixed inset-0 ${stackZIndexClass} flex items-center justify-center p-4`}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card-pro p-6 max-w-md w-full relative"
            >
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-analytics-secondary hover:text-analytics-primary transition-colors"
              >
                <X size={20} />
              </button>

              {/* Icon and Title */}
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-shrink-0">
                  {getIcon()}
                </div>
                <h3 className="text-lg font-semibold text-analytics-primary">
                  {title}
                </h3>
              </div>

              {/* Message */}
              <p className="text-sm text-analytics-secondary mb-6 ml-10">
                {message}
              </p>

              {/* Password Input (if required) */}
              {requirePassword && (
                <div className="mb-6 ml-10">
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-analytics-secondary mb-2">
                      Username
                    </label>
                    <input
                      type="text"
                      value={authUser?.username || ''}
                      disabled
                      className="w-full glass-input px-4 py-2 rounded-lg text-analytics-primary opacity-60 cursor-not-allowed"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-analytics-secondary mb-2">
                      Password *
                    </label>
                    <input
                      type="password"
                      value={password || ''}
                      onChange={(e) => setPassword && setPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && password?.trim() && !disabled && onConfirm) {
                          onConfirm();
                        }
                      }}
                      placeholder="Enter your password"
                      className="w-full glass-input px-4 py-2 rounded-lg text-analytics-primary focus:outline-none focus:ring-2 focus:ring-analytics-revenue/50"
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all bg-white/10 text-analytics-secondary hover:bg-white/20"
                  type="button"
                >
                  {cancelText}
                </button>
                <button
                  onClick={() => {
                    if (onConfirm) {
                      onConfirm();
                    }
                    if (!requirePassword) {
                      onClose();
                    }
                  }}
                  disabled={disabled || (requirePassword && !password?.trim())}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${getConfirmButtonClass()} ${disabled || (requirePassword && !password?.trim()) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  type="button"
                >
                  {requirePassword && <Lock size={16} />}
                  {confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}





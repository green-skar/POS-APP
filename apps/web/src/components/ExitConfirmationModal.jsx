'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, LogOut, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/utils/useAuth';

export default function ExitConfirmationModal({ isOpen, onClose, onConfirm }) {
  const { logout, user } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleConfirm = async () => {
    setIsLoggingOut(true);
    try {
      console.log('✅ User confirmed exit - logging out and closing');
      
      // Clear all session markers
      const currentStartTime = sessionStorage.getItem('app_start_time');
      if (currentStartTime) {
        sessionStorage.setItem('previous_start_time', currentStartTime);
      }
      sessionStorage.removeItem('app_start_time');
      sessionStorage.setItem('browser_closing', 'true');
      sessionStorage.removeItem('session_active');
      sessionStorage.removeItem('pending_close');
      
      // Logout
      await logout();
      
      // Allow window to close by removing the preventDefault
      // Dispatch a custom event to trigger window close
      window.dispatchEvent(new CustomEvent('allow-window-close'));
      
      // Also try to close programmatically (for Tauri)
      if (typeof window !== 'undefined' && window.__TAURI__) {
        try {
          const tauri = window.__TAURI__;
          if (tauri?.window) {
            const appWindow = await tauri.window.getCurrent();
            await appWindow.close();
          }
        } catch (e) {
          console.error('Error closing Tauri window:', e);
        }
      }
      
      onConfirm?.();
    } catch (error) {
      console.error('Error during exit:', error);
      setIsLoggingOut(false);
    }
  };

  const handleCancel = () => {
    console.log('❌ User cancelled exit');
    // Clear pending close flag
    sessionStorage.removeItem('pending_close');
    onClose();
  };

  if (!isOpen || typeof window === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCancel}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999]"
          />
          
          {/* Modal */}
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card-pro p-6 max-w-md w-full relative pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={handleCancel}
                className="absolute top-4 right-4 text-analytics-secondary hover:text-analytics-primary transition-colors"
                disabled={isLoggingOut}
              >
                <X size={20} />
              </button>

              {/* Icon and Title */}
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-shrink-0">
                  <AlertTriangle size={24} className="text-yellow-500" />
                </div>
                <h3 className="text-lg font-semibold text-analytics-primary">
                  Exit Application
                </h3>
              </div>

              {/* Message */}
              <p className="text-sm text-analytics-secondary mb-6 ml-10">
                Are you sure you want to exit? This will log you out and close the application.
                {user && (
                  <span className="block mt-2 font-medium text-analytics-primary">
                    Logged in as: {user.fullName || user.username}
                  </span>
                )}
              </p>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 ml-10">
                <button
                  onClick={handleCancel}
                  disabled={isLoggingOut}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all bg-white/10 text-analytics-secondary hover:bg-white/20 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isLoggingOut}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 flex items-center gap-2"
                >
                  {isLoggingOut ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Exiting...</span>
                    </>
                  ) : (
                    <>
                      <LogOut size={16} />
                      <span>Exit & Logout</span>
                    </>
                  )}
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


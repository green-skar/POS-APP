import { apiFetch } from '@/utils/apiClient';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from './useAuth';

/**
 * Custom hook for password confirmation before critical actions
 * @returns {Object} { showPasswordModal, setShowPasswordModal, password, setPassword, pendingAction, setPendingAction, handlePasswordConfirm, requirePassword }
 */
export function usePasswordConfirmation() {
  const { user: authUser } = useAuth();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [pendingAction, setPendingAction] = useState(null); // { type: string, callback: function, metadata: object }

  const handlePasswordConfirm = async () => {
    if (!password.trim()) {
      toast.error('Password is required');
      return;
    }
    
    if (!pendingAction) {
      toast.error('No action pending. Please try again.');
      setShowPasswordModal(false);
      setPassword('');
      return;
    }
    
    if (!authUser) {
      toast.error('You must be logged in to perform this action.');
      setShowPasswordModal(false);
      setPassword('');
      return;
    }

    try {
      // Verify admin password
      const response = await apiFetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: authUser.username,
          password: password
        })
      });

      const data = await response.json();

      if (!response.ok || !data.valid) {
        toast.error('Invalid password. Action cancelled.');
        setShowPasswordModal(false);
        setPendingAction(null);
        setPassword('');
        return false;
      }

      // Password verified, log authorization activity
      try {
        const logResponse = await apiFetch('/api/auth/log-authorization', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action_type: pendingAction.type,
            action_description: `Authorized ${pendingAction.type} action`,
            metadata: pendingAction.metadata || {}
          })
        });
        
        if (!logResponse.ok) {
          console.error('Failed to log authorization activity');
        }
      } catch (logError) {
        console.error('Error logging authorization activity:', logError);
        // Don't block the action if logging fails
      }

      // Password verified, proceed with action
      setShowPasswordModal(false);
      setPassword('');
      
      if (pendingAction.callback) {
        await Promise.resolve(pendingAction.callback());
      }

      setPendingAction(null);
      return true;
    } catch (error) {
      console.error('Password verification error:', error);
      toast.error('Failed to verify password. Please try again.');
      return false;
    }
  };

  /**
   * Require password confirmation before executing a critical action
   * @param {string} actionType - Type of action (e.g., 'delete', 'deactivate', 'update')
   * @param {Function} callback - Function to execute after password verification
   * @param {Object} metadata - Optional metadata about the action
   */
  const requirePassword = (actionType, callback, metadata = {}) => {
    setPendingAction({
      type: actionType,
      callback: callback,
      metadata: metadata
    });
    setShowPasswordModal(true);
  };

  return {
    showPasswordModal,
    setShowPasswordModal,
    password,
    setPassword,
    pendingAction,
    setPendingAction,
    handlePasswordConfirm,
    requirePassword
  };
}



'use client';

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getApiBaseUrl,
  getDeploymentMode,
  DEPLOYMENT_CLIENT,
} from '@/utils/apiClient';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Warns when this install is set to "client" but no API server URL is configured.
 */
export default function DeploymentBanner() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const refresh = () => {
    if (typeof window === 'undefined') return;
    const client = getDeploymentMode() === DEPLOYMENT_CLIENT;
    const base = getApiBaseUrl();
    setVisible(client && !base && !dismissed);
  };

  useEffect(() => {
    refresh();
    const onMode = () => {
      setDismissed(false);
      refresh();
    };
    window.addEventListener('pos-deployment-mode-changed', onMode);
    window.addEventListener('pos-api-base-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('pos-deployment-mode-changed', onMode);
      window.removeEventListener('pos-api-base-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [dismissed]);

  if (!visible) return null;

  return (
    <div
      role="alert"
      className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-3 px-4 py-2.5 text-sm text-amber-950 bg-amber-100 border-b border-amber-300 shadow-sm"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />
      <p className="flex-1 text-center">
        <strong>Client mode:</strong> set the server URL in{' '}
        <Link to="/admin/network" className="underline font-medium text-amber-900">
          Admin → Network
        </Link>{' '}
        or discovery will not connect to your shop database.
      </p>
      <button
        type="button"
        className="p-1 rounded hover:bg-amber-200/80"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          setVisible(false);
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

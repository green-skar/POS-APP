'use client';

import {
  apiFetch,
  apiUrl,
  getDeploymentMode,
  getApiBaseUrl,
  DEPLOYMENT_CLIENT,
  setApiBaseUrl,
  setDeploymentMode,
  DEPLOYMENT_SERVER,
} from '@/utils/apiClient';
import { useAuth } from '@/utils/useAuth';
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { User, Lock } from 'lucide-react';
import { logActivity } from '@/utils/logActivity';
import AppFooter from '@/components/AppFooter';

async function checkPosApiReachable() {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), 12000);
  try {
    const response = await apiFetch('/api/health', {
      method: 'GET',
      credentials: 'omit',
      signal: ctrl.signal,
    });
    const data = await response.json().catch(() => null);
    return response.ok && data?.ok === true && data?.service === 'pos-api';
  } catch {
    return false;
  } finally {
    window.clearTimeout(t);
  }
}

function normalizeClientServerUrl(raw) {
  const t = String(raw || '')
    .trim()
    .replace(/\/+$/, '');
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) {
    return `http://${t}`.replace(/\/+$/, '');
  }
  return t;
}

/** @param {string} baseUrl normalized origin e.g. http://192.168.1.5:3000 */
async function checkHealthAtBase(baseUrl) {
  const base = normalizeClientServerUrl(baseUrl);
  if (!base) return { ok: false, base: null };
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), 12000);
  try {
    const response = await fetch(`${base}/api/health`, {
      method: 'GET',
      credentials: 'omit',
      signal: ctrl.signal,
    });
    const data = await response.json().catch(() => null);
    const ok = response.ok && data?.ok === true && data?.service === 'pos-api';
    return { ok, base };
  } catch {
    return { ok: false, base };
  } finally {
    window.clearTimeout(t);
  }
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { applyLoginFromResponse } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [serverUnreachable, setServerUnreachable] = useState(false);
  /** Wrong-password attempts for current username session (resets when username changes). */
  const [failedLoginCount, setFailedLoginCount] = useState(0);
  /** none | opened after Forgot: super vs staff recovery messaging */
  const [forgotPanel, setForgotPanel] = useState(/** @type {'none' | 'super' | 'admin'} */ ('none'));
  const [saRequestCode, setSaRequestCode] = useState('');
  const [saResponseToken, setSaResponseToken] = useState('');
  const [saNewPassword, setSaNewPassword] = useState('');
  const [saConfirmPassword, setSaConfirmPassword] = useState('');
  const [saUsername, setSaUsername] = useState('');
  const [saBusy, setSaBusy] = useState(false);
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [serverUrlDraft, setServerUrlDraft] = useState('');
  const [serverTestStatus, setServerTestStatus] = useState(/** @type {'idle' | 'ok' | 'fail'} */ ('idle'));
  const [serverTestBusy, setServerTestBusy] = useState(false);
  const [serverConnectBusy, setServerConnectBusy] = useState(false);
  const isClientMode = getDeploymentMode() === DEPLOYMENT_CLIENT;

  useEffect(() => {
    setFailedLoginCount(0);
    setForgotPanel('none');
  }, [username]);

  const runServerReachabilityCheck = useCallback(async () => {
    if (getDeploymentMode() !== DEPLOYMENT_CLIENT) {
      setServerUnreachable(false);
      return;
    }
    const base = getApiBaseUrl();
    if (!base) {
      setServerUnreachable(true);
      return;
    }
    const ok = await checkPosApiReachable();
    setServerUnreachable(!ok);
  }, []);

  useEffect(() => {
    void runServerReachabilityCheck();
  }, [runServerReachabilityCheck]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'POS_API_BASE_URL' || e.key === 'POS_DEPLOYMENT_MODE') {
        void runServerReachabilityCheck();
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pos-api-base-changed', runServerReachabilityCheck);
    window.addEventListener('pos-deployment-mode-changed', runServerReachabilityCheck);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pos-api-base-changed', runServerReachabilityCheck);
      window.removeEventListener('pos-deployment-mode-changed', runServerReachabilityCheck);
    };
  }, [runServerReachabilityCheck]);

  const openForgotPassword = async () => {
    const u = String(username || '').trim();
    if (!u) {
      toast.error('Enter your username first.');
      return;
    }
    try {
      const r = await fetch(apiUrl('/api/auth/recovery-eligibility'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ username: u }),
      });
      const data = await r.json().catch(() => ({}));
      if (data?.isSuperAdmin) {
        setForgotPanel('super');
        setSaUsername(u);
      } else {
        setForgotPanel('admin');
      }
    } catch {
      setForgotPanel('admin');
    }
  };

  /**
   * @param {React.FormEvent} e
   */
  const handleLogin = async (e) => {
    e.preventDefault();

    if (!username || !password) {
      toast.error('Please enter username and password');
      return;
    }

    setIsLoading(true);

    try {
      if (getDeploymentMode() === DEPLOYMENT_CLIENT) {
        const reachable = await checkPosApiReachable();
        if (!reachable) {
          toast.error(
            'This PC cannot reach the POS server. Contact your administrator to reconnect it to the correct server URL (on the server: Admin → Network → suggested API base).',
            { duration: 14000 }
          );
          setServerUnreachable(true);
          setIsLoading(false);
          return;
        }
        setServerUnreachable(false);
      }

      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          username,
          password,
        }),
      });

      const data = await response.json();

      if (data.error) {
        toast.error(data.error);
        if (response.status === 401) {
          setFailedLoginCount((n) => n + 1);
        }
        setIsLoading(false);
        return;
      }

      if (data.success) {
        setFailedLoginCount(0);
        setForgotPanel('none');
        applyLoginFromResponse(data);
        sessionStorage.setItem('app_start_time', Date.now().toString());

        logActivity('login', `User logged in: ${data.user.username}`, 'user', data.user.id, {
          username: data.user.username,
          role: data.user.role,
          store_id: data.store?.id || null,
          store_name: data.store?.name || null,
        });

        toast.success(`Welcome back, ${data.user.fullName}!`);

        sessionStorage.setItem('intentional_navigation', 'true');
        setIsLoading(false);

        if (data.user.role === 'cashier') {
          navigate('/pos', { replace: true });
        } else {
          navigate('/admin', { replace: true });
        }
      } else {
        logActivity('login_attempt', `Failed login attempt: ${username}`, 'user', null, {
          username,
          error: data.error || 'Unknown error',
        });
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Login error:', error);
      logActivity('login_attempt', `Failed login attempt: ${username}`, 'user', null, {
        username,
        error: /** @type {Error} */ (error).message || 'Network error',
      });
      if (getDeploymentMode() === DEPLOYMENT_CLIENT) {
        toast.error(
          'Cannot connect to the POS server from this PC. Contact your administrator to restore the connection (correct server URL, same LAN/firewall, server running).',
          { duration: 14000 }
        );
        setServerUnreachable(true);
      } else {
        toast.error('Failed to login. Please try again.');
      }
      setIsLoading(false);
    }
  };

  const requestSuperResetCode = async () => {
    setSaBusy(true);
    try {
      const r = await fetch(apiUrl('/api/bootstrap/superadmin-password-reset/request'), {
        method: 'POST',
        credentials: 'include',
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.requestCode) {
        throw new Error(data?.error || 'Could not generate request code');
      }
      setSaRequestCode(String(data.requestCode));
      toast.success('Request code ready — send it to your developer. They will send you a response to paste below.');
    } catch (err) {
      toast.error(/** @type {Error} */ (err).message || 'Request failed');
    } finally {
      setSaBusy(false);
    }
  };

  const completeSuperReset = async () => {
    setSaBusy(true);
    try {
      const r = await fetch(apiUrl('/api/bootstrap/superadmin-password-reset/complete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          requestCode: saRequestCode.trim(),
          responseToken: saResponseToken.trim(),
          newPassword: saNewPassword,
          confirmPassword: saConfirmPassword,
          username: saUsername.trim() || undefined,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.success) {
        throw new Error(data?.error || 'Password reset failed');
      }
      toast.success(`Password updated for ${data.username}. You can sign in now.`);
      setFailedLoginCount(0);
      setForgotPanel('none');
      setSaResponseToken('');
      setSaNewPassword('');
      setSaConfirmPassword('');
    } catch (err) {
      toast.error(/** @type {Error} */ (err).message || 'Reset failed');
    } finally {
      setSaBusy(false);
    }
  };

  const showForgotLink = failedLoginCount >= 2;

  const openServerModal = () => {
    setServerUrlDraft(getApiBaseUrl() || '');
    setServerTestStatus('idle');
    setServerModalOpen(true);
  };

  const handleServerModalTest = async () => {
    const base = normalizeClientServerUrl(serverUrlDraft);
    if (!base) {
      toast.error('Enter a server URL (e.g. http://192.168.1.10:3000)');
      setServerTestStatus('fail');
      return;
    }
    setServerTestBusy(true);
    setServerTestStatus('idle');
    try {
      const { ok } = await checkHealthAtBase(base);
      setServerTestStatus(ok ? 'ok' : 'fail');
      if (ok) toast.success('Server responded — POS API is reachable.');
      else toast.error('Could not reach the POS API at that address.');
    } finally {
      setServerTestBusy(false);
    }
  };

  const handleServerModalConnect = async () => {
    const base = normalizeClientServerUrl(serverUrlDraft);
    if (!base) {
      toast.error('Enter a valid server URL.');
      return;
    }
    setServerConnectBusy(true);
    try {
      const { ok, base: normalized } = await checkHealthAtBase(base);
      if (!ok || !normalized) {
        setServerTestStatus('fail');
        toast.error('Server is not reachable. Fix the URL or network, then try again.');
        return;
      }
      setApiBaseUrl(normalized);
      setDeploymentMode(DEPLOYMENT_CLIENT);
      setServerModalOpen(false);
      setServerTestStatus('idle');
      setServerUnreachable(false);
      await runServerReachabilityCheck();
      toast.success('Using this server for sign-in.');
    } finally {
      setServerConnectBusy(false);
    }
  };

  const handleUseStandalone = () => {
    setApiBaseUrl('');
    setDeploymentMode(DEPLOYMENT_SERVER);
    setServerUnreachable(false);
    toast.success('Standalone mode enabled on this machine.');
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background:
          'var(--bg-overlay, linear-gradient(120deg, rgba(209, 146, 91, 0.22) 0%, rgba(161, 117, 77, 0.20) 50%, rgba(118, 88, 61, 0.18) 100%))',
      }}
    >
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="relative w-full max-w-4xl">
          <div className="glass-card-pro p-8 rounded-2xl transition-all duration-700">
            <div className="relative">
              <div
                className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-br from-orange-500/20 to-orange-600/30 rounded-2xl transform transition-all duration-700 rotate-0 skew-y-0"
                style={{ zIndex: 0 }}
              ></div>

              <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
                <motion.div initial={{ opacity: 1, x: 0 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7 }}>
                  <h2 className="text-3xl font-bold text-analytics-primary mb-4 text-center">Login</h2>
                  <div className="mb-4 flex items-center justify-center gap-2 text-xs">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${isClientMode ? (serverUnreachable ? 'bg-red-500' : 'bg-emerald-500') : 'bg-emerald-500'}`}
                    />
                    <span className={isClientMode ? (serverUnreachable ? 'text-red-700' : 'text-emerald-700') : 'text-emerald-700'}>
                      {isClientMode
                        ? serverUnreachable
                          ? 'Disconnected from server'
                          : 'Connected to server'
                        : 'Standalone server mode'}
                    </span>
                  </div>

                  {isClientMode && serverUnreachable ? (
                    <div
                      className="mb-4 rounded-xl border border-amber-300 bg-amber-50/90 px-4 py-3 text-sm text-amber-950"
                      role="alert"
                    >
                      <strong className="font-semibold">Cannot reach the POS server from this computer.</strong>{' '}
                      Contact your administrator to reconnect this PC to the correct API URL (usually set under Admin →
                      Network on the server PC). You will not be able to sign in until the connection is fixed.
                      <div className="mt-2 flex items-center gap-3 text-xs font-medium">
                        <button type="button" className="text-amber-900 underline" onClick={() => void runServerReachabilityCheck()}>
                          Check again
                        </button>
                        <button type="button" className="text-amber-900 underline" onClick={openServerModal}>
                          Set up server again
                        </button>
                        <button type="button" className="text-amber-900 underline" onClick={handleUseStandalone}>
                          Use standalone
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-analytics-secondary">Username</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-analytics-secondary" size={18} />
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 glass-input rounded-lg text-analytics-primary"
                          placeholder="Your username"
                          required
                          autoComplete="username"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-analytics-secondary">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-analytics-secondary" size={18} />
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 glass-input rounded-lg text-analytics-primary"
                          placeholder="Your password"
                          required
                          autoComplete="current-password"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full glass-button-primary py-3 rounded-xl font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105"
                    >
                      {isLoading ? 'Logging in...' : 'Login'}
                    </button>
                  </form>

                  {showForgotLink ? (
                    <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                      <button
                        type="button"
                        className="text-sm font-medium text-analytics-secondary underline hover:text-analytics-primary"
                        onClick={() => void openForgotPassword()}
                      >
                        Forgot password?
                      </button>

                      {forgotPanel === 'admin' ? (
                        <div className="rounded-lg border border-white/15 bg-white/5 px-3 py-3 text-sm text-analytics-secondary">
                          Ask your administrator to reset your password. They can do this from{' '}
                          <strong className="text-analytics-primary">Admin → Employees</strong> (or User management).
                        </div>
                      ) : null}

                      {forgotPanel === 'super' ? (
                        <div className="mt-2 space-y-3 rounded-lg border border-white/15 bg-white/5 p-3 text-xs text-analytics-secondary">
                          <p className="text-sm text-analytics-primary">
                            Contact your developer for recovery. They will provide a response code after you send them
                            your request code.
                          </p>
                          <button
                            type="button"
                            disabled={saBusy}
                            onClick={() => void requestSuperResetCode()}
                            className="rounded-lg bg-analytics-primary/90 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Get request code
                          </button>
                          {saRequestCode ? (
                            <textarea
                              readOnly
                              className="w-full rounded border border-white/20 bg-black/20 p-2 font-mono text-[11px] text-analytics-primary"
                              rows={3}
                              value={saRequestCode}
                            />
                          ) : null}
                          <textarea
                            className="w-full rounded border border-white/20 bg-black/10 p-2 font-mono text-[11px]"
                            rows={3}
                            placeholder="Paste the code from your developer"
                            value={saResponseToken}
                            onChange={(e) => setSaResponseToken(e.target.value)}
                          />
                          <input
                            type="text"
                            className="w-full rounded border border-white/20 bg-black/10 p-2"
                            placeholder="Your super admin username (if there is more than one)"
                            value={saUsername}
                            onChange={(e) => setSaUsername(e.target.value)}
                          />
                          <input
                            type="password"
                            className="w-full rounded border border-white/20 bg-black/10 p-2"
                            placeholder="New password (min 8 characters)"
                            value={saNewPassword}
                            onChange={(e) => setSaNewPassword(e.target.value)}
                          />
                          <input
                            type="password"
                            className="w-full rounded border border-white/20 bg-black/10 p-2"
                            placeholder="Confirm new password"
                            value={saConfirmPassword}
                            onChange={(e) => setSaConfirmPassword(e.target.value)}
                          />
                          <button
                            type="button"
                            disabled={saBusy}
                            onClick={() => void completeSuperReset()}
                            className="w-full rounded-lg border border-white/30 py-2 text-xs font-semibold text-analytics-primary hover:bg-white/10 disabled:opacity-50"
                          >
                            Save new password
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </motion.div>

                <motion.div
                  initial={{ opacity: 1, x: 0 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.7 }}
                  className="flex flex-col justify-center items-center text-center p-8"
                >
                  <h2 className="text-4xl font-bold text-analytics-primary mb-4 uppercase">Welcome Back!</h2>
                  <p className="text-analytics-secondary text-lg">
                    We are happy to have you with us again. If you need anything, we are here to help.
                  </p>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {serverModalOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="server-modal-title"
        >
          <div className="glass-card-pro w-full max-w-md rounded-2xl border border-white/20 p-6 shadow-xl">
            <h3 id="server-modal-title" className="text-lg font-bold text-analytics-primary">
              POS server address
            </h3>
            <p className="mt-1 text-xs text-analytics-secondary">
              Use the API base URL from the server (Admin → Network), e.g.{' '}
              <span className="font-mono text-analytics-primary">http://192.168.1.10:3000</span>
            </p>
            <input
              type="url"
              className="mt-4 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm text-analytics-primary placeholder:text-analytics-secondary/70"
              placeholder="http://server-ip:port"
              value={serverUrlDraft}
              onChange={(e) => {
                setServerUrlDraft(e.target.value);
                setServerTestStatus('idle');
              }}
            />
            {serverTestStatus === 'ok' ? (
              <p className="mt-2 text-xs font-medium text-emerald-700">Connection test passed.</p>
            ) : null}
            {serverTestStatus === 'fail' ? (
              <p className="mt-2 text-xs font-medium text-red-700">Connection test failed.</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={serverTestBusy}
                onClick={() => void handleServerModalTest()}
                className="rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-xs font-semibold text-analytics-primary hover:bg-white/15 disabled:opacity-50"
              >
                {serverTestBusy ? 'Testing…' : 'Test connection'}
              </button>
              <button
                type="button"
                disabled={serverConnectBusy}
                onClick={() => void handleServerModalConnect()}
                className="rounded-lg bg-analytics-primary/90 px-3 py-2 text-xs font-semibold text-white hover:bg-analytics-primary disabled:opacity-50"
              >
                {serverConnectBusy ? 'Connecting…' : 'Connect to this server'}
              </button>
              <button
                type="button"
                onClick={() => setServerModalOpen(false)}
                className="rounded-lg px-3 py-2 text-xs font-medium text-analytics-secondary underline hover:text-analytics-primary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <AppFooter className="pb-6 px-4" />
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '@/utils/apiClient';
import { toast } from 'sonner';
import { CreditCard, Smartphone, Save, Loader2, Info, PlugZap, Play, Power } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { logButtonClick } from '@/utils/logActivity';
import {
  isTauriDesktop,
  getNgrokStatus,
  setNgrokAuthToken,
  startNgrokTunnel,
  stopNgrokTunnel,
  saveNgrokAutoConfig,
  getLastNgrokPublicUrl,
  setLastNgrokPublicUrl,
} from '@/utils/ngrokBridge';

const emptyMpesa = {
  env: 'sandbox',
  consumerKey: '',
  consumerSecret: '',
  shortcode: '',
  passkey: '',
  callbackUrl: '',
};

const emptyCard = {
  stripePublishableKey: '',
  stripeSecretKey: '',
  stripeWebhookSecret: '',
};

const emptyNgrok = {
  autoStartTunnel: false,
  autoApplyCallback: true,
  tunnelPort: 4000,
};

const emptyCurrency = {
  code: 'USD',
  locale: 'en-US',
};
const emptyTimezone = {
  mode: 'auto',
  value: '',
  effective: '',
  detected: '',
  dateTimeLocale: 'en-US',
};

const CURRENCY_OPTIONS = [
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'KES', label: 'Kenyan Shilling (KES)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'NGN', label: 'Nigerian Naira (NGN)' },
  { code: 'ZAR', label: 'South African Rand (ZAR)' },
  { code: 'TZS', label: 'Tanzanian Shilling (TZS)' },
  { code: 'UGX', label: 'Ugandan Shilling (UGX)' },
  { code: 'INR', label: 'Indian Rupee (INR)' },
  { code: 'CNY', label: 'Chinese Yuan (CNY)' },
];

const LOCALE_OPTIONS = [
  { locale: 'en-US', label: 'English (United States)' },
  { locale: 'en-KE', label: 'English (Kenya)' },
  { locale: 'sw-KE', label: 'Swahili (Kenya)' },
  { locale: 'en-GB', label: 'English (United Kingdom)' },
  { locale: 'fr-FR', label: 'French (France)' },
  { locale: 'de-DE', label: 'German (Germany)' },
  { locale: 'ar-EG', label: 'Arabic (Egypt)' },
  { locale: 'en-ZA', label: 'English (South Africa)' },
  { locale: 'en-NG', label: 'English (Nigeria)' },
  { locale: 'hi-IN', label: 'Hindi (India)' },
];

export default function PaymentSettingsPage() {
  return (
    <ProtectedRoute requiredRole="super_admin">
      <PaymentSettingsContent />
    </ProtectedRoute>
  );
}

function PaymentSettingsContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mpesa, setMpesa] = useState(emptyMpesa);
  const [card, setCard] = useState(emptyCard);
  const [ngrok, setNgrok] = useState(emptyNgrok);
  const [currency, setCurrency] = useState(emptyCurrency);
  const [timezone, setTimezone] = useState(emptyTimezone);
  const [dateTimeLocale, setDateTimeLocale] = useState('en-US');
  const [ngrokStatus, setNgrokStatus] = useState(null);
  const [ngrokToken, setNgrokToken] = useState('');
  const [ngrokBusy, setNgrokBusy] = useState(false);
  const [isDesktop] = useState(() => isTauriDesktop());
  const detectedTimezone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  })();
  const timezoneOptions = useMemo(() => {
    try {
      if (typeof Intl.supportedValuesOf === 'function') {
        return Intl.supportedValuesOf('timeZone');
      }
    } catch {
      /* ignore */
    }
    return [
      'UTC',
      'Africa/Nairobi',
      'Africa/Lagos',
      'Africa/Kampala',
      'Africa/Dar_es_Salaam',
      'Europe/London',
      'Europe/Paris',
      'Asia/Dubai',
      'Asia/Kolkata',
      'Asia/Shanghai',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Australia/Sydney',
    ];
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/payment-settings', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setMpesa({ ...emptyMpesa, ...data.mpesa });
      setCard({ ...emptyCard, ...data.card });
      setNgrok({ ...emptyNgrok, ...data.ngrok });
      setCurrency({ ...emptyCurrency, ...data.currency });
      setTimezone({ ...emptyTimezone, ...data.timezone });
      setDateTimeLocale(String(data?.timezone?.dateTimeLocale || data?.dateTimeLocale || 'en-US'));
      saveNgrokAutoConfig({ ...emptyNgrok, ...data.ngrok });
    } catch {
      toast.error('Could not load payment settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refreshNgrokStatus = useCallback(async () => {
    if (!isDesktop) return;
    const s = await getNgrokStatus();
    setNgrokStatus(s);
    const url = s?.public_url || s?.publicUrl;
    if (url) setLastNgrokPublicUrl(url);
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) return;
    void refreshNgrokStatus();
  }, [isDesktop, refreshNgrokStatus]);

  useEffect(() => {
    if (!isDesktop || !ngrok.autoStartTunnel) return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await startNgrokTunnel(ngrok.tunnelPort);
        if (cancelled) return;
        setNgrokStatus(s);
        const url = s?.public_url || s?.publicUrl;
        if (url && ngrok.autoApplyCallback) {
          setMpesa((m) => ({ ...m, callbackUrl: `${String(url).replace(/\/+$/, '')}/api/mpesa/callback` }));
        }
      } catch {
        // Keep manual controls as fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDesktop, ngrok.autoStartTunnel, ngrok.autoApplyCallback, ngrok.tunnelPort]);

  const save = async () => {
    logButtonClick('Payment settings', 'Save payment configuration', {});
    setSaving(true);
    try {
      const res = await apiFetch('/api/admin/payment-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mpesa, card, ngrok, currency, timezone, dateTimeLocale }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Save failed');
      }
      toast.success('Payment settings saved');
      saveNgrokAutoConfig(ngrok);
      try {
        localStorage.setItem('app-currency-settings', JSON.stringify(currency));
        window.dispatchEvent(new Event('currency-changed'));
        localStorage.setItem('app-timezone-settings', JSON.stringify({ ...timezone, dateTimeLocale }));
        window.dispatchEvent(new Event('timezone-changed'));
      } catch {
        /* ignore */
      }
      await load();
    } catch (e) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const applyDetectedCallbackUrl = useCallback((rawUrl) => {
    const clean = String(rawUrl || '').trim().replace(/\/+$/, '');
    if (!clean.startsWith('https://')) {
      toast.error('Ngrok public URL not detected yet');
      return;
    }
    setMpesa((m) => ({ ...m, callbackUrl: `${clean}/api/mpesa/callback` }));
  }, []);

  const handleSetNgrokToken = async () => {
    if (!isDesktop) return;
    const token = ngrokToken.trim();
    if (!token) {
      toast.error('Enter your ngrok auth token first');
      return;
    }
    setNgrokBusy(true);
    try {
      await setNgrokAuthToken(token);
      toast.success('ngrok token saved on this machine');
      setNgrokToken('');
      await refreshNgrokStatus();
    } catch (e) {
      toast.error(e?.message || 'Failed to save ngrok token');
    } finally {
      setNgrokBusy(false);
    }
  };

  const handleStartNgrok = async () => {
    if (!isDesktop) return;
    setNgrokBusy(true);
    try {
      const s = await startNgrokTunnel(ngrok.tunnelPort);
      setNgrokStatus(s);
      const url = s?.public_url || s?.publicUrl;
      if (url) {
        toast.success('ngrok tunnel started');
        if (ngrok.autoApplyCallback) {
          applyDetectedCallbackUrl(url);
        }
      } else {
        toast.error(s?.error || 'Tunnel started but URL was not found');
      }
    } catch (e) {
      toast.error(e?.message || 'Failed to start ngrok tunnel');
    } finally {
      setNgrokBusy(false);
    }
  };

  const handleStopNgrok = async () => {
    if (!isDesktop) return;
    setNgrokBusy(true);
    try {
      await stopNgrokTunnel();
      toast.success('ngrok tunnel stopped');
      await refreshNgrokStatus();
    } catch {
      toast.error('Failed to stop ngrok tunnel');
    } finally {
      setNgrokBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-8 pb-24">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Payment settings</h1>
        <p className="text-gray-600 mt-2 text-sm">
          Configure Safaricom Daraja (M-Pesa STK) and card (Stripe) credentials. Values are stored in the server
          database; environment variables are used as fallback when a field is empty in the database.
        </p>
      </div>

      <div className="flex items-start gap-2 text-sm text-blue-900 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <Info className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <strong>M-Pesa callback URL</strong> must be reachable from Safaricom (public HTTPS in production). Example:{' '}
          <code className="text-xs bg-blue-100 px-1 rounded">https://your-domain.com/api/mpesa/callback</code>
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white/90 shadow-sm p-5 space-y-4">
        <h2 className="text-lg font-medium">Currency</h2>
        <p className="text-xs text-gray-500">
          Super admin currency preference for POS totals and dashboards.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Currency code</span>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={currency.code}
              onChange={(e) => setCurrency((c) => ({ ...c, code: e.target.value }))}
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Locale</span>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={currency.locale}
              onChange={(e) => setCurrency((c) => ({ ...c, locale: e.target.value }))}
            >
              {LOCALE_OPTIONS.map((opt) => (
                <option key={opt.locale} value={opt.locale}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white/90 shadow-sm p-5 space-y-4">
        <h2 className="text-lg font-medium">Timezone</h2>
        <p className="text-xs text-gray-500">
          Date/time display mode for all users. Client machines follow the timezone chosen on the server.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Timezone mode</span>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={timezone.mode || 'auto'}
              onChange={(e) => setTimezone((t) => ({ ...t, mode: e.target.value === 'manual' ? 'manual' : 'auto' }))}
            >
              <option value="auto">Automatic (server machine timezone)</option>
              <option value="manual">Manual selection</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Detected server timezone</span>
            <input
              type="text"
              readOnly
              className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
              value={timezone.detected || detectedTimezone}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-gray-700">Date/time language (locale)</span>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={dateTimeLocale}
              onChange={(e) => setDateTimeLocale(e.target.value)}
            >
              {LOCALE_OPTIONS.map((opt) => (
                <option key={opt.locale} value={opt.locale}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-gray-700">Manual timezone</span>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
              value={timezone.value || ''}
              disabled={(timezone.mode || 'auto') !== 'manual'}
              onChange={(e) => setTimezone((t) => ({ ...t, value: e.target.value }))}
            >
              {!timezone.value ? <option value="">Select timezone</option> : null}
              {timezoneOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-gray-700">Current effective timezone</span>
            <input
              type="text"
              readOnly
              className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
              value={timezone.effective || timezone.detected || detectedTimezone}
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white/90 shadow-sm p-5 space-y-4">
        <h2 className="text-lg font-medium flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-green-600" />
          Safaricom Daraja (M-Pesa)
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-gray-700">Environment</span>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={mpesa.env}
              onChange={(e) => setMpesa((m) => ({ ...m, env: e.target.value }))}
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-gray-700">Consumer key</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
              value={mpesa.consumerKey}
              onChange={(e) => setMpesa((m) => ({ ...m, consumerKey: e.target.value }))}
              autoComplete="off"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-gray-700">Consumer secret</span>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
              value={mpesa.consumerSecret}
              onChange={(e) => setMpesa((m) => ({ ...m, consumerSecret: e.target.value }))}
              autoComplete="new-password"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Shortcode</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={mpesa.shortcode}
              onChange={(e) => setMpesa((m) => ({ ...m, shortcode: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Passkey</span>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
              value={mpesa.passkey}
              onChange={(e) => setMpesa((m) => ({ ...m, passkey: e.target.value }))}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-gray-700">Callback URL</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="https://..."
              value={mpesa.callbackUrl}
              onChange={(e) => setMpesa((m) => ({ ...m, callbackUrl: e.target.value }))}
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white/90 shadow-sm p-5 space-y-4">
        <h2 className="text-lg font-medium flex items-center gap-2">
          <PlugZap className="h-5 w-5 text-purple-600" />
          ngrok tunnel (desktop)
        </h2>
        {!isDesktop ? (
          <p className="text-sm text-gray-600">
            ngrok in-app controls are available in the desktop app. On browser installs, run ngrok manually.
          </p>
        ) : (
          <>
            <p className="text-xs text-gray-500">
              Primary mode: auto-start tunnel on app launch. Fallback mode: use manual buttons below if auto-start fails.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-gray-700">ngrok auth token (one-time per machine)</span>
                <div className="mt-1 flex gap-2">
                  <input
                    type="password"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                    placeholder="Paste ngrok authtoken"
                    value={ngrokToken}
                    onChange={(e) => setNgrokToken(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={handleSetNgrokToken}
                    disabled={ngrokBusy}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                  >
                    Save token
                  </button>
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">Tunnel port</span>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={ngrok.tunnelPort}
                  onChange={(e) => setNgrok((n) => ({ ...n, tunnelPort: Number(e.target.value) || 4000 }))}
                />
              </label>

              <div className="block">
                <span className="text-sm font-medium text-gray-700">Detected public URL</span>
                <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-mono break-all">
                  {ngrokStatus?.public_url || ngrokStatus?.publicUrl || getLastNgrokPublicUrl() || 'Not running'}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(ngrok.autoStartTunnel)}
                  onChange={(e) => setNgrok((n) => ({ ...n, autoStartTunnel: e.target.checked }))}
                />
                Auto-start on app launch
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(ngrok.autoApplyCallback)}
                  onChange={(e) => setNgrok((n) => ({ ...n, autoApplyCallback: e.target.checked }))}
                />
                Auto-apply callback URL when detected
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleStartNgrok}
                disabled={ngrokBusy}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                Start tunnel
              </button>
              <button
                type="button"
                onClick={handleStopNgrok}
                disabled={ngrokBusy}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                <Power className="h-4 w-4" />
                Stop tunnel
              </button>
              <button
                type="button"
                onClick={() => applyDetectedCallbackUrl(ngrokStatus?.public_url || ngrokStatus?.publicUrl || getLastNgrokPublicUrl())}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
              >
                Apply URL to callback field
              </button>
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white/90 shadow-sm p-5 space-y-4">
        <h2 className="text-lg font-medium flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-indigo-600" />
          Card payments (Stripe)
        </h2>
        <p className="text-xs text-gray-500">
          Used for future card checkout integration. Keep secret keys confidential.
        </p>
        <div className="grid gap-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Publishable key</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
              value={card.stripePublishableKey}
              onChange={(e) => setCard((c) => ({ ...c, stripePublishableKey: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Secret key</span>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
              value={card.stripeSecretKey}
              onChange={(e) => setCard((c) => ({ ...c, stripeSecretKey: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Webhook signing secret</span>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
              value={card.stripeWebhookSecret}
              onChange={(e) => setCard((c) => ({ ...c, stripeWebhookSecret: e.target.value }))}
            />
          </label>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 text-white px-5 py-2.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save settings
        </button>
      </div>
    </div>
  );
}
